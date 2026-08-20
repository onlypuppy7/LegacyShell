# Event Reference

> **Audience:** Plugin authors, AI agents · **Prereqs:** [Events (concept)](../events-concept.md)

The complete, table-form list of every event LegacyShell emits — one page per subsystem, each row extracted directly from source (event name, exact `file:line`, payload shape) with a human-written "fires when" description.

## Pages

- **[`services:` events](./services.md)** — the services server's DB-seeding pipeline, auth flow, and command-boundary hooks.
- **[`game:` events — shared logic](./game-shared-logic.md)** — `src/shell/*.js`, fires from both the Node game server and the in-browser bundle.
- **[`game:` events — main-thread server process](./game-main-thread.md)** — `server-game/start-game.js`, `roomManager.js`.
- **[`game:` events — per-connection client object](./game-clients.md)** — `server-game/src/client.js`.
- **[`game:` events — room lifecycle & tick loop](./game-rooms.md)** — `server-game/src/rooms.js`, by far the largest single source of events in the codebase.
- **[`game:` events — in-browser gameplay](./game-browser.md)** — the hand-maintained browser game source and its map editor.
- **[`client:` events](./client-build.md)** — the client server and its build pipeline.

## How this stays accurate

These pages are **generated**, not hand-written — see the banner at the top of each one. `src/scripts/gen-wiki-reference.js` parses every `plugins.emit(...)` call site in the repo with a real JS parser (not regex), so the event name/location/payload columns can never silently drift from the actual code. The "fires when" column is the one part that's genuinely human-authored — it's pulled from `src/scripts/event-descriptions.json`, a small sidecar file mapping `file#eventName` to a one-sentence description; any event without an entry there renders as visibly undocumented rather than silently missing.

Regenerate after any change to `plugins.emit(...)` call sites or the events they cover:

```bash
npm run gen-docs
```

See [Generators](../../06-Contributing/generators.md) for the full mechanism, including the other four generated reference pages under [Codebase Reference](../../05-Codebase%20Reference/Generated/).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
