# Items and Skins

> **Audience:** Content creators, semi-technical · **Prereqs:** [Dealing with Babylon Models](./dealing-with-models.md)
>
> **Canonical source:** `src/shell/constants.js` (`ItemType`, `CharClass`), `server-services/src/items/*.js` (real examples)

Adding a new weapon skin, hat, or stamp to the shop - the catalog/inventory system, not to be confused with [pickup items](../04-Plugin%20Development/Recipes/new-pickup-item.md) (ammo/grenades/health packs, a completely separate in-world-collectible system covered in Plugin Development).

## Two ways to add one

- **Directly editing the database** - fine for a single server you run yourself, not distributed to anyone else. See [The Database](../02-Running%20a%20Server/the-database.md) for how to open it, or use the [web SQL tool](../02-Running%20a%20Server/the-database.md#the-built-in-web-sql-tool)'s `[items] Insert New Item` template.
- **Shipping it as a plugin** - the right approach if you want this distributed, reusable, or reinstalled automatically on every boot. See [Content Packs](../04-Plugin%20Development/content-packs.md#items) - this requires a small amount of JavaScript (a file exporting the item definitions), but no gameplay coding.

Either way, the item shape itself is identical - only how it gets into the database differs.

## The item shape

A real example (`server-services/src/items/CSG1.js`):

```js
{
    "meta_id": 0,
    "id": 3400,
    "name": "CSG1",
    "price": 0,
    "item_type_id": 3,
    "item_type_name": "Primary",
    "category_name": "Ranger Primary Weapons",
    "exclusive_for_class": 2,
    "item_data": { "class": "CSG1", "meshName": "gun_csg1", "tags": ["DefaultUnlocks"] },
    "is_available": false
}
```

| Field | What it means |
|---|---|
| `meta_id` | LegacyShell's own item numbering - see [Content Packs](../04-Plugin%20Development/content-packs.md#meta-id-ranges) for the range convention plugins should stay within. |
| `id` | The item's actual database/wire ID. For a **skin variant** of an existing weapon type, pick the next unused number in that weapon's existing range (see the table below) - for anything else, the simplest safe approach is checking the [generated database schema](../05-Codebase%20Reference/Generated/database-schema.md#items) and picking a number that doesn't collide with what's already in the `items` table. |
| `name` | Shown in the shop UI. |
| `price` | In eggs (the in-game currency). `0` for something unlocked by default rather than purchasable. |
| `item_type_id` / `item_type_name` | See the type table below - these must match each other. |
| `category_name` | A free-text shop category label (groups items in the UI). |
| `exclusive_for_class` | Restricts the item to one character class - see the class table below. Omit/leave unset for items available to every class. |
| `item_data` | A JSON blob: `class` (which weapon/hat/stamp family this is a skin of), `meshName` (the model to render - see [Dealing with Babylon Models](./dealing-with-models.md)), `tags` (string tags - `"DefaultUnlocks"` marks something every new account starts with; other tags are used by seasonal shop rotation logic). |
| `is_available` | Whether it currently shows up in the shop's rotating selection. Most items are `false` here and get toggled on/off by the shop-rotation algorithm rather than being permanently visible. |

## `item_type_id` / `item_type_name`

| `item_type_id` | `item_type_name` |
|---|---|
| `1` | `Hat` |
| `2` | `Stamp` |
| `3` | `Primary` |
| `4` | `Secondary` |

## `exclusive_for_class`

| Value | Class | Primary weapon family |
|---|---|---|
| `0` | Soldier | Eggk47 |
| `1` | Scrambler | Dozen Gauge |
| `2` | Ranger | CSG1 (Free Ranger) |
| `3` | Eggsploder | RPEGG |

Secondary weapon skins (Cluck9mm variants) and most hats/stamps are typically class-unrestricted - only set `exclusive_for_class` when the item genuinely should be locked to one class, as primary weapon skins usually are.

## Common Issues

**My item doesn't show up in the shop.** Check `is_available` - most items need the weekly shop-rotation algorithm to actually select them before they're purchasable, rather than being permanently visible. For something you want *always* available (not subject to rotation), check how similar always-available items in the existing catalog are configured rather than assuming a single flag controls this.

**The skin shows the wrong model, or no model at all.** `item_data.meshName` doesn't match an actual mesh name in the relevant `.babylon` file - see [Dealing with Babylon Models](./dealing-with-models.md) for the model files and their contents.

Next: [Hats and Stamps](./hats-and-stamps.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
