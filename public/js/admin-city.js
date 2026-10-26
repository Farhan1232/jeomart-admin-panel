/*
 * AdminCity: city-wise admins and per-city sections / vehicle types.
 *
 * Cities are the published Firestore `zone` documents (the same ones the City
 * tabs on the order lists use).
 *
 *   window.ADMIN_CITY            set by layouts/admin_city_script from the
 *                                admin_user_cities table: { id, name } when
 *                                the logged-in admin is limited to one city,
 *                                null otherwise.
 *   AdminCity.current()          that city, or null.
 *   AdminCity.keep(zoneId)       should a row of this city be listed? Always
 *                                true for an admin who is not limited.
 *
 *   AdminCity.mountSelect(db, select, nameInput, selectedId)
 *                                fills a <select> with "All cities" + cities
 *                                (admin user create/edit).
 *   AdminCity.mountPicker(db, container, selectedIds)
 *   AdminCity.pickerFields(container)
 *                                a city checkbox list for a section or a
 *                                vehicle type, saved as `zoneIds`. Nothing
 *                                ticked = every city, which is how every
 *                                section and vehicle type worked before.
 *
 * An admin who is not limited, and a form whose city list could not be read,
 * behave exactly as before: pickerFields() then returns {} so a save never
 * clears cities it did not show.
 *
 * A city admin manages only their own city's vehicle types:
 *   AdminCity.access(zoneIds)    'own' (only their city ticked), 'shared' (no
 *                                city ticked = every city, or more cities than
 *                                theirs), 'other' (not available in their city).
 *                                Always 'own' for an admin who is not limited.
 *   mountPicker / pickerFields   the Cities box shows just their city and saves
 *                                it as [their city].
 *   AdminCity.guardEdit(button, zoneIds)
 *                                a 'shared' one is read-only: Save is removed.
 *
 * On-demand bookings, services and providers save no city, so they are placed
 * by where they are, the same way the order lists place a ride:
 *   AdminCity.ownZone(db)        the admin's city with its border { id, area },
 *                                or null for an admin who is not limited.
 *   AdminCity.keepPlace(zone, zoneIds, points)
 *                                true when any saved city id is the city, or
 *                                any point is inside its border. Always true
 *                                for zone null (not limited).
 *   AdminCity.cityProviders(db, sectionId)
 *                                { providerId: true } for the providers in the
 *                                city: their own city or location, or any of
 *                                their services' addresses. null when not limited.
 */
(function (root) {
    'use strict';

    var labels = {
        allCities: 'All cities',
        allCitiesHelp: 'Nothing ticked = available in all cities.',
        noCities: 'No cities found. Add one under Zones first.',
        loading: 'Loading cities...',
        sharedReadOnly: 'This is used by other cities too, so only the main admin can change it.',
        sharedTag: 'All cities'
    };

    var zonesPromise = null;

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function current() {
        var c = root.ADMIN_CITY;
        return c && c.id ? c : null;
    }

    function keep(zoneId) {
        var c = current();
        return !c || zoneId === c.id;
    }

    function access(zoneIds) {
        var c = current();
        if (!c) return 'own';
        var ids = Array.isArray(zoneIds) ? zoneIds : [];
        if (!ids.length) return 'shared';
        if (ids.indexOf(c.id) === -1) return 'other';
        return ids.length === 1 ? 'own' : 'shared';
    }

    function num(value) {
        var n = typeof value === 'number' ? value : parseFloat(value);
        return isNaN(n) ? null : n;
    }

    function point(value) {
        if (!value) return null;
        var lat = num(value.latitude !== undefined ? value.latitude : value._lat);
        var lng = num(value.longitude !== undefined ? value.longitude : value._long);
        if (lat === null || lng === null) return null;
        if (lat === 0 && lng === 0) return null;
        return { latitude: lat, longitude: lng };
    }

    /** Same even-odd test the order lists' City tab uses (admin-assign-driver.js). */
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

    var ownZonePromise = null;

    function ownZone(db) {
        var c = current();
        if (!c) return Promise.resolve(null);
        if (!ownZonePromise) {
            ownZonePromise = db.collection('zone').doc(c.id).get().then(function (doc) {
                if (doc.exists) return doc.data() || {};
                return db.collection('zone').where('id', '==', c.id).limit(1).get().then(function (snap) {
                    return snap.empty ? {} : (snap.docs[0].data() || {});
                });
            }).then(function (z) {
                return { id: c.id, area: z.area || [] };
            }).catch(function (error) {
                if (root.console) console.warn('admin-city: city border unavailable', error);
                return { id: c.id, area: [] };
            });
        }
        return ownZonePromise;
    }

    function keepPlace(zone, zoneIds, points) {
        if (!zone) return true;
        var i;
        for (i = 0; i < (zoneIds || []).length; i++) {
            if (zoneIds[i] && zoneIds[i] === zone.id) return true;
        }
        for (i = 0; i < (points || []).length; i++) {
            if (inPolygon(zone.area, point(points[i]))) return true;
        }
        return false;
    }

    var providersCache = {};   // sectionId -> promise, for the page's lifetime (every table draw asks)

    function cityProviders(db, sectionId) {
        var key = sectionId || '';
        if (!providersCache[key]) {
            // unreadable: list none rather than every city's
            providersCache[key] = readCityProviders(db, sectionId).catch(function (error) {
                if (root.console) console.warn('admin-city: providers unavailable', error);
                delete providersCache[key];
                return {};
            });
        }
        return providersCache[key];
    }

    function readCityProviders(db, sectionId) {
        return ownZone(db).then(function (zone) {
            if (!zone) return null;
            var users = db.collection('users').where('role', '==', 'provider');
            var services = db.collection('providers_services');
            if (sectionId) services = services.where('sectionId', '==', sectionId);
            return Promise.all([users.get(), services.get()]).then(function (r) {
                var ids = {};
                r[0].docs.forEach(function (doc) {
                    var u = doc.data() || {};
                    if (keepPlace(zone, [u.zoneId], [u.location])) ids[u.id || doc.id] = true;
                });
                r[1].docs.forEach(function (doc) {
                    var sv = doc.data() || {};
                    if (sv.author && keepPlace(zone, [], [{ latitude: sv.latitude, longitude: sv.longitude }])) ids[sv.author] = true;
                });
                return ids;
            });
        });
    }

    function guardEdit(button, zoneIds) {
        var $ = root.jQuery;
        if (access(zoneIds) === 'own') return false;
        var $btn = $(button);
        $btn.prop('disabled', true).hide();
        $btn.first().before('<div class="alert alert-info admin-city-shared">' + escapeHtml(labels.sharedReadOnly) + '</div>');
        return true;
    }

    /** Published cities as [{ id, name }], sorted by name; [] when unreadable. */
    function loadZones(db) {
        if (!zonesPromise) {
            zonesPromise = db.collection('zone').where('publish', '==', true).get().then(function (snap) {
                return snap.docs.map(function (doc) {
                    var z = doc.data() || {};
                    return { id: z.id || doc.id, name: z.name || doc.id };
                }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
            }).catch(function (error) {
                if (root.console) console.warn('admin-city: cities unavailable', error);
                zonesPromise = null;
                return null;
            });
        }
        return zonesPromise;
    }

    function mountSelect(db, select, nameInput, selectedId) {
        var $ = root.jQuery;
        var $select = $(select);
        var $name = $(nameInput);
        if (!$select.length) return Promise.resolve();
        selectedId = selectedId || '';
        function syncName() {
            var id = $select.val() || '';
            $name.val(id ? $select.find('option:selected').text() : '');
        }
        // The saved city is always an option, so a save that could not read
        // the cities (or whose city is no longer published) keeps it.
        if (selectedId) {
            $select.append($('<option></option>').attr('value', selectedId).text($name.val() || selectedId));
            $select.val(selectedId);
        }
        $select.on('change', syncName);
        return loadZones(db).then(function (zones) {
            if (zones === null) return;
            zones.forEach(function (z) {
                if (z.id === selectedId) {
                    $select.find('option').filter(function () { return this.value === z.id; }).text(z.name);
                    return;
                }
                $select.append($('<option></option>').attr('value', z.id).text(z.name));
            });
            $select.val(selectedId);
            syncName();
        });
    }

    var pickers = {};   // container selector -> { ready, hidden: [ids not shown] }

    function mountPicker(db, container, selectedIds) {
        var $ = root.jQuery;
        var $box = $(container);
        var key = String(container);
        var selected = Array.isArray(selectedIds) ? selectedIds.filter(function (v) { return typeof v === 'string' && v; }) : [];
        pickers[key] = { ready: false, hidden: [] };
        if (!$box.length) return Promise.resolve();
        var locked = current();
        if (locked) {
            $box.html('<b>' + escapeHtml(locked.name || locked.id) + '</b>');
            pickers[key] = { ready: true, hidden: [], locked: locked.id };
            return Promise.resolve();
        }
        $box.html('<span class="text-muted">' + escapeHtml(labels.loading) + '</span>');
        return loadZones(db).then(function (zones) {
            if (zones === null) {
                $box.html('<span class="text-muted">' + escapeHtml(labels.noCities) + '</span>');
                return;   // not ready: the save leaves zoneIds as it is
            }
            var shown = {};
            var html = '';
            zones.forEach(function (z) {
                shown[z.id] = true;
                var checked = selected.indexOf(z.id) !== -1 ? ' checked' : '';
                html += '<label class="admin-city-option"><input type="checkbox" value="' + escapeHtml(z.id) + '"' +
                    checked + '> ' + escapeHtml(z.name) + '</label>';
            });
            if (!zones.length) html = '<span class="text-muted">' + escapeHtml(labels.noCities) + '</span>';
            $box.html(html);
            // Cities saved earlier but not published now stay saved.
            pickers[key] = { ready: true, hidden: selected.filter(function (id) { return !shown[id]; }) };
        });
    }

    /** { zoneIds: [...] } to merge into the saved document, or {} when unknown. */
    function pickerFields(container) {
        var $ = root.jQuery;
        var st = pickers[String(container)];
        if (!st || !st.ready) return {};
        if (st.locked) return { zoneIds: [st.locked] };
        var ids = st.hidden.slice();
        $(container).find('input[type=checkbox]:checked').each(function () {
            var id = $(this).val();
            if (id && ids.indexOf(id) === -1) ids.push(id);
        });
        return { zoneIds: ids };
    }

    function setLabels(next) {
        Object.keys(next || {}).forEach(function (k) { if (next[k]) labels[k] = next[k]; });
    }

    var api = {
        current: current,
        keep: keep,
        access: access,
        guardEdit: guardEdit,
        ownZone: ownZone,
        keepPlace: keepPlace,
        cityProviders: cityProviders,
        mountSelect: mountSelect,
        mountPicker: mountPicker,
        pickerFields: pickerFields,
        setLabels: setLabels,
        labels: labels,
        _escapeHtml: escapeHtml
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.AdminCity = api;
})(typeof window !== 'undefined' ? window : globalThis);
