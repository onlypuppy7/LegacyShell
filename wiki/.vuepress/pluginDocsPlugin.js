// VuePress plugin that builds the per-plugin doc pages ("Plugin Docs" in the sidebar) live,
// at `vuepress build`/`vuepress dev` time, straight from each plugin's own README.md - no
// generated file ever gets written under wiki/plugins/Plugin Docs/. This used to be a step in
// src/scripts/gen-wiki-reference.js (genPluginDocs) that mirrored each README into a tracked
// info.md; that meant two tracked copies of the same prose, and no way for the mirror to be
// wrong except by someone forgetting to regenerate it. Building the page directly from the
// README each time removes that whole class of problem - there's nothing to regenerate,
// because there was never a second copy.
//
// Mechanism: VuePress's own "Adding Extra Pages" pattern - onInitialized(app) creates a Page
// via createPage() and pushes it into app.pages. See discoverPluginDocs()/buildPluginPageContent()
// in src/scripts/plugin-docs-lib.js for the actual README-scanning and link-rewriting logic,
// shared with genLLMsTxt() so llms.txt/llms-full.txt show exactly the same content.
//
// The sidebar side of this lives in config.js, which can't ask VuePress for this plugin's
// pages (config.js's sidebar object is built before VuePress starts), so it calls
// discoverPluginDocs() itself to build matching sidebar entries.

import { createPage } from '@vuepress/core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { discoverPluginDocs, buildPluginPageContent } from '../../src/scripts/plugin-docs-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');

export function pluginDocsPlugin() {
    return {
        name: 'legacyshell-plugin-docs',

        async onInitialized(app) {
            const { entries, pluginInfo } = discoverPluginDocs(rootDir);
            const toCreate = entries.filter(entry => !entry.nodocs);
            const skipped = entries.length - toCreate.length;

            // Resolve every page first, then push them all at once - keeps app.pages consistent
            // for anything else reading it mid-loop (the dead-link-checker's own false positives
            // are a separate, unrelated timing issue - see the linksCheck.exclude comment in
            // config.js for what's actually going on there).
            const pages = await Promise.all(toCreate.map(entry => {
                const content = buildPluginPageContent(rootDir, entry, pluginInfo);
                // Literal space, not pre-encoded - VuePress percent-encodes this itself when
                // building the final route (matching how it already handles a real file living
                // under a directory with a space in its name), and double-encodes it if we do it
                // ourselves first ("Plugin%20Docs" becomes "Plugin_20Docs" - confirmed by testing).
                const pagePath = `/plugins/Plugin Docs/${entry.category}/${entry.identifier}/info.html`;

                return createPage(app, {
                    path: pagePath,
                    content,
                    // A fictitious but real-looking absolute path under wiki/ - never read from
                    // disk (createPage prefers the `content` above over reading `filePath`), but
                    // still needed so VuePress's default-theme dead-link checker can resolve
                    // other pages' relative markdown links into this one (and this page's own
                    // links back out) - it matches purely on `filePathRelative`, which VuePress
                    // only derives from `filePath`, not from `path`. Matches exactly where the
                    // old static-generated info.md used to live, so nothing else needs to change.
                    filePath: path.join(rootDir, 'wiki', 'plugins', 'Plugin Docs', entry.category, entry.identifier, 'info.md'),
                    // No real file backs this page on GitHub (the source lives outside wiki/), so
                    // the default theme's auto edit-link can't compute a correct GitHub URL for
                    // it - buildPluginPageContent() already put a real "Canonical source" link at
                    // the top of the page content instead.
                    frontmatter: { editLink: false },
                });
            }));

            app.pages.push(...pages);
            console.log(`  [plugin-docs] built ${pages.length} plugin doc page(s)${skipped ? `, skipped ${skipped} via !nodocs` : ''}`);
        },
    };
};
