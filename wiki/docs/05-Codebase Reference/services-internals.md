# Services Internals

> **Audience:** Core contributors, AI agents · **Prereqs:** [The `ss` Object](./the-ss-object.md)
>
> **Canonical source:** `server-services/start-services.js`

The engineering detail underneath [Architecture Overview](../02-Running%20a%20Server/architecture-overview.md#services-the-single-source-of-truth) and [Rate Limiting](../02-Running%20a%20Server/rate-limiting.md) - the actual command dispatch pipeline, and the DB-seeding sequencing that matters if you're building a content-pack plugin (see [Content Packs](../04-Plugin%20Development/content-packs.md)).

## The command dispatch pipeline, in order

Every incoming WebSocket message goes through the same gate before reaching any actual command logic:

1. **Classify** `cmdType` - `sensitive` (in `ratelimit.sensitive.cmds`), `auth_required` (a fixed list: `getUser`, `addEggs`, `addKill`, `addDeath`, `sqlRequest` - not configurable), or `regular` otherwise.
2. **Optionally hash the IP** (`protect_ips`) - see [Rate Limiting](../02-Running%20a%20Server/rate-limiting.md).
3. **Resolve `isAccepted`**: a valid `auth_key` bypasses everything; an `auth_required` command with no key is rejected outright; otherwise it goes through `rl.allowRequest(ss, ip, cmdType)`.
4. **Reject with `{ error: 'Too many requests. Please try again later.' }`** if step 3 said no - nothing further happens for this message.
5. **`requestConfig`** is handled as a special case *outside* the closed-mode gate below - it's the polling handshake every game/client server relies on, so it has to keep working even in [closed mode](../02-Running%20a%20Server/closed-mode.md).
6. **Everything else is gated by `ss.config.distributed_all.closed !== true`**, then dispatched through one large `switch (msg.cmd)`: admin (`sqlRequest`), account/game (`getUser`, `addEggs`, `addKill`, `addDeath`), server-to-services (`setAnnouncement`, `servicesInfo`), and player-facing (`validateLogin`, `validateLoginViaAuthToken`, `validateRegister`, `feedback`, `saveEquip`, `buy`, `redeem`, `preview`, `checkBalance`, `getUpgrade`, `token`).

## The `initTables` DB-seeding pipeline - exact sequencing matters

This is the part most relevant to plugin authors, and the part most likely to be mis-guessed from the event names alone (see [Content Packs](../04-Plugin%20Development/content-packs.md#items) for why `initTablesBefore` is the wrong hook for a plugin's own items). The real sequence, `doItems()` and `doMaps()` running concurrently via `Promise.all`:

**`doItems()`:**
1. `initTablesStart` fires unconditionally.
2. **Only if the `items` table is currently empty**: `initTablesBefore` fires, then `recs.insertItems()` loads the defaults from `server-services/src/items/*.js`. On any subsequent boot (table already populated), this entire step - including the `initTablesBefore` emit - is skipped.
3. `initTables` fires **unconditionally**, every boot, regardless of step 2. The inline source comment admits this name is a historical misnomer: `// technically this should be for the end but now ive already been using it to insert items so lets just pretend it does that now`.

**`doMaps()`** (no empty-check gate at all):
1. `DELETE FROM maps;` - the entire table, every boot.
2. `recs.insertMaps()` - reloads defaults from `server-services/src/maps/*.json`.
3. `initTablesMaps` fires.

Then, after both finish: `initTablesFinish`.

The practical asymmetry: **items only get their "empty table" treatment once, ever** (until someone wipes the table), while **maps get rebuilt from scratch on literally every restart**. A plugin relying on `initTablesBefore` for its own items would only ever see it fire on a database that happens to be completely empty at that exact moment - in practice, once, on a fresh install - which is why [Content Packs](../04-Plugin%20Development/content-packs.md) documents `initTables` as the correct hook instead.

## Auth internals

- **Passwords**: `bcrypt`, cost factor from `config.services.password_cost_factor` (see [`npm run bcrypt`](../01-Getting%20Started/requirements.md)).
- **Auth tokens** ("remember me"): a 32-byte hex token, regenerated on every successful login/registration, compared by plain equality.
- **`game_servers.auth_key` lookup** (`accs.getAuthKeyData`) is the single enforcement point for game-server authorization across the whole codebase - see [Adding Game Servers](../02-Running%20a%20Server/adding-game-servers.md).
- **Sessions**: one active session per account (`createSession` deletes all prior sessions for that user first), a random 64-hex-char `session_id`, and an IP-mismatch check on retrieval that wipes all of that account's sessions if the requesting IP doesn't match what the session was created with (anti-hijacking) - unless the caller explicitly passes `readOnly` (used when a request is just peeking, not authenticating on behalf of the session).

## Common Issues

**A plugin's items disappear after a database wipe and never come back.** It's hooking `initTablesBefore` - see the sequencing above and [Content Packs](../04-Plugin%20Development/content-packs.md#items).

**Maps a plugin doesn't manage seem to get reset unexpectedly.** This is expected - `doMaps()` deletes and rebuilds the entire `maps` table every single boot, not just on first run. Anything not re-inserted by a `initTablesMaps` listener genuinely won't survive a restart.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
