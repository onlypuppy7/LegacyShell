import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import * as CJSON from 'comment-json'; // transitive dep of puppyconfig - same parser it uses for .jsonc

const SKIP_DIRS = new Set(['node_modules', '.git', '.vuepress']);

// Recursively finds .yaml/.yml/.json files under `dir`. When `onlyStoreDirs` is true, a file only
// counts once the walk has passed through a directory literally named "store" - this mirrors the
// `**/store/` .gitignore pattern exactly, so "editable in admin" and "git-ignored" stay in sync
// without needing to parse .gitignore itself.
function walk(dir, onlyStoreDirs, insideStore, depth) {
    const results = [];
    if (depth > 8) return results;
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return results;
    };
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walk(full, onlyStoreDirs, insideStore || entry.name === 'store', depth + 1));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!['.yaml', '.yml', '.json', '.jsonc'].includes(ext)) continue;
            if (onlyStoreDirs && !insideStore) continue;
            results.push(full);
        };
    };
    return results;
};

// A file belongs to a specific plugin if its path passes through `plugins_default/<name>/` or
// `plugins/<name>/` - i.e. it's owned by one identifiable plugin folder, not shared/core state.
function belongsToAPlugin(absPath, rootDir) {
    const rel = path.relative(rootDir, absPath).split(path.sep);
    return (rel[0] === 'plugins_default' || rel[0] === 'plugins') && rel.length > 2;
};

// Builds the current whitelist of editable files, split into three groups so the admin UI can
// show `core` and `plugins` up front and keep `other` tucked away by default:
//  - `core`   - the actual hand-tunable settings directly under store/config/.
//  - `plugins`- git-ignored yaml/json owned by one specific plugin folder (its own store/ data,
//               or - for a third-party install like plugins/_mcblocks - anything of its own).
//  - `other`  - everything else that happens to be git-ignored: services' auto-synced item/map/
//               server caches (server-client/store, server-game/store, server-services/store)
//               and anything not cleanly attributable to a single plugin.
// Returns absolute paths - callers must always resolve a request against THIS list (see
// readFile/writeFile below), never trust a path a client sends directly.
export function scanEditableFiles(rootDir) {
    const configDir = path.join(rootDir, 'store', 'config');
    const core = fs.existsSync(configDir)
        ? fs.readdirSync(configDir)
            .filter(name => ['.yaml', '.yml', '.json', '.jsonc'].includes(path.extname(name).toLowerCase()))
            .map(name => path.join(configDir, name))
        : [];
    const coreSet = new Set(core);

    const fromStoreDirs = walk(rootDir, true, false, 0).filter(f => !coreSet.has(f));
    const pluginsDir = path.join(rootDir, 'plugins');
    const fromPluginsDir = fs.existsSync(pluginsDir) ? walk(pluginsDir, false, false, 0) : [];

    // A file can show up in both scans (a third-party plugin's own store/ subfolder matches both
    // "any store dir" and "under root /plugins") - de-dupe by absolute path before splitting.
    const rest = [...new Set([...fromStoreDirs, ...fromPluginsDir])];

    const plugins = rest.filter(f => belongsToAPlugin(f, rootDir));
    const other = rest.filter(f => !belongsToAPlugin(f, rootDir));

    return { core, plugins, other };
};

function parseByExt(ext, raw) {
    if (ext === '.jsonc') return CJSON.parse(raw); // comment-json - same parser puppyconfig uses
    if (ext === '.json') return JSON.parse(raw);
    return yaml.load(raw);
};

export function readFile(absPath) {
    const ext = path.extname(absPath).toLowerCase();
    const raw = fs.readFileSync(absPath, 'utf8');
    return { raw, parsed: parseByExt(ext, raw) };
};

// Writes `raw` text as-is (the admin UI edits the raw file text directly, not a parsed form,
// comments included for .jsonc) but still round-trips it through the right parser first, purely
// to reject a malformed save before it overwrites a working config file.
export function writeFile(absPath, raw) {
    const ext = path.extname(absPath).toLowerCase();
    parseByExt(ext, raw);
    fs.writeFileSync(absPath, raw, 'utf8');
};
