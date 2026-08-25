# Hosting for Someone Else's Instance

> **Audience:** Community members volunteering a client mirror or game server to an instance they don't own · **Prereqs:** [Architecture Overview](./architecture-overview.md)
>
> **Canonical source:** `server-services/src/data_management/recordsManagement.js` (`game_servers` schema), `server-services/src/ratelimit.js` (`auth_key` bypass)

[Adding Game Servers](./adding-game-servers.md) and [Client Mirrors](./client-mirrors.md) are written for the person who owns the whole deployment - they assume you have filesystem access to `LegacyShellData.db` and are adding capacity to your own instance. This page is for the other case: someone else already runs a public instance, and you want to donate a machine to it - a game server for a new region, or a client mirror closer to a specific audience - without owning any part of their stack yourself.

## Which role you can actually volunteer

| Role | Needs the owner's permission? | Why |
|---|---|---|
| **Client mirror** | No | Stateless and unauthenticated by design - it just polls the owner's services server for maps/items/config and serves static files (see [Client Mirrors](./client-mirrors.md#setting-one-up)). Anyone can point one at any services server, the same way anyone can mirror a public website. |
| **Game server** | Yes | It needs an `auth_key` matching a row in the owner's `game_servers` table before it can do anything - record kills, read account data, appear in the server list. That row can only be created by whoever has access to their database. |

## Volunteering a client mirror

Nothing beyond a normal install (see [Installation](../01-Getting%20Started/installation.md)), with `store/config/client.yaml`'s `sync_server` pointed at the owner's services server instead of a local one. Ask the owner for the exact WebSocket URL they want you to use - it may not be the same address players see in their browser if they're behind a reverse proxy (see [Deployment](./deployment.md)).

```yaml
# store/config/client.yaml
port: 13370
sync_server: "wss://their-services-host:443"   # get this from the owner, not the game's own URL
```

You don't need to tell them anything to start receiving traffic - a mirror is just another reader of their public config. Whether they actually point players at your mirror (DNS, a server-list entry, geographic load balancing) is a separate conversation to have with them.

## Volunteering a game server

1. **Ask the owner to create the `game_servers` row.** They do this on their end using [Adding Game Servers - Option A or B](./adding-game-servers.md#adding-another-game-server-manually); give them a name (e.g. `eu-west-community`) and the address your server will be reachable at.
2. **They send you back the `auth_key`.** Per [Adding Game Servers - Why this exists](./adding-game-servers.md#why-this-exists), this one string lets a game server add kills, read account data, and bypass rate limiting entirely - treat it exactly like a database password, not a config value to paste into a public repo or a Discord channel. If you ever suspect it leaked, tell the owner immediately so they can rotate it (see the same page's [Removing / revoking a server](./adding-game-servers.md#removing-revoking-a-server)).
3. **Configure your own `store/config/game.yaml`:**

```yaml
# store/config/game.yaml
port: 13372
services_server: "wss://their-services-host:443"
auth_key: "the key they gave you"
```

4. Start it with `npm run game` as usual. It'll show up in their server list on its first successful `requestConfig` handshake - nothing further to coordinate.

## Match their plugin set, not just their config

A game server's item catalog and map list are pulled automatically from services, but **plugins are local to each install** - nothing about the plugin folder contract syncs them for you (see [Anatomy](../04-Plugin%20Development/anatomy.md)). If the owner's instance runs custom gamemodes, guns, or map blocks as plugins, and your game server doesn't have those same plugins installed, room simulation for anything those plugins add will behave differently (or error) on your server than everywhere else on the same instance - even though you're both talking to the same services server. Ask the owner exactly which plugins their instance runs, and ideally get their `plugins/` folder directly rather than reconstructing it from a list.

The same applies to a client mirror, for a different reason: the browser bundle is one statically-built file assembled from whatever plugins are installed on *that specific machine* (`client:pluginSourceInsertion` - see [Client-Side Code](../04-Plugin%20Development/client-side-code.md)). A mirror with a different plugin set than the owner's other mirrors will look and behave differently for players who happen to land on it.

## Keeping it running

Use [Perpetual](./perpetual.md) the same way the owner does for their own servers - it isn't optional here any more than it would be for your own instance. One thing you can't opt out of: your server will [self-restart automatically](./architecture-overview.md#how-they-find-each-other) whenever the owner's services server restarts and reports a newer `startTime`, so don't be surprised by a restart you didn't trigger - that's expected behavior, not a crash.

## Common Issues

**My game server never appears in the owner's server list.** Same cause as [Adding Game Servers - Common Issues](./adding-game-servers.md#common-issues): an `auth_key` mismatch between your `game.yaml` and their `game_servers` row. Double-check you copied the whole key with no extra whitespace.

**My server stopped being recognized out of nowhere.** The owner likely rotated your `auth_key` (deliberately, or after a suspected leak) - ask them for the current one and update `game.yaml`.

**I don't have database access - how do I even get a key?** You don't, and you're not supposed to - that's the owner's side of this process (Option A/B in [Adding Game Servers](./adding-game-servers.md#adding-another-game-server-manually)). If you're being asked to run the database steps yourself, you've effectively been handed co-ownership of their services server, which is a bigger trust decision than volunteering a game or client server - worth confirming that's actually what's intended.

**Items, maps, or gamemodes look different on my server than on the owner's other servers.** Almost always a plugin mismatch - see [Match their plugin set, not just their config](#match-their-plugin-set-not-just-their-config) above.

Next: [Adding Game Servers](./adding-game-servers.md) or [Client Mirrors](./client-mirrors.md) for the owner's side of this same process, or [Perpetual](./perpetual.md) for keeping your server running unattended.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
