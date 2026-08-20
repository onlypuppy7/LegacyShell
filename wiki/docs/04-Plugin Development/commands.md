# Commands

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](./events-concept.md)
>
> **Canonical source:** `src/shell/permissions.js` (`PermissionsConstructor`, `Command`)

LegacyShell's slash-command system (`/room lock true`, `/change speed 1.5`, etc.) isn't a separate plugin API - it's built entirely on the event mechanism from [Events (concept)](./events-concept.md), plus one method: `newCommand`. This is probably the single most common thing a new plugin actually does, so it gets its own page.

## The hook

`PermissionsConstructor` registers all of LegacyShell's ~20 built-in commands in its own constructor, then, as the very last thing it does, emits:

```js
plugins.emit('permissionsAfterSetup', { this: this });
```

That's your entry point. Register a listener for `game:permissionsAfterSetup`, and `data.this` gives you the live permissions instance for the current room (server-side) or the client-side equivalent (in the browser) - either way, it has a `newCommand` method and a `ranksEnum` lookup ready to use.

## Registering a command

The full, real example from `plugins_samples/sample1cmd/`:

```js
import { isClient } from "#constants";

export const samplePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;
        this.plugins.on('game:permissionsAfterSetup', this.registerSampleCommand.bind(this));
    },

    registerSampleCommand: function (data) {
        var ctx = data.this;

        ctx.newCommand({
            identifier: "sampletest",
            name: "test",
            category: "sample",
            description: "Test command.",
            example: "just run it",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => { },
            executeServer: ({ player, opts, mentions }) => {
                ctx.room.notify("You did it! Woohoo.", 5);
            }
        });
    },
};

if (isClient) samplePlugin.registerListeners(plugins);
```

Typed in-game, this becomes `/sample test`.

## `newCommand` options

| Field | What it does |
|---|---|
| `identifier` | Unique key for this command (used for lookup, not shown to players). |
| `name` | The subcommand name, e.g. `"test"` in `/sample test`. |
| `category` | The top-level group, e.g. `"sample"` in `/sample test`. |
| `description` | Shown in the in-game command list. |
| `example` | Shown as usage help. |
| `usage` | Optional - overrides the auto-generated usage string. |
| `autocomplete` | Optional autocomplete trigger character, e.g. `"@"`. |
| `mentionTypes` | Optional, defaults to `{player: true, group: true}` - restricts which `@mention` kinds this command accepts (see below). |
| `isCheat` | Optional, defaults to falsy - if true, additionally requires the room's `gameOptions.cheatsEnabled` flag, regardless of rank. |
| `warningText` | Optional extra text shown alongside the command. |
| `permissionLevel` | `[bypassRank, privateRoomRank, requireGameOwnerInPrivate]` - see [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md#how-permission-checks-actually-work) for the full explanation of this tuple. |
| `inputType` | `["string"]`, `["bool"]`, or `["number", min, max, step]` - governs both input parsing and the auto-generated usage text. |
| `executeClient` | `({ player, opts, mentions, mentionsLiteral }) => {...}` - runs immediately, client-side, for responsiveness. |
| `executeServer` | Same signature - runs when the server actually receives and validates the command. |

## Why both `executeClient` and `executeServer`

This mirrors the client-prediction pattern used throughout the shared game logic (see [Prediction and Authority](./prediction-and-authority.md) for the full treatment): a single `Command.execute()` call runs on both sides, but only invokes the half matching where it's currently running (`isClient ? this.executeClient(...) : this.executeServer(...)`). Client-side gives the player instant feedback; server-side is what's actually authoritative and gets sent to other players. **Only registering `executeServer`** means nothing visible happens until a round-trip to the server completes - fine for something that isn't latency-sensitive (like the sample above, which just posts a room notification), but noticeably laggy for anything a player expects to feel instant.

## `@mentions`

Commands that operate on other players parse `@`-prefixed tokens out of the raw input automatically, before your `executeClient`/`executeServer` runs - you receive the parsed result as `mentions` (and `mentionsLiteral`, the raw un-resolved text), not raw string parsing you have to do yourself. The built-in mention kinds:

| Token | Resolves to |
|---|---|
| `@a` | All players in the room. |
| `@t` | Your own team. |
| `@o` | The opposing team. |
| `@m` | Yourself. |
| `@username` | A specific player by name. |

Restrict which kinds a command accepts with `mentionTypes` - e.g. `{ group: true }` (seen on the built-in `speed` command) allows team/all/opposing-team mentions but not an individual `@username`, while the default `{player: true, group: true}` allows both.

## Common Issues

**My command doesn't do anything when typed.** Check you actually implemented the half that matters for what you're testing - if you only wrote `executeServer` and expected to see something happen the instant you hit enter, that's expected; the visible effect only appears once the server's response comes back. Also double check `category`/`name` don't collide with a built-in command (`change`, `admin`, `mod`, `room`, `rounds`, `time`, `weather` are all already taken categories).

**"Insufficient permissions" even though I think I should have access.** Re-check the `permissionLevel` tuple against your actual rank and whether you're testing in a public or private room - the private-room allowance never applies in public rooms, regardless of rank. See [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md).

Next: [Client-Side Code](./client-side-code.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
