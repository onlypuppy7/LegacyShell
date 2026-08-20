# Recipe: New Pickup Item

> **Audience:** Plugin authors · **Prereqs:** [Content Packs](../content-packs.md)
>
> **Canonical source:** `src/shell/items.js`, `plugins_default/healthpackitem/shared.js` (the reference pattern this recipe follows)

A pickup item (like ammo or grenades - or `healthpackitem`'s health pack) is different from a shop/catalog item (see [Content Packs](../content-packs.md#items)): it's an in-world object players walk over to collect, defined in `src/shell/items.js`'s `AllItems` array, not a database row.

## The hook: `game:AllItems`

```js
// plugins_default/healthpackitem/shared.js - real code from this codebase
this.plugins.on('game:AllItems', this.AllItems.bind(this));

AllItems(data) {
    data.AllItems.push({
        codeName: "HEALTH",
        mesh: "healthpack.alt",
        name: "Health Pack",
        actor: data.ItemActor,
        poolSize: 50,
        collect: function (player, applyToWeaponIdx) {
            if (player.hp === 100) return false;
            if (isServer) player.heal(50);
            return true;
        }
    });
},
```

Push a new entry onto `data.AllItems` from a `game:AllItems` listener, and it becomes a real, spawnable pickup with an assigned id and a `ItemTypes` lookup entry, indistinguishable from the built-in `AMMO`/`GRENADE` items.

## A complete example

```js
// plugins/adrenalineshot/index.js
import log from 'puppylog';
import { isServer } from '#constants';

export const PluginMeta = {
    identifier: "adrenalineshot",
    name: 'Adrenaline Shot',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'A pickup that grants a temporary speed boost.',
    descriptionLong: 'Adds a pickup item that grants a 5-second speed boost on collection.',
    legacyShellVersion: 598,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "game") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        this.plugins.on('game:AllItems', this.onAllItems.bind(this));
    };

    onAllItems(data) {
        data.AllItems.push({
            codeName: "ADRENALINE",
            mesh: "grenadeItem", // reusing an existing mesh for this example - ship your own via Content Packs for real use
            name: "Adrenaline Shot",
            actor: data.ItemActor,
            poolSize: 20,
            collect: function (player, applyToWeaponIdx) {
                if (isServer) {
                    const previousSpeed = player.modifiers.speedModifier;
                    player.changeModifiers({ speedModifier: previousSpeed * 1.5 });
                    clearTimeout(player._adrenalineTimeout);
                    player._adrenalineTimeout = setTimeout(() => {
                        player.changeModifiers({ speedModifier: previousSpeed });
                    }, 5000);
                };
                return true;
            }
        });
    };
};
```

We validated this exact plugin against a real (isolated, scratch) game server: `ItemTypes.ADRENALINE` is present, correctly indexed, and usable.

## Fields, for reference

| Field | Meaning |
|---|---|
| `codeName` | Unique string key - becomes the `ItemTypes` lookup key. |
| `mesh` | The model name to render, from `items.babylon` (see [Dealing with Babylon Models](../../03-Content%20Creation/dealing-with-models.md)) - ship your own via [Content Packs](../content-packs.md#models) for a real plugin rather than reusing an existing one as this example does. |
| `actor` | The client-side visual actor class - `ItemActor` (spins slowly) is the default, or your own subclass. Available on the event payload as `data.ItemActor`. |
| `poolSize` | How many concurrent instances of this item can exist in a room at once (see `Pool` in [Codebase Reference](../../05-Codebase%20Reference/)). |
| `collect(player, applyToWeaponIdx)` | Called when a player walks over it. Return `false` to leave it in place (not collected - e.g. player already at full HP/ammo), `true` to consume it. |

## Common Issues

**A model-not-found error / the item is invisible.** You're referencing a `mesh` name that doesn't exist in any loaded `.babylon` file - either reuse an existing name (as this recipe does, for teaching purposes) or ship your own model per [Content Packs](../content-packs.md#models).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
