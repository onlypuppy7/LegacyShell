# Closed Mode

> **Audience:** Server operators · **Prereqs:** [Architecture Overview](./architecture-overview.md)
>
> **Canonical source:** `server-client/start-client.js` (local closed mode), `server-services/start-services.js` (distributed closed flag)

There are **two separate "closed" switches** in LegacyShell, easy to confuse, that do genuinely different things.

## Local: `client.yaml`'s `closed`

Set on one specific client server, in its own `store/config/client.yaml`:

```yaml
closed: true
```

This is purely a **presentation** switch for that one client mirror. When set, that client server serves only `src/client-closed` (a maintenance page) and redirects every route except `/closed` and `/discord` there - the actual game bundle is never built or served. This is local to that machine: if you're running multiple client mirrors, setting this on one doesn't affect the others, and it has no effect at all on the services or game servers - they keep running normally.

Use this for: taking one specific client mirror down for maintenance (a deploy, a config change) without affecting anyone hitting a different mirror or actual gameplay.

## Distributed: `distributed_all.yaml`'s `closed`

Set once, on the **services** server (in `store/config/distributed_all.yaml`), and pushed out to every connected game and client server:

```yaml
closed: true
```

Per its own config comment: "shuts down services/game and displays a closed message on the webpage." In practice, what this actually does is gate command processing on the **services** server - once set, services stops processing essentially all non-`requestConfig` commands (logins, purchases, kill/death recording, everything) server-wide, across the whole deployment.

::: warning This does *not* change what the client server shows visitors
Unlike the local `client.yaml` switch above, setting `distributed_all.closed` does **not** make any client server show a maintenance page - we checked directly, and nothing in `server-client`'s own code reads this flag for page-serving decisions. A visitor loading the game while this is set sees the completely normal game page and can attempt to play - they just find that logging in, registering, and other services-backed actions silently fail (services rejects the underlying command), which is a confusing experience if you were expecting a clear "we're closed" message the way the config comment implies. If you want visitors to actually *see* that the site is down, set the **local** `client.yaml` `closed` flag on your client server(s) too - the two switches are independent and you likely want both together for a real deployment-wide maintenance window.
:::

## Practical guidance

| You want to... | Set |
|---|---|
| Take one client mirror down (others keep working) | That mirror's `client.yaml` `closed: true` |
| Stop all gameplay/account activity deployment-wide | `distributed_all.yaml` `closed: true` on services |
| A real, visible, deployment-wide maintenance window | **Both** - the distributed flag to actually stop backend activity, and `closed: true` on every client mirror's own `client.yaml` so visitors see a maintenance page instead of a broken-looking game |

Restart the affected server(s) after changing either flag - neither is picked up live.

Next: [Deployment](./deployment.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
