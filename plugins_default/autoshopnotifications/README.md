# Auto Shop Notifications

Posts the weekly shop rotation to a Discord webhook once a week, as soon as a new rotation is computed - a public-facing message (item names/prices/tiers) and a separate, more detailed "dev" message (also reveals which tier-1 item got picked, and dumps every item currently in the shop) to a second webhook.

## Setup

Creates `store/autoshopnotifications.json` next to the plugin's own code on first boot, with:

| Key | Meaning |
|---|---|
| `webhook` | Discord webhook URL for the public announcement. Empty by default - the plugin logs a warning and skips sending until you set one. |
| `webhookdev` | A second webhook URL for the more detailed dev message. |
| `ping` | Text appended to the end of the public message (e.g. an `@role` mention) - defaults to `@ping`, a placeholder you'll want to replace. |
| `last` | Timestamp of the last successful send - used internally to make sure the weekly announcement only fires once per rotation, not on every server restart. Don't hand-edit this unless you want to force or suppress the next send. |

Depends on the `easy-table` npm package (`dependencies.js`) for formatting the item tables - auto-installed on first load if not already present, see [Dependencies](/wiki/docs/04-Plugin%20Development/dependencies.md).

## The pattern this plugin's storage code follows

This is the real, currently-shipping plugin the [Persistent Storage](/wiki/docs/04-Plugin%20Development/Recipes/persistent-storage.md) recipe was extracted from - its `getConfig()`/`saveConfig()` pair is the idiomatic way a LegacyShell plugin persists its own small JSON state across restarts, worth reading directly if the recipe's simplified version isn't enough.

## Notes

Hooks `services:setUpShopAvailableBeforeApply` (see [the weekly shop rotation algorithm](/wiki/docs/05-Codebase%20Reference/catalog-and-items.md#the-weekly-shop-rotation-algorithm-setupshopavailable)) - this only fires on the **services** server, so a game or client server instance loading this plugin does nothing (there's no explicit `plugins.type` guard for it, but the hook it listens for simply never fires anywhere else). Discord message text over 2000 characters is automatically split across multiple messages (`compress2kChars`) rather than truncated or rejected by Discord's own limit.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
