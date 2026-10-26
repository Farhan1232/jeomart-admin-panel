@extends('layouts.app')
@section('content')
<div class="page-wrapper">
    <div class="row page-titles">
        <div class="col-md-5 align-self-center">
            <div class="d-flex top-title-section justify-content-between">
                <div class="d-flex top-title-left align-self-center">
                    <span class="icon mr-3"><img src="{{ asset('images/driver.png') }}"></span>
                    <h3 class="mb-0 page-title">{{trans('lang.fleet_drivers')}} - <span class="driver_name"></span></h3>
                </div>
            </div>
        </div>
        <div class="col-md-7 align-self-center">
            <ol class="breadcrumb">
                <li class="breadcrumb-item"><a href="{{ route('dashboard') }}">{{trans('lang.dashboard')}}</a></li>
                <li class="breadcrumb-item"><a href="{!! route('fleet.drivers') !!}">{{trans('lang.fleet_drivers')}}</a></li>
                <li class="breadcrumb-item active">{{trans('lang.driver_details')}}</li>
            </ol>
        </div>
    </div>
    <div class="container-fluid">
        <div class="admin-top-section"> 
            <div class="row">
                <div class="col-12">
                    <div class="d-flex top-title-section justify-content-between">
                        <div class="d-flex top-title-left align-self-center">
                        </div>
                        <div class="d-flex top-title-right align-self-center">
                            
                        </div>
                    </div>
                </div>
            </div> 
        </div>
        <div class="resttab-sec mb-4">  
            <div class="menu-tab">
                <ul>
                    <li class="active">
                        <a href="{{route('drivers.view',$id)}}" class="basic"><i class="ri-list-indefinite"></i> {{trans('lang.tab_basic')}}</a>
                    </li>
                    <li class="vehicle_tab" style="display:none">
                        <a href="{{route('drivers.vehicle',$id)}}" class="vehicle"><i class="ri-car-line"></i> {{trans('lang.vehicle')}}</a>
                    </li>
                    <li class="service_type_orders">
                    </li>
                    
                </ul>
            </div>  
            <div class="row">
                <div class="col-md-3">
                    <div class="card card-box-with-icon bg--1">
                        <div class="card-body d-flex justify-content-between align-items-center">
                        <div class="card-box-with-content">
                            <h4 class="text-dark-2 mb-1 h4 total_orders" id="total_orders">00</h4>
                            <p class="mb-0 small text-dark-2">{{trans('lang.dashboard_total_rides')}}</p>
                        </div>
                            <span class="box-icon ab"><img src="{{ asset('images/total_rides.png') }}"></span>
                        </div>
                    </div>
                </div>
                
            </div>   
        </div>
        <div class="restaurant_info-section">
          <div class="row">
            <div class="col-md-6">
                <div class="card border h-100">
                    <div class="card-header d-flex justify-content-between align-items-center border-bottom pb-3">
                        <div class="card-header-title">
                            <h3 class="text-dark-2 mb-0 h4">{{trans('lang.driver_details')}}
                                <i class="mdi mdi-verified verified-icon verified-icon-heading ml-2" 
       data-toggle="tooltip" data-bs-original-title="Verified" 
       style="display:none;color: green;"></i>
                            </h3>
                        </div>
                    </div>
            <div class="card-body">
                        <div class="restaurant_info_left">
                            <div class="d-flex mb-1">
                                <div class="sis-img profile_image" id="profile_image">
                                </div>
                                <div class="sis-content pl-4">
                                    <ul class="p-0 info-list mb-0">                                    
                                        <li class="d-flex align-items-center mb-2">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.first_name')}}</label>
                                            <span class="driver_name" id="driver_name"></span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.email')}}</label>
                                            <span class="email"></span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.user_phone')}}</label>
                                            <span class="phone"></span>
                                        </li>
                                      
                                        <li class="d-flex align-items-center mb-2 mr-1">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.service_type')}}</label>
                                            <span class="service_type"> </span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2 mr-1">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.zone_name')}}</label>
                                            <span class="zone_name"> </span>
                                        </li>
                                    </ul>
                                </div>  
                            </div>                            
                        </div>
                </div>
            </div>
            </div>
           <div class="col-md-6">
                <div class="card border h-100">
                    <div class="card-header d-flex justify-content-between align-items-center border-bottom pb-3">
                        <div class="card-header-title">
                            <h3 class="text-dark-2 mb-0 h4">{{trans('lang.bankdetails')}}</h3>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="noBankData" class="text-muted font-weight-bold py-3" style="display:none;">
                            {{trans("lang.bank_details_not_found")}}
                        </div>
                        <div class="restaurant_info_left" id="bankDetailsBox" style="display:none;">
                            <div class="d-flex mb-1">                              
                                <div class="sis-content">
                                    <ul class="p-0 info-list mb-0">
                                        <li class="d-flex align-items-center mb-2">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.bank_name')}}</label>
                                            <span class="bank_name" id="bank_name"></span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.branch_name')}}</label>
                                            <span class="branch_name" id="branch_name"></span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.holer_name')}}</label>
                                            <span class="holer_name" id="holer_name"></span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2 mr-1">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.account_number')}}</label>
                                            <span class="account_number" id="account_number"> </span>
                                        </li>
                                        <li class="d-flex align-items-center mb-2 mr-1">
                                            <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.other_information')}}</label>
                                            <span class="other_information" id="other_information"> </span>
                                        </li>
                                    </ul>
                                </div>  
                            </div>                            
                        </div>
                    </div>
                </div>
            </div>
          </div>  
        </div>
        <!-- Bank detail -->
        <div class="restaurant_info-section">
        </div>
        <!-- My Trips premium access: admin-granted, time limited, per driver. -->
        <div class="restaurant_info-section" id="myTripsAccessSection">
          <div class="row">
            <div class="col-md-12">
                <div class="card border">
                    <div class="card-header d-flex justify-content-between align-items-center border-bottom pb-3">
                        <div class="card-header-title">
                            <h3 class="text-dark-2 mb-0 h4">{{trans('lang.my_trips_access')}}</h3>
                            <p class="mb-0 text-dark-2">{{trans('lang.my_trips_access_help')}}</p>
                        </div>
                        <div class="card-header-right">
                            <a href="javascript:void(0)" data-toggle="modal" data-target="#myTripsAccessModal" class="btn-primary btn rounded-full" id="grant-access-open"><i class="mdi mdi-key-variant mr-2"></i><span id="grant-access-label">{{trans('lang.grant_access')}}</span></a>
                            <a href="javascript:void(0)" class="btn btn-danger rounded-full ml-2" id="revoke-access-btn" style="display:none"><i class="mdi mdi-close-circle mr-2"></i>{{trans('lang.revoke_access')}}</a>
                        </div>
                    </div>
                    <div class="card-body">
                        <div id="my_trips_access_error" style="color:red"></div>
                        <ul class="p-0 info-list mb-0">
                            <li class="d-flex align-items-center mb-2">
                                <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.status')}}</label>
                                <span class="my_trips_status"></span>
                            </li>
                            <li class="d-flex align-items-center mb-2">
                                <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.granted_on')}}</label>
                                <span class="my_trips_granted_at">-</span>
                            </li>
                            <li class="d-flex align-items-center mb-2">
                                <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.expires_on')}}</label>
                                <span class="my_trips_expires_at">-</span>
                            </li>
                            <li class="d-flex align-items-center mb-2">
                                <label class="mb-0 font-wi font-semibold text-dark-2">{{trans('lang.access_duration')}}</label>
                                <span class="my_trips_duration">-</span>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
          </div>
        </div>
        <div class="form-group col-12 text-center btm-btn">
            <a href="{!! route('drivers') !!}" class="btn btn-default"><i class="fa fa-undo"></i>{{trans('lang.cancel')}}</a>
        </div>
    </div>    
</div>
<div class="modal fade" id="addWalletModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered location_modal">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title locationModalTitle">{{trans('lang.add_wallet_amount')}}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <form class="">
                    <div class="form-row">
                        <div class="form-group row">
                            <div class="form-group row width-100">
                                <label class="col-12 control-label">{{trans('lang.amount')}}</label>
                                <div class="col-12">
                                    <input type="number" name="amount" class="form-control" id="amount">
                                    <div id="wallet_error" style="color:red"></div>
                                </div>
                            </div>
                            <div class="form-group row width-100">
                                <label class="col-12 control-label">{{trans('lang.note')}}</label>
                                <div class="col-12">
                                    <input type="text" name="note" class="form-control" id="note">
                                </div>
                            </div>
                            <div class="form-group row width-100">
                                <div id="user_account_not_found_error" class="align-items-center" style="color:red">
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary save-form-btn" id="add-wallet-btn">{{trans('submit')}}</a>
                    </button>
                    <button type="button" class="btn btn-primary" data-dismiss="modal"
                            aria-label="Close">{{trans('close')}}</a>
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
<div class="modal fade" id="myTripsAccessModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered location_modal">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{trans('lang.my_trips_access')}}</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                <form class="">
                    <div class="form-row">
                        <div class="form-group row">
                            <div class="form-group row width-100">
                                <label class="col-12 control-label">{{trans('lang.access_duration_days')}}</label>
                                <div class="col-12">
                                    <input type="number" name="access_days" class="form-control" id="access_days" min="1" max="30" step="1" value="1">
                                    <p class="help-block">{{trans('lang.access_duration_help')}}</p>
                                    <div id="access_days_error" style="color:red"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </form>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary save-form-btn" id="grant-access-btn">{{trans('submit')}}</button>
                    <button type="button" class="btn btn-primary" data-dismiss="modal" aria-label="Close">{{trans('close')}}</button>
                </div>
            </div>
        </div>
    </div>
</div>
<div class="modal fade"id="imagePreviewModal" tabindex="-1" role="dialog" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered location_modal modal-sm">
        <div class="modal-content">
            <div class="modal-header">
<h4 class="modal-title text-dark font-medium" id="modalImageTitle"></h4>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
               <img id="previewImage" src="" alt="Image Preview" style="max-width: 100%; height: auto;">
            </div>
        </div>
    </div>
</div>
@endsection
@section('scripts')
    <script type="text/javascript">
        var id = "{{$id}}";  
        var serviceType = getCookie('service_type');    
        
        var database = firebase.firestore();
        var ref = database.collection('users').where("id", "==", id);
        var photo = "";
        var vendorOwnerId = "";
        var vendorOwnerOnline = false;
        
        var placeholderImage = '';
        var placeholder = database.collection('settings').doc('placeHolderImage');
        placeholder.get().then(async function (snapshotsimage) {
            var placeholderImageData = snapshotsimage.data();
            placeholderImage = placeholderImageData.image;
        });

        var currency = database.collection('settings');
        var currentCurrency = '';
        var currencyAtRight = false;
        var decimal_degits = 0;
        var refCurrency = database.collection('currencies').where('isActive', '==', true);
        refCurrency.get().then(async function (snapshots) {
            var currencyData = snapshots.docs[0].data();
            currentCurrency = currencyData.symbol;
            currencyAtRight = currencyData.symbolAtRight;
            if (currencyData.decimal_degits) {
                decimal_degits = currencyData.decimal_degits;
            }
            $(".currentCurrency").text(currencyData.symbol);
        });

        var email_templates = database.collection('email_templates').where('type', '==', 'wallet_topup');
        var emailTemplatesData = null;

        const serviceLabels = {
            "cab-service": "Cab Service",
            "parcel_delivery": "Parcel Delivery Service",
            "rental-service": "Rental Service",
            "delivery-service": "Multivendor Delivery Service",
            "ecommerce-service": "Ecommerce Service",
            "ondemand-service": "On Demand Service"
        };
        
        $(document).ready(async function () {
            
            jQuery("#data-table_processing").show();
            
            if(serviceType !== 'delivery-service' && serviceType !== 'parcel_delivery'){
                $('.vehicle_tab').show();
            }else{
                $('.vehicle_tab').hide();
            }
            await email_templates.get().then(async function (snapshots) {
                emailTemplatesData = snapshots.docs[0].data();
            });
            
            ref.get().then(async function (snapshots) {

                if(snapshots.docs.length>0){

                    var dirver = snapshots.docs[0].data();
                    if (dirver.isDocumentVerify === true) {
                        $('.verified-icon-heading').show();
                    } else {
                        $('.verified-icon-heading').hide();
                    }
                
                    $(".driver_name").text(dirver.firstName);
                    $(".email").text(shortEmail(dirver.email));
                    if(dirver.phoneNumber.includes('+')){
                        $(".phone").text('+' + EditPhoneNumber(dirver.phoneNumber.slice(1)));
                    }else{
                        $(".phone").text(EditPhoneNumber(dirver.phoneNumber));
                    }
                    var wallet_route = "{{route('users.walletstransaction','id')}}";
                    $(".wallet_transaction").attr("href", wallet_route.replace('id', 'driverID='+dirver.id));


                    let serviceTypes = dirver.serviceTypes || (dirver.serviceType ? [dirver.serviceType] : []);
                    let serviceTypeText = serviceTypes.map(type => serviceLabels[type] || type).join(", ");
                    $(".service_type").text(serviceTypeText);

                    if (serviceTypes) {

                        if (serviceTypes.includes("cab-service") && serviceType == "cab-service") {

                            var url = "{{route('drivers.rides','driverId')}}";
                            url = url.replace('driverId', dirver.id);
                            $('.service_type_orders').html('<a href="' + url + '"><i class="ri-shopping-bag-line"></i> {{trans('lang.order_plural')}}</a>');
                            await database.collection('rides').where('driverId', '==', dirver.id).get().then(async function (orderSnapshots) {
                                $('.total_orders').html(orderSnapshots.docs.length);
                            });

                        }else if (serviceTypes.includes("rental-service") && serviceType == "rental-service") {
                            
                            var url = "{{route('rental_orders.driver','id')}}";
                            url = url.replace("id", dirver.id);
                            $('.service_type_orders').html('<a href="' + url + '"><i class="ri-shopping-bag-line"></i> {{trans('lang.order_plural')}}</a>');

                            await database.collection('rental_orders').where('driverId', '==', dirver.id).get().then(async function (orderSnapshots) {
                                $('.total_orders').html(orderSnapshots.docs.length);
                            });

                        } else if (serviceTypes.includes("parcel_delivery") && serviceType == "parcel_delivery") {
                            
                            var url = "{{route('parcel_orders.driver','id')}}";
                            url = url.replace("id", dirver.id);
                            $('.service_type_orders').html('<a href="' + url + '"><i class="ri-shopping-bag-line"></i> {{trans('lang.order_plural')}}</a>');
                            await database.collection('parcel_orders').where('driverId', '==', dirver.id).get().then(async function (orderSnapshots) {
                                $('.total_orders').html(orderSnapshots.docs.length);
                            });
                        }
                    }

                    if (dirver.zoneId){
                        database.collection('zone').doc(dirver.zoneId).get().then((zoneSnap) => {
                            if (zoneSnap.exists) {
                                const zoneName = zoneSnap.data().name || '';
                                $(".zone_name").text(zoneName);
                            } else {
                                $(".zone_name").text('-');
                            }
                        });

                    }else {
                        $(".zone_name").text('-');
                    }
                
                    var image = "";
                    if (dirver.profilePictureURL) {
                        if(dirver.profilePictureURL){
                            photo=dirver.profilePictureURL;
                        }else{
                            photo=placeholderImage;
                        }
                        image = '<img width="200px" id="" height="auto" src="' + photo + '" class="clickable-image profile-image" onerror="this.onerror=null;this.src=\'' + placeholderImage + '\'">';
                    } else {
                        image = '<img width="200px" id="" height="auto" src="' + placeholderImage + '" class="clickable-image profile-image">';
                    }
                    $(".profile_image").html(image);
              
                    $('.clickable-image').on('click', function () { 
                        var imageSrc = $(this).attr('src');
                        var $parentBox = $(this).closest('.driver-detail-box');
                        var headingText;
                        if ($(this).hasClass('profile-image')) {
                            headingText = 'Profile Image'; 
                        } else if ($(this).hasClass('vehicle-profile-image')) {
                            headingText = $parentBox.find('h4').text() || 'Vehicle Profile Image';
                        } else if ($(this).hasClass('driver-proof-image')) {
                            headingText = $parentBox.find('h4').text() || 'Driver Proof Image';
                        } else if ($(this).hasClass('vehicle-proof-image')) {
                            headingText = $parentBox.find('h4').text() || 'Vehicle Proof Image';
                        } else {
                            headingText = 'Image Preview';
                        }
                        $('#previewImage').attr('src', imageSrc);
                        $('#modalImageTitle').text(headingText);
                        $('#imagePreviewModal').modal('show');
                    });

                    $('.close, [data-dismiss="modal"]').on('click', function () {
                        $('#imagePreviewModal').modal('hide');
                    });

                    if (dirver.hasOwnProperty('userBankDetails') && dirver.userBankDetails != null) {
                        $(".bank_name").text(dirver.userBankDetails.bankName || '');
                        if (dirver.userBankDetails.hasOwnProperty('branchName')) {
                            $(".branch_name").text(dirver.userBankDetails.branchName);
                        }
                        if (dirver.userBankDetails.hasOwnProperty('holderName')) {
                            $(".holer_name").text(dirver.userBankDetails.holderName);
                        }
                        if (dirver.userBankDetails.hasOwnProperty('accountNumber')) {
                            $(".account_number").text(dirver.userBankDetails.accountNumber);
                        }
                        if (dirver.userBankDetails.hasOwnProperty('otherDetails')) {
                            $(".other_information").text(dirver.userBankDetails.otherDetails);
                        }
                        if (
                            !dirver.userBankDetails.bankName &&
                            !dirver.userBankDetails.branchName &&
                            !dirver.userBankDetails.holder_naholderNameme &&
                            !dirver.userBankDetails.accountNumber &&
                            !dirver.userBankDetails.otherDetails
                        ) {
                            $("#bankDetailsBox").hide();
                            $("#noBankData").show();
                        } else {
                            $("#bankDetailsBox").show();
                            $("#noBankData").hide();
                        }
                    } else {
                        $("#bankDetailsBox").hide();
                        $("#noBankData").show();
                    }
                } else{
                    $('.driver_detail_div').html('<h5 class="font-weight-bold align text-danger text-center">{{trans('lang.driver_unknown_deleted')}}</h5>')
                }

                jQuery("#data-table_processing").hide();
            })
        });

        $("#add-wallet-btn").click(function () {
            var date = firebase.firestore.FieldValue.serverTimestamp();
            var amount = $('#amount').val();
            if (amount == '' || amount <= 0) {
                $('#wallet_error').text('{{trans("lang.add_wallet_amount_error")}}');
                return false;
            }
            var note = $('#note').val();
            database.collection('users').where('id', '==', id).get().then(async function (snapshot) {
                if (snapshot.docs.length > 0) {
                    var data = snapshot.docs[0].data();
                    var walletAmount = 0;
                    if (data.hasOwnProperty('wallet_amount') && !isNaN(data.wallet_amount) && data.wallet_amount != null) {
                        walletAmount = data.wallet_amount;
                    }
                    var user_id = data.id;
                    var newWalletAmount = parseFloat(walletAmount) + parseFloat(amount);
                    database.collection('users').doc(id).update({
                        'wallet_amount': newWalletAmount
                    }).then(function (result) {
                        var tempId = database.collection("tmp").doc().id;
                        database.collection('wallet').doc(tempId).set({
                            'amount': parseFloat(amount),
                            'date': date,
                            'isTopUp': true,
                            'id': tempId,
                            'order_id': '',
                            'payment_method': 'Wallet',
                            'payment_status': 'success',
                            'user_id': user_id,
                            'note': note,
                            'transactionUser': "driver",
                        }).then(async function (result) {
                            if (currencyAtRight) {
                                amount = parseInt(amount).toFixed(decimal_degits) + "" + currentCurrency;
                                newWalletAmount = newWalletAmount.toFixed(decimal_degits) + "" + currentCurrency;
                            } else {
                                amount = currentCurrency + "" + parseInt(amount).toFixed(decimal_degits);
                                newWalletAmount = currentCurrency + "" + newWalletAmount.toFixed(decimal_degits);
                            }
                            var formattedDate = new Date();
                            var month = formattedDate.getMonth() + 1;
                            var day = formattedDate.getDate();
                            var year = formattedDate.getFullYear();
                            month = month < 10 ? '0' + month : month;
                            day = day < 10 ? '0' + day : day;
                            formattedDate = day + '-' + month + '-' + year;
                            var message = emailTemplatesData.message;
                            message = message.replace(/{username}/g, data.firstName + ' ' + data.lastName);
                            message = message.replace(/{date}/g, formattedDate);
                            message = message.replace(/{amount}/g, amount);
                            message = message.replace(/{paymentmethod}/g, 'Wallet');
                            message = message.replace(/{transactionid}/g, tempId);
                            message = message.replace(/{newwalletbalance}/g, newWalletAmount);
                            emailTemplatesData.message = message;
                            var url = "{{url('send-email')}}";
                            if(data.email != '' && data.email != null){
                            var sendEmailStatus = await sendEmail(url, emailTemplatesData.subject, emailTemplatesData.message, [data.email]);
                            if (sendEmailStatus) {
                                window.location.reload();
                            }
                        }else{
                            window.location.reload();
                        }
                        })
                    })
                } else {
                    $('#user_account_not_found_error').text('{{trans("lang.user_detail_not_found")}}');
                }
            });
        });
        // ────────────────────────────────────────────────────────────────
        // My Trips premium access
        //
        // Granted per driver for a whole number of days, 1 to 30. Stored as a
        // nested map on the driver's own users/{id} document, so no new
        // collection is introduced and the driver app - which already holds
        // that document open - sees a grant or a revocation without a restart.
        //
        // `grantedAt` is a SERVER timestamp, and `expiresAt` is derived from
        // the value the server resolved rather than from this browser's clock.
        // That is what keeps the window off both the admin's machine and the
        // driver's phone.
        // ────────────────────────────────────────────────────────────────
        var MY_TRIPS_MIN_DAYS = 1;
        var MY_TRIPS_MAX_DAYS = 30;

        function myTripsAccessRef() {
            return database.collection('users').doc(id);
        }

        function toDateLabel(value) {
            if (!value || typeof value.toDate !== 'function') return '-';
            try {
                var d = value.toDate();
                return d.toDateString() + ' ' + d.toLocaleTimeString('en-US');
            } catch (err) {
                return '-';
            }
        }

        function renderMyTripsAccess(access) {
            access = access || {};
            var now = new Date();
            var expires = (access.expiresAt && typeof access.expiresAt.toDate === 'function') ? access.expiresAt.toDate() : null;
            var revoked = !!access.revokedAt;
            var active = access.granted === true && !revoked && expires !== null && expires > now;

            var label;
            if (active) {
                label = '<span class="badge badge-success">{{trans('lang.access_active')}}</span>';
            } else if (revoked) {
                label = '<span class="badge badge-danger">{{trans('lang.access_revoked')}}</span>';
            } else if (access.granted === true && expires !== null) {
                label = '<span class="badge badge-secondary">{{trans('lang.access_expired')}}</span>';
            } else {
                label = '<span class="badge badge-secondary">{{trans('lang.access_none')}}</span>';
            }

            $('.my_trips_status').html(label);
            $('.my_trips_granted_at').text(toDateLabel(access.grantedAt));
            $('.my_trips_expires_at').text(toDateLabel(access.expiresAt));
            $('.my_trips_duration').text(access.durationDays ? access.durationDays + ' {{trans('lang.days')}}' : '-');

            $('#revoke-access-btn').toggle(active);
            $('#grant-access-label').text(active ? "{{trans('lang.extend_access')}}" : "{{trans('lang.grant_access')}}");
            if (access.durationDays) {
                $('#access_days').val(access.durationDays);
            }
        }

        function loadMyTripsAccess() {
            myTripsAccessRef().get().then(function (snapshot) {
                var data = snapshot.exists ? (snapshot.data() || {}) : {};
                renderMyTripsAccess(data.myTripsAccess);
            }).catch(function (error) {
                $('#my_trips_access_error').text(error.message || error);
            });
        }

        $(document).ready(function () {
            loadMyTripsAccess();
        });

        $('#grant-access-btn').click(function () {
            var raw = $('#access_days').val();
            var days = Number(raw);
            $('#access_days_error').text('');
            $('#my_trips_access_error').text('');

            // 0 days and anything past 30 are refused here, in the transaction
            // the driver app runs, and in the maintenance sweep. A fractional
            // value has no meaning in the expiry arithmetic and is refused too.
            if (raw === '' || isNaN(days) || days !== Math.round(days) || days < MY_TRIPS_MIN_DAYS || days > MY_TRIPS_MAX_DAYS) {
                $('#access_days_error').text("{{trans('lang.access_duration_error')}}");
                return false;
            }

            var button = $(this);
            button.prop('disabled', true);
            var adminId = (firebase.auth().currentUser && firebase.auth().currentUser.uid) ? firebase.auth().currentUser.uid : '';

            // Step 1: write the grant with a server timestamp. `expiresAt` is
            // deliberately not written yet - a grant without an end instant is
            // treated as invalid everywhere, so an interrupted write fails
            // closed rather than open.
            myTripsAccessRef().set({
                'myTripsAccess': {
                    'granted': true,
                    'durationDays': days,
                    'grantedAt': firebase.firestore.FieldValue.serverTimestamp(),
                    'grantedBy': adminId,
                    'revokedAt': null,
                    'expiresAt': null
                }
            }, { merge: true }).then(function () {
                // Step 2: read the resolved server time back and derive the end
                // instant from it.
                return myTripsAccessRef().get();
            }).then(function (snapshot) {
                var data = snapshot.data() || {};
                var access = data.myTripsAccess || {};
                if (!access.grantedAt || typeof access.grantedAt.toDate !== 'function') {
                    throw new Error("{{trans('lang.access_grant_failed')}}");
                }
                var start = access.grantedAt.toDate();
                var end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
                return myTripsAccessRef().update({
                    'myTripsAccess.expiresAt': firebase.firestore.Timestamp.fromDate(end)
                });
            }).then(function () {
                button.prop('disabled', false);
                $('#myTripsAccessModal').modal('hide');
                loadMyTripsAccess();
            }).catch(function (error) {
                button.prop('disabled', false);
                $('#my_trips_access_error').text(error.message || error);
            });
        });

        $('#revoke-access-btn').click(function () {
            var button = $(this);
            button.prop('disabled', true);
            $('#my_trips_access_error').text('');
            // Revoking sets both flags: `granted` false is what the driver app
            // reads, `revokedAt` records that a person did it rather than the
            // window running out.
            myTripsAccessRef().update({
                'myTripsAccess.granted': false,
                'myTripsAccess.revokedAt': firebase.firestore.FieldValue.serverTimestamp()
            }).then(function () {
                button.prop('disabled', false);
                loadMyTripsAccess();
            }).catch(function (error) {
                button.prop('disabled', false);
                $('#my_trips_access_error').text(error.message || error);
            });
        });

    </script>
@endsection