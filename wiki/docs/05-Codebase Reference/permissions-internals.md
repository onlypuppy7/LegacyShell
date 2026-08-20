# Permissions Internals

> **Audience:** Core contributors, AI agents · **Prereqs:** [Commands](../04-Plugin%20Development/commands.md)
>
> **Canonical source:** `src/shell/permissions.js`

The engineering detail underneath [Commands](../04-Plugin%20Development/commands.md) - `PermissionsConstructor`'s internals, exactly how a typed command gets from raw chat text to an authorized action.

## Where `ranksEnum` actually comes from

```js
constructor(room) {
    var permsConfig = isClient ? permissions : (this.room = room, ss.permissions);
    this.rankName = permsConfig.ranks;   // { 0: "Guest", 10: "Moderator", ... } from distributed_permissions.yaml
    this.ranksEnum = {};
    Object.keys(this.rankName).forEach(i => {
        this.ranksEnum[this.rankName[i]] = Number(i);   // inverted: { Guest: 0, Moderator: 10, ... }
    });
};
```

`ranksEnum` is built fresh, every time a `PermissionsConstructor` is instantiated (once per room, server-side - see [Rooms and Workers](./rooms-and-workers.md)), by inverting whatever rank-name-to-number mapping is currently configured - see [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md) for where that config actually lives and its default values. Client-side, the equivalent config comes from a baked-in global (`permissions`, injected into the bundle via the `LEGACYSHELLPERMSCONFIG` placeholder - see [Build Pipeline](./build-pipeline.md)) rather than reading `ss` (which doesn't exist client-side).

## Command dispatch: `inputCmd` → `parseCmd` → `Command.execute`

```js
inputCmd(player, text) {
    if (text.startsWith("/")) text = text.replace("/", "");
    var [category, text] = splitFirst(text, " ");
    var [name, text] = splitFirst(text, " ");
    return this.parseCmd(player, category, name, text);
};
parseCmd(player, category, name, opts) {
    const cmd = this.cmds[category]?.[name];
    return cmd ? cmd.execute(player, opts) : false;
};
```

`/room lock true` splits into `category = "room"`, `name = "lock"`, `opts = "true"` (the rest of the string, unparsed at this point). Lookup is a plain two-level object index (`this.cmds[category][name]`) - there's no fuzzy matching or autocomplete resolution happening in the dispatch path itself.

## Inside `Command.execute`

1. **Input coercion** based on `inputType[0]`: `"string"` passes through unchanged; `"bool"` lowercases and checks for a `f`/`0` prefix to decide false vs. true; `"number"` runs `formatNumber(opts, inputType)` (clamping to the declared `[min, max, step]`).
2. **`isCheat` gate**: if the command is cheat-tagged and the room's `gameOptions.cheatsEnabled` is falsy, execution is blocked regardless of rank, with feedback text pointing at `/room enableCheats true`.
3. **Permission check** (`checkPermissions`) - see [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md#how-permission-checks-actually-work) for the tuple semantics.
4. **Mention parsing** (`parseMentions`, only if permitted) - see below.
5. **Dispatch to the matching half**: `isClient ? this.executeClient(...) : this.executeServer(...)` - see [Prediction and Authority](../04-Plugin%20Development/prediction-and-authority.md) for why both halves matter.
6. On failure (cheats disabled, or insufficient permissions), feedback goes to the player via `addChat(...)` client-side or `player.client.commandFeedback(...)` server-side - two different delivery mechanisms for the same logical "tell the player why this didn't work" outcome.

## `parseMentions` - resolving `@` tokens

```js
export function parseMentions(parts, context, player) {
    var playersList = isClient ? players_by_id : context.room.players_by_id;
    var mePlayer = isClient ? me : (context.player || player);
    // for each "@..." token in parts:
    //   @m  -> [mePlayer]
    //   @a  -> playersList (everyone)
    //   @t  -> playersList filtered to mePlayer.team
    //   @o  -> playersList filtered to NOT mePlayer.team
    //   @username -> playersList filtered to matching username
};
```

Each resolved mention becomes its own array entry in the returned `mentions` list (so `@t @o` produces two separate group arrays, not one merged list) - a command handler iterating mentions needs to account for this shape (an array of arrays, not a flat player list) rather than assuming one mention token always means one player.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
