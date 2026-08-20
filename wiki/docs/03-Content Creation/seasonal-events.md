# Seasonal Events

> **Audience:** Content creators · **Prereqs:** [Items and Skins](./items-and-skins.md)
>
> **Canonical source:** `src/shell/events.js` (`defaultEvents`)

How the shop's seasonal rotation actually decides what's available, and what you can hook into as a content creator without touching gameplay code.

## The date-range event system

`events.js` defines a list of named date ranges - a `start` (`"MM-DD"`), a `duration` (`"2w"`, `"13w"`, `"999w"` for the always-on default), and a `data.shop` block of item pools:

```js
{
    name: 'groundhog-day',
    start: "02-02",
    duration: "2w",
    data: {
        shop: {
            temp: ["GroundhogDay"],   // items tagged this way appear in the shop for these 2 weeks only
        }
    },
},
```

The shop pools per event:

| Pool | Meaning |
|---|---|
| `perm` | Item **tags** that should always be shop-available (not actually event-scoped - used by the always-on `_default` event). |
| `temp` | Item tags available only while this specific event is active. |
| `tier1pool` | One item chosen probabilistically from this pool each week (the "rare" gacha-style slot). |
| `tier2pool` / `tier2count` | A fixed number (`tier2count`, default `1`) of items always chosen from this pool each week. |
| `tier3pool` / `tier3count` | A fixed number (`tier3count`, default `5`) of items always chosen from this pool each week. |

## The actual connection point: item tags

Notice the pools are lists of **tags**, not item IDs directly - this is the same `item_data.tags` field from [Items and Skins](./items-and-skins.md#the-item-shape). Making an item participate in an existing event is entirely a content task, no coding required:

```json
"item_data": { "class": "...", "meshName": "...", "tags": ["GroundhogDay"] }
```

Tag an item `"GroundhogDay"` and it automatically becomes available in the shop for that event's 2-week window every year, without touching `events.js` at all.

## Adding a genuinely new event (not just tagging items into an existing one)

This means adding a new entry to `defaultEvents` itself - either by editing `src/shell/events.js` directly (a core-code change) or, the preferred approach per this project's philosophy, via a plugin hooking `game:eventsInit`/`services:eventsInit` to push a new event object into `data.events` at runtime. Either way this is a small coding task, not a pure content one - see [Plugin Development](../04-Plugin%20Development/) if you're doing this as a plugin.

## Common Issues

**My tagged item never appears in the shop.** Tags make an item *eligible*, not guaranteed - `perm`/`temp` tagged items still need the shop-rotation algorithm to actually select them for a given week (see [Items and Skins](./items-and-skins.md#common-issues) on `is_available`), and `tier1`/`tier2`/`tier3` pool items are chosen probabilistically/by count, not all-at-once.

**An event isn't activating on the date I expect.** Double-check `start` is genuinely `"MM-DD"` (no year) and `duration` is in the `Nw`/`Nd` (weeks/days) format matching the other entries - a malformed duration string won't necessarily error loudly.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
