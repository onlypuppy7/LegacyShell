// config.js

import { defaultTheme } from '@vuepress/theme-default'
import { viteBundler } from '@vuepress/bundler-vite'
import { defineUserConfig } from 'vuepress'

import { searchPlugin } from '@vuepress/plugin-search'
import { cachePlugin } from '@vuepress/plugin-cache'
import { pluginDocsPlugin } from './pluginDocsPlugin.js'

import path from 'path'
import fs from 'fs'
import { discoverPluginDocs } from '../../src/scripts/plugin-docs-lib.js'

const rootDir = path.join(__dirname, '..', '..');

const subcategories = [["/wiki/", "Wiki", "Wiki"], ["/plugins/", "Plugins", "Plugins"], ["/docs/", "Documentation", "Docs"]];

// Plain string comparison matching the default (no-comparator) Array.sort() used throughout
// this file's sidebar-building - kept as a named function so the "match existing sort order"
// intent is explicit at each call site, not just an accident of leaving the comparator off.
function defaultSort(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
};

// "Plugin Docs" pages are built live by wiki/.vuepress/pluginDocsPlugin.js (see that file) -
// no wiki/plugins/Plugin Docs/**/info.md file exists on disk for addFilesRecursively to find,
// so this builds the matching sidebar branch from the same discoverPluginDocs() scan instead.
// Mirrors exactly what addFilesRecursively would have produced if those files still existed:
// one collapsible group per category (Default/Examples/Plugins), sorted alphabetically by
// identifier within each, categories sorted alphabetically too.
function buildPluginDocsSidebarEntry() {
    const { entries } = discoverPluginDocs(rootDir);
    const byCategory = {};
    for (const entry of entries) {
        if (entry.nodocs) continue;
        (byCategory[entry.category] ??= []).push(entry);
    };

    const categories = Object.keys(byCategory).sort(defaultSort);
    return {
        text: 'Plugin Docs',
        collapsible: true,
        children: categories.map(category => ({
            text: category,
            collapsible: true,
            children: byCategory[category]
                .slice()
                .sort((a, b) => defaultSort(a.identifier, b.identifier))
                .map(entry => `Plugin Docs/${category}/${entry.identifier}/info.md`),
        })),
    };
};

const sidebar = {};

// Tier directories are prefixed "01-", "02-", ... so fs.readdirSync (alphabetical)
// sorts them into reading order. Strip that prefix for display only - the sidebar
// should show "Getting Started", not "01-Getting Started". Requires 2+ digits
// specifically so this never touches a plugin identifier that happens to start
// with a single digit for its own reasons (e.g. `5_crackshot`, where the "5" is
// part of the real name, not a sidebar-ordering prefix) - real tier prefixes in
// this repo are always two-digit (01-06).
function stripOrderPrefix(name) {
    return name.replace(/^\d{2,}[-_]/, '');
};

// Explicit reading order for directories under docs/ where a deliberate progression
// (setup -> concepts -> deep reference) reads far better than alphabetizing - e.g.
// "quickstart" needs to sort before "anatomy", not after it. Keyed by relativePath
// (forward-slash, relative to that directory's own section root). Anything not
// listed here - including whole sections like the game-lore wiki/, and flat lookup
// lists like plugins/Plugin Docs/ - falls back to plain alphabetical order, which is
// the right default for a set of peers with no natural sequence (e.g. per-plugin docs).
const PAGE_ORDER = {
    '01-Getting Started': [
        'what-is-legacyshell.md', 'speed-setup.md', 'requirements.md', 'installation.md', 'first-run.md',
        'config-files.md', 'making-an-account.md', 'troubleshooting.md',
    ],
    '02-Running a Server': [
        'architecture-overview.md', 'the-database.md', 'users-and-ranks.md', 'adding-game-servers.md',
        'client-mirrors.md', 'perpetual.md', 'backups.md', 'rate-limiting.md', 'moderation.md',
        'closed-mode.md', 'deployment.md', 'troubleshooting.md',
    ],
    '03-Content Creation': [
        'maps.md', 'dealing-with-models.md', 'map-blocks.md', 'items-and-skins.md',
        'hats-and-stamps.md', 'sounds.md', 'gamemodes.md', 'seasonal-events.md',
    ],
    '04-Plugin Development': [
        'quickstart.md', 'i-want-to.md', 'anatomy.md', 'lifecycle.md', 'dependencies.md',
        'events-concept.md', 'Event Reference', 'commands.md', 'client-side-code.md',
        'static-assets.md', 'content-packs.md', 'networking.md', 'workers-and-state.md',
        'prediction-and-authority.md', 'Recipes', 'publishing.md', 'pitfalls.md',
    ],
    '04-Plugin Development/Recipes': [
        'killstreaks.md', 'new-pickup-item.md', 'new-gamemode.md', 'custom-weapon.md',
        'ui-modification.md', 'discord-integration.md', 'replacing-core-behaviour.md',
        'persistent-storage.md', 'player-currency.md', 'custom-player-data.md',
    ],
    '04-Plugin Development/Event Reference': [
        'services.md', 'game-shared-logic.md', 'game-main-thread.md', 'game-clients.md',
        'game-rooms.md', 'game-browser.md', 'client-build.md',
    ],
    '05-Codebase Reference': [
        'repo-layout.md', 'shared-shell-layer.md', 'server-only-markers.md', 'the-ss-object.md',
        'build-pipeline.md', 'stamps-and-babylons.md', 'game-loop.md', 'rooms-and-workers.md',
        'wire-protocol.md', 'Generated', 'services-internals.md', 'catalog-and-items.md',
        'permissions-internals.md', 'physics-and-collision.md', 'known-quirks.md', 'anecdotes.md',
        'timeline.md',
    ],
    '05-Codebase Reference/Generated': [
        'comm-opcodes.md', 'enums-reference.md', 'database-schema.md', 'config-reference.md', 'slash-commands.md',
    ],
    '06-Contributing': [
        'docs-style-guide.md', 'generators.md', 'for-ai-agents.md',
    ],
};

function orderItems(items, relativePath) {
    const order = PAGE_ORDER[relativePath.replace(/\\/g, '/')];
    if (!order) return items.slice().sort();

    const rank = new Map(order.map((name, i) => [name, i]));
    return items.slice().sort((a, b) => {
        const ra = rank.has(a) ? rank.get(a) : Infinity;
        const rb = rank.has(b) ? rank.get(b) : Infinity;
        return ra !== rb ? ra - rb : a.localeCompare(b); // unlisted (or tied) items: alphabetical
    });
};

function addFilesRecursively(basePath, relativePath) {
    const fullPath = path.join(basePath, relativePath);
    const items = orderItems(fs.readdirSync(fullPath).filter(item => !item.startsWith('.')), relativePath);

    return items
        .map(item => {
            const itemPath = path.join(relativePath, item);
            const stats = fs.statSync(path.join(basePath, itemPath));

            if (stats.isDirectory()) {
                return {
                    text: stripOrderPrefix(item),
                    collapsible: true,
                    children: addFilesRecursively(basePath, itemPath),
                };
            } else if (item.endsWith('.md') && item !== 'README.md') {
                return itemPath.replace(/\\/g, '/');
            }
        })
        .filter(Boolean);
};

for (const [subcategory, subcategoryName] of subcategories) {
    const subcategoryPath = path.join(__dirname, "..", subcategory);

    try {
        let children = addFilesRecursively(subcategoryPath, '');

        if (subcategory === '/plugins/') {
            // "Plugin Docs" no longer exists as a real directory (see buildPluginDocsSidebarEntry
            // above) - merge it back in at the same alphabetical position addFilesRecursively
            // would have placed it at, so the sidebar looks identical to when it was real files.
            const sortables = children.map(item => ({ key: typeof item === 'string' ? path.basename(item) : item.text, item }));
            sortables.push({ key: 'Plugin Docs', item: buildPluginDocsSidebarEntry() });
            sortables.sort((a, b) => defaultSort(a.key, b.key));
            children = sortables.map(s => s.item);
        };

        sidebar[subcategory] = [
            {
                text: subcategoryName,
                children,
            },
        ];
    } catch (error) {
        console.error(`Error processing subcategory ${subcategory}:`, error);
    };
};

console.log(sidebar);

const navbar = [{
    text: 'Back to LegacyShell',
    link: '/back.md'
}, {
    text: 'Home',
    link: '/'
}];

for (const subcategoryThing of subcategories) {
    navbar.push({
        text: subcategoryThing[2],
        link: subcategoryThing[0]
    });
};

console.log(navbar);

export default defineUserConfig({
    title: 'LegacyShell Wiki',
    description: 'A simple, no-nonsense wiki for LegacyShell, it\'s documentation as well as general technical Shell Shockers info.',
    base: '/wiki/',
    theme: defaultTheme({
        logo: '/logo.png',
        navbar,
        sidebar,
        sidebarDepth: 2,
        lastUpdated: true,

        docsRepo: 'onlypuppy7/LegacyShell',
        docsBranch: 'main',
        docsDir: 'wiki',
        editLink: true,
        editLinkText: 'Edit this page on GitHub',

        themePlugins: {
            // The default theme's built-in dead-link checker runs during its own onInitialized
            // hook, which always fires before any user plugin's onInitialized (confirmed by
            // testing - registration order in the `plugins` array below made no difference). Its
            // page list is a snapshot taken before pluginDocsPlugin.js has pushed its live-built
            // "Plugin Docs" pages, so every link into (or between) those pages gets a false-
            // positive "broken link" warning - the pages themselves are real and correctly
            // routed (verified directly in the browser), the checker's timing just can't see
            // them yet. Excluding this one path segment is narrower than disabling the checker
            // entirely, so a genuinely broken link elsewhere still gets caught.
            linksCheck: {
                exclude: [/Plugin%20Docs\//],
            },
        },
    }),
    bundler: viteBundler({
        viteOptions: {},
        vuePluginOptions: {},
    }),
    plugins: [
        searchPlugin({}),
        cachePlugin({}),
        pluginDocsPlugin(),
    ],
});