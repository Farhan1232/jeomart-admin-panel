<?php

namespace App\Helpers;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which city (Firestore `zone`) a panel admin is limited to.
 *
 * Kept in its own table, admin_user_cities, so the users table is not changed.
 * Every read fails soft: no table, no row or a database error all mean "not
 * limited", which is how every admin worked before this existed.
 */
class AdminCity
{
    const TABLE = 'admin_user_cities';

    /**
     * The only permissions a city admin keeps (when their role has them):
     * the lists that are cut down to their city, the order and document pages
     * opened from them, a customer's own page (opened from their orders; the
     * all-customers list stays refused, see CITY_HIDDEN_ROUTES), the cab /
     * rental vehicle types (only their city's can be changed, admin-city.js),
     * products (cut down to their city's stores), the on-demand providers,
     * services, workers and bookings (cut down to their city), and the
     * payout / payout request / wallet / vehicle tabs of one driver, store,
     * owner or provider (the all-cities lists of those stay refused, see
     * CITY_HIDDEN_ROUTES). Settings, reports and every other page are hidden
     * from the menu and refused by URL.
     */
    const CITY_PERMISSIONS = [
        'vendors', 'approve_vendors', 'pending_vendors', 'vendors-document',
        'stores',
        'drivers', 'approve_drivers', 'pending_drivers', 'drivers-document',
        'owners', 'approve_owners', 'pending_owners', 'owners-document', 'fleet-drivers',
        'orders', 'rides', 'parcel-orders', 'rental-orders',
        'users',
        'cab-vehicle-type', 'rental-vehicle-type',
        'items',
        'rental-vehicle',
        'stores-payout', 'payout-request-vendor',
        'drivers-payout', 'payout-request-driver',
        'owners-payout', 'payout-request-owner', 'owners-wallet-transaction',
        'wallet-transaction',
        'providers', 'ondemand-services', 'ondemand-workers', 'ondemand-bookings',
        'provider-payout', 'payout-request-provider',
    ];

    /**
     * Pages without a permission of their own that a city admin may still
     * open (GET): the dashboard, their profile, and the order pages linked
     * from the lists above. Any other such page is refused.
     */
    const CITY_OPEN_ROUTES = [
        'home', 'dashboard', 'changeLang', 'users.profile', 'logout',
        'drivers.ride', 'drivers.rides', 'rides.view',
        'parcel_orders.driver', 'parcel_orders.owner',
        'rental_orders.driver', 'rental.orders.owner', 'owner.rides',
        'vendors.orderprint', 'orders.review', 'items.view', 'vendors.reviews',
    ];

    /**
     * Pages a kept permission opens that are not cut down to a city: Driver
     * Trips (shares `rides` with the Rides list), the all-customers list and
     * customer create (`users`; a customer's own page stays open), and the
     * all-cities payout, payout request, disbursement, wallet and rental
     * vehicle lists and the payout forms that pick from everyone (the same
     * pages for one driver / store / owner / provider stay open). Refused.
     */
    const CITY_HIDDEN_ROUTES = [
        'driver_trips', 'users', 'users.create',
        'rentalvehicle',
        'vendorsPayouts', 'vendorsPayouts.create',
        'driversPayouts', 'driversPayouts.create',
        'ownersPayouts.create',
        'providerPayouts', 'providerPayouts.create',
        'walletstransaction', 'walletTransaction.owner',
        'payoutRequests.drivers', 'payoutRequests.vendor', 'payoutRequests.owners',
        'payoutRequests.vendor.disbursement', 'payoutRequests.driver.disbursement',
        'payoutRequests.owner.disbursement', 'payoutRequests.providers.disbursement',
    ];

    /**
     * Pages whose one route serves both the all-cities list (no id) and one
     * person's page (with an id): open to a city admin only with the id.
     */
    const CITY_ID_ROUTES = ['payoutRequests.providers'];

    /** forUser() results for this request: the menu, header and middleware all ask. */
    protected static $memo = [];

    protected static function ready()
    {
        try {
            return Schema::hasTable(self::TABLE);
        } catch (\Throwable $e) {
            return false;
        }
    }

    /** ['id' => zone id, 'name' => zone name] or null when not limited. */
    public static function forUser($userId)
    {
        if (empty($userId)) {
            return null;
        }
        if (!array_key_exists($userId, self::$memo)) {
            self::$memo[$userId] = self::read($userId);
        }
        return self::$memo[$userId];
    }

    protected static function read($userId)
    {
        if (!self::ready()) {
            return null;
        }
        try {
            $row = DB::table(self::TABLE)->where('user_id', $userId)->first();
        } catch (\Throwable $e) {
            return null;
        }
        if (!$row || empty($row->zone_id)) {
            return null;
        }
        return ['id' => (string) $row->zone_id, 'name' => (string) ($row->zone_name ?? '')];
    }

    /** The role's permissions, cut down to CITY_PERMISSIONS for a city admin. */
    public static function limitPermissions($userId, array $permissions)
    {
        if (!self::forUser($userId)) {
            return $permissions;
        }
        return array_values(array_intersect($permissions, self::CITY_PERMISSIONS));
    }

    /**
     * May this admin open the page (GET)? $gated: the route has a permission
     * of its own, which PermissionMiddleware checks. $parameters: the route's
     * parameters (CITY_ID_ROUTES).
     */
    public static function allowsRoute($userId, $routeName, $gated, array $parameters = [])
    {
        if (!self::forUser($userId)) {
            return true;
        }
        if (in_array($routeName, self::CITY_HIDDEN_ROUTES, true)) {
            return false;
        }
        if (in_array($routeName, self::CITY_ID_ROUTES, true) && empty(array_filter($parameters, function ($value) { return $value !== null && $value !== ''; }))) {
            return false;
        }
        return $gated || in_array($routeName, self::CITY_OPEN_ROUTES, true);
    }

    /** Is this admin limited to a city? */
    public static function limited($userId)
    {
        return self::forUser($userId) !== null;
    }

    /** Limit the admin to one city, or (empty zone id) to none. */
    public static function set($userId, $zoneId, $zoneName = null)
    {
        if (empty($userId) || !self::ready()) {
            return;
        }
        $zoneId = trim((string) $zoneId);
        unset(self::$memo[$userId]);
        try {
            if ($zoneId === '') {
                DB::table(self::TABLE)->where('user_id', $userId)->delete();
                return;
            }
            DB::table(self::TABLE)->updateOrInsert(
                ['user_id' => $userId],
                ['zone_id' => $zoneId, 'zone_name' => $zoneName, 'updated_at' => now(), 'created_at' => now()]
            );
        } catch (\Throwable $e) {
            // The admin user itself is already saved; only the city is lost.
            report($e);
        }
    }
}
