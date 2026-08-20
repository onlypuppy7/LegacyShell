# Client Mirrors

> **Audience:** Server operators · **Prereqs:** [Architecture Overview](./architecture-overview.md)
>
> **Canonical source:** `server-client/start-client.js`

Unlike a game server ([which needs authorization](./adding-game-servers.md)), a client server needs no registration at all - anyone can stand one up pointed at your services server, the same way anyone can run a mirror of a normal website. This page covers when and how to actually do that deliberately, as part of your own deployment.

## Why you'd want more than one

- **Geographic spread** - serving the (static, cacheable) game files from a location closer to your players reduces load time, independent of which game server region they end up playing on.
- **Redundancy** - if one client server goes down, players hitting a different mirror are unaffected.
- **Load** - the client server does real work on startup (building the browser bundle, generating the stamp spritesheet) and serves static assets afterward; spreading traffic across mirrors reduces load per machine, though a single client server can typically serve a lot of static traffic before this matters.

## Setting one up

Nothing beyond a normal LegacyShell install (see [Installation](../01-Getting%20Started/installation.md)) plus pointing its config at your existing services server instead of a local one:

```yaml
# store/config/client.yaml
port: 13370
sync_server: "ws://your-services-host:13371"   # or wss:// through a reverse proxy, see Deployment
```

Start it with `npm run client` as usual. It polls services for maps/items/servers/config the same way every client server does (see [Architecture Overview](./architecture-overview.md#how-they-find-each-other)) - there's no separate "register this mirror" step, because the client role is stateless and unauthenticated by design.

## What's shared vs. independent between mirrors

- **Shared** (pulled from services): maps, items, the server list, distributed config (`distributed_all.yaml`, `distributed_client.yaml`, `distributed_permissions.yaml`).
- **Independent** (local to each mirror): `client.yaml` itself - port, [closed mode](./closed-mode.md), HTTP Basic Auth (`login.enabled`), `this_url`. Each mirror can have its own `closed: true` without affecting the others - see [Closed Mode](./closed-mode.md).

## Common Issues

**A mirror shows stale maps/items after I updated them on services.** It hasn't re-polled yet, or the update didn't actually change what services reports as current - restart the mirror to force an immediate `requestConfig`, and confirm the change actually landed in services' database first (see [The Database](./the-database.md)).

**Mirrors need to serve different content from each other.** That's not really what this mechanism is for - all mirrors serve the same game, synced from the same services server. If you need genuinely different content per audience, that's more of a [plugin](../04-Plugin%20Development/) or separate-deployment question than a client-mirror one.

Next: [Content Creation](../03-Content%20Creation/), or back to [Adding Game Servers](./adding-game-servers.md) if you haven't set up your game-server side yet.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
