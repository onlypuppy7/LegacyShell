# Auto Restart Notifications

Warns players in-room before a scheduled daily server restart, at nine fixed checkpoints: 30, 15, 10, 5, and 1 minute before, then 30, 10, and 5 seconds before, and finally "Server is restarting now" at zero.

## Setup

Nothing to configure - the checkpoint list and messages are hardcoded in `initNotifies()`, not read from any config file.

## Only actually fires under `perpetual`, with daily restarts enabled

The timing this plugin reacts to (`ss.config.restartTime`) is only ever populated when the game server is polling a services instance that itself is running under [Perpetual](/wiki/docs/02-Running%20a%20Server/perpetual.md) with `perpetual_all.services.dailyrestart_enable` set - services computes the next scheduled restart time from `dailyrestart_time` and relays it down through the normal `requestConfig`/`servicesInfo` push. Run the game server directly (`npm run game`, no perpetual wrapper) or with daily restarts disabled, and `restartTime` stays unset - the checkpoint comparisons never match, and this plugin silently never notifies anyone. Not a bug to report; it's working as designed for a deployment that doesn't use scheduled restarts.

## Notes

Runs once per room, every `metaLoop` tick (2000ms - see [Game Loop](/wiki/docs/05-Codebase%20Reference/game-loop.md#what-runs-on-which-schedule)), and calls `room.notify(...)` (broadcasts to that room only) - a large deployment with many rooms means many independent, identical notifications firing in parallel, one per room, not one global announcement.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
