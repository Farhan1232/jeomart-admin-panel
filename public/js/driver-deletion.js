/*
 * driver-deletion.js
 * ----------------------------------------------------------------------------
 * What deleting a driver in the Admin Panel has to do beyond removing the
 * `users` document.
 *
 * WHAT THE CLIENT REPORTED
 *   "When a driver is deleted from the Admin Panel, the driver disappears from
 *    the list, but the deleted driver can still log in using the Driver App,
 *    and old/deleted drivers can still appear in Live Tracking."
 *
 * WHY
 *   1. The login was never removed. The `deleteUser` Cloud Function every
 *      delete button calls read `data.uid`, but it is deployed as a 2nd-gen
 *      callable, which hands it a request whose payload is `request.data` -
 *      so the uid was always undefined, the Auth deletion threw, and the error
 *      handler then threw a ReferenceError of its own. Every call since the
 *      function was deployed has failed; the panel only logged it to the
 *      console, after the page had already reloaded.
 *
 *   2. A driver app that is still running writes the profile straight back.
 *      Its location stream and online switch save the whole in-memory profile
 *      with `set(..., merge: true)`, which re-creates a document that no
 *      longer exists. Two live drivers were found in exactly that state: each
 *      document's creation time is hours after the panel's delete, while its
 *      own `createdAt` field still holds the original sign-up date.
 *
 * WHAT THIS FILE DOES
 *   markDeleted()   records the deletion in `deleted_drivers/{uid}` BEFORE the
 *                   profile is removed. That record is what the server side
 *                   acts on: `deleteUser` only removes a login that carries
 *                   one, and `enforceDeletedDrivers` removes any profile that
 *                   is re-created for it. Live Tracking reads it too.
 *   revokeLogin()   calls `deleteUser` and, unlike the old fire-and-forget
 *                   ajax, resolves only once the function has answered.
 *
 * To restore a driver deleted by mistake, delete their `deleted_drivers`
 * document first; otherwise a re-created profile is removed again.
 *
 * Inlined by resources/views/layouts/driver_deletion_script.blade.php into the
 * four views that delete drivers.
 */
(function (window) {
    'use strict';

    var TOMBSTONES = 'deleted_drivers';

    function serverTime() {
        var fs = window.firebase && window.firebase.firestore;
        if (fs && fs.FieldValue && typeof fs.FieldValue.serverTimestamp === 'function') {
            return fs.FieldValue.serverTimestamp();
        }
        return new Date();
    }

    /** Record that the admin deleted this driver. Resolves when it is saved. */
    function markDeleted(db, driverId) {
        if (!driverId) return Promise.reject(new Error('driver-deletion: no driver id'));
        return db.collection(TOMBSTONES).doc(String(driverId)).set({
            id: String(driverId),
            role: 'driver',
            deletedAt: serverTime(),
            deletedFrom: 'admin-panel'
        }, { merge: true });
    }

    /**
     * Remove the driver's Firebase Authentication account.
     *
     * Always resolves, with { ok, message }: a login that could not be removed
     * must not stop the rest of the deletion, but it is reported instead of
     * vanishing into a console line nobody reads before the page reloads.
     */
    function revokeLogin(projectId, driverId) {
        var $ = window.jQuery;
        return new Promise(function (resolve) {
            $.ajax({
                url: 'https://us-central1-' + projectId + '.cloudfunctions.net/deleteUser',
                method: 'POST',
                contentType: 'application/json; charset=utf-8',
                data: JSON.stringify({ data: { uid: driverId } }),
                success: function (response) {
                    var result = response && response.result;
                    console.log('Delete user success:', result && result.result ? result.result : result);
                    resolve({ ok: true, message: result });
                },
                error: function (xhr) {
                    var message = '';
                    try {
                        var body = JSON.parse(xhr.responseText);
                        message = body && body.error ? (body.error.message || body.error.status || '') : '';
                    } catch (e) {
                        message = (xhr && xhr.statusText) || 'no response';
                    }
                    console.error('Delete user error:', message);
                    resolve({ ok: false, message: message });
                }
            });
        });
    }

    window.DriverDeletion = {
        TOMBSTONES: TOMBSTONES,
        markDeleted: markDeleted,
        revokeLogin: revokeLogin
    };
})(window);
