<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# `services:` events

> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

Every `plugins.emit(...)` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; `PluginManager.emit` adds `services:` before checking for listeners, so e.g. the first row below actually fires as `services:servicesOnLoad`.

| Event | Location | Payload | Fires when |
|---|---|---|---|
| `servicesOnLoad` | `server-services/start-services.js:67` | `{ ss }` | Services process finished its own setup (DB, math, events), before `initTables()` runs. |
| `initTablesStart` | `server-services/start-services.js:111` | `{ ss }` | Start of the DB-seeding pipeline — hook here to force-reinit `items` before defaults are inserted. |
| `initTablesBefore` | `server-services/start-services.js:119` | `{ ss }` | Just before default items are inserted from `server-services/src/items/*.js` — only fires when the `items` table is currently empty (a genuinely fresh database), so it fires at most once, ever. For a plugin's own item pack, hook `initTables` instead (see below) — that one fires on every boot. |
| `initTables` | `server-services/start-services.js:124` | `{ ss }` | Fires once per boot, after the empty-table check either ran or didn't — the reliable hook for a plugin to insert its own items via `ss.recs.insertItems(...)` every time services starts, regardless of whether the table was already seeded. |
| `initTablesMaps` | `server-services/start-services.js:142` | `{ ss }` | After the `maps` table is unconditionally wiped and reseeded from `server-services/src/maps/*.json` (this happens on every boot, no empty-table gate) — plugins call `ss.recs.insertMaps(...)` here for custom map packs. |
| `initTablesFinish` | `server-services/start-services.js:161` | `{ ss }` | End of the whole DB-seeding pipeline (items + maps both done). |
| `sendServicesInfo` | `server-services/start-services.js:317` | `{servicesInfo}` | The periodic `servicesInfo` push (started by a `requestConfig` handshake) is about to be sent to a polling client/game server. |
| `addEggs` | `server-services/start-services.js:387` | `{ userData }` | A player's egg (currency) balance was incremented via the `addEggs` command. |
| `addKill` | `server-services/start-services.js:407` | `{ userData }` | A kill was recorded for a player via the `addKill` command. |
| `addDeath` | `server-services/start-services.js:424` | `{ userData }` | A death was recorded for a player via the `addDeath` command. |
| `setAnnouncement` | `server-services/start-services.js:439` | `{ msg }` | The global `game_announcement` flag was updated. |
| `servicesInfoGame` | `server-services/start-services.js:454` | `{ gameInfo, gameInfoForClient, msg, thisServer: msg.thisServer }` | A game server pushed its `servicesInfo` (room/player-count snapshot) to services. |
| `validateLoginSuccess` | `server-services/start-services.js:468` | `{ userData }` | Password-based login succeeded. |
| `validateLoginFail` | `server-services/start-services.js:471` | `{ userData, msg, error: "Password is incorrect" }` | Login failed — three separate call sites share this event name, covering wrong password, nonexistent user, and a database error respectively; check the payload's `error` field for which one. |
| `validateLoginFail` | `server-services/start-services.js:480` | `{ userData, msg, error: "User doesn't exist" }` | Login failed — three separate call sites share this event name, covering wrong password, nonexistent user, and a database error respectively; check the payload's `error` field for which one. |
| `validateLoginFail` | `server-services/start-services.js:485` | `{ userData, msg, error: "Database error" }` | Login failed — three separate call sites share this event name, covering wrong password, nonexistent user, and a database error respectively; check the payload's `error` field for which one. |
| `validateLoginViaAuthTokenSuccess` | `server-services/start-services.js:498` | `{ userData }` | "Remember me" token-based silent login succeeded. |
| `validateRegisterSuccess` | `server-services/start-services.js:550` | `{ userData }` | New account registration succeeded. |
| `validateRegisterFail` | `server-services/start-services.js:556` | `{ username: msg.username, error: accountCreationResult }` | New account registration failed (username taken, validation error, etc — see `error`). |
| `feedback` | `server-services/start-services.js:587` | `{ msg }` | A player submitted in-game feedback (also posted to a Discord webhook if `config.services.feedback` is set). |
| `saveEquipBeforeWrite` | `server-services/start-services.js:629` | `{msg, userData, accs}` | Just before a player's equipped loadout is written to the DB. |
| `buyingResult` | `server-services/start-services.js:653` | `{buyingResult, userData, msg}` | A shop purchase attempt resolved. |
| `redeemResult` | `server-services/start-services.js:673` | `{redeemResult, userData, msg}` | An item/egg code redemption attempt resolved. |
| `previewResult` | `server-services/start-services.js:704` | `{canBeUsed, previewResult, userData, msg}` | A code "preview" (check without redeeming) resolved. |
| `tokenSuccess` | `server-services/start-services.js:769` | `{ userData }` | The VIP/"nugget" token unlock flow succeeded. |
| `unhandledCommand` | `server-services/start-services.js:794` | `{ msg, ws, accs }` | *(undocumented — add an entry to `src/scripts/event-descriptions.json`)* |
| `insertMaps` | `server-services/src/data_management/recordsManagement.js:411` | `{this: this, jsonDir, map}` | Fired once per map JSON file as `insertMaps()` writes a `maps` row — the low-level counterpart to `initTablesMaps`. |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
