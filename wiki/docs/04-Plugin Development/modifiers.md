# Modifiers

> **Audience:** Plugin authors building gamemodes, moderators using in-game `change` commands · **Prereqs:** [Events (concept)](./events-concept.md)
>
> **Canonical source:** `src/shell/gametypes.js` (`defaultOptions`), `src/shell/player.js:176-193` (`setDefaultModifiers`), `src/shell/permissions.js:37-333` (the `change`-category commands)

Modifiers are the per-team numeric multipliers that make up most of what a gamemode actually *is* mechanically - speed, gravity, damage, and a dozen others. They're set two ways: baked into a `GameType`'s `options` at boot (the gamemode-authoring path), or changed live in a room via slash commands (the moderator path, `/gravity`, `/speed`, etc. - see the [generated slash command reference](../05-Codebase%20Reference/Generated/slash-commands.md) for the full list and permission levels). This page covers the mechanism underneath both.

## Shape: one array of three, per modifier, per team

Every modifier in `defaultOptions` is a 3-element array, indexed by team:

```js
// src/shell/gametypes.js:20-24 - real code
speedModifier: [
    1, //ffa
    1, //team1
    1, //team2
],
```

Index `0` is used for FFA (everyone's on "team 0" in a non-team gamemode), `1` and `2` are the two real teams in a Teams-enabled gamemode. A room's live values live at `room.gameOptions[key][team]`, seeded from `defaultOptions` and overridden per-`GameType` (see [Recipe: New Gamemode](./Recipes/new-gamemode.md) for a worked example that overrides `resistanceModifier` this way).

A player's own effective modifiers are copied out of `gameOptions` onto the player object once, in `setDefaultModifiers`:

```js
// src/shell/player.js:176-193 - real code (abridged)
setDefaultModifiers(init) {
    this.changeModifiers({
        gravityModifier: this.gameOptions.gravityModifier[this.team],
        speedModifier: this.gameOptions.speedModifier[this.team],
        // ...one line per modifier, same pattern
    }, init);
};
```

This is why changing a team's modifier live doesn't retroactively need every player object rebuilt - `changeModifiers` (below) pushes the new value onto already-joined players directly.

## The full catalog and exactly what each one does

Traced to its actual usage, not just its name:

| Modifier | Default | Effect | Where |
|---|---|---|---|
| `scale` | `1` | Multiplies outgoing damage dealt *and* divides incoming damage taken - a de facto "player size" stat, not purely cosmetic. | `bullets.js:115`, `player.js:1140` |
| `speedModifier` | `1` | Multiplies horizontal movement input. | `player.js:535-536` |
| `gravityModifier` | `1` | Multiplies downward acceleration. | `player.js:529` |
| `regenModifier` | `1` | Multiplies passive HP regen rate. | `player.js:367` |
| `damageModifier` | `1` | Multiplies damage *dealt* by this player's shots/explosions (attacker-side). | `bullets.js:52,115` |
| `resistanceModifier` | `1` | Divides damage *taken* by this player (defender-side) - the modifier [Recipe: New Gamemode](./Recipes/new-gamemode.md) sets to `0.01` for a one-hit-kill mode. | `player.js:1140` |
| `jumpBoostModifier` | `1` | Multiplies jump velocity. | `player.js:771` |
| `knockbackModifier` | `0` | Multiplies self-knockback taken from incoming damage - **off by default**, unlike every other combat modifier. | `player.js:1123` |
| `physicsSpeedModifier` | `1` | Multiplies the delta-time used for this player's own physics step and view bobble - a personal slow-motion/fast-forward dial. | `player.js:240,360` |
| `bulletSpeedModifier` | `1` | Multiplies bullet travel speed. | `bullets.js:128` |
| `reloadSpeedModifier` | `1` | Divides reload time (higher = faster reload). | `player.js:1003,1005` |
| `weaponSettleModifier` | `1` | Multiplies the delta-time used for weapon sway/settle animation. | `player.js:896` |
| `grenadeThrowModifier` | `1` | Multiplies throw power. | `player.js:1019` |
| `grenadeTimerModifier` | `1` | Divides the rate a grenade's fuse counts down (higher = longer fuse before detonation). | `bullets.js:366` |
| `grenadeBounceModifier` | `1` | Multiplies bounce impulse off surfaces. | `bullets.js:380` |

Two more team-indexed arrays exist alongside the modifiers but aren't named `*Modifier`: `lifesteal` (defaults `0`) and `scale`'s sibling `itemsEnabled`/`teamSwitchMaximumDifference` are plain `defaultOptions` entries, not per-modifier multipliers - see `gametypes.js` directly if you need those.

## Setting modifiers from a gamemode plugin

At `GameTypesInit` time, before any room exists - this is baked into every room of that gamemode from creation:

```js
// pattern from Recipe: New Gamemode - real code
this.plugins.on('game:GameTypesInit', ({ GameTypes }) => {
    GameTypes.push({
        shortName: "Sudden Death",
        longName: "Sudden Death",
        codeName: "suddendeath",
        mapPool: "FFA",
        options: {
            resistanceModifier: [0.01, 0.01, 0.01],   // [ffa, team1, team2]
        },
    });
});
```

`options` only needs to list what differs from `defaultOptions` - everything else deep-merges in automatically (see [Recipe: New Gamemode](./Recipes/new-gamemode.md#the-plugin) for the full mechanism).

## Setting modifiers live, at runtime

This is what every `change`-category slash command does, and it's available to your own commands too via `setGameOptionInMentions` (server-side, authoritative) paired with `changeModifiers` (client-side, predicted) - see [Prediction and Authority](./prediction-and-authority.md) for why both halves exist:

```js
// pattern from src/shell/permissions.js:37-56 - real code, abridged
executeClient: ({ player, opts, mentions }) => {
    forEachMentionInMentions(mentions, (player) => {
        player.changeModifiers({ gravityModifier: opts });
    });
},
executeServer: ({ player, opts, mentions, mentionsLiteral }) => {
    setGameOptionInMentions(player, mentions, mentionsLiteral, "gravityModifier", opts);
}
```

`setGameOptionInMentions` (`permissions.js:963`) understands three scope literals, checked against the command's `@mention`:

| Mention | Effect |
|---|---|
| `@a` | Sets the value for **all three** team slots at once - the modifier applies room-wide regardless of team. |
| `@t` | Sets only the sender's own team's slot. |
| `@o` | Sets only the *opposing* team's slot - the asymmetric case (e.g. handicapping one side). |

Any other mention resolves to specific players via `forEachMentionInMentions` and calls `changeModifiers` on each one directly, bypassing `gameOptions` entirely - a per-player override that doesn't touch the team-wide default, and so doesn't persist for players who join after the command runs (`setDefaultModifiers` would just re-seed them from the unchanged `gameOptions`).

## Common Issues

**I set a modifier via `GameTypesInit` but it's not taking effect.** Check you're mutating `options`, not `defaultOptions` directly - editing `defaultOptions` in place changes the value for *every* gamemode, including the built-in ones, since they all deep-merge from the same object.

**A per-player override I applied with a specific `@mention` disappeared after they respawned or reconnected.** Expected - a targeted-player override lives only on that player object, not in `room.gameOptions`. Use `@a`/`@t`/`@o` instead if you want the change to persist for anyone who joins or respawns afterward.

**`knockbackModifier` seems to do nothing by default.** It's the one modifier that defaults to `0`, not `1` - knockback-on-hit is opt-in, not a baseline effect scaled by `1`.

Next: [Recipe: New Gamemode](./Recipes/new-gamemode.md) for a complete worked example, or [Commands](./commands.md) for building your own `change`-style command from scratch.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
