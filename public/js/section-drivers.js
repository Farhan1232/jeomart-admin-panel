/*
 * section-drivers.js
 * ----------------------------------------------------------------------------
 * Which drivers the section's Drivers list shows (/drivers, /drivers/approved,
 * /drivers/pending).
 *
 * WHAT THE CLIENT REPORTED (14 Sep 2026)
 *   "When u select food delivery section and view drivers then u will see only
 *    5 drivers. But when u click on live tracking in food delivery section then
 *    it will show u again many more accounts which i already deleted."
 *   "Arman khattak account is already deleted and its showing online."
 *
 * WHAT WAS ACTUALLY WRONG
 *   None of those accounts had been deleted - the list had never shown them,
 *   so there was nothing to click Delete on. Its query was
 *
 *       role == driver  AND  isOwner == false  AND  sectionIds array-contains S
 *
 *   and two kinds of driver fall outside it:
 *
 *     - a profile with NO `isOwner` field at all. `== false` does not match a
 *       missing field. Food Delivery had 13 driver profiles and only 6 carried
 *       the field; Arman Khattak, Saim Khan, Faizee Khan, Musa Khan, Rehman Khan
 *       and Sumair Khan were all invisible here while Live Tracking drew them.
 *     - a profile whose section is only in the singular `sectionId` (what the
 *       panel's own driver form writes). Eleven real logins in the second Cab
 *       Service section were missing for that reason.
 *
 *   The list also ordered by `createdAt` in Firestore, which silently drops a
 *   document without that field.
 *
 * WHAT THIS DOES
 *   Asks for both section shapes and merges them by document id, the same way
 *   the god's-eye maps already do (live-tracking.js). Fleet OWNERS stay off the
 *   list - `isOwner === true` is filtered here instead of in the query - and
 *   the status and date filters are applied here too, so no new composite
 *   index is needed. The view already reads the whole matching set and pages
 *   over it in the browser (FsDataTable `clientFilters`), so filtering here
 *   keeps the pager and the rows in agreement.
 *
 * The source object answers `.limit(n).get()` and `.get()` with a snapshot-
 * shaped { empty, size, docs } - which is all FsDataTable.pageQuery asks of a
 * query when it reads the whole set.
 *
 * Inlined by resources/views/layouts/section_drivers_script.blade.php.
 */
(function (window) {
    'use strict';

    /** Is this driver in the section, in either of the two fields? */
    function inSection(driver, sectionId) {
        if (!driver || !sectionId) return false;
        if (driver.sectionId === sectionId) return true;
        return Array.isArray(driver.sectionIds) && driver.sectionIds.indexOf(sectionId) !== -1;
    }

    /** A fleet owner is not a row of the Drivers list; every other driver is. */
    function listed(driver) {
        return !!driver && driver.isOwner !== true;
    }

    function millis(value) {
        if (!value) return NaN;
        try {
            if (typeof value.toMillis === 'function') return value.toMillis();
            if (typeof value.toDate === 'function') return value.toDate().getTime();
            if (value instanceof Date) return value.getTime();
            if (typeof value === 'number') return value;
        } catch (e) { /* unreadable - treated as no date */ }
        return NaN;
    }

    /**
     * The filters the page's selectors used to add as where() clauses:
     * { status: 'active'|'inactive'|'', from: Date|Timestamp, to: Date|Timestamp }.
     */
    function passes(driver, filters) {
        filters = filters || {};
        if (filters.status === 'active' && driver.active !== true) return false;
        if (filters.status === 'inactive' && driver.active !== false) return false;
        if (filters.from || filters.to) {
            var created = millis(driver.createdAt);
            if (isNaN(created)) return false;
            if (filters.from && created < millis(filters.from)) return false;
            if (filters.to && created > millis(filters.to)) return false;
        }
        return true;
    }

    /** The queries that between them name the section's drivers. */
    function queries(db, sectionId) {
        var drivers = db.collection('users').where('role', '==', 'driver');
        if (!sectionId) return [drivers];
        return [
            drivers.where('sectionIds', 'array-contains', sectionId),
            drivers.where('sectionId', '==', sectionId)
        ];
    }

    /**
     * Read every query, merge by id, filter, newest first.
     *
     * One query failing does not empty the list: the other shape may still
     * answer, and some drivers beat none. Only when every query failed is the
     * failure passed on.
     */
    function read(asked, filters, limit) {
        var errors = [];
        return Promise.all(asked.map(function (query) {
            return (limit ? query.limit(limit) : query).get().catch(function (error) {
                console.warn('section-drivers: a driver query failed', error);
                errors.push(error);
                return null;
            });
        })).then(function (snaps) {
            if (errors.length === asked.length) throw errors[0];
            var seen = {};
            var docs = [];
            snaps.forEach(function (snap) {
                if (!snap) return;
                snap.docs.forEach(function (doc) {
                    if (seen[doc.id]) return;
                    seen[doc.id] = true;
                    var data = doc.data();
                    if (!listed(data) || !passes(data, filters)) return;
                    docs.push(doc);
                });
            });
            docs.sort(function (a, b) {
                var am = millis(a.data().createdAt), bm = millis(b.data().createdAt);
                return (isNaN(bm) ? 0 : bm) - (isNaN(am) ? 0 : am);
            });
            return { empty: docs.length === 0, size: docs.length, docs: docs };
        });
    }

    /**
     * The section's drivers, as a query-like source for FsDataTable.pageQuery.
     * Build a NEW source when the filters change: object identity is how the
     * table's caches know the set changed.
     */
    function source(db, sectionId, filters) {
        var asked = queries(db, sectionId);
        var chosen = filters || {};
        return {
            sectionId: sectionId || '',
            filters: chosen,
            limit: function (n) {
                return { get: function () { return read(asked, chosen, n); } };
            },
            get: function () { return read(asked, chosen, 0); }
        };
    }

    window.SectionDrivers = {
        inSection: inSection,
        listed: listed,
        passes: passes,
        queries: queries,
        source: source
    };
})(window);
