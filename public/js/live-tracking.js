/*
 * live-tracking.js
 * ----------------------------------------------------------------------------
 * The engine behind the four god's-eye maps (cab, multivendor, parcel, rental).
 *
 * WHAT THE CLIENT REPORTED
 *   "Live tracking feature in admin panel and remove indian demo vehicles
 *    location. only show my drivers with details."
 *
 * WHAT WAS ACTUALLY ON THE MAP
 *   Of the 282 driver documents in this project, 250 carry a `location`:
 *     139  sit on the eMart demo seed's own coordinates (22.96, 72.61 -
 *          Ahmedabad) and belong to demo accounts imported on 2026-02-23;
 *      58  hold the placeholder 0.01, 0.01 - the Atlantic, off Africa;
 *      53  are scattered over Colombia, Indonesia, Iraq, the Sahara and,
 *          in one case, latitude 73 in the Arctic;
 *      33  are the client's real drivers, in Kohat and Lahore.
 *   Every one of them was drawn. The map also *centred* on Ahmedabad, because
 *   the layout's geolocation fallback was the constant 23.022505, 72.571365.
 *
 * WHAT "LIVE" MEANT
 *   Not a listener - a `setInterval` per marker, each re-reading that driver's
 *   user document every ten seconds. Two hundred and fifty markers therefore
 *   cost 250 document reads every ten seconds, for ever, per open tab; the
 *   intervals were never cleared, and a second draw doubled them. Positions
 *   moved on a ten-second lag and the list beside the map never updated at all.
 *
 * WHAT THIS FILE DOES
 *   - isRealPoint()      rejects the placeholder and impossible coordinates.
 *   - inServiceArea()    keeps a driver only if they are inside a service zone
 *                        the admin has actually drawn in Zones. This is what
 *                        "my drivers" means here: it is the admin's own
 *                        configuration, not a hard-coded country, so it follows
 *                        the client when they add a city. With no published
 *                        zone the test passes everything, so an install that
 *                        has not drawn one yet sees exactly what it saw before.
 *   - watch()            ONE onSnapshot for the whole fleet, so the map is
 *                        genuinely live and costs one subscription rather than
 *                        250 polls per ten seconds.
 *   - details()          the per-driver detail block the client asked for.
 *
 * Requires: firebase-firestore-compat. Loaded from layouts/app.blade.php.
 */
(function (window) {
    'use strict';

    /**
     * Half-width, in degrees, of the dead zone around 0, 0.
     *
     * A driver document that has never received a real fix reads back as
     * `0.01, 0.01` on this project - not exactly zero, so an `!== 0` test lets
     * it through and the marker lands in the Atlantic. The driver app rejects
     * the same band for the same reason (lib/utils/driver_map_location.dart);
     * keeping the two the same means a driver is either plotted in both places
     * or neither.
     */
    var NULL_ISLAND_BAND = 0.05;

    var ZONE_TTL_MS = 10 * 60 * 1000;
    var ZONE_STORE_KEY = 'fs:livetrack:zones';

    /**
     * Drivers deleted in the Admin Panel (public/js/driver-deletion.js).
     *
     * A driver app that was still running when its driver was deleted writes
     * the profile straight back, so a deleted driver used to reappear here with
     * a live position. The Cloud Function `enforceDeletedDrivers` removes such
     * a profile again; this list keeps it off the map in the meantime.
     */
    var DELETED_DRIVERS = 'deleted_drivers';

    /*
     * Is the driver's app actually running? (Session 41)
     *
     * `isActive` is only the online switch as it was last saved. A phone
     * that was switched off, or an app the system killed, never sets it back to
     * false, and the Online switch on the panel's Drivers list writes it too - so
     * on 14 Sep 2026 drivers whose app had not been open for 47 days were drawn
     * here as online and available.
     *
     * A running Firebase app renews its sign-in token about once an hour, and
     * Firebase Authentication records when it last did. The callable
     * driverPresence (functions/products/driver_presence.js) hands that to the
     * page as { login: 'open'|'disabled'|'none', lastActiveAt }. A driver is
     * online only when the switch is on AND the app was active within
     * APP_IDLE_AFTER_MS. A profile with no login, or a blocked one (a deleted
     * driver), is nobody's driver, so it is not drawn.
     *
     * If no answer comes, nothing changes: the switch alone decides, as before,
     * and nobody is hidden.
     */
    var PRESENCE_FUNCTION = 'driverPresence';
    var APP_IDLE_AFTER_MS = 2 * 60 * 60 * 1000;
    var PRESENCE_REFRESH_MS = 5 * 60 * 1000;
    var PRESENCE_WAIT_MS = 5000;
    var PRESENCE_BATCH = 500;

    /** Marker ring colours, the same greens and reds as the car icons. */
    var STATUS_COLOURS = { online: '#078007', offline: '#808080', onTrip: '#c00000' };

    /*
     * Grey versions of images/car_available.png and images/available.png, for
     * a driver who is offline. Embedded rather than shipped as new image files:
     * jeomart.com serves its web root and its application from two different
     * trees, and an image missing from one of them is an invisible marker.
     */
    var OFFLINE_CAR_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAHG0lEQVR42u2bXagc5RnHfzOzSWyskdTEftxIoCZVKhVbaZO0eihKJajBi1xJqUn9iFh6Uy+kIP0XRQutF0JzkbRgkQptFCtpUAwiSYyoYFFEvLCmbSRtU/PVjxhjzu6MF+f/2pfJzO7snv04ac8Ly5mzOzvv8/yfr//zzCzMr//vlQzrQpISIB2T3LmkYk4gKCmTlE5g31RSNjEPsMUJlpD0GeAi4NwR6/4f4C+SDkdAFEAxNgC8ae7jm4DNwFeB88fkAMeAfcAWSbuCQQYJi2RQ5SUtA7YBN0UfD2yJPmWO5f4V8D1J7w8CQjKA8oXdfRfwRaDt66TDTKo9VgHkPs6AF4F1wAmg6AeEtF+wJLWAJ6z8NNCyEONSPsiS+XUaWAs86rDsS460D+tn3mAzsMbKL5gDhWihZVkvaYPDs3F1aPWxUUfSQuD7dsGsxjU7I1a4yttS7/0De+dwQ8DWL4AvAZ/v8t3EoI7yldTokQBXSFphL0iH6QFh028Ebyh9t/A5B4FHHZfJCBLfYmATsCzaM8jXcUiuBv5kUPJhARBc6qqa6pHbNe+StGPEDHA/sLXGCEHGx4aZAxJJHUmLgSsrAAj54ATwsqtEI/T7XOGae6x8VhPOa33cGQoArv0dl73PWeG0wvpvSHrPZKQ9Yg/YD6z03mnJKCudB/bHjHU2STBc+OtR/FeFx74oS49K+ZbBfTkCn4o88LWm+qV9xP/VNfEf/n+hdP4o156Gss66DDaN//eBV8cAQLD4Sz3ywJqmeSDtFf8+vAz4bE384/g/5PjPRxgCAdw/utQlFWEQ54GiFx9Iz5b4D/uZlLXtBd3ywOomOqYN4/+qBvGflNrVUb0C63thwJzVvQzaZVLP3TqSzmlS/22d9qizn6RpH+7tkQdWh/M9vcqsU147D7B7daL/P+GS8nyJehJt/grwzaghGUcrHMLtVfcmMR8Ick4DXwHelnSqTsek/IGki4E77EKfBpb0GHWdBP41gTa4AD4FnNPlnOOeIf4NeA7YKulgDEJSUn4T8DDwSf431xHgdkm/CzonkfK3AI/4xHYFxSwq5nGMkfw0HekVpXAtopANA5wbJO2UlAUPWAG85ekKpXjKS4kmH2CcNo7VqZhLlt8LeesIcAlwNCix2bFUlUwy4BRwAHjPn4+i25stQwyTokPAu06C4b0iSpxtzxO+LakIyk6VWF5Q/iRwj9G6BFgFXGviM1dACEZ7xgObVcAXgEuB+yPyVkRhUwDXALRc55dHH4TXSWCdpL3RZh84m+6W9CRwQ00tHqfbZ8AjTuDxege4V9IfgMdLOS1xhfvYndMKRO+XtFfSIpOjxM3RArvRRsdSOqEkGNz+z8Cd7kNakZyppIWSngJ+XtEcpXWJLLOlf23Fp82eCrO9afflR4HfR/x7EgAA/EbSh0DoEYKcOTOT7NTVLQBWdOsFwoeHgSOerhY1lDRxVzbp9U4Xvh+o7yFT9qRpM3QusKjBZHfJHADgPEndeELiCreoSTcY+usL3AAVjqszyIc945oJcoJgnOssS1LT7BWuDoscqkmvoWioAg8Ae0LMl3rytqRb3WzkEwIg897fknSjpB2+JRb3N6clLQF+VNHM1QIQLnylM+gdkg6W4v82YIvPSybo/mHvxyR9V9L2kpwrnQAvjgyVl2d+i02DLypZMxwfB54G3nZXeDXw5TnEAmPLvujXByZC65zPqvR6TdIVrR7TohxYCtxcUYKSCVufErODmZsia2uYYteJUNEFhKKCQMy1RihudmLK203WIgAQLNmOyEJWunirByGZVE9QvlXei5J3og4xDQBMW4HWgELMRY/oBlgAaTo0Q6clbQAutxcsBx6MamjSowt7Gvithw3j8oTUst7KzMg+7+HqiZngPf6beZB7pnKSlpo6LuwBQNsg/VhdqNgol6StwO2RLN0AOCzpQmpYXeoL5C6Hb/UBwE+BH/q4PSbdw16/BL7TEIAwBfpnaOAk5S0DkJvd5fHIuGlX5u8yjvsClhfv2W8b3raMH5fOdJZZfRwPRTVpiZuem9c2QxGaR8z+mqCbeFY4qXWgoZEK54ATbuOLqm4w3Hg8CTwbcYNucXXa5/ZrjWFZfkfFLKOq9ifATs6ccFcORBLgPuDfLm2BJxSRy7d9oZ9IOhA9RDmu7J97z9eZeWAq8JlOJGduAy0A/go8ZOt3qGNOu3fvLjxLOzY1NfUKcD0zd4nKd2czYJuku8etfCRrqF7POrtfxn/vAYRXxsyIfL2k/VNTU2k5cSY1CIcnwlcAd3vwcSEz9wfeBH4hafugj6iPohGStJGZQe0qW/3vJmk/k/SPJg9MnQFCXHclLfNwoerziTZC4ccblut8P8qfzlrWqp+lDOunKiPIC1kMhN9rld+bLcoJc3+dTbLOr/k1v+bX/Jpf82uC6yN4sBdA92rk2wAAAABJRU5ErkJggg==';
    var OFFLINE_DOT_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABYAAAAUCAYAAACJfM0wAAABIklEQVR42rWVMVLDMBBFn5QmpY5gTkDKlHsD0lKRnIKhW5+AcALGN0ibbrmB6VIxTkcHNzAF8owYG4c44nUe209fo50vxwiqGoA7QIAFUMRXDVADO1Wthv51I9IV8AwExmm+P/+5wOwX6RZ4BOacJgArEXFmZoPitm2dc06Be85HRCSY2b4nds6tY9KpLEXk1cwOLk1bluVbckBT+QSuZknaTZyAS5kD775LC9yQD/HJQ5FRvPDJPF9nFBeef6ITt8Axo7dOE9cZxY2Po9YCllG8SxNXcbgvTquqlU+K5wPYZBBrryvM7CAiAVhOlarq02BtmtleRIjlfg5bVX0Y7WMzexGRY7w1wh9K57ZLevIGSfa2jj1SxIXSq8mASlV7h/4FuKlaW3K5HPgAAAAASUVORK5CYII=';

    function num(value) {
        if (value === null || value === undefined) return NaN;
        if (typeof value === 'number') return value;
        var parsed = parseFloat(value);
        return isNaN(parsed) ? NaN : parsed;
    }

    /**
     * Pull a latitude/longitude pair out of whatever shape the document holds.
     * eMart writes `location` as a plain map here, but a GeoPoint and a
     * `{lat,lng}` pair both turn up in this data set.
     */
    function point(location) {
        if (!location) return null;
        var lat = num(location.latitude !== undefined ? location.latitude : location.lat);
        var lng = num(location.longitude !== undefined ? location.longitude : location.lng);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat: lat, lng: lng };
    }

    /* ---------------------------------------------------------------------
     * Which services a driver is signed up for
     *
     * There are two fields for this, and a driver may carry either.
     *
     *   `serviceType` / `sectionId`    one string - what the Admin Panel writes
     *   `serviceTypes` / `sectionIds`  a list    - what the driver app writes
     *
     * The plural pair is the driver app's own record (UserModel.toJson writes
     * `serviceTypes` and `sectionIds`; the singular ones it only mirrors, and
     * only from the version that added the mirror onwards). So every driver who
     * signed up in the app has the plural fields and, in this project, 25 of the
     * 48 drivers who were online when this was traced had NO singular field at
     * all - including every one of the client's own drivers in Kohat and Lahore.
     *
     * A reader that asks for only one of the two shapes therefore sees only part
     * of the fleet. The panel's own driver list already knows this: /drivers
     * runs `sectionIds array-contains` AND `sectionId ==` and merges the two.
     * ------------------------------------------------------------------- */

    /** The services this driver is signed up for, from whichever field holds them. */
    function serviceFlags(driver) {
        var out = [];
        if (driver && Array.isArray(driver.serviceTypes)) {
            driver.serviceTypes.forEach(function (flag) {
                if (flag && out.indexOf(flag) === -1) out.push(flag);
            });
        }
        if (driver && driver.serviceType && out.indexOf(driver.serviceType) === -1) {
            out.push(driver.serviceType);
        }
        return out;
    }

    /** Does this driver serve `flag`? No flag asked for means no opinion. */
    function servesFlag(driver, flag) {
        if (!flag) return true;
        return serviceFlags(driver).indexOf(flag) !== -1;
    }

    /* ---------------------------------------------------------------------
     * Status and vehicle
     * ------------------------------------------------------------------- */

    /**
     * Is the driver online?
     *
     * `isActive` is the driver app's own online switch (the toggle on each
     * dashboard writes it) and the field the panel's driver list shows as
     * online. `active` is a different thing - whether the admin has enabled
     * the account - and says nothing about being on shift.
     */
    function isOnline(driver) {
        return !!driver && (driver.isActive === true || driver.isActive === 'true');
    }

    /**
     * What a presence answer says about a driver's app:
     *   'awake'     active within APP_IDLE_AFTER_MS
     *   'idle'      has a login, but the app has not been active since
     *   'no-login'  the profile has no login at all
     *   'blocked'   the login is disabled (a deleted driver)
     *   ''          no answer for this driver - nothing is known
     */
    function appState(presence, now) {
        if (!presence || typeof presence !== 'object') return '';
        if (presence.login === 'none') return 'no-login';
        if (presence.login === 'disabled') return 'blocked';
        var at = presence.lastActiveAt ? Date.parse(presence.lastActiveAt) : NaN;
        if (isNaN(at)) return 'idle';
        return ((now === undefined ? Date.now() : now) - at) <= APP_IDLE_AFTER_MS ? 'awake' : 'idle';
    }

    /**
     * Online now: the switch is on and the app is running. With no presence
     * answer the switch alone decides, which is what this page did before.
     */
    function onlineNow(driver, presence, now) {
        if (!isOnline(driver)) return false;
        var state = appState(presence, now);
        return state === '' || state === 'awake';
    }

    /**
     * 'onTrip', 'online' or 'offline' for a plotted entry.
     *
     * On a trip outranks everything: a driver in transit is red whatever their
     * switch says, exactly as before. Otherwise online means onlineNow().
     */
    function statusOf(entry, now) {
        if (entry && entry.onTrip) return 'onTrip';
        return onlineNow(entry && entry.driver, entry && entry.presence, now) ? 'online' : 'offline';
    }

    /**
     * The vehicle a driver has registered: { id, name }.
     *
     * Two shapes are in the data, as with sections:
     *   `vehicleDetails[sectionId]` = { vehicleId, vehicleType, ... }
     *        what the driver app writes, one vehicle per section;
     *   `vehicleId` / `vehicleType` at the top level
     *        what the Admin Panel's driver form writes.
     * The entry for the map's own section wins, then the panel's fields, then
     * any vehicle the driver has registered at all.
     */
    function vehicleOf(driver, sectionId) {
        var out = { id: '', name: '' };
        if (!driver) return out;
        var details = driver.vehicleDetails && typeof driver.vehicleDetails === 'object'
            ? driver.vehicleDetails : null;
        var own = details && sectionId && details[sectionId] && typeof details[sectionId] === 'object'
            ? details[sectionId] : null;
        if (own) {
            out.id = own.vehicleId ? String(own.vehicleId) : '';
            out.name = own.vehicleType ? String(own.vehicleType) : '';
        }
        if (!out.id && driver.vehicleId) out.id = String(driver.vehicleId);
        if (!out.name && driver.vehicleType) out.name = String(driver.vehicleType);
        if (!out.id && !out.name && details) {
            Object.keys(details).some(function (key) {
                var entry = details[key];
                if (!entry || typeof entry !== 'object' || (!entry.vehicleId && !entry.vehicleType)) return false;
                out.id = entry.vehicleId ? String(entry.vehicleId) : '';
                out.name = entry.vehicleType ? String(entry.vehicleType) : '';
                return true;
            });
        }
        return out;
    }

    /** Is this a coordinate a vehicle could actually be at? */
    function isRealPoint(lat, lng) {
        lat = num(lat); lng = num(lng);
        if (isNaN(lat) || isNaN(lng)) return false;
        if (lat > 90 || lat < -90 || lng > 180 || lng < -180) return false;
        if (Math.abs(lat) < NULL_ISLAND_BAND && Math.abs(lng) < NULL_ISLAND_BAND) return false;
        return true;
    }

    /* ---------------------------------------------------------------------
     * Service zones - "my drivers"
     * ------------------------------------------------------------------- */

    var zonePromise = null;

    function readZoneCache() {
        try {
            var raw = window.sessionStorage.getItem(ZONE_STORE_KEY);
            if (!raw) return null;
            var box = JSON.parse(raw);
            if (!box || (Date.now() - box.at) > ZONE_TTL_MS) return null;
            return box.zones;
        } catch (e) { return null; }
    }

    function writeZoneCache(zones) {
        try {
            window.sessionStorage.setItem(ZONE_STORE_KEY,
                JSON.stringify({ at: Date.now(), zones: zones }));
        } catch (e) { /* private mode or quota: read them again next page */ }
    }

    /**
     * Every published zone, as a list of polygons.
     *
     * A zone whose area has fewer than three corners cannot enclose anything
     * and is dropped, so a half-drawn zone never silently empties the map.
     */
    function zones(db) {
        if (zonePromise) return zonePromise;
        var cached = readZoneCache();
        if (cached) {
            zonePromise = Promise.resolve(cached);
            return zonePromise;
        }
        zonePromise = db.collection('zone').where('publish', '==', true).get()
            .then(function (snap) {
                var out = [];
                snap.docs.forEach(function (doc) {
                    var data = doc.data() || {};
                    var ring = [];
                    (data.area || []).forEach(function (corner) {
                        var p = point(corner);
                        if (p) ring.push([p.lat, p.lng]);
                    });
                    if (ring.length >= 3) out.push({ name: data.name || doc.id, ring: ring });
                });
                writeZoneCache(out);
                return out;
            })
            .catch(function (error) {
                // Never let a zone read failure hide the fleet: an empty list
                // means "no zones configured", which passes every driver.
                console.warn('live-tracking: could not read the service zones', error);
                zonePromise = null;
                return [];
            });
        return zonePromise;
    }

    /** Standard ray casting. `ring` is [[lat, lng], ...]. */
    function inRing(lat, lng, ring) {
        var inside = false;
        for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            var yi = ring[i][0], xi = ring[i][1];
            var yj = ring[j][0], xj = ring[j][1];
            if (xi === xj) continue;
            var straddles = (xi > lng) !== (xj > lng);
            if (straddles && lat < (yj - yi) * (lng - xi) / (xj - xi) + yi) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Is this point inside the area the admin serves?
     *
     * True when there is no published zone at all - the admin has not told us
     * what their area is, so nothing is filtered out.
     */
    function inServiceArea(zoneList, lat, lng) {
        if (!zoneList || !zoneList.length) return true;
        for (var i = 0; i < zoneList.length; i++) {
            if (inRing(lat, lng, zoneList[i].ring)) return true;
        }
        return false;
    }

    /** Which zone a point falls in, for the driver's detail block. */
    function zoneNameAt(zoneList, lat, lng) {
        if (!zoneList) return '';
        for (var i = 0; i < zoneList.length; i++) {
            if (inRing(lat, lng, zoneList[i].ring)) return zoneList[i].name;
        }
        return '';
    }

    /**
     * The middle of the admin's service area, for a map that has nothing else
     * to centre on. Averaging every corner of every published zone is rough,
     * but it is their own city rather than the demo data's.
     */
    function serviceAreaCentre(db) {
        return zones(db).then(function (zoneList) {
            var lat = 0, lng = 0, n = 0;
            zoneList.forEach(function (z) {
                z.ring.forEach(function (corner) { lat += corner[0]; lng += corner[1]; n++; });
            });
            return n ? [lat / n, lng / n] : null;
        });
    }

    /* ---------------------------------------------------------------------
     * Which drivers belong on the map
     * ------------------------------------------------------------------- */

    /**
     * Decide whether one driver document should be plotted, and say why not.
     *
     * Returns { show, point, zone, reason }. `reason` is what the admin sees in
     * the "not shown" summary under the list, so a driver who has vanished from
     * the map can be accounted for instead of just being missing.
     */
    function consider(driver, zoneList) {
        if (!driver) return { show: false, reason: 'no driver record' };
        var p = point(driver.location);
        if (!p) return { show: false, reason: 'never sent a location' };
        if (!isRealPoint(p.lat, p.lng)) return { show: false, reason: 'placeholder location' };
        if (!inServiceArea(zoneList, p.lat, p.lng)) {
            return { show: false, reason: 'outside your service zones', point: p };
        }
        return { show: true, point: p, zone: zoneNameAt(zoneList, p.lat, p.lng) };
    }

    /* ---------------------------------------------------------------------
     * Live positions
     * ------------------------------------------------------------------- */

    var watches = [];

    /**
     * Subscribe to a driver query and report every position change.
     *
     * This replaces one `setInterval` per marker. The callback receives
     * (id, driverData) for each document that changed, so a marker moves the
     * moment the driver's app writes, rather than up to ten seconds later.
     *
     * The subscription is torn down when the page goes away; the intervals it
     * replaces were never cleared, so a long-lived tab accumulated them.
     */
    function watch(query, onChange, onError) {
        var stop = query.onSnapshot(function (snapshot) {
            snapshot.docChanges().forEach(function (change) {
                if (change.type === 'removed') {
                    onChange(change.doc.id, null);
                } else {
                    onChange(change.doc.id, change.doc.data());
                }
            });
        }, function (error) {
            console.warn('live-tracking: the position listener stopped', error);
            if (onError) onError(error);
        });
        watches.push(stop);
        return stop;
    }

    function stopAll() {
        watches.splice(0).forEach(function (stop) {
            try { stop(); } catch (e) { /* already gone */ }
        });
    }
    window.addEventListener('pagehide', stopAll);
    window.addEventListener('beforeunload', stopAll);

    /* ---------------------------------------------------------------------
     * Details
     * ------------------------------------------------------------------- */

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function phoneOf(driver) {
        if (!driver || !driver.phoneNumber) return '';
        var code = driver.countryCode ? String(driver.countryCode).trim() + ' ' : '';
        return code + driver.phoneNumber;
    }

    function ratingOf(driver) {
        var sum = parseFloat(driver && driver.reviewsSum);
        var count = parseFloat(driver && driver.reviewsCount);
        if (!count || isNaN(sum) || isNaN(count)) return '';
        return (sum / count).toFixed(1);
    }

    /**
     * "3 minutes ago" for a Firestore Timestamp, a Date, millis or an ISO string.
     * `override` is the app's last activity from driverPresence, when known.
     */
    function lastSeen(driver, labels, override) {
        labels = labels || {};
        var value = override || (driver && (driver.lastOnlineTimestamp || driver.updatedAt));
        var when = null;
        try {
            if (!value) when = null;
            else if (typeof value.toDate === 'function') when = value.toDate();
            else if (value instanceof Date) when = value;
            else if (typeof value === 'number') when = new Date(value);
            else if (typeof value === 'string') when = new Date(value);
        } catch (e) { when = null; }
        if (!when || isNaN(when.getTime())) return '';
        var mins = Math.floor((Date.now() - when.getTime()) / 60000);
        if (mins < 1) return labels.justNow || 'just now';
        if (mins < 60) return mins + (labels.minutes || ' min ago');
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + (labels.hours || ' h ago');
        return when.toLocaleDateString();
    }

    /**
     * The detail rows shown in a marker's popup and in the list beside the map.
     *
     * `labels` carries the translated field names from the Blade view, so this
     * file holds no user-visible English of its own.
     */
    function details(driver, extra, labels) {
        labels = labels || {};
        extra = extra || {};
        var rows = [];
        function add(label, value) {
            if (value === '' || value === null || value === undefined) return;
            rows.push({ label: label, value: String(value) });
        }
        add(labels.phone || 'Phone', phoneOf(driver));
        var vehicle = [driver.carName, driver.carNumber].filter(Boolean).join(' - ');
        add(labels.vehicle || 'Vehicle', vehicle);
        // The configured name from the vehicle type list when the page has it,
        // otherwise the name saved on the driver. `rideType` used to stand in
        // here, but it holds "ride"/"both", not a vehicle.
        add(labels.vehicleType || 'Vehicle type',
            extra.vehicleType !== undefined ? extra.vehicleType : vehicleOf(driver, extra.sectionId).name);
        add(labels.colour || 'Colour', driver.carColor || '');
        add(labels.rating || 'Rating', ratingOf(driver));
        add(labels.zone || 'Zone', extra.zone || '');
        // extra.presence is the driverPresence answer, when the page has one.
        var status;
        if (onlineNow(driver, extra.presence, extra.now)) {
            status = labels.online || 'Online';
        } else if (isOnline(driver) && appState(extra.presence, extra.now) === 'idle') {
            // Switched on, but the app is not running: say so, or the admin
            // sees "Offline" beside a switch that says online.
            status = labels.appNotOpen || 'Offline (app not open)';
        } else {
            status = labels.offline || 'Offline';
        }
        add(labels.status || 'Status', status);
        add(labels.verified || 'Documents',
            driver.isDocumentVerify || driver.isAutoVerify
                ? (labels.yes || 'Verified') : (labels.no || 'Not verified'));
        add(labels.lastSeen || 'Last seen',
            lastSeen(driver, labels, extra.presence && extra.presence.lastActiveAt));
        return rows;
    }

    /** The same rows as HTML, for a Leaflet or Google info window. */
    function detailsHtml(driver, extra, labels) {
        var name = [driver.firstName, driver.lastName].filter(Boolean).join(' ').trim();
        var html = '<div class="live-track-popup p-2">';
        html += '<h6 class="mb-1"><strong>' + escapeHtml(name || '-') + '</strong></h6>';
        details(driver, extra, labels).forEach(function (row) {
            html += '<div class="live-track-row"><span class="live-track-label">' +
                escapeHtml(row.label) + '</span>: ' + escapeHtml(row.value) + '</div>';
        });
        html += '</div>';
        return html;
    }


    /* ---------------------------------------------------------------------
     * The page controller
     *
     * The four god's-eye views (cab, multivendor, parcel, rental) differ only
     * in which collection holds their in-transit work and how an order names
     * its driver, its customer and its two ends. Everything else - the merge,
     * the filtering, the list, the markers, the live subscription, the legend -
     * was copied four times over, and the four copies had drifted: one had lost
     * its section filter, one had a stray `/h4>` in the legend, one never
     * checked that a driver had a location before reading it.
     *
     * So the shared part lives here and each view passes what is its own.
     * ------------------------------------------------------------------- */

    function page(config) {
        var db = config.db;
        var labels = config.labels || {};
        var texts = config.texts || {};
        var reasons = config.reasons || {};
        var sectionId = config.sectionId || '';
        var images = config.images || '';

        /*
         * Where this map's vehicle types are configured, e.g.
         * { collection: 'vehicle_type', iconField: 'vehicle_icon' }. A view that
         * names none still shows the vehicle type saved on each driver.
         */
        var vehicleTypeConfig = config.vehicleTypes || null;
        var vehicleTypeMap = {};     // vehicle type id -> { name, icon }
        var deletedIds = {};         // driverId -> true, from deleted_drivers
        var presenceById = {};       // driverId -> { login, lastActiveAt }, from driverPresence
        var presenceAsked = {};      // driverId -> true once asked about
        var presenceTimer = null;
        var presenceSoon = null;
        var soonIds = [];

        var map = null;
        var mapType = 'ONLINE';
        var markers = {};            // driverId -> marker
        var plotted = {};            // driverId -> { driver, zone, onTrip }
        var zoneList = [];
        var hidden = [];
        var listEl = config.listSelector || '.live-tracking-list';
        var hiddenEl = config.hiddenSelector || '.live-tracking-hidden';

        function t(key, fallback) {
            return texts[key] === undefined ? (fallback || '') : texts[key];
        }

        /* ---- the data ---------------------------------------------------- */

        function sectionName() {
            // A view with no nameSelector has no section name in its heading,
            // so there is nothing to look up for it.
            if (!sectionId || !config.nameSelector) return Promise.resolve('');
            return db.collection('sections').where('id', '==', sectionId).get()
                .then(function (snap) {
                    var doc = snap.docs[0];
                    return doc ? (doc.data().name || '') : '';
                })
                .catch(function () { return ''; });
        }

        function mapChoice() {
            var read = (window.FsSettingsCache && FsSettingsCache.doc)
                ? FsSettingsCache.doc('DriverNearBy')
                : db.collection('settings').doc('DriverNearBy').get().then(function (s) {
                    return s.exists ? s.data() : null;
                });
            return read.then(function (data) {
                return data && data.selectedMapType ? data.selectedMapType : '';
            }).catch(function () { return ''; });
        }

        /**
         * The work in progress, and which drivers are on it.
         *
         * This used to be started alongside the driver query, with neither
         * awaited - whichever resolved first called the renderer, so the
         * in-transit rides were usually missing from the merge entirely.
         */
        function inTransit() {
            var query = config.ordersQuery ? config.ordersQuery(db, sectionId) : null;
            if (!query) return Promise.resolve({ orders: [], driverIds: [] });
            return query.get().then(function (snap) {
                var orders = [], driverIds = [];
                snap.docs.forEach(function (doc) {
                    var order = doc.data();
                    order.id = doc.id;
                    orders.push(order);
                    var driverId = config.orderDriverId ? config.orderDriverId(order) : null;
                    if (driverId) driverIds.push(driverId);
                });
                return { orders: orders, driverIds: driverIds };
            }).catch(function (error) {
                console.warn('live-tracking: could not read the in-transit orders', error);
                return { orders: [], driverIds: [] };
            });
        }

        function fleetQuery() {
            return config.fleetQuery(db, sectionId);
        }

        /**
         * This map's configured vehicle types, by id: { name, icon }.
         *
         * Read whole: each list is a few dozen documents, and a driver's vehicle
         * can belong to another section's list than the one on screen. A failed
         * read leaves each driver's own saved vehicle name in place.
         */
        function vehicleTypeList() {
            if (!vehicleTypeConfig || !vehicleTypeConfig.collection) return Promise.resolve({});
            var iconField = vehicleTypeConfig.iconField || 'vehicle_icon';
            return db.collection(vehicleTypeConfig.collection).get().then(function (snap) {
                var out = {};
                snap.docs.forEach(function (doc) {
                    var data = doc.data() || {};
                    var icon = data[iconField] ? String(data[iconField]) : '';
                    out[doc.id] = {
                        name: data.name ? String(data.name) : '',
                        icon: /^https?:\/\//i.test(icon) ? icon : ''
                    };
                });
                return out;
            }).catch(function (error) {
                console.warn('live-tracking: could not read the vehicle types', error);
                return {};
            });
        }

        /** The drivers deleted in the Admin Panel, as { driverId: true }. */
        function deletedDrivers() {
            return db.collection(DELETED_DRIVERS).get().then(function (snap) {
                var out = {};
                snap.docs.forEach(function (doc) { out[doc.id] = true; });
                return out;
            }).catch(function (error) {
                // Never let this read hide the fleet: an unreadable list hides nobody.
                console.warn('live-tracking: could not read the deleted drivers', error);
                return {};
            });
        }

        /* ---- is the app running? (Session 41) --------------------------- */

        function presenceUrl() {
            var projectId = config.projectId || '';
            try {
                if (!projectId && window.firebase && window.firebase.apps && window.firebase.apps.length) {
                    projectId = window.firebase.app().options.projectId || '';
                }
            } catch (e) { projectId = ''; }
            return projectId ? 'https://us-central1-' + projectId + '.cloudfunctions.net/' + PRESENCE_FUNCTION : '';
        }

        /** One call to driverPresence. Resolves its result, or null; never rejects. */
        function askPresence(ids) {
            var asked;
            if (typeof config.presence === 'function') {
                asked = Promise.resolve().then(function () { return config.presence(ids); });
            } else {
                var url = presenceUrl();
                if (!url || typeof window.fetch !== 'function') return Promise.resolve(null);
                asked = window.fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ data: { uids: ids } })
                }).then(function (response) {
                    return response.ok ? response.json() : null;
                }).then(function (body) {
                    return body && body.result ? body.result : null;
                });
            }
            return asked.catch(function (error) {
                console.warn('live-tracking: driver presence unavailable; the online switch alone decides', error);
                return null;
            });
        }

        /** Ask about these drivers. Resolves true when any answer arrived. */
        function fetchPresence(ids) {
            var wanted = [];
            (ids || []).forEach(function (id) {
                if (id && wanted.indexOf(String(id)) === -1) wanted.push(String(id));
            });
            if (!wanted.length) return Promise.resolve(false);
            wanted.forEach(function (id) { presenceAsked[id] = true; });
            var batches = [];
            for (var i = 0; i < wanted.length; i += PRESENCE_BATCH) batches.push(wanted.slice(i, i + PRESENCE_BATCH));
            return Promise.all(batches.map(askPresence)).then(function (answers) {
                var got = false;
                answers.forEach(function (answer) {
                    if (!answer || !answer.drivers || typeof answer.drivers !== 'object') return;
                    got = true;
                    Object.keys(answer.drivers).forEach(function (id) {
                        presenceById[id] = answer.drivers[id];
                    });
                });
                return got;
            });
        }

        /** A promise's value, or `fallback` after `ms` - whichever comes first. */
        function within(promise, ms, fallback) {
            return new Promise(function (resolve) {
                var timer = window.setTimeout(function () { resolve(fallback); }, ms);
                promise.then(function (value) {
                    window.clearTimeout(timer);
                    resolve(value);
                }, function () {
                    window.clearTimeout(timer);
                    resolve(fallback);
                });
            });
        }

        /**
         * Why a driver who passed consider() is still not drawn, or '' if they
         * are: a profile with no login, or a blocked login, is nobody's driver.
         */
        function presenceReason(id) {
            var state = appState(presenceById[id]);
            if (state === 'no-login') return 'no app login';
            if (state === 'blocked') return 'login blocked';
            return '';
        }

        /** The name and icon to show for a driver's vehicle. */
        function vehicleFor(driver) {
            var vehicle = vehicleOf(driver, sectionId);
            var configured = vehicle.id ? vehicleTypeMap[vehicle.id] : null;
            return {
                name: (configured && configured.name) || vehicle.name,
                icon: (configured && configured.icon) || ''
            };
        }

        /** Many ids, few round trips - or one at a time if PanelSpeed is absent. */
        function manyUsers(ids) {
            if (window.PanelSpeed && PanelSpeed.docs) {
                return PanelSpeed.docs(db, 'users', ids);
            }
            var out = {};
            return Promise.all(ids.map(function (id) {
                return db.collection('users').doc(id).get().then(function (snap) {
                    out[id] = snap.exists ? snap.data() : null;
                });
            })).then(function () { return out; });
        }

        /* ---- the list --------------------------------------------------- */

        function nameOf(user) {
            if (!user) return '';
            return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
        }

        function boxOpen(driver, verdict) {
            return '<div class="live-tracking-box track-from" data-driver="' +
                escapeHtml(driver.id) + '" data-lat="' + verdict.point.lat +
                '" data-lng="' + verdict.point.lng + '">';
        }

        function detailLines(driver, verdict) {
            var rows = details(driver, {
                zone: verdict.zone, vehicleType: vehicleFor(driver).name, presence: presenceById[driver.id]
            }, labels);
            return '<div class="live-tracking-details">' + rows.map(function (row) {
                return '<span class="live-tracking-detail"><b>' + escapeHtml(row.label) +
                    '</b>: ' + escapeHtml(row.value) + '</span>';
            }).join('') + '</div>';
        }

        function driverHeading(driver) {
            return '<h3 class="drier-name">' + escapeHtml(t('driverName', 'Driver')) + ' : ' +
                escapeHtml(nameOf(driver) || '-') + '</h3>';
        }

        /** A driver not on a trip: green "Available" when online, grey "Offline" when not. */
        function availableEntry(driver, verdict) {
            var badge = onlineNow(driver, presenceById[driver.id])
                ? '<span class="badge badge-success">' + escapeHtml(t('available', 'Available')) + '</span>'
                : '<span class="badge badge-secondary">' + escapeHtml(labels.offline || 'Offline') + '</span>';
            return boxOpen(driver, verdict) +
                '<div class="live-tracking-inner">' +
                '<span class="listicon"></span>' +
                driverHeading(driver) +
                detailLines(driver, verdict) +
                badge +
                '</div></div>';
        }

        function inTransitEntry(order, driver, customer, verdict) {
            var html = boxOpen(driver, verdict) + '<div class="live-tracking-inner">' +
                '<span class="listicon"></span>' + driverHeading(driver);
            var customerName = nameOf(customer);
            if (customerName) {
                html += '<h4 class="user-name">' + escapeHtml(t('userName', 'Customer')) +
                    ' : ' + escapeHtml(customerName) + '</h4>';
            }
            var route = config.orderRoute ? config.orderRoute(order) : null;
            if (route && (route.from || route.to)) {
                html += '<div class="location-ride">' +
                    '<div class="from-ride"><span>' + escapeHtml(route.from || '-') + '</span></div>' +
                    '<div class="to-ride"><span>' + escapeHtml(route.to || '-') + '</span></div>' +
                    '</div>';
            }
            html += detailLines(driver, verdict);
            html += '<span class="badge badge-danger">' + escapeHtml(t('inTransit', 'In Transit')) + '</span>';
            var link = config.orderLink ? config.orderLink(order) : '';
            if (link) {
                html += '&nbsp;&nbsp;<a href="' + escapeHtml(link) +
                    '" class="badge badge-info" target="_blank">' +
                    escapeHtml(t('orderId', 'Order')) + ' : ' +
                    escapeHtml(String(order.id).substring(0, 7)) + '</a>';
            }
            return html + '</div></div>';
        }

        /**
         * Say what is NOT on the map and why.
         *
         * Filtering demo data out would otherwise be indistinguishable from
         * losing data, which is the very complaint it answers.
         */
        function hiddenSummary() {
            if (!hidden.length) return '';
            var byReason = {};
            hidden.forEach(function (item) {
                var key = reasons[item.reason] || item.reason;
                byReason[key] = (byReason[key] || 0) + 1;
            });
            var parts = Object.keys(byReason).map(function (reason) {
                return byReason[reason] + ' ' + escapeHtml(reason);
            });
            return '<div class="live-tracking-hidden-note text-muted small p-2">' +
                escapeHtml(t('hiddenSummary', 'Not shown on the map')) + ': ' +
                parts.join(', ') + '</div>';
        }

        function render(data) {
            var html = '';
            hidden = [];
            plotted = {};

            data.orders.forEach(function (order) {
                var driverId = config.orderDriverId ? config.orderDriverId(order) : null;
                var driver = driverId ? data.drivers[driverId] : null;
                // A deleted driver is not "hidden" - they no longer exist - so
                // they are neither drawn nor counted in the note under the list.
                if (!driver || deletedIds[driverId]) return;
                driver.id = driverId;
                var verdict = consider(driver, zoneList);
                if (!verdict.show) { hidden.push({ driver: driver, reason: verdict.reason }); return; }
                var customerId = config.orderCustomerId ? config.orderCustomerId(order) : null;
                html += inTransitEntry(order, driver, customerId ? data.customers[customerId] : null, verdict);
                plotted[driverId] = { driver: driver, zone: verdict.zone, onTrip: true, presence: presenceById[driverId] };
            });

            data.fleet.forEach(function (entry) {
                if (data.busy.indexOf(entry.id) !== -1) return;   // already listed as in transit
                if (deletedIds[entry.id]) return;                  // deleted in the Admin Panel
                var driver = entry.data;
                driver.id = entry.id;
                var verdict = consider(driver, zoneList);
                if (!verdict.show) { hidden.push({ driver: driver, reason: verdict.reason }); return; }
                var notADriver = presenceReason(entry.id);
                if (notADriver) { hidden.push({ driver: driver, reason: notADriver }); return; }
                if (!driver.firstName && !driver.lastName) return;
                html += availableEntry(driver, verdict);
                plotted[entry.id] = { driver: driver, zone: verdict.zone, onTrip: false, presence: presenceById[entry.id] };
            });

            window.jQuery(listEl).html(html ||
                ('<div class="live-tracking-empty p-3 text-muted">' +
                 escapeHtml(t('noDrivers', 'No drivers to show.')) + '</div>'));
            window.jQuery(hiddenEl).html(hiddenSummary());
        }

        /* ---- the map ---------------------------------------------------- */

        function buildMap(centre) {
            var legend = document.getElementById('legend');
            if (mapType == 'OFFLINE') {
                // A second draw on the same div throws "Map container is already
                // initialized", which used to leave the page with no map at all.
                if (map && map.remove) { map.remove(); map = null; }
                var container = window.L.DomUtil.get('map');
                if (container != null) { container._leaflet_id = null; }
                map = window.L.map('map').setView(centre, 11);
                window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap'
                }).addTo(map);
            } else {
                map = new google.maps.Map(document.getElementById('map'), {
                    zoom: 11,
                    center: new google.maps.LatLng(centre[0], centre[1]),
                    streetViewControl: false,
                    mapTypeId: google.maps.MapTypeId.ROADMAP
                });
            }
            if (legend) buildLegend(legend);
            return map;
        }

        function buildLegend(legend) {
            var entries = [
                { name: t('available', 'Available'), icon: images + '/available.png' },
                { name: labels.offline || 'Offline', icon: OFFLINE_DOT_ICON },
                { name: t('inTransit', 'In Transit'), icon: images + '/ontrip.png' }
            ];
            entries.forEach(function (entry) {
                var div = document.createElement('div');
                div.innerHTML = '<img src="' + entry.icon + '" style="width:14px;margin-right:5px"> ' +
                    escapeHtml(entry.name);
                legend.appendChild(div);
            });
            if (mapType == 'OFFLINE') {
                var control = window.L.control({ position: 'bottomleft' });
                control.onAdd = function () {
                    var div = window.L.DomUtil.create('div', 'legend');
                    div.appendChild(legend);
                    return div;
                };
                control.addTo(map);
            } else {
                map.controls[google.maps.ControlPosition.LEFT_BOTTOM].push(legend);
            }
        }

        /**
         * The status car: green when available, grey when offline, red on a trip.
         *
         * It used to be green for every driver not on a trip, so a driver who
         * had switched off hours ago looked exactly like one waiting for a ride.
         */
        function iconFor(entry) {
            var status = statusOf(entry);
            if (status === 'onTrip') return images + '/car_on_trip.png';
            if (status === 'online') return images + '/car_available.png';
            return OFFLINE_CAR_ICON;
        }

        /**
         * How a driver's marker looks: their status, plus their vehicle type's
         * own icon from the panel's Vehicle Type list when there is one. `key`
         * changes whenever the marker has to be redrawn.
         */
        function lookOf(entry) {
            var status = statusOf(entry);
            var vehicle = vehicleFor(entry.driver);
            return { status: status, car: iconFor(entry), vehicleIcon: vehicle.icon, key: status + '|' + vehicle.icon };
        }

        /*
         * A vehicle type's icon inside a ring in the status colour.
         *
         * The icon is the admin's own picture of the vehicle - a Corolla, a
         * CD 70, a Suzuki carry van - so the status cannot be painted onto it:
         * it is the ring, and for an offline driver the picture also turns grey.
         * A picture that will not load is replaced by the status car.
         */
        function pinHtml(look) {
            var colour = STATUS_COLOURS[look.status] || STATUS_COLOURS.offline;
            var picture = look.status === 'offline' ? ';filter:grayscale(1);opacity:.75' : '';
            var fallback = String(look.car).replace(/['"\\]/g, '');
            return '<div class="live-track-pin live-track-pin--' + look.status + '" style="width:36px;height:36px;' +
                'box-sizing:border-box;border-radius:50%;background:#fff;border:4px solid ' + colour + ';' +
                'box-shadow:0 1px 4px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;overflow:hidden">' +
                '<img src="' + escapeHtml(look.vehicleIcon) + '" alt="" style="width:24px;height:24px;object-fit:contain' + picture + '"' +
                ' onerror="this.onerror=null;this.src=\'' + fallback + '\';this.style.filter=\'none\';this.style.opacity=1">' +
                '</div>';
        }

        function leafletIcon(look) {
            if (!look.vehicleIcon) return window.L.icon({ iconUrl: look.car, iconSize: [25, 25] });
            return window.L.divIcon({
                className: 'live-track-marker',
                html: pinHtml(look),
                iconSize: [36, 36],
                iconAnchor: [18, 18],
                popupAnchor: [0, -18]
            });
        }

        /** Google's classic Marker takes an image, not HTML, so it gets the status car. */
        function googleIcon(look) {
            return { url: look.car, scaledSize: new google.maps.Size(25, 25) };
        }

        function popupHtml(entry) {
            return detailsHtml(entry.driver,
                { zone: entry.zone, vehicleType: vehicleFor(entry.driver).name, presence: entry.presence }, labels);
        }

        function placeMarker(driverId, entry) {
            var p = point(entry.driver.location);
            if (!p) return;
            var html = popupHtml(entry);
            var look = lookOf(entry);
            if (mapType == 'OFFLINE') {
                var marker = window.L.marker([p.lat, p.lng], {
                    icon: leafletIcon(look)
                }).addTo(map);
                marker.bindPopup(html);
                marker.__look = look.key;
                markers[driverId] = marker;
            } else {
                var gmarker = new google.maps.Marker({
                    position: new google.maps.LatLng(p.lat, p.lng),
                    icon: googleIcon(look),
                    map: map
                });
                var info = new google.maps.InfoWindow({ content: html });
                gmarker.addListener('click', function () { info.open(map, gmarker); });
                gmarker.__info = info;
                gmarker.__look = look.key;
                markers[driverId] = gmarker;
            }
        }

        /**
         * Frame the drivers, not the paperwork.
         *
         * The centre the layout works out is a fallback - the browser's
         * position, or the middle of every published zone averaged together,
         * which for a country-sized zone is a field in the middle of nowhere
         * with no driver in sight. Once there are markers, the map should show
         * them; the resolved centre is only for when there are none.
         *
         * maxZoom keeps a single driver, or two parked beside each other, from
         * filling the screen with one building.
         */
        function frameMarkers() {
            var points = [];
            Object.keys(plotted).forEach(function (id) {
                var p = point(plotted[id].driver.location);
                if (p) points.push(p);
            });
            if (!points.length || !map) return;
            try {
                if (mapType == 'OFFLINE') {
                    map.fitBounds(points.map(function (p) { return [p.lat, p.lng]; }),
                        { padding: [40, 40], maxZoom: 14 });
                } else {
                    var bounds = new google.maps.LatLngBounds();
                    points.forEach(function (p) { bounds.extend(new google.maps.LatLng(p.lat, p.lng)); });
                    map.fitBounds(bounds);
                    var once = google.maps.event.addListenerOnce(map, 'idle', function () {
                        if (map.getZoom() > 14) map.setZoom(14);
                    });
                }
            } catch (e) {
                // A map that will not take bounds keeps the centre it opened on.
            }
        }

        function drawMarkers() {
            Object.keys(markers).forEach(function (id) {
                if (plotted[id]) return;
                removeMarker(id);
            });
            Object.keys(plotted).forEach(function (id) {
                if (markers[id]) { moveMarker(id, plotted[id]); } else { placeMarker(id, plotted[id]); }
            });
        }

        function removeMarker(id) {
            var marker = markers[id];
            if (!marker) return;
            try {
                if (mapType == 'OFFLINE') { map.removeLayer(marker); } else { marker.setMap(null); }
            } catch (e) { /* already off the map */ }
            delete markers[id];
        }

        function moveMarker(id, entry) {
            var marker = markers[id];
            var p = point(entry.driver.location);
            if (!marker || !p) return;
            // A driver switching on or off changes colour where they stand,
            // instead of keeping the colour they had when the page opened.
            var look = lookOf(entry);
            var restyle = marker.__look !== look.key;
            if (mapType == 'OFFLINE') {
                marker.setLatLng([p.lat, p.lng]);
                marker.setPopupContent(popupHtml(entry));
                if (restyle && marker.setIcon) marker.setIcon(leafletIcon(look));
            } else {
                marker.setPosition(new google.maps.LatLng(p.lat, p.lng));
                if (marker.__info) {
                    marker.__info.setContent(popupHtml(entry));
                }
                if (restyle && marker.setIcon) marker.setIcon(googleIcon(look));
            }
            marker.__look = look.key;
        }

        /* ---- live ------------------------------------------------------- */

        var fleetDocs = {};            // driverId -> data, merged across the queries
        var streamMembers = [];        // per query: { driverId: true }
        var queued = [];               // changes that arrived before the first render
        var ready = false;
        var onUpdate = null;

        /**
         * The queries that between them name this map's fleet.
         *
         * A view may hand back one query, as all four used to, or several.
         * Several is how an OR is spelt in the compat SDK: a driver's section
         * lives in `sectionId` or in `sectionIds` and no single Firestore query
         * can ask for either, so the view asks for both and they are merged
         * here. See serviceFlags() above for why both shapes are in the data.
         */
        function fleetQueries() {
            var asked = fleetQuery();
            if (!asked) return [];
            return Array.isArray(asked) ? asked.filter(Boolean) : [asked];
        }

        /**
         * Does this driver belong to the service this map shows?
         *
         * Only asked where the view's own query filtered on `serviceType` and
         * its second query cannot: `serviceTypes array-contains X` together with
         * `sectionIds array-contains X` is two array-contains filters, which
         * Firestore rejects outright. The section query therefore comes back
         * unfiltered by service and is narrowed to the same set here.
         */
        function servesThisMap(driver) {
            return servesFlag(driver, config.serviceFlag);
        }

        /** The merged fleet, in the shape render() and load() read. */
        function fleetList() {
            return Object.keys(fleetDocs).map(function (id) {
                return { id: id, data: fleetDocs[id] };
            });
        }

        /** Is this driver still returned by any of the fleet queries? */
        function inAnyStream(id) {
            for (var i = 0; i < streamMembers.length; i++) {
                if (streamMembers[i][id]) return true;
            }
            return false;
        }

        /**
         * Fold one query's change into the merged fleet.
         *
         * A driver both queries return - the singular field and the plural one
         * both name this section - is one entry, not two, and dropping out of
         * one query does not take them off the map while the other still
         * returns them. Answers null when nothing the map can see has changed.
         */
        function absorb(index, change) {
            var id = change.doc.id;
            var gone = change.type === 'removed';
            var driver = gone ? null : change.doc.data();

            if (gone || !servesThisMap(driver)) {
                delete streamMembers[index][id];
                if (inAnyStream(id)) return null;
                if (!Object.prototype.hasOwnProperty.call(fleetDocs, id)) return null;
                delete fleetDocs[id];
                return { id: id, data: null };
            }
            streamMembers[index][id] = true;
            fleetDocs[id] = driver;
            return { id: id, data: driver };
        }

        /**
         * Subscribe to the fleet once, and use the subscriptions' FIRST
         * snapshots as the initial load.
         *
         * Two things this avoids. A `setInterval` per marker, each re-reading one
         * user document every ten seconds, never cleared - which is what "live"
         * used to mean here. And reading the fleet twice, once with get() for the
         * first draw and again to subscribe: the first snapshot of a listener is
         * the same answer get() would have given.
         *
         * Changes that arrive before the first draw has finished are queued
         * rather than dropped, because the zone list they are judged against is
         * still being fetched at that point.
         */
        function subscribeFleet() {
            var queries = fleetQueries();
            fleetDocs = {};
            streamMembers = queries.map(function () { return {}; });

            return new Promise(function (resolve, reject) {
                var settled = false;
                var answered = queries.map(function () { return false; });
                var graceTimer = null;
                var failures = 0;
                var lastError = null;

                function allAnswered() {
                    for (var i = 0; i < answered.length; i++) {
                        if (!answered[i]) return false;
                    }
                    return true;
                }

                function settle() {
                    if (settled) return;
                    settled = true;
                    if (graceTimer) window.clearTimeout(graceTimer);
                    resolve(fleetList());
                }

                if (!queries.length) { settle(); return; }

                queries.forEach(function (query, index) {
                    var stop = query.onSnapshot(function (snapshot) {
                        /*
                         * The FIRST event from a listener is not necessarily the
                         * server's answer.
                         *
                         * Firestore serves a listener from the local cache
                         * straight away so the UI has something to draw, and this
                         * page has already read a few user documents by the time
                         * it subscribes - so that first snapshot held ONE driver
                         * out of 43 and the map came up empty with "1 outside your
                         * service zones" under it. `metadata.fromCache` is how the
                         * SDK says so; wait for the answer that is not from the
                         * cache, from every query.
                         *
                         * A panel with no connection would then never draw at all,
                         * so whatever the cache gave is used if nothing better has
                         * arrived shortly.
                         */
                        var fromCache = snapshot.metadata && snapshot.metadata.fromCache;
                        snapshot.docChanges().forEach(function (change) {
                            var update = absorb(index, change);
                            if (!update || !settled) return;
                            if (!ready) { queued.push(update); return; }
                            applyDoc(update.id, update.data);
                        });
                        if (!settled) {
                            if (!fromCache) {
                                answered[index] = true;
                                if (allAnswered()) settle();
                            } else if (!graceTimer) {
                                graceTimer = window.setTimeout(function () {
                                    console.warn('live-tracking: drawing from the local cache; ' +
                                        'the server has not answered yet');
                                    settle();
                                }, 6000);
                            }
                            return;
                        }
                        if (ready && onUpdate) onUpdate();
                    }, function (error) {
                        /*
                         * One query failing must not take the fleet with it: the
                         * other shape may still be answering, and half the drivers
                         * on the map beats none. Only when every query has failed
                         * is there nothing to draw.
                         */
                        console.warn('live-tracking: a position listener stopped', error);
                        lastError = error;
                        failures++;
                        if (settled) return;
                        if (failures >= queries.length) {
                            settled = true;
                            if (graceTimer) window.clearTimeout(graceTimer);
                            reject(lastError);
                            return;
                        }
                        answered[index] = true;
                        if (allAnswered()) settle();
                    });
                    watches.push(stop);
                });
            });
        }

        /** Take a driver who has gone off the map off the list beside it, too. */
        function removeListEntry(id) {
            var $ = window.jQuery;
            var boxes = $ ? $(listEl + ' .live-tracking-box') : null;
            if (!boxes || typeof boxes.filter !== 'function') return;
            boxes.filter(function () {
                return String($(this).attr('data-driver')) === String(id);
            }).remove();
        }

        /** One driver appeared, moved or went away. */
        function applyDoc(id, driver) {
            // A deleted driver whose app writes the profile back is not drawn:
            // enforceDeletedDrivers removes that profile again moments later.
            if (!driver || deletedIds[id]) {
                var wasShown = !!plotted[id];
                delete plotted[id];
                removeMarker(id);
                if (wasShown) removeListEntry(id);
                return;
            }
            driver.id = id;
            var verdict = consider(driver, zoneList);
            if (!verdict.show) {
                if (plotted[id]) { delete plotted[id]; removeMarker(id); }
                return;
            }
            if (presenceReason(id)) {
                var wasListed = !!plotted[id];
                delete plotted[id];
                removeMarker(id);
                if (wasListed) removeListEntry(id);
                return;
            }
            var wasOnTrip = plotted[id] ? plotted[id].onTrip : false;
            plotted[id] = { driver: driver, zone: verdict.zone, onTrip: wasOnTrip, presence: presenceById[id] };
            if (markers[id]) { moveMarker(id, plotted[id]); } else { placeMarker(id, plotted[id]); }
            // A driver this page has not asked about yet - they switched on, or
            // joined the section, after the page opened.
            if (!presenceAsked[id]) askSoon(id);
        }

        /** Gather the drivers who turn up live into one presence call a moment later. */
        function askSoon(id) {
            presenceAsked[id] = true;
            if (soonIds.indexOf(id) === -1) soonIds.push(id);
            if (presenceSoon) return;
            presenceSoon = window.setTimeout(function () {
                presenceSoon = null;
                fetchPresence(soonIds.splice(0)).then(function (got) { if (got) applyPresence(); });
            }, 1500);
        }

        /** Ask again whether each driver's app is running, and redraw what changed. */
        function refreshPresence() {
            var ids = Object.keys(fleetDocs);
            Object.keys(plotted).forEach(function (id) { if (ids.indexOf(id) === -1) ids.push(id); });
            return fetchPresence(ids).then(function (got) {
                if (got) applyPresence();
                return got;
            });
        }

        /** Re-judge every drawn driver against the latest presence answers. */
        function applyPresence() {
            Object.keys(plotted).forEach(function (id) {
                var entry = plotted[id];
                entry.presence = presenceById[id];
                if (!entry.onTrip && presenceReason(id)) {
                    delete plotted[id];
                    removeMarker(id);
                    removeListEntry(id);
                    return;
                }
                if (markers[id]) moveMarker(id, entry);
                updateListEntry(id, entry);
            });
        }

        /** Redraw one available driver's entry in the list beside the map. */
        function updateListEntry(id, entry) {
            if (entry.onTrip) return;
            var $ = window.jQuery;
            var boxes = $ ? $(listEl + ' .live-tracking-box') : null;
            if (!boxes || typeof boxes.filter !== 'function') return;
            var p = point(entry.driver.location);
            if (!p) return;
            boxes.filter(function () {
                return String($(this).attr('data-driver')) === String(id);
            }).replaceWith(availableEntry(entry.driver, { point: p, zone: entry.zone }));
        }

        /** Start acting on live changes, replaying anything that arrived early. */
        function goLive(hook) {
            onUpdate = hook || null;
            ready = true;
            queued.splice(0).forEach(function (update) { applyDoc(update.id, update.data); });
            if (onUpdate) onUpdate();
            // An app that closes, or opens, while the page stays up.
            if (presenceTimer === null) {
                presenceTimer = window.setInterval(refreshPresence, PRESENCE_REFRESH_MS);
                window.addEventListener('pagehide', function () { window.clearInterval(presenceTimer); });
            }
        }

        /* ---- wiring ----------------------------------------------------- */

        function bindInteractions() {
            var $ = window.jQuery;
            $(document).on('click', '.ride-list .track-from', function () {
                var lat = parseFloat($(this).data('lat'));
                var lng = parseFloat($(this).data('lng'));
                var driverId = $(this).data('driver');
                if (isNaN(lat) || isNaN(lng) || !map) return;
                if (mapType == 'OFFLINE') {
                    map.setView([lat, lng], map.getZoom());
                    if (markers[driverId]) markers[driverId].openPopup();
                } else {
                    map.panTo(new google.maps.LatLng(lat, lng));
                    if (markers[driverId]) google.maps.event.trigger(markers[driverId], 'click');
                }
            });
            $('#search').on('keyup', function () {
                var filter = $(this).val();
                $(listEl + ' .live-tracking-box').each(function () {
                    $(this).toggle($(this).text().search(new RegExp(filter, 'i')) >= 0);
                });
            });
        }

        /**
         * Everything the page needs, asked for at once.
         *
         * The section name, the map-type setting, the zones, the in-transit
         * orders and the fleet do not depend on one another. Asked in a chain
         * they were five round trips deep; asked together they are one wide.
         */
        async function load() {
            // Started first so it is in flight while the rest is fetched.
            var fleetFirst = subscribeFleet();
            var results = await Promise.all([
                sectionName(), mapChoice(), zones(db), inTransit(), vehicleTypeList(), deletedDrivers()
            ]);
            var name = results[0];
            if (results[1] === 'osm') mapType = 'OFFLINE';
            zoneList = results[2] || [];
            var orders = results[3].orders;
            var busy = results[3].driverIds;
            vehicleTypeMap = results[4] || {};
            deletedIds = results[5] || {};
            var fleet = await fleetFirst;

            if (name && config.nameSelector) window.jQuery(config.nameSelector).text(name);

            var wanted = {};
            fleet.forEach(function (entry) { wanted[entry.id] = true; });
            busy.forEach(function (id) { wanted[id] = true; });

            var customerIds = orders
                .map(function (o) { return config.orderCustomerId ? config.orderCustomerId(o) : null; })
                .filter(Boolean);

            // Whether each driver's app is running travels alongside the profile
            // read; the first draw waits for it a few seconds at most.
            var answers = await Promise.all([
                manyUsers(Object.keys(wanted).concat(customerIds)),
                within(fetchPresence(Object.keys(wanted)), PRESENCE_WAIT_MS, false)
            ]);
            var people = answers[0];

            render({
                orders: orders,
                busy: busy,
                drivers: people,
                customers: people,
                fleet: fleet
            });
            return { mapType: mapType };
        }

        return {
            /** Fetch and draw the list. Resolves once the list is on screen. */
            load: load,
            /** Build the map and plot what load() accepted. */
            draw: function (centre) {
                buildMap(centre);
                drawMarkers();
                frameMarkers();
                return map;
            },
            /** Act on live changes from here on. */
            live: function (hook) { goLive(hook); },
            /** Ask again whether each driver's app is running (every 5 minutes once live). */
            refreshPresence: refreshPresence,
            bind: bindInteractions,
            /** What is on screen, for the tests and for the views' own tweaks. */
            state: function () {
                return { mapType: mapType, plotted: plotted, hidden: hidden, zones: zoneList, markers: markers, presence: presenceById };
            }
        };
    }

    window.LiveTrack = {
        NULL_ISLAND_BAND: NULL_ISLAND_BAND,
        point: point,
        isRealPoint: isRealPoint,
        serviceFlags: serviceFlags,
        servesFlag: servesFlag,
        isOnline: isOnline,
        appState: appState,
        onlineNow: onlineNow,
        APP_IDLE_AFTER_MS: APP_IDLE_AFTER_MS,
        PRESENCE_FUNCTION: PRESENCE_FUNCTION,
        statusOf: statusOf,
        vehicleOf: vehicleOf,
        STATUS_COLOURS: STATUS_COLOURS,
        DELETED_DRIVERS: DELETED_DRIVERS,
        zones: zones,
        inServiceArea: inServiceArea,
        zoneNameAt: zoneNameAt,
        serviceAreaCentre: serviceAreaCentre,
        consider: consider,
        watch: watch,
        stopAll: stopAll,
        details: details,
        detailsHtml: detailsHtml,
        lastSeen: lastSeen,
        escapeHtml: escapeHtml,
        page: page,
        _internals: { inRing: inRing, num: num, ratingOf: ratingOf, phoneOf: phoneOf }
    };
})(window);
