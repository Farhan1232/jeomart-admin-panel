@extends('layouts.app')

{{--
    Leaflet and its plug-ins are only loaded for the views that declare this.
    See the note beside the script tags in layouts/app.blade.php.
--}}
@section('needsMap', '1')

@section('content')

<div class="page-wrapper">

    <div class="row page-titles">
        <div class="col-md-5 align-self-center">
            <h3 class="text-themecolor">{{trans('lang.live_tracking_of')}} <span class="section_name"></span></h3>
        </div>
        <div class="col-md-7 align-self-center">
            <ol class="breadcrumb">
                <li class="breadcrumb-item">
                    <a href="{{ route('dashboard') }}">{{trans('lang.dashboard')}}</a>
                </li>
                <li class="breadcrumb-item">
                    {{trans('lang.parcel_plural')}}
                </li>
                <li class="breadcrumb-item active">
                    {{trans('lang.god_eye')}}
                </li>
            </ol>
        </div>
    </div>

    <div class="container-fluid">

        <div class="card mb-3">
            <div class="card-body">
                <div class="row">

                    <div class="col-lg-4">
                        <div class="table-responsive ride-list">
                            <div class="form-group d-flex align-items-center" id="search-box">
                                <input type="text" name="search" id="search" class="form-control" style="width:90%" placeholder="{{trans('lang.search_driver')}}">
                                <span class="badge badge-success ml-2 live-tracking-pulse">{{trans('lang.live_updating')}}</span>
                            </div>

                            <div class="live-tracking-list"></div>

                            {{-- Drivers deliberately left off the map, and why. --}}
                            <div class="live-tracking-hidden"></div>
                        </div>
                    </div>

                    <div class="col-lg-8">
                        <div id="map" style="height:450px"></div>
                        <div id="legend">
                            <h3>{{trans('lang.legend')}}</h3>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    </div>

    <style>
        #append_list12 tr {
            cursor: pointer;
        }

        #legend {
            font-family: Arial, sans-serif;
            background: #fff;
            padding: 10px;
            margin: 11px;
            border: 1px solid #000;
        }

        #legend h3 {
            margin-top: 0;
        }

        #legend img {
            vertical-align: middle;
        }

        /* The detail rows the client asked for, under each driver in the list. */
        .live-tracking-details {
            display: flex;
            flex-wrap: wrap;
            gap: 2px 12px;
            margin: 4px 0 6px;
            font-size: 12px;
            color: #6c757d;
        }

        .live-tracking-detail b {
            color: #495057;
            font-weight: 600;
        }

        .live-track-popup .live-track-row {
            font-size: 12px;
            line-height: 1.5;
        }

        .live-track-popup .live-track-label {
            color: #6c757d;
        }

        .live-tracking-pulse {
            animation: live-tracking-fade 2s ease-in-out infinite;
        }

        @keyframes live-tracking-fade {
            0%, 100% { opacity: 1; }
            50% { opacity: .35; }
        }
    </style>

@endsection

@section('scripts')

<script type="text/javascript">

    /*
     * Live tracking for the parcel service.
     *
     * This view now holds only what is particular to the parcel service: which collection
     * carries its work in progress, how an order names its driver, its customer
     * and its two ends, and which drivers count as its fleet. Everything else -
     * the merge, the demo-data filtering, the list, the markers, the legend and
     * the live subscription - is public/js/live-tracking.js, shared by all four
     * god's-eye maps.
     *
     * What changed in the data path, and why (full account in that file):
     *
     *  - Every driver document holding any `location` was plotted. On this
     *    project that is 139 eMart demo accounts sitting on Ahmedabad and 58
     *    that have never had a fix and read 0.01, 0.01 - the Atlantic - drawn
     *    alongside the 33 real ones. A driver is now shown only if the position
     *    is real and falls inside a service zone the admin has published; with
     *    no zone published nothing is filtered, so an install that has not drawn
     *    one sees exactly what it saw before.
     *
     *  - It was not live. Each marker owned a `setInterval` re-reading that
     *    driver's document every ten seconds, and they were never cleared, so a
     *    tab left open accumulated them. One onSnapshot now covers the fleet.
     *
     *  - The orders query and the drivers query were both started and neither
     *    awaited, so whichever answered first called the renderer - usually
     *    leaving the in-transit rides out of the merge.
     *
     *  - Driver documents were read one at a time inside the render loop
     *    (`await getDriverDetail(id)` per row). They come in one batch now.
     */

    var database = firebase.firestore();
    var section_id = getCookie('section_id') || '';

    var godsEye = LiveTrack.page({
        db: database,
        sectionId: section_id,
        images: '{!! asset('/images/') !!}',
        nameSelector: '.section_name',

        /** The work in progress for this service. */
        ordersQuery: function (db, sectionId) {
            return db.collection('parcel_orders')
                .where('status', '==', 'In Transit')
                .where('sectionId', '==', sectionId);
        },
        orderDriverId: function (order) {
            return order.driver && order.driver.id ? order.driver.id : null;
        },
        orderCustomerId: function (order) {
            return order.author && order.author.id ? order.author.id : null;
        },
        orderRoute: function (order) {
            if (!order.author || !order.author.shippingAddress || !order.sender || !order.senderLatLong) return null;
            return {
                from: order.sender ? order.sender.address : '',
                to: order.receiver ? order.receiver.address : ''
            };
        },
        orderLink: function (order) {
            return "{{ route('parcel_orders.edit', ['id' => ':id']) }}".replace(':id', String(order.id).trim());
        },

        /*
         * Who counts as this section's fleet.
         *
         * Both of this page's filters exist in two field shapes - `serviceType`
         * / `serviceTypes` and `sectionId` / `sectionIds` - and a driver may
         * carry either. Asking only for the singular pair is why online drivers
         * were missing from this map.
         *
         * Firestore allows at most ONE array-contains filter per query, so
         * `serviceTypes array-contains` and `sectionIds array-contains` cannot
         * be asked together. The second query therefore asks for the section
         * alone and `serviceFlag` below narrows it to this map's service, which
         * is exactly what the `serviceType ==` clause did on the server.
         *
         * No `location != null` on the second query: array-contains plus an
         * inequality on `location` needs a composite index this project does not
         * have. consider() rejects a driver with no location anyway.
         */
        fleetQuery: function (db, sectionId) {
            var drivers = db.collection('users').where('role', '==', 'driver');
            return [
                drivers.where('serviceType', '==', 'parcel_delivery')
                       .where('sectionId', '==', sectionId)
                       .where('location', '!=', null),
                drivers.where('sectionIds', 'array-contains', sectionId)
            ];
        },

        serviceFlag: 'parcel_delivery',

        /* The Vehicle Type list in this panel: each marker shows its type's own icon and name. */
        vehicleTypes: { collection: 'vehicle_type', iconField: 'vehicle_icon' },

        labels: {
            phone: "{{ trans('lang.phone') }}",
            vehicle: "{{ trans('lang.live_vehicle') }}",
            vehicleType: "{{ trans('lang.vehicle_type') }}",
            colour: "{{ trans('lang.live_colour') }}",
            rating: "{{ trans('lang.rating') }}",
            zone: "{{ trans('lang.live_service_zone') }}",
            status: "{{ trans('lang.status') }}",
            online: "{{ trans('lang.driver_online') }}",
            offline: "{{ trans('lang.live_offline') }}",
            verified: "{{ trans('lang.live_documents') }}",
            yes: "{{ trans('lang.verified') }}",
            no: "{{ trans('lang.live_not_verified') }}",
            lastSeen: "{{ trans('lang.live_last_seen') }}",
            justNow: "{{ trans('lang.live_just_now') }}",
            minutes: "{{ trans('lang.live_minutes_ago') }}",
            hours: "{{ trans('lang.live_hours_ago') }}",
            appNotOpen: "{{ trans('lang.live_app_not_open') }}"
        },
        texts: {
            driverName: "{{ trans('lang.driver_name') }}",
            userName: "{{ trans('lang.user_name') }}",
            orderId: "{{ trans('lang.order_id') }}",
            inTransit: "{{ trans('lang.in_transit') }}",
            available: "{{ trans('lang.available') }}",
            noDrivers: "{{ trans('lang.live_no_drivers') }}",
            hiddenSummary: "{{ trans('lang.live_hidden_summary') }}"
        },
        reasons: {
            'never sent a location': "{{ trans('lang.live_reason_no_location') }}",
            'no driver record': "{{ trans('lang.live_reason_no_location') }}",
            'placeholder location': "{{ trans('lang.live_reason_placeholder') }}",
            'outside your service zones': "{{ trans('lang.live_reason_outside_zone') }}",
            'no app login': "{{ trans('lang.live_reason_no_login') }}",
            'login blocked': "{{ trans('lang.live_reason_login_blocked') }}"
        }
    });

    /*
     * The list is fetched and drawn as soon as the page is ready; the map itself
     * is built by InitializeGodsEyeMap, which the layout calls once the map
     * library is up and a centre has been settled on. Either can finish first,
     * so both call drawWhenBoth().
     */
    var listReady = false;
    var mapCentre = null;

    $(document).ready(function () {
        godsEye.bind();
        godsEye.load().then(function () {
            listReady = true;
            drawWhenBoth();
        }).catch(function (error) {
            console.error('live tracking: could not load this section', error);
        });

        setTimeout(function () {
            $(".sidebartoggler").click();
        }, 500);
    });

    function InitializeGodsEyeMap() {
        mapCentre = [
            parseFloat(getCookie('default_latitude')),
            parseFloat(getCookie('default_longitude'))
        ];
        drawWhenBoth();
    }

    function drawWhenBoth() {
        if (!listReady || !mapCentre || isNaN(mapCentre[0]) || isNaN(mapCentre[1])) return;
        if (drawWhenBoth.done) return;
        drawWhenBoth.done = true;
        godsEye.draw(mapCentre);
        // From here on, a driver moving writes straight to the marker.
        godsEye.live();
    }

</script>

@endsection
