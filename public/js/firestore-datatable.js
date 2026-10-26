/*
 * firestore-datatable.js
 * ----------------------------------------------------------------------------
 * Cursor-based Firestore pagination for the admin panel's DataTables.
 *
 * THE PROBLEM
 *   Every `serverSide: true` table in this panel ran `await ref.get()` inside
 *   its `ajax` handler: it downloaded the *whole* collection, decorated every
 *   document, filtered and sorted it in JavaScript, then `.slice()`d out ten
 *   rows.  That full download repeated on every page click, every sort, every
 *   filter change and every search keystroke.  On `rides`, `users`,
 *   `vendor_orders` or `transactions` that is tens of thousands of document
 *   reads to render ten rows.
 *
 * THE FIX
 *   This file provides a drop-in replacement for that single `ref.get()` call.
 *   The view's own decorate / search / sort / row-building code is left exactly
 *   as it is; only the *set of documents* it receives changes:
 *
 *     - Default draw (no search box text, table sorted by the column the
 *       Firestore query already orders by):  one `limit(pageLength)` read,
 *       positioned with `startAfter()` on the last document of the previous
 *       page.  The row count is cached per query, so the pager stays accurate.
 *
 *     - Search text present, or the admin sorted by a column Firestore cannot
 *       order:  falls back to the previous whole-collection behaviour, because
 *       Firestore cannot substring-match and cannot re-sort an existing query.
 *       Bounded by LEGACY_SCAN_LIMIT so it is never literally unlimited.
 *
 *     - Export:  `exportData()` flips a per-table flag, re-runs the ajax once to
 *       get the complete current-filter set, then clears the flag.
 *
 * USAGE (four small edits per view)
 *   1.  await ref.get()
 *         ->  await FsDataTable.pageQuery(ref, data, { key: 'example24', orderField: orderByField })
 *   2.  filteredRecords.slice(start, start + length)
 *         ->  filteredRecords.slice(FsDataTable.offset('example24'), FsDataTable.offset('example24') + length)
 *   3.  $('.total_count').text(totalRecords)
 *         ->  $('.total_count').text(FsDataTable.total('example24', totalRecords))
 *   4.  recordsTotal / recordsFiltered: totalRecords
 *         ->  FsDataTable.total('example24', totalRecords)
 *
 * COUNTING
 *   The firebase-firestore-**compat** SDK this panel loads does not expose the
 *   `count()` aggregate at any version (it is modular-API only).  Counting by
 *   reading the matching documents is what made the large tables slow: 2,501
 *   document reads to print "2,501 entries" under a ten-row table, ~16 s on
 *   `wallet` and ~23 s on `users`.
 *
 *   So the count is asked of Firestore's REST aggregation endpoint instead -
 *   same project, same web API key the SDK is already configured with, one
 *   request, a few hundred bytes back, ~0.6 s.  The query is rebuilt from the
 *   collection, `where()` clauses and orderBy chain recorded while the view
 *   built it (see restCount).  Anything that cannot be described that way, and
 *   any refusal or failure, falls back to the old scan - so a count is never
 *   wrong, only sometimes slower.  A result is still cached per query
 *   (COUNT_TTL_MS) so paging and sorting do not re-ask.  If a future SDK
 *   exposes `Query.count()`, that is preferred automatically.
 *
 * Requires: jQuery, firebase-firestore-compat, fetch.
 */
(function (window, $) {
    'use strict';

    /** Docs pulled per round-trip while walking cursors towards a far page. */
    var CURSOR_WALK_BATCH = 500;

    /**
     * Hard ceiling for the fallback path (search, or a sort Firestore cannot
     * serve).  It exists so nothing is ever truly unbounded, not to change what
     * the admin sees.
     *
     * 10000 is not a taste decision: it is Firestore's own maximum. A larger
     * value makes the *backend* reject the query outright with
     *
     *     Limit value in the structured query is over the maximum value of 10000
     *
     * which is not a slow table but a dead one - every draw rejects, and the
     * view's catch() leaves an empty grid or a spinner that never stops.
     */
    var LEGACY_SCAN_LIMIT = 10000;

    /**
     * How long a cached row count is trusted.
     *
     * Counting is the one expensive part left (see COUNTING above), so it is
     * cached per query - but a row added or deleted elsewhere in the panel would
     * otherwise leave the total wrong until the page was reloaded. A short TTL
     * makes it self-correcting while still collapsing a whole session of paging
     * and sorting into a handful of counts.
     */
    var COUNT_TTL_MS = 60000;

    /**
     * How long a whole-set read is reused for.
     *
     * Short: it exists to stop a page click, a sort toggle and an export from
     * each re-downloading the same set seconds apart, not to hold data.
     */
    var SCAN_TTL_MS = 10000;

    /*
     * Firestore's compat Query does not expose the orderBy chain publicly, and
     * the views build their queries through several branches, so the only
     * reliable way to know how a query is ordered is to record it as it is
     * built.  These wrappers return the SDK's own result untouched and simply
     * remember the order on the returned object.
     */
    var ORDER_KEY = '__fsOrder';
    var PASS_THROUGH = [
        'where', 'limit', 'limitToLast',
        'startAt', 'startAfter', 'endAt', 'endBefore'
    ];

    /*
     * The second thing recorded as a query is built: which collection it reads
     * and which where() clauses it carries.  That is everything needed to ask
     * Firestore for a row count with the REST aggregation endpoint instead of
     * downloading the rows - see restCount() below for why that matters.
     *
     * Anything that narrows a query by position rather than by value (a cursor,
     * a limit) makes the recorded shape an incomplete description of the query,
     * so those methods mark it unsupported and counting falls back to the scan.
     */
    var SHAPE_KEY = '__fsShape';
    var SHAPE_BREAKING = ['limit', 'limitToLast', 'startAt', 'startAfter', 'endAt', 'endBefore'];

    /**
     * Continue a query after a document.
     *
     * The JavaScript SDK spells this `startAfter(snapshot)` - the same method
     * that takes field values also takes a DocumentSnapshot. `startAfterDocument`
     * is the Android/Java name and does not exist here at all, so calling it
     * threw `q.startAfterDocument is not a function` on every page but the
     * first, in every table in the panel.
     */
    function startAfterDoc(query, snapshot) {
        if (typeof query.startAfterDocument === 'function') {
            return query.startAfterDocument(snapshot);   // other SDKs, and the tests' fake
        }
        return query.startAfter(snapshot);
    }

    function stamp(target, key, value) {
        if (!target || value === undefined) return target;
        try {
            Object.defineProperty(target, key, {
                value: value, enumerable: false, configurable: true, writable: true
            });
        } catch (e) { /* frozen object - detection just degrades */ }
        return target;
    }

    function tag(target, order, shape) {
        if (!target) return target;
        stamp(target, ORDER_KEY, order);
        stamp(target, SHAPE_KEY, shape);
        return target;
    }

    /**
     * The shape of a query, seeding it from the collection it started at.
     *
     * Every chain in this panel begins `database.collection('name')`, and a
     * compat CollectionReference publishes that name as `.path`.  Reading it
     * here rather than wrapping `Firestore.prototype.collection` keeps this
     * independent of when the compat namespace fills its class in - which is
     * not guaranteed to be before this file runs.
     */
    function shapeOf(query) {
        if (!query) return null;
        if (query[SHAPE_KEY]) return query[SHAPE_KEY];
        var path = query.path;
        if (typeof path === 'string' && path && path.indexOf('/') === -1) {
            return { collection: path, filters: [] };
        }
        return null;                                  // a sub-collection, or already a Query
    }

    /** A copy of `shape` with one more where() clause, or an unsupported marker. */
    function shapeWith(shape, args) {
        if (!shape || shape.unsupported) return shape;
        var field = args[0];
        // A FieldPath object (including documentId()) has no plain string form
        // that the REST filter understands, so stop describing this query.
        if (typeof field !== 'string') return { unsupported: true };
        return {
            collection: shape.collection,
            filters: shape.filters.concat([{ field: field, op: args[1], value: args[2] }])
        };
    }

    function installOrderTracking() {
        if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.firestore.Query) {
            return false;
        }
        var proto = firebase.firestore.Query.prototype;
        if (proto.__fsOrderTracked) return true;

        var originalOrderBy = proto.orderBy;
        proto.orderBy = function (field, direction) {
            var result = originalOrderBy.apply(this, arguments);
            var chain = (this[ORDER_KEY] || []).concat([{
                field: String(field),
                dir: direction || 'asc'
            }]);
            return tag(result, chain, shapeOf(this));
        };

        PASS_THROUGH.forEach(function (name) {
            var original = proto[name];
            if (typeof original !== 'function') return;
            proto[name] = function () {
                var shape = shapeOf(this);
                if (name === 'where') {
                    shape = shapeWith(shape, arguments);
                } else if (SHAPE_BREAKING.indexOf(name) !== -1 && shape) {
                    shape = { unsupported: true };
                }
                return tag(original.apply(this, arguments), this[ORDER_KEY], shape);
            };
        });

        installLookupCache(proto);

        proto.__fsOrderTracked = true;
        return true;
    }

    /*
     * ------------------------------------------------------------------------
     * De-duplicating the per-row lookups
     * ------------------------------------------------------------------------
     * A `resolvesRelated` table reads its whole collection (see pageQuery), and
     * the view then looks the related document up **once per row**. On live
     * data that is 153 payouts asking for 46 distinct vendors: 153 queries,
     * 5.8 s, where the 46 distinct ones take 1.5 s.
     *
     * So a lookup is answered from a short-lived cache. This is armed only once
     * a `resolvesRelated` draw has run on the page, and only ever serves a
     * query shaped like a lookup - a single equality filter, no ordering, no
     * limit. The list queries themselves all carry a limit, so they can never
     * be served from here even by accident.
     *
     * The five-second lifetime is what makes it safe: it spans one draw and no
     * more, so an admin who changes a vendor and comes back sees the change.
     */
    var LOOKUP_TTL_MS = 5000;
    var lookupCache = {};
    var lookupArmed = false;

    /** A cache key for a query that really is a single-document lookup. */
    function lookupKey(query) {
        var shape = shapeOf(query);
        if (!shape || shape.unsupported || !shape.collection) return null;
        if (query[ORDER_KEY] && query[ORDER_KEY].length) return null;   // ordered: a list, not a lookup
        if (!shape.filters.length || shape.filters.length > 2) return null;

        var parts = [shape.collection];
        for (var i = 0; i < shape.filters.length; i++) {
            var filter = shape.filters[i];
            if (filter.op !== '==') return null;
            var type = typeof filter.value;
            if (type !== 'string' && type !== 'number' && type !== 'boolean') return null;
            parts.push(filter.field, String(filter.value));
        }
        return parts.join('\u0000');   // a separator no field value can contain
    }

    function installLookupCache(proto) {
        var originalGet = proto.get;
        if (typeof originalGet !== 'function') return;

        proto.get = function () {
            // `get(options)` can ask for server-only or cache-only reads; never
            // answer one of those from here.
            if (!lookupArmed || arguments.length) return originalGet.apply(this, arguments);

            // This wrapper sits in front of every read the panel makes, on every
            // page. Nothing it does may be allowed to turn a working query into
            // a thrown one, so a surprise here just means "not cacheable".
            var key;
            try {
                key = lookupKey(this);
            } catch (e) {
                return originalGet.apply(this, arguments);
            }
            if (!key) return originalGet.apply(this, arguments);

            var hit = lookupCache[key];
            var now = Date.now();
            if (hit && (now - hit.at) < LOOKUP_TTL_MS) return hit.promise;

            var promise = originalGet.call(this);
            lookupCache[key] = { at: now, promise: promise };
            // Keep a failure out of the cache, and keep it from surfacing as an
            // unhandled rejection just because nobody has attached to it yet.
            if (promise && typeof promise.catch === 'function') {
                promise.catch(function () {
                    if (lookupCache[key] && lookupCache[key].promise === promise) delete lookupCache[key];
                });
            }
            return promise;
        };
    }

    installOrderTracking();

    /** The field/direction Firestore actually sorts this query by, if any. */
    function primaryOrder(query) {
        var chain = query && query[ORDER_KEY];
        return chain && chain.length ? chain[0] : null;
    }

    var states = {};
    var queryIds = new WeakMap();
    var knownQueries = [];
    var nextQueryId = 1;

    /**
     * A stable id for a query.
     *
     * Some views rebuild their query object inside the ajax handler, so object
     * identity alone would look "changed" on every draw and throw away the
     * cursor and count caches. `Query.isEqual()` is public compat API and gives
     * structural equality, so a rebuilt-but-identical query keeps its caches.
     */
    function queryId(query) {
        if (!query) return 'null';
        if (queryIds.has(query)) return queryIds.get(query);

        if (typeof query.isEqual === 'function') {
            for (var i = 0; i < knownQueries.length; i++) {
                try {
                    if (query.isEqual(knownQueries[i].query)) {
                        queryIds.set(query, knownQueries[i].id);
                        return knownQueries[i].id;
                    }
                } catch (e) { /* different query type - fall through */ }
            }
        }

        var id = 'q' + nextQueryId++;
        queryIds.set(query, id);
        knownQueries.push({ query: query, id: id });
        // Bound the lookup list; queries per page are few.
        if (knownQueries.length > 64) knownQueries.shift();
        return id;
    }

    function state(key) {
        if (!states[key]) {
            states[key] = {
                signature: null,
                cursors: [null],
                countCache: null,
                countAt: 0,
                scanSnap: null,
                scanAt: 0,
                scanSignature: null,
                offset: 0,
                exactTotal: null,
                wantAll: false,
                token: 0
            };
        }
        return states[key];
    }

    function resetCursors(st) {
        st.cursors = [null];
        st.countCache = null;
        st.countAt = 0;
        st.scanSnap = null;
        st.scanAt = 0;
        st.scanSignature = null;
    }

    function countIsFresh(st) {
        return st.countCache !== null && (Date.now() - st.countAt) < COUNT_TTL_MS;
    }

    /*
     * ------------------------------------------------------------------------
     * Remembering a count between pages
     *
     * A count is already cached for COUNT_TTL_MS while a table is open, so
     * paging and sorting ask for it once. Navigating away and back used to ask
     * again - and the admin clicking Drivers -> a driver -> back to Drivers is
     * the most ordinary thing they do.
     *
     * The entry is keyed on the query's recorded SHAPE - its collection, its
     * where() clauses and its orderBy chain - which is a description of what was
     * counted and nothing else. Two pages that count the same thing therefore
     * share the entry, and a query the recorder could not describe (one carrying
     * a cursor or a FieldPath filter) is simply not remembered. Keying on
     * anything page-local, such as the internal query id, would let one page's
     * total be served to another's table.
     * ------------------------------------------------------------------------
     */
    var COUNT_STORE_PREFIX = 'fs:count:';

    /** A stable description of what a count covers, or null if there isn't one. */
    function countKey(query) {
        var shape = shapeOf(query);
        if (!shape || shape.unsupported || !shape.collection) return null;
        var filters = (shape.filters || []).map(function (f) {
            return f.field + ' ' + f.op + ' ' + JSON.stringify(f.value === undefined ? null : f.value);
        });
        var order = (query[ORDER_KEY] || []).map(function (o) { return o.field + ' ' + o.dir; });
        return shape.collection + '|' + filters.join(',') + '|' + order.join(',');
    }

    function recallCount(query) {
        var key = countKey(query);
        if (!key) return null;
        try {
            var raw = window.sessionStorage.getItem(COUNT_STORE_PREFIX + key);
            if (!raw) return null;
            var box = JSON.parse(raw);
            if (!box || (Date.now() - box.at) >= COUNT_TTL_MS) return null;
            return typeof box.n === 'number' ? box : null;
        } catch (e) {
            return null;
        }
    }

    function rememberCount(query, total) {
        var key = countKey(query);
        if (!key || typeof total !== 'number') return;
        try {
            window.sessionStorage.setItem(COUNT_STORE_PREFIX + key,
                JSON.stringify({ at: Date.now(), n: total }));
        } catch (e) { /* quota or private mode: in-memory caching still applies */ }
    }

    /*
     * ------------------------------------------------------------------------
     * Counting without reading the rows
     * ------------------------------------------------------------------------
     * Counting is the one genuinely expensive thing left in this file.  The
     * compat SDK has no count() aggregate, so the only way it can answer "how
     * many rows are there?" is to download them - 2,501 documents to print
     * "2,501 entries" under a ten-row table.  That single read dominates the
     * time to first page on every large table in the panel.
     *
     * Firestore's REST API *does* expose the aggregate, and the browser may
     * call it: same project, same web API key the SDK itself is configured
     * with, one request, a few hundred bytes back.  The query is rebuilt from
     * the collection and where() clauses recorded while it was constructed.
     *
     * Everything here is best-effort.  A query shape we cannot describe, a
     * value type we cannot encode, a non-200, a network failure - each one
     * falls back to the original scan, so a count is never wrong and never
     * missing, only sometimes slower.
     */
    var REST_COUNT_TIMEOUT_MS = 8000;
    var restCountBroken = false;

    var REST_OPS = {
        '==': 'EQUAL',
        '!=': 'NOT_EQUAL',
        '<': 'LESS_THAN',
        '<=': 'LESS_THAN_OR_EQUAL',
        '>': 'GREATER_THAN',
        '>=': 'GREATER_THAN_OR_EQUAL',
        'array-contains': 'ARRAY_CONTAINS',
        'array-contains-any': 'ARRAY_CONTAINS_ANY',
        'in': 'IN',
        'not-in': 'NOT_IN'
    };

    /** Encodes one where() value as a REST Value, or null if we cannot. */
    function restValue(value) {
        if (value === null) return { nullValue: null };
        var type = typeof value;
        if (type === 'string') return { stringValue: value };
        if (type === 'boolean') return { booleanValue: value };
        if (type === 'number') {
            if (!isFinite(value)) return null;
            return Number.isInteger(value)
                ? { integerValue: String(value) }
                : { doubleValue: value };
        }
        if (value instanceof Date) return { timestampValue: value.toISOString() };
        if (typeof value.toDate === 'function') {               // Firestore Timestamp
            try { return { timestampValue: value.toDate().toISOString() }; } catch (e) { return null; }
        }
        if (Array.isArray(value)) {                              // in / not-in / array-contains-any
            var values = [];
            for (var i = 0; i < value.length; i++) {
                var encoded = restValue(value[i]);
                if (!encoded) return null;
                values.push(encoded);
            }
            return { arrayValue: { values: values } };
        }
        return null;                                             // DocumentReference, GeoPoint, ...
    }

    function restFilter(clause) {
        var op = REST_OPS[clause.op];
        if (!op) return null;
        var value = restValue(clause.value);
        if (!value) return null;
        return {
            fieldFilter: {
                field: { fieldPath: clause.field },
                op: op,
                value: value
            }
        };
    }

    /**
     * The aggregation request body for a recorded query shape, or null.
     *
     * The orderBy chain has to be carried across as well, and not because the
     * order of a count matters.  An `orderBy(field)` is also an existence
     * filter: Firestore silently omits every document that has no such field.
     * `users where role in ['customer']` matches 472 documents, but
     * `.orderBy('createdAt','desc')` returns 377 of them, because 95 customers
     * predate that field.  Counting without the orderBy would print a total the
     * table can never reach, and the last page would come back empty.
     */
    function restCountBody(shape, order) {
        if (!shape || shape.unsupported || !shape.collection) return null;
        var structured = { from: [{ collectionId: shape.collection }] };
        var filters = [];
        for (var i = 0; i < shape.filters.length; i++) {
            var filter = restFilter(shape.filters[i]);
            if (!filter) return null;
            filters.push(filter);
        }
        if (filters.length === 1) {
            structured.where = filters[0];
        } else if (filters.length > 1) {
            structured.where = { compositeFilter: { op: 'AND', filters: filters } };
        }
        if (order && order.length) {
            structured.orderBy = [];
            for (var j = 0; j < order.length; j++) {
                if (typeof order[j].field !== 'string') return null;
                structured.orderBy.push({
                    field: { fieldPath: order[j].field },
                    direction: order[j].dir === 'asc' ? 'ASCENDING' : 'DESCENDING'
                });
            }
        }
        return {
            structuredAggregationQuery: {
                structuredQuery: structured,
                aggregations: [{ count: {}, alias: 'fsdt_count' }]
            }
        };
    }

    /** The signed-in user's token, so REST is refused exactly where the SDK is. */
    function authHeader() {
        try {
            var user = firebase.auth && firebase.auth().currentUser;
            if (!user) return Promise.resolve(null);
            return user.getIdToken().then(function (token) {
                return token ? ('Bearer ' + token) : null;
            }).catch(function () { return null; });
        } catch (e) {
            return Promise.resolve(null);
        }
    }

    /**
     * Row count for a query in one request, or null if this query cannot be
     * counted that way.  Never rejects: the caller falls back to the scan.
     */
    function restCount(query) {
        if (restCountBroken || typeof fetch !== 'function') return Promise.resolve(null);

        var body;
        var options;
        try {
            body = restCountBody(shapeOf(query), query && query[ORDER_KEY]);
            options = firebase.app().options || {};
        } catch (e) {
            return Promise.resolve(null);
        }
        if (!body || !options.projectId || !options.apiKey) return Promise.resolve(null);

        var url = 'https://firestore.googleapis.com/v1/projects/' +
            encodeURIComponent(options.projectId) +
            '/databases/(default)/documents:runAggregationQuery?key=' +
            encodeURIComponent(options.apiKey);

        return authHeader().then(function (auth) {
            var headers = { 'Content-Type': 'application/json' };
            if (auth) headers.Authorization = auth;

            var controller = typeof AbortController === 'function' ? new AbortController() : null;
            var timer = controller && setTimeout(function () { controller.abort(); }, REST_COUNT_TIMEOUT_MS);

            return fetch(url, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(body),
                signal: controller ? controller.signal : undefined
            }).then(function (response) {
                if (timer) clearTimeout(timer);
                if (!response.ok) {
                    // 401/403 means the rules refuse this path; stop trying for
                    // the rest of the page rather than paying for it per table.
                    if (response.status === 401 || response.status === 403) restCountBroken = true;
                    return null;
                }
                return response.json();
            }).then(function (json) {
                if (!json) return null;
                for (var i = 0; i < json.length; i++) {
                    var fields = json[i] && json[i].result && json[i].result.aggregateFields;
                    var value = fields && fields.fsdt_count;
                    if (value && value.integerValue !== undefined) {
                        return parseInt(value.integerValue, 10);
                    }
                }
                return null;
            }).catch(function () {
                if (timer) clearTimeout(timer);
                return null;
            });
        }).catch(function () { return null; });
    }

    /**
     * Total row count for a query.
     *
     * Tries, in order: the SDK's own count() aggregate if a future build ever
     * exposes it, the REST aggregate above, and finally reading the matching
     * documents capped at LEGACY_SCAN_LIMIT.  Callers cache the result per
     * query.
     */
    function scanCount(query) {
        return query
            .limit(LEGACY_SCAN_LIMIT)
            .get()
            .then(function (snap) {
                return snap.size;
            });
    }

    function countOf(query) {
        if (query && typeof query.count === 'function') {
            return query
                .count()
                .get()
                .then(function (snap) {
                    return snap.data().count;
                })
                .catch(function () {
                    return scanCount(query);
                });
        }
        return restCount(query).then(function (total) {
            return total === null ? scanCount(query) : total;
        });
    }

    /**
     * Make sure st.cursors[pageIndex] exists, walking forward from the deepest
     * cursor already held.  Walks in strides of CURSOR_WALK_BATCH so jumping to
     * a far page costs a handful of requests rather than one request per page.
     */
    function ensureCursor(st, query, pageIndex, length) {
        if (pageIndex <= 0 || st.cursors[pageIndex] !== undefined) {
            return Promise.resolve();
        }

        var known = pageIndex;
        while (known > 0 && st.cursors[known] === undefined) known--;

        var page = known;
        var cursor = st.cursors[known];

        function step() {
            if (page >= pageIndex) return Promise.resolve();

            var wanted = (pageIndex - page) * length;
            var take = Math.min(wanted, CURSOR_WALK_BATCH);
            var q = query.limit(take);
            if (cursor) q = startAfterDoc(q, cursor);

            return q.get().then(function (snap) {
                if (!snap.docs.length) {
                    st.cursors[page + 1] = cursor;
                    return;
                }
                var recorded = false;
                for (var i = length - 1; i < snap.docs.length; i += length) {
                    page += 1;
                    cursor = snap.docs[i];
                    st.cursors[page] = cursor;
                    recorded = true;
                }
                // Ran out of documents, or could not even complete one page.
                if (!recorded || snap.docs.length < take) {
                    st.cursors[page + 1] = cursor;
                    return;
                }
                return step();
            });
        }

        return step();
    }

    /**
     * Returns the documents this draw actually needs.
     *
     * @param {Object} query   the Firestore query the view built (with its own
     *                         where()s and orderBy()).  Pass a NEW query object
     *                         when filters change - object identity is how the
     *                         cursor cache knows to reset.
     * @param {Object} data    the DataTables request object.
     * @param {Object} options {key, orderField, naturalOrder, naturalDir,
     *                         resolvesRelated}
     * @returns {Promise<QuerySnapshot|{empty,docs,size}>}
     *
     * `resolvesRelated` marks a view that looks a second document up per row -
     * the payout screens fetch the vendor or driver a payout belongs to - and
     * *drops the row* when that lookup comes back empty.  Cursors cannot serve
     * such a table: the page is chosen before the drops happen, so a page of
     * ten payouts whose vendors were deleted renders nothing at all, under a
     * pager still offering three more pages of the same.  On live data 152 of
     * 153 payouts and 31 of 34 advertisements point at a vendor that no longer
     * exists, which is exactly the "the pages are empty" report.
     *
     * These views therefore read their whole (small) collection and let
     * DataTables page over the rows that survived, so the pager and the table
     * always agree.  It is the pre-cursor behaviour, kept deliberately for the
     * handful of tables that need it - see the tables listed in
     * docs/session17_pagination_and_panel_speed.md.
     */
    function pageQuery(query, data, options) {
        options = options || {};
        var key = options.key;
        var st = state(key);
        var token = ++st.token;

        var start = data.start || 0;
        var length = data.length;
        var searchValue = (data.search && data.search.value ? data.search.value : '').toLowerCase();
        var orderField = options.orderField;

        // How Firestore actually sorts this query, recorded when it was built.
        // An explicit naturalOrder option overrides it for hand-tuned views.
        var natural = options.naturalOrder
            ? { field: options.naturalOrder, dir: options.naturalDir || 'desc' }
            : primaryOrder(query);
        var orderDir = data.order && data.order.length
            ? data.order[0].dir
            : (natural ? natural.dir : 'desc');

        // An empty orderField means the column is not sortable, so the table is
        // shown in the query's own order - which is exactly what cursors follow.
        var isNaturalSort =
            !orderField ||
            (!!natural && orderField === natural.field && orderDir === natural.dir);

        // length === -1 is DataTables' "show all".
        if (options.resolvesRelated) lookupArmed = true;

        /*
         * `clientFilters: true` - the view throws rows away after Firestore has
         * handed them over.
         *
         * Cursor paging picks the ten rows BEFORE the view gets to drop any, so
         * a view that filters in JavaScript ends up drawing whatever is left of
         * those ten under a total that counted all of them. /drivers/pending
         * showed this exactly: one row rendered beneath "Showing 1 to 10 of 19
         * entries", and clicking Next moved the label but not the table.
         *
         * Same remedy as `resolvesRelated`: fetch the matching set (bounded by
         * LEGACY_SCAN_LIMIT), let the view filter it, and page over what is
         * left - so the pager counts the rows the admin can actually see. It is
         * a separate name because it is a different reason, and a reader of the
         * view should be able to tell which one applies.
         */
        var wantAll = st.wantAll || !!options.resolvesRelated || !!options.clientFilters ||
            !!searchValue || !isNaturalSort || !length || length < 0;

        var signature = [queryId(query), orderField || '', orderDir, searchValue, wantAll].join('|');
        if (st.signature !== signature) {
            st.signature = signature;
            resetCursors(st);
        }

        if (wantAll) {
            /*
             * Reuse the last whole-set read for a few seconds.
             *
             * This branch downloads the matching set, which is what makes the
             * pager and the rows agree for a view that filters or resolves in
             * JavaScript. Without this, every page click, every sort toggle and
             * every export re-downloaded all of it - on /drivers that is 281
             * documents to move from page 1 to page 2, and clicking through five
             * pages costs 1,405 reads.
             *
             * The set only has to be the same set the previous draw used, and
             * within a few seconds of paging it is. A row added elsewhere in the
             * panel appears on the next draw after the window closes, which is
             * the same bargain the row count already makes.
             */
            var scanHit = (st.scanAt && (Date.now() - st.scanAt) < SCAN_TTL_MS &&
                           st.scanSignature === signature) ? st.scanSnap : null;
            if (scanHit) {
                if (token === st.token) {
                    st.offset = start;
                    st.exactTotal = null;
                }
                return Promise.resolve(scanHit);
            }
            return query
                .limit(LEGACY_SCAN_LIMIT)
                .get()
                .then(function (snap) {
                    st.scanSnap = snap;
                    st.scanAt = Date.now();
                    st.scanSignature = signature;
                    if (snap.size >= LEGACY_SCAN_LIMIT) {
                        console.warn(
                            'firestore-datatable: search/sort scan hit the ' +
                            LEGACY_SCAN_LIMIT + '-document cap; rows beyond it are not ' +
                            'included in this draw.'
                        );
                    }
                    // Published only when this draw is still the current one, so a
                    // superseded draw cannot leave the wrong offset behind.
                    if (token === st.token) {
                        st.offset = start;
                        st.exactTotal = null;
                    }
                    return snap;
                });
        }

        var pageIndex = Math.floor(start / length);

        /*
         * The count is started HERE, next to the page read, not after it.
         *
         * They ask different things of Firestore and neither needs the other's
         * answer, but this used to run them one after the other - the ten rows
         * came back, and only then did the aggregation request go out. A trace
         * of /drivers showed the rows arriving at 6.0 s and the first row
         * decoration not starting until 9.6 s, and that 3.6 s gap was this.
         *
         * A fresh cached count costs nothing, so nothing is started in that case.
         */
        if (!countIsFresh(st)) {
            var remembered = recallCount(query);
            if (remembered) {
                st.countCache = remembered.n;
                st.countAt = remembered.at;
            }
        }

        var counted = countIsFresh(st)
            ? Promise.resolve(st.countCache)
            : countOf(query).then(function (total) {
                st.countCache = total;
                st.countAt = Date.now();
                rememberCount(query, total);
                return total;
            }, function (error) {
                // countOf already falls back to a scan internally; getting here
                // means even that failed. Leave the view's own local count in
                // charge rather than publishing a wrong total.
                console.warn('firestore-datatable: count unavailable for this draw', error);
                return null;
            });

        var paged = ensureCursor(st, query, pageIndex, length)
            .then(function () {
                var q = query.limit(length);
                var cursor = st.cursors[pageIndex];
                if (cursor) q = startAfterDoc(q, cursor);
                return q.get();
            })
            .then(function (snap) {
                if (snap.docs.length) {
                    st.cursors[pageIndex + 1] = snap.docs[snap.docs.length - 1];
                }
                return snap;
            });

        return Promise.all([paged, counted]).then(function (results) {
            if (token === st.token) {
                st.offset = 0;
                st.exactTotal = results[1];
            }
            return results[0];
        });
    }

    window.FsDataTable = {
        pageQuery: pageQuery,

        /**
         * Row count for a query, in one aggregation request.
         *
         * This is the same `countOf()` the paged tables have used since session
         * 17 - it was simply never reachable from outside this file, which is
         * why the six dashboards still count by downloading every matching
         * document and reading `snapshot.docs.length`.
         *
         * The contract callers depend on:
         *
         *  - It carries the query's `orderBy` chain into the aggregation. An
         *    `orderBy(field)` is also an existence filter, so a count that
         *    dropped it would report a number the page can never show.
         *  - It never invents an answer. If the aggregation cannot describe the
         *    query, or the request fails, it falls back to reading the matching
         *    documents and returning `snap.size` - which is exactly what the
         *    callers did before. The number is therefore identical either way;
         *    only the number of bytes on the wire changes.
         *
         * Pass the query WITHOUT a limit, the same one you would have called
         * `.get()` on.
         */
        count: countOf,

        /** Index into the view's own filtered array for the current page. */
        offset: function (key) {
            return state(key).offset;
        },

        /**
         * The row count DataTables should use.  Falls back to the count the view
         * computed locally whenever we served the whole set anyway.
         */
        total: function (key, localCount) {
            var st = state(key);
            return st.exactTotal === null ? localCount : st.exactTotal;
        },

        /** True once a view has routed a draw through pageQuery(). */
        isPaged: function (key) {
            return Object.prototype.hasOwnProperty.call(states, key);
        },

        /**
         * Re-run one draw in "whole collection" mode and hand back the view's
         * complete filtered record set.  Used by exportData() so Excel/PDF/CSV
         * exports still contain every row, not just the visible page.
         */
        fetchAll: function (dt, key) {
            var st = state(key);
            return new Promise(function (resolve) {
                st.wantAll = true;
                try {
                    dt.ajax.reload(function (json) {
                        st.wantAll = false;
                        resolve((json && json.filteredData) || []);
                    }, false);
                } catch (error) {
                    st.wantAll = false;
                    console.error('firestore-datatable: fetchAll failed', error);
                    resolve([]);
                }
            });
        },

        /** Row count for a query without downloading it. */
        count: function (query) {
            return countOf(query);
        },

        /** Drop cached cursors/counts for a table (e.g. after a delete). */
        reset: function (key) {
            var st = state(key);
            st.signature = null;
            resetCursors(st);
        },

        LEGACY_SCAN_LIMIT: LEGACY_SCAN_LIMIT
    };
})(window, jQuery);
