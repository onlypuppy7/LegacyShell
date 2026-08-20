// Shared logic for turning a plugin's own README.md into a wiki page - used by both
// wiki/.vuepress/pluginDocsPlugin.js (creates the live VuePress pages at build/dev time)
// and src/scripts/gen-wiki-reference.js's genLLMsTxt() (needs the same title/content/link
// set for llms.txt / llms-full.txt). Kept as one module so there is exactly one place that
// knows how a plugin README becomes wiki content - no separate generated copy on disk to
// drift out of sync with it.
//
// A README whose first line is exactly `!nodocs` is skipped entirely - for a plugin whose
// real docs don't fit this single-README shape (e.g. multiple hand-written pages living
// directly under wiki/plugins/Plugin Docs/<Category>/<identifier>/). No plugin in this repo
// currently needs it, but the mechanism stays available.

import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export const PLUGIN_SOURCE_DIRS = [
    { dir: 'plugins_default', category: 'Default' },
    { dir: 'plugins_samples', category: 'Examples' },
    { dir: 'plugins', category: 'Plugins' },
];

export function extractPluginMeta(rootDir, pluginFolderRelPath) {
    const idxRelPath = path.join(pluginFolderRelPath, 'index.js');
    const idxFullPath = path.join(rootDir, idxRelPath);
    if (!fs.existsSync(idxFullPath)) return null;

    const code = fs.readFileSync(idxFullPath, 'utf8');
    let ast;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch (error) {
        console.warn(`  ! failed to parse ${idxRelPath}: ${error.message}`);
        return null;
    };

    let meta = null;
    walk.simple(ast, {
        VariableDeclarator(node) {
            if (node.id.type === 'Identifier' && node.id.name === 'PluginMeta' &&
                node.init && node.init.type === 'ObjectExpression') {
                meta = {};
                for (const prop of node.init.properties) {
                    if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
                    if (prop.value.type === 'Literal') meta[prop.key.name] = prop.value.value;
                };
            };
        },
    });
    return meta;
};

// Scans all three plugin source directories for folders that have both a resolvable
// PluginMeta.identifier (from index.js) and a README.md. Returns:
//   - entries: [{ dir, folder, readmeRelPath, category, identifier, nodocs }]
//   - pluginInfo: `${dir}/${folder}` -> { category, identifier } (needed to resolve
//     sibling-README links across categories in rewritePluginReadmeLinks)
export function discoverPluginDocs(rootDir) {
    const pluginInfo = {};

    for (const { dir, category } of PLUGIN_SOURCE_DIRS) {
        const fullDir = path.join(rootDir, dir);
        if (!fs.existsSync(fullDir)) continue;
        const folders = fs.readdirSync(fullDir).filter(f => fs.statSync(path.join(fullDir, f)).isDirectory());
        for (const folder of folders) {
            const meta = extractPluginMeta(rootDir, path.join(dir, folder));
            if (meta && meta.identifier) pluginInfo[`${dir}/${folder}`] = { category, identifier: meta.identifier };
        };
    };

    const entries = [];
    for (const { dir, category } of PLUGIN_SOURCE_DIRS) {
        const fullDir = path.join(rootDir, dir);
        if (!fs.existsSync(fullDir)) continue;
        const folders = fs.readdirSync(fullDir).filter(f => fs.statSync(path.join(fullDir, f)).isDirectory());

        for (const folder of folders) {
            const readmeRelPath = path.join(dir, folder, 'README.md').replace(/\\/g, '/');
            if (!fs.existsSync(path.join(rootDir, readmeRelPath))) continue;

            const info = pluginInfo[`${dir}/${folder}`];
            if (!info) {
                console.warn(`  ! ${readmeRelPath} has no matching PluginMeta.identifier in index.js, skipping`);
                continue;
            };

            const rawContent = fs.readFileSync(path.join(rootDir, readmeRelPath), 'utf8');
            const nodocs = rawContent.trimStart().split('\n')[0].trim() === '!nodocs';

            entries.push({ dir, folder, readmeRelPath, category: info.category, identifier: info.identifier, nodocs });
        };
    };

    return { entries, pluginInfo };
};

// Rewrites repo-root-relative "/"-prefixed links in a plugin README into the wiki page's
// own relative-path scheme, resolving a sibling plugin's README link (even across
// categories) to that plugin's real wiki page. destDir is the wiki-relative directory the
// resulting page "lives" at, e.g. `wiki/plugins/Plugin Docs/Default/healthpackitem`. Links
// that don't start with "/" (external URLs, same-page #anchors) are left untouched.
export function rewritePluginReadmeLinks(content, destDir, pluginInfo) {
    return content.replace(/\]\(\/([^)#\s]+)(#[^)]*)?\)/g, (full, repoPath, hash) => {
        let destRepoPath = repoPath;
        const siblingMatch = repoPath.match(/^(plugins_default|plugins_samples|plugins)\/([^/]+)\/README\.md$/);
        if (siblingMatch) {
            const sibling = pluginInfo[`${siblingMatch[1]}/${siblingMatch[2]}`];
            if (sibling) destRepoPath = `wiki/plugins/Plugin Docs/${sibling.category}/${sibling.identifier}/info.md`;
        };
        let rel = path.relative(destDir, destRepoPath).split(path.sep).join('/');
        if (!rel.startsWith('.')) rel = './' + rel;
        rel = rel.split('/').map(seg => seg.replace(/ /g, '%20')).join('/');
        return `](${rel}${hash || ''})`;
    });
};

// Builds the final page content (source text + rewritten links + a canonical-source note)
// for one discovered plugin doc entry. Shared between the VuePress virtual-page plugin and
// genLLMsTxt() so both always show exactly the same thing.
export function buildPluginPageContent(rootDir, entry, pluginInfo) {
    const destDir = `wiki/plugins/Plugin Docs/${entry.category}/${entry.identifier}`;
    let content = fs.readFileSync(path.join(rootDir, entry.readmeRelPath), 'utf8');
    content = rewritePluginReadmeLinks(content, destDir, pluginInfo);

    const githubUrl = `https://github.com/onlypuppy7/LegacyShell/blob/main/${entry.readmeRelPath}`;
    return [
        `> **Canonical source:** [\`${entry.readmeRelPath}\`](${githubUrl}) - edit that file, not this page (this page is built live from it, nothing here is a tracked copy).`,
        '',
        content.trimEnd(),
        '',
    ].join('\n');
};
