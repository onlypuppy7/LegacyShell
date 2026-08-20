# Documentation Style Guide

> **Audience:** Anyone writing or editing a page in `wiki/docs/` · **Prereqs:** None
>
> **Canonical source:** [DOCS_PLAN.md](https://github.com/onlypuppy7/LegacyShell/blob/main/DOCS_PLAN.md) at the repo root (the plan this section was built from)

This page defines the conventions every page in `wiki/docs/` follows. If you're adding a page, copy the templates below rather than improvising - consistency here is what makes the docs usable by both people skimming for an answer and tools parsing every page at once.

## Who this documentation is for

Six tiers, each aimed at a specific reader who shouldn't need to have read the tier above cover to cover, but can assume it exists:

| Tier | Reader | Assumes |
|---|---|---|
| `01-Getting Started` | Total newbie, may not know what a terminal is | Nothing |
| `02-Running a Server` | Operator running a public/private instance | Tier 1 |
| `03-Content Creation` | Map/model/skin makers, semi-technical | Tier 1, no JS needed |
| `04-Plugin Development` | Developers extending the game | JS, Tier 2 |
| `05-Codebase Reference` | Core contributors and AI agents | Tier 4 |
| `06-Contributing` | Anyone submitting PRs or writing docs | - |

A page should let its reader stop there with a complete, correct mental model of that one topic - don't make Tier 1 readers understand worker threads to install the game.

## Every page starts with a header block

Right under the `#` title, before any prose:

```markdown
> **Audience:** <who this is for> · **Prereqs:** [<page>](<relative link>)
>
> **Canonical source:** `<file/path/that/backs/this/page.js>`
```

- **Audience**: one short phrase - "Total newbies", "Server operators", "Plugin authors", "Core contributors and agents".
- **Prereqs**: link the page(s) a reader should already have read, or write `None`. This is what lets a reader (or an agent) self-check whether they're in the right place.
- **Canonical source**: the actual file(s) in the repo this page describes. When code and docs disagree, the source wins - this line tells the reader exactly what to go re-check. Omit this line only for pages that aren't describing specific code (e.g. a pure how-to like "installing Blender").

## Voice and structure

The bar to match is [`dealing-with-models.md`](../03-Content%20Creation/dealing-with-models.md) - the one page that predates this doc effort and already has the right voice:

- **Lead with the reader's problem, not with theory.** Open with what they're trying to do, not a definition.
- **Be direct and opinionated.** If a tool or approach is bad, say so plainly ("Baking is completely USELESS and causes HUGE ISSUES" is the tone to match, not to tone down).
- **Tables for anything enumerable.** File listings, config keys, event names, command options - table, not prose.
- **Screenshots for anything GUI**, sized with `<img src="./x.png" alt="..." width="40%">` (or a width that fits the content - keep every image under ~50% so it doesn't dominate the page).
- **End process-type pages with a "Common Issues" section** - things that go wrong and how to recognize/fix them. Not every page needs this (a pure reference table doesn't), but any page describing a procedure that can fail does.
- **Commands go in fenced code blocks, one per block, copy-pasteable as-is.** Don't chain unrelated steps into one block.
- **Name exact versions** where compatibility is fragile (Node versions, Blender + plugin combos, etc.) rather than saying "a recent version."

## Filenames and paths

- Files: `lowercase-hyphenated.md`. The sidebar and page title come from the file's first `#` heading, not the filename - so the filename only needs to be a stable, readable URL slug.
- Directories: `NN-Title Case With Spaces` for the six tiers (the `NN-` prefix controls sidebar order and is stripped for display by `wiki/.vuepress/config.js`). Subdirectories inside a tier (e.g. `04-Plugin Development/Recipes/`) don't need a number prefix unless their own internal order matters.
- Every directory needs a `README.md` - it becomes that section's landing page and is excluded from the sidebar automatically, so it's the right place for a short "what's in this section" index.

## Generated pages are a different category

Some reference pages (the plugin event catalog, DB schema, config reference, slash commands, wire protocol opcodes, enums - see [Generators](./generators.md)) are produced by a script reading the source directly, not written by hand. Those pages:

- Start with a visible banner: `<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. -->`
- Are never hand-edited - if one is wrong, fix the generator script, not the page.
- Still carry the AI-assistance footer below the generation banner (see next section) if the generator or its output was produced with AI help.

Per-plugin docs are a related but different case - there's no generated file at all for the style guide's "never hand-edit it" rule to apply to. Each page is built live from a plugin's `README.md` by `wiki/.vuepress/pluginDocsPlugin.js` - see [Per-plugin docs, built live by VuePress](./generators.md#per-plugin-docs-built-live-by-vuepress).

## AI-assistance disclaimer

This round of documentation (everything added or substantially rewritten under `DOCS_PLAN.md`) is being drafted with AI assistance. Every page produced that way carries this exact footer at the very bottom:

```markdown
---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
```

Rules for when it applies:

- **New pages written under this effort get it.** No exceptions.
- **Pre-existing pages that are only being moved or lightly restructured (not rewritten) don't get it** - it would misattribute authorship of content a human actually wrote. [`dealing-with-models.md`](../03-Content%20Creation/dealing-with-models.md) is the example: it was relocated into the new tier structure and given a header block, but its prose is unchanged and untouched by AI, so it does not carry the footer.
- **If a pre-existing page later gets substantially rewritten**, add the footer at that point - it's now describing AI involvement in that page's current content, not its history.
- This is scoped to *this* documentation effort, not a permanent site-wide rule. A human contributor adding a new page later isn't obligated to add this footer to their own original writing.

## Traceability

Every factual claim on a reference-tier page (`04-Plugin Development`, `05-Codebase Reference`, and the Generated pages) should be traceable to a `file:line` in the repo. If you can't point at where a claim comes from, don't ship it - a wrong confident answer is worse than a missing page.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
