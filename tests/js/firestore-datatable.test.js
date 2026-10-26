/*
 * Tests for public/js/firestore-datatable.js
 *
 * Run with:  node tests/js/firestore-datatable.test.js
 *
 * A fake firebase-firestore-compat Query is used so the pagination logic can be
 * exercised without a network or a Firebase project.  The fake counts how many
 * documents each draw actually reads, which is the whole point of the change.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------------------------------------------------------------------------
// Fake Firestore (compat surface: where / orderBy / limit / startAfterDocument
// / get / count)
// ---------------------------------------------------------------------------
const stats = { docsRead: 0, gets: 0, counts: 0 };

function makeDoc(raw) {
    return { id: raw.id, data: () => raw, __raw: raw };
}

class FakeQuery {
    constructor(docs, opts) {
        this._docs = docs;
        this._opts = Object.assign({ filters: [], order: null, limit: null, after: null }, opts);
    }
    _clone(patch) {
        return new FakeQuery(this._docs, Object.assign({}, this._opts, patch));
    }
    where(field, op, value) {
        const filters = this._opts.filters.concat([{ field, op, value }]);
        return this._clone({ filters });
    }
    orderBy(field, dir) {
        return this._clone({ order: { field, dir: dir || 'asc' } });
    }
    limit(n) {
        return this._clone({ limit: n });
    }
    startAfterDocument(doc) {
        return this._clone({ after: doc.id });
    }
    /** Structural equality, like the compat SDK's Query.isEqual(). */
    isEqual(other) {
        if (!(other instanceof FakeQuery)) return false;
        return this._docs === other._docs &&
            JSON.stringify(this._opts.filters) === JSON.stringify(other._opts.filters) &&
            JSON.stringify(this._opts.order) === JSON.stringify(other._opts.order);
    }
    _resolve() {
        let rows = this._docs.slice();
        for (const f of this._opts.filters) {
            rows = rows.filter((r) => {
                if (f.op === '==') return r[f.field] === f.value;
                if (f.op === 'in') return f.value.indexOf(r[f.field]) >= 0;
                return true;
            });
        }
        const order = this._opts.order;
        if (order) {
            const dir = order.dir === 'asc' ? 1 : -1;
            rows.sort((a, b) => (a[order.field] > b[order.field] ? dir : a[order.field] < b[order.field] ? -dir : 0));
        }
        if (this._opts.after) {
            const idx = rows.findIndex((r) => r.id === this._opts.after);
            rows = idx >= 0 ? rows.slice(idx + 1) : rows;
        }
        if (this._opts.limit != null) rows = rows.slice(0, this._opts.limit);
        return rows;
    }
    get() {
        const rows = this._resolve();
        stats.gets += 1;
        stats.docsRead += rows.length;
        const docs = rows.map(makeDoc);
        return Promise.resolve({ docs, size: docs.length, empty: docs.length === 0 });
    }
    count() {
        const self = this;
        return {
            get() {
                stats.counts += 1;
                const total = self._clone({ limit: null, after: null })._resolve().length;
                return Promise.resolve({ data: () => ({ count: total }) });
            }
        };
    }
}

class FakeCollection extends FakeQuery {}

// ---------------------------------------------------------------------------
// Minimal jQuery + firebase stand-ins
// ---------------------------------------------------------------------------
function fakeJQuery() {
    const api = () => api;
    const chain = { show() { return chain; }, hide() { return chain; }, text() { return chain; }, tooltip() { return chain; } };
    const fn = function () { return chain; };
    fn.extend = Object.assign;
    return fn;
}

const sandbox = {
    window: {},
    console,
    Promise,
    Object,
    Array,
    String,
    Number,
    Math,
    JSON,
    // The host's Date, so a test can advance the clock the helper sees.
    Date,
    WeakMap,
    setTimeout,
    jQuery: fakeJQuery(),
    firebase: { firestore: { Query: FakeQuery } }
};
sandbox.window.jQuery = sandbox.jQuery;
sandbox.globalThis = sandbox;

const src = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'firestore-datatable.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const FsDataTable = sandbox.window.FsDataTable;

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function ok(name, condition, detail) {
    if (condition) {
        passed++;
        console.log('  PASS  ' + name);
    } else {
        failed++;
        console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : ''));
    }
}

function eq(name, actual, expected) {
    ok(name, JSON.stringify(actual) === JSON.stringify(expected),
        'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

// 250 rides, newest first when ordered by createdAt desc
const RIDES = [];
for (let i = 0; i < 250; i++) {
    RIDES.push({
        id: 'ride-' + String(i).padStart(3, '0'),
        createdAt: 1000 + i,
        status: i % 3 === 0 ? 'Order Completed' : 'Order Placed',
        userName: 'Customer ' + i
    });
}

function draw(start, length, search, orderDir) {
    return {
        draw: 1,
        start: start,
        length: length,
        search: { value: search || '' },
        order: [{ column: 6, dir: orderDir || 'desc' }]
    };
}

function ridesQuery() {
    return new FakeCollection(RIDES).orderBy('createdAt', 'desc');
}

async function run() {
    console.log('firestore-datatable.js');

    // -- 1. cursor pagination reads only one page -----------------------------
    let ref = ridesQuery();
    stats.docsRead = 0;
    let snap = await FsDataTable.pageQuery(ref, draw(0, 10), { key: 't1', orderField: 'createdAt' });
    eq('page 1 returns 10 docs', snap.docs.length, 10);
    eq('page 1 reads 10 docs', stats.docsRead, 10);
    eq('page 1 offset is 0', FsDataTable.offset('t1'), 0);
    eq('total comes from count()', FsDataTable.total('t1', 10), 250);
    eq('page 1 is the newest ride', snap.docs[0].id, 'ride-249');

    // -- 2. page 2 continues from the cursor, no overlap ----------------------
    stats.docsRead = 0;
    const page1Ids = snap.docs.map((d) => d.id);
    snap = await FsDataTable.pageQuery(ref, draw(10, 10), { key: 't1', orderField: 'createdAt' });
    const page2Ids = snap.docs.map((d) => d.id);
    eq('page 2 reads 10 docs', stats.docsRead, 10);
    ok('page 2 does not repeat page 1', page2Ids.every((id) => page1Ids.indexOf(id) < 0));
    eq('page 2 starts where page 1 ended', page2Ids[0], 'ride-239');

    // -- 3. jumping to a far page walks cursors in strides --------------------
    stats.docsRead = 0;
    stats.gets = 0;
    snap = await FsDataTable.pageQuery(ref, draw(200, 10), { key: 't1', orderField: 'createdAt' });
    eq('far page returns 10 docs', snap.docs.length, 10);
    eq('far page lands on the right row', snap.docs[0].id, 'ride-049');
    ok('far page uses few round-trips', stats.gets <= 3, stats.gets + ' gets');

    // -- 4. going back to a visited page reuses its cursor --------------------
    stats.docsRead = 0;
    snap = await FsDataTable.pageQuery(ref, draw(10, 10), { key: 't1', orderField: 'createdAt' });
    eq('revisited page reads one page', stats.docsRead, 10);
    eq('revisited page is identical', snap.docs.map((d) => d.id), page2Ids);

    // -- 5. last page is short, not wrapped -----------------------------------
    snap = await FsDataTable.pageQuery(ref, draw(240, 10), { key: 't1', orderField: 'createdAt' });
    eq('last page has the final 10 rows', snap.docs.map((d) => d.id).slice(-1)[0], 'ride-000');
    snap = await FsDataTable.pageQuery(ref, draw(250, 10), { key: 't1', orderField: 'createdAt' });
    eq('past the end is empty', snap.docs.length, 0);

    // -- 6. a search falls back to the full (capped) set ----------------------
    stats.docsRead = 0;
    snap = await FsDataTable.pageQuery(ref, draw(0, 10, 'customer 1'), { key: 't2', orderField: 'createdAt' });
    eq('search sees every candidate row', snap.docs.length, 250);
    eq('search offset is the DataTables start', FsDataTable.offset('t2'), 0);
    eq('search total defers to the view count', FsDataTable.total('t2', 111), 111);
    snap = await FsDataTable.pageQuery(ref, draw(20, 10, 'customer 1'), { key: 't2', orderField: 'createdAt' });
    eq('search page 3 keeps its own offset', FsDataTable.offset('t2'), 20);

    // -- 7. sorting by a non-natural column falls back too ---------------------
    snap = await FsDataTable.pageQuery(ref, draw(0, 10, '', 'asc'), { key: 't3', orderField: 'createdAt' });
    eq('reversed sort falls back to full set', snap.docs.length, 250);
    snap = await FsDataTable.pageQuery(ref, draw(0, 10), { key: 't3', orderField: 'userName' });
    eq('sort by a JS-computed column falls back', snap.docs.length, 250);

    // -- 8. a non-orderable column still paginates ----------------------------
    snap = await FsDataTable.pageQuery(ref, draw(0, 10), { key: 't4', orderField: '' });
    eq('unsortable column paginates', snap.docs.length, 10);

    // -- 9. changing the query resets the cursor cache ------------------------
    const filtered = ridesQuery().where('status', '==', 'Order Completed');
    snap = await FsDataTable.pageQuery(filtered, draw(0, 10), { key: 't1', orderField: 'createdAt' });
    eq('filtered page 1 has 10 rows', snap.docs.length, 10);
    eq('filtered total is the filtered count', FsDataTable.total('t1', 10), 84);
    ok('filtered rows all match the filter',
        snap.docs.every((d) => d.data().status === 'Order Completed'));

    // -- 10. a query with no orderBy still paginates by document id -----------
    const unordered = new FakeCollection(RIDES);
    snap = await FsDataTable.pageQuery(unordered, draw(0, 10), { key: 't5', orderField: '' });
    eq('unordered query paginates', snap.docs.length, 10);
    snap = await FsDataTable.pageQuery(unordered, draw(0, 10), { key: 't6', orderField: 'createdAt' });
    eq('unordered query + sort falls back', snap.docs.length, 250);

    // -- 11. "show all" (length -1) returns everything ------------------------
    snap = await FsDataTable.pageQuery(ref, draw(0, -1), { key: 't7', orderField: 'createdAt' });
    eq('length -1 returns the full set', snap.docs.length, 250);

    // -- 12. count() helper ---------------------------------------------------
    const total = await FsDataTable.count(ridesQuery().where('status', '==', 'Order Placed'));
    eq('count() helper matches the data', total, 166);

    // -- 13. total() falls back to the local count when not exact -------------
    eq('total() falls back when unknown', FsDataTable.total('t2', 42), 42);

    // -- 14. a query rebuilt each draw keeps its cursors and its count --------
    // Several views build their query inside the ajax handler, so a new object
    // arrives every draw. Structural equality has to keep the caches alive.
    stats.gets = 0;
    stats.counts = 0;
    await FsDataTable.pageQuery(ridesQuery(), draw(0, 10), { key: 't8', orderField: 'createdAt' });
    const countsAfterFirst = stats.counts;
    stats.docsRead = 0;
    const rebuilt = await FsDataTable.pageQuery(ridesQuery(), draw(10, 10), { key: 't8', orderField: 'createdAt' });
    eq('rebuilt query still pages', rebuilt.docs.length, 10);
    eq('rebuilt query does not restart', rebuilt.docs[0].id, 'ride-239');
    eq('rebuilt query reads one page', stats.docsRead, 10);
    eq('rebuilt query reuses the cached count', stats.counts, countsAfterFirst);

    // -- 15. a genuinely different query does reset the caches ----------------
    const other = ridesQuery().where('status', '==', 'Order Placed');
    const otherPage = await FsDataTable.pageQuery(other, draw(0, 10), { key: 't8', orderField: 'createdAt' });
    eq('a different query starts from page 1', otherPage.docs.length, 10);
    ok('a different query is counted separately', stats.counts > countsAfterFirst);
    eq('a different query has its own total', FsDataTable.total('t8', 10), 166);

    // -- 16. a superseded draw does not leave the wrong offset behind ---------
    // Two draws in flight at once: the second must win, and the first must not
    // overwrite the offset when it finally resolves.
    const slow = new FakeCollection(RIDES).orderBy('createdAt', 'desc');
    const pageA = FsDataTable.pageQuery(slow, draw(0, 10, 'customer'), { key: 't9', orderField: 'createdAt' });
    const pageB = FsDataTable.pageQuery(slow, draw(0, 10), { key: 't9', orderField: 'createdAt' });
    await Promise.all([pageA, pageB]);
    eq('the winning draw owns the offset', FsDataTable.offset('t9'), 0);
    eq('the winning draw owns the total', FsDataTable.total('t9', 1), 250);

    // -- 17. the cached count expires so a delete elsewhere self-corrects ------
    const shrinking = RIDES.slice();
    const shrinkQuery = () => new FakeCollection(shrinking).orderBy('createdAt', 'desc');
    await FsDataTable.pageQuery(shrinkQuery(), draw(0, 10), { key: 't10', orderField: 'createdAt' });
    eq('count starts correct', FsDataTable.total('t10', 10), 250);

    shrinking.splice(0, 5);
    await FsDataTable.pageQuery(shrinkQuery(), draw(0, 10), { key: 't10', orderField: 'createdAt' });
    eq('count is cached briefly', FsDataTable.total('t10', 10), 250);

    const realNow = Date.now;
    Date.now = () => realNow() + 120000;
    try {
        await FsDataTable.pageQuery(shrinkQuery(), draw(0, 10), { key: 't10', orderField: 'createdAt' });
        eq('count refreshes once it expires', FsDataTable.total('t10', 10), 245);
    } finally {
        Date.now = realNow;
    }

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
