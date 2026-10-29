# Development Timeline

> **Audience:** Anyone curious how this codebase actually came to exist · **Prereqs:** None
>
> **Sources:** `git log` across all branches/tags, `package.json`, `versionEnum.txt`, and three files that already live in this repo's game-lore section - [`wiki/wiki/History/updatestimeline.md`](../../wiki/History/updatestimeline.html), [`wiki/wiki/LegacyShell/release.md`](../../wiki/LegacyShell/release.html), and [`wiki/wiki/LegacyShell/Competitions/jan2025mapcomp.md`](../../wiki/LegacyShell/Competitions/jan2025mapcomp.html)

Every date and quote below is checked against a real commit hash, tag, or a file that still exists in this repo - run `git show <hash>` yourself if you want to verify one. This isn't a changelog; it's what the commit messages, the branch history, and a few things the project's own contributors already wrote down say actually happened.

## Prehistory: figuring out which Shell Shockers to rebuild (2017-2019, researched 2024)

Before any of LegacyShell's own code existed, someone had to work out *exactly* which historical version of the real `shellshock.io` to target. That research still lives in this repo, in the game-lore section: [`updatestimeline.md`](../../wiki/History/updatestimeline.html) is a version-by-version reconstruction of real Shell Shockers's history from its first public release ([1 Sept 2017](https://www.facebook.com/ShellShockersGame/posts/pfbid02JUuPT6ou8bPt89FnNVofDKn5ZtTGMtTqtPvcL82wQX7QpopsSfrN1PZtG51KCc78l)) onward, built from Wayback Machine snapshots, Facebook changelog posts, and dated YouTube footage - credited at the bottom to "onlypuppy7 (also known as francio)" - LegacyShell's own creator, researching under a second name.

That research is why the game freezes at **0.17.0** specifically: the doc pins the real 0.17.0 to [6-9 Feb 2019](https://web.archive.org/web/20190206144455/https://shellshock.io/), and the very first commit of this repo (`8642b38`, 9 Aug 2024) contains a copy of the client with `<script>var version = '0.17.0';</script>` already baked in - the reverse-engineering didn't start from "whatever's live today," it started from a specific, deliberately-identified historical snapshot. The companion doc [`significantchanges.md`](../../wiki/History/significantchanges.html) goes further, tracking gameplay/UI/model changes across the real game's *entire* lifespan (into 2023) to make sure the 0.17.0 reconstruction is faithful to what came immediately before and after it, not just an isolated guess.

## Genesis: 9-13 August 2024

The repo's actual first commit (`d7aaff8`/`8642b38`, both 9 Aug 2024) already contains this README, word for word:

> Remake of Shell Shocker's web servers, for a classic version. Then, maybe even extending it.

That's the entire founding mission statement, and it's held up. Four things worth knowing about the first few days:

- The project didn't start from an empty template - it started from one that had **Firebase and OneSignal wired in**, both ripped out almost immediately (`1a0c319`, 13 Aug: "removing firebase bloat, and also onesignal"), the same day the custom auth system was born (`a75476f`, same day: "custom login prompt, start of services server"). The services/game/client three-role split traces back to this moment.
- The `ss` global context object - documented today as the backbone every server module attaches state to - was born on day two (`ebbef99`, 11 Aug: "yep, switching to an ss object kekek").
- Early commit messages are refreshingly honest about their own state: `3333ed8`/`5f3da6d` "more stuff (borked)", `b245e2f`/`56a39d5` "scheisse", `13acb9a`/`4e25b15` "rid it".
- Version tags started immediately, before there was much to tag: `v0.0.1-alpha` (17 Aug, "change version formatting"), `v0.0.2-alpha` (22 Aug, "ok"), `v0.0.3-alpha` (4 Oct, "sorry"), `v0.0.4-alpha` (17 Nov). Manual tagging like this ran alongside, then was superseded by, the automatic `versionEnum.txt` counter (see below).

## The founding sprint: August-December 2024

Commit volume by month tells its own story - this is every commit on `main`, by calendar month:

| Month | Commits |
|---|---|
| 2024-08 | 62 |
| 2024-09 | 49 |
| 2024-10 | **478** |
| 2024-11 | 297 |
| 2024-12 | 179 |

October 2024 is, by a wide margin, the most intense month this project has ever had. What actually happened in it:

- **The map editor** (`6774801`, 14 Sept - just before the October spike) and a full reorganization of the client's giant `shellshock.min.js` (`5143ad2`, 2 Oct: "at last fully rearrange shellshock js").
- **CI-driven versioning** (`d3871f5`, 7 Oct: "Create main.yml") and **per-room worker threads**, born and working within about 24 hours of each other (`198431d`, 7 Oct: "start worker stuff (sad)"; `33ce9fc`, 8 Oct: "multithreaded now with workers!").
- **The permissions/commands system** (`5c5f61a`, 17 Oct: "permissions/cmds (wip)"; `2a4769f`, 19 Oct: "op command system").
- **Apollo**, the hand-rolled Howler.js audio wrapper still in use today, built on its own branch: `codename-apollon` was created 23 Oct ("Apollo bases, all WIP. Don't complain!") and merged back to `main` through nine separate PRs (#17-#27) over about three weeks, wrapping up 10 Dec with a commit literally titled `[APOLLO] I couldn't take it anymore`.
- **The wiki itself** started as plain markdown files in `wiki/` (first page 15 Oct: "new wiki page, more accurate classic maps") and migrated wholesale to VuePress on 7 Nov (`5433e6e`, "wip wiki" - 36 files, +1903/-4 lines in one commit). The two historical-research docs from the Prehistory section above were part of that migration, relocated (not lost) into what's now `wiki/wiki/History/`.
- **The plugin system**, the architecture this entire codebase now organizes around, didn't exist until the very end of October: `7cfd076` (30 Oct, "plugins kinda working") → `f20621e` (1 Nov, "PLUGINS", all caps) → real dependency support (`9b13d92`, 2 Nov) → git-pull-on-load and identifier-based folder naming (mid-to-late Nov).
- Once the plugin system existed, the project immediately started **eating its own philosophy**: cosmetic content that had been hardcoded into core got peeled out into plugins in a matter of days - `modernmapblocks` and `healthpackitem` (20 Nov), `modernshellhats` (21 Nov), `modernshellstamps` and `modernshellmaps` (22 Nov), `legacyanalytics` (23-25 Nov), `modernshellguns` (28 Nov), `itemtooltips` (4 Dec). The "could this be a plugin?" contributing guideline wasn't written first and followed later - it's a description of what the project already did to itself that November.

## Public release: 7 December 2024

Per [`release.md`](../../wiki/LegacyShell/release.html), written by the project itself:

> After many months of working on this project, the creator and main contributer to the LegacyShell project onlypuppy7, released the first public version of the game (v0.1.0-alpha) on Saturday, 7 December 2024 at 16:00 UTC.

It was preceded by public tests and teasers/trailers on a dedicated [YouTube channel](https://www.youtube.com/@legacyshell). `package.json`'s `version` field has read `v0.1.0-alpha` ever since - it's the same string today, around 1,700 commits and almost two years later (October 2026).

## Early 2025: community content, then a long quiet stretch

January 2025 brought the project's first real community-run event, a [map-making competition](../../wiki/LegacyShell/Competitions/jan2025mapcomp.html) judged on creativity/playability/design across submissions from six different contributors; the top three (The Colosseum, Spooky Graveyard, Pokemon Arena) were folded into the public map rotation. February 2025 saw the `Minerva` branch (`e05707b`, "update plugin meta") - the codename for what's now `multiplayermaphost`, the plugin that lets private rooms re-enable custom maps (see [Known Quirks](./known-quirks.md#custom-private-room-maps-are-off-by-default-but-a-bundled-plugin-turns-them-back-on)).

Then activity fell off a cliff:

| Month | Commits | Month | Commits |
|---|---|---|---|
| 2025-03 | 2 | 2025-09 | 11 |
| 2025-04 | 0 | 2025-10 | 0 |
| 2025-05 | 0 | 2025-11 | 0 |
| 2025-06 | 2 | 2025-12 | 46 |
| 2025-07 | 0 | | |

Between March and December 2025, `main` saw a total of 61 commits across ten months - most of them concentrated in two brief flickers (June, September) rather than steady work. The last commit before the longest gap (13 Sept - 18 Dec, three months) was `43a40e2`, a version-bump. The first substantive commit after it (`7939b89`, 18 Dec 2025) is titled, in full: **"this is very embarrassing."**

## The comeback: December 2025-present

Whatever `7939b89` fixed, the project picked back up immediately: a seasonal-effects toggle and the vaporwave plugin's map rotation landed the next day (`0229a9e`, 19 Dec), the room class got refactored on New Year's Eve (`db8f8dd`, 31 Dec), and warm-spare worker caching - the optimization documented today in [Rooms and Workers](./rooms-and-workers.md) - arrived three weeks later (`a573141`, 23 Jan 2026). Activity since has been real but uneven - 85 commits in January 2026, tapering to single digits by mid-year - consistent with a maintained side project, until August 2026 picked it back up.

## August-October 2026: the documentation, and then the plugins

`versionEnum.txt` read **598** at the start of August 2026 (last bumped by CI on 5 Jun). A few fixes landed on 18-19 Aug (an init-wizard `--yes` flag, a healthpack fix, a plugin-dependency-install fix), and then on **20 Aug 2026** the `wiki/docs/` tree this page lives in, `CLAUDE.md` and the generators under `src/scripts/gen-wiki-reference.js` were committed together (`f1cb2cf` "Add wiki reference generators and a live-built plugin-docs page", `1a73d5a` "Restructure wiki/docs/ into a six-tier contributor documentation site", `017132e` per-plugin README docs) - built with AI assistance across a series of sessions that month.

The same day, `61ea61b` - "pathfinding WORKING v1" - started what became `deadinternet`, the bot plugin. The rest of August moved fast: `better-sqlite3` replaced `sqlite3` for services' database (`dc9e6e6`, 26 Aug), the weather and time-of-day code moved out of core into `legacyweather` (`7c81f52`, 29 Aug), and `legacyadmin` became the one admin panel (`55c1683`, same day).

| Month | Commits |
|---|---|
| 2026-08 | 40 |
| 2026-09 | 6 |
| 2026-10 | **183** |

October 2026 was the busiest month since late 2024, and like October 2024 it reshaped the codebase:

- **Bots and a new gamemode**: `deadinternet`'s bots learned to fight (aim, strafe, cover, grenades, hearing - 16 Oct), and `zombiesmode` was built on top of them the same day (`f1cdf51`), along with the two core modifiers it leans on, `contactDamage` (16 Oct) and `noclip` (20 Oct). It got ghosts, brutish and small zombies, a weather arc and a lot of route-finding work over the following week.
- **A loading-speed pass** (mostly 21 Oct, dozens of small commits): the login request goes out from the page head, item meshes and the stamp sheet load after startup instead of during it, the game scene is preloaded, the client keeps a connection to the chosen game server warm, game servers keep connections to services open, and the client server compresses everything with gzip and then brotli.
- **legacyweather** grew into layered rain/storm/snow with shader wetness, real lightning and an automatic day cycle (14-15 Oct).
- **New plugins**: `debugf3` (a Minecraft-style F3 screen, 22 Oct), `legacyreplay` (recording rooms, camera angles, highlight reels, video export, live casting - 23 Oct), `legacyprofiles` (player profiles - 24 Oct), `discordplaytest` (expiring site passwords from Discord - 27 Oct) and `legacyachievements` (28 Oct). `classicskybox` moved from the samples into the bundled plugins, finished.
- **Settings and themes**: the original 0.17.0 settings menu was rebuilt on LegacySettings (20 Oct, with FOV, scoped sensitivity, gun position and a hide-HUD section soon after), and LegacyThemes gained sound packs (23 Oct).

`versionEnum.txt` reads **666** at the end of October 2026.

## Right now: this documentation

The docs have a commit history of their own now - `git log -- wiki/docs` shows it. Generated pages are refreshed with `npm run gen-docs` alongside the code changes they describe (see [Generators](../06-Contributing/generators.md)), and the hand-written ones are updated when someone notices they've drifted - this page included, last brought up to date at the end of October 2026.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
