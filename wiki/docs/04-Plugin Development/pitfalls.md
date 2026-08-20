# Pitfalls

> **Audience:** Plugin authors · **Prereqs:** Everything else in this section
>
> **Canonical source:** `src/shell/plugins.js`

A condensed, skimmable list of the sharpest edges in the plugin API - things that fail quietly rather than loudly, or that only show up under specific conditions. Each links to the page with the full explanation.

## `plugins.cancel` is one flag, not scoped per-listener

If two plugins listen to the same event and only one means to suppress the default behavior, the other still sees whatever `plugins.cancel` was last set to by the time it runs - there's no per-listener isolation. Only set it when you specifically mean to override the default for that emit, and know that plugin load order (alphabetical by `PluginMeta.identifier`) decides which listener's decision "wins" if two disagree.
→ [Events (concept)](./events-concept.md#plugins-cancel-opting-out-of-default-behavior)

## Not every event name that sounds like it should exist, does

There's no typed/enforced event registry - `on(event, ...)` silently accepts any string, including one that's never actually emitted anywhere. A listener registered against a nonexistent event just never fires, with no warning that anything's wrong. Always cross-check an event name against an actual `plugins.emit(...)` call site before relying on it - see the [Event Reference](./Event%20Reference/) or grep the source directly (`grep -rn "plugins\.emit(" src/shell server-services server-game server-client`).
→ [Events (concept)](./events-concept.md)

## Room-worker plugin instances don't share state with the main thread, or each other

Your `Plugin` class is instantiated independently in the game server's main thread *and* separately inside every room's worker thread - these are different JS execution contexts with no shared memory. Storing what you think is "one global counter" on `this` inside a `game:`-targeting plugin actually gives you one separate copy per room. This is empirically confirmed, not theoretical - see the worked example.
→ [Workers and State](./workers-and-state.md)

## A slow or blocking constructor delays every plugin loaded after it

Plugin instantiation happens sequentially, awaited one at a time, in alphabetical order by identifier - not in parallel. A constructor that does slow synchronous work (or an unawaited-but-blocking operation) doesn't just slow down your own plugin's boot, it delays every plugin sorted after it too. Keep constructors fast; do slow setup (large file reads, network calls) asynchronously in the background rather than blocking the constructor itself where possible.
→ [Lifecycle](./lifecycle.md#what-loadplugins-type-actually-does)

## Content-pack items only persist if you hook the right event

`initTablesBefore` only ever fires on a genuinely empty items table (once, ever, on a fresh install) - a plugin relying on it alone for its own items will see them vanish after any database reset and never come back. Use `initTables` instead, which fires on every boot.
→ [Content Packs](./content-packs.md#items)

## Git auto-pull means every restart is a potential silent update

Any plugin folder that's a git repository gets `git pull`'d automatically on every server boot. If you're actively developing a plugin locally and it also happens to track a remote (yours or someone else's), an unexpected restart can pull in changes you didn't intend to test yet. Know what remote (if any) your working copy is tracking while developing.
→ [Lifecycle](./lifecycle.md#git-auto-pull-on-every-load)

## `beforebefore`/`before` client injection runs before most shared game modules exist

If your [client-side code](./client-side-code.md) injection references something like `Comm` or `catalog` at the top level (not inside a callback) and uses `position: 'before'` or `'beforebefore'`, it'll throw - those globals aren't defined that early in the built file. Either defer the reference inside a listener, or use `position: 'after'`.
→ [Client-Side Code](./client-side-code.md#the-three-insertion-positions)

## Forgetting `.bind(this)` on a listener

A very ordinary JavaScript footgun, but common enough in plugin code to call out: `this.plugins.on('game:someEvent', this.handler)` (without `.bind(this)`) means `this` inside `handler` won't be your plugin instance when it's called later - it'll be whatever `PluginManager.emit` happens to call it with. Every real example in this codebase uses `.bind(this)` (or an arrow function closing over the right scope) for exactly this reason.

## Only implementing one half of client/server logic

A command, weapon, or gameplay feature with only `executeServer`/an `isServer` branch works, but feels laggy (visible delay before anything happens on screen). One with only the client half isn't real - not authoritative, not visible to other players, trivially fakeable.
→ [Prediction and Authority](./prediction-and-authority.md)

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
