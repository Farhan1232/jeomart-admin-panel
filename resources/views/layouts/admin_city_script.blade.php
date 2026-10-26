{{--
    public/js/admin-city.js, inlined, plus the logged-in admin's city.

    window.ADMIN_CITY is { id, name } only for an admin limited to one city
    (admin_user_cities, see App\Helpers\AdminCity); every other admin gets null
    and the pages behave exactly as before.

    Inlined rather than linked: jeomart.com serves its web root from
    ~/public_html/admin while the application lives in ~/jeomart/admin, so a
    new asset copied to only one of the two trees answers 404 over the web.
--}}
@once
@php
    $adminCitySource = @file_get_contents(public_path('js/admin-city.js'));
    $adminCity = \App\Helpers\AdminCity::forUser(optional(Auth::user())->id);
@endphp
<script>window.ADMIN_CITY = @json($adminCity);</script>
@if (!empty($adminCitySource))
<style>
    .admin-city-option { display: inline-block; margin: 0 16px 6px 0; font-weight: normal; cursor: pointer; }
    .admin-city-option input { margin-right: 4px; vertical-align: middle; }
    /* material.css hides every checkbox off-screen and draws its own box only for "input + label";
       these inputs sit inside their label, so show the native box instead. */
    .admin-city-option input[type="checkbox"] { position: static; left: auto; opacity: 1; width: 16px; height: 16px; }
</style>
<script>
{!! $adminCitySource !!}
</script>
@endif
@endonce
