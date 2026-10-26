{{--
    The dashboard of an admin limited to one city (App\Helpers\AdminCity):
    HomeController shows this instead of the service dashboards, which add up
    the whole app. public/js/city-dashboard.js fills it in; it is inlined for
    the same reason as dashboard-tally.js (two web roots on jeomart.com).
--}}
@extends('layouts.app')

@section('content')
@php $cityDashboardSource = @file_get_contents(public_path('js/city-dashboard.js')); @endphp

<div id="main-wrapper" class="page-wrapper" style="min-height: 207px;">

    <div class="row page-titles">
        <div class="col-md-8 align-self-center">
            <h3 class="text-themecolor">{{ $adminCity['name'] ?: $adminCity['id'] }} &middot; <span class="city-dash-section"></span></h3>
        </div>
    </div>

    <div class="container-fluid" id="city_dashboard">

        <div class="alert alert-warning city-dash-note" style="display:none"></div>

        <div class="city-dash-body">
            <div class="sis-card-head-select-box d-flex align-items-center gap-2 mb-4">
                <div class="head-select-box">
                    <label class="mb-0 text-dark-2">{{ trans('lang.filter_by') }}:</label>
                    <select class="form-control city-dash-period">
                        <option value="">{{ trans('lang.all') }}</option>
                        <option value="today">Today</option>
                        <option value="month">This month</option>
                        <option value="year">This year</option>
                    </select>
                </div>
            </div>

            <div class="row">
                @foreach ([
                    ['earnings', trans('lang.dashboard_total_earnings')],
                    ['commission', trans('lang.admin_commission')],
                    ['total', 'Total orders'],
                    ['active', 'In progress'],
                    ['completed', 'Completed'],
                    ['cancelled', 'Cancelled / rejected'],
                ] as $card)
                <div class="col-sm-6 col-lg-4 mb-3">
                    <div class="card card-box-with-icon border">
                        <div class="card-body">
                            <h4 class="text-dark-2 mb-1 pb-1">{{ $card[1] }}</h4>
                            <h2 class="m-b-0 text-dark-2 font-bold" data-n="{{ $card[0] }}">...</h2>
                        </div>
                    </div>
                </div>
                @endforeach
                <div class="col-sm-6 col-lg-4 mb-3 city-dash-drivers">
                    <div class="card card-box-with-icon border">
                        <div class="card-body">
                            <h4 class="text-dark-2 mb-1 pb-1">{{ trans('lang.driver_plural') }}</h4>
                            <h2 class="m-b-0 text-dark-2 font-bold"><span data-n="drivers">...</span> <small class="text-muted">(<span data-n="online">...</span> online)</small></h2>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-lg-4 mb-3 city-dash-stores">
                    <div class="card card-box-with-icon border">
                        <div class="card-body">
                            <h4 class="text-dark-2 mb-1 pb-1">{{ trans('lang.store_plural') }}</h4>
                            <h2 class="m-b-0 text-dark-2 font-bold" data-n="stores">...</h2>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card border">
                <div class="card-header"><h4 class="mb-0">Latest orders</h4></div>
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-striped mb-0 city-dash-latest">
                            <thead><tr><th>ID</th><th>{{ trans('lang.date') }}</th><th>{{ trans('lang.status') }}</th><th>{{ trans('lang.total_amount') }}</th></tr></thead>
                            <tbody><tr><td colspan="4" class="text-center">...</td></tr></tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>
@endsection

@section('scripts')
@include('layouts.section_drivers_script')
@if (!empty($cityDashboardSource))
<script>
{!! $cityDashboardSource !!}
</script>
@endif
<script>
    $(function () {
        if (!window.CityDashboard) return;
        CityDashboard.mount({
            db: firebase.firestore(),
            el: $('#city_dashboard'),
            cityId: @json($adminCity['id']),
            cityName: @json($adminCity['name']),
            sectionId: @json((string) ($id ?? '')),
            type: @json((string) ($type ?? '')),
            baseUrl: @json(url('/') . '/'),
            labels: {
                chooseService: 'Choose a service from the top bar to see its numbers for your city.',
                notAvailable: 'City numbers are not available for this service.',
                notOpen: 'This service is not open in your city.',
                noOrders: 'No orders in your city yet.'
            }
        });
    });
</script>
@endsection
