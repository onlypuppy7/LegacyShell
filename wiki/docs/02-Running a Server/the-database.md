# The Database

> **Audience:** Server operators · **Prereqs:** [Architecture Overview](./architecture-overview.md)
>
> **Canonical source:** `server-services/src/data_management/recordsManagement.js` (schema), `server-services/store/LegacyShellData.db` (the actual file)

Everything persistent in LegacyShell - accounts, stats, inventories, maps, items, redemption codes, authorized game servers - lives in one SQLite file: `server-services/store/LegacyShellData.db`. Only the services server touches it directly; game and client servers only ever see this data secondhand, through services' WebSocket API.

## Opening it

SQLite databases are just files - no separate database server to run. Three ways in:

- **A GUI browser** (recommended if you're not comfortable writing raw SQL): [DB Browser for SQLite](https://sqlitebrowser.org/) is free and cross-platform. Open the `.db` file directly. Needs filesystem access to the machine running services.
- **The `sqlite3` CLI**, if you have it installed: `sqlite3 server-services/store/LegacyShellData.db`. Also needs filesystem access.
- **The admin panel** (`/admin`, from the bundled LegacyAdmin plugin), if you *don't* have filesystem access (a remote/hosted services server) - see below. This is the only one of the three that works purely over the network.

::: warning Stop the services server first (or be careful)
SQLite handles concurrent access reasonably well, but for anything beyond a quick read, it's safest to stop the services server before editing the database directly with a GUI or the CLI, then restart it afterward. Writing to a row the running server is also mid-write to is how you get corrupted data. (The admin panel below goes through the running server itself, so this warning doesn't apply to it the same way - but a badly-written `UPDATE`/`DELETE` is just as dangerous regardless of which tool sent it.)
:::

## The admin panel

The bundled **LegacyAdmin** plugin serves an admin panel at **`/admin`** on any client server (e.g. `http://localhost:13370/admin`). Its **SQL** tab is a SQL editor (prebuilt query templates for every table, plus a graphical table editor and the backup list) that sends queries straight to your services server's `sqlRequest` command over its WebSocket API. It needs no filesystem access to either server, which makes it the practical option once services is running somewhere you can't just open a file on. The older standalone `/sql/` page still exists alongside it and takes the same credentials, but it's slated for deprecation (its templates were ported into the panel by hand, so the two can drift) - prefer the panel.

The panel has two logins. A Moderator+ account login opens the moderation, rooms and item tabs; SQL writes, the config editor and restarts need **full access**, which takes three things at the login form:

| Field | What to put there |
|---|---|
| Services Server | The services server's WebSocket URL, e.g. `ws://localhost:13371` (or `wss://...` if it's behind TLS). |
| Game Server Auth Key | Any valid `auth_key` from the `game_servers` table (see [Adding Game Servers](./adding-game-servers.md)) - `sqlRequest` is gated behind having a valid auth key, same as other sensitive services commands. |
| SQL Password | The `sqlPassword` services printed to its own console the first time it ever booted (see [Adding Game Servers](./adding-game-servers.md#option-b-the-admin-panel-remote-services-server) for where to find it if you missed it). |

Pick a query type (Run Query / Get One / Get All - matching whether you expect no rows, one row, or many back), write or pick a template query, and submit. Every query, allowed or refused, lands in LegacyAdmin's audit log (the Logs tab). See [LegacyAdmin's own page](../../plugins/Plugin%20Docs/Default/legacyadmin/info.md) for the rest of the panel.

::: danger Full access is exactly as powerful as direct file access
Anyone with the auth key and SQL password can run **arbitrary SQL** against your entire database through the panel - there's no query restriction beyond what SQLite itself allows. Don't hand those two out, and log out of the panel on a shared or public computer.
:::

## The tables

Every table carries an informal "editability" tag in this documentation, describing what it's actually safe to touch by hand:

- **USER-EDITABLE** - meant to be edited directly. Go ahead.
- **SYS-EDITABLE** - not designed to be hand-edited, but you can if you know what you're doing (and are prepared to break something if you get it wrong).
- **SYS-READONLY** - not meant to be edited at all. Changes here get silently ignored or overwritten by LegacyShell itself; edit the underlying source (a JSON/JS file, not the DB row) instead.

| Table | Tag | What it holds | Notes |
|---|---|---|---|
| `users` | SYS-EDITABLE | Accounts: username, bcrypt password hash, `authToken`, kill/death/streak stats, currency (`currentBalance`), owned items, loadout, `adminRoles` rank. | See [Users and Ranks](./users-and-ranks.md) for the rank system and granting admin. |
| `codes` | USER-EDITABLE | Redemption codes - each can grant items and/or eggs (currency), with a use-count limit and a JSON list of who's redeemed it. | Add a row yourself in a SQL editor; the `key` column auto-generates a random code if left blank. Codes are never deleted once exhausted - they stay so players see "already used" instead of "doesn't exist." |
| `game_servers` | USER-EDITABLE | Authorized game servers - `name`, `address`, and an auto-generated `auth_key`. | See [Adding Game Servers](./adding-game-servers.md). A key here bypasses rate limiting and unlocks sensitive services commands - don't hand these out carelessly. |
| `items` | SYS-EDITABLE | Every item the game recognizes - price, shop visibility, class restrictions, etc. | Directly editable *only* if you're running with no plugins. Any plugin that adds items overwrites this entire table on every services startup - see [Content Packs](../04-Plugin%20Development/content-packs.md) once you get there. |
| `maps` | SYS-READONLY | Every map the game recognizes. | Generated from JSON files in `server-services/src/maps/` on every startup - edit those files (or add a map-pack plugin), not this table directly. |
| `sessions` | SYS-EDITABLE | Active login sessions, tied to an account ID and the IP(s) that used them. | Not very interesting to look at day to day. A session may bind one IPv4 and one IPv6 address (dual-stack players hop between the two); a request from any other address wipes all of that account's sessions automatically (anti-hijacking). |
| `ip_requests` | SYS-EDITABLE | Rate-limit bookkeeping per IP. | Rows expire and get cleaned up automatically - see [Rate Limiting](./rate-limiting.md). |
| `flags` | SYS-READONLY | Small internal key/value bag - things like a services-wide random seed, a hashed internal admin password, the current global announcement text, and one-time migration markers. | Not covered in earlier versions of this documentation table (the root `README.md`'s table predates this one and omits it) - it exists and is genuinely internal; there's no reason to hand-edit it. |

The tables above are core's. Bundled plugins add their own to the same file when they're enabled - `achievement_unlocks`/`achievement_showcases` (LegacyAchievements), `profile_preferences` (LegacyProfiles), `replays`/`replay_reels` (LegacyReplay), `moderation` (LegacyAdmin's bans and mutes). Treat them like SYS-EDITABLE: the owning plugin's README says what's safe to touch. Two plugins keep separate SQLite files instead: LegacyAdmin's audit log (`LegacyShellAdminLog.db`, next to this one) and LegacyAnalytics' `player_*`/`item_*`/`room_*` logs (`LegacyShellAnalytics.db`).

## Common Issues

**I edited a row and it "reverted" after a restart.** You almost certainly edited a SYS-READONLY table (most likely `maps`), or a SYS-EDITABLE `items` row while running plugins that manage items themselves. Check the table above for where the real source of truth is.

**The database file is locked / "database is locked" errors.** Something else has it open - most likely the services server itself is still running. Stop it before editing directly with an external tool.

**I want to reset everything.** Stop services, delete `server-services/store/LegacyShellData.db`, then either run `npm run init` again (says yes to the auth-server prompt) or just start the services server once - it recreates an empty schema on first boot. This is permanent and cannot be undone - back up the file first if there's any chance you'll want the old data (see [Backups](./backups.md)).

Next: [Users and Ranks](./users-and-ranks.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
