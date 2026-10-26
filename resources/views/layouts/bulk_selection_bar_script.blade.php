{{--
    public/js/bulk-selection-bar.js, inlined into every page of the panel. It
    only acts on list pages that have the bulk-delete link (#deleteAll).

    Inlined rather than linked for the same reason as section_drivers_script:
    the live web root and the application live in two different directories.
--}}
@php $bulkSelectionBarSource = @file_get_contents(public_path('js/bulk-selection-bar.js')); @endphp
@if (!empty($bulkSelectionBarSource))
<style>
    .bulk-selection-bar { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 1050; display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: #212529; color: #fff; border-radius: 8px; box-shadow: 0 6px 24px rgba(0, 0, 0, .25); }
    .bulk-selection-bar .bulk-selection-count { font-weight: 600; margin-right: 6px; }
</style>
<script>
{!! $bulkSelectionBarSource !!}
</script>
@endif
