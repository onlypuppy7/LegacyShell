# LegacyShell Documentation Plan

A staged plan to build out `wiki/docs/` (served at `/wiki/docs/`) into extensive documentation serving both humans (from complete newbie to core contributor) and AI agents.

This is a working document. Once Phase 0 lands it should graduate into the wiki itself as `wiki/docs/06-Contributing/roadmap.md` so human contributors can claim pages.

---

## 1. Where things stand

The wiki is VuePress 2, config at [wiki/.vuepress/config.js](wiki/.vuepress/config.js), three top-level sections:

| Section | Path | Purpose today | Pages |
|---|---|---|---|
| Wiki | `/wiki/` | Game lore, history, maps, competitions, characters | 12 |
| Plugins | `/plugins/` | Plugin list + per-plugin docs | 4 |
| **Documentation** | `/docs/` | **Technical docs for LegacyShell itself** | **2** |

`/docs/` currently contains only a two-line `README.md` and `dealingwithmodels.md`. That second page is genuinely excellent and sets the house style — it is the model to copy. Everything else about running, extending, or contributing to LegacyShell is undocumented.

### Constraints discovered in the VuePress config

These shape the file layout, so they're worth stating up front:

- **The sidebar is auto-generated** by `addFilesRecursively()` walking each section directory. No manual sidebar maintenance — creating a file *is* publishing it.
- **Order follows `fs.readdirSync`**, i.e. alphabetical. Numeric folder prefixes (`01-`, `02-`) are the only way to control section order.
- **Folder names render verbatim** in the sidebar (`text: item`), so `01-Getting Started` would display with the ugly `01-` visible. → *Phase 0 patches `config.js` to strip a leading `\d+[-_]` for display only.*
- **`README.md` is excluded from the sidebar** but still serves as the directory's landing page. Perfect for section index pages.
- **Dotfiles are filtered out** (`!item.startsWith('.')`), which gives us a place to put non-page assets inside the wiki tree.
- **Page titles come from the first `#` heading**, not the filename. Filenames only shape URLs — so use `lowercase-hyphenated.md`.
- **There is no `wiki/.vuepress/public/` yet.** Creating it gives us static-asset serving at the `/wiki/` root, which is where `llms.txt` needs to live.
- `sidebarDepth: 2`, `editLink: true` pointing at `onlypuppy7/LegacyShell`, search plugin already enabled.

---

## 2. Design principles

### 2.1 Tier by reader, not by topic

Someone setting up their first server and someone writing an anticheat plugin share almost no vocabulary. Six tiers, each a numbered directory, each with an explicit audience:

| Tier | Directory | Reader | Assumes |
|---|---|---|---|
| 1 | `01-Getting Started` | Total newbie, may not know what a terminal is | Nothing |
| 2 | `02-Running a Server` | Operator running a public/private instance | Tier 1 |
| 3 | `03-Content Creation` | Map/model/skin makers, semi-technical | Tier 1, no JS needed |
| 4 | `04-Plugin Development` | Developers extending the game | JS, Tier 2 |
| 5 | `05-Codebase Reference` | Core contributors and AI agents | Tier 4 |
| 6 | `06-Contributing` | Anyone submitting PRs or writing docs | — |

A reader should be able to stop at the end of any tier and have a complete, useful mental model.

### 2.2 Serve agents through precision, not a separate doc set

Maintaining parallel human/agent documentation would guarantee drift. Instead, the *same* pages serve both, with four additions that cost little and help agents enormously:

1. **A standard header block on every page** giving audience, prerequisites, and canonical source:
   ```markdown
   > **Audience:** Server operators · **Prereqs:** [Installation](../01-Getting%20Started/installation.md)
   > **Canonical source:** `server-services/src/ratelimit.js`
   ```
   Humans use it to know if they're in the right place. Agents use it to route, and to know which file to read when the docs and the code disagree.

2. **`llms.txt` at the wiki root** (`wiki/.vuepress/public/llms.txt`, served at `/wiki/llms.txt`) — the emerging convention for exposing a machine-readable site index. One line per page: URL, title, one-sentence description. Plus `llms-full.txt` concatenating the reference tier for single-fetch ingestion.

3. **Stable heading anchors.** Never renumber or reword a heading that something links to; reference pages get an explicit anchor convention so deep links survive.

4. **A dedicated orientation page** (`06-Contributing/for-ai-agents.md`) — the "read this first if you're an agent" page: repo layout, which docs are generated vs. hand-written, how to verify a claim, what not to trust.

### 2.3 AI-assistance disclaimer

Every hand-written page ends with a short, consistent footer disclosing AI involvement:

```markdown
---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
```

Applies to every page produced under this plan, including generated reference pages (where it sits below the `<!-- GENERATED -->` banner, not instead of it). Human contributors adding pages later aren't obligated to carry it forward for their own writing — it marks *this* documentation effort specifically, not a permanent site-wide convention. `06-Contributing/docs-style-guide.md` (Phase 0) records the exact wording so it stays consistent instead of getting reworded page to page.

### 2.4 Generate every reference table that can drift

This is the most important structural decision. While writing [CLAUDE.md](CLAUDE.md) I hand-compiled the plugin event catalog: **185 `plugins.emit()` call sites**. That table was accurate the day it was written and will silently rot. Five reference surfaces have the same problem, and all five are mechanically extractable:

| Generated page | Extracted from | Approx. rows |
|---|---|---|
| Plugin event reference | `plugins.emit(` call sites across all four trees | ~185 |
| Database schema | `initTables` DDL in `recordsManagement.js` | 8 tables |
| Config reference | `src/defaultconfig/*.yaml` (keys + their comments) | 8 files |
| Slash command reference | `newCommand({...})` calls in `permissions.js` | ~30 |
| Wire protocol opcodes | `Comm.Code` enum in `comm.js` | ~57 |

Phase 3 builds `src/scripts/gen-wiki-reference.js` to emit these as `.md` with `<!-- GENERATED — do not edit by hand -->` banners, wired to an npm script and ideally a CI check that fails when generated output differs from committed output. Hand-written prose *about* these systems lives in separate sibling pages that don't get overwritten.

### 2.5 Match the existing house style

`dealingwithmodels.md` establishes the voice and it's a good one: direct, opinionated, practical, unafraid to say a thing is bad ("Baking is completely USELESS and causes HUGE ISSUES"). Concrete conventions to carry forward:

- Lead with the problem the reader has, not with theory.
- Tables for anything enumerable.
- Screenshots for anything GUI, with `<img width="40%">` sizing.
- A **Common Issues** section at the bottom of any page describing a process that can fail.
- Real commands in fenced blocks, copy-pasteable, one per block.
- Name the version numbers and exact combinations that work.

---

## 3. Proposed structure

~60 pages. Bold = highest priority within its tier.

```
wiki/docs/
├── README.md                          ← rewritten as a "who are you?" router
│
├── 01-Getting Started/
│   ├── README.md                      Section index
│   ├── what-is-legacyshell.md         Three servers explained without jargon; what you actually need to run
│   ├── requirements.md                Node versions known-good, git, disk, OS notes
│   ├── installation.md                ★ Clone → npm install → npm run init, annotated
│   ├── first-run.md                   ★ npm run all, what each window means, localhost:13370
│   ├── config-files.md                Where configs live, defaultconfig vs store/config layering
│   ├── making-an-account.md           Register, then grant yourself admin (bridges into DB editing)
│   └── troubleshooting.md             ★ canvas/sharp build failures, ports in use, blank page, init not run
│
├── 02-Running a Server/
│   ├── README.md
│   ├── architecture-overview.md       ★ Services/game/client, who talks to whom, why services is singular
│   ├── the-database.md                ★ Opening the DB, the EDITABLE tags, don't-touch warnings
│   ├── users-and-ranks.md             ★ adminRoles, ranksEnum, granting admin, banning
│   ├── items-and-inventory.md         Granting items, egg balances, ownedItemIds
│   ├── codes.md                       Creating redemption codes, uses, used_by
│   ├── adding-game-servers.md         ★ game_servers rows, auth_key, multi-region
│   ├── client-mirrors.md              Running extra client servers, sync_server
│   ├── perpetual.md                   ★ Process manager: restarts, daily schedule, git pull, Discord webhooks
│   ├── backups.md                     Rotation, retention, restoring
│   ├── rate-limiting.md               regular/sensitive buckets, auth_key bypass
│   ├── moderation.md                  In-game commands, boot, room locking, cheats flag
│   ├── closed-mode.md                 Maintenance mode
│   ├── deployment.md                  Reverse proxy, ports, TLS, systemd/tmux, hardening notes
│   └── troubleshooting.md             Services unreachable, restart loops, desync
│
├── 03-Content Creation/
│   ├── README.md
│   ├── maps.md                        ★ In-game editor, map JSON format, adding to the pool
│   ├── dealing-with-models.md         ← EXISTING page, moved here unchanged
│   ├── map-blocks.md                  Adding collidable blocks via map.babylon
│   ├── items-and-skins.md             Item definition shape, IDs, offsets, pricing
│   ├── hats-and-stamps.md             Stamp spritesheet generation, UV mapping
│   ├── sounds.md                      Apollo/Howler, adding sounds
│   ├── gamemodes.md                   gameOptions, per-team modifiers, timed rounds
│   └── seasonal-events.md             EventManager date ranges, shop pools
│
├── 04-Plugin Development/
│   ├── README.md                      ★ Start here + "could this be a plugin?" philosophy
│   ├── quickstart.md                  ★ Working plugin in ten minutes
│   ├── anatomy.md                     ★ Folder contract, PluginMeta, Plugin class, _ to disable
│   ├── lifecycle.md                   ★ Load order, alphabetical sort, git auto-pull, server-type gating
│   ├── dependencies.md                dependencies.js, npm vs "plugin" deps
│   ├── events-concept.md              ★ on/emit, type prefixes, payloads, plugins.cancel
│   ├── Event Reference/               ← ALL GENERATED
│   │   ├── README.md                  How to read these; regeneration instructions
│   │   ├── services.md                ~26 events
│   │   ├── game-shared-logic.md       ~20 events (src/shell)
│   │   ├── game-rooms.md              ~70 events (rooms.js)
│   │   ├── game-clients.md            ~12 events (client.js)
│   │   ├── game-browser.md            ~35 events (in-browser bundle)
│   │   └── client-build.md            ~30 events (start-client, prepare-modified, stamps)
│   ├── commands.md                    ★ permissionsAfterSetup, newCommand, permission tuples, mentions
│   ├── client-side-code.md            ★ pluginSourceInsertion, insertion positions, isClient guard
│   ├── static-assets.md               express.static from onStartServer
│   ├── content-packs.md               Shipping items/maps/models from a plugin
│   ├── networking.md                  Comm.Add, packing, client/server packet pairs
│   ├── workers-and-state.md           ★ The worker-per-room isolation gotcha; wsrequest for cross-room state
│   ├── prediction-and-authority.md    executeClient vs executeServer; why both halves are mandatory
│   ├── Recipes/
│   │   ├── killstreaks.md             Simple: onPlayerDeath, modifiers, notify
│   │   ├── new-gamemode.md            GameTypesInit, gameOptions, round handling
│   │   ├── custom-weapon.md           Gun subclass, fire hooks, models
│   │   ├── new-pickup-item.md         AllItems, pooling, collect()
│   │   ├── ui-modification.md         Browser-side DOM/Babylon hooks
│   │   ├── discord-integration.md     Webhooks from packChat
│   │   └── replacing-core-behaviour.md plugins.cancel patterns for substituting a default behavior entirely
│   ├── publishing.md                  Git repo per plugin, versioning, listing it
│   └── pitfalls.md                    ★ Shared cancel flag, nonexistent events, worker state, blocking constructors
│
├── 05-Codebase Reference/
│   ├── README.md
│   ├── repo-layout.md                 ★ Directory-by-directory map
│   ├── shared-shell-layer.md          ★ src/shell, imports map, one-source-two-runtimes
│   ├── server-only-markers.md         ★ The (server-only-start/end) stripping mechanism
│   ├── the-ss-object.md               ★ What ss holds, who attaches what, when
│   ├── build-pipeline.md              ★ prepare-modified, placeholder splicing, minify, IIFE
│   ├── stamps-and-babylons.md         stampsGenerator, prepare-babylons, hashing/skip logic
│   ├── game-loop.md                   ★ 60Hz tick, state ring buffer, 10Hz sync, reconciliation
│   ├── rooms-and-workers.md           ★ Worker-per-room, warm spare, Comm.Worker relay protocol
│   ├── wire-protocol.md               Comm.Out/In packing; opcode table is generated
│   ├── Generated/
│   │   ├── comm-opcodes.md            GENERATED from comm.js
│   │   ├── database-schema.md         GENERATED from recordsManagement.js
│   │   ├── config-reference.md        GENERATED from src/defaultconfig/*.yaml
│   │   └── slash-commands.md          GENERATED from permissions.js
│   ├── services-internals.md          Command dispatch, auth, sessions, ratelimit, backups
│   ├── catalog-and-items.md           8-bit IDs, offset tables, tags, weekly shop rotation
│   ├── permissions-internals.md       PermissionsConstructor, Command class, rank checks
│   ├── physics-and-collision.md       Collider, voxel DDA raycast, projectiles
│   └── known-quirks.md                ★ Stale imports map entries, dead events, misnamed hooks
│
└── 06-Contributing/
    ├── README.md
    ├── conventions.md                 Code style, server-only markers, "could this be a plugin?"
    ├── docs-style-guide.md            ★ How to write pages here; the header block; tone
    ├── for-ai-agents.md               ★ Agent orientation: layout, generated vs hand-written, verification
    ├── generators.md                  How generated pages work, how to run them
    └── roadmap.md                     ← this plan, once it graduates
```

---

## 4. Phasing

Each phase is independently shippable and leaves the wiki better than it found it. Rough effort in focused working sessions.

### Phase 0 — Scaffolding (~1 session)
The plumbing everything else depends on.
- Patch `config.js` to strip `^\d+[-_]` from sidebar folder labels.
- Create tier directories, each with a `README.md` stub stating audience and contents.
- Rewrite `wiki/docs/README.md` as a router: "I want to play / run a server / make content / write a plugin / change the engine."
- Move `dealingwithmodels.md` → `03-Content Creation/dealing-with-models.md` (with its images).
- Write `06-Contributing/docs-style-guide.md` — defines the header block, tone, table conventions, filename rules. **Everything after this follows it.**
- Create `wiki/.vuepress/public/` and a stub `llms.txt`.
- Verify a local build: `npx vuepress build wiki`.

**Exit:** sidebar renders cleanly with empty tiers; style guide exists.

### Phase 1 — The newbie path (~2–3 sessions)
Highest immediate value: the current biggest barrier is that nothing tells a new user how to get running.
- All of `01-Getting Started`.
- From `02-Running a Server`: `architecture-overview.md`, `the-database.md`, `users-and-ranks.md`, `adding-game-servers.md`.
- **Validated on a clean clone**, on Windows and at least one unix-like, capturing every error hit along the way into `troubleshooting.md`. This is the part that must be tested, not just written.

**Exit:** a stranger can go from zero to a running local instance with an admin account, without asking for help.

### Phase 2 — Plugin development (~3–4 sessions)
The project's stated philosophy is that most features should be plugins, so this tier is what makes that philosophy actionable.
- `04-Plugin Development` hand-written pages (everything except `Event Reference/` and `Recipes/`).
- Port and expand what already exists in [CLAUDE.md](CLAUDE.md) — much of the conceptual material is written, it needs restructuring into teaching order rather than reference order.
- Two recipes to prove the docs work end to end.

**Exit:** someone who knows JS but not this codebase can ship a working plugin from the docs alone.

### Phase 3 — Generators + reference tier (~2 sessions)
- Build `src/scripts/gen-wiki-reference.js`, add `npm run gen-docs`.
- Emit all five generated surfaces.
- Add a CI check that regenerating produces no diff.
- Write `06-Contributing/generators.md` and `for-ai-agents.md`.
- Populate `llms.txt` / `llms-full.txt` from the now-stable page list.

**Exit:** reference tables are self-maintaining; agents have a machine-readable entry point.

### Phase 4 — Server operation + content creation (~2–3 sessions)
- Remainder of `02-Running a Server` (perpetual, backups, deployment, moderation, rate limiting, closed mode).
- All of `03-Content Creation`.

**Exit:** operating a real public instance is fully documented.

### Phase 5 — Codebase internals (~3–4 sessions)
- All hand-written pages in `05-Codebase Reference`.
- The deepest tier and the one that most benefits from being written *while* touching the relevant code.

**Exit:** a new core contributor (or agent) can make a correct change to the engine without reverse-engineering it first.

### Phase 6 — Cookbook + polish (ongoing)
- Remaining recipes.
- Screenshots and diagrams throughout — the architecture pages especially need one good diagram each.
- Cross-linking pass.
- Per-plugin docs under `/plugins/` for the bundled `plugins_default` set, linked from `listofplugins.md`.

---

## 5. Quality bar

Non-negotiables, since documentation that is confidently wrong is worse than none:

- **Every factual claim traceable to source.** Reference pages cite `file:line`. If a claim can't be traced, it doesn't ship.
- **Every command actually run before it's documented.** No plausible-looking-but-untested command lines.
- **Generated pages are never hand-edited.** Banner at the top of each.
- **Version-stamped where relevant.** Note the `versionEnum` a page was verified against, since the CI bumps it on every push to `main`.
- **Prefer linking over restating.** The root `README.md` already documents the DB table tags well; the wiki should link to and extend it, not duplicate it and drift.
- **Screenshots get alt text and explicit widths**, matching the existing page.
- **Every page carries the AI-assistance disclaimer footer** (§2.3). Checked as part of the same pass that verifies the header block, not a separate sweep.
- **Nothing gets committed or pushed as part of this effort.** All work under this plan stays as local, unstaged changes unless the user explicitly asks for a commit — same as everything else in this repo.

## 6. Open questions

1. **Should `CLAUDE.md` shrink once the wiki is populated?** It currently carries a lot of reference material that belongs in `05-Codebase Reference`. Options: keep both (drift risk), or thin `CLAUDE.md` to a navigational stub pointing into the wiki. Leaning toward the latter after Phase 5 — but only once the wiki content is proven.
2. **Should generated pages be committed, or built at wiki-build time?** Committing makes them browsable on GitHub and diffable in review; generating at build time can't drift. Recommend committing plus a CI drift check — best of both.
3. **How much Shell Shockers (upstream) documentation belongs here** versus in the `/wiki/` section? Suggest: mechanics that LegacyShell reimplements go in `/docs/`, historical/lore/trivia stays in `/wiki/`.
4. **Is `llms.txt` worth it given the wiki is usually served on localhost?** Probably yes for the public instance, and it costs almost nothing.
