<!doctype html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" <?php if (str_replace('_', '-', app()->getLocale()) == 'ar' || @$_COOKIE['is_rtl'] == 'true') { ?> dir="rtl" <?php } ?>>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <!-- CSRF Token -->
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ config('app.name', 'Laravel') }}</title>
    <link rel="icon" type="image/x-icon" href="{{ asset('images/logo-light-icon.png') }}">
    <!-- Fonts -->
    <link rel="dns-prefetch" href="//fonts.gstatic.com">
    <link href="https://fonts.googleapis.com/css?family=Nunito" rel="stylesheet">
    <!-- Styles -->
    <link href="{{ asset('assets/plugins/bootstrap/css/bootstrap.min.css') }}" rel="stylesheet">

    <?php if (str_replace('_', '-', app()->getLocale()) == 'ar' || @$_COOKIE['is_rtl'] == 'true') { ?>
        <link href="{{asset('assets/plugins/bootstrap/css/bootstrap-rtl.min.css')}}" rel="stylesheet">
    <?php } ?>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-timepicker/0.5.2/css/bootstrap-timepicker.min.css">
    <link href="{{ asset('css/style.css') }}" rel="stylesheet">
    
    <?php if (str_replace('_', '-', app()->getLocale()) == 'ar' || @$_COOKIE['is_rtl'] == 'true') { ?>
        <link href="{{asset('css/style_rtl.css')}}" rel="stylesheet">
    <?php } ?>
    
    <link href="{{ asset('css/icons/font-awesome/css/font-awesome.css') }}" rel="stylesheet">
    <link href="{{ asset('assets/plugins/toast-master/css/jquery.toast.css')}}" rel="stylesheet">
    <link href="{{ asset('css/colors/blue.css') }}" rel="stylesheet">
    <link href="{{ asset('css/chosen.css') }}" rel="stylesheet">
    <link href="{{ asset('css/bootstrap-tagsinput.css') }}" rel="stylesheet">
    {{-- The rich-text editor is used by nine views; the rest were paying 326 KB
         of script and its stylesheet for a control that is not on the page. --}}
    @hasSection('needsEditor')
    <link href="{{ asset('assets/plugins/summernote/summernote-bs4.css') }}" rel="stylesheet">
    @endif
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.css" />
    <!-- Datatable css -->
    <link rel="stylesheet" href="https://cdn.datatables.net/1.13.4/css/jquery.dataTables.min.css">
    <link rel="stylesheet" type="text/css" href="https://cdn.datatables.net/buttons/2.2.3/css/buttons.dataTables.min.css">
    <link rel="stylesheet" href="https://cdn.datatables.net/responsive/2.4.1/css/responsive.dataTables.min.css">
    <link rel="stylesheet" href="{{ asset('assets/plugins/select2/dist/css/select2.min.css')}}">
    @hasSection('needsMap')
    <link rel="stylesheet" href="https://unpkg.com/leaflet/dist/leaflet.css" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet-draw/dist/leaflet.draw.css" />
    @endif
    <link href="https://fonts.googleapis.com/css2?family=Urbanist:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">
    <link href="{{ asset('css/toastr.min.css')}}" rel="stylesheet">
    <link rel="stylesheet" href="https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.css">

    @php $layoutAdminCity = \App\Helpers\AdminCity::forUser(optional(Auth::user())->id); @endphp
    @if ($layoutAdminCity)
    {{-- City admin (App\Helpers\AdminCity): the service switcher lists only the services open in that city. --}}
    <script>window.ADMIN_CITY = @json($layoutAdminCity);</script>
    @endif

    <script>
        function setCookie(cname, cvalue, exdays) {
            const d = new Date();
            d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
            let expires = "expires=" + d.toUTCString();
            document.cookie = cname + "=" + cvalue + ";" + expires + ";path=/";
        }

        function getCookie(cname) {
            let name = cname + "=";
            let ca = document.cookie.split(';');
            for (let i = 0; i < ca.length; i++) {
                let c = ca[i];
                while (c.charAt(0) == ' ') {
                    c = c.substring(1);
                }
                if (c.indexOf(name) == 0) {
                    return c.substring(name.length, c.length);
                }
            }
            return "";
        }
        let admin_panel_color = getCookie("admin_panel_color");
        if (admin_panel_color) {
            document.documentElement.style.setProperty('--admin-panel-color', admin_panel_color);
        }
    </script>

    <!-- @yield('style') -->
     
     <style>
        :root {
            --admin-panel-color: "#000000";
        }
    </style>

    <link rel="stylesheet" href="{{ asset('css/admin.css') }}">
</head>

<body>
    <div id="app" class="fix-header fix-sidebar card-no-border">
        <div id="main-wrapper">
            <div id="data-table_processing" class="page-overlay" style="display:none;">
                <div class="overlay-text">
                    <img src="{{asset('images/spinner.gif')}}">
                </div>
            </div>
            <header class="topbar non-printable">
                <nav class="navbar top-navbar navbar-expand-md navbar-light">
                    @include('layouts.header')
                </nav>
            </header>
            <aside class="left-sidebar non-printable">
                <div class="scroll-sidebar">
                    @include('layouts.menu')
                </div>
            </aside>
        </div>
        <main class="py-4">
            @yield('content')
        </main>
    </div>
    {{--
        Leaflet and its four plug-ins are only used by seven views - the four
        god's-eye maps, zone create/edit and sos/edit - and cost every other page
        170 KB plus six requests. Those views declare @section('needsMap') and
        get them; nothing else does.
    --}}
    @hasSection('needsMap')
    <script src="https://unpkg.com/leaflet/dist/leaflet.js"></script>
    <script src="https://unpkg.com/leaflet-draw/dist/leaflet.draw.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet-editable/0.7.3/leaflet.editable.min.js"></script>
    <script src="https://unpkg.com/leaflet-draw@0.4.14/dist/leaflet.draw-src.js"></script>
    <script src="https://unpkg.com/leaflet-geojson-layer/src/leaflet.geojson.js"></script>
    <script src="https://unpkg.com/leaflet-routing-machine/dist/leaflet-routing-machine.js"></script>
    @endif
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>
    <script src="{{ asset('assets/plugins/bootstrap/js/popper.min.js') }}"></script>
    <script src="{{ asset('assets/plugins/bootstrap/js/bootstrap.min.js') }}"></script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    <script src="{{ asset('js/jquery.slimscroll.js') }}"></script>
    <script src="{{ asset('js/waves.js') }}"></script>
    <script src="{{ asset('js/sidebarmenu.js') }}"></script>
    <script src="{{ asset('assets/plugins/sticky-kit-master/dist/sticky-kit.min.js') }}"></script>
    <script src="{{ asset('assets/plugins/sparkline/jquery.sparkline.min.js')}}"></script>
    <script src="{{ asset('js/custom.min.js') }}"></script>
    @hasSection('needsEditor')
    <script src="{{ asset('assets/plugins/summernote/summernote-bs4.js')}}"></script>
    @endif
    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-storage-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js"></script>
    <script src="https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js"></script>
    <script src="https://unpkg.com/geofirestore@5.2.0/dist/geofirestore.js"></script>
    <script src="https://cdn.firebase.com/libs/geofire/5.0.1/geofire.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="{{ asset('js/chosen.jquery.js') }}"></script>
    <script src="{{ asset('js/jquery.resizeImg.js') }}"></script>
    <script src="{{ asset('js/bootstrap-tagsinput.js') }}"></script>
    <script src="{{ asset('js/crypto-js.js') }}"></script>
    <script src="{{ asset('js/jquery.cookie.js') }}"></script>
    <script src="{{ asset('js/jquery.validate.js') }}"></script>
    <script src="{{ asset('assets/plugins/select2/dist/js/select2.min.js') }}"></script>
    <script src="{{ asset('js/jquery.masking.js') }}"></script>
    <script src="{{ asset('js/toastr.min.js') }}"></script>
    
    <!-- Configuration-document cache, batched id lookups, on-demand libraries -->
    <script src="{{ asset('js/panel-speed.js') }}"></script>

    <!-- Service-zone filtering and live positions for the god's-eye maps -->
    <script src="{{ asset('js/live-tracking.js') }}"></script>

    <!-- Cursor-based Firestore pagination for the DataTables below -->
    <script src="{{ asset('js/firestore-datatable.js') }}"></script>
    @include('layouts.firestore_datatable_fallback')

    <!-- Datatable script -->
    <script type="text/javascript" src="https://cdn.datatables.net/1.13.4/js/jquery.dataTables.min.js"></script>
    <script type="text/javascript" src="https://cdn.datatables.net/responsive/2.4.1/js/dataTables.responsive.min.js"></script>
    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-timepicker/0.5.2/js/bootstrap-timepicker.min.js"></script>
    <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/2.2.3/js/dataTables.buttons.min.js"></script>
    <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/2.2.3/js/buttons.html5.min.js"></script>
    <script type="text/javascript" charset="utf8" src="https://cdn.datatables.net/buttons/2.2.3/js/buttons.print.min.js"></script>
    <script type="text/javascript">
        /*
         * The export libraries are loaded when the admin clicks Export, not on
         * every page view.
         *
         * pdfmake + its font file + xlsx + jszip + jspdf + autotable came to
         * 1.2 MB of blocking script on every single page of this panel, and a
         * trace of /drivers showed why that matters: the page's FIRST Firestore
         * call did not start until 4.2 s, behind that download.
         *
         * DataTables Buttons decides whether to draw an export button by calling
         * `available()` on it, which tests for the library - so the buttons are
         * told the library is there. That is honest here: every one of the 40
         * views with an export button overrides `action:` with the panel's own
         * exportData(), which fetches what it needs through PanelSpeed.lib()
         * before using it. `pdfMake` is referenced nowhere in the panel at all -
         * it existed purely to satisfy this check - so it is not even fetched
         * on demand.
         */
        (function () {
            function stub(name) {
                try {
                    var b = jQuery.fn.dataTable.ext.buttons[name];
                    if (b) b.available = function () { return true; };
                } catch (e) { /* Buttons not present on this page */ }
            }
            ['excelHtml5', 'pdfHtml5', 'csvHtml5'].forEach(stub);
        })();
    </script>
    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-timepicker/0.5.2/js/bootstrap-timepicker.min.js"></script>
    <script type="text/javascript" src="https://cdn.jsdelivr.net/momentjs/latest/moment.min.js"></script>
    <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/daterangepicker/daterangepicker.min.js"></script>
    <script src="https://code.jquery.com/ui/1.13.2/jquery-ui.min.js"></script>

    <script type="text/javascript">
        jQuery(window).scroll(function () {
            var scroll = jQuery(window).scrollTop();
            if (scroll <= 60) {
                jQuery("body").removeClass("sticky");
            } else {
                jQuery("body").addClass("sticky");
            }
        });
        const datatableLang = {
            "decimal":        "",
            "emptyTable":     "{{ trans('lang.no_record_found') }}",
            "info":           "{{ trans('lang.datatable_info') }}", 
            "infoEmpty":      "{{ trans('lang.datatable_info_empty') }}", 
            "infoFiltered":   "{{ trans('lang.datatable_info_filtered') }}", 
            "lengthMenu":     "{{ trans('lang.datatable_length_menu') }}",
            "loadingRecords": "{{ trans('lang.loading') }}",
            "processing":     "{{ trans('lang.processing') }}",
            "search":         "{{ trans('lang.search') }}",
            "zeroRecords":    "{{ trans('lang.no_record_found') }}",
            "paginate": {
                "first":      "{{ trans('lang.first') }}",
                "last":       "{{ trans('lang.last') }}",
                "next":       "{{ trans('lang.next') }}",
                "previous":   "{{ trans('lang.previous') }}"
            },
            "aria": {
                "sortAscending":  ": {{ trans('lang.sort_asc') }}",
                "sortDescending": ": {{ trans('lang.sort_desc') }}"
            }
        };
    </script>
    <script type="text/javascript">

        var languages_list_main = [];
        var database = firebase.firestore();
        var geoFirestore = new GeoFirestore(database);

        /*
         * Give every image this panel uploads a real cache lifetime.
         *
         * Firebase Storage defaults an object to `cache-control: private,
         * max-age=0`, so a logo the browser downloaded a second ago is fetched
         * again on the next page. These are write-once files with a generated,
         * timestamped name - nothing ever changes behind a given URL - so there
         * is nothing to gain from revalidating them and a great deal to lose:
         * the section logos and the app logo alone are several MB per page view.
         *
         * Patched on the prototype rather than at each of the ~40 upload sites,
         * so no view changes and an explicit metadata argument still wins.
         */
        (function () {
            try {
                var proto = firebase.storage.Reference.prototype;
                if (!proto || proto.__cacheControlPatched) return;
                var originalPut = proto.put;
                proto.put = function (data, metadata) {
                    metadata = metadata || {};
                    if (!metadata.cacheControl) {
                        metadata.cacheControl = 'public, max-age=2592000';   // 30 days
                    }
                    return originalPut.call(this, data, metadata);
                };
                proto.__cacheControlPatched = true;
            } catch (e) {
                // Storage not loaded on this page, or a future SDK moved the
                // prototype: uploads simply keep the Firebase default.
            }
        })();
        var createdAtman = firebase.firestore.Timestamp.fromDate(new Date());
        var createdAt = { _nanoseconds: createdAtman.nanoseconds, _seconds: createdAtman.seconds };
        var mapType = 'ONLINE';

        var sosInitialized = false; 
        // SOS ids this browser has already been told about, so one SOS never alerts twice.
        var sosSeen = {};
        try { sosSeen = JSON.parse(localStorage.getItem('sosAlertSeen') || '{}') || {}; } catch (e) { sosSeen = {}; }
        function saveSosSeen() {
            try { localStorage.setItem('sosAlertSeen', JSON.stringify(sosSeen)); } catch (e) {}
        }
        database.collection('SOS').onSnapshot((snapshot) => {
            if (!sosInitialized) {               
                // A cache-only snapshot can be empty; wait for the server's answer.
                // Everything in that first server answer already existed - it is not new.
                if (snapshot.metadata.fromCache) {
                    return;
                }
                sosInitialized = true;
                var current = {};
                snapshot.docs.forEach(function (doc) { current[doc.id] = 1; });
                sosSeen = current;
                saveSosSeen();
                return;
            }

            snapshot.docChanges().forEach((change) => {
                if (change.type === "added" && !sosSeen[change.doc.id]) {
                    var data = change.doc.data();
                    sosSeen[change.doc.id] = 1;
                    saveSosSeen();
                    if (data.status && data.status !== 'Initiated') {
                        return;
                    }
                    Swal.fire({
                        icon: 'warning',
                        title: 'SOS Alert!',
                        html: `New SOS initiated<br>`,
                        confirmButtonText: 'View Details',
                        confirmButtonColor: '#d33',
                    }).then((result) => {
                        if (result.isConfirmed) {
                            window.location.href = '{{ route("sos.edit", ":id") }}'.replace(':id', change.doc.id);
                        }
                    });
                }
            });
        });
        
        /**
         * Session-scoped cache for the settings this layout reads on every page.
         *
         * `globalSettings`, `placeHolderImage`, `languages` and the `sections`
         * list are the same for the whole of an admin's session, but they were
         * re-read on all ~120 pages of the panel. On this project that is about
         * 190 KB and four serial round trips before any page starts on its own
         * work - `globalSettings` alone is 130 KB, because eMart stores the
         * notification ringtone in it as a base64 data URI.
         *
         * The cache is per tab, expires on its own, and is dropped entirely
         * while the admin is anywhere that edits these documents, so a saved
         * change is still visible on the very next page.
         */
        var FsSettingsCache = (function () {
            var TTL_MS = 5 * 60 * 1000;
            var PREFIX = 'fs:settings:';
            var editing = /\/(settings|section)/i.test(window.location.pathname);

            function read(key) {
                if (editing) return null;
                try {
                    var raw = sessionStorage.getItem(PREFIX + key);
                    if (!raw) return null;
                    var box = JSON.parse(raw);
                    if (!box || (Date.now() - box.at) > TTL_MS) return null;
                    return box.value;
                } catch (e) {
                    return null;   // private mode, or a value we can no longer parse
                }
            }

            function write(key, value) {
                try {
                    sessionStorage.setItem(PREFIX + key,
                        JSON.stringify({ at: Date.now(), value: value }));
                } catch (e) { /* quota or private mode: just do without the cache */ }
            }

            if (editing) {
                try {
                    Object.keys(sessionStorage)
                        .filter(function (k) { return k.indexOf(PREFIX) === 0; })
                        .forEach(function (k) { sessionStorage.removeItem(k); });
                } catch (e) { /* nothing to clear */ }
            }

            return {
                /** settings/<name>, cached. Resolves to the document data, or null. */
                doc: function (name) {
                    var hit = read('doc:' + name);
                    if (hit !== undefined && hit !== null) return Promise.resolve(hit);
                    return database.collection('settings').doc(name).get().then(function (snap) {
                        var data = snap.exists ? snap.data() : null;
                        write('doc:' + name, data);
                        return data;
                    });
                },
                /**
                 * The same cached document, shaped like the DocumentSnapshot
                 * the calling code already expects.
                 *
                 * Fifteen views read `settings/globalSettings` directly on
                 * every page load - 130 KB each time, and 127 KB of that is the
                 * base64 ringtone eMart stores inline. They all do
                 *
                 *     ref.get().then(function (snapshot) { snapshot.data() ... })
                 *
                 * so handing them a `{ exists, data() }` shim lets them share
                 * this cache without a single line of their own logic changing.
                 * Falls back to a real read whenever the cache declines (the
                 * settings pages themselves, private mode, an expired entry).
                 */
                snapshot: function (name) {
                    return this.doc(name).then(function (data) {
                        var present = data !== null && data !== undefined;
                        return {
                            exists: present,
                            data: function () { return present ? data : undefined; }
                        };
                    });
                },
                /** Any other read, cached under `key`, produced by `load()`. */
                value: function (key, load) {
                    var hit = read(key);
                    if (hit !== undefined && hit !== null) return Promise.resolve(hit);
                    return Promise.resolve(load()).then(function (value) {
                        write(key, value);
                        return value;
                    });
                }
            };
        })();

        FsSettingsCache.doc('globalSettings').then(async function (globalSettings) {
            if (!globalSettings) return;
            $("#app_name").html(globalSettings.applicationName);
            $("#logo_web").attr('src', globalSettings.appLogo);
            document.documentElement.style.setProperty('--admin-panel-color', globalSettings.admin_panel_color);
        });

        var placeholderImage = '';
        FsSettingsCache.doc('placeHolderImage').then(async function (placeholderImageData) {
            placeholderImage = placeholderImageData ? placeholderImageData.image : '';
        })

        $(document).ready(async function () {
            getServiceSections();
            $(document).on('click', '.service-list-box', function() {
                let sectionUrl = $(this).data('section-url');
                let sectionId = $(this).data('section-id');
                let sectionType = $(this).data('section-type');
                if(sectionId && sectionType){
                    setCookie('section_id', sectionId, 1);
                    setCookie('service_type', sectionType, 1);
                }
                window.location.href = sectionUrl;
                /*window.location.reload();*/
            });
        });
        
        var langcount = 0;
        FsSettingsCache.doc('languages').then(async function (snapshotslang) {
            if (snapshotslang != undefined && snapshotslang != null) {
                snapshotslang = snapshotslang.list;
                languages_list_main = snapshotslang;
                snapshotslang.forEach((data) => {
                    if (data.isActive == true) {
                        langcount++;
                        $('#language_dropdown').append($("<option></option>").attr("value", data.slug).text(data.title));
                    }
                });
                if (langcount > 1) {
                    $("#language_dropdown_box").css('visibility', 'visible');
                }
                <?php if (session()->get('locale')) { ?>
                    $("#language_dropdown").val("<?php    echo session()->get('locale'); ?>");
                <?php } ?>
            }
        });

        var url = "{{ route('changeLang') }}";
        $(".changeLang").change(function () {
            var slug = $(this).val();
            languages_list_main.forEach((data) => {
                if (slug == data.slug) {
                    if (data.is_rtl == undefined) {
                        setCookie('is_rtl', 'false', 365);
                    } else {
                        setCookie('is_rtl', data.is_rtl.toString(), 365);
                    }
                    window.location.href = url + "?lang=" + slug;
                }
            });
        });

        var version = database.collection('settings').doc("Version");
        version.get().then(async function (snapshots) {
            var version_data = snapshots.data();
            if (version_data == undefined) {
                database.collection('settings').doc('Version').set({});
            }
            try {
                $('.web_version').html("V:" + version_data.web_version);
            } catch (error) {
            }
        });
        
        async function sendEmail(url, subject, message, recipients) {
            var checkFlag = false;
            await $.ajax({
                type: 'POST',
                data: {
                    subject: subject,
                    message: btoa(message),
                    recipients: recipients
                },
                url: url,
                headers: {
                    'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
                },
                success: function (data) {
                    checkFlag = true;
                },
                error: function (xhr, status, error) {
                    checkFlag = true;
                }
            });
            return checkFlag;
        }

        database.collection('settings').doc('DriverNearBy').get().then(async function (snapshots) {
            var data = snapshots.data();
            if (data && data.selectedMapType && data.selectedMapType == "osm") {
                mapType = "OFFLINE"
            }
        });
        
        async function getServiceSections() {
            // Only the six fields the switcher renders are cached, so the entry
            // stays small and holds nothing - Timestamps especially - that would
            // not survive a JSON round trip.
            const sections = await FsSettingsCache.value('sections', async function () {
                let ref = database.collection('sections').where('isActive', '==', true).orderBy('order');
                const sectionsSnapshot = await ref.get();
                return sectionsSnapshot.docs.map(function (doc) {
                    const data = doc.data();
                    return {
                        docId: doc.id,
                        id: data.id,
                        name: data.name,
                        description: data.description,
                        sectionImage: data.sectionImage,
                        serviceTypeFlag: data.serviceTypeFlag
                    };
                });
            });
            const sectionsContainer = document.getElementById('sections_header');
            sectionsContainer.innerHTML = await buildServiceSectionsHTML(await cityOpenSections(sections));
        }

        /**
         * A city admin sees only the services open in their city: no cities
         * ticked on the section (zoneIds empty or missing) or their city ticked.
         * Read fresh, not from the switcher cache, which keeps only six fields.
         * Every other admin gets the list unchanged.
         */
        async function cityOpenSections(sections) {
            const city = window.ADMIN_CITY && window.ADMIN_CITY.id;
            if (!city) return sections;
            try {
                const snap = await database.collection('sections').where('isActive', '==', true).get();
                const zonesOf = {};
                snap.docs.forEach(function (doc) { zonesOf[doc.id] = (doc.data() || {}).zoneIds; });
                return sections.filter(function (s) {
                    const ids = zonesOf[s.docId];
                    return !Array.isArray(ids) || ids.length === 0 || ids.indexOf(city) !== -1;
                });
            } catch (e) {
                console.warn('cityOpenSections', e);
                return sections;
            }
        }

        /**
         * Give the section logos their real src the first time the service
         * switcher is opened. Until then they are held in data-src, so a page
         * view costs nothing for a menu the admin never touched.
         */
        function openServiceSectionImages() {
            document.querySelectorAll('#sections_header img[data-src]').forEach(function (img) {
                img.src = img.getAttribute('data-src');
                img.removeAttribute('data-src');
            });
        }

        $(document).on('show.bs.dropdown', '#activeSection', openServiceSectionImages);
        // Belt and braces: the click fires even if Bootstrap's dropdown events
        // are ever unbound by another script on the page.
        $(document).on('click', '#activeSectionLink', openServiceSectionImages);
        
        async function buildServiceSectionsHTML(sections) {
            let html = '';
            var addSectionRoute = "{{ route('section.create') }}";
            var idSecActive = getCookie('section_id') || '';
            var typeSecActive = getCookie('service_type') || '';
            sections.forEach(data => {
                var sectionName = data.name || 'Unnamed Section';
                var sectionDescription = data.description || '';
                var sectionImage = data.sectionImage || placeholderImage;
                var sectionId = data.docId;
                var sectionRoute = `{{ route('dashboard') }}/${sectionId}/${data.serviceTypeFlag}`;
                var isSelected = (sectionId === idSecActive && (data.serviceTypeFlag || '') === typeSecActive);
                var selectedClass = isSelected ? 'selected-section' : '';
                if (isSelected) {
                    $('#activeSectionLogo').attr('src', sectionImage || placeholderImage);
                    $('#activeSectionName').text(sectionName);
                }
                // data-src, not src: this list lives inside a dropdown that stays
                // closed until the admin clicks the service switcher, and the logos
                // are stored at full upload resolution - the sixteen on this project
                // come to about 3.4 MB. Firebase Storage serves them with
                // `cache-control: private, max-age=0`, so every page in the panel
                // was fetching all of them again to fill a menu nobody had opened.
                // openServiceSectionImages() below swaps them in the first time the
                // menu is actually shown; loading="lazy" is not enough on its own
                // because a display:none image has no box to intersect, and the
                // browser loads it immediately instead.
                html += `
                <div class="col-md-4">
                    <div class="service-list-box ${selectedClass}" data-section-url="${sectionRoute}" data-section-id="${data.id}" data-section-type="${data.serviceTypeFlag}">
                        <img data-src="${sectionImage}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${placeholderImage}'">
                        <h3>${sectionName}</h3>
                        <p>${sectionDescription}</p>
                    </div>
                </div>
                `;
            });
            if (!(window.ADMIN_CITY && window.ADMIN_CITY.id)) html += `
                <div class="col-md-12">
                    <div class="service-list-box" data-section-url="${addSectionRoute}" data-section-id="" data-section-type="">
                        <img src="{{ asset('images/add_more.png') }}">
                        <h3>{{trans('lang.add_more')}}</h3>
                        <p>{{trans('lang.expand_by_adding_new_modules_as_your_business_grows')}}</p>
                    </div>
                </div>
                `;
            html = `<div class="dropdown-service-list"><div class="row">${html}</div></div>`;
            return html;
        }

        /**
         * Bring up whichever map library the admin's own setting asks for - but
         * only on a page that has a map, and only after the setting has been read.
         *
         * Three things were wrong here, and all three cost every page in the
         * panel:
         *
         *  - It ran everywhere. A page with no map still fetched the Google Maps
         *    JS API, which is the single largest third-party script the panel
         *    touches, plus a `settings/googleMapKey` round trip in front of it.
         *
         *  - It read `mapType` before the read that fills it in had finished.
         *    `mapType` starts as 'ONLINE', and `settings/DriverNearBy` is
         *    fetched without being awaited, so the Google branch was taken every
         *    time regardless of the admin having chosen OSM. On this project the
         *    Google key has billing disabled and answers REQUEST_DENIED, so that
         *    download could never have produced a working map.
         *
         *  - The OSM branch assigned `script.src` seven times over, so only the
         *    last assignment - leaflet-routing-machine - was ever loaded. Leaflet
         *    itself came from the static tags at the top of this layout. The
         *    plug-ins are now loaded there too, under @section('needsMap').
         */
        async function loadGoogleMapsScript() {
            if (!document.getElementById('map') && !document.querySelector('[data-needs-map]')) {
                return;   // nothing on this page draws a map
            }

            var offline = mapType == "OFFLINE";
            try {
                var driverNearBy = await FsSettingsCache.doc('DriverNearBy');
                if (driverNearBy && driverNearBy.selectedMapType == "osm") {
                    offline = true;
                    mapType = "OFFLINE";
                }
            } catch (e) { /* keep whatever mapType already says */ }

            /*
             * Settle on a centre BEFORE the map is built.
             *
             * InitializeGodsEyeMap() reads the default_latitude /
             * default_longitude cookies synchronously, while geolocation is
             * asynchronous - so on a first visit the map used to be built with
             * `undefined` for both, and on later visits with whatever the last
             * page happened to leave behind. Waiting for the answer, with a
             * bound on how long, makes the map open in the same place every time.
             */
            async function ready() {
                /*
                 * InitializeGodsEyeMap is defined in the view's own
                 * @section('scripts'), which the layout renders AFTER this
                 * block. The Google branch used to reach here from a
                 * script.onload, by which time the document had finished
                 * parsing; the OpenStreetMap branch has no script to wait for,
                 * so it waits for the document instead.
                 */
                if (document.readyState === 'loading') {
                    await new Promise(function (resolve) {
                        document.addEventListener('DOMContentLoaded', resolve, { once: true });
                    });
                }
                try { await resolveDefaultCentre(); } catch (e) { /* cookies already hold a usable fallback */ }
                if (typeof window['InitializeGodsEyeMap'] === 'function') {
                    InitializeGodsEyeMap();
                }
            }

            if (offline) {
                // Leaflet and its plug-ins are already in the page via
                // @section('needsMap'); there is nothing more to fetch.
                ready();
                return;
            }

            var googleMapKeySnapshotsHeader = await database.collection('settings').doc("googleMapKey").get();
            var placeholderImageHeaderData = googleMapKeySnapshotsHeader.data();
            googleMapKey = placeholderImageHeaderData ? placeholderImageHeaderData.key : '';
            const script = document.createElement('script');
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + googleMapKey + "&libraries=places,drawing";
            script.onload = ready;
            document.head.appendChild(script);
        }

        const GeolocationSuccessCallback = (position) => {
            if (position.coords != undefined) {
                default_latitude = position.coords.latitude
                default_longitude = position.coords.longitude
                setCookie('default_latitude', default_latitude, 365);
                setCookie('default_longitude', default_longitude, 365);
            }
        };
        const GeolocationErrorCallback = (error) => {
            console.log('Error: You denied for your default Geolocation', error.message);
        };

        /**
         * Where a map should open when it has nothing better to go on.
         *
         * In order: the browser's own position (what the admin sees out of the
         * window), then the middle of the service area the admin has actually
         * drawn in Zones, and only then a constant.
         *
         * The constant used to be 23.022505, 72.571365 - Ahmedabad - which is
         * where the eMart demo data lives. On a panel run from anywhere else
         * that is a map of somebody else's city, and it is half of what "remove
         * the Indian demo locations" is about: the other half is the demo driver
         * documents, which live-tracking.js filters out. Falling back to the
         * admin's own published zone means the map opens over their business.
         */
        async function resolveDefaultCentre() {
            var haveCookie = getCookie('default_latitude') && getCookie('default_longitude');

            var fromBrowser = await new Promise(function (resolve) {
                if (!navigator.geolocation) return resolve(null);
                var settled = false;
                var timer = setTimeout(function () {
                    if (!settled) { settled = true; resolve(null); }
                }, 4000);
                navigator.geolocation.getCurrentPosition(function (position) {
                    if (settled) return;
                    settled = true; clearTimeout(timer);
                    GeolocationSuccessCallback(position);
                    resolve(position.coords ? [position.coords.latitude, position.coords.longitude] : null);
                }, function (error) {
                    if (settled) return;
                    settled = true; clearTimeout(timer);
                    GeolocationErrorCallback(error);
                    resolve(null);
                }, { timeout: 4000, maximumAge: 600000 });
            });
            if (fromBrowser) return fromBrowser;
            if (haveCookie) return [getCookie('default_latitude'), getCookie('default_longitude')];

            var fromZone = null;
            try {
                if (window.LiveTrack && window.LiveTrack.serviceAreaCentre) {
                    fromZone = await window.LiveTrack.serviceAreaCentre(database);
                }
            } catch (e) { /* no zones drawn yet */ }
            var centre = fromZone || [23.022505, 72.571365];
            setCookie('default_latitude', centre[0], 365);
            setCookie('default_longitude', centre[1], 365);
            return centre;
        }

        loadGoogleMapsScript();
        
        database.collection('settings').doc("notification_setting").get().then(async function (snapshots) {
            var data = snapshots.data();
            serviceJson = data.serviceJson;
            if (serviceJson != '' && serviceJson != null) {
                $.ajax({
                    type: 'POST',
                    data: {
                        serviceJson: btoa(serviceJson),
                    },
                    url: "{{ route('store-firebase-service') }}",
                    headers: {
                        'X-CSRF-TOKEN': $('meta[name="csrf-token"]').attr('content')
                    },
                    success: function (data) {
                        checkFlag = true;
                    }
                });
            }
        });

        //On delete item delete image also from bucket general code
        const deleteDocumentWithImage = async (collection, id, singleImageField, arrayImageField, profileImageField, carProofPictureURL, driverProofPictureURL) => {
            // Reference to the Firestore document
            const docRef = database.collection(collection).doc(id);
            try {
                const doc = await docRef.get();
                if (!doc.exists) {
                    console.log("No document found for deletion");
                    return;
                }
                const data = doc.data();
                // Handle single image deletion
                // Deleting single image field
                if (singleImageField) {
                    if (Array.isArray(singleImageField)) {
                        for (const field of singleImageField) {
                            const imageUrl = data[field];
                            if (imageUrl) await deleteImageFromBucket(imageUrl);
                        }
                    } else {
                        const imageUrl = data[singleImageField];
                        if (imageUrl) await deleteImageFromBucket(imageUrl);
                    }
                }
                // Deleting array image field
                if (arrayImageField) {
                    if (Array.isArray(arrayImageField)) {
                        for (const field of arrayImageField) {
                            const arrayImages = data[field];
                            if (arrayImages && Array.isArray(arrayImages)) {
                                for (const imageUrl of arrayImages) {
                                    if (imageUrl) await deleteImageFromBucket(imageUrl);
                                }
                            }
                        }
                    } else {
                        const arrayImages = data[arrayImageField];
                        if (arrayImages && Array.isArray(arrayImages)) {
                            for (const imageUrl of arrayImages) {
                                if (imageUrl) await deleteImageFromBucket(imageUrl);
                            }
                        }
                    }
                }
                // Handle variant images deletion
                const item_attribute = data.item_attribute || {};  // Access item_attribute
                const variants = item_attribute.variants || [];    // Access variants array inside item_attribute
                if (variants.length > 0) {
                    for (let i = 0; i < variants.length; i++) {
                        const variantImageUrl = variants[i].variant_image;
                        if (variantImageUrl) {
                            await deleteImageFromBucket(variantImageUrl);
                        }
                    }
                }
                // Handle profile_file_name image deletion
                const profile_file_name = data[profileImageField] || '';  // profile image field
                if (profile_file_name) {
                    await deleteImageFromBucket(profile_file_name);
                }
                // Handle carproof_file_name image deletion
                const carproof_file_name = data[carProofPictureURL] || '';  // carproof image field
                if (carproof_file_name) {
                    await deleteImageFromBucket(carproof_file_name);
                }
                // Handle driverproof_file_name image deletion
                const driverproof_file_name = data[driverProofPictureURL] || '';  // driverproof image field
                if (driverproof_file_name) {
                    await deleteImageFromBucket(driverproof_file_name);
                }
                // Optionally delete the Firestore document after image deletion
                await docRef.delete();
                console.log("Document and images deleted successfully.");
            } catch (error) {
                console.error("Error deleting document and images:", error);
            }
        };

        const deleteImageFromBucket = async (imageUrl) => {
            try {
                const storageRef = firebase.storage().ref();
                // Check if the imageUrl is a full URL or just a child path
                let oldImageUrlRef;
                if (imageUrl.includes('https://')) {
                    // Full URL
                    oldImageUrlRef = storageRef.storage.refFromURL(imageUrl);
                } else {
                    // Child path, use ref instead of refFromURL
                    oldImageUrlRef = storageRef.storage.ref(imageUrl);
                }
                var envBucket = "<?php echo env('FIREBASE_STORAGE_BUCKET'); ?>";
                var imageBucket = oldImageUrlRef.bucket;
                // Check if the bucket name matches
                if (imageBucket === envBucket) {
                    // Delete the image
                    await oldImageUrlRef.delete();
                    console.log("Image deleted successfully.");
                }
            } catch (error) {
            }
        };

        /**
         * Fetch the library this export format needs, the first time it is
         * needed. See the note beside the Buttons availability stub above: these
         * used to be 1.2 MB of blocking script on every page of the panel.
         *
         * If the fetch fails the admin is told, rather than meeting an
         * "XLSX is not defined" in a console they never open.
         */
        async function ensureExportLibs(format) {
            if (!window.PanelSpeed || !window.PanelSpeed.lib) return true;
            const needed = format === 'excel' ? ['xlsx']
                         : format === 'pdf' ? ['jspdf', 'jspdfautotable']
                         : [];
            try {
                for (const name of needed) await window.PanelSpeed.lib(name);
                return true;
            } catch (e) {
                console.error('export: could not load the library for ' + format, e);
                if (window.toastr) toastr.error("{{ trans('lang.something_went_wrong') }}");
                return false;
            }
        }

        async function exportData(dt, format, config) {
            if (!(await ensureExportLibs(format))) return;
            const {
                columns,
                fileName = 'Export',
            } = config;
            // Tables paginated by firestore-datatable.js only ship the visible
            // page in `filteredData`, so the exporter re-runs one draw in
            // whole-collection mode to get every row.
            const tableKey = dt.table().node().id;
            let filteredRecords;
            if (window.FsDataTable && window.FsDataTable.isPaged(tableKey)) {
                filteredRecords = await window.FsDataTable.fetchAll(dt, tableKey);
            } else {
                filteredRecords = dt.ajax.json().filteredData;
            }
            if (!filteredRecords || !filteredRecords.length) {
                filteredRecords = [];
            }
            const fieldTypes = {};
            const dataMapper = (record) => {
                return columns.map((col) => {
                    const value = record[col.key];
                    if (!fieldTypes[col.key]) {
                        if (value === true || value === false) {
                            fieldTypes[col.key] = 'boolean';
                        } else if (value && typeof value === 'object' && value.seconds) {
                            fieldTypes[col.key] = 'date';
                        } else if (typeof value === 'number') {
                            fieldTypes[col.key] = 'number';
                        } else if (typeof value === 'string') {
                            fieldTypes[col.key] = 'string';
                        } else {
                            fieldTypes[col.key] = 'string';
                        }
                    }
                    switch (fieldTypes[col.key]) {
                        case 'boolean':
                            return value ? 'Yes' : 'No';
                       /*  case 'date':
                            return value ? new Date(value.seconds * 1000).toLocaleString() : '-'; */
                        case 'date':
                            return value?.toDate ? value.toDate().toLocaleString() :
                                (value.seconds ? new Date(value.seconds * 1000).toLocaleString() : '-');
                        case 'number':
                            return typeof value === 'number' ? value : 0;
                        case 'string':
                        default:
                            return value || '-';
                    }
                });
            };
            const tableData = filteredRecords.map(dataMapper);
            const data = [columns.map(col => col.header), ...tableData];
            const columnWidths = columns.map((_, colIndex) =>
                Math.max(...data.map(row => row[colIndex]?.toString().length || 0))
            );
            if (format === 'csv') {
                const csv = data.map(row => row.map(cell => {
                    if (typeof cell === 'string' && (cell.includes(',') || cell.includes('\n') || cell.includes('"'))) {
                        return `"${cell.replace(/"/g, '""')}"`;
                    }
                    return cell;
                }).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                // `saveAs` is FileSaver's, and FileSaver is not loaded by this
                // panel - public/js/objectexporter.min.js contains a copy but no
                // page includes it, so CSV export threw "saveAs is not defined"
                // on every table. The Excel and PDF branches below never needed
                // it. A Blob and an anchor do the same job with no library.
                if (typeof saveAs === 'function') {
                    saveAs(blob, `${fileName}.csv`);
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${fileName}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                }
            } else if (format === 'excel') {
                const ws = XLSX.utils.aoa_to_sheet(data, { cellDates: true });
                ws['!cols'] = columnWidths.map(width => ({ wch: Math.min(width + 5, 30) }));
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Data');
                XLSX.writeFile(wb, `${fileName}.xlsx`);
            } else if (format === 'pdf') {
                const { jsPDF } = window.jspdf;
                const doc = new jsPDF('l', 'mm', 'a4');
                doc.setFontSize(12);
                doc.text(fileName, 14, 16);
                doc.autoTable({
                    head: [columns.map(col => col.header)],
                    body: tableData,
                    startY: 20,
                    theme: 'striped',
                    styles: {
                        cellPadding: 1,
                        fontSize: 8,
                        overflow: 'linebreak',
                    },
                    columnStyles: {
                        0: { cellWidth: 'auto' },
                    },
                    margin: { top: 30, bottom: 30 },
                    pageBreak: 'auto',
                });
                doc.save(`${fileName}.pdf`);
            } else {
                console.error('Unsupported format');
            }
        }

        function showError(msg) {
            $(".error_top").show();
            $(".error_top").html("");
            $(".error_top").append(`<p>${msg}</p>`);
            window.scrollTo(0, 0);
            return false;
        }

        function encodeGeohash(latitude, longitude, precision = 10) {

            const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
            let idx = 0;
            let bit = 0;
            let even = true;
            let geohash = "";

            let latMin = -90, latMax = 90;
            let lonMin = -180, lonMax = 180;

            while (geohash.length < precision) {
                if (even) {
                    let mid = (lonMin + lonMax) / 2;
                    if (longitude > mid) {
                        idx = idx * 2 + 1;
                        lonMin = mid;
                    } else {
                        idx = idx * 2;
                        lonMax = mid;
                    }
                } else {
                    let mid = (latMin + latMax) / 2;
                    if (latitude > mid) {
                        idx = idx * 2 + 1;
                        latMin = mid;
                    } else {
                        idx = idx * 2;
                        latMax = mid;
                    }
                }
                even = !even;

                if (++bit == 5) {
                    geohash += BASE32.charAt(idx);
                    bit = 0;
                    idx = 0;
                }
            }

            return geohash;
        }

        function showProcessing() {
            Swal.fire({
                title: window.translations.showProcessingTitle,
                text: window.translations.showProcessingText,
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });
        }

        function showSuccessMessage(message) {
            Swal.fire({
                icon: 'success',
                title: window.translations.successMessageTitle,
                text: message,
                showConfirmButton: false,
                timer: 2000,
            });
        }

        function showErrorMessage(message) {
            Swal.fire({
                icon: 'error',
                title: window.translations.errorMessageTitle,
                text: message,
                showConfirmButton: true
            });
        }

        window.translations = {
            showProcessingTitle:"{{trans('lang.please_wait')}}",
            showProcessingText:"{{trans('lang.processing_your_request')}}",
            errorMessageTitle:"{{trans('lang.error')}}",
            warningMessageTitle:"{{trans('lang.warning')}}",
            successMessageTitle:"{{trans('lang.success')}}",
        };

        async function getUserZoneId(address_lng,address_lat){
            var zone_id = null;
            var zone_list = [];
            var snapshots = await database.collection('zone').where("publish","==",true).get();
            if(snapshots.docs.length > 0){
                snapshots.docs.forEach((snapshot) => {
                    var zone_data = snapshot.data();
                    zone_list.push(zone_data);
                });   
            }
            if(zone_list.length > 0){
                for (i = 0; i < zone_list.length; i++) {
                    var zone = zone_list[i];
                    var vertices_x = [];
                    var vertices_y = [];
                    for (j = 0; j < zone.area.length; j++) {
                        var geopoint = zone.area[j];
                        vertices_x.push(geopoint.longitude);
                        vertices_y.push(geopoint.latitude);
                    }
                    var points_polygon = (vertices_x.length)-1; 
                    if(is_in_polygon(points_polygon, vertices_x, vertices_y, address_lng, address_lat)){
                        zone_id = zone.id;
                        break; 
                    }
                }
            }
            return zone_id;
        }

        function is_in_polygon($points_polygon, $vertices_x, $vertices_y, $longitude_x, $latitude_y){
            $i = $j = $c = $point = 0;
            for ($i = 0, $j = $points_polygon ; $i < $points_polygon; $j = $i++) {
                $point = $i;
                if( $point === $points_polygon )
                    $point = 0;
                if ( (($vertices_y[$point]  >  $latitude_y !== ($vertices_y[$j] > $latitude_y)) && ($longitude_x < ($vertices_x[$j] - $vertices_x[$point]) * ($latitude_y - $vertices_y[$point]) / ($vertices_y[$j] - $vertices_y[$point]) + $vertices_x[$point]) ) )
                    $c = !$c;
            }
            return $c;
        }

        const distanceRadius = (lat1, lon1, lat2, lon2) => {
            if ((lat1 === lat2) && (lon1 === lon2)) {
                return 0;
            }
            else {
                var radlat1 = Math.PI * lat1/180;
                var radlat2 = Math.PI * lat2/180;
                var theta = lon1-lon2;
                var radtheta = Math.PI * theta/180;
                var dist = Math.sin(radlat1) * Math.sin(radlat2) + Math.cos(radlat1) * Math.cos(radlat2) * Math.cos(radtheta);
                if (dist > 1) {
                    dist = 1;
                }
                dist = Math.acos(dist);
                dist = dist * 180/Math.PI;
                dist = dist * 60 * 1.1515;
                dist = dist * 1.60934; // Convert to kilometers
                
                return dist;
            }
        }

        function formatCurrency(amount, currency = {}) {
            const symbol = currency.symbol || '';
            const decimals = currency.decimal_degits ?? 2;
            const symbolAtRight = Boolean(currency.symbolAtRight);
            const formatted = parseFloat(amount).toFixed(decimals);
            return symbolAtRight
                ? formatted + ' ' + symbol
                : symbol + formatted;
        }
        
        async function getCountryFromLatLng(lat, lng) {
            const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
            const response = await fetch(url, {
                headers: {
                    'Accept': 'application/json'
                }
            });
            const data = await response.json();
            return data?.address?.country || '';
        }

        async function sendNotification(fcmToken = '', title, body, payload = null) {            
            var checkFlag = false;
            var sendNotificationUrl = "{{ route('send-notification') }}";
            if (fcmToken !== '') {
                await $.ajax({
                    type: 'POST',
                    url: sendNotificationUrl,
                    data: {
                        _token: $('meta[name="csrf-token"]').attr('content'),
                        'fcm': fcmToken,
                        'title': title,
                        'message': body,
                        'payload': JSON.stringify(payload)
                    },
                    success: function (data) {
                        checkFlag = true;
                    },
                    error: function (error) {
                        checkFlag = true;
                    }
                });
            } else {
                checkFlag = true;
            }

            return checkFlag;
        }
        
    </script>

    @yield('scripts')

    @include('layouts.bulk_selection_bar_script')

</body>
</html>