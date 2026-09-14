# Scouting optimization validation — 2026-09-14

Compared with traversal baseline `5f919b0` (the relevant production files were unchanged in `6eb7885`).

## Changes

- Defer expensive edge verification until its existing A* cost warrants exploring it. Only verified edges update the returned path; candidate coverage and simulation precision are unchanged.
- Cache exact geometry queries within one synchronous search, including null results and player scale. Restore the enclosing cache on nested calls and discard it between searches.
- Skip acceptance-only footing probes until the existing arrival position/height conditions match.
- No shared physics changes, map-specific behavior, reduced search limits, or off-thread work.

## Cold Shipyard checkpoint1 → checkpoint2

Three alternating fresh-room runs per version, without per-simulation profiling instrumentation:

| Metric | Baseline median | Candidate median | Reduction |
| --- | ---: | ---: | ---: |
| Scouting wall time | 9643 ms | 1674 ms | 5.76× |
| CPU time | 7234 ms | 1203 ms | 6.01× |

All six live traversals succeeded cleanly. These results are specific to this cold route, not a claim of a 6× gain on every map. The 10× CPU and sub-100 ms ordinary-search objectives remain open.

## Capability gates

Clean candidate: B 6/6, Hard 6/6, A 6/6, Shipyard 6/6, Mini 1/1, Jump 5/5, Ladder 5/5, Half 3/3, Maze 1/1, Diag 1/1, IntermediateAABB 4/4, PathMap 6/6 — **50/50**.

Castle: **1190/1190** algorithmic pairs connected; **34/35** first-try tour legs, all 35 eventually arrived. The same baseline recovery remains on 31→11 (jump 8,1,6→7,1,8).

Existing 60 local assertions passed. Added arrival-probe-cost checks (4 assertions) and a deferred-verification detour/state/edge contract test. The latter uses synthetic physics and supplements, rather than replaces, the live gates.

Authoritative scratch logs: `C:/Users/chalex0/AppData/Local/Temp/ls-deadinternet-clean-20260901/server-game/store/performance-clean.out.log` and `performance-clean-base.out.log`. Candidate full-roster runner exited 0. The additional broad baseline timing sweep was not used for the cold benchmark above.

Validated candidate source SHA256 before whitespace-only indentation at sync:

- pathfinding: `4181F6C45D806AC543480B2CF10B6BEF87D40F9F14D28E2CFE40F6ABCAAA06B2`
- physicsSimulation: `8C9778AD6CAEDCD7FF07FCC9EAD12110C5796F1F34C66AE65AE7B387BD800EFC`

Synced files matched these candidates after line-ending normalization; indentation cleanup was checked for identical Acorn tokens.
