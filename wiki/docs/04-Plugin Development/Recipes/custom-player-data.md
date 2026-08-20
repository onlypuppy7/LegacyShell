# Recipe: Custom Per-Player Data

> **Audience:** Plugin authors · **Prereqs:** [Workers and State](../workers-and-state.md)
>
> **Canonical source:** `server-game/src/client.js` (`clientInit`, `clientInitEnd`), `server-game/src/rooms.js` (`disconnectClient`)

Attaching your own state to a player - a combo counter, a cooldown timer, anything that needs to persist for as long as that player is in the room but shouldn't live anywhere more permanent than that. There's no dedicated "player data" API for this; you attach a plain property directly onto the live client object.

## Where to hook: `clientInitEnd`, not `clientInit`

Both fire during join, but at different points - `clientInit` fires **before** the client object has been populated:

```js
// server-game/src/client.js - real code
async initClient(room, info) {
    await plugins.emit('clientInit', { this: this, room, info });

    //
    this.session = info.session;
    await this.updateUserData();
    // ...this.uuid, this.username, this.account_id, this.id all get set after this point...
```

If you need `this.username`, `this.account_id`, or `this.session` to already be populated (e.g. to key your data by account rather than by transient in-room id), use `clientInitEnd` instead, which fires once construction has fully finished:

```js
// server-game/src/client.js - real code, end of initClient
this._resolveInit(this);

await plugins.emit('clientInitEnd', { this: this, room, info });
```

`clientInit` is still the right hook if all you need is "a player is joining" with no dependency on their resolved identity yet.

## The pattern

```js
// plugins/combocounter/index.js
import log from 'puppylog';

export const PluginMeta = {
    identifier: "combocounter",
    name: 'Combo Counter',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Tracks a per-player kill combo that resets on death.',
    descriptionLong: 'A minimal example of attaching custom state directly to a player/client object.',
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

        this.plugins.on('game:clientInitEnd', this.onClientInitEnd.bind(this));
        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
    };

    onClientInitEnd(data) {
        var client = data.this;
        client.comboData = { streak: 0 };   // just a plain property, namespaced under one object
    };

    onPlayerDeath(data) {
        var victim = data.player; // onPlayerDeath's "player" is the victim, not the killer - see Killstreaks
        if (victim.client.comboData) victim.client.comboData.streak = 0;

        if (data.firedId == null || data.firedId === victim.id) return; // environmental death or suicide

        var [killerClient] = victim.room.getPlayerClient(data.firedId);
        if (!killerClient || !killerClient.comboData) return; // killer already disconnected

        killerClient.comboData.streak++;
        killerClient.room.notify(`Combo: ${killerClient.comboData.streak}!`, 3);
    };
};
```

There's nothing more to it than that - `client.comboData` is a completely ordinary JS property. Namespacing everything under one object (`comboData`, not separate top-level properties directly on `client`) keeps your plugin's fields visually grouped and reduces the chance of colliding with a property name the core client object or another plugin already uses.

## Why this doesn't need cleanup, and why it doesn't survive a disconnect

A joined player's `ClientConstructor` instance is only referenced by the room that holds it - once `disconnectClient` (`server-game/src/rooms.js:497-498`) removes it from the room's player list and nothing else references it, the object (including whatever you attached to it) becomes eligible for normal JS garbage collection. You don't need to manually delete `client.comboData` on disconnect; there's no separate registry of "all player data" to clean up, because there never was one - the data always lived on the object whose lifetime already matches exactly what you want.

The flip side: this state is genuinely gone the moment the player disconnects. If a combo streak (or whatever you're tracking) needs to survive a reconnect, or be visible outside the single room worker the player is currently in, it has to live somewhere with a longer lifetime than the client object itself - see [Persistent Storage](./persistent-storage.md) for surviving a restart, or [Rewarding Players with Currency](./player-currency.md) for pushing something into services' actual account data instead.

## The worker-per-room caveat

Per [Workers and State](../workers-and-state.md), every room runs in its own independent worker thread with its own independent copy of your plugin - `client.comboData` set in one room's worker is invisible to every other room, and to the main thread. That's almost always exactly what you want for per-player-per-match state like a combo counter (it should reset between matches anyway), but it means this pattern **cannot** be used to track something across a player's multiple concurrent rooms, or across a room they left and rejoined as a fresh `ClientConstructor` instance - both of those need the persistent/services-backed approaches linked above instead.

## What we validated

Loaded against a real (isolated, scratch) game server, alongside [Persistent Storage](./persistent-storage.md) and [Rewarding Players with Currency](./player-currency.md)'s example plugins in the same boot: all three loaded cleanly together with zero errors, on both the main thread and the spare room worker, confirming the event names, folder structure, and imports as written. Triggering the actual combo logic requires live gameplay (two connected players, one killing the other), the same category of limitation as [Killstreaks](./killstreaks.md#validated) and [Discord Integration](./discord-integration.md#what-we-validated).

## Common Issues

**`client.comboData` is `undefined` somewhere in my code.** You're reading it before `clientInitEnd` has fired for that client - a bot or a very fast reconnect can hit edge timing here. Guard with `if (client.comboData)` rather than assuming it's always present, the same defensive check the example above already does.

**My data resets when I didn't expect it to.** Confirm you're not accidentally re-triggering `clientInitEnd` logic (it only fires once per join, but a player leaving and rejoining the same room creates an entirely new `ClientConstructor`, and therefore a fresh `comboData`) - see "why this doesn't survive a disconnect" above.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
