# Recipe: Killstreaks

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](../events-concept.md), [Workers and State](../workers-and-state.md)
>
> **Canonical source:** `src/shell/player.js` (`die`, `hit`, `changeModifiers`), `server-game/src/rooms.js` (`getPlayerClient`, `notify`)

A complete, working plugin: consecutive kills without dying grant a temporary speed buff and a one-time notification, reset on death. This is the simplest realistic example of reacting to gameplay and changing a player's live stats - a good template for anything in the same shape (rewards, punishments, streak-gated unlocks).

## The event, and a real timing gotcha

`Player.die(firedId)` fires `game:onPlayerDeath` with `{ player, firedId }` (`player` is the victim, `firedId` is the killer's id, or `null`/absent for environmental deaths). This fires **before** the killer's own kill is scored - `hit()` calls `this.die(firedPlayerId)` first, then `firedPlayer.scoreKill(this)` immediately after. That means `Player` already has a `streak` field, incremented in `scoreKill`, but reading it inside an `onPlayerDeath` handler gets you the count *before* this kill - not including it.

Rather than relying on that ordering (fragile to depend on, and confusing to read), this recipe keeps its own counter. It's marginally more code, but it's obviously correct regardless of exactly when core code updates its own fields relative to the emit.

## The plugin

```js
// plugins/killstreaks/index.js
import log from 'puppylog';

export const PluginMeta = {
    identifier: "killstreaks",
    name: 'Killstreaks',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Rewards consecutive kills with a temporary speed buff.',
    descriptionLong: 'Tracks a per-player kill streak within each room; grants an escalating speed buff at set thresholds, reset on death.',
    legacyShellVersion: 598,
};

const TIERS = [
    { at: 3, speedModifier: 1.15, text: "is on a streak!" },
    { at: 5, speedModifier: 1.30, text: "is dominating!" },
    { at: 8, speedModifier: 1.50, text: "is UNSTOPPABLE!" },
];

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "game") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        // Map<playerId, streakCount> - one Map per room worker, see "Why this is room-scoped, and that's fine" below
        this.streaks = new Map();

        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
        this.plugins.on('game:disconnectClient', this.onDisconnect.bind(this));
    };

    onPlayerDeath(data) {
        const victim = data.player;
        const killerId = data.firedId;

        // the victim's own streak is over, regardless of who/what killed them
        this.streaks.set(victim.id, 0);

        // no killer (environment), or a suicide - nothing to reward
        if (killerId == null || killerId === victim.id) return;

        const [killerClient, killerPlayer] = victim.room.getPlayerClient(killerId);
        if (!killerClient || !killerPlayer) return; // killer already disconnected

        const streak = (this.streaks.get(killerId) || 0) + 1;
        this.streaks.set(killerId, streak);

        const tier = TIERS.find(t => t.at === streak);
        if (!tier) return; // only fires exactly on threshold kills, not every kill above it

        killerPlayer.changeModifiers({ speedModifier: tier.speedModifier });
        killerClient.notify(`${killerPlayer.name} ${tier.text}`, 4000);
    };

    onDisconnect(data) {
        this.streaks.delete(data.client?.player?.id);
    };
};
```

## Why this is room-scoped, and that's fine

`this.streaks` lives on the plugin instance, which (per [Workers and State](../workers-and-state.md)) is a genuinely separate object per room worker - so this Map is naturally scoped to one match, which is exactly the right scope for a killstreak (nobody expects a streak to carry across matches, let alone across other rooms entirely). If you wanted streaks to persist across a player's whole session (not just one room), that's a different, harder problem - see [Workers and State](../workers-and-state.md#getting-real-cross-room-or-persistent-state) for the options.

## Key APIs used

- **`victim.room`** - every `Player` holds a direct reference to its room (`this.room = this.client.room`, set at construction), so you don't need to separately track "which room is this player in."
- **`room.getPlayerClient(id)`** - resolves a numeric player id to `[client, player]`, or `[null, null]` if that id isn't currently in the room (handles the disconnected-mid-flight case cleanly).
- **`client.notify(text, timeoutTime)`** - sends a toast to exactly that one client. (`room.notify(text, timeoutTime)` - no target argument - broadcasts to the *whole room* instead; easy to reach for by mistake if you only skimmed the name.)
- **`player.changeModifiers({...})`** - merges fields into `player.modifiers`, read directly by the physics simulation every tick - the speed change takes effect immediately, authoritatively, server-side.

## A caveat worth knowing

`changeModifiers` here only runs server-side. The affected player's own client-side prediction doesn't know their speed just changed until the next state sync corrects it - in practice this is a very brief, usually unnoticeable discrepancy (a fraction of a second at most, at the game's ~10Hz full sync rate), but if you're building something where that gap actually matters, you'd want a matching client-side change too, following [Prediction and Authority](../prediction-and-authority.md).

## Validated

This plugin was loaded against a real (isolated, scratch) services + game server pair while writing this page, and boots with no errors - confirming the folder structure, imports, and event names are all correct as written. Triggering the actual reward requires live gameplay (two real players, one killing the other enough times) which is outside what can be automated in a docs validation pass - if you build this yourself, watch the game server's console and the killed/killer's in-game notification to confirm the tiers fire as expected.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
