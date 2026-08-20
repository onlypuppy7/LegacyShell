# Recipe: Rewarding Players with Currency

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](../events-concept.md)
>
> **Canonical source:** `server-game/src/client.js` (`addEggsViaServices`), `server-services/start-services.js` (`addEggs`)

Giving a player eggs (LegacyShell's in-game currency) from a game-server plugin - a custom kill bonus, an event reward, a command an admin can run. This is the exact same request the game server itself already makes for real kills, reused from plugin code.

## The existing, real call this recipe mirrors

`ClientConstructor.addEggsViaServices` (`server-game/src/client.js:682-692`) is what actually credits a player after a kill:

```js
// server-game/src/client.js - real code
async addEggsViaServices(eggAmount) {
    if (this.session && this.session.length > 0) {
        var response = await wsrequest({
            cmd: "addEggs",
            session: this.session,
            eggAmount,
        }, ss.config.game.services_server, ss.config.game.auth_key);

        this.sendUpdateBalance(response.currentBalance);
    };
};
```

`wsrequest` (`#wsrequest`, `src/shell/general/wsrequest.js`) opens a one-off authenticated WebSocket request to services and resolves with its JSON response - the same mechanism `requestConfig` polling uses (see [Architecture Overview](../../02-Running%20a%20Server/architecture-overview.md#how-they-find-each-other)), just for a single command instead of a poll loop. `services_server`/`auth_key` come straight from `game.yaml` (see [Adding Game Servers](../../02-Running%20a%20Server/adding-game-servers.md)) - the same credentials that authorize this game server to talk to services at all.

## The plugin

A command that rewards the calling player with a fixed number of eggs:

```js
// plugins/eggreward/index.js
import wsrequest from '#wsrequest';
import { ss } from '#misc';
import log from 'puppylog';

export const PluginMeta = {
    identifier: "eggreward",
    name: 'Egg Reward Command',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Adds a /reward eggs command.',
    descriptionLong: 'A minimal example of crediting a player with currency from a game-server plugin.',
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

        this.plugins.on('game:permissionsAfterSetup', this.onPermissionsAfterSetup.bind(this));
    };

    onPermissionsAfterSetup(data) {
        var ctx = data.this;

        ctx.newCommand({
            identifier: "rewardeggs",
            name: "reward",
            category: "reward",
            description: "Reward yourself 100 eggs.",
            permissionLevel: [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false],
            inputType: [],
            executeServer: async ({ player }) => {
                await this.rewardEggs(player.client, 100);
                ctx.room.notify("Rewarded 100 eggs!", 5);
            },
        });
    };

    async rewardEggs(client, eggAmount) {
        if (!client.session || client.session.length === 0) return; // guests have no session, nothing to credit
        var response = await wsrequest({
            cmd: "addEggs",
            session: client.session,
            eggAmount,
        }, ss.config.game.services_server, ss.config.game.auth_key);

        client.sendUpdateBalance(response.currentBalance);
        return response.currentBalance;
    };
};
```

See [Commands](../commands.md) for the full `newCommand` contract this uses - the `executeServer` shape and `permissionLevel` tuple aren't specific to this recipe.

## The guest check isn't optional

`client.session` is only set for a logged-in account (see [Making an Account](../../01-Getting%20Started/making-an-account.md)) - a guest player has no session at all. `addEggsViaServices` guards on `this.session && this.session.length > 0` before ever making the request, and this recipe copies that guard for the same reason: sending `session: undefined` to services would either fail the request or, worse, resolve against whatever `undefined` happens to coerce to - always check first rather than relying on services to reject a malformed request cleanly.

## `eggAmount` can be negative, and is scaled by the active multiplier

Services applies the request almost completely unvalidated - `server-services/start-services.js`'s `addEggs` handler does `userData.currentBalance += (msg.eggAmount * eggMultiplier)`. Two consequences: a negative `eggAmount` **deducts** currency (useful for a "buy" mechanic outside the normal shop flow, dangerous if a bug lets a player influence the value you send), and whatever number you pass gets multiplied by services' currently-active `eggMultiplier` (an event-driven global boost, separate from anything this recipe controls) - the amount a player actually receives may be more than what you requested.

## What we validated

Loaded against a real (isolated, scratch) services + game server pair: the plugin loads cleanly with no errors on both the main thread and the spare room worker, and the `/reward` command registers without throwing (confirming the `newCommand` call shape and `ranksEnum` usage are correct). We did **not** execute a full end-to-end request with a real logged-in player as part of writing this recipe - `addEggsViaServices` is the exact, currently-shipping code path this plugin reuses (same `cmd`, same `wsrequest` call shape, same config keys), so the actual credit-a-real-account flow rests on tracing that real call site rather than a fresh live test of it.

## Common Issues

**The command runs but nothing happens, no error either.** Confirm the calling player is actually logged in (guests never have a session, see above) and that `ss.config.game.auth_key` on this game server matches a row in services' `game_servers` table (see [Adding Game Servers](../../02-Running%20a%20Server/adding-game-servers.md)) - an unauthorized `auth_key` gets your request rejected by services' rate limiter rather than processed.

**Balance updates on the server but the player's UI doesn't refresh.** You skipped `client.sendUpdateBalance(response.currentBalance)` - services updating its own database doesn't push anything back to the browser by itself; the game server has to explicitly relay the new balance down to that client's own connection.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
