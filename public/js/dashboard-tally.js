/*
 * DashboardTally: how many documents of a collection belong to each value of
 * one field, in ONE request.
 *
 * The Top Customers / Top Drivers / Top Providers tables on the dashboards
 * used to send one count request per customer (400+ on this project) to find
 * the top five. This reads the collection once, asking Firestore for only the
 * one field being grouped on, and counts on the page. The numbers are the same
 * as the per-row counts: a document is counted for value V exactly when the
 * equality filters match and its field equals V.
 *
 *   DashboardTally.counts('rides', [['sectionId', active_id]], 'authorID')
 *     -> Promise of { "<authorID>": n, ... }, or null if it could not be read
 *
 * Never rejects. null means "use the old per-row count", so a refusal, a
 * network error or a missing SDK shows the same table as before, only slower.
 * Identical calls made close together share one request.
 */
(function (root) {
    'use strict';

    var TIMEOUT_MS = 20000;
    var SHARE_MS = 10000;
    var pending = {};

    function restValue(value) {
        if (typeof value === 'string') return { stringValue: value };
        if (typeof value === 'boolean') return { booleanValue: value };
        if (typeof value === 'number' && isFinite(value)) {
            return Math.floor(value) === value ? { integerValue: String(value) } : { doubleValue: value };
        }
        return null;
    }

    function body(collection, filters, field) {
        var structured = {
            from: [{ collectionId: collection }],
            select: { fields: [{ fieldPath: field }] }
        };
        var clauses = [];
        for (var i = 0; i < (filters || []).length; i++) {
            var v = restValue(filters[i][1]);
            if (!v || typeof filters[i][0] !== 'string') return null;
            clauses.push({ fieldFilter: { field: { fieldPath: filters[i][0] }, op: 'EQUAL', value: v } });
        }
        if (clauses.length === 1) structured.where = clauses[0];
        else if (clauses.length > 1) structured.where = { compositeFilter: { op: 'AND', filters: clauses } };
        return { structuredQuery: structured };
    }

    function authHeader(fb) {
        try {
            var user = fb.auth && fb.auth().currentUser;
            if (!user) return Promise.resolve(null);
            return user.getIdToken().then(function (t) { return t ? 'Bearer ' + t : null; })
                .catch(function () { return null; });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    /** Count the stringValue of `field` over a runQuery response. */
    function tally(json, field) {
        if (!Array.isArray(json)) return null;
        var out = {};
        for (var i = 0; i < json.length; i++) {
            var row = json[i];
            if (!row) continue;
            if (row.error) return null;
            var doc = row.document;
            if (!doc) continue;
            var f = doc.fields && doc.fields[field];
            if (!f || typeof f.stringValue !== 'string') continue;
            out[f.stringValue] = (out[f.stringValue] || 0) + 1;
        }
        return out;
    }

    function counts(collection, filters, field, deps) {
        var fb = (deps && deps.firebase) || root.firebase;
        var doFetch = (deps && deps.fetch) || root.fetch;
        var b;
        var options;
        try {
            b = body(collection, filters, field);
            options = (fb && fb.app().options) || {};
        } catch (e) {
            return Promise.resolve(null);
        }
        if (!b || typeof doFetch !== 'function' || !options.projectId || !options.apiKey) {
            return Promise.resolve(null);
        }
        var key = JSON.stringify([options.projectId, b]);
        if (pending[key]) return pending[key];

        var url = 'https://firestore.googleapis.com/v1/projects/' +
            encodeURIComponent(options.projectId) +
            '/databases/(default)/documents:runQuery?key=' + encodeURIComponent(options.apiKey);

        var p = authHeader(fb).then(function (auth) {
            var headers = { 'Content-Type': 'application/json' };
            if (auth) headers.Authorization = auth;
            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = controller && setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
            return doFetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(b),
                signal: controller ? controller.signal : undefined
            }).then(function (response) {
                if (timer) clearTimeout(timer);
                return response.ok ? response.json() : null;
            }).then(function (json) {
                return json ? tally(json, field) : null;
            }, function () {
                if (timer) clearTimeout(timer);
                return null;
            });
        }).catch(function () { return null; });

        // Kept for a few seconds after it answers, so a dashboard can start
        // the read early and the table that needs it picks up the same answer.
        pending[key] = p;
        p.then(function () { setTimeout(function () { delete pending[key]; }, SHARE_MS); });
        return p;
    }

    var api = { counts: counts, _body: body, _tally: tally };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.DashboardTally = api;
})(typeof window !== 'undefined' ? window : globalThis);
