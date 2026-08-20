# Player Count Notifications

Posts the current player count to a Discord webhook on a timer, tracking each day's highest public/private/total counts along the way. Game-server-only (`plugins.type !== "game"` skips everything else).

## Setup

Creates `store/playercountnotifications.json` on first boot:

| Key | Meaning |
|---|---|
| `webhooks` | Array of public-facing webhook URLs (a real total, no room detail). |
| `webhooksDev` | Array of dev webhook URLs - same message plus a full JSON dump of every active room (game code, mode, map, player count/limit, and player/usernames). |
| `sendInterval` | Seconds between posts. Defaults to `15` - much more frequent than [Auto Shop Notifications](/plugins_default/autoshopnotifications/README.md)' weekly cadence, since a player count is meant to feel close to live. |
| `last` | Last successful send timestamp, same bookkeeping role as in [Persistent Storage](/wiki/docs/04-Plugin%20Development/Recipes/persistent-storage.md). |

**Privacy note**: the dev webhook message includes real usernames per active room - same caveat as [LegacyAnalytics](/plugins_default/legacyanalytics/README.md), worth being deliberate about who has access to that webhook.

## Notes

If a configured webhook URL is empty, the plugin permanently stops trying to post to it for the rest of that process's lifetime (`this.giveup[webhook] = true`) rather than retrying every interval - fixing an empty URL in the config requires a restart to take effect, not just editing the file. Daily highs reset on a plain 24-hour timer from server start, not at actual local midnight. The source carries an honest `/* todo uh ... k bye */` wishlist comment (a server-naming feature, and posting game codes to the dev webhook, among the unfinished items) documenting known rough edges the author never got back to.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
