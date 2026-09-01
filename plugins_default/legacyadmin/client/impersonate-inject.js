// Spliced into the very top of the main game bundle by legacyadmin (client:pluginSourceInsertion,
// position 'beforebefore'). Inert unless the LegacyAdmin account manager opened this tab with
// ?adminImpersonate=1&impUser=...&impToken=... - in which case it serves the two "remembered
// login" localStorage keys FROM MEMORY for this tab only. The browser's real stored values are
// never read or written, so:
//   - the game boots logged in as the target account,
//   - the admin's own game login on this browser is untouched,
//   - nothing persists once the tab is closed.
(function () {
    try {
        var params = new URLSearchParams(location.search);
        if (params.get('adminImpersonate') !== '1') return;
        var user = params.get('impUser');
        var token = params.get('impToken');
        if (!user || !token) return;

        // Get the credentials out of the address bar / session history entry straight away.
        ['adminImpersonate', 'impUser', 'impToken'].forEach(function (k) { params.delete(k); });
        var qs = params.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);

        var mem = { LegacyShellAuthToken: token, LegacyShellPreviousUsername: user };
        var has = function (k) { return Object.prototype.hasOwnProperty.call(mem, k); };
        var realGet = Storage.prototype.getItem;
        var realSet = Storage.prototype.setItem;
        var realRemove = Storage.prototype.removeItem;
        Storage.prototype.getItem = function (k) {
            if (this === window.localStorage && has(k)) return mem[k];
            return realGet.apply(this, arguments);
        };
        Storage.prototype.setItem = function (k, v) {
            if (this === window.localStorage && has(k)) { mem[k] = String(v); return; }
            return realSet.apply(this, arguments);
        };
        Storage.prototype.removeItem = function (k) {
            if (this === window.localStorage && has(k)) { delete mem[k]; return; }
            return realRemove.apply(this, arguments);
        };

        console.warn('[LegacyAdmin] Impersonation mode - this tab is logged in as "' + user + '". Nothing is saved; close the tab to end it.');
    } catch (e) { /* never break the game over this */ }
})();
