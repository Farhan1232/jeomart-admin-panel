/*
 * CityDashboard: the dashboard a city admin gets instead of the whole app's
 * (HomeController -> dashboard/city.blade.php, only when the admin is limited
 * to a city in admin_user_cities).
 *
 * For the service chosen in the top bar it shows, in the admin's city only:
 * the orders / rides by status, total earnings and admin commission of the
 * completed ones, the drivers and stores, and the latest orders.
 *
 * An order belongs to the city the same way the order lists decide it
 * (admin-assign-driver.js, City tab): the city id saved on the order, or else
 * its pickup / delivery point inside the city's border. Earnings use the same
 * formulas as the service's own dashboard (dashboard/*.blade.php), copied here
 * unchanged so a city's numbers add up the same way.
 */
(function (root) {
    'use strict';

    var COMPLETED = 'Order Completed';

    var SERVICES = {
        'delivery-service': { collection: 'vendor_orders', sectionField: 'section_id', kind: 'store', edit: 'orders/edit/', stores: true },
        'ecommerce-service': { collection: 'vendor_orders', sectionField: 'section_id', kind: 'store', edit: 'orders/edit/', stores: true },
        'cab-service': { collection: 'rides', sectionField: 'sectionId', kind: 'cab', edit: 'rides/edit/' },
        'parcel_delivery': { collection: 'parcel_orders', sectionField: 'sectionId', kind: 'parcel', edit: 'parcel_orders/edit/' },
        'rental-service': { collection: 'rental_orders', sectionField: 'sectionId', kind: 'rental', edit: 'rental_orders/edit/' },
        'ondemand-service': { collection: 'provider_orders', sectionField: 'sectionId', kind: 'ondemand', edit: 'ondemand-bookings/edit/', providers: true }
    };

    /** The service settings for a service type; HomeController's default is delivery. */
    function service(type) {
        return SERVICES[type] || SERVICES['delivery-service'];
    }

    // ── where an order is ──────────────────────────────────────────────────

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

    /** Is this order in the city { id, area }? Same rule as the order lists' City tab. */
    function inCity(kind, order, city) {
        order = order || {};
        var direct = null;
        var p = null;
        if (kind === 'store') {
            var vendor = order.vendor || {};
            direct = vendor.zoneId;
            p = point(order.address && order.address.location) || point({ latitude: vendor.latitude, longitude: vendor.longitude });
        } else if (kind === 'parcel') {
            direct = order.senderZoneId;
            p = point(order.senderLatLong);
        } else if (kind === 'ondemand') {
            // a booking saves no city: the customer's address, or else the booked service's address
            var service = order.provider || {};
            if (inPolygon(city.area, point(order.address && order.address.location))) return true;
            p = point({ latitude: service.latitude, longitude: service.longitude });
        } else {
            direct = order.zoneId;
            p = point(order.sourceLocation);
        }
        if (direct && direct === city.id) return true;
        return inPolygon(city.area, p);
    }

    function statusGroup(status) {
        if (status === COMPLETED) return 'completed';
        if (/cancel|reject/i.test(String(status || ''))) return 'cancelled';
        return 'active';
    }

    // ── earnings: copied from the service dashboards ───────────────────────

    // dashboard/delivery.blade.php + ecommerce.blade.php calculateOrderTotals()
    function storeEarnings(orderData) {
        var order_subtotal = 0;
        var total_discount = 0;
        var total_tax_amount = 0;

        var tip_amount = parseFloat(orderData.tip_amount || 0);
        var deliveryCharge = parseFloat(orderData.deliveryCharge || 0);
        var platformFee = parseFloat(orderData.platformFee || 0);
        var packagingCharge = parseFloat((orderData.vendor && orderData.vendor.packagingCharge) || 0);
        var packagingChargeEnable = orderData.packagingChargeEnable;

        if (orderData.products) {
            orderData.products.forEach(function (product) {
                var basePrice = (product.discountPrice && parseFloat(product.discountPrice) > 0) ? parseFloat(product.discountPrice) : parseFloat(product.price);
                var extras = parseFloat(product.extras_price || 0);
                var qty = parseInt(product.quantity || 0);
                var itemTotal = (basePrice + extras) * qty;
                order_subtotal += isNaN(itemTotal) ? 0 : itemTotal;
            });
        }

        var order_discount = parseFloat(orderData.discount || 0);
        var special_discount = parseFloat((orderData.specialDiscount && orderData.specialDiscount.special_discount) || 0);
        total_discount = order_discount + special_discount;

        if (orderData.taxScope === 'product') {
            var itemSubtotal = order_subtotal;
            (orderData.products || []).forEach(function (product) {
                var basePrice = (product.discountPrice && parseFloat(product.discountPrice) > 0) ? parseFloat(product.discountPrice) : parseFloat(product.price);
                var extras = parseFloat(product.extras_price || 0);
                var qty = parseInt(product.quantity || 0);
                var itemGross = (basePrice + extras) * qty;
                var itemDiscount = itemSubtotal > 0 ? (itemGross / itemSubtotal) * total_discount : 0;
                var itemTaxable = Math.max(0, itemGross - itemDiscount);
                (product.taxSetting || []).forEach(function (tax) {
                    if (tax.enable) {
                        var taxAmount = tax.type === 'percentage' ? (tax.tax / 100) * itemTaxable : tax.tax * product.quantity;
                        total_tax_amount += parseFloat(taxAmount);
                    }
                });
            });
        }

        if (orderData.taxScope === 'order') {
            var orderTaxable = Math.max(0, order_subtotal - total_discount);
            (orderData.taxSetting || []).forEach(function (tax) {
                if (tax.enable) {
                    var taxAmount = tax.type === 'percentage' ? (tax.tax / 100) * orderTaxable : tax.tax;
                    total_tax_amount += parseFloat(taxAmount);
                }
            });
        }

        [
            { key: 'delivery', amount: deliveryCharge, taxes: orderData.driverDeliveryTax || [] },
            { key: 'packaging', amount: packagingCharge, taxes: orderData.packagingTax || [] },
            { key: 'platform', amount: platformFee, taxes: orderData.platformTax || [] }
        ].forEach(function (scope) {
            if (scope.key === 'packaging' && !packagingChargeEnable) return;
            (scope.taxes || []).forEach(function (tax) {
                if (tax.enable) {
                    var taxAmount = 0;
                    if (scope.amount > 0) {
                        taxAmount = tax.type === 'percentage' ? (tax.tax / 100) * scope.amount : tax.tax;
                    }
                    total_tax_amount += parseFloat(taxAmount);
                }
            });
        });

        var final_subtotal = order_subtotal - total_discount;
        var commission = 0;
        var commissionBase = final_subtotal + deliveryCharge + platformFee + total_tax_amount;
        if (orderData.adminCommissionType && orderData.adminCommission) {
            var val = parseFloat(orderData.adminCommission);
            if (!isNaN(val) && val > 0) {
                commission = orderData.adminCommissionType === 'percentage' ? (commissionBase * val) / 100 : val;
            }
        }
        var order_total = final_subtotal + deliveryCharge + tip_amount + (packagingChargeEnable ? packagingCharge : 0) + platformFee + total_tax_amount;
        return { price: isNaN(order_total) ? 0 : order_total, commission: isNaN(commission) ? 0 : commission };
    }

    // dashboard/cab.blade.php calculateRideEarnings()
    function cabEarnings(ride) {
        var order_subtotal = parseFloat(ride.subTotal || 0);
        var total_tax_amount = 0;
        var tip_amount = parseFloat(ride.tip_amount || 0);
        var platformFee = parseFloat(ride.platformFee || 0);
        var order_discount = parseFloat(ride.discount || 0);
        var total_discount = isNaN(order_discount) ? 0 : order_discount;

        var orderTaxable = Math.max(0, order_subtotal - total_discount);
        (ride.taxSetting || []).forEach(function (tax) {
            if (tax.enable) {
                var taxAmount = tax.type === 'percentage' ? (parseFloat(tax.tax) / 100) * orderTaxable : parseFloat(tax.tax);
                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });
        (ride.platformTax || []).forEach(function (tax) {
            if (tax.enable) {
                var taxAmount = 0;
                if (platformFee > 0) {
                    taxAmount = tax.type === 'percentage' ? (parseFloat(tax.tax) / 100) * platformFee : parseFloat(tax.tax);
                }
                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });

        var final_subtotal = order_subtotal - total_discount;
        var commissionBase = final_subtotal + platformFee + total_tax_amount;
        var commission = 0;
        if (ride.adminCommission && ride.adminCommission > 0) {
            var commissionValue = parseFloat(ride.adminCommission);
            if (!isNaN(commissionValue)) {
                commission = String(ride.adminCommissionType || '').toLowerCase() === 'percent' ? (commissionBase * commissionValue) / 100 : commissionValue;
            }
        }
        var price = final_subtotal + tip_amount + platformFee + total_tax_amount;
        return { price: isNaN(price) ? 0 : price, commission: isNaN(commission) ? 0 : commission };
    }

    // dashboard/parcel.blade.php getTotalEarnings()
    function parcelEarnings(orderData) {
        var order_subtotal = parseFloat(orderData.subTotal || 0);
        var total_tax_amount = 0;
        var discount = parseFloat(orderData.discount || 0);
        var total_discount = isNaN(discount) ? 0 : discount;
        var orderTaxable = Math.max(0, order_subtotal - total_discount);
        (orderData.taxSetting || []).forEach(function (tax) {
            if (tax.enable) {
                var taxAmount = tax.type === 'percentage' ? (parseFloat(tax.tax) / 100) * orderTaxable : parseFloat(tax.tax);
                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });
        var platformFee = parseFloat(orderData.platformFee || 0);
        (orderData.platformTax || []).forEach(function (tax) {
            if (tax.enable) {
                var taxAmount = 0;
                if (platformFee > 0) {
                    taxAmount = tax.type === 'percentage' ? (parseFloat(tax.tax) / 100) * platformFee : parseFloat(tax.tax);
                }
                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });
        var price = (order_subtotal - total_discount) + platformFee + total_tax_amount;
        var commission = 0;
        var commissionBase = (order_subtotal - total_discount) + platformFee + total_tax_amount;
        if (orderData.adminCommission && orderData.adminCommission > 0) {
            var commissionValue = parseFloat(orderData.adminCommission);
            if (!isNaN(commissionValue)) {
                commission = String(orderData.adminCommissionType || '').toLowerCase() === 'percentage' ? (commissionBase * commissionValue) / 100 : commissionValue;
            }
        }
        return { price: isNaN(price) ? 0 : price, commission: isNaN(commission) ? 0 : commission };
    }

    function toDate(value) {
        if (!value) return null;
        if (typeof value.toDate === 'function') return value.toDate();
        if (value instanceof Date) return value;
        return null;
    }

    // dashboard/rental.blade.php getTotalEarnings()
    function rentalEarnings(orderData) {
        var discount = parseFloat(orderData.discount || 0);
        var subTotal = parseFloat(orderData.subTotal || 0);
        var driverRate = parseFloat(orderData.driverRate || 0);
        var pkg = orderData.rentalPackageModel || {};
        var startKm = parseFloat(orderData.startKitoMetersReading) || 0;
        var endKm = parseFloat(orderData.endKitoMetersReading) || 0;
        var includedDistance = parseFloat(pkg.includedDistance) || 0;
        var extraKmFare = parseFloat(pkg.extraKmFare) || 0;
        var extraMinuteFare = parseFloat(pkg.extraMinuteFare) || 0;

        var extraKilometerCharge = 0;
        if (endKm > startKm) {
            var totalKm = endKm - startKm;
            if (totalKm > includedDistance) extraKilometerCharge = (totalKm - includedDistance) * extraKmFare;
        }
        var startTime = toDate(orderData.startTime);
        var endTime = toDate(orderData.endTime);
        var totalMinutesUsed = 0;
        if (startTime && endTime) totalMinutesUsed = Math.floor((endTime - startTime) / (1000 * 60));
        var includedMinutes = (parseFloat(pkg.includedHours) || 0) * 60;
        var extraMinutesCharge = 0;
        if (totalMinutesUsed > includedMinutes) extraMinutesCharge = (totalMinutesUsed - includedMinutes) * extraMinuteFare;

        var order_subtotal = subTotal + driverRate + extraKilometerCharge + extraMinutesCharge;
        var total_discount = discount;
        var total_tax_amount = 0;
        var orderTaxable = Math.max(0, order_subtotal - total_discount);
        (orderData.taxSetting || []).forEach(function (tax) {
            if (tax.enable) {
                var taxAmount = tax.type === 'percentage' ? (parseFloat(tax.tax) / 100) * orderTaxable : parseFloat(tax.tax);
                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });
        var platformFee = parseFloat(orderData.platformFee || 0);
        (orderData.platformTax || []).forEach(function (tax) {
            if (tax.enable) {
                var taxAmount = 0;
                if (platformFee > 0) {
                    taxAmount = tax.type === 'percentage' ? (parseFloat(tax.tax) / 100) * platformFee : parseFloat(tax.tax);
                }
                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });
        var final_total = (order_subtotal - total_discount) + platformFee + total_tax_amount;
        var commission = 0;
        var commissionBase = (order_subtotal - total_discount) + platformFee + total_tax_amount;
        if (orderData.adminCommission && orderData.adminCommission > 0) {
            commission = orderData.adminCommissionType === 'percentage'
                ? (commissionBase * parseFloat(orderData.adminCommission)) / 100
                : parseFloat(orderData.adminCommission);
        }
        return { price: isNaN(final_total) ? 0 : final_total, commission: isNaN(commission) ? 0 : commission };
    }

    // dashboard/ondemand.blade.php getTotalEarnings()
    function ondemandEarnings(orderData) {
        let order_subtotal = 0;
        let total_discount = 0;
        let total_tax_amount = 0;

        let quantity = parseFloat(orderData.quantity || 1);

        let basePrice = parseFloat(orderData.provider.price || 0);
        if (orderData.provider.disPrice && orderData.provider.disPrice != '0') {
            basePrice = parseFloat(orderData.provider.disPrice);
        }

        // Subtotal
        order_subtotal = basePrice * quantity;

        // Discount
        let order_discount = parseFloat(orderData.discount || 0);
        total_discount = isNaN(order_discount) ? 0 : order_discount;

        // Order level tax
        let orderTaxable = Math.max(0, order_subtotal - total_discount);

        (orderData.taxSetting || []).forEach(tax => {
            if (tax.enable) {
                let taxAmount = tax.type === "percentage"
                    ? (parseFloat(tax.tax) / 100) * orderTaxable
                    : parseFloat(tax.tax);

                total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
            }
        });

        // Extra Charges
        let platformFee = parseFloat(orderData.platformFee || 0);

        // Extra Taxes
        [
            { amount: platformFee, taxes: orderData.platformTax || [] }
        ].forEach(scope => {
            scope.taxes?.forEach(tax => {
                if (tax.enable) {
                    let taxAmount = 0;
                    if(scope.amount > 0){
                        taxAmount = tax.type === "percentage"
                        ? (parseFloat(tax.tax) / 100) * scope.amount
                        : parseFloat(tax.tax);
                    }
                    total_tax_amount += isNaN(taxAmount) ? 0 : taxAmount;
                }
            });
        });

        // Final price
        let price = (order_subtotal - total_discount) + platformFee + total_tax_amount;

        // Commission
        let commission = 0;
        let commissionBase = (order_subtotal - total_discount) + platformFee + total_tax_amount;

        if (orderData.adminCommission && orderData.adminCommission > 0) {
            let commissionValue = parseFloat(orderData.adminCommission);
            if (!isNaN(commissionValue)) {
                if (orderData.adminCommissionType?.toLowerCase() === 'percentage') {
                    commission = (commissionBase * commissionValue) / 100;
                } else {
                    commission = commissionValue;
                }
            }
        }
        return { price: price, commission: commission };
    }

    function earnings(kind, order) {
        try {
            if (kind === 'store') return storeEarnings(order);
            if (kind === 'ondemand') return ondemandEarnings(order);
            if (kind === 'cab') return cabEarnings(order);
            if (kind === 'parcel') return parcelEarnings(order);
            return rentalEarnings(order);
        } catch (e) {
            return { price: 0, commission: 0 };
        }
    }

    // ── the numbers ────────────────────────────────────────────────────────

    /** Start of the chosen period, or null for all time. */
    function periodStart(period, now) {
        now = now || new Date();
        if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
        if (period === 'year') return new Date(now.getFullYear(), 0, 1);
        return null;
    }

    /**
     * Totals over orders already read for the section: [{ id, data }].
     * Point-of-sale orders are left out like on the delivery dashboard's count.
     */
    function summarize(kind, orders, city, since) {
        var out = { total: 0, active: 0, completed: 0, cancelled: 0, earnings: 0, commission: 0, latest: [] };
        orders.forEach(function (o) {
            var d = o.data || {};
            if (d.isPosOrder === true) return;
            if (!inCity(kind, d, city)) return;
            var created = toDate(d.createdAt);
            if (since && (!created || created < since)) return;
            out.total++;
            var group = statusGroup(d.status);
            out[group]++;
            var money = earnings(kind, d);
            if (group === 'completed') {
                out.earnings += money.price;
                out.commission += money.commission;
            }
            out.latest.push({ id: o.id, createdAt: created, status: d.status || '', amount: money.price });
        });
        out.latest.sort(function (a, b) { return (b.createdAt ? b.createdAt.getTime() : 0) - (a.createdAt ? a.createdAt.getTime() : 0); });
        out.latest = out.latest.slice(0, 10);
        return out;
    }

    // ── the page ───────────────────────────────────────────────────────────

    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function loadCity(db, cityId) {
        return db.collection('zone').doc(cityId).get().then(function (doc) {
            if (doc.exists) return doc.data() || {};
            return db.collection('zone').where('id', '==', cityId).limit(1).get().then(function (snap) {
                return snap.empty ? {} : (snap.docs[0].data() || {});
            });
        }).then(function (z) { return { id: cityId, name: z.name || '', area: z.area || [] }; });
    }

    function loadCurrency(db) {
        return db.collection('currencies').where('isActive', '==', true).get().then(function (snap) {
            var c = snap.empty ? {} : (snap.docs[0].data() || {});
            return { symbol: c.symbol || '', right: !!c.symbolAtRight, digits: parseInt(c.decimal_degits || 0) || 0 };
        }).catch(function () { return { symbol: '', right: false, digits: 0 }; });
    }

    function money(value, cur) {
        var text = Number(value || 0).toFixed(cur.digits);
        return cur.right ? text + cur.symbol : cur.symbol + text;
    }

    /**
     * Fill the page. opts: { db, el (jQuery root), cityId, cityName, sectionId,
     * type, baseUrl, labels }.
     */
    function mount(opts) {
        var $ = root.jQuery;
        var db = opts.db;
        var L = opts.labels || {};
        var $el = opts.el;
        var svc = service(opts.type);
        var state = { orders: null, city: null, cur: null };

        if (!opts.sectionId) {
            $el.find('.city-dash-note').text(L.chooseService || '').show();
            $el.find('.city-dash-body').hide();
            return Promise.resolve();
        }
        if (!svc) {
            $el.find('.city-dash-note').text(L.notAvailable || '').show();
            $el.find('.city-dash-body').hide();
            return Promise.resolve();
        }

        function draw() {
            var since = periodStart($el.find('.city-dash-period').val());
            var s = summarize(svc.kind, state.orders, state.city, since);
            $el.find('[data-n=total]').text(s.total);
            $el.find('[data-n=active]').text(s.active);
            $el.find('[data-n=completed]').text(s.completed);
            $el.find('[data-n=cancelled]').text(s.cancelled);
            $el.find('[data-n=earnings]').text(money(s.earnings, state.cur));
            $el.find('[data-n=commission]').text(money(s.commission, state.cur));
            var rows = s.latest.map(function (o) {
                var when = o.createdAt ? o.createdAt.toLocaleDateString() + ' ' + o.createdAt.toLocaleTimeString() : '';
                return '<tr><td><a href="' + escapeHtml(opts.baseUrl + svc.edit + o.id) + '">' + escapeHtml(o.id) + '</a></td>' +
                    '<td>' + escapeHtml(when) + '</td><td>' + escapeHtml(o.status) + '</td>' +
                    '<td>' + escapeHtml(money(o.amount, state.cur)) + '</td></tr>';
            });
            $el.find('.city-dash-latest tbody').html(rows.length ? rows.join('') :
                '<tr><td colspan="4" class="text-center">' + escapeHtml(L.noOrders || '') + '</td></tr>');
        }

        var sectionRead = db.collection('sections').doc(opts.sectionId).get().then(function (doc) {
            var s = doc.exists ? (doc.data() || {}) : {};
            $el.find('.city-dash-section').text(s.name || '');
            var ids = s.zoneIds;
            if (Array.isArray(ids) && ids.length && ids.indexOf(opts.cityId) === -1) {
                $el.find('.city-dash-note').text(L.notOpen || '').show();
            }
        }).catch(function () {});

        // on-demand bookings are done by providers, not drivers
        var driversRead = svc.providers ? Promise.resolve($el.find('.city-dash-drivers').hide()) :
            (root.SectionDrivers ? root.SectionDrivers.source(db, opts.sectionId).get() : Promise.resolve({ docs: [] }))
            .then(function (snap) {
                var all = 0, online = 0;
                snap.docs.forEach(function (doc) {
                    var d = doc.data() || {};
                    if (d.zoneId !== opts.cityId) return;
                    all++;
                    if (d.isActive === true || d.isActive === 'true') online++;   // the app's online switch (live-tracking.js)
                });
                $el.find('[data-n=drivers]').text(all);
                $el.find('[data-n=online]').text(online);
            }).catch(function () { $el.find('[data-n=drivers],[data-n=online]').text('-'); });

        var storesRead = svc.stores
            ? db.collection('vendors').where('section_id', '==', opts.sectionId).where('zoneId', '==', opts.cityId).get()
                .then(function (snap) { $el.find('[data-n=stores]').text(snap.size); })
                .catch(function () { $el.find('[data-n=stores]').text('-'); })
            : Promise.resolve($el.find('.city-dash-stores').hide());

        var ordersRead = Promise.all([
            loadCity(db, opts.cityId),
            loadCurrency(db),
            db.collection(svc.collection).where(svc.sectionField, '==', opts.sectionId).get()
        ]).then(function (r) {
            state.city = r[0];
            state.cur = r[1];
            state.orders = r[2].docs.map(function (doc) { return { id: doc.id, data: doc.data() }; });
            if (!state.city.name) state.city.name = opts.cityName || '';
            draw();
            $el.find('.city-dash-period').on('change', draw);
        }).catch(function (e) {
            if (root.console) console.warn('city-dashboard', e);
            $el.find('[data-n]').filter(':not([data-n=drivers]):not([data-n=online]):not([data-n=stores])').text('-');
        });

        return Promise.all([sectionRead, driversRead, storesRead, ordersRead]);
    }

    var api = {
        service: service,
        inCity: inCity,
        statusGroup: statusGroup,
        earnings: earnings,
        periodStart: periodStart,
        summarize: summarize,
        mount: mount
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.CityDashboard = api;
})(typeof window !== 'undefined' ? window : globalThis);
