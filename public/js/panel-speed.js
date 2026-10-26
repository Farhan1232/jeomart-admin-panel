/*
 * panel-speed.js
 * ----------------------------------------------------------------------------
 * Cross-cutting speed-ups for the admin panel that no view has to opt into.
 *
 * WHAT MADE THE PANEL SLOW (measured, not guessed - see
 * scripts/profile_panel_queries.js, which records every Firestore call a page
 * makes with its collection, filters, duration and document count)
 *
 *   1. Every page re-read the same handful of `settings/*` documents.
 *      `settings/placeHolderImage` alone is read by 97 views, and the layout
 *      reads seven more. On the live project one round trip is ~1.8 s, and
 *      these are the FIRST thing every page does, so they sit directly in
 *      front of the table the admin is waiting for.
 *
 *   2. The same document was fetched several times over within one page - the
 *      layout and the view would each ask for `placeHolderImage`, and a table
 *      would look the same driver up once per row.
 *
 *   3. Row decoration fetched related documents one id at a time.
 *
 *   4. 1.2 MB of export libraries (pdfmake, its font file, xlsx, jszip, jspdf)
 *      were downloaded as blocking scripts on EVERY page, though nothing on
 *      screen uses them until the admin clicks Export. On the trace that
 *      waterfall is why the first Firestore call did not start until 4.2 s.
 *
 *   5. Pages read one thing, waited, then read the next - and read some
 *      things twice. /stores/view: 17 reads in 15 waves, ~20 s, for 116
 *      documents (profile_panel_queries.js --timeline, 15 Sep 2026).
 *
 *   6. Photos were uploaded at camera size (0.7-1.4 MB each), and images
 *      uploaded with putString() never got the cache lifetime put() gets.
 *
 * WHAT THIS FILE DOES ABOUT IT
 *
 *   FsConfig   caches configuration documents (`settings/*`) in sessionStorage
 *              and de-duplicates in-flight reads of ANY document, by patching
 *              DocumentReference.prototype.get(). No view changes; a view that
 *              writes a setting invalidates its own cache entry automatically.
 *
 *   FsBatch    resolves many document ids in one round trip per ten ids,
 *              instead of one per id, and remembers what it has already seen.
 *
 *   FsLib      loads an export library the first time it is actually needed.
 *
 *   FsWarm     while a page is loading, answers a repeated read with the
 *              first one, and starts the reads that kind of page is known
 *              to make all at once instead of one after another.
 *
 *   FsUpload   scales oversized photos down before they are uploaded, and
 *              gives putString() images the cache lifetime put() gets.
 *
 * DESIGN RULES THIS FILE KEEPS
 *
 *   - It never invents an answer. Every path falls back to the SDK's own
 *     behaviour on any error, on any document shape it cannot represent
 *     faithfully, and in any browser where sessionStorage is unavailable.
 *   - It never returns a lossily-decoded document. Timestamps and GeoPoints
 *     survive the JSON round trip because they are encoded explicitly; a
 *     document holding anything else exotic (a DocumentReference, Bytes) is
 *     simply not cached.
 *   - It is off on the pages that edit the things it caches.
 *
 * Requires: firebase-firestore-compat (and firebase-storage-compat for
 * FsUpload, which does nothing without it). Loaded from layouts/app.blade.php.
 */
(function (window) {
    'use strict';

    /**
     * How long a cached configuration document is trusted, in ms.
     *
     * Long enough that clicking through ten pages costs one read, short enough
     * that a change made in another tab appears without a hard reload.
     */
    var CONFIG_TTL_MS = 5 * 60 * 1000;

    var STORE_PREFIX = 'fs:cfg:';

    /**
     * Collections whose documents are configuration: written rarely, from the
     * settings screens, and read by nearly every page.
     *
     * Business data (users, rides, orders, ...) is deliberately NOT here. A
     * stale order would be a correctness bug; a stale placeholder image is not.
     */
    var CONFIG_COLLECTIONS = ['settings'];

    /**
     * Pages that edit configuration. The cache is disabled outright on these,
     * and their entries are dropped on arrival, so an admin never edits a
     * setting against a stale copy of it.
     */
    var EDITOR_PATH = /\/(settings|section|zone)(\/|$)/i;

    /** Firestore accepts at most this many values in an `in` filter. */
    var IN_CHUNK = 10;

    function isEditorPage() {
        try {
            return EDITOR_PATH.test(window.location.pathname);
        } catch (e) {
            return true;   // no location: assume the cautious answer
        }
    }

    function isConfigPath(path) {
        if (!path) return false;
        var parts = String(path).split('/');
        return parts.length === 2 && CONFIG_COLLECTIONS.indexOf(parts[0]) !== -1;
    }

    /* ---------------------------------------------------------------------
     * Faithful encoding
     *
     * `JSON.stringify` turns a Firestore Timestamp into `{seconds, nanoseconds}`
     * and a GeoPoint into `{}` - so a naive cache hands back a document that
     * looks right until a view calls `.toDate()` on it and the page throws.
     * These two walk the document and mark the types that matter, and refuse
     * the whole document if they meet anything they cannot put back together.
     * ------------------------------------------------------------------- */

    function fsTypes() {
        try { return window.firebase.firestore; } catch (e) { return null; }
    }

    function encode(value, bail) {
        var api = fsTypes();
        if (value === null || value === undefined) return value;
        var t = typeof value;
        if (t === 'string' || t === 'number' || t === 'boolean') return value;
        if (Array.isArray(value)) {
            return value.map(function (v) { return encode(v, bail); });
        }
        if (t === 'object') {
            if (api && api.Timestamp && value instanceof api.Timestamp) {
                return { __fs: 'ts', s: value.seconds, n: value.nanoseconds };
            }
            if (api && api.GeoPoint && value instanceof api.GeoPoint) {
                return { __fs: 'gp', lat: value.latitude, lng: value.longitude };
            }
            if (value instanceof Date) return { __fs: 'date', t: value.getTime() };
            // Anything else with a prototype of its own - a DocumentReference,
            // a Bytes, an SDK internal - cannot be rebuilt from JSON.
            if (Object.getPrototypeOf(value) !== Object.prototype &&
                Object.getPrototypeOf(value) !== null) {
                bail.hit = true;
                return null;
            }
            var out = {};
            for (var k in value) {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    out[k] = encode(value[k], bail);
                }
            }
            return out;
        }
        bail.hit = true;      // function, symbol, bigint
        return null;
    }

    function decode(value) {
        var api = fsTypes();
        if (value === null || value === undefined) return value;
        if (Array.isArray(value)) return value.map(decode);
        if (typeof value !== 'object') return value;
        if (value.__fs === 'ts') {
            return (api && api.Timestamp)
                ? new api.Timestamp(value.s, value.n)
                : new Date(value.s * 1000);
        }
        if (value.__fs === 'gp') {
            return (api && api.GeoPoint) ? new api.GeoPoint(value.lat, value.lng) : value;
        }
        if (value.__fs === 'date') return new Date(value.t);
        var out = {};
        for (var k in value) {
            if (Object.prototype.hasOwnProperty.call(value, k)) out[k] = decode(value[k]);
        }
        return out;
    }

    /* ---------------------------------------------------------------------
     * The store
     * ------------------------------------------------------------------- */

    function readStore(path) {
        try {
            var raw = window.sessionStorage.getItem(STORE_PREFIX + path);
            if (!raw) return null;
            var box = JSON.parse(raw);
            if (!box || (Date.now() - box.at) > CONFIG_TTL_MS) return null;
            return box;
        } catch (e) {
            return null;
        }
    }

    function writeStore(path, data) {
        var bail = { hit: false };
        var encoded = data === null ? null : encode(data, bail);
        if (bail.hit) return false;          // not representable: do not cache it
        try {
            window.sessionStorage.setItem(STORE_PREFIX + path,
                JSON.stringify({ at: Date.now(), exists: data !== null, value: encoded }));
            return true;
        } catch (e) {
            return false;                    // quota, private mode: carry on uncached
        }
    }

    function dropStore(path) {
        try { window.sessionStorage.removeItem(STORE_PREFIX + path); } catch (e) { /* nothing to drop */ }
    }

    function dropAll() {
        try {
            Object.keys(window.sessionStorage)
                .filter(function (k) { return k.indexOf(STORE_PREFIX) === 0; })
                .forEach(function (k) { window.sessionStorage.removeItem(k); });
        } catch (e) { /* nothing to drop */ }
    }

    /**
     * A stand-in for the DocumentSnapshot the SDK would have returned.
     *
     * Only the surface the panel's views actually use is provided - `exists`,
     * `id`, `ref`, `data()` and `get(field)`. `data()` hands out a fresh copy
     * every call, exactly as the SDK does, so a caller that edits the object it
     * received cannot corrupt the cache for the next one.
     */
    function cachedSnapshot(ref, path, box) {
        var id = path.split('/').pop();
        return {
            id: id,
            ref: ref,
            exists: !!box.exists,
            fromCache: true,
            metadata: { fromCache: true, hasPendingWrites: false },
            data: function () {
                return box.exists ? decode(box.value) : undefined;
            },
            get: function (field) {
                var d = box.exists ? decode(box.value) : undefined;
                if (!d) return undefined;
                return String(field).split('.').reduce(function (acc, part) {
                    return (acc === null || acc === undefined) ? acc : acc[part];
                }, d);
            }
        };
    }

    /* ---------------------------------------------------------------------
     * FsWarm - while a page loads: ask once, start together
     *
     * WHAT WAS SLOW (scripts/profile_panel_queries.js --timeline, 15 Sep 2026,
     * on the pages in the client's screen recording)
     *
     *   The detail pages read one thing, wait for the answer, then read the
     *   next. /stores/view made 17 reads in 15 waves - about 20 s from this box
     *   - to show 116 documents, and 5 of the 17 repeated a read the same page
     *   had already made (the store, its owner, its products and the category
     *   list, twice each). /drivers/view: 7 reads in 4 waves. /stores: 16
     *   reads in 4 waves. Nothing is large; the page queues behind itself.
     *
     * WHAT THIS DOES - no view is changed, and every view still runs its own
     * code, in its own order
     *
     *   1. While the page is loading, a read identical to one the page has
     *      already made (the same document, or the same collection + where +
     *      orderBy + limit with the same values) gets that same answer
     *      instead of a second round trip.
     *
     *   2. The panel remembers, per kind of page, which reads it made. The
     *      next time that kind of page opens, those reads are all started at
     *      once at the top of the page. When the view's code then asks for
     *      them one after another, the answers are already there or already
     *      on their way.
     *
     * LIMITS
     *
     *   - Only while the page is loading. Sharing stops at the admin's first
     *     real click or key press, when the page is hidden, at the first write
     *     the page makes, and after WARM_WINDOW_MS at the latest. From then on
     *     every read goes to the server exactly as before.
     *   - Only reads it can describe exactly, with plain values. Page cursors,
     *     dates, documentId() filters, converters, collection groups and
     *     listeners are left alone. Configuration documents keep their own
     *     cache (above) and are not part of this.
     *   - A read seen on one record (one store, one driver) is started early
     *     for a DIFFERENT record only after it has been seen on two different
     *     records, so a read that belongs to one store's owner is not started
     *     for another store. A read that used the id in the page address is
     *     carried over with the new id.
     *   - A read that fails stops being shared the moment it fails, and is
     *     not started early again.
     *   - A read that returned more than WARM_MAX_DOCS documents is not started
     *     early.
     *   - It can be switched off in one browser:
     *     localStorage.setItem('fs:warm:off', '1')
     * ------------------------------------------------------------------- */

    /** The longest a page's reads are shared for, counted from the page opening. */
    var WARM_WINDOW_MS = 30 * 1000;

    /** A visit counts as having finished its reads after this long without one. */
    var WARM_QUIET_MS = 5 * 1000;

    /** Reads remembered per kind of page. */
    var WARM_MAX_READS = 40;

    /** A read that returned more documents than this is not started early. */
    var WARM_MAX_DOCS = 300;

    /** Kinds of page remembered; the least recently opened are forgotten. */
    var WARM_MAX_PAGES = 120;

    var WARM_STORE_KEY = 'fs:warm:v1';
    var WARM_OFF_KEY = 'fs:warm:off';

    /** Where a query built through the patched chain carries its description. */
    var WARM_BASE = '__psWarmBase';
    var WARM_OPS = '__psWarmOps';

    var warm = {
        started: false,
        open: false,
        replaying: false,
        saved: false,
        timer: null,
        page: null,          // { key, ids, idSig }
        memo: {},            // read key -> the Promise the SDK returned for it
        seen: [],            // read keys the page itself asked for, in order
        seenIndex: {},
        tooBig: {},
        failed: {},
        pending: 0,
        lastReadAt: 0,
        stats: { shared: 0, started: 0, closedBy: '' }
    };

    function own(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key);
    }

    function union(a, b, cap) {
        var out = [];
        var seen = {};
        (a || []).concat(b || []).forEach(function (x) {
            if (!own(seen, x)) { seen[x] = true; out.push(x); }
        });
        return cap ? out.slice(0, cap) : out;
    }

    function intersect(a, b) {
        var inB = {};
        (b || []).forEach(function (x) { inB[x] = true; });
        return (a || []).filter(function (x) { return own(inB, x); });
    }

    /* --- which page is this ---------------------------------------------- */

    /**
     * True for an address segment that is a record id rather than a route word:
     * Firestore ids (20 chars), Auth uids (28), the panel's hex section ids (13).
     * Route words ("view", "subscription-plans") have no digits.
     */
    function looksLikeId(s) {
        s = String(s === undefined || s === null ? '' : s);
        if (!/^[A-Za-z0-9_-]+$/.test(s)) return false;
        if (s.length >= 6 && /\d/.test(s)) return true;
        return s.length >= 20 && /[a-z]/.test(s) && /[A-Z]/.test(s);
    }

    function readCookie(name) {
        try {
            var parts = String(window.document.cookie || '').split(';');
            for (var i = 0; i < parts.length; i++) {
                var pair = parts[i].replace(/^\s+/, '');
                if (pair.indexOf(name + '=') === 0) {
                    return decodeURIComponent(pair.slice(name.length + 1));
                }
            }
        } catch (e) { /* no document, or no cookies */ }
        return '';
    }

    /**
     * The kind of page - its address with the ids taken out, plus the admin's
     * section, because list pages are filtered by it - and the ids taken out.
     */
    function describePage() {
        var loc = window.location || {};
        var ids = [];
        var shape = String(loc.pathname || '').split('/').map(function (seg) {
            if (looksLikeId(seg)) { ids.push(seg); return ':id'; }
            return seg;
        }).join('/');
        var search = String(loc.search || '').replace(/^\?/, '');
        if (search) {
            shape += '?' + search.split('&').map(function (pair) {
                var at = pair.indexOf('=');
                if (at < 0) return pair;
                var value = pair.slice(at + 1);
                try { value = decodeURIComponent(value.replace(/\+/g, ' ')); } catch (e) { /* keep it raw */ }
                if (looksLikeId(value)) { ids.push(value); return pair.slice(0, at) + '=:id'; }
                return pair;
            }).join('&');
        }
        return { key: shape + '|' + readCookie('section_id'), ids: ids, idSig: ids.join('/') };
    }

    /* --- describing a read ------------------------------------------------ */

    function plainValue(v, nested) {
        if (v === null) return true;
        var t = typeof v;
        if (t === 'string' || t === 'boolean') return true;
        if (t === 'number') return isFinite(v);
        if (!nested && Array.isArray(v) && v.length <= 30) {
            for (var i = 0; i < v.length; i++) {
                if (!plainValue(v[i], true)) return false;
            }
            return true;
        }
        return false;
    }

    /** One step of a query chain as plain data, or null when it cannot be. */
    function chainStep(name, args) {
        if (name === 'where') {
            return (typeof args[0] === 'string' && typeof args[1] === 'string' && plainValue(args[2]))
                ? ['w', args[0], args[1], args[2]] : null;
        }
        if (name === 'orderBy') {
            if (typeof args[0] !== 'string') return null;
            if (args[1] !== undefined && args[1] !== 'asc' && args[1] !== 'desc') return null;
            return ['o', args[0], args[1] || 'asc'];
        }
        if (name === 'limit' || name === 'limitToLast') {
            return (typeof args[0] === 'number' && isFinite(args[0]))
                ? [name === 'limit' ? 'l' : 'L', args[0]] : null;
        }
        return null;         // startAt / startAfter / endAt / endBefore: a page cursor
    }

    /** The path of a CollectionReference, or null for anything else. */
    function collectionPathOf(q) {
        var api = fsTypes();
        try {
            if (api && api.CollectionReference && q instanceof api.CollectionReference &&
                typeof q.path === 'string' && q.path) {
                return q.path;
            }
        } catch (e) { /* not a collection */ }
        return null;
    }

    /** [collection path, steps] for a query, or null when it cannot be described. */
    function describeQuery(q) {
        if (!q) return null;
        if (own(q, WARM_OPS)) {
            return (q[WARM_BASE] && q[WARM_OPS]) ? [q[WARM_BASE], q[WARM_OPS]] : null;
        }
        var base = collectionPathOf(q);
        return base ? [base, []] : null;
    }

    function stampChain(query, description) {
        try {
            Object.defineProperty(query, WARM_BASE, {
                value: description ? description[0] : null, configurable: true, writable: true
            });
            Object.defineProperty(query, WARM_OPS, {
                value: description ? description[1] : null, configurable: true, writable: true
            });
        } catch (e) { /* a frozen object is simply never shared */ }
        return query;
    }

    function queryKey(q) {
        var description = describeQuery(q);
        return description ? JSON.stringify(['q', description[0], description[1]]) : null;
    }

    function warmDocKey(path) {
        return (warm.open && path && !isConfigPath(path)) ? JSON.stringify(['d', path]) : null;
    }

    /**
     * A read key with the page's address ids swapped for their position, so
     * the same kind of read can be rebuilt for another record.
     */
    function signatureOf(key, ids) {
        var read = JSON.parse(key);
        function swap(v) {
            if (typeof v === 'string') {
                var at = ids.indexOf(v);
                return at === -1 ? v : { u: at };
            }
            return Array.isArray(v) ? v.map(swap) : v;
        }
        var segments = String(read[1]).split('/').map(swap);
        if (read[0] === 'd') return JSON.stringify(['d', segments]);
        return JSON.stringify(['q', segments, read[2].map(function (step) {
            return step[0] === 'w' ? ['w', step[1], step[2], swap(step[3])] : step;
        })]);
    }

    /** {kind, path, ops} rebuilt from a signature for this page's ids, or null. */
    function readOfSignature(sig, ids) {
        var read;
        var missing = false;
        try { read = JSON.parse(sig); } catch (e) { return null; }
        if (!Array.isArray(read) || !Array.isArray(read[1])) return null;
        function fill(v) {
            if (Array.isArray(v)) return v.map(fill);
            if (v && typeof v === 'object') {
                if (typeof v.u === 'number' && v.u >= 0 && v.u < ids.length) return ids[v.u];
                missing = true;
                return null;
            }
            return v;
        }
        var path = read[1].map(fill).join('/');
        if (read[0] === 'd') {
            return (missing || !path) ? null : { kind: 'd', path: path };
        }
        if (read[0] !== 'q' || !Array.isArray(read[2])) return null;
        var ops = read[2].map(function (step) {
            return step[0] === 'w' ? ['w', step[1], step[2], fill(step[3])] : step;
        });
        return (missing || !path) ? null : { kind: 'q', path: path, ops: ops };
    }

    /* --- the page's reads ------------------------------------------------- */

    function noteRead(key) {
        if (warm.replaying || !warm.open) return;
        warm.lastReadAt = Date.now();
        if (own(warm.seenIndex, key) || warm.seen.length >= WARM_MAX_READS) return;
        warm.seenIndex[key] = true;
        warm.seen.push(key);
    }

    function trackRead(pending) {
        if (!warm.open || warm.replaying || !pending || typeof pending.then !== 'function') return;
        warm.pending++;
        warm.lastReadAt = Date.now();
        var done = function () { warm.pending--; warm.lastReadAt = Date.now(); };
        pending.then(done, done);
    }

    function rememberRead(key, pending) {
        if (!pending || typeof pending.then !== 'function') return;
        if (warm.replaying) warm.stats.started++;
        trackRead(pending);
        warm.memo[key] = pending;
        pending.then(function (snap) {
            try {
                if (snap && typeof snap.size === 'number' && snap.size > WARM_MAX_DOCS) {
                    warm.tooBig[key] = true;
                }
            } catch (e) { /* a document snapshot has no size */ }
        }, function () {
            warm.failed[key] = true;
            if (warm.memo[key] === pending) delete warm.memo[key];
        });
    }

    function shareHit(key) {
        if (!warm.replaying) warm.stats.shared++;
        return warm.memo[key];
    }

    function installWarm(api) {
        var qproto = api.Query && api.Query.prototype;
        if (!qproto || qproto.__panelSpeedWarm) return;
        var cproto = api.CollectionReference && api.CollectionReference.prototype;

        // Remember what each query is as it is built.
        ['where', 'orderBy', 'limit', 'limitToLast', 'startAt', 'startAfter', 'endAt', 'endBefore']
            .forEach(function (name) {
                [qproto, cproto].forEach(function (p) {
                    if (!p || !own(p, name) || typeof p[name] !== 'function') return;
                    var original = p[name];
                    p[name] = function () {
                        var out = original.apply(this, arguments);
                        if (!out || typeof out !== 'object') return out;
                        var description = describeQuery(this);
                        var step = description ? chainStep(name, arguments) : null;
                        return stampChain(out, step ? [description[0], description[1].concat([step])] : null);
                    };
                });
            });

        [qproto, cproto].forEach(function (p) {
            if (!p || !own(p, 'get') || typeof p.get !== 'function') return;
            var originalGet = p.get;
            p.get = function (options) {
                // An explicit source is a deliberate request; never share it.
                if (!warm.open || (options && options.source)) {
                    return originalGet.apply(this, arguments);
                }
                var key = queryKey(this);
                if (!key) {
                    var plain = originalGet.apply(this, arguments);
                    trackRead(plain);
                    return plain;
                }
                noteRead(key);
                if (own(warm.memo, key)) return shareHit(key);
                var pending = originalGet.apply(this, arguments);
                rememberRead(key, pending);
                return pending;
            };
        });

        // Any write ends the loading window: nothing read before it is handed
        // out after it. (DocumentReference writes are handled in install().)
        function stopFirst(p, name) {
            if (!p || typeof p[name] !== 'function') return;
            var original = p[name];
            p[name] = function () {
                warmStop('write');
                return original.apply(this, arguments);
            };
        }
        stopFirst(cproto, 'add');
        stopFirst(api.WriteBatch && api.WriteBatch.prototype, 'commit');
        stopFirst(api.Firestore && api.Firestore.prototype, 'runTransaction');

        qproto.__panelSpeedWarm = true;
    }

    /* --- remembering between visits -------------------------------------- */

    function warmStoreRead() {
        try {
            var raw = window.localStorage.getItem(WARM_STORE_KEY);
            var all = raw ? JSON.parse(raw) : {};
            return (all && typeof all === 'object' && !Array.isArray(all)) ? all : {};
        } catch (e) {
            return {};
        }
    }

    function warmStoreWrite(all) {
        try {
            var keys = Object.keys(all);
            if (keys.length > WARM_MAX_PAGES) {
                keys.sort(function (a, b) { return (all[b].at || 0) - (all[a].at || 0); });
                keys.slice(WARM_MAX_PAGES).forEach(function (k) { delete all[k]; });
            }
            window.localStorage.setItem(WARM_STORE_KEY, JSON.stringify(all));
        } catch (e) { /* quota or private mode: the next visit simply starts cold */ }
    }

    function warmForget() {
        try { window.localStorage.removeItem(WARM_STORE_KEY); } catch (e) { /* nothing stored */ }
    }

    function warmSwitchedOff() {
        try { return window.localStorage.getItem(WARM_OFF_KEY) === '1'; } catch (e) { return false; }
    }

    /**
     * Record this visit's reads for the next one.
     *
     *   s   the reads of the last visit, replayed when the SAME record opens
     *   st  reads seen on two different records, replayed for ANY record
     *
     * A visit cut short (a click before the page finished reading) only adds
     * to what is known; a visit that finished replaces it, so a read the view
     * no longer makes is forgotten.
     */
    function warmSave() {
        if (warm.saved || !warm.page) return;
        warm.saved = true;
        var ids = warm.page.ids;
        var sigs = [];
        warm.seen.forEach(function (key) {
            if (own(warm.tooBig, key) || own(warm.failed, key)) return;
            try { sigs.push(signatureOf(key, ids)); } catch (e) { /* not rebuildable: skip it */ }
        });
        if (!sigs.length) return;

        var complete = warm.pending <= 0 && (Date.now() - warm.lastReadAt) >= WARM_QUIET_MS;
        var all = warmStoreRead();
        var prev = all[warm.page.key];
        var prevS = (prev && Array.isArray(prev.s)) ? prev.s : null;
        var prevSt = (prev && Array.isArray(prev.st)) ? prev.st : [];
        var next = { i: warm.page.idSig, at: Date.now() };

        if (!prevS) {
            next.s = sigs;
            next.st = [];
        } else if (prev.i === next.i) {
            next.s = complete ? sigs : union(sigs, prevS, WARM_MAX_READS);
            next.st = complete ? intersect(prevSt, sigs) : prevSt;
        } else {
            var learned = union(prevSt, intersect(sigs, prevS), WARM_MAX_READS);
            next.s = sigs;
            next.st = complete ? intersect(learned, sigs) : learned;
        }
        all[warm.page.key] = next;
        warmStoreWrite(all);
    }

    /* --- starting reads early --------------------------------------------- */

    function warmDb() {
        try {
            var fb = window.firebase;
            if (fb && fb.apps && fb.apps.length && typeof fb.firestore === 'function') {
                return fb.firestore();
            }
        } catch (e) { /* not initialised yet */ }
        return null;
    }

    function startRead(db, read) {
        var parts = read.path.split('/');
        if (read.kind === 'd') {
            if (parts.length < 2 || parts.length % 2 !== 0) return null;
            return db.collection(parts.slice(0, -1).join('/')).doc(parts[parts.length - 1]).get();
        }
        if (parts.length % 2 !== 1) return null;
        var q = db.collection(read.path);
        for (var i = 0; i < read.ops.length; i++) {
            var step = read.ops[i];
            if (step[0] === 'w') q = q.where(step[1], step[2], step[3]);
            else if (step[0] === 'o') q = q.orderBy(step[1], step[2]);
            else if (step[0] === 'l') q = q.limit(step[1]);
            else if (step[0] === 'L') q = q.limitToLast(step[1]);
            else return null;
        }
        return q.get();
    }

    function warmReplay(db) {
        var record = warmStoreRead()[warm.page.key];
        if (!record || !Array.isArray(record.s)) return;
        var sigs = record.i === warm.page.idSig
            ? union(record.s, record.st)
            : (Array.isArray(record.st) ? record.st : []);
        warm.replaying = true;
        try {
            sigs.slice(0, WARM_MAX_READS).forEach(function (sig) {
                var read = readOfSignature(sig, warm.page.ids);
                if (!read) return;
                try {
                    var pending = startRead(db, read);
                    if (pending && typeof pending.then === 'function') {
                        pending.then(null, function () { /* the view's own read reports it */ });
                    }
                } catch (e) { /* a read that can no longer be built is not started */ }
            });
        } finally {
            warm.replaying = false;
        }
    }

    function warmStop(reason) {
        if (!warm.open) return;
        warm.open = false;
        warm.stats.closedBy = reason || '';
        warm.memo = {};
        if (warm.timer) {
            try { window.clearTimeout(warm.timer); } catch (e) { /* already gone */ }
            warm.timer = null;
        }
        warmSave();
    }

    function warmStart() {
        if (warm.started) return;
        warm.started = true;
        if (warmSwitchedOff()) return;
        warm.page = describePage();
        warm.open = true;
        warm.lastReadAt = Date.now();

        try {
            var doc = window.document;
            if (doc && typeof doc.addEventListener === 'function') {
                // Real input only: a view that clicks its own first tab on load
                // produces an untrusted event and does not end the window.
                var onInput = function (ev) { if (ev && ev.isTrusted) warmStop('input'); };
                doc.addEventListener('click', onInput, true);
                doc.addEventListener('keydown', onInput, true);
                doc.addEventListener('visibilitychange', function () {
                    if (doc.visibilityState === 'hidden') warmStop('hidden');
                });
            }
            if (typeof window.addEventListener === 'function') {
                window.addEventListener('pagehide', function () { warmStop('hidden'); });
            }
        } catch (e) { /* no DOM events here: the timer still closes the window */ }
        try {
            warm.timer = window.setTimeout(function () { warmStop('time'); }, WARM_WINDOW_MS);
        } catch (e) { /* no timers: input, writes and pagehide still close it */ }

        var db = warmDb();
        if (db) { warmReplay(db); return; }
        var tries = 0;
        var poll = window.setInterval(function () {
            var ready = warm.open ? warmDb() : null;
            if (ready) warmReplay(ready);
            if (ready || !warm.open || ++tries > 300) window.clearInterval(poll);
        }, 10);
    }

    function warmStats() {
        return {
            open: warm.open,
            shared: warm.stats.shared,
            started: warm.stats.started,
            closedBy: warm.stats.closedBy,
            remembered: warm.seen.length,
            page: warm.page ? warm.page.key : null
        };
    }

    /* ---------------------------------------------------------------------
     * The patch
     * ------------------------------------------------------------------- */

    var inFlight = {};     // path -> Promise, so concurrent reads share one trip
    var installed = false;
    var enabled = !isEditorPage();

    function pathOf(ref) {
        try {
            if (ref && ref.path) return ref.path;
            if (ref && ref._delegate && ref._delegate.path) return ref._delegate.path;
        } catch (e) { /* fall through */ }
        return null;
    }

    function install() {
        if (installed) return true;
        var api = fsTypes();
        if (!api || !api.DocumentReference || !api.DocumentReference.prototype) return false;
        var proto = api.DocumentReference.prototype;
        if (proto.__panelSpeedPatched) { installed = true; return true; }
        if (typeof proto.get !== 'function') return false;

        var originalGet = proto.get;
        proto.get = function (options) {
            var ref = this;
            var path = pathOf(ref);

            // An explicit source (`{source: 'server'}`) is a deliberate request
            // for a fresh read; never answer it from a cache.
            if (!path || (options && options.source)) {
                return originalGet.apply(this, arguments);
            }

            if (enabled && isConfigPath(path)) {
                var box = readStore(path);
                if (box) return Promise.resolve(cachedSnapshot(ref, path, box));
            }

            // While the page is loading, a document it has already read is
            // answered with that same read (FsWarm).
            var warmKey = warmDocKey(path);
            if (warmKey) {
                noteRead(warmKey);
                if (Object.prototype.hasOwnProperty.call(warm.memo, warmKey)) return shareHit(warmKey);
            }

            // De-duplicate concurrent reads of the same document, whether or not
            // it is cacheable. Two callers asking at the same time is one trip.
            if (Object.prototype.hasOwnProperty.call(inFlight, path)) {
                return inFlight[path];
            }

            var pending = originalGet.call(this, options).then(function (snap) {
                delete inFlight[path];
                if (enabled && isConfigPath(path)) {
                    try {
                        writeStore(path, snap && snap.exists ? snap.data() : null);
                    } catch (e) { /* an uncacheable document is still a good answer */ }
                }
                return snap;
            }, function (err) {
                delete inFlight[path];
                throw err;
            });
            inFlight[path] = pending;
            if (warmKey) rememberRead(warmKey, pending);
            else trackRead(pending);
            return pending;
        };

        // A write to a configuration document must not leave a stale copy of it
        // behind for the rest of the session.
        ['set', 'update', 'delete'].forEach(function (m) {
            if (typeof proto[m] !== 'function') return;
            var original = proto[m];
            proto[m] = function () {
                warmStop('write');
                var path = pathOf(this);
                if (path) { dropStore(path); delete inFlight[path]; }
                return original.apply(this, arguments);
            };
        });

        installWarm(api);

        proto.__panelSpeedPatched = true;
        installed = true;
        warmStart();
        return true;
    }

    // The compat namespace is not reliably populated at the moment a <script>
    // in the layout runs, so keep trying briefly rather than installing nothing.
    // (Same lesson as firestore-datatable.js: `firebase.firestore.Firestore` is
    // often still undefined when the layout's inline scripts execute.)
    if (!install()) {
        var tries = 0;
        var timer = window.setInterval(function () {
            if (install() || ++tries > 600) window.clearInterval(timer);
        }, 10);
    }

    if (!enabled) dropAll();

    /* ---------------------------------------------------------------------
     * FsBatch - many ids, few round trips
     * ------------------------------------------------------------------- */

    var batchMemo = {};    // "collection/id" -> Promise<data|null>

    /**
     * Fetch many documents of one collection by id.
     *
     * Firestore has no multi-get in the web SDK, but it does have
     * `where(documentId(), 'in', [...])`, which takes ten ids at a time. Twenty
     * five rows therefore cost three round trips instead of twenty five - and
     * ids already seen on this page cost none.
     *
     * Resolves to a plain object of id -> document data. An id that does not
     * exist is simply absent, exactly as a per-id `.get()` would leave it.
     * Any failure falls back to individual reads, so the answer is never worse
     * than the code this replaces.
     */
    function batchDocs(db, collection, ids) {
        var api = fsTypes();
        var unique = [];
        var seen = {};
        (ids || []).forEach(function (id) {
            if (id === null || id === undefined || id === '') return;
            id = String(id);
            if (seen[id]) return;
            seen[id] = true;
            unique.push(id);
        });
        if (!unique.length) return Promise.resolve({});

        var out = {};
        var wanted = [];
        unique.forEach(function (id) {
            var memoKey = collection + '/' + id;
            if (Object.prototype.hasOwnProperty.call(batchMemo, memoKey)) {
                out[id] = batchMemo[memoKey];
            } else {
                wanted.push(id);
            }
        });

        function readOneByOne(list) {
            return Promise.all(list.map(function (id) {
                var p = db.collection(collection).doc(id).get().then(function (snap) {
                    return snap && snap.exists ? snap.data() : null;
                });
                batchMemo[collection + '/' + id] = p;
                return p.then(function (data) { out[id] = data; });
            }));
        }

        var work;
        if (!api || !api.FieldPath || typeof api.FieldPath.documentId !== 'function') {
            work = readOneByOne(wanted);
        } else {
            var chunks = [];
            for (var i = 0; i < wanted.length; i += IN_CHUNK) {
                chunks.push(wanted.slice(i, i + IN_CHUNK));
            }
            work = Promise.all(chunks.map(function (chunk) {
                return db.collection(collection)
                    .where(api.FieldPath.documentId(), 'in', chunk)
                    .get()
                    .then(function (snap) {
                        var found = {};
                        snap.docs.forEach(function (doc) { found[doc.id] = doc.data(); });
                        chunk.forEach(function (id) {
                            var data = Object.prototype.hasOwnProperty.call(found, id) ? found[id] : null;
                            out[id] = data;
                            batchMemo[collection + '/' + id] = Promise.resolve(data);
                        });
                    });
            })).catch(function () {
                // An `in` query can be refused (an index, a rules change, an SDK
                // that counts differently). Individual reads always work.
                return readOneByOne(wanted);
            });
        }

        return Promise.resolve(work).then(function () {
            var resolved = {};
            var keys = Object.keys(out);
            return Promise.all(keys.map(function (id) {
                return Promise.resolve(out[id]).then(function (v) { resolved[id] = v; });
            })).then(function () { return resolved; });
        });
    }

    /* ---------------------------------------------------------------------
     * FsLib - load a library the first time it is really needed
     * ------------------------------------------------------------------- */

    var LIBS = {
        xlsx: { test: function () { return !!window.XLSX; }, url: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.17.1/xlsx.full.min.js' },
        jszip: { test: function () { return !!window.JSZip; }, url: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.3/jszip.min.js' },
        jspdf: { test: function () { return !!(window.jspdf && window.jspdf.jsPDF); }, url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js' },
        jspdfautotable: { test: function () { return !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable); }, url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.24/jspdf.plugin.autotable.min.js', after: 'jspdf' }
    };
    var libPromises = {};

    function loadScript(url) {
        return new Promise(function (resolve, reject) {
            var el = document.createElement('script');
            el.src = url;
            el.async = false;
            el.onload = function () { resolve(); };
            el.onerror = function () { reject(new Error('failed to load ' + url)); };
            document.head.appendChild(el);
        });
    }

    function lib(name) {
        var spec = LIBS[name];
        if (!spec) return Promise.reject(new Error('unknown library ' + name));
        if (spec.test()) return Promise.resolve();
        if (libPromises[name]) return libPromises[name];
        var chain = spec.after ? lib(spec.after) : Promise.resolve();
        libPromises[name] = chain.then(function () {
            return spec.test() ? undefined : loadScript(spec.url);
        }).catch(function (err) {
            delete libPromises[name];          // let a later click try again
            throw err;
        });
        return libPromises[name];
    }

    /* ---------------------------------------------------------------------
     * FsUpload - photos sent at a sensible size, and cached once stored
     *
     * WHAT WAS SLOW
     *
     *   The panel uploads whatever the camera produced. Item photos in the
     *   bucket today are 0.7-1.4 MB each and are shown at 50-150 px. From a
     *   phone on mobile data the upload is most of the wait - the client
     *   reports that saving with an image takes about twice as long as
     *   without - and every page that shows the image downloads it in full.
     *
     *   The layout gives uploads a 30-day cache lifetime by patching put().
     *   But 62 views upload with putString(), and firebase-storage-compat
     *   9.23.0's putString() builds its own upload task instead of calling
     *   put() - so every image uploaded that way was still stored with
     *   `cache-control: private, max-age=0`, and every page that shows it
     *   asks Storage for it again.
     *
     * WHAT THIS DOES
     *
     *   - A JPEG, PNG or WebP larger than UPLOAD_MAX_EDGE px on its long side is
     *     scaled down to that before it is sent. A JPEG or WebP over
     *     UPLOAD_REENCODE_BYTES is re-compressed at UPLOAD_QUALITY even when
     *     it is not oversized. Format, file name, path and metadata stay the
     *     same, and the smaller file is used only when it is at least 10%
     *     smaller. (Re-encoding applies the camera's rotation and drops its
     *     EXIF block, GPS position included.)
     *   - An image uploaded with putString() gets the cache lifetime put()
     *     already gets (UPLOAD_CACHE_CONTROL, the layout's value), unless the
     *     view set one itself.
     *   - Everything else uploads exactly as before: files that are not
     *     images, GIF/SVG, images under UPLOAD_MIN_BYTES, browsers without
     *     createImageBitmap, and any photo that fails to decode or takes
     *     longer than UPLOAD_SHRINK_TIMEOUT_MS to resize.
     *
     *   The view still gets an upload task back: `await`, `.then()`,
     *   `.on('state_changed', ...)`, `.snapshot` in the completion callback
     *   and `.cancel()` behave as before. The real upload starts once the
     *   photo has been resized.
     *
     *   Resizing can be switched off in one browser:
     *   localStorage.setItem('fs:shrink:off', '1')
     * ------------------------------------------------------------------- */

    /** Longest side, in px, of a photo as it is uploaded. */
    var UPLOAD_MAX_EDGE = 1920;

    /** JPEG/WebP quality used when a photo is re-encoded. */
    var UPLOAD_QUALITY = 0.85;

    /** Images smaller than this are sent as they are. */
    var UPLOAD_MIN_BYTES = 300 * 1024;

    /** A JPEG/WebP this large is re-compressed even when it is not oversized. */
    var UPLOAD_REENCODE_BYTES = 900 * 1024;

    /** Past this, the original is sent rather than keep the admin waiting. */
    var UPLOAD_SHRINK_TIMEOUT_MS = 8000;

    /** The value layouts/app.blade.php already gives put(). */
    var UPLOAD_CACHE_CONTROL = 'public, max-age=2592000';

    var UPLOAD_OFF_KEY = 'fs:shrink:off';

    function shrinkSwitchedOff() {
        try { return window.localStorage.getItem(UPLOAD_OFF_KEY) === '1'; } catch (e) { return false; }
    }

    function canResize() {
        return typeof window.createImageBitmap === 'function' && typeof window.Blob === 'function';
    }

    function isRootRef(ref) {
        try { return !ref || !ref.fullPath; } catch (e) { return true; }
    }

    /** 'image/jpeg' | 'image/png' | 'image/webp' from the first 12 bytes, else null. */
    function sniffImage(b) {
        if (!b || b.length < 12) return null;
        if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg';
        if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
        if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
            b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
        return null;
    }

    function base64Bytes(text) {
        var bin = window.atob(text);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    }

    /**
     * An image handed to putString() as 'base64' or 'data_url', or null for
     * anything else (another format, not base64, not a JPEG/PNG/WebP).
     */
    function parseImageString(value, format) {
        if (typeof value !== 'string' || typeof window.atob !== 'function') return null;
        var body;
        var declared = '';
        if (format === 'base64') {
            body = value;
        } else if (format === 'data_url') {
            var m = /^data:([^,]*);base64,/i.exec(value);
            if (!m) return null;
            declared = m[1];
            body = value.slice(m[0].length);
        } else {
            return null;
        }
        var type;
        try { type = sniffImage(base64Bytes(body.slice(0, 16))); } catch (e) { return null; }
        if (!type) return null;
        return {
            type: type,
            declared: declared,
            bytes: Math.floor(body.length * 3 / 4),
            blob: function () { return new window.Blob([base64Bytes(body)], { type: type }); }
        };
    }

    function withCacheControl(metadata) {
        var out = {};
        if (metadata && typeof metadata === 'object') {
            for (var k in metadata) {
                if (own(metadata, k)) out[k] = metadata[k];
            }
        }
        if (!out.cacheControl) out.cacheControl = UPLOAD_CACHE_CONTROL;
        return out;
    }

    function closeBitmap(bitmap) {
        try { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); } catch (e) { /* already closed */ }
    }

    function drawToBlob(bitmap, width, height, type) {
        if (typeof window.OffscreenCanvas === 'function') {
            var off = new window.OffscreenCanvas(width, height);
            var octx = off.getContext('2d');
            octx.imageSmoothingEnabled = true;
            octx.imageSmoothingQuality = 'high';
            octx.drawImage(bitmap, 0, 0, width, height);
            return off.convertToBlob({ type: type, quality: UPLOAD_QUALITY });
        }
        return new Promise(function (resolve) {
            var canvas = window.document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(bitmap, 0, 0, width, height);
            canvas.toBlob(resolve, type, UPLOAD_QUALITY);
        });
    }

    /**
     * A smaller Blob of the same image in the same format, or null when the
     * original should be sent as it is.
     */
    function shrinkImage(blob, type) {
        if (!canResize()) return Promise.resolve(null);
        var decode;
        try {
            decode = window.createImageBitmap(blob, { imageOrientation: 'from-image' });
        } catch (e) {
            decode = Promise.reject(e);
        }
        return Promise.resolve(decode).catch(function () {
            return window.createImageBitmap(blob);
        }).then(function (bitmap) {
            var edge = Math.max(bitmap.width, bitmap.height);
            var scale = edge > UPLOAD_MAX_EDGE ? UPLOAD_MAX_EDGE / edge : 1;
            if (scale === 1 && (type === 'image/png' || blob.size < UPLOAD_REENCODE_BYTES)) {
                closeBitmap(bitmap);
                return null;
            }
            var width = Math.max(1, Math.round(bitmap.width * scale));
            var height = Math.max(1, Math.round(bitmap.height * scale));
            return Promise.resolve(drawToBlob(bitmap, width, height, type)).then(function (out) {
                closeBitmap(bitmap);
                return (out && out.type === type && out.size > 0 && out.size < blob.size * 0.9) ? out : null;
            }, function () {
                closeBitmap(bitmap);
                return null;
            });
        }).catch(function () {
            return null;
        });
    }

    function readHead(blob) {
        var head = blob.slice(0, 12);
        if (typeof head.arrayBuffer === 'function') {
            return head.arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
        }
        return new Promise(function (resolve, reject) {
            var reader = new window.FileReader();
            reader.onload = function () { resolve(new Uint8Array(reader.result)); };
            reader.onerror = function () { reject(reader.error); };
            reader.readAsArrayBuffer(head);
        });
    }

    function withTimeout(work, ms) {
        return new Promise(function (resolve) {
            var settled = false;
            var timer = window.setTimeout(function () {
                if (!settled) { settled = true; resolve(null); }
            }, ms);
            Promise.resolve(work).then(function (value) {
                if (!settled) { settled = true; window.clearTimeout(timer); resolve(value); }
            }, function () {
                if (!settled) { settled = true; window.clearTimeout(timer); resolve(null); }
            });
        });
    }

    /** The smaller version of an image Blob, or null to send the original. */
    function smallerImage(blob, knownType) {
        var work;
        try {
            work = (knownType ? Promise.resolve(knownType) : readHead(blob).then(sniffImage))
                .then(function (type) { return type ? shrinkImage(blob, type) : null; });
        } catch (e) {
            work = Promise.resolve(null);
        }
        return withTimeout(work, UPLOAD_SHRINK_TIMEOUT_MS);
    }

    /**
     * An object that behaves like the UploadTask the view asked for, for an
     * upload that starts once `start` - a Promise of { task: UploadTask } -
     * resolves.
     */
    function laterTask(start) {
        var real = null;
        var wantCancel = false;
        // The task stays boxed all the way from where it is created: an
        // UploadTask is thenable, so a promise resolved with the bare task
        // adopts it and hands on the finished snapshot instead of the task.
        var ready = Promise.resolve(start).then(function (box) {
            real = box.task;
            if (wantCancel && real && typeof real.cancel === 'function') real.cancel();
            return box;
        });
        var shown = {
            on: function (event, next, error, complete) {
                if (arguments.length < 2) {
                    return function (n, e, c) { return shown.on(event, n, e, c); };
                }
                var off = null;
                var stopped = false;
                ready.then(function (box) {
                    if (!stopped) off = box.task.on(event, next, error, complete);
                }, function (err) {
                    var onError = (next && typeof next === 'object') ? next.error : error;
                    if (typeof onError === 'function') onError(err);
                });
                return function () {
                    stopped = true;
                    if (typeof off === 'function') off();
                };
            },
            then: function (onDone, onFail) {
                return ready.then(function (box) { return box.task; }).then(onDone, onFail);
            },
            'catch': function (onFail) {
                return shown.then(undefined, onFail);
            },
            cancel: function () {
                if (real) return real.cancel();
                wantCancel = true;
                return true;
            },
            pause: function () { return real ? real.pause() : false; },
            resume: function () { return real ? real.resume() : false; }
        };
        try {
            Object.defineProperty(shown, 'snapshot', {
                enumerable: true,
                get: function () { return real ? real.snapshot : undefined; }
            });
        } catch (e) { /* no accessors: views read .snapshot only once the upload is done */ }
        return shown;
    }

    var uploadsInstalled = false;

    function installUploads() {
        if (uploadsInstalled) return true;
        var storage = window.firebase && window.firebase.storage;
        var proto = storage && storage.Reference && storage.Reference.prototype;
        if (!proto || typeof proto.put !== 'function' || typeof proto.putString !== 'function') return false;
        if (proto.__panelSpeedUploads) { uploadsInstalled = true; return true; }

        var originalPut = proto.put;
        var originalPutString = proto.putString;

        proto.put = function (data, metadata) {
            var ref = this;
            var args = arguments;
            if (shrinkSwitchedOff() || !canResize() || isRootRef(ref) ||
                !(data instanceof window.Blob) || data.size < UPLOAD_MIN_BYTES ||
                (data.type && !/^image\//i.test(data.type))) {
                return originalPut.apply(ref, args);
            }
            return laterTask(smallerImage(data).then(function (smaller) {
                return { task: smaller ? originalPut.call(ref, smaller, metadata) : originalPut.apply(ref, args) };
            }));
        };

        proto.putString = function (value, format, metadata) {
            var ref = this;
            var args = arguments;
            var image = null;
            try {
                image = isRootRef(ref) ? null : parseImageString(value, format);
            } catch (e) {
                image = null;
            }
            if (!image) return originalPutString.apply(ref, args);     // not an image: exactly as before

            var meta = withCacheControl(metadata);
            if (image.bytes < UPLOAD_MIN_BYTES || shrinkSwitchedOff() || !canResize()) {
                return originalPutString.call(ref, value, format, meta);
            }
            var blob;
            try {
                blob = image.blob();
            } catch (e) {
                return originalPutString.call(ref, value, format, meta);
            }
            return laterTask(smallerImage(blob, image.type).then(function (smaller) {
                if (!smaller) return { task: originalPutString.call(ref, value, format, meta) };
                if (!meta.contentType) {
                    // putString() would have stored the data URL's own type, or
                    // none at all for raw base64 - keep it that way.
                    if (image.declared) meta.contentType = image.declared;
                    else smaller = new window.Blob([smaller], { type: '' });
                }
                return { task: originalPut.call(ref, smaller, meta) };
            }));
        };

        proto.__panelSpeedUploads = true;
        uploadsInstalled = true;
        return true;
    }

    window.PanelSpeed = {
        /** True when configuration reads are being served from the cache. */
        enabled: function () { return enabled && installed; },
        /** Forget one cached document (path form: "settings/globalSettings"). */
        invalidate: function (path) { dropStore(path); delete inFlight[path]; },
        /** Forget everything cached. */
        clear: function () { dropAll(); batchMemo = {}; },
        /** Many ids of one collection, in one round trip per ten. */
        docs: function (db, collection, ids) { return batchDocs(db, collection, ids); },
        /** Load an export library on demand: PanelSpeed.lib('xlsx'). */
        lib: lib,
        /** Page-load read sharing (FsWarm): stats(), stop(), forget(). */
        warm: {
            stats: warmStats,
            stop: function () { warmStop('api'); },
            forget: warmForget
        },
        /** Exposed for the unit tests. */
        _internals: {
            encode: encode, decode: decode, isConfigPath: isConfigPath,
            CONFIG_TTL_MS: CONFIG_TTL_MS, IN_CHUNK: IN_CHUNK, install: install,
            looksLikeId: looksLikeId, describePage: describePage,
            signatureOf: signatureOf, readOfSignature: readOfSignature,
            WARM_WINDOW_MS: WARM_WINDOW_MS, WARM_QUIET_MS: WARM_QUIET_MS,
            WARM_MAX_DOCS: WARM_MAX_DOCS, WARM_STORE_KEY: WARM_STORE_KEY,
            sniffImage: sniffImage, parseImageString: parseImageString,
            shrinkImage: shrinkImage, laterTask: laterTask, installUploads: installUploads,
            UPLOAD_MAX_EDGE: UPLOAD_MAX_EDGE, UPLOAD_MIN_BYTES: UPLOAD_MIN_BYTES,
            UPLOAD_REENCODE_BYTES: UPLOAD_REENCODE_BYTES, UPLOAD_CACHE_CONTROL: UPLOAD_CACHE_CONTROL
        }
    };

    // firebase-storage-compat loads before this file, so this normally
    // installs at once; keep trying briefly in case it has not.
    if (!installUploads()) {
        var uploadTries = 0;
        var uploadTimer = window.setInterval(function () {
            if (installUploads() || ++uploadTries > 600) window.clearInterval(uploadTimer);
        }, 10);
    }
})(window);
