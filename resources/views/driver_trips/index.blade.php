@extends('layouts.app')

@section('content')
    <div class="page-wrapper">
        <div class="row page-titles">
            <div class="col-md-5 align-self-center">
                <h3 class="text-themecolor">{{ trans('lang.driver_trips') }}</h3>
            </div>
            <div class="col-md-7 align-self-center">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="{{ route('dashboard') }}">{{ trans('lang.dashboard') }}</a></li>
                    <li class="breadcrumb-item active">{{ trans('lang.driver_trips') }}</li>
                </ol>
            </div>
        </div>
        <div class="container-fluid">
            <div class="admin-top-section">
                <div class="row">
                    <div class="col-12">
                        <div class="d-flex top-title-section pb-4 justify-content-between">
                            <div class="d-flex top-title-left align-self-center">
                                <span class="icon mr-3"><img src="{{ asset('images/total_rides.png') }}"></span>
                                <h3 class="mb-0">{{ trans('lang.driver_trips') }}</h3>
                                <span class="counter ml-3 total_count"></span>
                            </div>
                            <div class="d-flex top-title-right align-self-center">
                                <div class="select-box pl-3">
                                    <select class="form-control status_selector filteredRecords">
                                        <option value="" selected>{{ trans('lang.status') }}</option>
                                        <option value="active">{{ trans('lang.trip_status_active') }}</option>
                                        <option value="booked">{{ trans('lang.trip_status_booked') }}</option>
                                        <option value="expired">{{ trans('lang.trip_status_expired') }}</option>
                                        <option value="cancelled">{{ trans('lang.trip_status_cancelled') }}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="table-list">
                    <div class="row">
                        <div class="col-12">
                            <div class="card border">
                                <div class="card-header d-flex justify-content-between align-items-center border-0">
                                    <div class="card-header-title">
                                        <h3 class="text-dark-2 mb-2 h4">{{ trans('lang.driver_trips') }}</h3>
                                        <p class="mb-0 text-dark-2">{{ trans('lang.driver_trips_table_text') }}</p>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <div class="table-responsive m-t-10">
                                        <table id="driverTripsTable" class="display nowrap table table-hover table-striped table-bordered table table-striped" cellspacing="0" width="100%">
                                            <thead>
                                                <tr>
                                                    <th>{{ trans('lang.driver') }}</th>
                                                    <th>{{ trans('lang.trip_from') }}</th>
                                                    <th>{{ trans('lang.trip_to') }}</th>
                                                    <th>{{ trans('lang.trip_date_time') }}</th>
                                                    <th>{{ trans('lang.full_vehicle_price') }}</th>
                                                    <th>{{ trans('lang.status') }}</th>
                                                    <th>{{ trans('lang.visible_until') }}</th>
                                                    <th>{{ trans('lang.date') }}</th>
                                                </tr>
                                            </thead>
                                            <tbody id="append_list1">
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    @endsection

    @section('scripts')

        <script type="text/javascript">

            var section_id = getCookie('section_id') || '';

            // Read-only operational view of the trips drivers have posted.
            // Same cursor pagination every other table in this panel uses since
            // Session 1: one page of documents per draw, not the whole
            // collection.
            var ref = database.collection('driver_trips').where('sectionId', '==', section_id).orderBy('createdAt', 'desc');

            var placeholderImage = '';
            var placeholder = database.collection('settings').doc('placeHolderImage');
            placeholder.get().then(async function(snapshotsimage) {
                var placeholderImageData = snapshotsimage.data();
                placeholderImage = placeholderImageData.image;
            });

            var currentCurrency = '';
            var currencyAtRight = false;
            var decimal_degits = 0;
            var refCurrency = database.collection('currencies').where('isActive', '==', true);
            refCurrency.get().then(async function(snapshots) {
                if (snapshots.docs.length > 0) {
                    var currencyData = snapshots.docs[0].data();
                    currentCurrency = currencyData.symbol;
                    currencyAtRight = currencyData.symbolAtRight;
                    if (currencyData.decimal_degits) {
                        decimal_degits = currencyData.decimal_degits;
                    }
                }
            });

            var STATUS_LABELS = {
                'active': "{{ trans('lang.trip_status_active') }}",
                'booked': "{{ trans('lang.trip_status_booked') }}",
                'expired': "{{ trans('lang.trip_status_expired') }}",
                'cancelled': "{{ trans('lang.trip_status_cancelled') }}"
            };

            $('.status_selector').select2({
                placeholder: '{{ trans('lang.status') }}',
                minimumResultsForSearch: Infinity,
                allowClear: true
            });

            $('select').on("select2:unselecting", function(e) {
                var self = $(this);
                setTimeout(function() {
                    self.select2('close');
                }, 0);
            });

            $('.filteredRecords').change(async function() {
                var status = $('.status_selector').val();
                ref = database.collection('driver_trips').where('sectionId', '==', section_id);
                if (status) {
                    ref = ref.where('status', '==', status);
                }
                ref = ref.orderBy('createdAt', 'desc');
                $('#driverTripsTable').DataTable().ajax.reload();
            });

            $(document).ready(function() {

                jQuery("#data-table_processing").show();

                var fieldConfig = {
                    columns: [
                        { key: 'driverName', header: "{{ trans('lang.driver') }}" },
                        { key: 'fromAddress', header: "{{ trans('lang.trip_from') }}" },
                        { key: 'toAddress', header: "{{ trans('lang.trip_to') }}" },
                        { key: 'tripDateTimeText', header: "{{ trans('lang.trip_date_time') }}" },
                        { key: 'fullVehiclePrice', header: "{{ trans('lang.full_vehicle_price') }}" },
                        { key: 'status', header: "{{ trans('lang.status') }}" },
                        { key: 'createdAtText', header: "{{ trans('lang.date') }}" }
                    ],
                    fileName: "{{ trans('lang.driver_trips') }}"
                };

                const table = $('#driverTripsTable').DataTable({
                    pageLength: 10,
                    processing: false,
                    serverSide: true,
                    responsive: true,
                    ajax: function(data, callback, settings) {
                        const length = data.length;
                        const searchValue = data.search.value.toLowerCase();
                        const orderColumnIndex = data.order[0].column;
                        const orderDirection = data.order[0].dir;

                        const orderableColumns = ['driverName', '', '', 'tripDateTime', '', '', '', 'createdAt'];
                        const orderByField = orderableColumns[orderColumnIndex];

                        if (searchValue.length >= 3 || searchValue.length === 0) {
                            $('#data-table_processing').show();
                        }

                        FsDataTable.pageQuery(ref, data, { key: 'driverTripsTable', orderField: orderByField }).then(async function(querySnapshot) {
                            if (querySnapshot.empty) {
                                $('.total_count').text(0);
                                $('#data-table_processing').hide();
                                callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
                                return;
                            }

                            let records = [];
                            let filteredRecords = [];

                            querySnapshot.docs.map(function(doc) {
                                let childData = doc.data();
                                childData.id = doc.id;
                                childData.tripDateTimeText = toDateText(childData.tripDateTime);
                                childData.createdAtText = toDateText(childData.createdAt);
                                childData.visibleUntilText = toDateText(childData.visibilityExpiresAt);

                                if (searchValue) {
                                    if (
                                        (childData.driverName && childData.driverName.toString().toLowerCase().includes(searchValue)) ||
                                        (childData.fromAddress && childData.fromAddress.toString().toLowerCase().includes(searchValue)) ||
                                        (childData.toAddress && childData.toAddress.toString().toLowerCase().includes(searchValue)) ||
                                        (childData.status && childData.status.toString().toLowerCase().includes(searchValue))
                                    ) {
                                        filteredRecords.push(childData);
                                    }
                                } else {
                                    filteredRecords.push(childData);
                                }
                            });

                            filteredRecords.sort((a, b) => {
                                let aValue = a[orderByField];
                                let bValue = b[orderByField];
                                if ((orderByField === 'createdAt' || orderByField === 'tripDateTime') && aValue && bValue) {
                                    aValue = new Date(aValue.toDate()).getTime();
                                    bValue = new Date(bValue.toDate()).getTime();
                                } else {
                                    aValue = aValue ? aValue.toString().toLowerCase().trim() : '';
                                    bValue = bValue ? bValue.toString().toLowerCase().trim() : '';
                                }
                                if (orderDirection === 'asc') {
                                    return (aValue > bValue) ? 1 : -1;
                                }
                                return (aValue < bValue) ? 1 : -1;
                            });

                            const totalRecords = filteredRecords.length;
                            $('.total_count').text(FsDataTable.total('driverTripsTable', totalRecords));
                            const paginatedRecords = filteredRecords.slice(FsDataTable.offset('driverTripsTable'), FsDataTable.offset('driverTripsTable') + length);

                            paginatedRecords.forEach(function(childData) {
                                records.push(buildHTML(childData));
                            });

                            $('#data-table_processing').hide();
                            callback({
                                draw: data.draw,
                                recordsTotal: FsDataTable.total('driverTripsTable', totalRecords),
                                recordsFiltered: FsDataTable.total('driverTripsTable', totalRecords),
                                filteredData: filteredRecords,
                                data: records
                            });
                        }).catch(function(error) {
                            console.error("Error fetching data from Firestore:", error);
                            $('#data-table_processing').hide();
                            callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
                        });
                    },
                    order: [7, 'desc'],
                    columnDefs: [{
                        orderable: false,
                        targets: [1, 2, 4, 5, 6]
                    }],
                    "language": datatableLang,
                    dom: 'lfrtipB',
                    buttons: [{
                        extend: 'collection',
                        text: '<i class="mdi mdi-cloud-download"></i>{{ trans('lang.export_as') }}',
                        className: 'btn btn-info',
                        buttons: [
                            { extend: 'excelHtml5', text: '{{ trans('lang.export_excel') }}', action: function(e, dt, button, config) { exportData(dt, 'excel', fieldConfig); } },
                            { extend: 'pdfHtml5', text: '{{ trans('lang.export_pdf') }}', action: function(e, dt, button, config) { exportData(dt, 'pdf', fieldConfig); } },
                            { extend: 'csvHtml5', text: '{{ trans('lang.export_csv') }}', action: function(e, dt, button, config) { exportData(dt, 'csv', fieldConfig); } }
                        ]
                    }],
                    initComplete: function() {
                        $(".dataTables_filter").append($(".dt-buttons").detach());
                        $('.dataTables_filter input').attr('placeholder', 'Search here...').attr('autocomplete', 'new-password').val('');
                        $('.dataTables_filter label').contents().filter(function() {
                            return this.nodeType === 3;
                        }).remove();
                    }
                });
            });

            function toDateText(value) {
                if (!value || typeof value.toDate !== 'function') return '';
                try {
                    var d = value.toDate();
                    return d.toDateString() + ' ' + d.toLocaleTimeString('en-US');
                } catch (err) {
                    return '';
                }
            }

            function amountText(value) {
                var amount = parseFloat(value || 0);
                if (isNaN(amount)) amount = 0;
                if (currencyAtRight) {
                    return amount.toFixed(decimal_degits) + '' + currentCurrency;
                }
                return currentCurrency + '' + amount.toFixed(decimal_degits);
            }

            function buildHTML(val) {
                var html = [];
                var driverView = '{{ route('drivers.view', ':id') }}'.replace(':id', val.driverId || '');
                var name = val.driverName || '-';

                html.push('<td><a class="redirecttopage" data-url="' + driverView + '" href="' + driverView + '">' + name + '</a></td>');
                html.push('<td>' + (val.fromAddress || '') + '</td>');
                html.push('<td>' + (val.toAddress || '') + '</td>');
                html.push('<td class="dt-time">' + val.tripDateTimeText + '</td>');
                html.push('<td>' + amountText(val.fullVehiclePrice) + '</td>');

                var label = STATUS_LABELS[val.status] || (val.status || '');
                var badge = 'badge-secondary';
                if (val.status === 'active') badge = 'badge-success';
                else if (val.status === 'booked') badge = 'badge-primary';
                else if (val.status === 'cancelled') badge = 'badge-danger';
                var booked = val.reservedByName ? '<br><small>' + val.reservedByName + '</small>' : '';
                html.push('<td><span class="badge ' + badge + '">' + label + '</span>' + booked + '</td>');

                html.push('<td class="dt-time">' + val.visibleUntilText + '</td>');
                html.push('<td class="dt-time">' + val.createdAtText + '</td>');
                return html;
            }

        </script>
    @endsection
