<?php

namespace App\Http\Middleware;

use App\Models\Permission;
use App\Models\User;
use Auth;
use Closure;

class CheckUserRoleMiddleware
{
    /**
     * Handle an incoming request.
     *
     * @param \Illuminate\Http\Request $request
     * @param \Closure $next
     * @return mixed
     */
    public function handle($request, Closure $next)
    {

        if (auth()->check()) {
            $user = auth()->user();

            $role_has_permissions = Permission::where('role_id', $user->role_id)->pluck('routes')->toArray();

            $role_has_permissions = array_unique($role_has_permissions);

            $users = User::join('role', 'role.id', '=', 'users.role_id')->where('users.id', '=', $user->id)->select('role.role_name as roleName')->first();

            session(['user_role' => $users->roleName, 'user_permissions' => json_encode($role_has_permissions)]);

            // City admin: a page with no permission of its own opens only if
            // it is one of AdminCity::CITY_OPEN_ROUTES (pages with a permission
            // are checked by PermissionMiddleware), and never one of
            // AdminCity::CITY_HIDDEN_ROUTES.
            $route = $request->route();
            if ($request->isMethod('GET') && $route) {
                $gated = false;
                foreach ($route->gatherMiddleware() as $middleware) {
                    if (is_string($middleware) && strpos($middleware, 'permission:') === 0) {
                        $gated = true;
                        break;
                    }
                }
                if (!\App\Helpers\AdminCity::allowsRoute($user->id, $route->getName(), $gated, $route->parameters())) {
                    abort(403, 'unauthorized access');
                }
            }

        }
        return $next($request);
    }
}