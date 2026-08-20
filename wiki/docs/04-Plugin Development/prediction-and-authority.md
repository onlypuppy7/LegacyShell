# Prediction and Authority

> **Audience:** Plugin authors · **Prereqs:** [Commands](./commands.md)
>
> **Canonical source:** `src/shell/player.js`, `src/shell/guns.js` (the pattern, throughout)

You've already seen this pattern once, in [Commands](./commands.md): a `Command` has both `executeClient` and `executeServer`, and only one runs depending on `isClient`. This isn't specific to commands - it's the core pattern the entire shared game-logic layer is built on, and understanding it is what separates a plugin that *feels* laggy from one that doesn't.

## Why both halves exist

LegacyShell (like the original Shell Shockers, and most real-time multiplayer games) uses **client-side prediction**: when you press a key or fire a weapon, your own screen updates *immediately*, without waiting for a server round-trip - because waiting for that round trip on every single input would make the game feel unbearably laggy, even on a good connection. The server, meanwhile, is the actual authority - it doesn't trust the client's prediction, it independently simulates the same thing and is what every *other* player's view of you is actually based on.

This means most nontrivial gameplay code needs to answer "what happens right now, on my own screen" and "what actually happened, authoritatively" separately - sometimes with genuinely different logic (the client doesn't need to validate a command's permissions server-side-style; the server doesn't need to update DOM/UI elements).

## The pattern in core code

You'll see `isClient`/`isServer` branches (from `#isClientServer` / `#constants`) inside the *same function body* throughout `src/shell/`, not split into separate files:

```js
// simplified, illustrative of the real pattern in player.js/guns.js
someGameplayMethod() {
    if (isClient) {
        // update locally immediately - visuals, UI, local physics
    };

    if (isServer) {
        // the authoritative version - validate, apply, broadcast to other players
    };
};
```

`player.js`'s core `update()` method, `guns.js`'s `fire()`, and `bullets.js`'s hit resolution all follow this - client does local prediction, server does authoritative resolution, and the client's local prediction gets silently corrected if it ever drifts from what the server says actually happened (via the state-buffer reconciliation described in [Codebase Reference](../05-Codebase%20Reference/game-loop.md)).

## Applying this to your own plugin

If you're adding something a player directly triggers (a command, a custom weapon behavior, a UI reaction to their own input), you generally want both halves:

- **`executeClient` / the `isClient` branch**: update whatever's visible immediately - don't wait for the server. This is what makes your feature feel as responsive as the base game.
- **`executeServer` / the `isServer` branch**: the actual source of truth - validate input, apply the real state change, and (if other players need to see it) broadcast it, the same way core gameplay code does.

If you only implement the server half, your feature works but feels laggy compared to everything else in the game (a visible delay before anything happens). If you only implement the client half, it's not real - it won't be authoritative, won't be visible to other players, and a determined player could trivially fake it since nothing server-side is actually checking or enforcing it.

## When you only need one half

Not everything needs both. A couple of legitimate exceptions:

- **Server-only effects with no client-predictable component** - e.g. a moderation action like `boot`, or anything that only makes sense as "the server decided this," has no meaningful client-side prediction to do.
- **Purely cosmetic, non-competitive client-side behavior** - a UI tweak, a sound effect, a visual flourish that never needs to be validated or seen by other players, doesn't need a server half at all, since there's nothing to cheat or desync.

The judgment call is whether the thing you're building affects gameplay other players experience (needs both) or is purely local/cosmetic (client-only is fine) or purely administrative (server-only is fine).

Next: [Publishing](./publishing.md), or skip ahead to the [Recipes](./Recipes/) for complete worked examples that apply this pattern end to end.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
