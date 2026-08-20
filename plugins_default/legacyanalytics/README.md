# LegacyAnalytics

A services-side analytics plugin: logs gameplay/account activity into its own **separate** SQLite database (not `LegacyShellData.db`), and serves a small built-in web dashboard to chart it.

## Setup

Services-only - every other server role logs `"legacyanalytics db won't run on this server type"` and does nothing. On first boot it creates `plugins_default/legacyanalytics/store/LegacyShellAnalytics.db` (its own file, entirely separate from the main `server-services/store/LegacyShellData.db` - see [The Database](/wiki/docs/02-Running%20a%20Server/the-database.md)) and starts a dashboard web server on **port 663** (hardcoded, not configurable via any `.yaml`) - `http://<your-services-host>:663` once the plugin's loaded.

## What it actually logs

Listens broadly across services' own event catalog: kills, deaths, logins (success/fail, including token-based silent logins), registrations (success/fail), feedback submissions, shop purchases (success/fail), code redemptions (success/fail), VIP/token unlocks, and the periodic room/player-count snapshot each game server pushes up (`servicesInfoGame`).

**Worth knowing for operators**: several of these tables store more than aggregate counts - `player_registers`, `item_coderedeems`, and `player_vipredeems` all store the player's actual `account_id` and `username` tied to that specific action, and `player_feedbacks` stores the raw feedback text. If you're running a public instance and care about what's retained about individual accounts, read `analytics.js`'s `initTables()` directly rather than assuming everything here is purely aggregate.

## The dashboard

`GET /api/stats?range=<Nh|Nd|all>` returns time-bucketed series (kills, deaths, logins, registrations, purchases, redemptions, room counts) plus a handful of running totals and the last 100 feedback submissions - backing a small chart-based dashboard page served as static files from the plugin's own `dashboard/` folder.

## Notes

The dashboard has no authentication of its own - anyone who can reach port 663 can view it, including the raw feedback text. If you're exposing a services server beyond localhost, firewall this port separately rather than assuming it's covered by the same access control as the main services WebSocket port.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
