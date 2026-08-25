# Running a Server

> **Audience:** Operators running a public or private instance · **Prereqs:** [Getting Started](../01-Getting%20Started/)

This section covers actually operating a LegacyShell deployment: the database, user ranks, connecting multiple game servers, keeping it alive unattended, and moderating it once it's public.

## What's here

- **[Architecture overview](./architecture-overview.md)** - the services/game/client split, who talks to whom, why services must be singular.
- **[The database](./the-database.md)** - opening `LegacyShellData.db`, the EDITABLE/READONLY table tags, what not to touch by hand.
- **[Users and ranks](./users-and-ranks.md)** - `adminRoles`, granting yourself/others admin, banning.
- **[Adding game servers](./adding-game-servers.md)** - `game_servers` rows, `auth_key`, running more than one region.
- **[Client mirrors](./client-mirrors.md)** - running extra client servers pointed at one services instance.
- **[Hosting for someone else's instance](./hosting-for-another-instance.md)** - volunteering a mirror or game server to an instance you don't own.
- **[Perpetual](./perpetual.md)** - the process manager: crash restarts, daily restart schedule, auto git-pull, Discord webhook alerts.
- **[Backups](./backups.md)** - rotation and retention, how to restore one.
- **[Rate limiting](./rate-limiting.md)** - the regular/sensitive buckets and how `auth_key` bypasses them.
- **[Moderation](./moderation.md)** - in-game admin commands, booting players, locking rooms, the cheats flag.
- **[Closed mode](./closed-mode.md)** - taking the client server into maintenance mode.
- **[Deployment](./deployment.md)** - reverse proxy, ports, TLS, keeping it running long-term.
- **[Troubleshooting](./troubleshooting.md)** - services unreachable, restart loops, desync between servers.
- **Items and inventory, Codes** - granting items, redemption codes, `ownedItemIds`. *(Not yet written - see [The Database](./the-database.md) in the meantime for direct table access.)*

If you're extending gameplay rather than operating a server, you want [Plugin Development](../04-Plugin%20Development/) instead.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
