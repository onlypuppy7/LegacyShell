# Catalog and Items

> **Audience:** Core contributors, AI agents · **Prereqs:** [Items and Skins](../03-Content%20Creation/items-and-skins.md)
>
> **Canonical source:** `src/shell/catalog.js`

The engineering detail underneath the catalog/shop system - item ID encoding and the weekly shop-rotation algorithm. For the content-creator-facing item shape, see [Items and Skins](../03-Content%20Creation/items-and-skins.md).

## The "8-bit" item ID scheme - no longer actually 8-bit

`findItemBy8BitItemId`/`get8BitItemId` convert between a full database item ID and a compact per-class-and-slot index used on the wire (originally, in the real Shell Shockers protocol, small enough to fit in a single byte). The method's own comment admits this is no longer accurate: `//its not really 8bit any more` - LegacyShell's "limitless items" goal meant moving the offset bands from the original small ranges (`itemIdOffsetsByNameOLD`: `Hat: 1000`, `Stamp: 2000`, weapon families in the 3000s) to much larger ones (`itemIdOffsetsByName`: `Hat: 50000`, `Stamp: 100000`, weapon families spaced 50000 apart from 150000 to 350000) - see [Items and Skins](../03-Content%20Creation/items-and-skins.md) for the offset table plugin authors actually need. Both the old and new offset tables still exist side by side in `constants.js`, since default items (see the real `CSG1.js` example on that page) still use the old, small `id` values for backward compatibility, while `meta_id` is the new scheme.

The conversion is per-slot: a hat/stamp's wire ID is just `id8bit + offset[type]`; a primary weapon additionally factors in both a shared `base` offset and a per-class offset (`itemIdOffsets[Primary].base + itemIdOffsets[Primary][classIdx]`), since primary weapon skins are further split by character class.

## Tags: how items become "eligible" for something

Items carry a `tags` array (`item_data.tags`), and both the shop system and [Seasonal Events](../03-Content%20Creation/seasonal-events.md) reference items by tag rather than by hardcoded ID list - `getTaggedItems(tag)` resolves a tag to its matching items, and `convertMixedPoolToPurePool` normalizes a pool that might mix literal item IDs and tag strings into one deduplicated, concrete item list. This indirection is what lets a plugin's items participate in the existing seasonal rotation system just by carrying the right tag, with zero changes to `catalog.js` itself.

## The weekly shop rotation algorithm (`setUpShopAvailable`)

Runs on a deterministic weekly seed - `Math.seed` is set from `ss.servicesSeed` (a persistent random value, generated once and stored in the `flags` table - see [The `ss` Object](./the-ss-object.md)) combined with the timestamp of the most recent Monday, so the *same* week always produces the *same* rotation result if recomputed, but different weeks diverge:

1. Resolve currently-active [seasonal events](../03-Content%20Creation/seasonal-events.md) for this week and merge their `shop.{perm,temp,tier1pool,tier2pool,tier3pool}` pools into the base pools.
2. Compute `tier1chance` for the week - a seeded-random value with a deliberately lumpy distribution (`Math.seededRandomInt(0, 25)`, plus either `seededRandomInt(0, 75)` with 20% probability or `seededRandomInt(0, 20)` otherwise) rather than a flat percentage, so most weeks have a modest tier-1 chance but occasionally a week spikes much higher.
3. Probabilistically decide whether *any* tier-1 item appears this week at all (`Math.seededRandomChance(shop.tier1chance)`), and if so, pick one.
4. Pick `tier2count` items from `tier2pool` and `tier3count` from `tier3pool` unconditionally (these tiers always populate, only tier 1 is probabilistic).
5. Persist the result via `ss.runQuery(...)` inside a transaction, updating each selected item's `is_available` flag.
6. `setUpShopAvailableBeforeEventLoop`/`setUpShopAvailableBeforeApply` fire around steps 1 and 5 respectively - the plugin extension points for injecting custom pools or observing/adjusting the final selection before it's written.

Because the RNG is seeded from a value that's the same on every server sharing one `ss.servicesSeed` (which, for a distributed deployment, is generated once by services and never regenerated), every game/client server pointed at the same services instance computes an identical shop rotation independently, without needing to coordinate the result over the network - they're all just doing the same deterministic computation from the same inputs.

## `integrateItems` - merging plugin item packs into the live catalog

`integrateItems(items, newitems)` merges an additional item-definition set into the catalog object, keyed by class name - the in-memory counterpart to [Content Packs](../04-Plugin%20Development/content-packs.md)'s database-level `insertItems`, used when the catalog needs to reconcile newly-loaded items into its already-built `hats`/`stamps`/`forClass` lookup structures rather than rebuilding everything from scratch.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
