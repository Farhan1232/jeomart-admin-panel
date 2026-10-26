@extends('layouts.app')
@section('content')
<div class="page-wrapper">
        <div class="row page-titles">
            <div class="col-md-5 align-self-center">
                <h3 class="text-themecolor restaurantTitle">{{trans('lang.driver_document_details')}}</h3>
            </div>
            <div class="col-md-7 align-self-center">
                <ol class="breadcrumb">
                    <li class="breadcrumb-item"><a href="{{ route('dashboard') }}">{{trans('lang.dashboard')}}</a></li>
                    <li class="breadcrumb-item"><a href="{!! route('drivers') !!}">{{trans('lang.driver_plural')}}</a></li>
                    <li class="breadcrumb-item active">{{trans('lang.driver_document_details')}}</li>
                </ol>
            </div>
        </div>
        <div class="container-fluid">
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">
                            <ul class="nav nav-tabs align-items-end card-header-tabs w-100">
                                <li class="nav-item">
                                    <a class="nav-link active vendor-name"
                                       href="{!! url()->current() !!}">{{trans('lang.driver_document_details')}}</a>
                                </li>
                            </ul>
                        </div>
                        <div class="card-body">
                            <div class="table-responsive m-t-10 doc-body"></div>
                            <div class="modal fade" id="exampleModal" tabindex="-1" role="dialog"
                                 aria-labelledby="exampleModalLabel" aria-hidden="true">
                                <div class="modal-dialog" role="document" style="max-width: 50%;">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <button type="button" class="close"
                                                    data-dismiss="modal"
                                                    aria-label="Close">
                                                <span aria-hidden="true">&times;</span>
                                            </button>
                                        </div>
                                        <div class="modal-body">
                                            <div class="form-group">
                                                <embed id="docImage"
                                                       src=""
                                                       frameBorder="0"
                                                       scrolling="auto"
                                                       height="100%"
                                                       width="100%"
                                                       style="height: 540px;"
                                                ></embed>
                                            </div>
                                            <div class="modal-footer">
                                                <button type="button" class="btn btn-secondary"
                                                        data-dismiss="modal">{{trans('lang.close')}}</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
@endsection
@section('scripts')z
<script>
    var id = "<?php echo $id;?>";
    var database = firebase.firestore();
    var allDriver = database.collection('users').where('role','==','driver');
    var ref = database.collection('users').where("id", "==", id);
    var docsRef = database.collection('documents').where('enable', '==', true).where('type','==','driver');
    var docref = database.collection('documents_verify').doc(id);
    var back_photo = '';
    var front_photo = '';
    var backFileName = '';
    var frontFileName = '';
    var backFileOld = '';
    var frontFileOld = '';
    var fcmToken = "";
    $(document).ready(async function () {
        jQuery("#data-table_processing").show();
        $('#exampleModal').on('show.bs.modal', function (event) {
            var button = $(event.relatedTarget);
            var img = button.data('image');
            var modal = $(this);
            modal.find('#docImage').attr('src', img);
        });
        ref.get().then(async function (snapshots) {
            var vendor = snapshots.docs[0].data();
            if (vendor.hasOwnProperty('fcmToken') && vendor.fcmToken != "" && vendor.fcmToken != null) {
                fcmToken = vendor.fcmToken;
            }
            $(".vendor-name").text(vendor.firstName+' '+vendor.lastName+ "'s" + " {{trans('lang.driver_document_details')}}")
        });
        var html = '';
        var count = 0;
        await docsRef.get().then(async function (docSnapshot) {
            html += '<table id="documentTable" class="display nowrap table table-hover table-striped table-bordered table table-striped" cellspacing="0" width="100%">';
            html += "<thead>";
            html += '<tr>';
            html += '<th>{{trans('lang.name')}}</th>';
            html += '<th>{{trans('lang.status')}}</th>';
            html += '<th>{{trans('lang.action')}}</th>';
            html += '</tr>';
            html += '</thead>';
            html += '<tbody>';
            html += '</tbody>';
            html += '</table>';
            if (docSnapshot.docs.length) {
                var documents = docSnapshot.docs;
                documents.forEach((ele) => {
                    var doc = ele.data();
                    var docRefs = database.collection('documents_verify').doc(id);
                    docRefs.get().then(async function (docrefSnapshot) {
                        var docRef = docrefSnapshot.data() && docrefSnapshot.data().documents ? docrefSnapshot.data().documents.filter(docId => docId.documentId == doc.id)[0] : [];
                        var trhtml = '';
                        trhtml += '<tr>';
                        if (docRef && docRef.hasOwnProperty('backImage') && docRef.hasOwnProperty('frontImage') ) {
                            if (docRef.backImage != '' && docRef.frontImage != '' && docRef.backImage!=null && docRef.frontImage != null  && doc.backSide && doc.frontSide  ) {
                                                            trhtml += '<td>' + doc.title + '&nbsp;&nbsp;<a href="#" class="badge badge-info" data-toggle="modal" data-target="#exampleModal" data-image="' + docRef.frontImage + '" data-id="front" class="open-image">{{trans('lang.view_front_image')}}</a>&nbsp;<a href="#" class="badge badge-info" data-toggle="modal" data-target="#exampleModal"  data-image="' + docRef.backImage + '" data-id="back" class="open-image">{{trans('lang.view_back_image')}}</a></td>';
                            } else if (docRef.backImage != '' && docRef.backImage != null  && doc.backSide) {
                                trhtml += '<td>' + doc.title + '&nbsp;<a href="#" data-toggle="modal" class="badge badge-info" data-target="#exampleModal" data-id="back" data-image="' + docRef.backImage + '" class="open-image">{{trans('lang.view_back_image')}}</a></td>';
                            } else if (docRef.frontImage != '' && docRef.frontImage != null && doc.frontSide ) {
                                trhtml += '<td>' + doc.title + '&nbsp;<a href="#" data-toggle="modal" class="badge badge-info" data-target="#exampleModal" data-id="front" class="open-image" data-image="' + docRef.frontImage + '">{{trans('lang.view_front_image')}}</a></td>';
                            } else {
                                trhtml += '<td>' + doc.title + '</td>';
                            }
                        } else {
                            trhtml += '<td>' + doc.title + '</td>';
                        }
                        var status = docRef  && docRef.status == "approved" ? 'approved' : ((docRef  && docRef.status == "rejected") ? "rejected" : ((docRef && docRef.status == "uploaded") ? 'uploaded' : 'pending'));
                        var display_status = '';
                        if (status == "approved") {
                            display_status = '<span class="badge badge-success py-2 px-3">' + status + '</span>';
                        } else if (status == "rejected") {
                            display_status = '<span class="badge badge-danger py-2 px-3">' + status + '</span>';
                        } else if (status == "uploaded") {
                            display_status = '<span class="badge badge-primary py-2 px-3">' + status + '</span>';
                        } else if (status == "pending") {
                            display_status = '<span class="badge badge-warning py-2 px-3">' + status + '</span>';
                        }
                        trhtml += '<td>' + display_status + '</td>';
                        trhtml += '<td class="action-btn">';
                        
                        var driverDocumentUploadUrl = "{{ route('drivers.document.upload', ['driverId' => ':driverId', 'id' => ':id']) }}";
                            driverDocumentUploadUrl = driverDocumentUploadUrl.replace(':driverId', id.trim()).replace(':id', doc.id.trim());

                        trhtml += '<a href="' + driverDocumentUploadUrl + '" data-id="' + doc.id + '"><i class="mdi mdi-lead-pencil" title="Edit"></i></a>&nbsp;';
                        if (status !== 'pending') {
                            if (status == "rejected") {
                                trhtml += '&nbsp;<a href="javascript:void(0);" class="btn btn-sm btn-success direct-click-btn verify-doc" id="approve-doc" data-title="' + doc.title + '"  data-id="' + doc.id + '">{{trans('lang.approve')}}</a>';
                            } else if (status == "approved") {
                                trhtml += '&nbsp;<a href="javascript:void(0);" class="btn btn-sm btn-danger direct-click-btn verify-doc" id="disapprove-doc" data-title="' + doc.title + '"  data-id="' + doc.id + '">{{trans('lang.reject')}}</a>';
                            } else {
                                trhtml += '&nbsp;<a href="javascript:void(0);" class="btn btn-sm btn-success direct-click-btn verify-doc" id="approve-doc" data-title="' + doc.title + '"  data-id="' + doc.id + '">{{trans('lang.approve')}}</a>&nbsp;<a href="javascript:void(0);" class="btn btn-sm btn-danger verify-doc" id="disapprove-doc" data-title="' + doc.title + '"  data-id="' + doc.id + '">{{trans('lang.reject')}}</a>';
                            }
                        }
                        trhtml += '</td>';
                        trhtml += '</tr>';
                        $("tbody").append(trhtml);
                        count = count + 1;
                        if (count == docSnapshot.docs.length) {
                            $('#documentTable').DataTable({
                                order: [[0, 'asc']],
                                columnDefs: [
                                    {orderable: false, targets: [1, 2]}
                                ],
                            });
                        }
                    })
                });
            }
            $(".doc-body").append(html);
            jQuery("#data-table_processing").hide();
        });
    });
    $(document.body).on('click', '.redirecttopage', function () {
        var url = $(this).attr('data-url');
        window.location.href = url;
    });
    // Approve / Reject. This used to take 20+ seconds: it read the driver's
    // documents three times, the driver's profile once, all one after another,
    // then waited for the push notification (a fresh Google token every time)
    // before reloading. Now: one read, the save and the required-document list
    // together, the same verified/unverified rule worked out from what is
    // already in hand, and the notification handed to the browser to deliver
    // while the page reloads.
    $(document).on('click', '.verify-doc', function () {
        jQuery("#data-table_processing").show();
        var status = $(this).attr('id') == "approve-doc" ? "approved" : "rejected";
        var docId = $(this).attr('data-id');
        var docTitle = $(this).attr('data-title');
        var clickedRow = $(this).closest('tr');
        var docRefsTmp = database.collection('documents_verify').doc(id);
        docRefsTmp.get().then(async function (doc) {
            var objects = doc.data().documents;
            var keydataId = objects ? objects.findIndex((d) => d.documentId == docId) : 0;
            var objectToupdate = objects[keydataId];
            objectToupdate.status = status;
            objects[keydataId] = objectToupdate;
            var results = await Promise.all([
                docRefsTmp.update({documents: objects}),
                getDocId()
            ]);
            var enableDocIds = results[1];
            await driverDocVerification(enableDocIds, objects);
            if (fcmToken && fcmToken != '') {
                if (status == "rejected") {
                    sendDocNotification('{{trans('lang.rejected_your_document')}}', '{{trans('lang.admin_rejected_document')}}' + docTitle + ' . {{trans('lang.please_submit_again')}}');
                } else {
                    sendDocNotification('{{trans('lang.approved_your_document')}}', '{{trans('lang.admin_approved_document')}}' + docTitle);
                }
            }
            jQuery("#data-table_processing").hide();
            showDocStatus(clickedRow, status, docId, docTitle);
        }).catch(function (error) {
            jQuery("#data-table_processing").hide();
            $(".error_top").show();
            $(".error_top").html("");
            $(".error_top").append("<p>" + error + "</p>");
        });
    });
    // The same push the page always sent, through sendBeacon so it is still
    // delivered after the reload instead of holding the reload up. Browsers
    // without sendBeacon get the old wait-then-reload behaviour.
    function sendDocNotification(title, message) {
        var url = "{{ route('advertisement.sendnotification') }}";
        if (navigator.sendBeacon) {
            var form = new FormData();
            form.append('_token', "{{ csrf_token() }}");
            form.append('fcm', fcmToken);
            form.append('title', title);
            form.append('message', message);
            if (navigator.sendBeacon(url, form)) return;
        }
        $.ajax({
            url: url,
            type: "POST",
            async: false,
            data: {_token: "{{ csrf_token() }}", fcm: fcmToken, title: title, message: message}
        });
    }
    // The original rule, unchanged: verified once at least as many documents
    // are approved as are required, unverified while any required one is not.
    async function driverDocVerification(enableDocIds, documents) {
        if (documents && documents.length > 0) {
            var approvedIds = documents.filter((d) => d.status == 'approved').map((d) => d.documentId);
            if (approvedIds.length >= enableDocIds.length) {
                await database.collection('users').doc(id).update({'isDocumentVerify': true, isActive: true});
            } else if (enableDocIds.some((d) => !approvedIds.includes(d))) {
                await database.collection('users').doc(id).update({'isDocumentVerify': false, isActive: false});
            }
        } else {
            await database.collection('users').doc(id).update({'isDocumentVerify': false, isActive: false});
        }
    }
    async function getDocId(){
        var enableDocIds = [];
        await database.collection('documents').where('enable', "==", true).where('type', '==', 'driver').get().then(async function (snapshots) {
            await snapshots.forEach((doc) => {
                enableDocIds.push(doc.data().id);
            });
        });
        return enableDocIds;
    }
    async function vendorDocVerification(enableDocIds, snapshotsVendor){
        var isCompleted = false;
        await Promise.all(snapshotsVendor.docs.map(async (vendor) => {
            await database.collection('documents_verify').doc(vendor.id).get().then( async function(docrefSnapshot){
                if(docrefSnapshot.data() && docrefSnapshot.data().documents.length > 0){
                    var vendorDocId = await docrefSnapshot.data().documents.filter((doc) => doc.status == 'approved').map((docData) => docData.documentId);
                    if(vendorDocId.length >= enableDocIds.length){
                        await database.collection('users').doc(vendor.id).update({'isDocumentVerify': true, isActive: true });
                    }else{
                        await enableDocIds.forEach(async(docId) => {
                            if(!vendorDocId.includes(docId)){
                                await database.collection('users').doc(vendor.id).update({'isDocumentVerify': false, isActive: false });
                            }
                        });
                    }
                }else{
                    await database.collection('users').doc(vendor.id).update({'isDocumentVerify': false, isActive: false });
                }
            });
            isCompleted = true;
        }));
        return isCompleted;
    }
    // After Approve / Reject the page used to reload completely. Now only the
    // clicked row changes: its status badge, and the same buttons the page
    // draws for that status (Approved -> Reject, Rejected -> Approve).
    function showDocStatus(row, status, docId, docTitle) {
        if (!row || !row.length) return;
        var cells = row.children('td');
        var badge = status == 'approved'
            ? '<span class="badge badge-success py-2 px-3">' + status + '</span>'
            : '<span class="badge badge-danger py-2 px-3">' + status + '</span>';
        var button = status == 'approved'
            ? '&nbsp;<a href="javascript:void(0);" class="btn btn-sm btn-danger direct-click-btn verify-doc" id="disapprove-doc" data-title="' + docTitle + '"  data-id="' + docId + '">{{trans('lang.reject')}}</a>'
            : '&nbsp;<a href="javascript:void(0);" class="btn btn-sm btn-success direct-click-btn verify-doc" id="approve-doc" data-title="' + docTitle + '"  data-id="' + docId + '">{{trans('lang.approve')}}</a>';
        var editLink = cells.eq(2).children('a').not('.verify-doc').first();
        cells.eq(1).html(badge);
        cells.eq(2).html((editLink.length ? editLink.prop('outerHTML') + '&nbsp;' : '') + button);
        try {
            if ($.fn.DataTable.isDataTable('#documentTable')) $('#documentTable').DataTable().row(row).invalidate();
        } catch (e) { /* the table still shows the new status */ }
    }
</script>
@endsection
