<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Cache;
use App\Helpers\FirestoreHelper;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     *
     * @return void
     */
    public function register()
    {
        setcookie('XSRF-TOKEN-AK', bin2hex(env('FIREBASE_APIKEY')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-AD', bin2hex(env('FIREBASE_AUTH_DOMAIN')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-DU', bin2hex(env('FIREBASE_DATABASE_URL')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-PI', bin2hex(env('FIREBASE_PROJECT_ID')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-SB', bin2hex(env('FIREBASE_STORAGE_BUCKET')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-MS', bin2hex(env('FIREBASE_MESSAAGING_SENDER_ID')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-AI', bin2hex(env('FIREBASE_APP_ID')), time() + 3600, "/"); 
        setcookie('XSRF-TOKEN-MI', bin2hex(env('FIREBASE_MEASUREMENT_ID')), time() + 3600, "/"); 

        $countries_data = [];
        $get_countries_json = file_get_contents(public_path('countriesdata.json'));
        if($get_countries_json != ''){
            $countries_data = json_decode($get_countries_json);
        }
        view()->composer('*', function($view) use($countries_data) {
            $view->with('countries_data', $countries_data);
        });
    }

    /**
     * Bootstrap any application services.
     *
     * @return void
     */
    public function boot()
    {
        $openai_settings = $this->openaiSettings();
        if (!empty($openai_settings)) {
            if (!empty($openai_settings['api_key'])) {
                Config::set('openai.api_key', $openai_settings['api_key']);
            }
            if (!empty($openai_settings['organization'])) {
                Config::set('openai.organization', $openai_settings['organization']);
            }
        }

        view()->composer('*', function ($view) use ($openai_settings) {
            $view->with('openai_settings', $openai_settings);
        });
    }

    const OPENAI_CACHE_KEY = 'firestore:settings/openai_settings';
    const OPENAI_CACHE_SECONDS = 60;

    /**
     * settings/openai_settings for this request.
     *
     * Reading it straight from Firestore added ~2.3 s to EVERY panel request
     * (this server's round trip to Firestore) and failed the request after 30 s
     * whenever that call timed out. Web requests now take it from the
     * application cache and, once the cached copy is a minute old, read it
     * again after the response has been sent. The first request with nothing
     * cached reads it inline, as before. Console commands (the cron jobs) are
     * unchanged.
     */
    protected function openaiSettings()
    {
        if ($this->app->runningInConsole()) {
            return FirestoreHelper::getDocument('settings/openai_settings');
        }

        try {
            $cached = Cache::get(self::OPENAI_CACHE_KEY);
        } catch (\Throwable $e) {
            return FirestoreHelper::getDocument('settings/openai_settings');
        }

        if (is_array($cached) && array_key_exists('value', $cached)) {
            if ((int) ($cached['at'] ?? 0) <= time() - self::OPENAI_CACHE_SECONDS) {
                $this->app->terminating(function () {
                    $this->refreshOpenaiSettings(true);
                });
            }
            return $cached['value'];
        }

        return $this->refreshOpenaiSettings(false);
    }

    /**
     * Reads settings/openai_settings from Firestore into the cache.
     *
     * After the response, one refresh at a time; a failure there keeps the
     * cached copy. Inline (nothing cached yet) a failure is thrown, as before.
     */
    protected function refreshOpenaiSettings($afterResponse)
    {
        $lock = self::OPENAI_CACHE_KEY . ':refreshing';
        try {
            if ($afterResponse && !Cache::add($lock, 1, 60)) {
                return null;
            }
        } catch (\Throwable $e) {
            return null;
        }

        try {
            $value = FirestoreHelper::getDocument('settings/openai_settings');
        } catch (\Throwable $e) {
            if (!$afterResponse) {
                throw $e;
            }
            report($e);
            try { Cache::forget($lock); } catch (\Throwable $ignored) {}
            return null;
        }

        try {
            Cache::forever(self::OPENAI_CACHE_KEY, ['value' => $value, 'at' => time()]);
            if ($afterResponse) {
                Cache::forget($lock);
            }
        } catch (\Throwable $ignored) {
        }
        return $value;
    }
}
