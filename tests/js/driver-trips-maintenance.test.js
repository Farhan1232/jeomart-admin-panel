/*
 * Tests for storage/app/firebase/driverTripsMaintenance.js
 *
 * Run with:  node tests/js/driver-trips-maintenance.test.js
 *
 * An in-memory Firestore stands in for the Admin SDK so both sweeps - trip
 * expiry and My Trips grant expiry - can be exercised without a Firebase
 * project. The script's Firebase connection is lazy precisely so this file can
 * require it and inject the fake.
 */
'use strict';

const path = require('path');
const sweep = require(path.join(__dirname, '..', '..', 'storage', 'app', 'firebase', 'driverTripsMaintenance.js'));
const { F, S, ACCESS } = sweep;

// ---------------------------------------------------------------------------
// Fake Firestore
// ---------------------------------------------------------------------------
class FakeTimestamp {
    constructor(ms) { this.ms = ms; }
    toMillis() { return this.ms; }
    toDate() { return new Date(this.ms); }
    static now() { return new FakeTimestamp(Date.now()); }
    static fromMillis(ms) { return new FakeTimestamp(ms); }
}

class FakeQuery {
    constructor(store, prefix, filters) {
        this.store = store;
        this.prefix = prefix;
        this.filters = filters || [];
    }
    where(field, op, value) {
        return new FakeQuery(this.store, this.prefix, this.filters.concat([{ field, op, value }]));
    }
    async get() {
        this.store.reads++;
        const docs = [];
        for (const [pathKey, data] of Object.entries(this.store.docs)) {
            if (!pathKey.startsWith(this.prefix + '/')) continue;
            // direct children only
            if (pathKey.slice(this.prefix.length + 1).includes('/')) continue;
            if (!this.filters.every((f) => matches(data, f))) continue;
            docs.push(this.store._doc(pathKey, data));
        }
        return { empty: docs.length === 0, docs };
    }
}

/** Supports the dotted field paths the grant sweep queries with. */
function readPath(data, field) {
    return field.split('.').reduce((acc, key) => (acc === undefined || acc === null ? undefined : acc[key]), data);
}

function matches(data, f) {
    const value = readPath(data, f.field);
    if (f.op === '==') return value === f.value;
    throw new Error('unsupported operator in fake: ' + f.op);
}

class FakeStore {
    constructor(docs) {
        this.docs = Object.assign({}, docs);
        this.reads = 0;
        this.writes = [];
    }
    collection(name) { return this._collection(name); }
    doc(pathKey) { return this._ref(pathKey); }
    _collection(prefix) {
        const store = this;
        const q = new FakeQuery(store, prefix, []);
        q.doc = (id) => store._ref(prefix + '/' + id);
        return q;
    }
    _ref(pathKey) {
        const store = this;
        return {
            id: pathKey.split('/').pop(),
            path: pathKey,
            async get() {
                store.reads++;
                return store._doc(pathKey, store.docs[pathKey]);
            },
            async update(patch) {
                store.writes.push({ path: pathKey, patch });
                const target = Object.assign({}, store.docs[pathKey] || {});
                // Firestore's update() understands dotted field paths and
                // leaves every sibling field alone. The fake has to do the same
                // or the "nothing else on the driver is touched" test proves
                // nothing.
                for (const [key, value] of Object.entries(patch)) {
                    if (!key.includes('.')) {
                        target[key] = value;
                        continue;
                    }
                    const parts = key.split('.');
                    let cursor = target;
                    for (let i = 0; i < parts.length - 1; i++) {
                        cursor[parts[i]] = Object.assign({}, cursor[parts[i]] || {});
                        cursor = cursor[parts[i]];
                    }
                    cursor[parts[parts.length - 1]] = value;
                }
                store.docs[pathKey] = target;
            },
            async set(data) {
                store.writes.push({ path: pathKey, patch: data });
                store.docs[pathKey] = Object.assign({}, store.docs[pathKey] || {}, data);
            },
            collection(sub) { return store._collection(pathKey + '/' + sub); },
        };
    }
    _doc(pathKey, data) {
        const store = this;
        return {
            id: pathKey.split('/').pop(),
            exists: data !== undefined,
            data: () => data,
            ref: store._ref(pathKey),
        };
    }
}

const fakeAdmin = {
    firestore: { Timestamp: FakeTimestamp },
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const NOW = Date.UTC(2026, 8, 5, 10, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function trip(overrides) {
    return Object.assign({
        id: 'trip1',
        driverId: 'driver1',
        sectionId: 'sec-cab',
        status: S.active,
        fromAddress: 'Karachi',
        toAddress: 'Hyderabad',
        tripDateTime: FakeTimestamp.fromMillis(NOW + 6 * HOUR),
        fullVehiclePrice: 4500,
        createdAt: FakeTimestamp.fromMillis(NOW - HOUR),
        visibilityExpiresAt: FakeTimestamp.fromMillis(NOW + 23 * HOUR),
        visibilityHours: 24,
    }, overrides || {});
}

function driverWithGrant(id, overrides) {
    return Object.assign({
        id,
        role: 'driver',
        wallet_amount: 500,
        isActive: true,
        inProgressOrderID: [],
        [ACCESS]: Object.assign({
            granted: true,
            durationDays: 7,
            grantedAt: FakeTimestamp.fromMillis(NOW - 2 * DAY),
            expiresAt: FakeTimestamp.fromMillis(NOW + 5 * DAY),
            revokedAt: null,
            grantedBy: 'admin1',
        }, (overrides || {}).access || {}),
    }, overrides && overrides.user ? overrides.user : {});
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function eq(label, actual, expected) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a === b) { passed++; console.log('  ok   ' + label); }
    else { failed++; console.log('  FAIL ' + label + '\n       expected ' + b + '\n       actual   ' + a); }
}

function use(docs) {
    const store = new FakeStore(docs);
    sweep.__setBackends(store, fakeAdmin);
    return store;
}

// ---------------------------------------------------------------------------
async function run() {
    console.log('\ndriverTripsMaintenance');

    // ── isTripOver ─────────────────────────────────────────────────────────
    console.log('\n a trip stops being shown for one of two reasons');
    {
        eq('inside its window and before departure: still shown',
            sweep.isTripOver(trip(), NOW), false);

        eq('past the visibility window: over',
            sweep.isTripOver(trip({ visibilityExpiresAt: FakeTimestamp.fromMillis(NOW - 1) }), NOW), true);

        eq('exactly at the visibility window: over',
            sweep.isTripOver(trip({ visibilityExpiresAt: FakeTimestamp.fromMillis(NOW) }), NOW), true);

        eq('departure has passed, window still open: over',
            sweep.isTripOver(trip({
                tripDateTime: FakeTimestamp.fromMillis(NOW - 1),
                visibilityExpiresAt: FakeTimestamp.fromMillis(NOW + 12 * HOUR),
            }), NOW), true);

        eq('no timestamps at all: left alone rather than guessed at',
            sweep.isTripOver({ status: S.active }, NOW), false);
    }

    // ── expireTrips ────────────────────────────────────────────────────────
    console.log('\n expiring trips');
    {
        const store = use({
            'driver_trips/t1': trip({ id: 't1' }),
            'driver_trips/t2': trip({ id: 't2', visibilityExpiresAt: FakeTimestamp.fromMillis(NOW - 1) }),
            'driver_trips/t3': trip({ id: 't3', tripDateTime: FakeTimestamp.fromMillis(NOW - HOUR) }),
        });
        const count = await sweep.expireTrips(NOW);
        eq('two of three trips expire', count, 2);
        eq('the live trip is untouched', store.docs['driver_trips/t1'].status, S.active);
        eq('the out-of-window trip is expired', store.docs['driver_trips/t2'].status, S.expired);
        eq('the departed trip is expired', store.docs['driver_trips/t3'].status, S.expired);
        eq('expiry is stamped', typeof store.docs['driver_trips/t2'][F.expiredAt].toMillis, 'function');
        eq('only the expired trips were written', store.writes.length, 2);
    }

    {
        const store = use({
            'driver_trips/booked': trip({ id: 'booked', status: S.booked, visibilityExpiresAt: FakeTimestamp.fromMillis(NOW - 1) }),
            'driver_trips/cancelled': trip({ id: 'cancelled', status: S.cancelled, visibilityExpiresAt: FakeTimestamp.fromMillis(NOW - 1) }),
            'driver_trips/expired': trip({ id: 'expired', status: S.expired, visibilityExpiresAt: FakeTimestamp.fromMillis(NOW - 1) }),
        });
        const count = await sweep.expireTrips(NOW);
        eq('a booked trip is never expired out from under the customer', count, 0);
        eq('nothing was written', store.writes.length, 0);
        eq('the booking survives', store.docs['driver_trips/booked'].status, S.booked);
    }

    {
        const store = use({});
        eq('an empty collection costs one query and no writes', await sweep.expireTrips(NOW), 0);
        eq('and writes nothing', store.writes.length, 0);
    }

    // ── expireDriverAccess ─────────────────────────────────────────────────
    console.log('\n expiring My Trips grants');
    {
        const store = use({
            'users/d1': driverWithGrant('d1'),
            'users/d2': driverWithGrant('d2', { access: { expiresAt: FakeTimestamp.fromMillis(NOW - 1) } }),
            'users/d3': driverWithGrant('d3', { access: { expiresAt: FakeTimestamp.fromMillis(NOW) } }),
        });
        const count = await sweep.expireDriverAccess(NOW);
        eq('two grants are closed', count, 2);
        eq('the live grant is untouched', store.docs['users/d1'][ACCESS].granted, true);
        eq('the lapsed grant is switched off', store.docs['users/d2'][ACCESS].granted, false);
        eq('a grant expiring exactly now is switched off', store.docs['users/d3'][ACCESS].granted, false);
        eq('when it lapsed is recorded', typeof store.docs['users/d2'][ACCESS].expiredAt.toMillis, 'function');
    }

    {
        const store = use({
            'users/d1': driverWithGrant('d1', { access: { expiresAt: FakeTimestamp.fromMillis(NOW - 1) } }),
        });
        await sweep.expireDriverAccess(NOW);
        const after = store.docs['users/d1'];
        eq('the wallet is not touched', after.wallet_amount, 500);
        eq('the online flag is not touched', after.isActive, true);
        eq('the order state is not touched', after.inProgressOrderID, []);
        eq('the rest of the grant is preserved', after[ACCESS].durationDays, 7);
        eq('only the two grant fields were written',
            Object.keys(store.writes[0].patch).sort(),
            ['myTripsAccess.expiredAt', 'myTripsAccess.granted']);
    }

    {
        const store = use({
            'users/d1': driverWithGrant('d1', { access: { granted: false, revokedAt: FakeTimestamp.fromMillis(NOW - HOUR) } }),
        });
        eq('an already-revoked grant is not in the query at all', await sweep.expireDriverAccess(NOW), 0);
        eq('and nothing is written', store.writes.length, 0);
    }

    {
        const store = use({
            'users/d1': driverWithGrant('d1', { access: { expiresAt: null } }),
        });
        eq('a grant with no end instant is left alone for the apps to refuse',
            await sweep.expireDriverAccess(NOW), 0);
        eq('and nothing is written', store.writes.length, 0);
    }

    {
        const store = use({
            'users/customer': { id: 'customer', role: 'customer' },
            'users/plain-driver': { id: 'plain-driver', role: 'driver' },
        });
        eq('drivers without a grant are never read into the sweep', await sweep.expireDriverAccess(NOW), 0);
        eq('and nothing is written', store.writes.length, 0);
    }

    // ── the whole run ──────────────────────────────────────────────────────
    console.log('\n a full run');
    {
        // driverTripsMaintenance() takes no clock - it reads the machine's -
        // so this fixture is anchored to the real now rather than to NOW.
        const realNow = Date.now();
        const store = use({
            'driver_trips/t1': trip({
                id: 't1',
                tripDateTime: FakeTimestamp.fromMillis(realNow + 6 * HOUR),
                visibilityExpiresAt: FakeTimestamp.fromMillis(realNow + 23 * HOUR),
            }),
            'driver_trips/t2': trip({
                id: 't2',
                tripDateTime: FakeTimestamp.fromMillis(realNow + 6 * HOUR),
                visibilityExpiresAt: FakeTimestamp.fromMillis(realNow - HOUR),
            }),
            'users/d1': driverWithGrant('d1', { access: { expiresAt: FakeTimestamp.fromMillis(realNow + 5 * DAY) } }),
            'users/d2': driverWithGrant('d2', { access: { expiresAt: FakeTimestamp.fromMillis(realNow - HOUR) } }),
        });
        const result = await sweep.driverTripsMaintenance();
        eq('one trip expired', result.expiredTrips, 1);
        eq('one grant closed', result.closedGrants, 1);
        eq('the live trip survives the run', store.docs['driver_trips/t1'].status, S.active);
        eq('the live grant survives the run', store.docs['users/d1'][ACCESS].granted, true);
        eq('no document outside driver_trips and users was written',
            store.writes.every((w) => w.path.startsWith('driver_trips/') || w.path.startsWith('users/')), true);
        eq('exactly two documents were written', store.writes.length, 2);
    }

    // ── millis helper ──────────────────────────────────────────────────────
    console.log('\n timestamp reading');
    {
        eq('a Firestore Timestamp', sweep.millis(FakeTimestamp.fromMillis(123)), 123);
        eq('a Date', sweep.millis(new Date(456)), 456);
        eq('a raw number', sweep.millis(789), 789);
        eq('a seconds-shaped value', sweep.millis({ seconds: 2 }), 2000);
        eq('null', sweep.millis(null), null);
        eq('undefined', sweep.millis(undefined), null);
    }

    console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
    process.exit(failed === 0 ? 0 : 1);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
