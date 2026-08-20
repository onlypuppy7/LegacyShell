# Config Files

> **Audience:** Total newbies · **Prereqs:** [Installation](./installation.md)
>
> **Canonical source:** `src/shell/general/misc.js` (`instantiateSS`), `src/defaultconfig/*.yaml`

## Where settings live

Two folders matter:

- **`src/defaultconfig/`** - the template defaults, checked into git. You never edit these directly.
- **`store/config/`** - your actual, personal settings, created by `npm run init` as a copy of the defaults (see [Installation](./installation.md)). This folder is *not* checked into git - it's yours, and it's safe to edit.

Every server merges `store/config/<file>.yaml` over `src/defaultconfig/<file>.yaml` at startup: anything you've changed in your copy wins, anything you haven't touched falls back to the shipped default. There's also a special `all.yaml` whose contents get merged into every server's top-level config, regardless of which role reads it.

You edit files in `store/config/`, then restart the affected server(s) for changes to take effect - config isn't hot-reloaded.

## The eight config files

| File | Affects | What's in it |
|---|---|---|
| `all.yaml` | All three servers | Just two global toggles: `verbose` and `devlogs` logging. |
| `services.yaml` | Services only | Port, password hashing cost, session lifetime, rate limits, backup schedule, feedback webhook. |
| `game.yaml` | Game only | Port, which services server to sync with, your `auth_key`. |
| `client.yaml` | Client only | Port, which services server to sync with, site URL, optional HTTP login gate. |
| `distributed_all.yaml` | All (via services) | Settings services pushes out to every connected server - see [Running a Server](../02-Running%20a%20Server/) for the distributed-deployment case. |
| `distributed_client.yaml` | Client (via services) | Client-specific settings pushed the same way. |
| `distributed_permissions.yaml` | Game (via services) | Rank names and numeric levels, and per-command permission overrides - see [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md). |
| `perpetual_all.yaml` | The process manager | Auto-restart schedule, git auto-pull, Discord webhook alerts - see [Perpetual](../02-Running%20a%20Server/perpetual.md). |

The "distributed" files are a bit different from the rest: they live in `store/config/` like everything else, but they're read by the **services** server and pushed out live to every game/client server that connects to it, rather than each server reading its own local copy in isolation. That's how a whole fleet of servers stays configured consistently from one place. For a single local instance this distinction doesn't matter much - just know that changing a `distributed_*.yaml` file only takes effect after **restarting services**, not just the server you'd naively expect.

## The two you'll touch first

**`store/config/all.yaml`** - the two logging toggles `npm run init` asked you about:

```yaml
verbose: false   # loads of more logs?
devlogs: false   # even more logs in the browser console
```

**`store/config/game.yaml`** - where your game server's identity lives:

```yaml
port: 13372
services_server: "ws://localhost:13371"
auth_key: "..."   # filled in automatically by npm run init, if you said yes to the auth-server prompt
```

If `npm run init` didn't fill in `auth_key` for you (you said no to that prompt, or ran init before setting up a database), see [Adding Game Servers](../02-Running%20a%20Server/adding-game-servers.md) to do it manually.

## Every setting is commented

Every default config file has an inline comment above each setting explaining what it does - `src/defaultconfig/*.yaml` is genuinely worth just reading through once, since it's the most up-to-date reference and this page deliberately doesn't repeat every single option here (to avoid this page silently going stale as new options get added).

Next: [Making an Account](./making-an-account.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
