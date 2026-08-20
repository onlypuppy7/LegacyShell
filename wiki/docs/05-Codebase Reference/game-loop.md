# Game Loop

> **Audience:** Core contributors, AI agents · **Prereqs:** [Rooms and Workers](./rooms-and-workers.md)
>
> **Canonical source:** `src/shell/general/looper.js` (the scheduler), `server-game/src/rooms.js` (`updateLoop`)

The authoritative 60Hz simulation loop every room runs, and the reconciliation mechanism that keeps client prediction honest.

## At a glance

<svg viewBox="0 0 820 290" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="max-width:100%;height:auto;font-family:system-ui,sans-serif" role="img" aria-label="Diagram: updateLoop ticks at 60Hz, with every 6th tick also triggering a full-state sync at roughly 10Hz; three slower, independent loops (dataSyncLoop, metaLoop, updateRoomDetails/spawnItems) run on their own separate timers built on the same scheduler.">
  <text x="410" y="30" text-anchor="middle" font-size="13" font-weight="bold">updateLoop - 60Hz (TickStep &#8776; 16.67ms)</text>

  <line x1="60" y1="90" x2="760" y2="90" stroke="currentColor" stroke-width="1" opacity="0.5" />
  <g font-size="10">
    <!-- 13 ticks, every 6th (i=6,12) is a sync tick -->
    <line x1="60" y1="83" x2="60" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="115" y1="83" x2="115" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="170" y1="83" x2="170" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="225" y1="83" x2="225" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="280" y1="83" x2="280" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="335" y1="83" x2="335" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="390" y1="70" x2="390" y2="110" stroke="currentColor" stroke-width="2.5" />
    <circle cx="390" cy="70" r="3" fill="currentColor" />
    <line x1="445" y1="83" x2="445" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="500" y1="83" x2="500" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="555" y1="83" x2="555" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="610" y1="83" x2="610" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="665" y1="83" x2="665" y2="97" stroke="currentColor" stroke-width="1.5" />
    <line x1="720" y1="70" x2="720" y2="110" stroke="currentColor" stroke-width="2.5" />
    <circle cx="720" cy="70" r="3" fill="currentColor" />
  </g>
  <text x="60" y="120" font-size="10">tick 0</text>
  <text x="380" y="130" text-anchor="middle" font-size="10" font-weight="bold">sync() - tick 6</text>
  <text x="380" y="143" text-anchor="middle" font-size="10">full-state push, ~10Hz</text>
  <text x="700" y="130" text-anchor="middle" font-size="10" font-weight="bold">sync() - tick 12</text>
  <text x="700" y="143" text-anchor="middle" font-size="10">FramesBetweenSyncs = 6</text>

  <rect x="60" y="185" width="220" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="170" y="207" text-anchor="middle" font-size="12" font-weight="bold">dataSyncLoop</text>
  <text x="170" y="224" text-anchor="middle" font-size="10">every 1000ms</text>
  <text x="170" y="240" text-anchor="middle" font-size="9">less time-critical per-client data</text>

  <rect x="300" y="185" width="220" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="410" y="207" text-anchor="middle" font-size="12" font-weight="bold">metaLoop</text>
  <text x="410" y="224" text-anchor="middle" font-size="10">every 2000ms</text>
  <text x="410" y="240" text-anchor="middle" font-size="9">idle-kick, weather, empty-room destroy</text>

  <rect x="540" y="185" width="220" height="70" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="650" y="200" text-anchor="middle" font-size="11" font-weight="bold">updateRoomDetails /</text>
  <text x="650" y="214" text-anchor="middle" font-size="11" font-weight="bold">spawnItems</text>
  <text x="650" y="230" text-anchor="middle" font-size="10">every 30000ms</text>
  <text x="650" y="246" text-anchor="middle" font-size="9">metadata push + fallback spawning</text>

  <text x="410" y="280" text-anchor="middle" font-size="10" opacity="0.75">All five loops are independent timers built on the same createLoop scheduler - not phase-locked to each other.</text>
</svg>

## The scheduler: `createLoop`

`src/shell/general/looper.js` (its own comment: "lifted directly from RTW's server") implements a hybrid coarse/fine timer specifically to hit a target tick rate accurately without the memory-leak footgun of very short `setTimeout` intervals:

```js
export default function createLoop(update, tickLengthMs) {
    // ...
    let longwaitMs = Math.floor(tickLengthMs - 1);
    // ...
    let gameLoop = function () {
        let now = getMicro();
        if (now >= target) {
            let delta = now - prev;
            prev = now;
            target = now + tickLengthMicro;
            update(delta * micro2s);      // run user code, delta in seconds
        };

        let remainingInTick = target - getMicro();
        if (remainingInTick > longwaitMicro) {
            timeoutId = setTimeout(gameLoop, Math.max(longwaitMs, 16));  // coarse wait, floored at 16ms
        } else {
            setImmediate(gameLoop);        // fine-grained wait for the last stretch
        };
    };
    gameLoop();
    return { stop: () => { /* ... */ } };
};
```

The 16ms floor on the `setTimeout` branch is deliberate - the source comment is explicit that going below it causes a Node memory leak, so accuracy is traded for stability there; the remaining sub-16ms precision comes from the `setImmediate` fine-grained branch once the loop is close enough to its target time. `TickStep` (`1000 / ticksPerSecond`, `ticksPerSecond = fps = 60` - see `src/shell/constants.js`) is the default tick length if none is passed.

## What runs on which schedule

Each room sets up five independent loops on construction, all built on `createLoop`:

| Loop | Interval | Purpose |
|---|---|---|
| `updateLoop` | `TickStep` (~16.67ms, 60Hz) | The main simulation tick - see below. |
| `dataSyncLoop` | 1000ms | Less time-critical per-client data, kept off the main sync to reduce its payload size. |
| `metaLoop` | 2000ms | Idle-kick checks, weather triggers, empty-room destruction. |
| `updateRoomDetails` | 30000ms | Pushes room metadata back to the main thread. |
| `spawnItems` | 30000ms | Fallback/catch-up item spawning (items also spawn reactively, this is a periodic backstop). |

## Inside `updateLoop`: catch-up, replay, and prediction

```js
async updateLoop (delta) {
    var currentTimeStamp = Date.now();
    plugins.emit('roomUpdate', {this: this, delta, currentTimeStamp});

    while (this.lastTimeStamp < currentTimeStamp) {   // catch up if a previous tick ran long
        this.lastTimeStamp += TickStep;
        this.munitionsManager.update(1);

        await iteratePlayersAsync(async player => {
            plugins.emit('playerUpdate', {this: this, player, delta, currentTimeStamp});
            if (!player.client.isHuman) {
                await player.update(1);                                  // bots: just simulate
            } else if (player.stateIdx !== player.syncStateIdx) {
                while (player.stateIdx !== player.syncStateIdx) {        // replay buffered real input
                    plugins.emit('playerStateUpdate', {this: this, player, delta, currentTimeStamp});
                    await player.update(1);
                    player.resetPrediction();
                };
            } else {
                player.predictUpdate(1);                                 // no new input yet: keep predicting
            };
            player.incrementStatesUsed();
        });

        this.serverStateIdx = Math.mod(this.serverStateIdx + 1, stateBufferSize);
        if (this.serverStateIdx % FramesBetweenSyncs === 0) {
            await this.sync();          // ~10Hz (FramesBetweenSyncs = ceil(60/10) = 6), full-state push
        };
    };
};
```

Three things worth pulling out:

1. **The `while` loop is a catch-up mechanism, not a fixed one-tick-per-call assumption.** If the scheduler's callback fires late (the process was busy, GC paused, etc.), this processes as many simulation ticks as needed to bring `lastTimeStamp` back up to real time, rather than silently running slow. A room under heavy load falls behind in wall-clock terms per call, but the simulation itself doesn't skip ticks.
2. **Human players branch three ways**, not two: a bot always just simulates; a human player with buffered real input pending (`stateIdx !== syncStateIdx`) *replays* that input tick by tick (the authoritative reconciliation path); a human player with no new input yet runs `predictUpdate` (extrapolating forward) instead of stalling. This is the concrete mechanism behind the client-prediction pattern described throughout [Plugin Development](../04-Plugin%20Development/prediction-and-authority.md) - the server is doing its own version of "predict, then correct when real data arrives," not just trusting whatever the client last reported.
3. **Full-state sync happens every `FramesBetweenSyncs` ticks** (6, at the default 60Hz/10Hz ratio), gated by a modulo check on `serverStateIdx` - not its own separate timer, but derived from the same counter the state ring buffer uses.

## The state ring buffer

`stateBufferSize = 256` (see `src/shell/constants.js`) - at `TickStep` (~16.67ms) per entry, that's roughly **4.3 seconds** of buffered per-player state history, used for the replay/reconciliation described above. This lives on the `Player` object itself (`player.js`), shared by the exact same class running client-side (for local prediction) and server-side (for authoritative replay) - see [Shared Shell Layer](./shared-shell-layer.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
