# Gamemodes

> **Audience:** Content creators, server operators · **Prereqs:** [Moderation](../02-Running%20a%20Server/moderation.md)
>
> **Canonical source:** `src/shell/gametypes.js`

What you can configure about gamemodes without writing any code - creating a genuinely new gamemode is a coding task, covered in [Plugin Development](../04-Plugin%20Development/) instead.

## Only two gamemodes are actually built into the base game

`gametypes.js` itself only defines **FFA** and **Teams**. Every other mode you'll see in a normal LegacyShell instance's mode dropdown (Timed variants, Scale Shift, Lifesteal, Apocalypse, Parkour, etc.) is added by a **plugin** hooking `game:GameTypesInit` - typically ones already bundled in `plugins_default/` on a standard install, not something baked into core. If you're trying to find where a specific mode "lives" in the codebase and it's not FFA or Teams, it's in a plugin, not `gametypes.js`.

## `mapPool` - why some maps don't show up for some modes

Every gamemode declares a `mapPool` name (`"FFA"`, `"Teams"`, or a custom one a plugin defines). A map is only offered for a gamemode if the map's own `modes` field (see [Maps](./maps.md)) marks it valid for that pool - this is why adding a new map sometimes means also checking its `modes` object includes every gamemode you want it playable in, not just exporting it from the editor and assuming it'll show up everywhere.

## Per-room settings (`gameOptions`)

The actual player/room-facing configurability - team toggles, item spawn rates, gravity/speed/damage modifiers per team, timed-round settings, weather - is the `gameOptions` object, adjustable per-room via slash commands rather than server-wide config. See [Moderation](../02-Running%20a%20Server/moderation.md#the-commands-you-ll-actually-use) and the [generated slash command reference](../05-Codebase%20Reference/Generated/slash-commands.md) for the full `change`/`room`/`rounds`/`weather` command list - these are the same commands a private-room owner uses to customize their own game (see [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md#how-permission-checks-actually-work) for why private rooms get more command access than public ones).

## Creating an actual new gamemode

This requires hooking `game:GameTypesInit` and is a coding task, not a config one - see [Events (concept)](../04-Plugin%20Development/events-concept.md) and the [Plugin Development](../04-Plugin%20Development/) section generally. A "New Gamemode" recipe is planned but not yet written - see [Recipes](../04-Plugin%20Development/Recipes/) for what's currently available.

Next: [Seasonal Events](./seasonal-events.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
