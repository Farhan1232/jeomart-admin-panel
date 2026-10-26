{{--
    Safety net for the panel's own JavaScript.

    Sixty-six of this panel's tables call FsDataTable.pageQuery() from inside the
    DataTables `ajax` handler.  If that script is not defined the call throws
    before any promise is created, so the view's own .catch() never runs and
    DataTables never receives its callback: the table shows its loading spinner
    for ever.  One asset failing to load therefore takes out every list in the
    panel, with no error the admin can see.  The four god's-eye maps depend on
    live-tracking.js the same way.

    That is not hypothetical.  On the live server `/admin/js/firestore-datatable.js`
    answered 404 for days while every other file in the same directory answered
    200, because jeomart.com serves its web root from ~/public_html/admin while
    the application lives in ~/jeomart/admin - so a new asset copied to only one
    of the two trees is unreachable over the web.  The browser then gets
    Laravel's HTML error page where it expected JavaScript.

    So: if the tags above did not define what they should have, inline the same
    files straight into the page.  PHP reads them from disk, which does not
    depend on the web server agreeing to serve them as static assets.  When the
    assets load normally this block emits nothing at all.
--}}
@php
    $panelInlineScripts = [
        'FsDataTable' => 'js/firestore-datatable.js',
        'PanelSpeed'  => 'js/panel-speed.js',
        'LiveTrack'   => 'js/live-tracking.js',
    ];
@endphp
@foreach ($panelInlineScripts as $panelGlobal => $panelAsset)
    @php $panelSource = @file_get_contents(public_path($panelAsset)); @endphp
    @if (!empty($panelSource))
<script>
    if (typeof window.{{ $panelGlobal }} === 'undefined') {
        {!! $panelSource !!}
    }
</script>
    @endif
@endforeach
