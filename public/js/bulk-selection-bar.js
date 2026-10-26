/*
 * bulk-selection-bar.js
 * ----------------------------------------------------------------------------
 * The action bar that appears when rows of an admin list are selected.
 *
 * WHAT THE CLIENT REPORTED (16 Oct 2026)
 *   "Selecting individual items or clicking Select All does not show any
 *    action buttons."
 *
 * WHAT WAS THERE
 *   Every list (57 of them) has row checkboxes (`.is_open`), a Select All box
 *   (`#is_active`) and a single bulk action: a small "All" trash link
 *   (`#deleteAll`) squeezed into the checkbox header cell. Ticking rows changed
 *   nothing on screen, so the action looked missing.
 *
 * WHAT THIS DOES
 *   While at least one row is ticked, a bar shows "N selected" with
 *   "Delete selected" and "Clear selection". "Delete selected" simply clicks
 *   the page's own `#deleteAll` link, so the page's existing confirmation,
 *   permission check and delete code run exactly as before. Nothing about the
 *   lists themselves is changed, and pages without `#deleteAll` (the user has no
 *   delete permission there, or the page has no bulk action) get no bar.
 *
 * Inlined by resources/views/layouts/bulk_selection_bar_script.blade.php.
 */
(function (window, $) {
    'use strict';
    if (!$) return;

    var labels = {
        selected: 'selected',
        deleteSelected: 'Delete selected',
        clear: 'Clear selection'
    };

    function escapeHtml(text) {
        return String(text == null ? '' : text)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    /** The table the page's bulk link belongs to. */
    function bulkTable() {
        var $link = $('a#deleteAll');
        if (!$link.length) return $();
        return $link.closest('table');
    }

    function checkedCount($table) {
        return $table.find('tbody input.is_open:checked').length;
    }

    function ensureBar() {
        var $bar = $('#bulkSelectionBar');
        if ($bar.length) return $bar;
        $('body').append(
            '<div id="bulkSelectionBar" class="bulk-selection-bar" style="display:none" role="region" aria-live="polite">' +
            '<span class="bulk-selection-count"></span>' +
            '<button type="button" class="btn btn-danger btn-sm bulk-selection-delete">' +
            '<i class="mdi mdi-delete"></i> ' + escapeHtml(labels.deleteSelected) + '</button>' +
            '<button type="button" class="btn btn-light btn-sm bulk-selection-clear">' + escapeHtml(labels.clear) + '</button>' +
            '</div>'
        );
        $bar = $('#bulkSelectionBar');
        $bar.on('click', '.bulk-selection-delete', function () {
            // The page's own handler: its confirm(), its permission, its writes.
            $('a#deleteAll').first().trigger('click');
        });
        $bar.on('click', '.bulk-selection-clear', function () {
            var $table = bulkTable();
            $table.find('input.is_open').prop('checked', false);
            $('#is_active').prop('checked', false);
            refresh();
        });
        return $bar;
    }

    function refresh() {
        var $table = bulkTable();
        if (!$table.length) return;
        var n = checkedCount($table);
        var $bar = ensureBar();
        if (n > 0) {
            $bar.find('.bulk-selection-count').text(n + ' ' + labels.selected);
            $bar.show();
        } else {
            $bar.hide();
        }
    }

    function start() {
        if (!$('a#deleteAll').length) return;
        // Row boxes are drawn by DataTables after load, so listen on document.
        // A timeout lets the page's own Select All handler tick the rows first.
        $(document).on('change click', 'input.is_open, #is_active', function () {
            setTimeout(refresh, 0);
        });
        // A redraw (next page, search, delete) replaces the rows.
        $(document).on('draw.dt', function () {
            setTimeout(refresh, 0);
        });
        refresh();
    }

    window.BulkSelectionBar = {
        setLabels: function (extra) { Object.assign(labels, extra || {}); },
        refresh: refresh,
        start: start
    };

    $(start);
})(window, window.jQuery);
