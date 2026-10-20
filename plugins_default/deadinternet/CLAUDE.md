# CLAUDE.md — deadinternet pathfinding

Operational notes for iterating on `pathfinding.js`/`index.js`/`physicsSimulation.js`/`shared.js`.
For the API surface (`findPath`, `EDGE_TYPE`, `DeadInternetBot` methods) see `README.md` instead
— this file is about running and reading the tests, not the library itself.

## Things the map author has ruled out — don't re-assume these

- **Jump run-ups are basically never required.** Stated directly, repeatedly: jump reliability
  in this game is driven by the ANGLE of the jump and how close to the edge of the takeoff cell
  the player is standing when they jump — not by building up speed beforehand. Confirmed by
  direct hands-on testing: an entire multi-jump section that the bot's own `needsRunup` heuristic
  classifies as requiring a run-up (including jumps past its distance threshold) is fully
  achievable from a plain standstill jump. Treat any "needs a run-up" heuristic in this codebase
  as suspect, not settled fact — the author explicitly asked for the whole assumption to be
  tested for removal, not just tuned.
- **Never modify `src/shell/player.js` or other shared physics code to fix a pathfinding/bot
  issue.** Explicit, hard constraint — stated as "Changing the shared player physics code?
  Absolutely not." Every traversal problem so far has had a real fix reachable from this plugin's
  own code (`pathfinding.js`/`index.js`/`physicsSimulation.js`); if one seems to require touching
  shared physics, that's a signal to keep looking, not a reason to touch it.
- **No hardcoded, single-case fixes.** A fix scoped to match one specific map/edge/pattern isn't
  acceptable even if it "works" — every fix needs to be a general, principled correction to the
  underlying logic (candidate generation, cost model, execution state machine), verified against
  the full map roster, not a special-case carve-out for whatever was being debugged at the time.

## Test tooling

| Script | What it does | Needs a server? |
|---|---|---|
| `bench-pathfinding.js` | Real-geometry A* benchmark: boots a real room offline (real map, collider and bot player; no plugins loaded, so no `git pull`) and times `findPath` between spawn points. `--profile`, `--repeat N`, `--ab <module>` (compare full routes against another pathfinding module in-process), `--per-pair`, `--leak-test`. Run ONE map per process: module state leaks between rooms in the same process and changes routes. | No |
| `test-pathfinding.js` | Offline unit suite (synthetic maps, no physics). 21 assertions. | No |
| `test-client-registration.js` | Loads `shared.js` the way the browser bundle does and checks every command still registers (a ReferenceError there silently hides commands). | No |
| `test-commands.js` | Drives the real `/bots` and `/botsdebug field` handlers with a fake player: argument parsing, validation, listings (no spawning). | No |
| `test-perf.js` | The bot AI profiler (`perf.js`) and its hooks in the controller. | No |
| `test-path-economy.js` | `pathTo()`: route reuse, the search floor, backoff, goal snapping, partial routes, suspend/resume, and how the combat AI uses them. 37 assertions. | No |
| `test-geometry-store.js` | The on-disk pathfinding cache: round trip, stale/corrupt files, merging between rooms, gzip vs plain, autosave, and speed-keyed physics verdicts. 37 assertions. | No |
| `bench-checkpoints.js` | Headless `/botsdebug pathtestcheckpoints`: runs a map's parkour route on a virtual clock and prints per-leg results. `--plugin <dir>` runs older code (extract with `git show <rev>:<file>` into `store/versions/<name>/`) - THE way to check a change didn't break a route. Run it on the parkour maps before and after touching bot setup, `pathTo`, or physics. | No (boots a room - slow, one map per process) |
| `bench-lag.js` | Headless version of the browser stress test: a real room on a virtual clock, reports tick lag. `--plugin <dir>` runs a snapshot of older code. | No (but boots a room - slow, one scenario per process) |
| `bench-compare.js` | Runs `bench-lag.js` over several seeds for several configurations and prints one table (see README "Performance"). | No |
| `test-combat.js` | Offline unit suite for `combat.js` (mock players, synthetic map, seeded RNG). 299 assertions. | No |
| `test-checkpoints.js` | Drives `/botsdebug pathtestcheckpoints` against a real map's checkpoint route. | Yes |
| `test-allspawns.js` | Drives `/botsdebug pathtestall` — algorithmic all-pairs connectivity + a live full-spawn tour. Defaults to the `Castle` map (via `server-services/src/maps/Castle.json`, not this plugin's own `maps/`). | Yes |
| `test-ingame.js` | Drives `/botsdebug pathtest` — one bot wandering forever between random spawn points. Good for a quick smoke test on any map. | Yes |

```bash
node plugins_default/deadinternet/test-pathfinding.js

# checkpoint route test — TEST_MAP required, defaults to localhost:13372
TEST_MAP=PathShipyardTest node plugins_default/deadinternet/test-checkpoints.js [host] [port]
# isolate one leg instead of the full route:
TEST_MAP=PathShipyardTest node plugins_default/deadinternet/test-checkpoints.js [host] [port] checkpoint2 checkpoint3

node plugins_default/deadinternet/test-allspawns.js [host] [port] [maxLegs]
node plugins_default/deadinternet/test-ingame.js [host] [port]
```

The same things are also reachable directly in-game as slash commands (useful for one-off
probes without a script): `/botsdebug pathtestcheckpoints`, `/botsdebug pathtestall`, `/botsdebug pathtestpair <i> <j>`,
`/botsdebug pathtestraw <fromX fromY fromZ toX toY toZ>`, `/botsdebug pathtestme`. All are Admin-only,
non-cheat debug tools — see `shared.js` for the full list.

**Reading results**: these scripts don't parse server output themselves — the actual proof is
the **game server's own console log** (route plan, per-leg arrival/timeout, stuck/replan events).
Watch that log while a script runs, not just the script's own stdout.

## Iteration loop

1. Edit in a scratch copy of the repo (see "Scratch" below), not directly against a live main
   checkout you care about keeping stable.
2. `node --check <file>` + re-run `test-pathfinding.js` (21/21) after every change.
3. Restart the scratch `game` server, run the live checkpoint test(s) relevant to what changed.
4. Before syncing a fix back to main: re-run the **full map roster** below (offline suite +
   every checkpoint map + `test-allspawns.js` against Castle), not just the map you were working
   on — `pathfinding.js`/`physicsSimulation.js` are shared across every map.
5. `diff` the scratch file against main before copying over, to confirm no stray debug logging
   made it in.

## Maps (`maps/*.json`, all checkpoint-tagged: `checkpoint1..N` + `goal`)

| Map | Status |
|---|---|
| `PathShipyardTest` | 6/6 legs clean, including the end-to-end direct leg. |
| `PathJumpHardTest` | 6/6 legs clean. |
| `PathJumpTest` | 5/5 legs clean. |
| `PathLadderTest` | 5/5 legs clean. |
| `PathMapTest` | 5/6 — the end-to-end direct leg times out; confirmed present on unmodified `main` too, not a regression from anything in this plugin's recent changes. |
| `PathEasyParkourTestA` | Routing is correct and matches the manual recording's technique end to end (crate-hopping chain). Live execution still fails on the entry jump into the crate section — in progress. |
| `PathHalfTest` | 3/3 legs clean. |
| `PathMazeTest` | 1/1 leg clean (map only defines `checkpoint1` + `goal`). |
| `PathJumpDiagTest` | 1/1 leg clean (map only defines `checkpoint1` + `goal`). |
| `PathIntermediateAABBTest` | 1/1 leg clean, but only `checkpoint1`/`goal` actually load in a live room — the map file itself also defines `checkpoint2`/`checkpoint3`, which never showed up in `pathtestcheckpoints`' own checkpoint listing. Worth checking separately; not investigated. |
| `Castle` (not in this plugin's `maps/`, pulled from `server-services/src/maps/Castle.json`) | Algorithmic all-pairs: 1190/1190 connected. Live full-spawn tour: 35/35 legs arrive (most first-try; the rare stuck-and-replan still recovers within the same leg). |

## Manual recordings (`store/deadinternet/recordings/`)

`/botsdebug beginmanualrecording` captures a real player's own walk through a map's checkpoint route
(position/yaw/velocity/held controls, full tick resolution) and saves it here once the goal is
reached; `/botsdebug beginmanualrecording` again discards and restarts. These are a ground-truth
reference for what a working traversal actually looks like on a map the bot can't yet clear on
its own — decode `sampleColumns`/`samples` and cross-reference against the map's raw block data
when a route needs reverse-engineering, rather than only inferring intent from failed live
attempts.

Currently present: `PathEasyParkourTestA-*.json`, `PathJumpDiagTest-*.json`, `PathShipyardTest-*.json`.

## Scratch

Iterate against a scratch copy of the repo, not a main checkout you need to stay usable —
`services`/`game` restarts, port conflicts, and a mid-edit broken state are all expected during
this kind of work. A scratch instance typically lives under the OS temp directory (this session's
was `%LOCALAPPDATA%\Temp\ls-scratch2-<epoch>\`) with its own `store/config/*.yaml`; check that
copy's `game.yaml`/`services.yaml` for the actual ports in use (this session's scratch ran
services on `63371` and game on `63372`, vs. main's default `13371`/`13372` — don't assume either
port without checking). Each plugin folder — including a scratch copy's `deadinternet/` — must be
its own git repo with at least one commit, or the plugin loader silently skips it (see
`README.md`'s "Gotchas" section).

## Discord progress updates

When asked to report progress on this work to Discord, POST to the webhook with a JSON body of
`{"content": "..."}`:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"content": "your update text"}' \
  "https://discord.com/api/webhooks/1539940059690704967/OtjFsv2jwTZqkrBJPLhttVkY0xsUg1u7kQIepZaRsKzR2AzQxO4ydkdY9DYO6j3ZOPXm"
```

A successful post returns HTTP `204` with an empty body. `content` has a hard **2000-character**
limit — Discord rejects anything longer with a 400 and won't truncate it for you, so write the
update to a scratch file first, check its length, and trim before sending. Keep each update
factual and short: what changed, the regression-sweep result, what's still open — not a replay of
the debugging process.
