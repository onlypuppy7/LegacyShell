# Generators

> **Audience:** Anyone editing generated wiki pages, or the source those pages describe · **Prereqs:** [Documentation style guide](./docs-style-guide.md)
>
> **Canonical source:** `src/scripts/gen-wiki-reference.js`, `src/scripts/event-descriptions.json`

Seven kinds of reference page in this wiki are generated directly from source, via `npm run gen-docs`, rather than hand-written:

| Page(s) | Extracted from |
|---|---|
| [Event Reference](../04-Plugin%20Development/Event%20Reference/) (7 pages) | Every `plugins.emit(...)` call site across `src/shell/`, `server-services/`, `server-game/`, `server-client/` |
| [Database Schema](../05-Codebase%20Reference/Generated/database-schema.md) | Every `CREATE TABLE` statement in `recordsManagement.js` |
| [Config Reference](../05-Codebase%20Reference/Generated/config-reference.md) | Every key in `src/defaultconfig/*.yaml` |
| [Slash Command Reference](../05-Codebase%20Reference/Generated/slash-commands.md) | Every `this.newCommand({...})` call in `permissions.js` |
| [Wire Protocol Opcodes](../05-Codebase%20Reference/Generated/comm-opcodes.md) | The `Comm.Code` object in `comm.js` |
| [Enums & Lookup Tables](../05-Codebase%20Reference/Generated/enums-reference.md) | Every other enum-shaped top-level object literal in `constants.js` and `comm.js` |
| `/llms.txt` and `/llms-full.txt` | Every page under `wiki/docs/` and `wiki/plugins/` |

The last one works a little differently from the other six - see [llms.txt / llms-full.txt](#llms-txt-llms-full-txt) below.

[Per-Plugin Docs](../../plugins/listofplugins.md) (25 pages and counting) are **not** in this list - they're not generated at all, in the sense of "run a script, get a file." They're built live, by VuePress itself, every time the wiki builds or its dev server starts, straight from each plugin's own `README.md` - see [Per-plugin docs, built live by VuePress](#per-plugin-docs-built-live-by-vuepress) below for why that's a meaningfully different (and better) mechanism than the other six.

## Why generate these at all

The event catalog alone is ~220 call sites, scattered across four different directory trees. A hand-maintained copy of that is guaranteed to drift the first time someone adds, removes, or renames an emit call without also remembering to update a wiki page nobody's looking at while writing the actual code change. Generating it means the source of truth is the code itself, checked fresh on every run - there's nothing to remember to keep in sync.

## Running it

```bash
npm run gen-docs
```

Regenerates every generated page in place. Run this after touching any of the source listed in the table above, then commit the results alongside your code change. (Per-plugin docs don't need this - see below - but `llms.txt`/`llms-full.txt` still do, since editing a plugin's `README.md` changes what those two files should say.)

## How it works

`src/scripts/gen-wiki-reference.js` parses the relevant source files with a real JS parser (`acorn` + `acorn-walk`, not regex) and walks the AST for the specific call shapes it's looking for (`plugins.emit(...)`, `this.newCommand({...})`, the `Comm.Code` object literal, enum-shaped top-level object literals, `CREATE TABLE` template strings). For each match it extracts:

- The exact `file:line` of the call site.
- The literal source text of the relevant argument(s) - so what the page shows is genuinely what the code says, not a paraphrase.

This mechanical extraction can never be "wrong" in the sense of describing code that doesn't exist, because it's reading the code directly - if it says an event fires with a certain payload, that's because a call site with that exact payload really exists at that exact line, checked fresh on every run.

## The one part that's genuinely hand-written: event descriptions

Mechanical extraction gets you *what* fires and *where* - it can't get you *why*, or a plain-English sentence explaining what triggers it. That one column (the "fires when" description on the event catalog) is curated by hand in `src/scripts/event-descriptions.json`, a flat JSON file mapping `"relative/file/path.js#eventName"` to a one-sentence description.

The generator merges mechanical facts (always fresh) with this curated prose (persists across regenerations) at build time. **Any event with no entry in this file renders as visibly `*(undocumented)*`** in the output rather than silently missing - so a documentation gap shows up as a gap, not as nothing.

Adding a description for a new event:

```json
{
  "src/shell/rooms.js#myNewEvent": "One sentence explaining when this fires and why a plugin author would care."
}
```

Key format is `<file>#<eventName>` using the file path exactly as it appears in the generated table. If the same event name appears more than once in the same file (a handful of built-in events do), one description covers all of those rows - write it generically enough to apply to whichever specific call site a reader lands on.

## Never hand-edit a generated page

Every generated page starts with a visible banner:

```
<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. -->
```

If something on a generated page is wrong, the fix belongs in one of three places:
- **The extraction is wrong** → fix `gen-wiki-reference.js`.
- **The description is missing or wrong** → fix `event-descriptions.json`.
- **The underlying code itself is what's actually wrong** → fix the source; the page will pick up the correction automatically next regeneration.

A hand-edit to the generated `.md` file itself will just be silently overwritten the next time anyone runs `npm run gen-docs` - which defeats the entire point of generating it in the first place.

## Keeping it honest: no CI check, run it yourself

Because generation is deterministic (the same source always produces the same output), a CI job could in principle verify the committed pages match what the generator produces right now - but that means running `npm ci` and the full generator on every push, and that cost isn't worth paying in GitHub Actions minutes for this. There's no automated drift check. In practice: **run `npm run gen-docs` and commit the result any time you touch an emit call, a command, a config key, or the DDL** - the discipline is manual, not enforced.

## Per-plugin docs, built live by VuePress

The six generators above all share the same shape: extract structured facts (an emit call, a `CREATE TABLE`, a config key) out of code that was never meant to be prose, and write a new page that didn't exist before. Per-plugin docs don't fit that shape - the prose already exists, hand-written, as `<folder>/README.md`, one per plugin, living right next to that plugin's own code. Mirroring that into a second tracked file under `wiki/plugins/Plugin Docs/` (which is what this repo used to do) means two copies of the same prose, and the only thing keeping them in sync is someone remembering to run a script. This repo doesn't do that anymore: instead, [`wiki/.vuepress/pluginDocsPlugin.js`](https://github.com/onlypuppy7/LegacyShell/blob/main/wiki/.vuepress/pluginDocsPlugin.js) builds the page **live**, every time the wiki builds or `vuepress dev` starts, using VuePress's own [Adding Extra Pages](https://v2.vuepress.vuejs.org/advanced/cookbook/adding-extra-pages.html) mechanism (`createPage()` + `app.pages.push()` in an `onInitialized` hook) - there is no `wiki/plugins/Plugin Docs/**/info.md` file on disk, tracked or otherwise, and nothing to regenerate.

The actual README-scanning, category-assignment, and link-rewriting logic lives in [`src/scripts/plugin-docs-lib.js`](https://github.com/onlypuppy7/LegacyShell/blob/main/src/scripts/plugin-docs-lib.js), shared between `pluginDocsPlugin.js` (the live pages) and `genLLMsTxt()` back in `gen-wiki-reference.js` (so `llms.txt`/`llms-full.txt` show exactly the same content, without needing their own copy of this logic). One category per real repo directory a plugin can live in:

| Source directory | Wiki category | What lives there |
|---|---|---|
| `plugins_default/` | [Default](../../plugins/Plugin%20Docs/Default/) | Bundled first-party plugins. |
| `plugins_samples/` | [Examples](../../plugins/Plugin%20Docs/Examples/) | Minimal, dedicated teaching plugins. |
| `plugins/` | Plugins | Your own / third-party installs - empty until a plugin there ships a `README.md`. |

A `plugins_default/healthpackitem/README.md` becomes the live page at `/plugins/Plugin Docs/Default/healthpackitem/info.html`; a hypothetical `plugins_samples/sample1cmd/README.md` would become `/plugins/Plugin Docs/Examples/sample1cmd/info.html`, and so on.

**`README.md` is the only copy - there's nothing else to edit.** Change the README, rebuild (or just wait if `vuepress dev` is already running), and the page updates. This is the whole point: it's not that the mirror is *usually* fresh, it's that there's no mirror to go stale in the first place.

Three things this mechanism handles that a plain file read wouldn't:

- **Link rewriting**, unchanged from before: any link to elsewhere in the repo inside a plugin `README.md` should start with `/` - repo-root-relative, which GitHub also resolves correctly when browsing the file directly - e.g. `/wiki/docs/04-Plugin Development/dependencies.md`, or `/plugins_default/<folder>/README.md` (or the `plugins_samples/`/`plugins/` equivalent) to link another plugin's own docs, wherever it lives. `rewritePluginReadmeLinks()` in `plugin-docs-lib.js` rewrites every such link into the live page's actual relative path (resolving a sibling `README.md` link to that plugin's real category and page, even across categories). Links that don't start with `/` (external URLs, same-page `#anchors`) are left untouched.
- **`!nodocs` opts a plugin out.** If a `README.md`'s first line is exactly `!nodocs`, no live page gets built for it at all - for a plugin whose real docs don't fit the single-README shape this mechanism reads (e.g. multiple hand-written pages under `Plugin Docs/<Category>/<identifier>/` directly, written by hand as ordinary wiki pages). No plugin in this repo currently needs it, but the mechanism is there.
- **A dead-link-checker false positive to know about.** The default theme's built-in broken-link checker runs its check before this plugin's `onInitialized` hook has a chance to add its pages (confirmed by testing - this isn't timing-dependent, it happens on every build), so every link into or between per-plugin doc pages would otherwise get flagged "broken" even though the pages are real and correctly routed. `config.js` works around this with a narrowly-scoped `themePlugins.linksCheck.exclude` pattern rather than disabling the checker outright, so it still catches genuinely broken links elsewhere.

The plugin's own `PluginMeta.identifier` (parsed from its `index.js`, not guessed from the folder name) determines the page's URL - this is what correctly maps a disabled plugin's underscore-prefixed folder (`_zaxoniuscustomguns`) to its real, underscore-free identifier (`zaxoniuscustomguns`).

A plugin with no `README.md` at all simply doesn't get a wiki page - same as always, nothing generates itself out of thin air.

The sidebar can't ask VuePress "what pages did that plugin add" (the sidebar object in `config.js` is built before VuePress even starts), so `config.js` calls the same `discoverPluginDocs()` from `plugin-docs-lib.js` a second time, independently, to build a matching "Plugin Docs" sidebar branch by hand. If you ever see a per-plugin page that exists but is missing from the sidebar (or vice versa), that's the seam to check first.

## `llms.txt` / `llms-full.txt`

These follow the [llmstxt.org](https://llmstxt.org) convention - a plain-text file that helps an LLM or agent orient itself in a site without crawling it link by link. The spec (and common practice around it) actually describes **two** complementary files, and `genLLMsTxt()` produces both from the same page set the rest of this generator already walks:

- **`llms.txt`** - a short, curated index: one line per page (`[Title](url): one-sentence description`), grouped under an `##`/`###` heading per tier. Meant to stay scannable - this is the file a tool actually reads first.
- **`llms-full.txt`** - every page's full content, concatenated, in the same order. Meant to be long - that's the entire point of having a separate file for it, so `llms.txt` itself never has to choose between "short" and "complete."

Both are generated by walking every `.md` file under `wiki/docs/` and `wiki/plugins/` (the game-lore `wiki/wiki/` section gets one link, not full inclusion - see [Wiki](../../wiki/)), extracting each page's title (its first `#` heading) and a one-line description (its first real paragraph of prose, skipping the header blockquote and, where a page has no lead-in paragraph before its first `##`, that heading too). This is mechanical extraction, not curated prose like the event descriptions - a page with an unusually terse or awkward first paragraph gets an unusually terse or awkward one-liner in `llms.txt`. That's an acceptable trade for never going stale across 100+ pages, which is exactly the failure mode the hand-maintained version of this file was already in before it was regenerated this way.

### Where these actually live

Both files are written to `wiki/.vuepress/public/`, which VuePress copies verbatim into the built site - so they're reachable at `/wiki/llms.txt` for free. That's **not** where the spec expects them, though: `llms.txt` is meant to resolve at a site's true root (`https://<domain>/llms.txt`, the same convention as `robots.txt`), and this whole wiki is mounted under a `/wiki/` base path. `server-client/start-client.js` adds two explicit routes, right alongside the existing `/discord` one (before the closed-mode gate, so both work in maintenance mode too), that read these same generated files and serve them at the real root:

```js
app.get('/llms.txt', (req, res) => {
    res.type('text/plain').send(fs.readFileSync(path.join(ss.rootDir, 'wiki', '.vuepress', 'public', 'llms.txt'), 'utf8'));
});
```

This reads the file directly rather than `res.sendFile(...)` - Express's `sendFile` (via the `send` package) silently 404s on any path containing a dotfile/dot-directory segment by default, which `wiki/.vuepress/` is. Confirmed by hitting that exact wall while building this, not a preemptive worry.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
