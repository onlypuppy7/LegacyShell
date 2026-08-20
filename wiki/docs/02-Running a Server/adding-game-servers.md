# Adding Game Servers

> **Audience:** Server operators · **Prereqs:** [The Database](./the-database.md)
>
> **Canonical source:** `server-services/src/data_management/recordsManagement.js` (`game_servers` schema), `server-services/src/data_management/accountManagement.js` (`getAuthKeyData`), `src/scripts/init.js`

A game server won't do anything useful - won't show up in the server list, can't record kills, can't fetch account data - until it's **authorized** by the services server it's syncing with. Authorization is a row in the `game_servers` table, and a matching `auth_key` in the game server's own config.

## Why this exists

Anyone who could add kills/deaths, read account data, or bypass rate limiting without restriction would be able to seriously damage your database's integrity. The `auth_key` is the one thing that lets a game server do all of that - so treat it like a credential, not a config nicety. Per the schema, each key is a randomly generated ~30-character string, unique per server row.

## The automatic path (one local server)

If you answered `y` to "Add the game server as an authed server?" during `npm run init` (see [Installation](../01-Getting%20Started/installation.md)), this is already done - a `local` row was inserted into `game_servers`, and its `auth_key` was written into `store/config/game.yaml` for you. Nothing else to do.

## Adding another game server manually

This is what you need for a second region, or if you skipped the automatic step. Two ways to do it:

### Option A: Direct database edit (simplest)

With the services server ideally stopped (see [The Database](./the-database.md)), open `LegacyShellData.db` and insert a row:

```sql
INSERT INTO game_servers (name, address) VALUES ('eu-west', 'game-eu.example.com:13372');
```

`auth_key` is generated automatically by the table's default expression - you don't set it yourself. After inserting, read it back:

```sql
SELECT auth_key FROM game_servers WHERE name = 'eu-west';
```

### Option B: Web SQL tool (remote services server)

If you don't have filesystem access to the services server (it's hosted elsewhere), LegacyShell ships an admin web page for exactly this - **`/sql/`** on any client server, e.g. `http://localhost:13370/sql/`. It's a full SQL editor in the browser with prebuilt templates for every table (including a "Add New Game Server" / "Update Game Server Info" template for this exact task) - see [The Database](./the-database.md#the-built-in-web-sql-tool) for the full walkthrough.

To use it you need two credentials beyond the services server's own address: **any existing valid `game_servers.auth_key`** (this is a bit of a chicken-and-egg problem the very first time - see the note below) and the **`sqlPassword`**, which services auto-generates and prints to its own console the first time it ever boots:

```
sqlPassword: <printed once, on first boot - save it somewhere safe>
```

Both are required - the underlying `sqlRequest` command is gated behind having a valid auth key (same as other sensitive services commands) *and* a separate `sqlPassword` check on top of that.

::: tip Bootstrapping the very first game server
The web SQL tool needs an existing auth key to authenticate with, so it can't be how you register your *very first* game server (there's nothing to authenticate with yet). Use Option A (direct database access) or `npm run init`'s automatic setup for that one; the web tool becomes useful once you already have at least one authorized server and want to add more without touching the database file directly.
:::

## Configuring the new game server itself

On the machine (or region) that will actually run this game server, set `store/config/game.yaml`:

```yaml
port: 13372
services_server: "ws://your-services-host:13371"   # or wss:// if behind TLS
auth_key: "the auth_key you just generated"
```

Start it with `npm run game` as usual. On its first successful `requestConfig` handshake with services, it'll show up.

## Removing / revoking a server

Delete its row from `game_servers`, or just change its `auth_key` to something else (breaking the old key without needing to know the old value). The game server itself will keep trying to reconnect using its now-invalid key and simply be rejected - it doesn't need to be told directly.

## Common Issues

**A new game server never appears in the server list / can't record kills.** Almost always an `auth_key` mismatch - double check `store/config/game.yaml`'s `auth_key` exactly matches the `game_servers.auth_key` column for that row (no extra whitespace from copy-pasting).

**I regenerated/changed a key and now the server is rejected.** Expected - update `game.yaml` on that game server to match the new key and restart it.

Next: [Client Mirrors](./client-mirrors.md), or jump ahead to [Perpetual](./perpetual.md) for keeping servers running unattended.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
