/*
 * LiveOrders: show new orders on an order list without the admin pressing
 * refresh.
 *
 *   LiveOrders.watch(query, ['orderTable'])
 *
 * `query` is the list's own query, newest first (the same one its table reads,
 * so it needs no new index). One listener reads the newest order only. When an
 * order newer than the ones already seen arrives, the page's table is redrawn
 * in place: same page, same search, same filters - exactly what pressing the
 * table's own reload would show. Several orders arriving together cause one
 * redraw.
 *
 * Anything that fails (no SDK, a refused or invalid query) leaves the page
 * exactly as it was before: a list that needs a manual refresh.
 */
(function (root) {
    'use strict';

    var DEBOUNCE_MS = 1500;

    function createdMillis(doc) {
        try {
            var c = doc.get('createdAt');
            if (c && typeof c.toMillis === 'function') return c.toMillis();
        } catch (e) { /* no usable createdAt */ }
        return null;
    }

    /**
     * Decide, from the newest document of each snapshot, whether a new order
     * arrived. Kept separate from Firestore so it can be tested on its own.
     */
    function tracker() {
        var seen = {};
        var newest = null;      // createdAt millis of the newest order seen
        var primed = false;
        return function (doc) {
            if (!doc) { primed = true; return false; }
            var id = doc.id;
            var at = createdMillis(doc);
            if (!primed) {
                primed = true;
                seen[id] = true;
                newest = at;
                return false;
            }
            if (seen[id]) return false;
            seen[id] = true;
            // The newest order changed. It is a NEW order unless it is older
            // than one already seen (the previous newest was deleted).
            var isNew = at === null || newest === null || at >= newest;
            if (at !== null && (newest === null || at > newest)) newest = at;
            return isNew;
        };
    }

    function redraw(keys) {
        var $ = root.jQuery;
        try {
            (keys || []).forEach(function (key) {
                if (root.FsDataTable && root.FsDataTable.reset) root.FsDataTable.reset(key);
            });
            // The table helper also keeps totals in sessionStorage for a minute
            // ('fs:count:...'); drop them so "of N" counts the new order too.
            // They are only a cache: anything dropped is simply counted again.
            try {
                var store = root.sessionStorage;
                for (var i = store.length - 1; i >= 0; i--) {
                    var name = store.key(i);
                    if (name && name.indexOf('fs:count:') === 0) store.removeItem(name);
                }
            } catch (e) { /* no storage: nothing cached there */ }
            if ($ && $.fn && $.fn.dataTable) {
                $.each($.fn.dataTable.tables({ visible: true }), function (_, node) {
                    try {
                        var api = $(node).DataTable();
                        var settings = api.settings()[0];
                        if (settings && settings.oFeatures && settings.oFeatures.bServerSide) {
                            api.ajax.reload(null, false);
                        }
                    } catch (e) { /* leave this table as it is */ }
                });
            }
        } catch (e) {
            if (root.console) console.warn('LiveOrders: redraw failed', e);
        }
    }

    function watch(query, keys, deps) {
        var onNew = (deps && deps.redraw) || function () { redraw(keys); };
        var isNew = tracker();
        var timer = null;
        var unsubscribe = null;
        try {
            // includeMetadataChanges: when the page has already read these
            // orders, the first snapshot comes from the local cache and the
            // server's confirmation of the same newest order changes nothing
            // but metadata - without this option it is never delivered, and
            // the first new order was taken as the starting point and missed.
            unsubscribe = query.limit(1).onSnapshot({ includeMetadataChanges: true }, function (snap) {
                // Only the server's answer counts; a cached first snapshot can
                // be stale and would look like a new order.
                if (snap.metadata && snap.metadata.fromCache) return;
                var doc = snap.docs && snap.docs.length ? snap.docs[0] : null;
                if (!isNew(doc)) return;
                if (timer) clearTimeout(timer);
                timer = setTimeout(function () { timer = null; onNew(); }, DEBOUNCE_MS);
            }, function (error) {
                if (root.console) console.warn('LiveOrders: listener stopped', error);
            });
        } catch (e) {
            if (root.console) console.warn('LiveOrders: not started', e);
        }
        return function stop() {
            if (timer) clearTimeout(timer);
            if (typeof unsubscribe === 'function') unsubscribe();
        };
    }

    var api = { watch: watch, _tracker: tracker, DEBOUNCE_MS: DEBOUNCE_MS };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LiveOrders = api;
})(typeof window !== 'undefined' ? window : globalThis);
