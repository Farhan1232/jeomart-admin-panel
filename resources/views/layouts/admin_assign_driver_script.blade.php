{{--
    public/js/admin-assign-driver.js, inlined into the four order lists
    (orders, rides, parcel_orders, rental_orders): the Assign Driver dialog and
    the City tabs.

    Inlined rather than linked: jeomart.com serves its web root from
    ~/public_html/admin while the application lives in ~/jeomart/admin, so a
    new asset copied to only one of the two trees answers 404 over the web.
    PHP reads the file from disk, which does not depend on that.
--}}
@include('layouts.admin_city_script')
@php $adminAssignDriverSource = @file_get_contents(public_path('js/admin-assign-driver.js')); @endphp
@if (!empty($adminAssignDriverSource))
<style>
    .admin-city-tabs { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0 0 12px; }
    .admin-city-tabs li a { display: inline-block; padding: 6px 14px; border: 1px solid #dee2e6; border-radius: 18px; color: #495057; background: #fff; font-size: 13px; text-decoration: none; }
    .admin-city-tabs li.active a, .admin-city-tabs li a:hover { background: #ff683a; border-color: #ff683a; color: #fff; }
    .admin-assign-rows { max-height: 55vh; overflow-y: auto; }
    .admin-assign-row { display: block; padding: 8px 10px; margin: 0; border-bottom: 1px solid #f1f1f1; cursor: pointer; font-weight: normal; }
    .admin-assign-row:hover { background: #fafafa; }
    .admin-assign-row.is-blocked { opacity: .55; cursor: not-allowed; }
    .admin-assign-name { font-weight: 600; }
    .admin-assign-km { color: #0d6efd; margin-left: 4px; }
    .admin-assign-note { display: inline-block; margin-left: 4px; padding: 1px 7px; border-radius: 10px; background: #f1f3f5; color: #6c757d; font-size: 11px; }
    .action-btn .admin-assign-driver-off { opacity: .35; cursor: not-allowed; }
</style>
<script>
{!! $adminAssignDriverSource !!}
AdminAssignDriver.setLabels({
    assignDriver: @json(trans('lang.assign_driver')),
    assign: @json(trans('lang.assign')),
    notifyUrl: @json(route('sendnotification'))
});
</script>
@endif
