/*
 * Tests for storage/app/firebase/cabBiddingDispatch.js
 *
 * Run with:  node tests/js/cab-bidding-dispatch.test.js
 *
 * An in-memory Firestore stands in for the Admin SDK so the dispatch, expiry,
 * minimum-fare and reconciliation passes can be exercised without a Firebase
 * project. The dispatcher's Firebase connection is lazy precisely so this file
 * can require it and inject the fake.
 */
'use strict';

const path = require('path');
const dispatcher = require(path.join(__dirname, '..', '..', 'storage', 'app', 'firebase', 'cabBiddingDispatch.js'));
const { F, S, BID } = dispatcher;

// ---------------------------------------------------------------------------
// Fake Firestore
// ---------------------------------------------------------------------------
class FakeTimestamp {
    constructor(ms) { this.ms = ms; }
    toMillis() { return this.ms; }
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

function matches(data, f) {
    const value = data[f.field];
    if (f.op === '==') return value === f.value;
    if (f.op === 'array-contains') return Array.isArray(value) && value.includes(f.value);
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
                store.docs[pathKey] = Object.assign({}, store.docs[pathKey] || {}, patch);
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

const sent = [];
const fakeAdmin = {
    firestore: { Timestamp: FakeTimestamp },
    messaging: () => ({ send: async (msg) => { sent.push(msg); } }),
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const SECTION = 'sec-cab';
const VEHICLE = 'veh-sedan';

function ride(overrides) {
    return Object.assign({
        id: 'ride1',
        authorID: 'cust1',
        status: 'Order Placed',
        sectionId: SECTION,
        vehicleId: VEHICLE,
        rideType: 'ride',
        distance: '10',
        rejectedByDrivers: [],
        sourceLocation: { latitude: 0, longitude: 0 },
        destinationLocation: { latitude: 0, longitude: 0.05 },
        author: { id: 'cust1', fcmToken: 'cust-token' },
        [F.enabled]: true,
        [F.status]: S.pendingDispatch,
        [F.offeredFare]: 500,
        [F.minimumAllowedFare]: 0,
        biddingDistanceKm: 10,
        [F.eligibleDriverIds]: [],
        [F.winningBidId]: null,
        [F.bidCount]: 0,
    }, overrides || {});
}

function driver(id, overrides) {
    return Object.assign({
        id,
        role: 'driver',
        serviceTypes: ['cab-service'],
        isActive: true,
        sectionIds: [SECTION],
        vehicleDetails: { [SECTION]: { vehicleId: VEHICLE, rideType: 'ride' } },
        wallet_amount: 500,
        location: { latitude: 0, longitude: 0 },
        fcmToken: 'token-' + id,
        inProgressOrderID: [],
        orderRequestData: [],
    }, overrides || {});
}

const CTX = {
    settings: { enabled: true, minimumFarePerKmEnabled: false, minimumFarePerKm: 0 },
    minimumDepositToRideAccept: 100,
    radius: 50,
    maxDrivers: 20,
    expiryMinutes: 5,
};

function ctx(overrides) { return Object.assign({}, CTX, overrides || {}); }

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
    sent.length = 0;
    dispatcher.__setBackends(store, fakeAdmin);
    return store;
}

// ---------------------------------------------------------------------------
async function run() {
    console.log('\ncabBiddingDispatch');

    // ── Eligibility - the same filters cabScheduleRide.js applies ──────────
    console.log('\n eligibility mirrors the existing dispatcher');
    {
        const store = use({
            'users/d1': driver('d1'),
            'users/d2': driver('d2', { sectionIds: ['other-section'] }),
            'users/d3': driver('d3', { vehicleDetails: { [SECTION]: { vehicleId: 'veh-suv', rideType: 'ride' } } }),
            'users/d4': driver('d4', { vehicleDetails: { [SECTION]: { vehicleId: VEHICLE, rideType: 'intercity' } } }),
            'users/d5': driver('d5', { wallet_amount: 10 }),
            'users/d6': driver('d6', { inProgressOrderID: ['other-ride'] }),
            'users/d7': driver('d7', { ordercabRequestData: { id: 'x' } }),
            'users/d8': driver('d8', { location: null }),
            'users/d9': driver('d9', { isActive: false }),
            'users/d10': driver('d10', { location: { latitude: 40, longitude: 40 } }),
        });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx());
        eq('only the fully eligible driver is selected', eligible.map((d) => d.id), ['d1']);
        eq('the driver query is not a full scan per driver', store.reads <= 2, true);
    }
    {
        use({ 'users/d1': driver('d1'), 'users/d2': driver('d2') });
        const eligible = await dispatcher.findEligibleDrivers(ride({ rejectedByDrivers: ['d1'] }), ctx());
        eq('a driver who already rejected this ride is skipped', eligible.map((d) => d.id), ['d2']);
    }
    {
        use({
            'users/near': driver('near', { location: { latitude: 0.01, longitude: 0 } }),
            'users/far': driver('far', { location: { latitude: 0.2, longitude: 0 } }),
        });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx({ maxDrivers: 1 }));
        eq('the fan-out cap keeps the nearest driver', eligible.map((d) => d.id), ['near']);
    }
    {
        use({ 'users/d1': driver('d1'), 'users/d2': driver('d2'), 'users/d3': driver('d3') });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx({ maxDrivers: 2 }));
        eq('the fan-out is capped by maxDriversPerRequest', eligible.length, 2);
    }
    {
        use({ 'users/owned': driver('owned', { wallet_amount: 0, ownerId: 'own1' }), 'users/own1': { id: 'own1', wallet_amount: 900 } });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx());
        eq("an owner's wallet counts for the driver, as it always has", eligible.map((d) => d.id), ['owned']);
    }

    // ── Dispatch ──────────────────────────────────────────────────────────
    console.log('\n dispatch');
    {
        const store = use({ 'rides/ride1': ride(), 'users/d1': driver('d1'), 'users/d2': driver('d2') });
        await dispatcher.dispatchNewRequests(ctx());
        const r = store.docs['rides/ride1'];
        eq('the request opens', r[F.status], S.open);
        eq('every eligible driver is on the request', r[F.eligibleDriverIds].sort(), ['d1', 'd2']);
        eq('a deadline is written', typeof r[F.expiresAt].toMillis === 'function', true);
        eq('each eligible driver is notified once', sent.length, 2);
    }
    {
        const store = use({ 'rides/ride1': ride(), 'users/d1': driver('d1', { sectionIds: ['elsewhere'] }) });
        await dispatcher.dispatchNewRequests(ctx());
        eq('with nobody eligible the request is marked no_drivers', store.docs['rides/ride1'][F.status], S.noDrivers);
        eq('and no driver is put on it', store.docs['rides/ride1'][F.eligibleDriverIds], []);
        eq('and nobody is notified', sent.length, 0);
    }
    {
        const store = use({ 'rides/ride1': ride({ status: 'Order Cancelled' }), 'users/d1': driver('d1') });
        await dispatcher.dispatchNewRequests(ctx());
        eq('a ride cancelled before dispatch is closed, not sent out', store.docs['rides/ride1'][F.status], S.cancelled);
    }
    {
        const store = use({ 'rides/ride1': ride({ [F.status]: S.open }), 'users/d1': driver('d1') });
        await dispatcher.dispatchNewRequests(ctx());
        eq('an already-open request is not dispatched twice', store.writes.length, 0);
    }

    // ── Expiry and cleanup ────────────────────────────────────────────────
    console.log('\n expiry and cleanup');
    {
        const store = use({
            'rides/ride1': ride({
                [F.status]: S.open,
                [F.eligibleDriverIds]: ['d1'],
                [F.expiresAt]: FakeTimestamp.fromMillis(Date.now() - 1000),
            }),
            'rides/ride1/bids/d1': { id: 'd1', driverId: 'd1', amount: 500, status: BID.pending },
        });
        await dispatcher.closeFinishedRequests(ctx());
        eq('a request past its deadline expires', store.docs['rides/ride1'][F.status], S.expired);
        eq('its drivers are cleared', store.docs['rides/ride1'][F.eligibleDriverIds], []);
        eq('and no offer is left pending', store.docs['rides/ride1/bids/d1'].status, BID.closed);
    }
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.open, [F.expiresAt]: FakeTimestamp.fromMillis(Date.now() + 60000) }),
        });
        await dispatcher.closeFinishedRequests(ctx());
        eq('a request inside its window is left alone', store.docs['rides/ride1'][F.status], S.open);
    }
    {
        const store = use({
            'rides/ride1': ride({ status: 'Order Rejected', [F.status]: S.open, [F.eligibleDriverIds]: ['d1'] }),
            'rides/ride1/bids/d1': { id: 'd1', driverId: 'd1', amount: 500, status: BID.pending },
        });
        await dispatcher.closeFinishedRequests(ctx());
        eq('a ride the customer cancelled stops taking offers', store.docs['rides/ride1'][F.status], S.cancelled);
        eq('and its offers close with it', store.docs['rides/ride1/bids/d1'].status, BID.closed);
    }
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.open, [F.winningBidId]: 'd1', [F.eligibleDriverIds]: ['d1', 'd2'] }),
        });
        await dispatcher.closeFinishedRequests(ctx());
        eq('a request that already has a winner is not left open', store.docs['rides/ride1'][F.status], S.accepted);
        eq('and only the winner stays on it', store.docs['rides/ride1'][F.eligibleDriverIds], ['d1']);
    }

    // ── Minimum fare sweep ────────────────────────────────────────────────
    console.log('\n minimum-fare sweep');
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.open, distance: '10' }),
            'rides/ride1/bids/low': { id: 'low', driverId: 'low', amount: 300, status: BID.pending },
            'rides/ride1/bids/exact': { id: 'exact', driverId: 'exact', amount: 500, status: BID.pending },
            'rides/ride1/bids/high': { id: 'high', driverId: 'high', amount: 700, status: BID.pending },
        });
        await dispatcher.sweepMinimumFare(ctx({ settings: { enabled: true, minimumFarePerKmEnabled: true, minimumFarePerKm: 50 } }));
        eq('an under-minimum offer is voided', store.docs['rides/ride1/bids/low'].status, BID.voided);
        eq('an offer of exactly the minimum survives', store.docs['rides/ride1/bids/exact'].status, BID.pending);
        eq('an offer above the minimum survives', store.docs['rides/ride1/bids/high'].status, BID.pending);
    }
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.open }),
            'rides/ride1/bids/low': { id: 'low', driverId: 'low', amount: 1, status: BID.pending },
        });
        await dispatcher.sweepMinimumFare(ctx());
        eq('with the rule switched off nothing is voided', store.docs['rides/ride1/bids/low'].status, BID.pending);
        eq('and nothing is written at all', store.writes.length, 0);
    }

    // ── Winner reconciliation ─────────────────────────────────────────────
    console.log('\n winner reconciliation');
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.accepted, [F.winningBidId]: 'd1', status: 'Driver Accepted' }),
            'users/d1': driver('d1'),
        });
        await dispatcher.reconcileWinners();
        eq('the won ride reaches the winning driver', store.docs['users/d1'].inProgressOrderID, ['ride1']);
        eq('the pending-request slot is cleared', store.docs['users/d1'].ordercabRequestData, null);
        eq('and the ride moves on to booked', store.docs['rides/ride1'][F.status], S.booked);
    }
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.accepted, [F.winningBidId]: 'd1' }),
            'users/d1': driver('d1', { inProgressOrderID: ['ride1'] }),
        });
        await dispatcher.reconcileWinners();
        eq('a driver whose app already claimed the ride is not given it twice', store.docs['users/d1'].inProgressOrderID, ['ride1']);
    }
    {
        const store = use({ 'rides/ride1': ride({ [F.status]: S.booked, [F.winningBidId]: 'd1' }), 'users/d1': driver('d1') });
        await dispatcher.reconcileWinners();
        eq('a booked ride is not reconciled again', store.writes.length, 0);
    }

    // ── Trusted distance ──────────────────────────────────────────────────
    //
    // biddingDistanceKm is written by the customer's app. These cover the case
    // the audit asked about: a modified client under-reporting the distance to
    // shrink the minimum fare.
    console.log('\n trusted distance');
    {
        // (0,0) -> (0, 0.09) is about 10 km along the equator.
        const km = dispatcher.straightLineKm(0, 0, 0, 0.09);
        eq('the straight-line helper returns kilometres, not miles', km > 9.5 && km < 10.5, true);
    }
    {
        const honest = ride({ biddingDistanceKm: 14 });
        eq('an honest claim above the straight line is kept', dispatcher.trustedDistanceKm(honest), 14);
    }
    {
        const lying = ride({ biddingDistanceKm: 1 });
        const trusted = dispatcher.trustedDistanceKm(lying);
        eq('an under-reported claim is raised to the straight-line lower bound', trusted > 5 && trusted < 6, true);
    }
    {
        const noCoords = ride({ biddingDistanceKm: 4, sourceLocation: null, destinationLocation: null });
        eq('with no usable coordinates the claim is all there is', dispatcher.trustedDistanceKm(noCoords), 4);
    }
    {
        const store = use({ 'rides/ride1': ride({ biddingDistanceKm: 1 }), 'users/d1': driver('d1') });
        await dispatcher.dispatchNewRequests(ctx({ settings: { enabled: true, minimumFarePerKmEnabled: true, minimumFarePerKm: 50 } }));
        const r = store.docs['rides/ride1'];
        eq('dispatch corrects an under-reported distance before any driver sees it', r.biddingDistanceKm > 5 && r.biddingDistanceKm < 6, true);
        eq('and recomputes the floor from the corrected distance', r[F.minimumAllowedFare] > 250 && r[F.minimumAllowedFare] < 300, true);
        eq('and records the rate that produced it', r[F.minFarePerKmAtRequest], 50);
    }
    {
        const store = use({ 'rides/ride1': ride({ biddingDistanceKm: 14, [F.minimumAllowedFare]: 0 }), 'users/d1': driver('d1') });
        await dispatcher.dispatchNewRequests(ctx({ settings: { enabled: true, minimumFarePerKmEnabled: true, minimumFarePerKm: 50 } }));
        eq('an honest distance is left exactly as the customer sent it', store.docs['rides/ride1'].biddingDistanceKm, 14);
        eq('and its floor is rate x that distance', store.docs['rides/ride1'][F.minimumAllowedFare], 700);
    }
    {
        const store = use({ 'rides/ride1': ride({ biddingDistanceKm: 14 }), 'users/d1': driver('d1') });
        await dispatcher.dispatchNewRequests(ctx());
        eq('with the floor switched off no floor is written', store.docs['rides/ride1'][F.minimumAllowedFare], 0);
    }
    {
        // ride.distance is deliberately a misleading value here: it is the raw,
        // unit-ambiguous field the sweep must NOT be reading.
        const store = use({
            'rides/ride1': ride({ [F.status]: S.open, distance: '1', biddingDistanceKm: 10 }),
            'rides/ride1/bids/low': { id: 'low', driverId: 'low', amount: 300, status: BID.pending },
        });
        await dispatcher.sweepMinimumFare(ctx({ settings: { enabled: true, minimumFarePerKmEnabled: true, minimumFarePerKm: 50 } }));
        eq('the sweep uses the normalised km, not the display-unit string', store.docs['rides/ride1/bids/low'].status, BID.voided);
    }
    {
        const store = use({
            'rides/ride1': ride({ [F.status]: S.open, biddingDistanceKm: 1 }),
            'rides/ride1/bids/low': { id: 'low', driverId: 'low', amount: 100, status: BID.pending },
        });
        await dispatcher.sweepMinimumFare(ctx({ settings: { enabled: true, minimumFarePerKmEnabled: true, minimumFarePerKm: 50 } }));
        eq('the sweep also applies the trusted distance to an under-reported ride', store.docs['rides/ride1/bids/low'].status, BID.voided);
    }

    // ── The global switch ─────────────────────────────────────────────────
    console.log('\n the global switch');
    {
        const store = use({ 'settings/biddingSettings': { enabled: false }, 'rides/ride1': ride(), 'users/d1': driver('d1') });
        await dispatcher.cabBiddingDispatch();
        eq('with bidding off the dispatcher writes nothing', store.writes.length, 0);
    }
    {
        const store = use({ 'rides/ride1': ride(), 'users/d1': driver('d1') });
        await dispatcher.cabBiddingDispatch();
        eq('with no settings document at all it writes nothing', store.writes.length, 0);
    }
    {
        const store = use({
            'settings/biddingSettings': { enabled: true, bidExpiryMinutes: 5, maxDriversPerRequest: 20 },
            'settings/DriverNearBy': { driverRadios: '50', minimumDepositToRideAccept: '100' },
            'rides/ride1': ride(),
            'users/d1': driver('d1'),
        });
        await dispatcher.cabBiddingDispatch();
        eq('with bidding on the request is dispatched end to end', store.docs['rides/ride1'][F.status], S.open);
        eq('and the eligible driver is on it', store.docs['rides/ride1'][F.eligibleDriverIds], ['d1']);
    }

    // ── TEMPORARY test scope (settings/biddingSettings.testUids) ──────────
    // The point of these is that the scope is INERT unless populated, so the
    // shipped production behaviour is still the plain global switch.
    console.log('\n temporary test scope');

    eq('no testUids field reads as an empty scope', dispatcher.testUidsOf({ enabled: false }), []);
    eq('a null settings document reads as an empty scope', dispatcher.testUidsOf(null), []);
    eq('a non-array testUids is ignored', dispatcher.testUidsOf({ testUids: 'cust1' }), []);
    eq('blanks and non-strings are dropped', dispatcher.testUidsOf({ testUids: ['a', '', '  ', 7, null, ' b '] }), ['a', 'b']);

    {
        // Bidding OFF and no test scope: unchanged, writes nothing.
        const store = use({
            'settings/biddingSettings': { enabled: false },
            'rides/ride1': ride(),
            'users/d1': driver('d1'),
        });
        await dispatcher.cabBiddingDispatch();
        eq('OFF with an empty scope still writes nothing', store.writes.length, 0);
        eq('and the ride is left pending', store.docs['rides/ride1'][F.status], S.pendingDispatch);
    }
    {
        // Bidding OFF, test scope holds the customer AND the driver.
        const store = use({
            'settings/biddingSettings': { enabled: false, testUids: ['cust1', 'd1'], bidExpiryMinutes: 5, maxDriversPerRequest: 20 },
            'settings/DriverNearBy': { driverRadios: '50', minimumDepositToRideAccept: '100' },
            'rides/ride1': ride(),
            'users/d1': driver('d1'),
        });
        await dispatcher.cabBiddingDispatch();
        eq('a test customer IS dispatched while bidding is globally off', store.docs['rides/ride1'][F.status], S.open);
        eq('and only the test driver is on it', store.docs['rides/ride1'][F.eligibleDriverIds], ['d1']);
    }
    {
        // Bidding OFF, test scope holds the customer but NOT the driver: a real
        // driver must never be shown a test request.
        const store = use({
            'settings/biddingSettings': { enabled: false, testUids: ['cust1'], bidExpiryMinutes: 5, maxDriversPerRequest: 20 },
            'settings/DriverNearBy': { driverRadios: '50', minimumDepositToRideAccept: '100' },
            'rides/ride1': ride(),
            'users/d1': driver('d1'),
        });
        await dispatcher.cabBiddingDispatch();
        eq('a REAL driver is never offered a test request', store.docs['rides/ride1'][F.eligibleDriverIds], []);
        eq('the request ends as no_drivers rather than reaching anyone', store.docs['rides/ride1'][F.status], S.noDrivers);
    }
    {
        // Bidding OFF, test scope holds the driver but a REAL customer's ride
        // is waiting: it must be left completely alone.
        const store = use({
            'settings/biddingSettings': { enabled: false, testUids: ['d1'], bidExpiryMinutes: 5, maxDriversPerRequest: 20 },
            'settings/DriverNearBy': { driverRadios: '50', minimumDepositToRideAccept: '100' },
            'rides/ride1': ride({ authorID: 'real-customer' }),
            'users/d1': driver('d1'),
        });
        await dispatcher.cabBiddingDispatch();
        eq('a real customer request is skipped entirely in test scope', store.writes.length, 0);
        eq('and is left exactly as it was', store.docs['rides/ride1'][F.status], S.pendingDispatch);
    }
    {
        // Bidding ON: testUids must make no difference at all.
        const store = use({
            'settings/biddingSettings': { enabled: true, testUids: ['someone-else'], bidExpiryMinutes: 5, maxDriversPerRequest: 20 },
            'settings/DriverNearBy': { driverRadios: '50', minimumDepositToRideAccept: '100' },
            'rides/ride1': ride(),
            'users/d1': driver('d1'),
        });
        await dispatcher.cabBiddingDispatch();
        eq('with bidding ON the test scope is ignored', store.docs['rides/ride1'][F.status], S.open);
        eq('and every eligible driver is served', store.docs['rides/ride1'][F.eligibleDriverIds], ['d1']);
    }

    // ── Admin-set bidding radius, in kilometres ───────────────────────────
    // "how many kilometer will be selected for it, it must be setup from admin
    // panel" - settings/biddingSettings.notifyRadiusKm, written by the Bidding
    // Settings page. One degree of latitude is 69.09 statute miles / 111.19 km,
    // so a driver at latitude 0.1 sits 11.12 km from a pickup at the equator.
    console.log('\n admin-set bidding radius (km)');
    eq('a missing radius means not set', dispatcher.radiusKmOf({}), 0);
    eq('zero means not set', dispatcher.radiusKmOf({ notifyRadiusKm: 0 }), 0);
    eq('a negative radius means not set', dispatcher.radiusKmOf({ notifyRadiusKm: -5 }), 0);
    eq('a numeric string is read', dispatcher.radiusKmOf({ notifyRadiusKm: '15' }), 15);
    eq('an absurd radius is capped', dispatcher.radiusKmOf({ notifyRadiusKm: 9999 }), 500);
    eq('undefined settings are survived', dispatcher.radiusKmOf(undefined), 0);
    {
        const store = use({ 'users/d1': driver('d1', { location: { latitude: 0.1, longitude: 0 } }) });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx({ radiusKm: 10 }));
        eq('a driver 11.1 km out is dropped by a 10 km radius', eligible.map((d) => d.id), []);
    }
    {
        const store = use({ 'users/d1': driver('d1', { location: { latitude: 0.1, longitude: 0 } }) });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx({ radiusKm: 15 }));
        eq('and kept by a 15 km radius', eligible.map((d) => d.id), ['d1']);
    }
    {
        // The km radius overrides the miles one rather than adding to it: 50
        // miles would have taken this driver, 10 km does not.
        const store = use({ 'users/d1': driver('d1', { location: { latitude: 0.1, longitude: 0 } }) });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx({ radius: 50, radiusKm: 10 }));
        eq('the km radius wins over Radius Configuration', eligible.map((d) => d.id), []);
    }
    {
        // ...and with no km radius set, nothing about today's behaviour moves.
        const store = use({ 'users/d1': driver('d1', { location: { latitude: 0.1, longitude: 0 } }) });
        const eligible = await dispatcher.findEligibleDrivers(ride(), ctx({ radius: 50 }));
        eq('with no km radius the miles radius still decides', eligible.map((d) => d.id), ['d1']);
    }
    {
        const store = use({
            'settings/biddingSettings': { enabled: true, bidExpiryMinutes: 5, maxDriversPerRequest: 20, notifyRadiusKm: 10 },
            'settings/DriverNearBy': { driverRadios: '50', minimumDepositToRideAccept: '100' },
            'rides/ride1': ride(),
            'users/d1': driver('d1', { location: { latitude: 0.1, longitude: 0 } }),
        });
        await dispatcher.cabBiddingDispatch();
        eq('a full dispatch honours the admin radius', store.docs['rides/ride1'][F.status], S.noDrivers);
    }

    // ── Settings clamping ─────────────────────────────────────────────────
    console.log('\n settings clamping');
    eq('a missing value falls back', dispatcher.clampInt(undefined, 1, 120, 5), 5);
    eq('a value below the floor is clamped up', dispatcher.clampInt(0, 1, 120, 5), 1);
    eq('a value above the ceiling is clamped down', dispatcher.clampInt(9999, 1, 120, 5), 120);
    eq('a numeric string is read', dispatcher.clampInt('7', 1, 120, 5), 7);

    console.log('\n' + passed + ' passed, ' + failed + ' failed');
    process.exit(failed ? 1 : 0);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
