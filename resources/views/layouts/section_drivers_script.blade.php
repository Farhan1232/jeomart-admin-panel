{{--
    public/js/section-drivers.js, inlined into the section's Drivers list.

    Inlined rather than linked: jeomart.com serves its web root from
    ~/public_html/admin while the application lives in ~/jeomart/admin, so a
    new asset copied to only one of the two trees answers 404 over the web.
    PHP reads the file from disk, which does not depend on that.
--}}
@php $sectionDriversSource = @file_get_contents(public_path('js/section-drivers.js')); @endphp
@if (!empty($sectionDriversSource))
<script>
{!! $sectionDriversSource !!}
</script>
@endif
