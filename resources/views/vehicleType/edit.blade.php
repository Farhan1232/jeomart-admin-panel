@extends('layouts.app')



@section('content')

<div class="page-wrapper">

	<div class="row page-titles">

		<div class="col-md-5 align-self-center">

			<h3 class="text-themecolor">{{trans('lang.edit_vehicle_type')}}</h3>

		</div>



		<div class="col-md-7 align-self-center">

			<ol class="breadcrumb">

				<li class="breadcrumb-item"><a href="{{ route('dashboard') }}">{{trans('lang.dashboard')}}</a></li>

				<li class="breadcrumb-item"><a href="{!! route('vehicleType') !!}">{{trans('lang.vehicle_type')}}</a>

				</li>

				<li class="breadcrumb-item active">{{trans('lang.edit_vehicle_type')}}</li>

			</ol>

		</div>



		<div class="card-body">


			<div class="error_top"></div>



			<div class="row vendor_payout_create">

				<div class="vendor_payout_create-inner">

					<fieldset>

						<legend>{{trans('lang.vehicle_type')}}</legend>

						<div class="form-group row width-50">

							<label class="col-3 control-label">{{trans('lang.name')}}</label>

							<div class="col-7">

								<input type="text" class="form-control name" id="name">

								<div class="form-text text-muted">{{trans('lang.user_name_help')}}</div>



							</div>

						</div>



						<div class="form-group row width-50">

							<label class="col-3 control-label">{{trans('lang.capacity')}}</label>

							<div class="col-7">

								<input type="text" class="form-control capacity" id="capacity">

								<div class="form-text text-muted">{{trans('lang.capacity_help')}}</div>



							</div>

						</div>

						

						<div class="form-group row width-50">

							<label class="col-3 control-label">{{trans('lang.short_description')}}</label>

							<div class="col-7">

								<input type="text" class="form-control short_description" id="short_description">

								<div class="form-text text-muted">{{trans('lang.short_description_help')}}</div>



							</div>

						</div>

						<div class="form-group row width-50">

							<label class="col-3 control-label">{{trans('lang.description')}}</label>

							<div class="col-7">

								<textarea class="form-control description" id="description" rows="2"></textarea>

								<div class="form-text text-muted">{{trans('lang.description_help')}}</div>



							</div>

						</div>

						<div class="form-group row width-50">

							<label class="col-3 control-label">{{trans('lang.supported_vehicle')}}</label>

							<div class="col-7">

								<textarea class="form-control supported_vehicle" id="supported_vehicle"

									rows="2"></textarea>

								<div class="form-text text-muted">{{trans('lang.supported_vehicle_help')}}</div>



							</div>

						</div>

						<div class="form-group row width-100">

							<label class="col-3 control-label">{{trans('lang.icon')}}</label>

							<input type="file" onChange="handleFileSelect(event)" class="col-7">

							<div class="placeholder_img_thumb user_image"></div>

							<div id="uploding_image"></div>

						</div>



						<div class="form-group row width-100">
							<label class="col-3 control-label">Cities</label>
							<div class="col-7">
								<div id="vehicle_cities"></div>
								<div class="form-text text-muted">Nothing ticked = available in all cities.</div>
							</div>
						</div>
						<div class="form-group row width-100">

							<div class="form-check">

								<input type="checkbox" class="vehicle_type_active" id="vehicle_type_active">

								<label class="col-3 control-label"

									for="vehicle_type_active">{{trans('lang.active')}}</label>



							</div>





						</div>

					</fieldset>



					<fieldset>

						<legend>{{trans('lang.deliveryCharge')}}</legend>



						<div class="form-group row width-100">

							<label class="col-4 control-label">{{ trans('lang.delivery_charges_per_km')}}</label>

							<div class="col-7">

								<input type="number" step="any" min="0" class="form-control" id="delivery_charges_per_km">

							</div>

						</div>



						<div class="form-group row width-100">

							<label class="col-4 control-label">{{ trans('lang.bidding_minimum_fare_per_km')}}</label>

							<div class="col-7">

								<input type="number" step="any" min="0" class="form-control" id="bidding_minimum_fare_per_km">

								<span class="help-block">{{ trans('lang.bidding_minimum_fare_per_km_help')}}</span>

							</div>

						</div>


						<div class="form-group row width-100">

							<label class="col-4 control-label">{{ trans('lang.minimum_delivery_charges')}}</label>

							<div class="col-7">

								<input type="number" step="any" min="0" class="form-control" id="minimum_delivery_charges">

							</div>

						</div>



						<div class="form-group row width-100">

							<label class="col-4 control-label">{{

								trans('lang.minimum_delivery_charges_within_km')}}</label>

							<div class="col-7">

								<input type="number" step="any" min="0" class="form-control" id="minimum_delivery_charges_within_km">

							</div>

						</div>

					</fieldset>

				</div>

			</div>

		</div>



		<div class="form-group col-12 text-center btm-btn">

			<button type="button" class="btn btn-primary  edit-setting-btn"><i class="fa fa-save"></i> {{

				trans('lang.save')}}</button>

			<a href="{!! url('vehicleType') !!}" class="btn btn-default"><i class="fa fa-undo"></i>{{

				trans('lang.cancel')}}</a>

		</div>



	</div>



</div>



@endsection



@section('scripts')
@include('layouts.admin_city_script')



<link href="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css" rel="stylesheet" />

<script src="https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js"></script>



<script type="text/javascript">



	var database = firebase.firestore();

	var photo = "";

	var fileName = "";

	// Reads one of the numeric boxes on this form.
	//
	// These used to be read with parseInt(), and parseInt('') is NaN. A box left
	// empty therefore wrote a real NaN into the vehicle document, which the apps
	// then multiplied by the trip distance and offered to the customer as the
	// price "NaN" - the state "Ookla Scooty" was saved in. NaN never leaves this
	// function, so the form refuses to save rather than saving a broken vehicle.
	// Number() rather than parseInt() so a fare of 12.5 per km stays 12.5
	// instead of being silently truncated to 12.

	function vehicleNumberField(selector) {

		var raw = $(selector).val();

		if (raw === null || raw === undefined) return NaN;

		raw = String(raw).trim();

		if (raw === '') return NaN;

		var value = Number(raw);

		return isFinite(value) ? value : NaN;

	}

	// Seats, as a whole number of passengers. It is what tells a customer a
	// motorcycle carries 2 and a Suzuki carries 10, so "50km" - which is what
	// was once typed into this box - is not an answer.

	function vehicleCapacityIsValid(capacity) {

		var raw = String(capacity === null || capacity === undefined ? '' : capacity).trim();

		return /^[0-9]+$/.test(raw) && parseInt(raw, 10) > 0;

	}

	var oldImageFile = "";

	var storageRef = firebase.storage().ref('images');

	var storage = firebase.storage();



	var placeholderImage = '';

	var id = "<?php echo $id; ?>";

	var ref = database.collection('vehicle_type').where('id', '==', id);

	
	var placeholder = database.collection('settings').doc('placeHolderImage');



	placeholder.get().then(async function (snapshotsimage) {

		var placeholderImageData = snapshotsimage.data();

		placeholderImage = placeholderImageData.image;

	})



	$(document).ready(function () {

		jQuery("#data-table_processing").show();



		ref.get().then(async function (snapshots) {



			var vehicleType = snapshots.docs[0].data();
			if (window.AdminCity) AdminCity.mountPicker(database, '#vehicle_cities', vehicleType.zoneIds);
			if (window.AdminCity) AdminCity.guardEdit('.edit-setting-btn', vehicleType.zoneIds);

			$(".name").val(vehicleType.name);

			$('.capacity').val(vehicleType.capacity);

			$('.short_description').val(vehicleType.short_description);

			$('.description').text(vehicleType.description);

			$('.supported_vehicle').text(vehicleType.supported_vehicle);

			photo = vehicleType.vehicle_icon;

			if (photo != '') {

				oldImageFile = vehicleType.vehicle_icon;

				$(".user_image").append('<img class="rounded" style="width:50px" src="' + photo + '" alt="image" onerror="this.onerror=null;this.src=\'' + placeholderImage + '\'">');

			} else {

				$(".user_image").append('<img class="rounded" style="width:50px" src="' + placeholderImage + '" alt="image">');

			}



			if (vehicleType.isActive == true) {

				$(".vehicle_type_active").prop('checked', true);

			}

			if (vehicleType.hasOwnProperty('sectionId')) {

				$('#section_id').val(vehicleType.sectionId).trigger('change');

			}



			if (vehicleType.biddingMinimumFarePerKm) {

				$("#bidding_minimum_fare_per_km").val(vehicleType.biddingMinimumFarePerKm);

			}

			if (vehicleType.delivery_charges_per_km) {

				$("#delivery_charges_per_km").val(vehicleType.delivery_charges_per_km);

			}

			if (vehicleType.minimum_delivery_charges) {

				$("#minimum_delivery_charges").val(vehicleType.minimum_delivery_charges);

			}

			if (vehicleType.minimum_delivery_charges_within_km) {

				$("#minimum_delivery_charges_within_km").val(vehicleType.minimum_delivery_charges_within_km);



			}

			jQuery("#data-table_processing").hide();



		});

	});



	$(".edit-setting-btn").click(function () {



		var section = getCookie('section_id');

		var name = $(".name").val();

		var capacity = $('.capacity').val();

		var short_description = $('.short_description').val();

		var description = $('.description').val();

		var supported_vehicle = $('.supported_vehicle').val();

		var delivery_charges_per_km = vehicleNumberField("#delivery_charges_per_km");

		var minimum_delivery_charges = vehicleNumberField("#minimum_delivery_charges");

		var minimum_delivery_charges_within_km = vehicleNumberField("#minimum_delivery_charges_within_km");

		// Blank means "this vehicle has no rate of its own"; the global bidding
		// rate then applies, which is how every vehicle behaved before this
		// field existed. It is stored as 0 rather than left unset so the field
		// can be cleared again after being set.
		var bidding_minimum_fare_per_km_raw = $("#bidding_minimum_fare_per_km").val();

		var bidding_minimum_fare_per_km = bidding_minimum_fare_per_km_raw === '' ? 0 : Number(bidding_minimum_fare_per_km_raw);

		var active = $(".vehicle_type_active").is(":checked");





		if (name == '') {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.name_error')}}</p>");

			window.scrollTo(0, 0);



		} else if (capacity == '') {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.capacity_error')}}</p>");

			window.scrollTo(0, 0);

		} else if (!vehicleCapacityIsValid(capacity)) {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.capacity_number_error')}}</p>");

			window.scrollTo(0, 0);

		}  else if (short_description == '') {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.short_description_error')}}</p>");

			window.scrollTo(0, 0);



		} else if (description == '') {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.description_error')}}</p>");

			window.scrollTo(0, 0);



		} else if (supported_vehicle == '') {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.supported_vehicle_error')}}</p>");

			window.scrollTo(0, 0);



		}else if (photo == "" || photo == null) {        
        	$(".error_top").show();
			$(".error_top").html("");
			$(".error_top").append("<p>{{trans('lang.icon_error')}}</p>");
			window.scrollTo(0, 0);
		} else if (!(delivery_charges_per_km >= 0)) {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.delivery_charges_error')}}</p>");

			window.scrollTo(0, 0);

		} else if (!(minimum_delivery_charges >= 0)) {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.minimum_delivery_error')}}</p>");

			window.scrollTo(0, 0);

		} else if (!(minimum_delivery_charges_within_km >= 0)) {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.minimum_delivery_charges_within_km_error')}}</p>");

			window.scrollTo(0, 0);

		} else if (!(bidding_minimum_fare_per_km >= 0)) {

			$(".error_top").show();

			$(".error_top").html("");

			$(".error_top").append("<p>{{trans('lang.bidding_minimum_fare_per_km_error')}}</p>");

			window.scrollTo(0, 0);

		} else {

			jQuery("#data-table_processing").show();

			storeImageData().then(IMG => {

				database.collection('vehicle_type').doc(id).update({

					'id': id, 'name': name, 'capacity': capacity, 'sectionId': section, 'short_description': short_description, 'description': description, 'supported_vehicle': supported_vehicle, 'vehicle_icon': photo, 'isActive': active,

					'delivery_charges_per_km': delivery_charges_per_km, 'minimum_delivery_charges': minimum_delivery_charges, 'minimum_delivery_charges_within_km': minimum_delivery_charges_within_km,

					'biddingMinimumFarePerKm': bidding_minimum_fare_per_km,
					...(window.AdminCity ? AdminCity.pickerFields('#vehicle_cities') : {}),

				}).then(function (result) {

					jQuery("#data-table_processing").hide();

					window.location.href = '{{ route("vehicleType") }}';

				});

			}).catch(err => {

				jQuery("#data-table_processing").hide();

				$(".error_top").show();

				$(".error_top").html("");

				$(".error_top").append("<p>" + err + "</p>");

				window.scrollTo(0, 0);

			});

		}



	});

	async function storeImageData() {

		var newPhoto = '';

		try {

			if (oldImageFile != "" && photo != oldImageFile) {

				var oldImageUrl = await storage.refFromURL(oldImageFile);

				imageBucket = oldImageUrl.bucket;

				var envBucket = "<?php echo env('FIREBASE_STORAGE_BUCKET'); ?>";

				if (imageBucket == envBucket) {

					await oldImageUrl.delete().then(() => {

						console.log("Old file deleted!")

					}).catch((error) => {

						console.log("ERR File delete ===", error);

					});

				} else {

					console.log('Bucket not matched');

				}

			}

			if (photo != oldImageFile) {

				photo = photo.replace(/^data:image\/[a-z]+;base64,/, "")

				var uploadTask = await storageRef.child(fileName).putString(photo, 'base64', { contentType: 'image/jpg' });

				var downloadURL = await uploadTask.ref.getDownloadURL();

				newPhoto = downloadURL;

				photo = downloadURL;



			} else {

				newPhoto = photo;

			}

		} catch (error) {

			console.log("ERR ===", error);

		}

		return newPhoto;

	}



	function handleFileSelect(evt) {

		var f = evt.target.files[0];

		var reader = new FileReader();



		reader.onload = (function (theFile) {

			return function (e) {



				var filePayload = e.target.result;

				var hash = CryptoJS.SHA256(Math.random() + CryptoJS.SHA256(filePayload));



				var val = f.name;

				var ext = val.split('.')[1];

				var docName = val.split('fakepath')[1];

				var filename = (f.name).replace(/C:\\fakepath\\/i, '')



				var timestamp = Number(new Date());

				var filename = filename.split('.')[0] + "_" + timestamp + '.' + ext;

				fileName = filename;

				photo = filePayload;

				$(".user_image").empty();

				if(filePayload){

                    photo=filePayload;

                }else{

                    photo=placeholderImage;

                }

				$(".user_image").append('<img class="rounded" style="width:50px" src="' + photo + '" onerror="this.onerror=null;this.src=\'' + placeholderImage + '\'" alt="image">');



			};

		})(f);

		reader.readAsDataURL(f);

	}

</script>

@endsection