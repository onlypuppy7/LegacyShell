# Wiki Only Mode

Takes the game offline for players while keeping the wiki and services up: the site's front page (`/` and `/index.html`) is swapped for a "currently unavailable" notice, answered with a 503, and everything else - `/wiki`, the shared images that page uses, the services connection - carries on as normal. Useful for maintenance where the docs should stay readable.

This is different from core's [closed mode](/wiki/docs/02-Running%20a%20Server/closed-mode.md), which replaces the whole client site with `src/client-closed`.

## Turning it on

On the first client server boot it creates `plugins_default/wikionlymode/store/config.jsonc`:

```jsonc
{
    // enabled: whether wiki-only mode is currently active (swaps "/" for the unavailable page)
    // reason: which message to show - one of: none, offline, maintenance, emergency, update, migration (see reasons.js)
    "enabled": false,
    "reason": "maintenance"
}
```

Set `enabled` to `true`, pick a `reason`, and restart the client server - the file is read once, when the plugin loads. [LegacyAdmin](/plugins_default/legacyadmin/README.md)'s config editor lists plugin `store/` files too, so it can be flipped (and the client restarted) from the admin panel.

## Reasons

| `reason` | Title | Message |
|---|---|---|
| `none` | Currently Unavailable | We'll be back shortly. |
| `offline` | Offline for Now | The game is currently offline. |
| `maintenance` (default) | Under Maintenance | We're performing scheduled maintenance. Check back soon! |
| `emergency` | Emergency Fix In Progress | We've hit an issue and are working to get things back up as fast as we can. |
| `update` | Major Update In Progress | We're rolling out a big update - this won't take long! |
| `migration` | Migrating Servers | We're moving to new servers for a better experience. Thanks for your patience! |

Add your own in `reasons.js`; an unknown `reason` falls back to the default. The page itself is built by `unavailablePage.js`.

## How it works

It mounts one middleware on `client:onStartServer`, which fires before core's closed-mode gate and its own static mounts, so it sees every request first and only answers `/` and `/index.html`.
