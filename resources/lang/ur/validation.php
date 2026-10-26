<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Validation Language Lines
    |--------------------------------------------------------------------------
    |
    | The following language lines contain the default error messages used by
    | the validator class. Some of these rules have multiple versions such
    | as the size rules. Feel free to tweak each of these messages here.
    |
    */

    'accepted' => ':attribute کو قبول کرنا ضروری ہے۔',
    'accepted_if' => 'جب :other کی قیمت :value ہو تو :attribute کو قبول کرنا ضروری ہے۔',
    'active_url' => ':attribute ایک درست یو آر ایل نہیں ہے۔',
    'after' => ':attribute کی تاریخ :date کے بعد ہونی چاہیے۔',
    'after_or_equal' => ':attribute کی تاریخ :date کے بعد یا اس کے برابر ہونی چاہیے۔',
    'alpha' => ':attribute میں صرف حروف ہونے چاہئیں۔',
    'alpha_dash' => ':attribute میں صرف حروف، نمبر، ڈیش اور انڈرسکور ہونے چاہئیں۔',
    'alpha_num' => ':attribute میں صرف حروف اور نمبر ہونے چاہئیں۔',
    'array' => ':attribute ایک ارے (array) ہونا چاہیے۔',
    'before' => ':attribute کی تاریخ :date سے پہلے ہونی چاہیے۔',
    'before_or_equal' => ':attribute کی تاریخ :date سے پہلے یا اس کے برابر ہونی چاہیے۔',
    'between' => [
        'numeric' => ':attribute کی قیمت :min اور :max کے درمیان ہونی چاہیے۔',
        'file' => ':attribute کا سائز :min اور :max کلو بائٹس کے درمیان ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :min اور :max کے درمیان ہونی چاہیے۔',
        'array' => ':attribute میں اشیاء کی تعداد :min اور :max کے درمیان ہونی چاہیے۔',
    ],
    'boolean' => ':attribute فیلڈ کی قیمت سچ یا غلط ہونی چاہیے۔',
    'confirmed' => ':attribute کی تصدیق مطابقت نہیں رکھتی۔',
    'current_password' => 'پاس ورڈ غلط ہے۔',
    'date' => ':attribute ایک درست تاریخ نہیں ہے۔',
    'date_equals' => ':attribute کی تاریخ :date کے برابر ہونی چاہیے۔',
    'date_format' => ':attribute فارمیٹ :format سے مطابقت نہیں رکھتا۔',
    'declined' => ':attribute کو مسترد کرنا ضروری ہے۔',
    'declined_if' => 'جب :other کی قیمت :value ہو تو :attribute کو مسترد کرنا ضروری ہے۔',
    'different' => ':attribute اور :other مختلف ہونے چاہئیں۔',
    'digits' => ':attribute کے ہندسوں کی تعداد :digits ہونی چاہیے۔',
    'digits_between' => ':attribute کے ہندسوں کی تعداد :min اور :max کے درمیان ہونی چاہیے۔',
    'dimensions' => ':attribute کے امیج کی پیمائش درست نہیں ہے۔',
    'distinct' => ':attribute فیلڈ میں ڈپلیکیٹ ویلیو ہے۔',
    'email' => ':attribute ایک درست ای میل ایڈریس ہونا چاہیے۔',
    'ends_with' => ':attribute کا اختتام ان میں سے کسی ایک پر ہونا ضروری ہے: :values',
    'enum' => 'منتخب کردہ :attribute غلط ہے۔',
    'exists' => 'منتخب کردہ :attribute غلط ہے۔',
    'file' => ':attribute ایک فائل ہونی چاہیے۔',
    'filled' => ':attribute فیلڈ میں قیمت ہونا ضروری ہے۔',
    'gt' => [
        'numeric' => ':attribute کی قیمت :value سے زیادہ ہونی چاہیے۔',
        'file' => ':attribute کا سائز :value کلو بائٹس سے زیادہ ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :value سے زیادہ ہونی چاہیے۔',
        'array' => ':attribute میں اشیاء کی تعداد :value سے زیادہ ہونی چاہیے۔',
    ],
    'gte' => [
        'numeric' => ':attribute کی قیمت :value سے زیادہ یا اس کے برابر ہونی چاہیے۔',
        'file' => ':attribute کا سائز :value کلو بائٹس سے زیادہ یا اس کے برابر ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :value سے زیادہ یا اس کے برابر ہونی چاہیے۔',
        'array' => ':attribute میں :value یا اس سے زیادہ اشیاء ہونی چاہئیں۔',
    ],
    'image' => ':attribute ایک تصویر ہونی چاہیے۔',
    'in' => 'منتخب کردہ :attribute غلط ہے۔',
    'in_array' => ':attribute فیلڈ :other میں موجود نہیں ہے۔',
    'integer' => ':attribute ایک عدد (integer) ہونا چاہیے۔',
    'ip' => ':attribute ایک درست آئی پی ایڈریس ہونا چاہیے۔',
    'ipv4' => ':attribute ایک درست آئی پی ورژن 4 ایڈریس ہونا چاہیے۔',
    'ipv6' => ':attribute ایک درست آئی پی ورژن 6 ایڈریس ہونا چاہیے۔',
    'json' => ':attribute ایک درست جیسن (JSON) سٹرنگ ہونی چاہیے۔',
    'lt' => [
        'numeric' => ':attribute کی قیمت :value سے کم ہونی چاہیے۔',
        'file' => ':attribute کا سائز :value کلو بائٹس سے کم ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :value سے کم ہونی چاہیے۔',
        'array' => ':attribute میں اشیاء کی تعداد :value سے کم ہونی چاہیے۔',
    ],
    'lte' => [
        'numeric' => ':attribute کی قیمت :value سے کم یا اس کے برابر ہونی چاہیے۔',
        'file' => ':attribute کا سائز :value کلو بائٹس سے کم یا اس کے برابر ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :value سے کم یا اس کے برابر ہونی چاہیے۔',
        'array' => ':attribute میں اشیاء کی تعداد :value سے زیادہ نہیں ہونی چاہیے۔',
    ],
    'mac_address' => ':attribute ایک درست میک (MAC) ایڈریس ہونا چاہیے۔',
    'max' => [
        'numeric' => ':attribute کی قیمت :max سے زیادہ نہیں ہونی چاہیے۔',
        'file' => ':attribute کا سائز :max کلو بائٹس سے زیادہ نہیں ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :max سے زیادہ نہیں ہونی چاہیے۔',
        'array' => ':attribute میں اشیاء کی تعداد :max سے زیادہ نہیں ہونی چاہیے۔',
    ],
    'mimes' => ':attribute فائل کی قسم ان میں سے ایک ہونی چاہیے: :values',
    'mimetypes' => ':attribute فائل کی قسم ان میں سے ایک ہونی چاہیے: :values',
    'min' => [
        'numeric' => ':attribute کی قیمت کم از کم :min ہونی چاہیے۔',
        'file' => ':attribute کا سائز کم از کم :min کلو بائٹس ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد کم از کم :min ہونی چاہیے۔',
        'array' => ':attribute میں کم از کم :min اشیاء ہونی چاہئیں۔',
    ],
    'multiple_of' => ':attribute کو :value کا ضرب ہونا چاہیے۔',
    'not_in' => 'منتخب کردہ :attribute غلط ہے۔',
    'not_regex' => ':attribute کا فارمیٹ غلط ہے۔',
    'numeric' => ':attribute ایک نمبر ہونا چاہیے۔',
    'password' => 'پاس ورڈ غلط ہے۔',
    'present' => ':attribute فیلڈ کا ہونا ضروری ہے۔',
    'prohibited' => ':attribute فیلڈ ممنوع ہے۔',
    'prohibited_if' => 'جب :other کی قیمت :value ہو تو :attribute فیلڈ ممنوع ہے۔',
    'prohibited_unless' => 'جب تک :other ان میں سے :values نہ ہو، :attribute فیلڈ ممنوع ہے۔',
    'prohibits' => ':attribute فیلڈ :other کی موجودگی سے روکتی ہے۔',
    'regex' => ':attribute کا فارمیٹ غلط ہے۔',
    'required' => ':attribute فیلڈ ضروری ہے۔',
    'required_array_keys' => ':attribute فیلڈ میں ان کے لیے اندراجات ہونا ضروری ہے: :values',
    'required_if' => 'جب :other کی قیمت :value ہو تو :attribute فیلڈ ضروری ہے۔',
    'required_unless' => 'جب تک :other ان میں سے :values نہ ہو، :attribute فیلڈ ضروری ہے۔',
    'required_with' => 'جب :values موجود ہو تو :attribute فیلڈ ضروری ہے۔',
    'required_with_all' => 'جب :values موجود ہوں تو :attribute فیلڈ ضروری ہے۔',
    'required_without' => 'جب :values موجود نہ ہو تو :attribute فیلڈ ضروری ہے۔',
    'required_without_all' => 'جب :values میں سے کوئی بھی موجود نہ ہو تو :attribute فیلڈ ضروری ہے۔',
    'same' => ':attribute اور :other کا مطابقت رکھنا ضروری ہے۔',
    'size' => [
        'numeric' => ':attribute کا سائز :size ہونا چاہیے۔',
        'file' => ':attribute کا سائز :size کلو بائٹس ہونا چاہیے۔',
        'string' => ':attribute کے حروف کی تعداد :size ہونی چاہیے۔',
        'array' => ':attribute میں :size اشیاء ہونی چاہئیں۔',
    ],
    'starts_with' => ':attribute کا آغاز ان میں سے کسی ایک پر ہونا ضروری ہے: :values',
    'string' => ':attribute ایک سٹرنگ ہونا چاہیے۔',
    'timezone' => ':attribute ایک درست ٹائم زون ہونا چاہیے۔',
    'unique' => ':attribute پہلے ہی لیا جا چکا ہے۔',
    'uploaded' => ':attribute اپ لوڈ کرنے میں ناکام رہا۔',
    'url' => ':attribute ایک درست یو آر ایل ہونا چاہیے۔',
    'uuid' => ':attribute ایک درست یو یو آئی ڈی (UUID) ہونا چاہیے۔',

    /*
    |--------------------------------------------------------------------------
    | Custom Validation Language Lines
    |--------------------------------------------------------------------------
    |
    | Here you may specify custom validation messages for attributes using the
    | convention "attribute.rule" to name the lines. This makes it quick to
    | specify a specific custom language line for a given attribute rule.
    |
    */

    'custom' => [
        'attribute-name' => [
            'rule-name' => 'custom-message',
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Custom Validation Attributes
    |--------------------------------------------------------------------------
    |
    | The following language lines are used to swap our attribute placeholder
    | with something more reader friendly such as "E-Mail Address" instead
    | of "email". This simply helps us make our message more expressive.
    |
    */

    'attributes' => [],

];
