/*
 * admin-assign-driver.js
 * ----------------------------------------------------------------------------
 * Assign Driver from the admin panel, on the four order lists:
 *
 *   store   - vendor_orders  (food, grocery, pharmacy ... /orders)
 *   cab     - rides          (rides and intercity, /rides)
 *   parcel  - parcel_orders  (/parcel_orders)
 *   rental  - rental_orders  (/rental_orders)
 *
 * and the City tabs above those lists.
 *
 * WHAT THE CLIENT ASKED FOR (16 Oct 2026)
 *   The Assign Driver option on every placed order in every section, always
 *   there while the order still needs a driver, and the orders of each city
 *   under their own tab.
 *
 * WHAT WAS THERE BEFORE
 *   Only the store-order list had Assign Driver, and only while the order said
 *   exactly "Order Accepted" or "Driver Rejected". The cloud function moves an
 *   accepted order to "Driver Pending" within seconds, so the icon flickered in
 *   and out. Rides, parcel and rental orders never had it.
 *
 * HOW EACH KIND IS ASSIGNED - always the way that service's own apps already
 * work, so nothing new is asked of the driver or customer apps:
 *
 *   store   Exactly what the old panel button did: the order goes to
 *           "Driver Pending" and its id is added to the driver's
 *           `orderRequestData`. The driver app shows it as a request to accept.
 *           Reassigning now also takes the request back from whoever held it.
 *   cab     Exactly what the ride dispatcher (storage/app/firebase/
 *           cabScheduleRide.js, placeRide) writes: the ride goes to
 *           "Driver Pending" with `pendingDriverId` / `driverPendingSince`, and
 *           the driver gets the ride copy in `ordercabRequestData`. The
 *           dispatcher's usual timeout takes it back if the driver never
 *           answers. A previous holder is released in the same transaction.
 *   parcel  Exactly what the driver app writes when a driver accepts a parcel
 *   rental  or rental booking from its search screen: status "Driver
 *           Accepted", `driverId` and the `driver` copy (parcel also sets
 *           `receiverPickupDateTime`). Those services have no "offer" step.
 *
 * Every write is a transaction that re-reads the order and the driver, so an
 * order that moved on while the dialog was open is refused, not overwritten.
 *
 * Inlined by resources/views/layouts/admin_assign_driver_script.blade.php.
 */
(function (window, $) {
    'use strict';

    var DRIVER_PENDING = 'Driver Pending';
    var DRIVER_ACCEPTED = 'Driver Accepted';

    /** The statuses in which each kind of order can still be given a driver. */
    var KINDS = {
        store: {
            collection: 'vendor_orders',
            sectionField: 'section_id',
            statuses: ['Order Placed', 'Order Accepted', 'Driver Pending', 'Driver Rejected']
        },
        cab: {
            collection: 'rides',
            sectionField: 'sectionId',
            // The dispatcher's DISPATCHABLE list, plus reassigning an open offer.
            statuses: ['Order Placed', 'Order Accepted', 'Driver Rejected', 'Driver Pending']
        },
        parcel: {
            collection: 'parcel_orders',
            sectionField: 'sectionId',
            statuses: ['Order Placed', 'Driver Rejected', 'Driver Accepted']
        },
        rental: {
            collection: 'rental_orders',
            sectionField: 'sectionId',
            statuses: ['Order Placed', 'Driver Rejected', 'Driver Accepted']
        }
    };

    var labels = {
        assignDriver: 'Assign Driver',
        reassignDriver: 'Change Driver',
        assign: 'Assign',
        cancel: 'Cancel',
        searchDriver: 'Search driver by name or phone',
        loading: 'Loading drivers...',
        noDrivers: 'No driver is registered in this section.',
        assigned: 'Driver assigned',
        failed: 'Could not assign the driver',
        selectDriver: 'Select a driver',
        allCities: 'All cities',
        noCity: 'No city',
        takeaway: 'Takeaway order - no driver needed',
        bidding: 'Bidding ride - the customer chooses from the drivers\' offers',
        offline: 'offline',
        busy: 'busy',
        otherCity: 'other city',
        far: 'far',
        lowWallet: 'low wallet',
        otherVehicle: 'other vehicle',
        rejectedBefore: 'rejected before',
        noAppToken: 'app not signed in',
        current: 'current driver',
        orderMoved: 'This order has changed meanwhile and no longer needs a driver.',
        driverBusy: 'This driver has just taken another request.',
        notifySubject: 'New order assigned',
        notifyMessage: 'The admin assigned you a new order. Please open the app.'
    };

    // ════════════════════════════════════════════
    // SMALL HELPERS (pure, tested)
    // ════════════════════════════════════════════

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function num(value) {
        var n = parseFloat(value);
        return isNaN(n) ? null : n;
    }

    /** {latitude, longitude} from the shapes the apps store, or null. */
    function point(value) {
        if (!value) return null;
        var lat = num(value.latitude !== undefined ? value.latitude : value._lat);
        var lng = num(value.longitude !== undefined ? value.longitude : value._long);
        if (lat === null || lng === null) return null;
        if (lat === 0 && lng === 0) return null;
        return { latitude: lat, longitude: lng };
    }

    /** Great-circle distance in km. */
    function distanceKm(a, b) {
        if (!a || !b) return null;
        var rad = Math.PI / 180;
        var dLat = (b.latitude - a.latitude) * rad;
        var dLng = (b.longitude - a.longitude) * rad;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    /** Same even-odd test the cloud function and the dispatcher use. */
    function inPolygon(area, p) {
        if (!Array.isArray(area) || area.length < 3 || !p) return false;
        var inside = false;
        for (var i = 0, j = area.length - 1; i < area.length; j = i++) {
            var a = point(area[i]);
            var b = point(area[j]);
            if (!a || !b) continue;
            if (((a.latitude > p.latitude) !== (b.latitude > p.latitude)) &&
                (p.longitude < (b.longitude - a.longitude) * (p.latitude - a.latitude) / (b.latitude - a.latitude) + a.longitude)) {
                inside = !inside;
            }
        }
        return inside;
    }

    function zoneAt(zones, p) {
        if (!p) return null;
        for (var i = 0; i < (zones || []).length; i++) {
            if (inPolygon(zones[i].area, p)) return zones[i].id;
        }
        return null;
    }

    /** Where the driver has to go first: the store, the pickup or the sender. */
    function pickupPoint(kind, order) {
        order = order || {};
        if (kind === 'store') {
            var vendor = order.vendor || {};
            return point({ latitude: vendor.latitude, longitude: vendor.longitude }) ||
                point(order.address && order.address.location);
        }
        if (kind === 'parcel') return point(order.senderLatLong);
        return point(order.sourceLocation);
    }

    /** The city (zone id) an order belongs to, or null when none matches. */
    function orderZone(kind, order, zones) {
        order = order || {};
        var known = {};
        (zones || []).forEach(function (z) { known[z.id] = true; });
        var direct = null;
        if (kind === 'store') direct = order.vendor && order.vendor.zoneId;
        else if (kind === 'parcel') direct = order.senderZoneId;
        else if (kind === 'rental') direct = order.zoneId;
        else if (kind === 'cab') direct = order.zoneId;
        if (direct && known[direct]) return direct;
        var p = pickupPoint(kind, order);
        if (kind === 'store') p = point(order.address && order.address.location) || p;
        return zoneAt(zones, p);
    }

    function inSection(driver, sectionId) {
        if (!driver || !sectionId) return false;
        if (driver.sectionId === sectionId) return true;
        return Array.isArray(driver.sectionIds) && driver.sectionIds.indexOf(sectionId) !== -1;
    }

    function nonEmptyList(value) {
        return Array.isArray(value) && value.length > 0;
    }

    /**
     * Can this order be given a driver from the panel?
     *   { show: false }                     nothing to assign (finished etc.)
     *   { show: true, enabled: true }        the button works
     *   { show: true, enabled: false, why }  shown greyed, with the reason
     */
    function assignState(kind, order) {
        var cfg = KINDS[kind];
        order = order || {};
        if (!cfg || cfg.statuses.indexOf(order.status) === -1) return { show: false };
        if (kind === 'store' && order.takeAway === true) return { show: false };
        if (kind === 'cab' && order.biddingEnabled === true) {
            return { show: true, enabled: false, why: labels.bidding };
        }
        return { show: true, enabled: true };
    }

    /** The order's current driver, if one is holding or doing it. */
    function currentDriverId(kind, order) {
        order = order || {};
        if (kind === 'cab') return order.status === DRIVER_PENDING ? (order.pendingDriverId || null) : null;
        if (kind === 'store') return null;
        return order.status === DRIVER_ACCEPTED ? (order.driverId || null) : null;
    }

    function actionHtml(kind, order) {
        var state = assignState(kind, order);
        if (!state.show) return '';
        var id = escapeHtml(order.id);
        var title = currentDriverId(kind, order) ? labels.reassignDriver : labels.assignDriver;
        if (!state.enabled) {
            return '<a href="javascript:void(0)" class="admin-assign-driver-off" data-toggle="tooltip" ' +
                'data-bs-original-title="' + escapeHtml(state.why) + '" title="' + escapeHtml(state.why) + '">' +
                '<i class="mdi mdi-truck-delivery"></i></a>';
        }
        return '<a href="javascript:void(0)" class="admin-assign-driver-btn" data-kind="' + kind + '" data-id="' + id +
            '" data-toggle="tooltip" data-bs-original-title="' + escapeHtml(title) + '" title="' + escapeHtml(title) + '">' +
            '<i class="mdi mdi-truck-delivery"></i></a>';
    }

    /**
     * Every driver of the order's section, best first, each with the notes the
     * admin needs to choose. Hard rules (the row is not offered at all): other
     * section, fleet owner, account switched off, deleted, a store's own
     * delivery man on a store order. A driver who would have a request
     * overwritten is shown but cannot be picked.
     */
    function candidates(kind, order, drivers, ctx) {
        ctx = ctx || {};
        var cfg = KINDS[kind];
        var sectionId = order[cfg.sectionField];
        var origin = pickupPoint(kind, order);
        var orderZoneId = ctx.orderZoneId || null;
        var radiusKm = num(ctx.radiusKm);
        var minWallet = num(ctx.minWallet) || 0;
        var rejected = order.rejectedByDrivers || [];
        var holder = currentDriverId(kind, order);
        var deleted = ctx.deleted || {};
        var list = [];

        var locked = lockedCity();

        (drivers || []).forEach(function (d) {
            if (!d || !d.id) return;
            if (deleted[d.id]) return;
            if (locked && d.zoneId !== locked.id) return;   // city admin: own city's drivers only
            if (d.isOwner === true) return;
            if (d.active === false) return;
            if (!inSection(d, sectionId)) return;
            if (kind === 'store' && d.vendorID) return;

            var notes = [];
            var blocked = null;
            var isHolder = holder && holder === d.id;

            if (d.isActive !== true) notes.push(labels.offline);
            if (kind === 'cab') {
                var cabRequest = d.ordercabRequestData;
                var holdsThis = cabRequest && String(cabRequest.id || '') === String(order.id);
                if ((cabRequest && !holdsThis) || nonEmptyList(d.inProgressOrderID) || nonEmptyList(d.orderRequestData)) {
                    blocked = labels.busy;
                }
            } else if (kind === 'store') {
                var requests = (d.orderRequestData || []).filter(function (x) { return x !== order.id; });
                if (ctx.singleOrderReceive && (requests.length > 0 || nonEmptyList(d.inProgressOrderID))) blocked = labels.busy;
                else if (requests.length > 0 || nonEmptyList(d.inProgressOrderID)) notes.push(labels.busy);
            }
            if (orderZoneId && d.zoneId && d.zoneId !== orderZoneId) notes.push(labels.otherCity);
            var where = point(d.location);
            var km = distanceKm(where, origin);
            if (km !== null && radiusKm && km > radiusKm) notes.push(labels.far);
            if (minWallet > 0 && (num(d.wallet_amount) || 0) < minWallet) notes.push(labels.lowWallet);
            if ((kind === 'cab' || kind === 'rental') && order.vehicleId) {
                var vehicle = (d.vehicleDetails || {})[sectionId];
                if (vehicle && vehicle.vehicleId && vehicle.vehicleId !== order.vehicleId) notes.push(labels.otherVehicle);
            }
            if (rejected.indexOf(d.id) !== -1) notes.push(labels.rejectedBefore);
            if (!d.fcmToken) notes.push(labels.noAppToken);
            if (isHolder) notes.unshift(labels.current);

            list.push({
                id: d.id,
                name: ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || d.email || d.id,
                phone: d.phoneNumber || '',
                km: km,
                notes: notes,
                blocked: blocked,
                fcmToken: d.fcmToken || ''
            });
        });

        list.sort(function (a, b) {
            if (!!a.blocked !== !!b.blocked) return a.blocked ? 1 : -1;
            if (a.notes.length !== b.notes.length) return a.notes.length - b.notes.length;
            var ak = a.km === null ? Infinity : a.km;
            var bk = b.km === null ? Infinity : b.km;
            if (ak !== bk) return ak - bk;
            return a.name.localeCompare(b.name);
        });
        return list;
    }

    /** The driver copy embedded in parcel/rental orders, as the driver app embeds it. */
    function driverCopy(driverId, data) {
        var copy = Object.assign({}, data || {});
        // Live request bookkeeping of the driver, not part of who they are.
        delete copy.ordercabRequestData;
        delete copy.orderRequestData;
        delete copy.inProgressOrderID;
        copy.id = copy.id || driverId;
        return copy;
    }

    // ════════════════════════════════════════════
    // FIRESTORE WRITES
    // ════════════════════════════════════════════

    function moved() { var e = new Error(labels.orderMoved); e.code = 'order-moved'; return e; }
    function busy() { var e = new Error(labels.driverBusy); e.code = 'driver-busy'; return e; }

    /**
     * store: the old panel button's writes (order -> Driver Pending, id added to
     * the driver's orderRequestData; replaced by [id] when single-order mode is
     * on), plus taking the request back from anyone else who still holds it.
     */
    function assignStore(db, orderId, driverId, ctx) {
        var orderRef = db.collection('vendor_orders').doc(orderId);
        var driverRef = db.collection('users').doc(driverId);
        return db.collection('users').where('orderRequestData', 'array-contains', orderId).get().then(function (holders) {
            var otherRefs = holders.docs.filter(function (d) { return d.id !== driverId; }).map(function (d) { return d.ref; });
            return db.runTransaction(function (tx) {
                var reads = [tx.get(orderRef), tx.get(driverRef)].concat(otherRefs.map(function (r) { return tx.get(r); }));
                return Promise.all(reads).then(function (snaps) {
                    var order = snaps[0].exists ? snaps[0].data() : null;
                    var driver = snaps[1].exists ? snaps[1].data() : null;
                    if (!order || !assignState('store', order).enabled) throw moved();
                    if (!driver) throw busy();
                    var requests = (driver.orderRequestData || []).slice();
                    if (ctx.singleOrderReceive) {
                        var others = requests.filter(function (x) { return x !== orderId; });
                        if (others.length > 0 || nonEmptyList(driver.inProgressOrderID)) throw busy();
                        requests = [orderId];
                    } else if (requests.indexOf(orderId) === -1) {
                        requests.push(orderId);
                    }
                    tx.set(orderRef, { status: DRIVER_PENDING }, { merge: true });
                    tx.update(driverRef, { orderRequestData: requests });
                    snaps.slice(2).forEach(function (s, i) {
                        if (!s.exists) return;
                        var list = (s.data().orderRequestData || []).filter(function (x) { return x !== orderId; });
                        tx.update(otherRefs[i], { orderRequestData: list });
                    });
                });
            });
        });
    }

    /** cab: the dispatcher's placeRide writes, made by the admin's choice. */
    function assignCab(db, rideId, driverId) {
        var rideRef = db.collection('rides').doc(rideId);
        var driverRef = db.collection('users').doc(driverId);
        // Whoever holds a copy of this ride, including an offer made before
        // `pendingDriverId` existed.
        return db.collection('users').where('ordercabRequestData.id', '==', rideId).get().then(function (holders) {
            var holderIds = holders.docs.map(function (d) { return d.id; });
            return db.runTransaction(function (tx) {
                return tx.get(rideRef).then(function (rideSnap) {
                    var ride = rideSnap.exists ? rideSnap.data() : null;
                    if (!ride || !assignState('cab', ride).enabled) throw moved();
                    var release = holderIds.slice();
                    if (ride.status === DRIVER_PENDING && ride.pendingDriverId && release.indexOf(ride.pendingDriverId) === -1) {
                        release.push(ride.pendingDriverId);
                    }
                    release = release.filter(function (id) { return id !== driverId; });
                    var releaseRefs = release.map(function (id) { return db.collection('users').doc(id); });
                    return Promise.all([tx.get(driverRef)].concat(releaseRefs.map(function (r) { return tx.get(r); }))).then(function (snaps) {
                        var driver = snaps[0].exists ? snaps[0].data() : null;
                        if (!driver) throw busy();
                        var cabRequest = driver.ordercabRequestData;
                        if (cabRequest && String(cabRequest.id || '') !== String(rideId)) throw busy();
                        if (nonEmptyList(driver.inProgressOrderID) || nonEmptyList(driver.orderRequestData)) throw busy();

                        tx.update(rideRef, {
                            status: DRIVER_PENDING,
                            pendingDriverId: driverId,
                            driverPendingSince: firebase.firestore.Timestamp.now()
                        });
                        tx.update(driverRef, { ordercabRequestData: Object.assign({}, ride, { status: DRIVER_PENDING }) });
                        snaps.slice(1).forEach(function (s, i) {
                            if (!s.exists) return;
                            var held = s.data().ordercabRequestData;
                            if (held && String(held.id || '') === String(rideId)) {
                                tx.update(releaseRefs[i], { ordercabRequestData: null });
                            }
                        });
                    });
                });
            });
        });
    }

    /** parcel / rental: what the driver app writes when a driver accepts. */
    function assignDirect(db, kind, orderId, driverId) {
        var orderRef = db.collection(KINDS[kind].collection).doc(orderId);
        var driverRef = db.collection('users').doc(driverId);
        return db.runTransaction(function (tx) {
            return Promise.all([tx.get(orderRef), tx.get(driverRef)]).then(function (snaps) {
                var order = snaps[0].exists ? snaps[0].data() : null;
                var driver = snaps[1].exists ? snaps[1].data() : null;
                if (!order || !assignState(kind, order).enabled) throw moved();
                if (!driver) throw busy();
                var update = {
                    status: DRIVER_ACCEPTED,
                    driverId: driverId,
                    driver: driverCopy(driverId, driver)
                };
                if (kind === 'parcel') update.receiverPickupDateTime = firebase.firestore.Timestamp.now();
                tx.update(orderRef, update);
            });
        });
    }

    function assign(db, kind, orderId, driverId, ctx) {
        if (kind === 'store') return assignStore(db, orderId, driverId, ctx || {});
        if (kind === 'cab') return assignCab(db, orderId, driverId);
        return assignDirect(db, kind, orderId, driverId);
    }

    // ════════════════════════════════════════════
    // READS (cached for the page)
    // ════════════════════════════════════════════

    var cache = { zones: null, drivers: null, driversAt: 0, nearBy: null };
    var DRIVERS_TTL_MS = 30 * 1000;

    function loadZones(db) {
        if (!cache.zones) {
            cache.zones = db.collection('zone').where('publish', '==', true).get().then(function (snap) {
                return snap.docs.map(function (doc) {
                    var z = doc.data() || {};
                    return { id: z.id || doc.id, name: z.name || doc.id, area: z.area || [] };
                }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
            }).catch(function (error) {
                console.warn('admin-assign-driver: zones unavailable', error);
                cache.zones = null;
                return [];
            });
        }
        return cache.zones;
    }

    function loadDrivers(db) {
        if (cache.drivers && (Date.now() - cache.driversAt) < DRIVERS_TTL_MS) return cache.drivers;
        cache.driversAt = Date.now();
        cache.drivers = Promise.all([
            db.collection('users').where('role', '==', 'driver').get(),
            db.collection('deleted_drivers').get().catch(function () { return { docs: [] }; })
        ]).then(function (results) {
            var deleted = {};
            results[1].docs.forEach(function (doc) { deleted[doc.id] = true; });
            return {
                drivers: results[0].docs.map(function (doc) { return Object.assign({}, doc.data(), { id: doc.id }); }),
                deleted: deleted
            };
        }).catch(function (error) {
            cache.drivers = null;
            throw error;
        });
        return cache.drivers;
    }

    function loadNearBy(db) {
        if (!cache.nearBy) {
            cache.nearBy = db.collection('settings').doc('DriverNearBy').get().then(function (snap) {
                return snap.exists ? (snap.data() || {}) : {};
            }).catch(function () { cache.nearBy = null; return {}; });
        }
        return cache.nearBy;
    }

    function radiusKmOf(nearBy) {
        var r = num(nearBy.driverRadios);
        if (r === null) return null;
        return nearBy.distanceType === 'miles' ? r * 1.60934 : r;
    }

    // ════════════════════════════════════════════
    // CITY TABS
    // ════════════════════════════════════════════

    var cityState = {};   // tableKey -> { kind, active, zones, reload }

    var NO_CITY = '__none__';

    function cityActive(key) {
        return (cityState[key] && cityState[key].active) || '';
    }

    /** Should this order be listed under the selected city tab? */
    function cityKeep(key, order) {
        var st = cityState[key];
        if (!st || !st.active) return true;
        var zone = orderZone(st.kind, order, st.zones);
        if (st.active === NO_CITY) return !zone;
        return zone === st.active;
    }

    /**
     * Draws "All cities | <each published zone> | No city" into `container`.
     * `reload` redraws the table. Nothing is drawn when there are no zones, and
     * the table behaves exactly as before while "All cities" is selected.
     */
    function mountCityTabs(db, key, kind, container, reload) {
        var $box = $(container);
        if (!$box.length) return Promise.resolve();
        var locked = lockedCity();
        if (locked) return mountLockedCity(db, key, kind, $box, locked);
        cityState[key] = { kind: kind, active: '', zones: [], reload: reload };
        return loadZones(db).then(function (zones) {
            cityState[key].zones = zones;
            if (!zones.length) return;
            var tabs = [{ id: '', name: labels.allCities }].concat(zones).concat([{ id: NO_CITY, name: labels.noCity }]);
            var html = '<ul class="admin-city-tabs">';
            tabs.forEach(function (t) {
                html += '<li class="' + (t.id === '' ? 'active' : '') + '"><a href="javascript:void(0)" data-city="' +
                    escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</a></li>';
            });
            html += '</ul>';
            $box.html(html).show();
            $box.on('click', 'a[data-city]', function () {
                var city = $(this).attr('data-city');
                if (city === cityState[key].active) return;
                cityState[key].active = city;
                $box.find('li').removeClass('active');
                $(this).parent().addClass('active');
                if (window.FsDataTable) window.FsDataTable.reset(key);
                reload();
            });
        });
    }

    /**
     * City admin: how many orders of `query` are in their city (the same rule
     * as their list). null for every other admin, whose page counts as before.
     */
    function cityCount(db, kind, query) {
        var locked = lockedCity();
        if (!locked) return null;
        return loadZones(db).then(function (zones) {
            var own = (zones || []).filter(function (z) { return z.id === locked.id; });
            if (!own.length) own = [{ id: locked.id, name: locked.name, area: [] }];
            return query.get().then(function (snap) {
                return snap.docs.filter(function (doc) { return orderZone(kind, doc.data(), own) === locked.id; }).length;
            });
        });
    }

    /** The city a city admin is limited to (layouts/admin_city_script), or null. */
    function lockedCity() {
        var c = window.ADMIN_CITY;
        return c && c.id ? c : null;
    }

    /*
     * A city admin: the list shows that one city only, and the tab is just its
     * name. The city is chosen before the table's first read, so other cities'
     * orders are never drawn; until the city borders are loaded only orders
     * that name the city directly are kept, then the table is drawn again.
     */
    function mountLockedCity(db, key, kind, $box, locked) {
        cityState[key] = { kind: kind, active: locked.id, zones: [{ id: locked.id, name: locked.name, area: [] }], reload: null };
        $box.html('<ul class="admin-city-tabs"><li class="active"><a href="javascript:void(0)">' +
            escapeHtml(locked.name || locked.id) + '</a></li></ul>').show();
        return loadZones(db).then(function (zones) {
            var own = (zones || []).filter(function (z) { return z.id === locked.id; });
            if (own.length) cityState[key].zones = own;
            if (window.FsDataTable) window.FsDataTable.reset(key);
            var $table = $('#' + key);
            if ($table.length && $.fn.dataTable && $.fn.dataTable.isDataTable($table[0])) {
                $table.DataTable().ajax.reload(null, false);
            }
        });
    }

    // ════════════════════════════════════════════
    // THE DIALOG
    // ════════════════════════════════════════════

    var dialog = { kind: null, orderId: null, list: [], ctx: null, onDone: null, busy: false };

    function ensureModal() {
        if ($('#adminAssignDriverModal').length) return;
        var html =
            '<div class="modal fade" id="adminAssignDriverModal" tabindex="-1" aria-hidden="true">' +
            '<div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content">' +
            '<div class="modal-header"><h5 class="modal-title">' + escapeHtml(labels.assignDriver) +
            ' <small class="text-muted admin-assign-order"></small></h5>' +
            '<button type="button" class="close" data-dismiss="modal" data-bs-dismiss="modal" aria-label="Close">&times;</button></div>' +
            '<div class="modal-body">' +
            '<input type="text" class="form-control mb-2 admin-assign-search" placeholder="' + escapeHtml(labels.searchDriver) + '">' +
            '<div class="admin-assign-list"></div>' +
            '<div class="admin-assign-error text-danger mt-2" style="display:none"></div>' +
            '</div>' +
            '<div class="modal-footer">' +
            '<button type="button" class="btn btn-primary admin-assign-confirm">' + escapeHtml(labels.assign) + '</button>' +
            '<button type="button" class="btn btn-secondary" data-dismiss="modal" data-bs-dismiss="modal">' + escapeHtml(labels.cancel) + '</button>' +
            '</div></div></div></div>';
        $('body').append(html);
        var $m = $('#adminAssignDriverModal');
        $m.on('input', '.admin-assign-search', function () { drawList(); });
        $m.on('click', '.admin-assign-confirm', confirmAssign);
        $m.on('click', '[data-dismiss="modal"]', function () { $m.modal('hide'); });
    }

    function drawList() {
        var $m = $('#adminAssignDriverModal');
        var q = String($m.find('.admin-assign-search').val() || '').toLowerCase().trim();
        var chosen = $m.find('input[name="admin_assign_driver"]:checked').val();
        var rows = dialog.list.filter(function (c) {
            return !q || c.name.toLowerCase().indexOf(q) !== -1 || String(c.phone).toLowerCase().indexOf(q) !== -1;
        });
        if (!dialog.list.length) {
            $m.find('.admin-assign-list').html('<p class="text-muted mb-0">' + escapeHtml(labels.noDrivers) + '</p>');
            return;
        }
        var html = '<div class="admin-assign-rows">';
        rows.forEach(function (c) {
            var disabled = c.blocked ? ' disabled' : '';
            var notes = c.notes.slice();
            if (c.blocked) notes.unshift(c.blocked);
            html += '<label class="admin-assign-row' + (c.blocked ? ' is-blocked' : '') + '">' +
                '<input type="radio" name="admin_assign_driver" value="' + escapeHtml(c.id) + '"' + disabled +
                (chosen === c.id ? ' checked' : '') + '> ' +
                '<span class="admin-assign-name">' + escapeHtml(c.name) + '</span>' +
                (c.phone ? ' <span class="text-muted">' + escapeHtml(c.phone) + '</span>' : '') +
                (c.km !== null ? ' <span class="admin-assign-km">' + c.km.toFixed(1) + ' km</span>' : '') +
                notes.map(function (n) { return ' <span class="admin-assign-note">' + escapeHtml(n) + '</span>'; }).join('') +
                '</label>';
        });
        html += '</div>';
        $m.find('.admin-assign-list').html(html);
    }

    function showError(text) {
        $('#adminAssignDriverModal .admin-assign-error').text(text).show();
    }

    function notify(candidate) {
        if (!candidate || !candidate.fcmToken || !labels.notifyUrl) return;
        try {
            $.ajax({
                method: 'POST',
                url: labels.notifyUrl,
                data: {
                    fcm: candidate.fcmToken,
                    subject: labels.notifySubject,
                    message: labels.notifyMessage,
                    _token: $('meta[name="csrf-token"]').attr('content')
                }
            });
        } catch (e) {
            console.warn('admin-assign-driver: push not sent', e);
        }
    }

    function confirmAssign() {
        if (dialog.busy) return;
        var $m = $('#adminAssignDriverModal');
        var driverId = $m.find('input[name="admin_assign_driver"]:checked').val();
        if (!driverId) { showError(labels.selectDriver); return; }
        var candidate = dialog.list.filter(function (c) { return c.id === driverId; })[0];
        dialog.busy = true;
        $m.find('.admin-assign-confirm').prop('disabled', true);
        $m.find('.admin-assign-error').hide();
        var db = firebase.firestore();
        assign(db, dialog.kind, dialog.orderId, driverId, dialog.ctx).then(function () {
            cache.drivers = null;
            notify(candidate);
            $m.modal('hide');
            if (typeof dialog.onDone === 'function') dialog.onDone();
        }).catch(function (error) {
            console.error('admin-assign-driver:', error);
            showError(error && (error.code === 'order-moved' || error.code === 'driver-busy')
                ? error.message
                : labels.failed + (error && error.message ? ': ' + error.message : ''));
        }).then(function () {
            dialog.busy = false;
            $m.find('.admin-assign-confirm').prop('disabled', false);
        });
    }

    /** Opens the dialog for one order; `onDone` runs after a successful assign. */
    function open(kind, orderId, onDone) {
        ensureModal();
        var db = firebase.firestore();
        var $m = $('#adminAssignDriverModal');
        dialog = { kind: kind, orderId: orderId, list: [], ctx: {}, onDone: onDone, busy: false };
        $m.find('.admin-assign-order').text('#' + orderId);
        $m.find('.admin-assign-search').val('');
        $m.find('.admin-assign-error').hide();
        $m.find('.admin-assign-confirm').prop('disabled', true);
        $m.find('.admin-assign-list').html('<p class="text-muted mb-0">' + escapeHtml(labels.loading) + '</p>');
        $m.modal('show');

        Promise.all([
            db.collection(KINDS[kind].collection).doc(orderId).get(),
            loadDrivers(db),
            loadNearBy(db),
            loadZones(db)
        ]).then(function (results) {
            var order = results[0].exists ? Object.assign({ id: orderId }, results[0].data()) : null;
            if (!order || !assignState(kind, order).enabled) {
                $m.find('.admin-assign-list').html('');
                showError(labels.orderMoved);
                return;
            }
            var nearBy = results[2] || {};
            dialog.ctx = {
                singleOrderReceive: nearBy.singleOrderReceive === true,
                radiusKm: radiusKmOf(nearBy),
                minWallet: nearBy.minimumDepositToRideAccept,
                orderZoneId: orderZone(kind, order, results[3]),
                deleted: results[1].deleted
            };
            dialog.list = candidates(kind, order, results[1].drivers, dialog.ctx);
            drawList();
            $m.find('.admin-assign-confirm').prop('disabled', false);
        }).catch(function (error) {
            console.error('admin-assign-driver:', error);
            $m.find('.admin-assign-list').html('');
            showError(labels.failed + (error && error.message ? ': ' + error.message : ''));
        });
    }

    window.AdminAssignDriver = {
        KINDS: KINDS,
        labels: labels,
        setLabels: function (extra) { Object.assign(labels, extra || {}); },
        assignState: assignState,
        actionHtml: actionHtml,
        candidates: candidates,
        orderZone: orderZone,
        inPolygon: inPolygon,
        distanceKm: distanceKm,
        driverCopy: driverCopy,
        assign: assign,
        open: open,
        mountCityTabs: mountCityTabs,
        cityActive: cityActive,
        cityKeep: cityKeep,
        cityCount: cityCount,
        NO_CITY: NO_CITY
    };
})(window, window.jQuery);
