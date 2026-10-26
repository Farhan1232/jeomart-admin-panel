@extends('layouts.app')
@section('content')
    <div class="page-wrapper">
        <div class="row page-titles">
            <div class="col-md-5 align-self-center">
                <h3 class="text-themecolor">{{ trans('lang.driver_trips_settings') }}</h3>
            </div>
            <div class="col-md-7 align-self-center">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="{{ url('/dashboard') }}">{{ trans('lang.dashboard') }}</a></li>
                    <li class="breadcrumb-item active">{{ trans('lang.driver_trips_settings') }}</li>
                </ol>
            </div>
        </div>
        <div class="card-body">
            <div class="error_top" style="display:none"></div>
            <div class="row vendor_payout_create">
                <div class="vendor_payout_create-inner">
                    {{-- How long a driver-posted trip stays in the customer's Available Trips list. --}}
                    <fieldset>
                        <legend>{{ trans('lang.driver_trips_visibility') }}</legend>
                        <div class="form-group row width-50">
                            <label class="col-4 control-label">{{ trans('lang.trip_visibility_hours') }}</label>
                            <div class="col-7">
                                <div class="control-inner">
                                    <input type="number" min="1" max="720" step="1" class="form-control trip_visibility_hours" required>
                                    <span>{{ trans('lang.hours') }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.trip_visibility_hours_help') }}</p>
                            </div>
                        </div>
                    </fieldset>

                    {{-- How far away a posted trip may start and still be shown. --}}
                    <fieldset>
                        <legend>{{ trans('lang.driver_trips_radius') }}</legend>
                        <div class="form-group row width-50">
                            <label class="col-4 control-label">{{ trans('lang.trip_radius_km') }}</label>
                            <div class="col-7">
                                <div class="control-inner">
                                    <input type="number" min="0" max="500" step="any" class="form-control trip_radius_km" required>
                                    <span>{{ trans('lang.km') }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.trip_radius_km_help') }}</p>
                            </div>
                        </div>
                    </fieldset>

                    {{-- Who may post trips: everybody, or only granted drivers. --}}
                    <fieldset>
                        <legend>{{ trans('lang.driver_trips_access') }}</legend>
                        <div class="form-check width-100">
                            <input type="checkbox" class="trip_open_to_all_drivers" id="trip_open_to_all_drivers">
                            <label class="col-5 control-label" for="trip_open_to_all_drivers">{{ trans('lang.trip_open_to_all_drivers') }}</label>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.trip_open_to_all_drivers_help') }}</p>
                            </div>
                        </div>
                        <div class="form-group row width-100">
                            <div class="col-12">
                                <p class="help-block">{{ trans('lang.driver_trips_access_help') }}</p>
                                <a href="{!! route('drivers') !!}" class="btn btn-default">{{ trans('lang.driver_plural') }}</a>
                                <a href="{!! route('driver_trips') !!}" class="btn btn-default">{{ trans('lang.driver_trips') }}</a>
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
        var refDriverTrips = database.collection('settings').doc("driverTripsSettings");

        // Matches DriverTripSettings in the driver and customer apps, so an
        // unsaved configuration and a freshly saved one behave the same way.
        var DEFAULTS = {
            tripVisibilityHours: 24,
            tripRadiusKm: 0,
            // Off, matching DriverTripSettings.defaultOpenToAllDrivers. A
            // document with no such field must read as "grants only".
            tripOpenToAllDrivers: false
        };
        var MIN_HOURS = 1;
        var MAX_HOURS = 720;
        var MAX_RADIUS_KM = 500;

        $(document).ready(function() {
            jQuery("#data-table_processing").show();

            refDriverTrips.get().then(function(snapshot) {
                var data = snapshot.exists ? (snapshot.data() || {}) : {};
                $(".trip_visibility_hours").val(
                    data.hasOwnProperty('tripVisibilityHours') ? data.tripVisibilityHours : DEFAULTS.tripVisibilityHours
                );
                $(".trip_radius_km").val(
                    data.hasOwnProperty('tripRadiusKm') ? data.tripRadiusKm : DEFAULTS.tripRadiusKm
                );
                $("#trip_open_to_all_drivers").prop('checked',
                    data.hasOwnProperty('tripOpenToAllDrivers') ? data.tripOpenToAllDrivers === true : DEFAULTS.tripOpenToAllDrivers
                );
                jQuery("#data-table_processing").hide();
            }).catch(function(error) {
                jQuery("#data-table_processing").hide();
                $(".error_top").show().html("<p>" + error + "</p>");
            });
        });

        $(".edit-setting-btn").click(function() {
            var hours = $(".trip_visibility_hours").val();
            var radiusKm = $(".trip_radius_km").val();

            $(".error_top").hide().html("");

            if (hours === '' || isNaN(Number(hours)) || Number(hours) < MIN_HOURS || Number(hours) > MAX_HOURS) {
                $(".error_top").show().append("<p>{{ trans('lang.trip_visibility_hours_error') }}</p>");
                return;
            }
            if (radiusKm === '' || isNaN(Number(radiusKm)) || Number(radiusKm) < 0 || Number(radiusKm) > MAX_RADIUS_KM) {
                $(".error_top").show().append("<p>{{ trans('lang.trip_radius_km_error') }}</p>");
                return;
            }

            // set + merge, so the document is created the first time it is
            // saved and nothing else in it is disturbed afterwards - including
            // tripCompletionGraceHours, which the maintenance script reads and
            // this page does not offer a field for.
            refDriverTrips.set({
                'tripVisibilityHours': Math.round(Number(hours)),
                'tripRadiusKm': Number(radiusKm || 0),
                // A real boolean, never a string: the apps accept "true" but
                // the field they are written against is a bool.
                'tripOpenToAllDrivers': $("#trip_open_to_all_drivers").is(":checked") === true
            }, { merge: true }).then(function() {
                window.location.href = '{{ url()->current() }}';
            }).catch(function(error) {
                $(".error_top").show().append("<p>" + error + "</p>");
            });
        });
    </script>
@endsection
