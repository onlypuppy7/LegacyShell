# Rooms and Workers

> **Audience:** Core contributors, AI agents · **Prereqs:** [Repo Layout](./repo-layout.md)
>
> **Canonical source:** `server-game/src/roomManager.js` (main thread), `server-game/src/worker.js` (worker entrypoint), `server-game/src/rooms.js` (room simulation)

The game server's most important structural fact: it doesn't simulate rooms on its main thread at all. Every room runs in its own dedicated `node:worker_threads` `Worker`, and the main thread's job is reduced to socket I/O and a thin relay.

## At a glance

<svg viewBox="0 0 780 350" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="max-width:100%;height:auto;font-family:system-ui,sans-serif" role="img" aria-label="Diagram: the main thread owns real player sockets and relays messages via postMessage into per-room worker threads, each running its own independent plugin load; workers reply with a small Comm.Worker command enum for the main thread to execute against the real sockets.">
  <defs>
    <marker id="rw-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
    </marker>
  </defs>

  <rect x="20" y="40" width="230" height="280" rx="8" fill="none" stroke="currentColor" stroke-width="2" />
  <text x="135" y="62" text-anchor="middle" font-size="13" font-weight="bold">Main thread</text>
  <text x="135" y="78" text-anchor="middle" font-size="11">(roomManager.js)</text>
  <text x="40" y="105" font-size="11">- Owns real player WebSockets</text>
  <text x="40" y="122" font-size="11">- searchRooms(): create / join</text>
  <text x="40" y="139" font-size="11">- Never simulates gameplay itself</text>
  <text x="40" y="163" font-size="11">- Rebinds a joined player's socket</text>
  <text x="40" y="180" font-size="11">  to postMessage into their room</text>
  <text x="40" y="204" font-size="11">- Handles worker.on('message'):</text>
  <text x="40" y="221" font-size="11">  switch(Comm.Worker enum)</text>
  <text x="40" y="238" font-size="11">  send / close / updateRoom /</text>
  <text x="40" y="255" font-size="11">  boot / closeAllWs / terminate</text>

  <rect x="330" y="40" width="230" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="445" y="60" text-anchor="middle" font-size="12" font-weight="bold">Spare worker (warm, idle)</text>
  <text x="445" y="76" text-anchor="middle" font-size="10">instantiateSS() + loadPlugins('game')</text>
  <text x="445" y="90" text-anchor="middle" font-size="10">already ran - waiting for createRoom</text>

  <rect x="330" y="140" width="230" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="445" y="162" text-anchor="middle" font-size="12" font-weight="bold">Room #1 worker</text>
  <text x="445" y="178" text-anchor="middle" font-size="10">own instantiateSS() +</text>
  <text x="445" y="191" text-anchor="middle" font-size="10">own loadPlugins('game') +</text>
  <text x="445" y="204" text-anchor="middle" font-size="10">own RoomConstructor</text>

  <rect x="330" y="250" width="230" height="80" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="445" y="272" text-anchor="middle" font-size="12" font-weight="bold">Room #2 worker</text>
  <text x="445" y="288" text-anchor="middle" font-size="10">own instantiateSS() +</text>
  <text x="445" y="301" text-anchor="middle" font-size="10">own loadPlugins('game') +</text>
  <text x="445" y="314" text-anchor="middle" font-size="10">own RoomConstructor</text>

  <line x1="250" y1="72" x2="328" y2="72" stroke="currentColor" stroke-width="1.5" marker-end="url(#rw-arrow)" />
  <text x="258" y="65" font-size="10">postMessage(setSS)</text>

  <line x1="250" y1="168" x2="328" y2="168" stroke="currentColor" stroke-width="1.5" marker-end="url(#rw-arrow)" />
  <text x="258" y="161" font-size="10">postMessage: createRoom / wsMessage</text>
  <line x1="328" y1="196" x2="250" y2="196" stroke="currentColor" stroke-width="1.5" marker-end="url(#rw-arrow)" />
  <text x="258" y="212" font-size="10">reply: Comm.Worker enum</text>

  <line x1="250" y1="278" x2="328" y2="278" stroke="currentColor" stroke-width="1.5" marker-end="url(#rw-arrow)" />
  <text x="258" y="271" font-size="10">postMessage: createRoom / wsMessage</text>
  <line x1="328" y1="306" x2="250" y2="306" stroke="currentColor" stroke-width="1.5" marker-end="url(#rw-arrow)" />
  <text x="258" y="322" font-size="10">reply: Comm.Worker enum</text>
</svg>

Every worker box - spare or claimed - independently ran the full boot sequence (`instantiateSS` + `loadPlugins('game')`) with zero shared state between them or with the main thread, as described below.

## The warm-spare-worker pattern

`RoomManager` keeps exactly one **spare** worker alive at all times, created proactively rather than on demand:

```js
async createRoomWorker() {
    this.roomWorker = new Worker(new URL('./worker.js', import.meta.url));
    this.roomWorker.postMessage(["setSS", {
        maps: ss.maps, items: ss.items, permissions: ss.permissions, config: ss.config,
    }]);
}

getRoomWorker() {
    const oldRoom = this.roomWorker;   // hand out the currently-warm one
    this.createRoomWorker();           // ...and immediately start spinning up its replacement
    return oldRoom;
};
```

`getRoomWorker()` is called exactly once, from `createRoom()`, every time a new room is actually needed. The effect: creating a room never pays worker-thread startup latency (module loading, plugin loading - see below) on the critical path, since there's always already a worker that finished that startup work sitting idle, waiting to be handed a room. The moment one spare gets claimed, a new one immediately starts warming up to replace it.

## Each worker independently re-runs the entire server boot sequence

`worker.js` is the actual script each thread runs, and it does **not** inherit anything from the main thread's own boot beyond what's explicitly passed via `postMessage`:

```js
(async () => {
    misc.instantiateSS(import.meta, process.argv);
    await plugins.loadPlugins('game');                          // full, independent plugin load
    const RoomConstructor = (await import('#rooms')).default;   // imported after, so plugins can patch it first
    parentPort.on('message', (msg) => { /* setSS / createRoom / joinPlayer / wsMessage / wsClose / exit */ });
})();
```

This means **every worker thread - including the spare one that's just sitting idle waiting for a room - has its own complete, independent set of plugin instances**, with no shared memory or state with the main thread's plugin instances, or with any other worker's. See [Workers and State](../04-Plugin%20Development/workers-and-state.md) for the plugin-author-facing consequences of this.

We confirmed this directly, empirically, while validating a plugin example: booting a game server with one simple plugin installed produces **two independent, complete "Loaded plugin" log lines**, milliseconds apart - one from the main thread's own `loadPlugins('game')` call (`run-game.js`), one from the spare worker's independent call inside `worker.js`. Once a real room is created, that room's worker produces a third, and so on, one per room.

## The main thread's actual job: routing, not simulating

Once `RoomConstructor` is instantiated inside a worker (on receiving a `"createRoom"` message), the worker owns everything about that room's gameplay. The main thread (`roomManager.js`) does three things:

1. **Room lookup/creation** (`searchRooms`) - handles create-private, join-private-by-id, and join-public flows, including a flat 10% chance of spinning up a new room even when a joinable one already exists, to spread players across different maps rather than funneling everyone into whichever room happened to exist first.
2. **Relaying raw player messages into the correct worker.** Once a player joins a room, `joinRoom` rebinds their socket's `message`/`close` handlers to `postMessage(["wsMessage"/"wsClose", content, wsId])` into that room's worker - from this point on, the main thread never inspects the message content, it's a dumb pipe.
3. **Executing outbound commands the worker can't do itself.** A worker can't touch a real WebSocket directly (sockets aren't transferable to worker threads the way this architecture uses them), so it posts back a small, fixed enum of commands instead - `Comm.Worker` (`src/shell/comm.js`):

```js
Worker: {
    send: 0,          // send a buffer to one client
    close: 1,          // close a client's connection
    updateRoom: 2,      // push updated room metadata to the main thread
    boot: 3,            // forcibly disconnect a client
    closeAllWs: 4,       // close every client in the room
    terminate: 5,        // the room is done; main thread should terminate this worker
},
```

The main thread's `worker.on('message', ...)` handler switches on this enum and performs the actual socket operation on the worker's behalf.

## `gameKey` is hardcoded to spell "LS" in base 36

`createRoom(info)` sets `info.gameKey = 784` unconditionally, with the original randomized version (`Math.getRandomInt(10, Math.pow(36, 2) - 10)`) left commented out directly above it. This looks like an arbitrary debug leftover, but it isn't: a room's shareable join code is built by rendering `gameId`/`gameKey` in base 36 (`(room.gameKey).toString(36)`, `roomManager.js:367`), and `(784).toString(36)` is `"ls"` - `784` is deliberately the base-36 encoding of `LS` ("LegacyShell"), so every room's join code ends in `LS` by design, not by accident. It does still remove real entropy from that portion of the code (every room's trailing two characters are now identical, where the commented-out version varied them across the full `36²` range) - worth knowing if you're relying on `gameKey` for anything that needs it to actually vary. See [Known Quirks](./known-quirks.md#roommanager-js-s-gamekey-is-hardcoded-to-spell-ls-in-base-36-not-random).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
