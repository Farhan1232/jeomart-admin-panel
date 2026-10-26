@extends('layouts.app')

@section('content')
    <div class="page-wrapper">
        <div class="row page-titles">
            <div class="col-md-5 align-self-center">
                <h3 class="text-themecolor">
                    @if (request()->is('drivers/approved'))
                        @php $type = 'approved'; @endphp
                        {{ trans('lang.approved_drivers') }}
                    @elseif(request()->is('drivers/pending'))
                        @php $type = 'pending'; @endphp
                        {{ trans('lang.approval_pending_drivers') }}
                    @else
                        @php $type = 'all'; @endphp
                        {{ trans('lang.all_drivers') }}
                    @endif
                </h3>
            </div>
            <div class="col-md-7 align-self-center">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="{{ route('dashboard') }}">{{ trans('lang.dashboard') }}</a></li>
                    <li class="breadcrumb-item active">{{ trans('lang.driver_table') }}</li>
                </ol>
            </div>
            <div>
            </div>
        </div>
        <div class="container-fluid">
            <div class="admin-top-section">
                <div class="row">
                    <div class="col-12">
                        <div class="d-flex top-title-section pb-4 justify-content-between">
                            <div class="d-flex top-title-left align-self-center">
                                <span class="icon mr-3"><img src="{{ asset('images/driver.png') }}"></span>
                                <h3 class="mb-0">{{ trans('lang.driver_plural') }}</h3>
                                <span class="counter ml-3 total_count"></span>
                            </div>
                            <div class="d-flex top-title-right align-self-center">
                                <div class="select-box pl-3">
                                    <select class="form-control status_selector filteredRecords">
                                        <option value="" selected>{{ trans('lang.status') }}</option>
                                        <option value="active">{{ trans('lang.active') }}</option>
                                        <option value="inactive">{{ trans('lang.in_active') }}</option>
                                    </select>
                                </div>
                                <div class="select-box pl-3">
                                    <div id="daterange"><i class="fa fa-calendar"></i>&nbsp;
                                        <span></span>&nbsp; <i class="fa fa-caret-down"></i>
                                    </div>
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
                                        <h3 class="text-dark-2 mb-2 h4">{{ trans('lang.driver_table') }}</h3>
                                        <p class="mb-0 text-dark-2">{{ trans('lang.driver_table_text') }}</p>
                                    </div>
                                    <div class="card-header-right d-flex align-items-center">
                                        <div class="card-header-btn mr-3">
                                            <a class="btn-primary btn rounded-full" href="{!! route('drivers.create') !!}"><i class="mdi mdi-plus mr-2"></i>{{ trans('lang.drivers_create') }}</a>
                                        </div>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <div class="table-responsive m-t-10">
                                        <table id="driverTable" class="display nowrap table table-hover table-striped table-bordered table table-striped" cellspacing="0" width="100%">
                                            <thead>
                                                <tr>
                                                    <?php if (($type == "approved" && in_array('approve.driver.delete', json_decode(@session('user_permissions'), true))) || ($type == "pending" && in_array('pending.driver.delete', json_decode(@session('user_permissions'), true))) || ($type == "all" && in_array('drivers.delete', json_decode(@session('user_permissions'), true)))) { ?>
                                                    <th class="delete-all"><input type="checkbox" id="is_active"><label class="col-3 control-label" for="is_active"><a id="deleteAll" class="do_not_delete" href="javascript:void(0)"><i class="mdi mdi-delete"></i> {{ trans('lang.all') }}</a></label></th>
                                                    <?php } ?>
                                                    <th>{{ trans('lang.actions') }}</th>
                                                    <th>{{ trans('lang.driver_info') }}</th>
                                                    <th>{{ trans('lang.active') }}</th>
                                                    <th>{{ trans('lang.driver_online') }}</th>
                                                    <th>{{ trans('lang.date') }}</th>
                                                    <th>{{ trans('lang.total_orders') }}</th>
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
        @include('layouts.driver_deletion_script')
        @include('layouts.section_drivers_script')
        @include('layouts.admin_city_script')

        <script type="text/javascript">

            var section_id = getCookie('section_id') || '';
            var type = "{{ $type }}";

            var sectionType = getCookie('service_type') || '';        
            var user_permissions = '<?php echo @session('user_permissions'); ?>';
            user_permissions = Object.values(JSON.parse(user_permissions));
            var checkDeletePermission = false;
            var checkChatPermission = false;
            if (
                (type == 'pending' && $.inArray('pending.driver.delete', user_permissions) >= 0) ||
                (type == 'approved' && $.inArray('approve.driver.delete', user_permissions) >= 0) ||
                (type == 'all' && $.inArray('drivers.delete', user_permissions) >= 0)
            ) {
                checkDeletePermission = true;
            }
            if ($.inArray('drivers.chat', user_permissions) >= 0) {
                checkChatPermission = true;
            }
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

            function setDate() {
                $('#daterange span').html('{{ trans('lang.select_range') }}');
                $('#daterange').daterangepicker({
                    autoUpdateInput: false,
                }, function(start, end) {
                    $('#daterange span').html(start.format('MMMM D, YYYY') + ' - ' + end.format('MMMM D, YYYY'));
                    $('.filteredRecords').trigger('change');
                });
                $('#daterange').on('apply.daterangepicker', function(ev, picker) {
                    $('#daterange span').html(picker.startDate.format('MMMM D, YYYY') + ' - ' + picker.endDate.format('MMMM D, YYYY'));
                    $('.filteredRecords').trigger('change');
                });
                $('#daterange').on('cancel.daterangepicker', function(ev, picker) {
                    $('#daterange span').html('{{ trans('lang.select_range') }}');
                    $('.filteredRecords').trigger('change');
                });
            }

            setDate();

            $('.filteredRecords').change(async function() {

                var status = $('.status_selector').val();
                var daterangepicker = $('#daterange').data('daterangepicker');
                // Session 41: the filters are applied by SectionDrivers, over the
                // same drivers the unfiltered list shows (both section fields,
                // drivers with no isOwner field included). This used to switch
                // to a `sectionId ==` query, which dropped every driver the app
                // had signed up.
                var filters = {};
                if (status) {
                    filters.status = (status == "active") ? 'active' : 'inactive';
                }
                if ($('#daterange span').html() != '{{ trans('lang.select_range') }}' && daterangepicker) {
                    var from = moment(daterangepicker.startDate).toDate();
                    var to = moment(daterangepicker.endDate).toDate();
                    if (from && to) {
                        filters.from = new Date(from);
                        filters.to = new Date(to);
                    }
                }
                ref = SectionDrivers.source(database, section_id, filters);
                $('#driverTable').DataTable().ajax.reload();
            });

            /*
             * The section's drivers - see public/js/section-drivers.js.
             *
             * Session 41: this was `isOwner == false AND sectionIds array-contains`
             * ordered by createdAt, which never showed a driver with no isOwner
             * field (Arman Khattak and five more in Food Delivery), a driver
             * saved with only the singular sectionId, or one with no createdAt -
             * so the admin could not find them to delete, while Live Tracking
             * drew them. Owners are still left out.
             */
            var ref = SectionDrivers.source(database, section_id);
            
            var alldriver = database.collection('users').where("role", "==", "driver").where('isOwner','==',false).where('sectionId', '==', section_id).orderBy('createdAt', 'desc');
            
            var placeholderImage = '';
            var placeholder = database.collection('settings').doc('placeHolderImage');
            placeholder.get().then(async function(snapshotsimage) {
                var placeholderImageData = snapshotsimage.data();
                placeholderImage = placeholderImageData.image;
            })

            var append_list = '';
            var serviceRef = database.collection('services');

            /**
             * flag -> name, read once per page rather than once per draw.
             *
             * Started immediately, not when the first draw needs it: the draw
             * cannot begin until the row query has answered, so asking for this
             * then put a whole extra round trip on the end of the wait. Asked
             * now, it travels alongside everything else the page opens with.
             */
            var serviceNamesPromise = null;
            function serviceNamesOnce() {
                if (!serviceNamesPromise) {
                    serviceNamesPromise = serviceRef.get().then(function (serviceDocs) {
                        var names = {};
                        serviceDocs.forEach(function (doc) {
                            names[doc.data().flag] = doc.data().name;
                        });
                        return names;
                    }).catch(function (err) {
                        serviceNamesPromise = null;   // let the next draw try again
                        throw err;
                    });
                }
                return serviceNamesPromise;
            }
            serviceNamesOnce();

            $(document).ready(function() {

                
                jQuery("#data-table_processing").show();

                $(document).on('click', '.dt-button-collection .dt-button', function() {
                    $('.dt-button-collection').hide();
                    $('.dt-button-background').hide();
                });
                $(document).on('click', function(event) {
                    if (!$(event.target).closest('.dt-button-collection, .dt-buttons').length) {
                        $('.dt-button-collection').hide();
                        $('.dt-button-background').hide();
                    }
                });
                var fieldConfig = {
                    columns: [{
                            key: 'name',
                            header: "{{ trans('lang.driver_info') }}"
                        },
                        {
                            key: 'serviceName',
                            header: "{{ trans('lang.service_type') }}"
                        },
                        {
                            key: 'totalOrders',
                            header: "{{ trans('lang.total_orders') }}"
                        },
                        {
                            key: 'active',
                            header: "{{ trans('lang.active') }}"
                        },
                        {
                            key: 'createdAt',
                            header: "{{ trans('lang.date') }}"
                        },

                    ],

                    fileName: "{{ trans('lang.driver_table') }}",
                };

                const table = $('#driverTable').DataTable({
                    pageLength: 10, // Number of rows per page
                    processing: false, // Show processing indicator
                    serverSide: true, // Enable server-side processing
                    responsive: true,
                    ajax: function(data, callback, settings) {
                        const start = data.start;
                        const length = data.length;
                        const searchValue = data.search.value.toLowerCase();
                        const orderColumnIndex = data.order[0].column;
                        const orderDirection = data.order[0].dir;

                        const orderableColumns = (checkDeletePermission) ? ['', '', 'name', '', '', 'createdAt', '','', '', ''] : ['', 'name', '', '', 'createdAt', '', '','', '']; // Ensure this matches the actual column names
                        const orderByField = orderableColumns[orderColumnIndex]; // Adjust the index to match your table

                        if (searchValue.length >= 3 || searchValue.length === 0) {
                            $('#data-table_processing').show();
                        }

                        FsDataTable.pageQuery(ref, data, { key: 'driverTable', orderField: orderByField, clientFilters: true }).then(async function(querySnapshot) {
                            if (querySnapshot.empty) {
                                $('.total_count').text(0);
                                $('#data-table_processing').hide(); // Hide loader
                                callback({
                                    draw: data.draw,
                                    recordsTotal: 0,
                                    recordsFiltered: 0,
                                    data: [] // No data
                                });
                                return;
                            }

                            let records = [];
                            let filteredRecords = [];
                            // Fetch service names. This is a twelve-row lookup
                            // table that cannot change while the page is open,
                            // so it is read once and shared by every draw
                            // instead of once per page click, sort and search.
                            let serviceNames = await serviceNamesOnce();

                            querySnapshot.docs.map(async doc => {
                                let childData = doc.data();
                                childData.id = doc.id;
                                childData.name = childData.firstName + ' ' + childData.lastName;
                                childData.serviceName = serviceNames[childData.serviceType] || '-';

                                const isFleetDriver = childData.ownerId && childData.isOwner === false;
                                if (isFleetDriver) {
                                    return;
                                }
                                if (window.ADMIN_CITY && window.ADMIN_CITY.id && childData.zoneId !== window.ADMIN_CITY.id) return; // city admin: own city only
                                const isDocVerified = childData.isDocumentVerify === true;
                                const isAutoVerified = childData.isAutoVerify === true;
                                if (type === 'pending') {
                                    if (isDocVerified || isAutoVerified) {
                                        return;
                                    }
                                }
                                if (type === 'approved') {
                                     if (!isDocVerified && !isAutoVerified) {
                                        return;
                                    }
                                }
                                
                                if (searchValue) {
                                    var date = '';
                                    var time = '';
                                    if (childData.hasOwnProperty("createdAt")) {
                                        try {
                                            date = childData.createdAt.toDate().toDateString();
                                            time = childData.createdAt.toDate().toLocaleTimeString('en-US');
                                        } catch (err) {}
                                    }
                                    var createdAt = date + ' ' + time;
                                    if (
                                        (childData.name && childData.name.toString().toLowerCase().includes(searchValue)) ||
                                        (childData.serviceName && childData.serviceName.toString().toLowerCase().includes(searchValue)) ||
                                        (createdAt && createdAt.toString().toLowerCase().indexOf(searchValue) > -1)
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

                                if (orderByField === 'createdAt' && a[orderByField] != '' && b[orderByField] != '' && a[orderByField] != null && b[orderByField] != null) {

                                    aValue = a[orderByField] ? new Date(a[orderByField].toDate()).getTime() : 0;
                                    bValue = b[orderByField] ? new Date(b[orderByField].toDate()).getTime() : 0;
                                } else if (orderByField === 'totalOrders') {
                                    aValue = parseInt(a[orderByField]) || 0;
                                    bValue = parseInt(b[orderByField]) || 0;
                                } else {
                                    aValue = a[orderByField] ? a[orderByField].toString().toLowerCase().trim() : '';
                                    bValue = b[orderByField] ? b[orderByField].toString().toLowerCase().trim() : ''
                                }

                                if (orderDirection === 'asc') {
                                    return (aValue > bValue) ? 1 : -1;
                                } else {
                                    return (aValue < bValue) ? 1 : -1;
                                }

                            });

                            const totalRecords = filteredRecords.length;
                            $('.total_count').text(FsDataTable.total('driverTable', totalRecords));
                            const paginatedRecords = filteredRecords.slice(FsDataTable.offset('driverTable'), FsDataTable.offset('driverTable') + length);

                            // The document statuses and the order counts are read
                            // at the same time; each row still waits for both.
                            const documentStatusReady = prefetchDocumentStatus(paginatedRecords.map((r) => r.id));
                            documentStatusReady.catch(function () {});

                            await Promise.all(paginatedRecords.map(async (childData, rowIndex) => {
                                childData.totalOrders = await orderDetails(childData.id, childData.serviceTypes || childData.serviceType);
                                await documentStatusReady;
                                var getData = await buildHTML(childData);
                                records[rowIndex] = getData;
                            }));
                            // The rows are placed by index, not appended as each
                            // one finishes, so the page keeps the order the sort
                            // above put them in. Rows the loop skipped leave a hole;
                            // this closes them up.
                            for (let ri = records.length - 1; ri >= 0; ri--) {
                                if (records[ri] === undefined) records.splice(ri, 1);
                            }

                            $(function () {
                                $('[data-toggle="tooltip"]').tooltip();
                            });

                            $('#data-table_processing').hide(); // Hide loader
                            callback({
                                draw: data.draw,
                                recordsTotal: FsDataTable.total('driverTable', totalRecords), // Total number of records in Firestore
                                recordsFiltered: FsDataTable.total('driverTable', totalRecords), // Number of records after filtering (if any)
                                filteredData: filteredRecords,
                                data: records // The actual data to display in the table
                            });
                        }).catch(function(error) {
                            console.error("Error fetching data from Firestore:", error);
                            $('#data-table_processing').hide(); // Hide loader
                            callback({
                                draw: data.draw,
                                recordsTotal: 0,
                                recordsFiltered: 0,
                                data: [] // No data due to error
                            });
                        });
                    },
                    order: (checkDeletePermission) ? [5, 'desc'] : [4, 'desc'],
                    columnDefs: [{
                            orderable: false,
                            targets: (checkDeletePermission) ? [0, 1, 3, 4, 5, 6] : [0, 2, 3, 5, 6],
                        },
                        {
                            type: 'date',
                            render: function(data) {
                                return data;
                            },
                            targets: (checkDeletePermission) ? [5] : [4],
                        }

                    ],
                      "language": datatableLang,
                    dom: 'lfrtipB',
                    buttons: [{
                        extend: 'collection',
                        text: '<i class="mdi mdi-cloud-download"></i>{{ trans('lang.export_as') }}',
                        className: 'btn btn-info',
                        buttons: [{
                                extend: 'excelHtml5',
                                text: '{{ trans('lang.export_excel') }}',
                                action: function(e, dt, button, config) {
                                    exportData(dt, 'excel', fieldConfig);
                                }
                            },
                            {
                                extend: 'pdfHtml5',
                                text: '{{ trans('lang.export_pdf') }}',
                                action: function(e, dt, button, config) {
                                    exportData(dt, 'pdf', fieldConfig);
                                }
                            },
                            {
                                extend: 'csvHtml5',
                                text: '{{ trans('lang.export_csv') }}',
                                action: function(e, dt, button, config) {
                                    exportData(dt, 'csv', fieldConfig);
                                }
                            }
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

                function debounce(func, wait) {
                    let timeout;
                    const context = this;
                    return function(...args) {
                        clearTimeout(timeout);
                        timeout = setTimeout(() => func.apply(context, args), wait);
                    };
                }

                $('#search-input').on('input', debounce(function() {
                    const searchValue = $(this).val();
                    if (searchValue.length >= 3) {
                        $('#data-table_processing').show();
                        table.search(searchValue).draw();
                    } else if (searchValue.length === 0) {
                        $('#data-table_processing').show();
                        table.search('').draw();
                    }
                }, 300));

                /*
                 * Keep every driver's `orderCompleted` field up to date.
                 *
                 * The stored value and the query behind it are unchanged - this
                 * still counts that driver's "Order Completed" vendor_orders and
                 * writes the same number to the same field. What changed is what
                 * it costs, because as written this was the slowest thing in the
                 * whole panel:
                 *
                 *   - it ran on every page open, for every driver in the section
                 *     (281 on the live project), not for the ten rows on screen;
                 *   - it counted by downloading every matching order document;
                 *   - it wrote to all 281 user documents every time, even when
                 *     the number had not moved - and a burst of writes shares one
                 *     connection with the reads the table is waiting for. A trace
                 *     of /drivers showed the writes finishing at 15.9 s and the
                 *     row data not even starting until 11.5 s, behind them.
                 *
                 * Now: the count comes from Firestore's aggregation endpoint
                 * (no documents on the wire), a write only happens when the
                 * number actually changed, and the whole pass waits until the
                 * table has drawn so it can never delay it.
                 */
                function refreshCompletedOrderCounts() {
                    alldriver.get().then(async function(snapshotsdriver) {
                        const drivers = snapshotsdriver.docs.slice();
                        // A few at a time. All 281 at once is what used to
                        // saturate the connection; one at a time would take
                        // 281 round trips end to end.
                        const LANES = 6;
                        async function lane() {
                            while (drivers.length) {
                                const listval = drivers.shift();
                                const previous = listval.data().orderCompleted;
                                const ordersRef = database.collection('vendor_orders')
                                    .where('driverID', '==', listval.id)
                                    .where("status", "in", ["Order Completed"]);
                                // Taxi drivers complete `rides`, not `vendor_orders`.
                                // Counting only vendor_orders wrote 0 for every taxi
                                // driver - over the correct number the Rides page
                                // writes - and customers saw "0 trips". Both are
                                // counted now; a driver only ever has one kind.
                                const ridesRef = database.collection('rides')
                                    .where('driverId', '==', listval.id)
                                    .where("status", "in", ["Order Completed"]);
                                const countOf = async function(ref) {
                                    return (window.FsDataTable && FsDataTable.count)
                                        ? await FsDataTable.count(ref)
                                        : (await ref.get()).docs.length;
                                };
                                let count_order_complete;
                                try {
                                    const counts = await Promise.all([countOf(ordersRef), countOf(ridesRef)]);
                                    count_order_complete = counts[0] + counts[1];
                                } catch (err) {
                                    continue;   // leave the stored value alone rather than write a guess
                                }
                                if (previous === count_order_complete) {
                                    continue;   // nothing to say
                                }
                                database.collection('users').doc(listval.id).update({
                                    'orderCompleted': count_order_complete
                                }).then(function(result) {

                                });
                            }
                        }
                        await Promise.all(Array.from({ length: LANES }, lane));
                    });
                }

                /*
                 * Run it at most once every fifteen minutes per section, not on
                 * every page open.
                 *
                 * It walks every driver in the section - 281 of them on the live
                 * project - so even now that it counts without downloading and
                 * writes only when a number has changed, doing that each time
                 * the admin clicks Drivers is hundreds of requests for a figure
                 * that moves when an order completes, not when a page is opened.
                 * The value it stores is unchanged; only how often it is
                 * recalculated is.
                 */
                function refreshDueNow() {
                    var key = 'fs:orderCompleted:refreshedAt:' + section_id;
                    try {
                        var last = Number(window.sessionStorage.getItem(key) || 0);
                        if (Date.now() - last < 15 * 60 * 1000) return false;
                        window.sessionStorage.setItem(key, String(Date.now()));
                    } catch (e) {
                        // No sessionStorage: fall back to the old behaviour of
                        // refreshing on every open rather than never refreshing.
                    }
                    return true;
                }

                if (refreshDueNow()) {
                    if (window.requestIdleCallback) {
                        requestIdleCallback(refreshCompletedOrderCounts, { timeout: 8000 });
                    } else {
                        setTimeout(refreshCompletedOrderCounts, 3000);
                    }
                }

            });

            /*
             * The ten verification documents for the rows on screen, fetched
             * together.
             *
             * `where(documentId(), 'in', [...])` takes ten ids at a time, so a
             * page of rows costs one round trip instead of ten. The icons drawn
             * are identical; only the number of requests changes. PanelSpeed.docs
             * falls back to individual reads if the batch is refused.
             */
            var verifyDocs = {};
            async function prefetchDocumentStatus(ids) {
                verifyDocs = {};
                if (!window.PanelSpeed || !PanelSpeed.docs) return;
                try {
                    verifyDocs = await PanelSpeed.docs(database, 'documents_verify', ids);
                } catch (err) {
                    verifyDocs = {};   // getDocumentStatusIcon reads it per row instead
                }
            }

            //document verification status icon add new code
            async function getDocumentStatusIcon(driverId) {
                var prefetched = Object.prototype.hasOwnProperty.call(verifyDocs, driverId)
                    ? verifyDocs[driverId]
                    : undefined;
                const docSnap = prefetched !== undefined
                    ? { exists: prefetched !== null, data: function () { return prefetched; } }
                    : await database.collection('documents_verify').doc(driverId).get();
                if (!docSnap.exists) return '';

                const docs = docSnap.data().documents || [];

                const approved = docs.filter(d => d.status === 'approved').length;
                const rejected = docs.filter(d => d.status === 'rejected').length;
                const total   = docs.length;

                if (approved === total && total > 0) {
                    return '<i class="mdi mdi-verified verified-icon" data-toggle="tooltip" data-bs-original-title="Verified"></i>';
                }
                if (rejected > 0) {
                    return '<i class="mdi mdi-close-circle unverified-icon" data-toggle="tooltip" data-bs-original-title="Rejected" style="color:red;"></i>';
                }
                return '';
            }
            
            async function buildHTML(val) {
                var html = [];
                var id = val.id;
                var route1 = '{{ route('drivers.edit', ':id') }}';
                route1 = route1.replace(':id', id);

                var driverView = '{{ route('drivers.view', ':id') }}';
                driverView = driverView.replace(':id', id);

                if (checkDeletePermission) {
                    html.push('<td class="delete-all"><input type="checkbox" id="is_open_' + id + '" class="is_open" dataId="' + id + '"><label class="col-3 control-label"\n' +
                        'for="is_open_' + id + '" ></label></td>');
                }
                var actionHtml = '';
                var unreadHtml = '';
                var chatViewRoute = "{{ route('drivers.chat', ':id') }}".replace(':id', val.id);
                actionHtml += '<span class="action-btn">';
                
                if(val.isAutoVerify !== true){
                    var document_list_view = "{{ route('drivers.document', ':id') }}";
                    document_list_view = document_list_view.replace(':id', val.id);
                    actionHtml += '<a href="' + document_list_view + '" data-toggle="tooltip" data-bs-original-title="{{ trans('lang.document') }}"><i class="fa fa-file"></i></a>';
                }

                var payoutRequests = '{{ route('users.walletstransaction', ':id') }}';
                payoutRequests = payoutRequests.replace(':id', 'driverID=' + val.id);
                actionHtml += '<a href="' + payoutRequests + '"><i class="mdi mdi-wallet" data-toggle="tooltip" data-bs-original-title="{{ trans('lang.wallet_transaction') }}"></i></a>';
                
                actionHtml += '<a href="' + driverView + '" data-toggle="tooltip" data-bs-original-title="{{ trans('lang.view') }}"><i class="mdi mdi-eye"></i></a><a href="' + route1 + '" data-toggle="tooltip" data-bs-original-title="{{ trans('lang.edit') }}"><i class="mdi mdi-lead-pencil"></i></a>';
                if (checkDeletePermission) {
                    actionHtml += '<a id="' + val.id + '" data-toggle="tooltip" data-bs-original-title="{{ trans('lang.delete') }}" name="driver-delete" class="delete-btn" href="javascript:void(0)"><i class="mdi mdi-delete"></i></a>';
                }
                if(checkChatPermission){
                    actionHtml += '<a href="' + chatViewRoute + '" class="chat-message" style="position: relative; display: inline-block;">' +
                            '<i class="mdi mdi-wechat mdi-24px"></i>' + unreadHtml +
                            '</a>' 
                }
                actionHtml += '</span>';
                
                html.push(actionHtml);
                
                var verified = await getDocumentStatusIcon(val.id);

                if(val.isAutoVerify === true){
                    verified += ' <i class="mdi mdi-check-circle verified-icon" data-toggle="tooltip" data-bs-original-title="{{ trans('lang.auto_approved') }}"></i>';
                }

                if (val.profilePictureURL == '') {
                    html.push('<td><img class="rounded" style="width:50px" src="' + placeholderImage + '" alt="image"></td> ' + ' <a data-url="' + driverView + '" href="' + driverView + '" class="redirecttopage left_space">' + val.firstName + ' ' + val.lastName + '</a>' + verified);
                } else {
                    if (val.profilePictureURL) {
                        photo = val.profilePictureURL;
                    } else {
                        photo = placeholderImage;
                    }
                    html.push('<td><img class="rounded" style="width:50px" src="' + photo + '" alt="image" onerror="this.onerror=null;this.src=\'' + placeholderImage + '\'"></td>' + '<a data-url="' + driverView + '" href="' + driverView + '" class="redirecttopage left_space">' + val.firstName + ' ' + val.lastName + '</a>' + verified);
                }

                if (val.active == true) {
                    html.push('<td><label class="switch"><input type="checkbox" checked id="' + val.id + '" name="isActive"><span class="slider round"></span></label></td>');
                } else {
                    html.push('<td><label class="switch"><input type="checkbox" id="' + val.id + '" name="isActive"><span class="slider round"></span></label></td>');
                }
                if (val.isActive) {
                    html.push('<td><label class="switch"><input type="checkbox" checked id="' + val.id + '" name="isOnline"><span class="slider round"></span></label></td>');
                } else {
                    html.push('<td><label class="switch"><input type="checkbox" id="' + val.id + '" name="isOnline"><span class="slider round"></span></label></td>');
                }

                var date = '';
                var time = '';
                if (val.hasOwnProperty("createdAt")) {
                    try {
                        date = val.createdAt.toDate().toDateString();
                        time = val.createdAt.toDate().toLocaleTimeString('en-US');
                    } catch (err) {

                    }
                    html.push('<td class="dt-time">' + date + '<br> ' + time + '</td>');
                } else {
                    html.push('');
                }

                let serviceTypes = val.serviceTypes || (val.serviceType ? [val.serviceType] : []);
                if (serviceTypes){

                    var url = "Javascript:void(0)";
                    if (serviceTypes.includes("parcel_delivery") && sectionType == "parcel_delivery") {
                        url = "{{ route('parcel_orders.driver', 'id') }}";
                        url = url.replace("id", val.id);
                    }else if(serviceTypes.includes("rental-service") && sectionType == "rental-service"){
                        url = "{{ route('rental_orders.driver', 'id') }}";
                        url = url.replace("id", val.id);
                    } else if ((serviceTypes.includes("delivery-service") && sectionType == "delivery-service") || (serviceTypes.includes("ecommerce-service") && sectionType == "ecommerce-service")) {
                        url = "{{ route('orders', 'id') }}";
                        url = url.replace("id", 'driverId=' + val.id);
                    }else if(serviceTypes.includes("cab-service") && sectionType == "cab-service"){
                        url = "{{ route('drivers.rides', 'driverId') }}";
                        url = url.replace('driverId', val.id);
                    }

                    html.push((val.totalOrders > 0 ? '<a href="' + url + '">' + val.totalOrders + '</a>' : val.totalOrders));

                } else {
                    html.push('');
                }

                return html;
            }

            /**
             * How many orders this driver has, for the "Total orders" column.
             *
             * Same collections, same filters, same number - but asked as a count
             * rather than answered by downloading the documents and reading
             * `.docs.length`. A driver with 400 rides used to cost 400 document
             * reads to print "400", once per row, on every draw.
             *
             * countRows() falls back to exactly the old read whenever the
             * aggregation is unavailable, so the figure can never differ.
             */
            async function countRows(ref) {
                if (window.FsDataTable && FsDataTable.count) {
                    try {
                        return await FsDataTable.count(ref);
                    } catch (err) { /* fall through to the read below */ }
                }
                return (await ref.get()).docs.length;
            }

            async function orderDetails(driverId, serviceTypes) {
                let totalOrders = 0;
                /*
                 * A driver document may carry no `serviceTypes` at all - 24 of the
                 * 56 driver profiles on this project do not, because an older build
                 * of the driver app saves the whole profile and drops the fields it
                 * does not know. `undefined.includes(...)` threw here, inside the
                 * row loop, and one throw abandoned the entire draw: the count had
                 * already been written to the heading, so the page showed a total
                 * with an empty table under it.
                 *
                 * Normalised exactly as buildHTML() above already does it: the
                 * plural field, else the legacy singular one, else nothing. A
                 * driver with no service simply counts no orders.
                 */
                const types = Array.isArray(serviceTypes)
                    ? serviceTypes
                    : (typeof serviceTypes === 'string' && serviceTypes ? [serviceTypes] : []);
                if (types.includes("cab-service") && sectionType == "cab-service") {
                    totalOrders += await countRows(database.collection('rides').where('driverId', '==', driverId));
                }
                if (types.includes("rental-service") && sectionType == "rental-service") {
                    totalOrders += await countRows(database.collection('rental_orders').where('driverId', '==', driverId));
                }
                if ((types.includes("delivery-service") && sectionType == "delivery-service") || (types.includes("ecommerce-service") && sectionType == "ecommerce-service")) {
                    totalOrders += await countRows(database.collection('vendor_orders').where('driverID', '==', driverId));
                }
                if (types.includes("parcel_delivery")  && sectionType == "parcel_delivery") {
                    totalOrders += await countRows(database.collection('parcel_orders').where('driverId', '==', driverId));
                }
                return totalOrders;
            }

            $(document).on("click", "input[name='isOnline']", function(e) {
                var ischeck = $(this).is(':checked');
                var id = this.id;
                if (ischeck) {
                    database.collection('users').doc(id).update({
                        'isActive': true
                    }).then(function(result) {});
                } else {
                    database.collection('users').doc(id).update({
                        'isActive': false
                    }).then(function(result) {});
                }
            });
            $(document).on("click", "input[name='isActive']", function(e) {
                var ischeck = $(this).is(':checked');
                var id = this.id;
                if (ischeck) {
                    database.collection('users').doc(id).update({
                        'active': true
                    }).then(function(result) {});
                } else {
                    database.collection('users').doc(id).update({
                        'active': false
                    }).then(function(result) {});
                }
            });

            $("#is_active").click(function() {
                $("#driverTable .is_open").prop('checked', $(this).prop('checked'));

            });

            $("#deleteAll").click(function() {
                if ($('#driverTable .is_open:checked').length) {
                    if (confirm("{{ trans('lang.selected_delete_alert') }}")) {
                        jQuery("#data-table_processing").show();
                        $('#driverTable .is_open:checked').each(async function() {
                            var dataId = $(this).attr('dataId');
                            const car_info = database.collection('users').doc(dataId).get()
                                .then(async function(querySnapshot) {
                                    const data = querySnapshot.data();
                                    if(data.carInfo != null){
                                        const car_image = data.carInfo.car_image;
                                        if (car_image.length > 0) {
                                            for (var i = 0; i < car_image.length; i++) {
                                                deleteImageFromBucket(car_image[i]);
                                            }
                                        }
                                    }
                                });

                            // Recorded first: a driver app still running would otherwise write the profile back.
                            DriverDeletion.markDeleted(database, dataId)
                                .then(() => deleteDocumentWithImage('users', dataId, 'carPictureURL', '', 'profilePictureURL', 'carProofPictureURL', 'driverProofPictureURL'))
                                .then(() => {
                                    return deleteDriverData(dataId);
                                })
                                .then(result => {
                                    setTimeout(function() {
                                        window.location.reload();
                                    }, 7000);
                                })
                                .catch(error => {
                                    console.error("Error occurred:", error);
                                });

                        });
                    }
                } else {
                    alert("{{ trans('lang.select_delete_alert') }}");
                }
            });

            async function deleteDriverData(driverId) {

                await database.collection('driver_payouts').where('driverID', '==', driverId).get().then(async function(snapshotsItem) {

                    if (snapshotsItem.docs.length > 0) {
                        snapshotsItem.docs.forEach((temData) => {
                            var item_data = temData.data();

                            database.collection('driver_payouts').doc(item_data.id).delete().then(function() {

                            });
                        });
                    }

                });

                //delete user from authentication - awaited, so the page no longer reloads before it has happened
                var projectId = '<?php echo env('FIREBASE_PROJECT_ID'); ?>';
                await DriverDeletion.revokeLogin(projectId, driverId);
            }

            $(document.body).on('click', '.redirecttopage', function() {
                var url = $(this).attr('data-url');
                window.location.href = url;
            });


            $(document).on("click", "a[name='driver-delete']", function(e) {
                if (!confirm("{{ trans('lang.are_you_sure') }}")) return; // ask before deleting
                var id = this.id;
                jQuery("#data-table_processing").show();
                const car_info = database.collection('users').doc(id).get()
                    .then(async function(querySnapshot) {
                        const data = querySnapshot.data();
                        if(data.carInfo != null){
                            const car_image = data.carInfo.car_image;
                            if (car_image.length > 0) {
                                for (var i = 0; i < car_image.length; i++) {
                                    deleteImageFromBucket(car_image[i]);
                                }
                            }
                        }
                    });

                // Recorded first: a driver app still running would otherwise write the profile back.
                DriverDeletion.markDeleted(database, id)
                    .then(() => deleteDocumentWithImage('users', id, 'carPictureURL', '', 'profilePictureURL', 'carProofPictureURL', 'driverProofPictureURL'))
                    .then(() => {
                        return deleteDriverData(id);
                    })
                    .then(result => {
                        setTimeout(function() {
                            window.location.reload();
                        }, 7000);
                    })
                    .catch(error => {
                        console.error("Error occurred:", error);
                    });
            });

            var rows = document.getElementsByTagName("table")[0].rows;
        </script>
    @endsection