# LegacyAdmin

A single unified admin panel, served at `/admin` (client role): config-file editing + instance
restart (the original scope of this plugin, formerly `plugins_default/admin`), the SQL
statement/template tool absorbed from `/sql` plus a graphical table editor, an item-catalog
browser, code creation, moderation tools (kick/ban/mute), and live room/player/chat monitoring.
See the root [CLAUDE.md](/CLAUDE.md) / [AGENTS.md](/AGENTS.md) for the general "could this be a
plugin?" philosophy this follows.

## Two auth tiers

- **Account login (Moderator+)** - a real per-account login (bcrypt password, reusing
  `#accountManagement`/`#sessionManagement` directly) gated on `adminRoles >= 10` (Moderator, per
  `distributed_permissions.yaml`'s ranks). Unlocks the moderator-relevant slice: item browser,
  moderation, room/chat monitoring.
- **Full access** - the existing `sqlPassword` (bcrypt-compared against services' `flags` table)
  plus an `auth_key` from the `game_servers` table. Unlocks everything, including the config-file
  editor, SQL writes, and instance restarts. Reuses the exact same credential /sql already used.

Either tier alone can use the moderator-relevant features; only full access can touch files/SQL
writes/restarts. A bare `auth_key` with no `sqlPassword` stays low-privilege (rate-limit bypass and
a handful of narrow game-server commands only) - it does **not** grant admin access on its own.

## Connection model

No dedicated port. Everything rides the same persistent WebSocket connections game/client
instances already hold open to services (`#wsrequest`'s `onmessage`-returns-truthy pattern - see
`server-game/start-game.js`/`server-client/start-client.js`). Services keeps a small registry of
every currently-connected game/client socket, keyed by a lightweight per-connection ID assigned on
connect - not `auth_key`, which is unrelated to identity here (see "Two auth tiers" above) and
which most client instances never carry at all - and routes admin commands to a specific instance
on demand via a `servicesCommand` push (`services/registry.js`). This replaced the plugin's old
`mainPort+111` dedicated WS server, which no longer exists.

## What's here

```
services/   registry.js (routing), auth.js (login/session/logout), accountManager.js (rename/
            password/impersonate), moderation.js (ban/mute CRUD), catalogBridge.js (item data),
            roomOverview.js (multi-server room/player overview), auditLog.js (append-only security
            log in its own SQLite file), backups.js (DB backup list/create/delete/restore),
            storage.js (adminGetStorage stats), perf.js (adminGetPerf CPU/mem sampler)
game/       roomBridge.js (main thread: list rooms, get chat, kick), moderationWorker.js (per-room
            kick handler), banCache.js / muteCache.js (periodic enforcement-list polls +
            worker-side account-ban boot on clientInitEnd), chatRelay.js (worker -> main relay)
client/     the admin-app SPA (app.js + one file per tab). Tabs: home (dashboard, hidden - the
            "LegacyAdmin" nav button), instances (config editor + instance picker + restart +
            perf; formerly "Files"), sql (statement / table editor / backups), items, codes,
            accounts, moderation, rooms, storage, logs. #hash selects the tab, ?query carries
            per-tab state (?account= on accounts, ?mode= on sql, ?room= on rooms).
            tileCache.js caches rendered item tiles in IndexedDB; impersonate-inject.js is
            spliced into the MAIN GAME bundle (not the panel).
```

The **managed-instance selector** and **Restart** moved out of the navbar into the Instances tab.
`AdminApp.targetId` holds the selection now (was a `<select>` in the DOM); `AdminApp.sendTo(id,
cmd, extra)` routes one command to a specific instance without changing the selection.

New routable command `adminGetPerf` (Moderator+) - services answers directly, game/client answer
the routed form in index.js's onServicesCommand. The dashboard fans it out to every instance.
`adminGetStorage` (Moderator+) and the `adminListBackups`/`adminCreateBackup`/`adminDeleteBackup`
(`{name}` or `{keep:N}`)/`adminRestoreBackup` set (Admin/SQL, audit-logged; restore swaps the DB
file and `process.exit(1337)`s) back the Storage tab and SQL > Backups.

## Accounts tab (account manager)

The old Inventory tab, generalised. Moderator+ to open. Keeps eggs / VIP / owned-item editing
(still raw `sqlRequest`). Additional actions, all gated server-side to **Admin (rank 20) or the
SQL password** (`services/accountManager.js`, `checkAdminOrSql`) and audit-logged:

- **Rename** (`adminSetUsername`) - validates format + uniqueness. The target's saved "remember
  me" login breaks until they sign in again (it's keyed by username).
- **Set password** (`adminSetPassword`) - the panel SHA-256s the new password via WebCrypto
  before sending, exactly like the game's login form; services only bcrypts that digest. Needs a
  secure context (https / localhost) for `crypto.subtle`.
- **Log in as -> (new tab)** (`adminImpersonate`) - returns the account's remember-me token; the
  panel opens `/?adminImpersonate=1&impUser=&impToken=`. `client/impersonate-inject.js` (spliced
  at the top of the game bundle) serves the two login localStorage keys *from memory for that tab
  only* - the admin's own game login is untouched and nothing persists once the tab closes.
  Caveat: the game rotates the auth token on use, so the target re-enters their password next
  login on their own device; reloading the impersonation tab logs it out.
- Per-account **ban / mute** toggles, reusing `adminAddModeration` / `adminRemoveModeration` with
  `target_type: 'account_id'`.

Audit-log IPs are the real client address (services passes `rawIp` alongside the hashed `ip` on
the `unhandledCommand` / `adminSqlAudit` emits); the hashed `ip` is still what session checks
use.

## Security model notes

- **Audit log.** Every privileged action (SQL exec, config read/write, restart, moderation
  change, routed command, login success/failure, logout) is written to
  `server-services/store/LegacyShellAdminLog.db` - a *separate* SQLite file so it survives a
  main-DB restore and isn't reachable from the SQL/table-editor tab. Read-only view in the **Logs**
  tab, which is **Admin (rank 20) or SQL password only** - not plain Moderators, since the log
  records what they do. `auditLog.js`'s `recordAudit()` is the single entry point.
- **Routing is authenticated at services, and only there.** `adminRouteToServer` requires a
  Moderator+ session (room actions) or the SQL password (file/restart actions); services then
  **strips every credential from the payload** before forwarding. The target game/client instance
  trusts that the command arrived on its persistent services connection and runs it without
  re-checking - so a forged target instance selected by a tricked admin receives no secrets.
  `adminListServers` is Moderator+ too. Routed responses are correlated by an unguessable 128-bit
  `requestId` and time out after 30s (bounded map, no leak). Instance *registration*
  (`requestConfig`) is still unauthenticated - a fake can appear in the list, but can no longer
  harvest credentials from being picked.
- **Credential scope.** The client attaches the SQL password / `auth_key` only to commands that
  actually need SQL/file/restart power (or to a routed command, or when there's no session to
  authenticate with) - not to every list refresh. `localStorage` is still used for persistence.
- **Logout revokes the session server-side** (`sess.deleteSession`), not just the local storage.
- **Static surface.** `/admin` sends a strict CSP + `X-Frame-Options: DENY` etc. Tabulator is
  served locally from `/admin/vendor` (npm dependency `tabulator-tables`, copied out at client
  boot). Tailwind is still loaded from its Play CDN - removing that needs a real Tailwind build
  step and is the one remaining third-party script.
- **Verbose services logging** runs inbound messages through a secret-redaction pass before
  `console.log` (core `start-services.js`).

## Known follow-ups (not done in this pass)

- **Item tiles render as a metadata table, not the game's actual 3D/sprite tile graphics.** Doing
  that properly means extracting `ItemRenderer` out of `shellshock.min.js` (~line 1665) into a
  shared, headless-Babylon-renderable module - real standalone work with its own risk (a
  `loadMaterials` dependency that may not belong in a headless context) and its own verification
  need (a live browser, to actually see the canvas output). Editing item rows already works today
  via the SQL tab's table editor against the `items` table.
- **Recently-closed-room history was explicitly dropped from scope** - not built, not stubbed.
- **Mute/ban enforcement polls services every ~20s** (`game/banCache.js`/`muteCache.js`) rather
  than being pushed live - simplest correct option; each active room worker polls independently
  (workers share no state), a little redundant across many concurrent rooms but not incorrect.
- The standalone `/sql` page still exists in parallel for now (its templates were ported into this
  plugin's SQL tab by hand, not derived, so the two can drift - `/sql` itself is intended to be
  formally deprecated once this panel replaces it in practice).
