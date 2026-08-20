# For AI Agents

> **Audience:** AI agents working in this repository · **Prereqs:** None — read this first
>
> **Canonical source:** [CLAUDE.md](https://github.com/onlypuppy7/LegacyShell/blob/main/CLAUDE.md) at the repo root

Orientation for an agent that just landed in this codebase, before you start reading further or making changes.

## Where to actually start

[CLAUDE.md](https://github.com/onlypuppy7/LegacyShell/blob/main/CLAUDE.md) at the repo root is the primary, densest orientation document for this repo - architecture overview, the plugin system, the shared client/server code layer, and a full event catalog. If you have access to it, read it before this page goes any further; this page assumes it and adds agent-specific operating guidance on top.

This wiki (`wiki/docs/`) is organized by reader, not by topic - see the [documentation home](../) for the six-tier breakdown. As an agent you'll most often want [Plugin Development](../04-Plugin%20Development/) (writing a plugin) or [Codebase Reference](../05-Codebase%20Reference/) (changing core code), but don't skip [Running a Server](../02-Running%20a%20Server/) if the task touches the database, config, or auth.

If you're an agent that landed here *with* repo file access (i.e. you're reading this), read the actual source and wiki pages directly rather than `/llms.txt` / `/llms-full.txt` - those exist for the opposite case, an agent that only has the live site (e.g. browsing `legacyshell.com` with no repo access), where fetching `/llms-full.txt` once beats crawling the wiki page by page. See [Generators](./generators.md#llms-txt-llms-full-txt) for how those are built.

## What's generated vs. hand-written

Seven kinds of reference page in this wiki are generated directly from source, not hand-written - see [Generators](./generators.md) for the full list and mechanism. They start with a visible `<!-- GENERATED -->` banner. **These are the most trustworthy pages in the wiki** precisely because they can't describe code that doesn't exist - if you need the exact, current shape of an event payload, a config key's default, a slash command's permission tuple, a wire opcode, or an enum's values, prefer the generated page over prose that might have been written before the last change to that code.

A specific plugin's own docs page is a related but different case: it's not generated at all, it's built live from that plugin's `README.md` every time the wiki builds - see [Per-plugin docs, built live by VuePress](./generators.md#per-plugin-docs-built-live-by-vuepress). Trust it the same way - it's reading the actual README right now, not a cached copy of it.

Everything else is prose, written (with AI assistance - see the footer on every page) and reviewed, but not mechanically re-verified against source on every commit the way generated pages are.

## How to verify a claim before acting on it

A documentation page - generated or not - describes the repo at the time it was last written or regenerated. Before making a change based on something a doc page says:

1. **For anything on a generated page**: it's already current as of the last `npm run gen-docs` run. If you're unsure that run is recent, re-run it (see [Generators](./generators.md)) and diff the output.
2. **For anything on a hand-written page**: grep the actual claim. A page saying "X fires when Y" is a claim about a specific `file:line` - go read that line. Every page in this doc effort follows a house convention of citing a **Canonical source** in its header block specifically so this is fast, not a research project.
3. **For anything that smells like a workaround, gotcha, or "this doesn't work the way you'd expect"**: these are exactly the claims most likely to describe a specific version of the code that may have since changed. Check the canonical source before repeating the claim in new work.

## What not to trust blindly

- **Comments in the source itself** are sometimes wrong, outdated, or (in a few places) the original author's own admission that something is confusing/unused/a known wart. Treat a comment as a claim to verify, same as a doc page - it's evidence, not ground truth.
- **A plugin being present and loading without error is not proof it works.** Plugin loading failures are usually loud, but a plugin can load cleanly and still not actually do the thing it's supposed to (a mistyped event name, a hook that silently never fires) - see [Pitfalls](../04-Plugin%20Development/pitfalls.md).
- **The apparent symmetry of an API is not a guarantee.** `joinPlayer` existing doesn't guarantee a `leavePlayer` exists (it doesn't - the real event is `disconnectClient`). Don't assume a hook exists because its opposite does; check the [Event Reference](../04-Plugin%20Development/Event%20Reference/).

## Testing a change for real

If you're implementing something non-trivial - a plugin, a core fix - prefer actually booting a server and checking the result over reasoning about what the code "should" do. This repo has no automated test suite (see the root README/CLAUDE.md), so runtime verification is the only verification available. A few practical notes from doing this repeatedly in this repo:

- **Isolate your test instance.** If a real LegacyShell instance might already be running (check ports 13370-13372 before you assume they're free), run your own on different ports rather than risk interfering with it. Never assume a port being occupied means it's safe to kill whatever's using it - check first.
- **A clean `git clone` of this repo can fail on Windows** with `Filename too long` errors from deeply-nested wiki history pages, unless `git config --global core.longpaths true` is set first - see [Troubleshooting](../01-Getting%20Started/troubleshooting.md).
- **`git clone` of a local path only reflects committed history, not your working tree.** If you're testing an uncommitted edit in a scratch clone, the clone won't have it - copy the specific edited file(s) over after cloning, or the scratch instance will silently run the old code while you think you're testing the new one.
- **`npm run init -- -y` (or `node src/scripts/init.js -y`) skips all three interactive prompts**, answering yes to each - the right way to set up a scratch instance non-interactively, rather than piping staggered input into the readline prompts.
- **Each game server room runs in its own worker thread**, with its own independent plugin instances and no shared memory with the main thread or other rooms - see [Workers and State](../04-Plugin%20Development/workers-and-state.md). A plugin that "works" when you only check the main thread's boot log may still be broken per-room.
- **A clean boot log is necessary but not sufficient evidence of correctness.** No errors means your code didn't crash; it doesn't mean the logic is right. Where possible, add a temporary, throwaway log statement to confirm the actual runtime state (e.g. "does this data structure contain what I expect it to contain"), not just "did this code path execute."

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
