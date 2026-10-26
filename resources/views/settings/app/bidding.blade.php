@extends('layouts.app')
@section('content')
    <div class="page-wrapper">
        <div class="row page-titles">
            <div class="col-md-5 align-self-center">
                <h3 class="text-themecolor">{{ trans('lang.bidding_settings') }}</h3>
            </div>
            <div class="col-md-7 align-self-center">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="{{ url('/dashboard') }}">{{ trans('lang.dashboard') }}</a></li>
                    <li class="breadcrumb-item active">{{ trans('lang.bidding_settings') }}</li>
                </ol>
            </div>
        </div>
        <div class="card-body">
            <div class="error_top" style="display:none"></div>
            <div class="row vendor_payout_create">
                <div class="vendor_payout_create-inner">
                    {{-- The global BIDDING ON/OFF switch. --}}
                    <fieldset>
                        <legend>{{ trans('lang.bidding_configuration') }}</legend>
                        <div class="form-check width-100">
                            <input type="checkbox" class="enable_bidding" id="enable_bidding">
                            <label class="col-3 control-label" for="enable_bidding">{{ trans('lang.enable_bidding') }}</label>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.enable_bidding_help') }}</p>
                            </div>
                        </div>
                        <div class="form-group row width-50">
                            <label class="col-4 control-label">{{ trans('lang.bid_expiry_minutes') }}</label>
                            <div class="col-7">
                                <div class="control-inner">
                                    <input type="number" min="1" max="120" class="form-control bid_expiry_minutes" required>
                                    <span>{{ trans('lang.minutes') }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="form-group row width-50">
                            <label class="col-4 control-label">{{ trans('lang.max_drivers_per_request') }}</label>
                            <div class="col-7">
                                <div class="control-inner">
                                    <input type="number" min="1" max="100" class="form-control max_drivers_per_request" required>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    {{-- How far a bidding request travels. Kilometres, always, whatever
                         unit the rest of the panel is displaying. --}}
                    <fieldset>
                        <legend>{{ trans('lang.bidding_radius') }}</legend>
                        <div class="form-group row width-50">
                            <label class="col-4 control-label">{{ trans('lang.bidding_radius_km') }}</label>
                            <div class="col-7">
                                <div class="control-inner">
                                    <input type="number" min="0" max="500" step="any" class="form-control bidding_radius_km" required>
                                    <span>{{ trans('lang.km') }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.bidding_radius_km_help') }}</p>
                                <p class="help-block current_global_radius"></p>
                            </div>
                        </div>
                    </fieldset>

                    {{-- The separate MINIMUM FARE PER KM ON/OFF switch. --}}
                    <fieldset>
                        <legend>{{ trans('lang.minimum_fare_per_km_settings') }}</legend>
                        <div class="form-check width-100">
                            <input type="checkbox" class="enable_minimum_fare_per_km" id="enable_minimum_fare_per_km">
                            <label class="col-3 control-label" for="enable_minimum_fare_per_km">{{ trans('lang.enable_minimum_fare_per_km') }}</label>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.enable_minimum_fare_per_km_help') }}</p>
                            </div>
                        </div>
                        <div class="form-group row width-50">
                            <label class="col-4 control-label">{{ trans('lang.minimum_fare_per_km') }}</label>
                            <div class="col-7">
                                <div class="control-inner">
                                    <input type="number" min="0" step="any" class="form-control minimum_fare_per_km">
                                    <span class="set_distance_type">{{ trans('lang.km') }}</span>
                                </div>
                            </div>
                        </div>
                    </fieldset>

                    {{-- The normal fare configuration is untouched; this only points at it. --}}
                    <fieldset>
                        <legend>{{ trans('lang.cab_service_settings') }}</legend>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.normal_fare_settings_note') }}</p>
                                <a href="{!! route('vehicleType') !!}" class="btn btn-default">{{ trans('lang.vehicle_type') }}</a>
                                <a href="{!! route('settings.app.radiusConfiguration') !!}" class="btn btn-default">{{ trans('lang.radios_configuration') }}</a>
                            </div>
                        </div>
                    </fieldset>
                </div>
            </div>
        </div>
        <div class="form-group col-12 text-center btm-btn">
            <button type="button" class="btn btn-primary edit-setting-btn"><i class="fa fa-save"></i> {{ trans('lang.save') }}</button>
            <a href="{{ url('/dashboard') }}" class="btn btn-default"><i class="fa fa-undo"></i>{{ trans('lang.cancel') }}</a>
        </div>
    </div>
@endsection
@section('scripts')
    <script type="text/javascript">
        var database = firebase.firestore();
        var refBidding = database.collection('settings').doc("biddingSettings");
        var refDriverNearBy = database.collection('settings').doc("DriverNearBy");

        // Defaults, used until the document has been saved once. They match
        // BiddingSettings in the mobile apps, so an unsaved configuration and a
        // freshly saved one behave the same way.
        var DEFAULTS = {
            enabled: false,
            minimumFarePerKmEnabled: false,
            minimumFarePerKm: 0,
            bidExpiryMinutes: 5,
            maxDriversPerRequest: 20,
            notifyRadiusKm: 0
        };
        var MAX_RADIUS_KM = 500;

        // The existing global radius is stored in MILES, because that is the
        // unit the dispatcher has always compared against. It is shown here
        // converted, so an admin can see what the fallback actually means
        // before deciding whether to override it.
        var MILES_TO_KM = 1.60934;

        $(document).ready(function() {
            jQuery("#data-table_processing").show();

            refDriverNearBy.get().then(function(snapshot) {
                var radios = snapshot.exists ? snapshot.data() : {};
                if (radios && radios.hasOwnProperty('distanceType')) {
                    $(".set_distance_type").text(radios.distanceType);
                }
                if (radios && radios.hasOwnProperty('driverRadios')) {
                    var miles = Number(radios.driverRadios || 0);
                    if (!isNaN(miles) && miles > 0) {
                        $(".current_global_radius").text(
                            "Radius Configuration is currently " + miles + " (about " +
                            (miles * MILES_TO_KM).toFixed(1) + " km). That is what is used while this field is 0."
                        );
                    }
                }
            });

            refBidding.get().then(function(snapshot) {
                var data = snapshot.exists ? (snapshot.data() || {}) : {};

                $(".enable_bidding").prop('checked', data.enabled === true);
                $(".enable_minimum_fare_per_km").prop('checked', data.minimumFarePerKmEnabled === true);
                $(".minimum_fare_per_km").val(
                    data.hasOwnProperty('minimumFarePerKm') ? data.minimumFarePerKm : DEFAULTS.minimumFarePerKm
                );
                $(".bid_expiry_minutes").val(
                    data.hasOwnProperty('bidExpiryMinutes') ? data.bidExpiryMinutes : DEFAULTS.bidExpiryMinutes
                );
                $(".max_drivers_per_request").val(
                    data.hasOwnProperty('maxDriversPerRequest') ? data.maxDriversPerRequest : DEFAULTS.maxDriversPerRequest
                );
                $(".bidding_radius_km").val(
                    data.hasOwnProperty('notifyRadiusKm') ? data.notifyRadiusKm : DEFAULTS.notifyRadiusKm
                );

                toggleMinimumFareRow();
                jQuery("#data-table_processing").hide();
            }).catch(function(error) {
                jQuery("#data-table_processing").hide();
                $(".error_top").show().html("<p>" + error + "</p>");
            });
        });

        function toggleMinimumFareRow() {
            var on = $(".enable_minimum_fare_per_km").is(":checked");
            $(".minimum_fare_per_km").closest('.form-group').toggle(on);
        }

        $(".enable_minimum_fare_per_km").change(function() {
            toggleMinimumFareRow();
        });

        $(".edit-setting-btn").click(function() {
            var enabled = $(".enable_bidding").is(":checked");
            var minimumFarePerKmEnabled = $(".enable_minimum_fare_per_km").is(":checked");
            var minimumFarePerKm = $(".minimum_fare_per_km").val();
            var bidExpiryMinutes = $(".bid_expiry_minutes").val();
            var maxDriversPerRequest = $(".max_drivers_per_request").val();
            var notifyRadiusKm = $(".bidding_radius_km").val();

            $(".error_top").hide().html("");

            if (bidExpiryMinutes === '' || Number(bidExpiryMinutes) < 1) {
                $(".error_top").show().append("<p>{{ trans('lang.bid_expiry_minutes_error') }}</p>");
                return;
            }
            if (maxDriversPerRequest === '' || Number(maxDriversPerRequest) < 1) {
                $(".error_top").show().append("<p>{{ trans('lang.max_drivers_per_request_error') }}</p>");
                return;
            }
            if (notifyRadiusKm === '' || isNaN(Number(notifyRadiusKm)) || Number(notifyRadiusKm) < 0 || Number(notifyRadiusKm) > MAX_RADIUS_KM) {
                $(".error_top").show().append("<p>{{ trans('lang.bidding_radius_km_error') }}</p>");
                return;
            }
            if (minimumFarePerKmEnabled && (minimumFarePerKm === '' || Number(minimumFarePerKm) <= 0)) {
                $(".error_top").show().append("<p>{{ trans('lang.minimum_fare_per_km_error') }}</p>");
                return;
            }

            // set + merge, so the document is created the first time it is saved
            // and nothing else in it is disturbed afterwards.
            refBidding.set({
                'enabled': enabled,
                'minimumFarePerKmEnabled': minimumFarePerKmEnabled,
                'minimumFarePerKm': Number(minimumFarePerKm || 0),
                'bidExpiryMinutes': Number(bidExpiryMinutes),
                'maxDriversPerRequest': Number(maxDriversPerRequest),
                'notifyRadiusKm': Number(notifyRadiusKm || 0)
            }, { merge: true }).then(function() {
                window.location.href = '{{ url()->current() }}';
            }).catch(function(error) {
                $(".error_top").show().append("<p>" + error + "</p>");
            });
        });
    </script>
@endsection
