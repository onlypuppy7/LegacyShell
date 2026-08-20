// Generates the reference-table pages under wiki/docs/04-Plugin Development/Event Reference/
// and wiki/docs/05-Codebase Reference/Generated/ directly from source. Run with `npm run gen-docs`.
//
// Every page this script writes starts with a GENERATED banner - see
// wiki/docs/06-Contributing/docs-style-guide.md. Never hand-edit the output; edit this script
// (for how facts are extracted) or src/scripts/event-descriptions.json (for the human-written
// "fires when" prose on the event catalog) instead.
//
// Per-plugin docs are NOT generated here, on purpose - they're built live by VuePress itself
// (wiki/.vuepress/pluginDocsPlugin.js), reading straight from each plugin's own README.md at
// `vuepress build`/`dev` time. That's the one piece of content this script used to mirror to a
// tracked file that was actual prose duplicating another tracked file (a plugin's README) -
// everything below instead synthesizes new reference content out of code that was never prose
// to begin with, so there's nothing to de-duplicate there. See src/scripts/plugin-docs-lib.js
// for the shared discovery/rendering logic both that plugin and genLLMsTxt() below use.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { discoverPluginDocs, buildPluginPageContent } from './plugin-docs-lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..', '..');

const GENERATED_BANNER = '<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->';
const AI_FOOTER = '---\n*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*';

function readFile(relPath) {
    return fs.readFileSync(path.join(rootDir, relPath), 'utf8');
}

function writeFile(relPath, content) {
    const fullPath = path.join(rootDir, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('wrote', relPath);
}

function mdEscape(s) {
    return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

// ============================================================================
// 1. Plugin event catalog - parses every `plugins.emit(...)` call site with acorn.
// ============================================================================

// Which files belong to which logical bucket (and therefore which output page / which
// `type:` prefix). This grouping mirrors the sections in CLAUDE.md's hand-written catalog -
// it's structural curation (which file conceptually belongs where), not prose, so it lives
// here as code rather than in the prose sidecar.
const EVENT_SOURCE_GROUPS = [
    {
        key: 'services',
        title: '`services:` events',
        outFile: '04-Plugin Development/Event Reference/services.md',
        prefix: 'services',
        files: [
            'server-services/start-services.js',
            'server-services/src/data_management/recordsManagement.js',
        ],
    },
    {
        key: 'game-shared-logic',
        title: '`game:` events — shared logic (`src/shell/`)',
        outFile: '04-Plugin Development/Event Reference/game-shared-logic.md',
        prefix: 'game',
        files: [
            'src/shell/bullets.js', 'src/shell/catalog.js', 'src/shell/censor.js', 'src/shell/collider.js',
            'src/shell/comm.js', 'src/shell/constants.js', 'src/shell/events.js', 'src/shell/gametypes.js',
            'src/shell/guns.js', 'src/shell/isClientServer.js', 'src/shell/itemManager.js', 'src/shell/items.js',
            'src/shell/loading.js', 'src/shell/math.js', 'src/shell/munitionsManager.js', 'src/shell/permissions.js',
            'src/shell/player.js', 'src/shell/plugins.js', 'src/shell/pool.js', 'src/shell/stringWidth.js',
            'src/shell/general/misc.js', 'src/shell/general/looper.js', 'src/shell/general/prepare-babylons.js',
            'src/shell/general/wsrequest.js',
        ],
    },
    {
        key: 'game-main-thread',
        title: '`game:` events — main-thread server process',
        outFile: '04-Plugin Development/Event Reference/game-main-thread.md',
        prefix: 'game',
        files: [
            'server-game/start-game.js',
            'server-game/src/roomManager.js',
        ],
    },
    {
        key: 'game-clients',
        title: '`game:` events — per-connection client object',
        outFile: '04-Plugin Development/Event Reference/game-clients.md',
        prefix: 'game',
        files: [
            'server-game/src/client.js',
        ],
    },
    {
        key: 'game-rooms',
        title: '`game:` events — room lifecycle & tick loop',
        outFile: '04-Plugin Development/Event Reference/game-rooms.md',
        prefix: 'game',
        files: [
            'server-game/src/rooms.js',
        ],
    },
    {
        key: 'game-browser',
        title: '`game:` events — in-browser gameplay',
        outFile: '04-Plugin Development/Event Reference/game-browser.md',
        prefix: 'game',
        files: [
            'server-client/src/client-static/src/shellshock.min.js',
            'server-client/src/client-static/editor/js/mapEdit.js',
        ],
    },
    {
        key: 'client-build',
        title: '`client:` events — client server & build pipeline',
        outFile: '04-Plugin Development/Event Reference/client-build.md',
        prefix: 'client',
        files: [
            'server-client/start-client.js',
            'server-client/src/prepare-modified.js',
            'server-client/src/stampsGenerator.js',
        ],
    },
];

function extractEmitsFromFile(relPath) {
    const code = readFile(relPath);
    let ast;
    try {
        ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
    } catch (error) {
        console.warn(`  ! failed to parse ${relPath}: ${error.message}`);
        return [];
    };

    const emits = [];

    walk.simple(ast, {
        CallExpression(node) {
            const callee = node.callee;
            const isPluginsEmit =
                callee.type === 'MemberExpression' &&
                callee.property.type === 'Identifier' &&
                callee.property.name === 'emit' &&
                callee.object.type === 'Identifier' &&
                callee.object.name === 'plugins';

            if (!isPluginsEmit) return;

            const nameArg = node.arguments[0];
            let eventName = null;
            if (nameArg) {
                if (nameArg.type === 'Literal' && typeof nameArg.value === 'string') {
                    eventName = nameArg.value;
                } else if (nameArg.type === 'TemplateLiteral' && nameArg.expressions.length === 1 &&
                           nameArg.quasis.every(q => q.value.raw === '') &&
                           nameArg.expressions[0].type === 'Literal') {
                    // handles the one `plugins.emit(`${'onLoad'}`, ...)` case in the codebase
                    eventName = nameArg.expressions[0].value;
                } else {
                    eventName = `(dynamic: ${code.slice(nameArg.start, nameArg.end)})`;
                };
            };

            const payloadArg = node.arguments[1];
            const payloadText = payloadArg ? code.slice(payloadArg.start, payloadArg.end) : '';

            emits.push({
                event: eventName,
                payload: payloadText,
                file: relPath,
                line: node.loc.start.line,
            });
        },
    });

    return emits;
};

function loadEventDescriptions() {
    const p = path.join(__dirname, 'event-descriptions.json');
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8'));
};

function normalizePayloadForDisplay(text) {
    // collapse multi-line object literals onto one line for a table cell
    return text.replace(/\s*\n\s*/g, ' ').replace(/\{\s+/g, '{ ').replace(/\s+\}/g, ' }').trim();
};

function genEventCatalog() {
    const descriptions = loadEventDescriptions();
    const missing = [];

    for (const group of EVENT_SOURCE_GROUPS) {
        const rows = [];
        for (const file of group.files) {
            const emits = extractEmitsFromFile(file);
            rows.push(...emits);
        };
        // keep source order: by file (as declared above), then by line within file
        rows.sort((a, b) => group.files.indexOf(a.file) - group.files.indexOf(b.file) || a.line - b.line);

        const lines = [];
        lines.push(GENERATED_BANNER, '');
        lines.push(`# ${group.title}`, '');
        lines.push(`> **Audience:** Plugin authors and AI agents · **Prereqs:** [Events (concept)](../events-concept.md)`, '');
        lines.push(`Every \`plugins.emit(...)\` call site found in the files below, extracted directly from source - not hand-maintained. Unprefixed at the call site; \`PluginManager.emit\` adds \`${group.prefix}:\` before checking for listeners, so e.g. the first row below actually fires as \`${group.prefix}:${rows[0]?.event ?? '...'}\`.`, '');
        lines.push('| Event | Location | Payload | Fires when |');
        lines.push('|---|---|---|---|');

        for (const row of rows) {
            const key = `${row.file}#${row.event}`;
            const desc = descriptions[key];
            if (!desc && !row.event.startsWith('(dynamic')) missing.push(key);
            const descText = desc || '*(undocumented — add an entry to `src/scripts/event-descriptions.json`)*';
            lines.push(`| \`${row.event}\` | \`${row.file}:${row.line}\` | \`${mdEscape(normalizePayloadForDisplay(row.payload))}\` | ${descText} |`);
        };

        lines.push('');
        lines.push(AI_FOOTER, '');

        writeFile(path.join('wiki/docs', group.outFile), lines.join('\n'));
    };

    if (missing.length) {
        console.log(`\n${missing.length} event(s) have no description in event-descriptions.json:`);
        missing.forEach(m => console.log('  -', m));
    };

    return missing;
};

// ============================================================================
// 2. Database schema - extracts every `CREATE TABLE` string from recordsManagement.js.
// ============================================================================

function splitTopLevelCommas(text) {
    const parts = [];
    let depth = 0, current = '', inString = null;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            current += c;
            if (c === inString && text[i - 1] !== '\\') inString = null;
            continue;
        };
        if (c === "'" || c === '"') { inString = c; current += c; continue; };
        if (c === '(') depth++;
        if (c === ')') depth--;
        if (c === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; };
        current += c;
    };
    if (current.trim()) parts.push(current.trim());
    return parts;
};

// Collapses the repeated `substr(...) || substr(...) || ...` random-key generator expressions
// (used by `codes.key` and `game_servers.auth_key`) into a short, readable placeholder. The full
// expression is real and correct, just too long to usefully read in a table cell - this is a
// display simplification, not a change to what's actually being reported.
function collapseRepeatedSubstrDefault(text) {
    const repeats = (text.match(/substr\(/g) || []).length;
    if (repeats < 4) return text;
    const m = text.match(/^(\w+ TEXT PRIMARY KEY DEFAULT) \(/);
    const prefix = m ? m[1] : 'DEFAULT';
    return `${prefix} (<random ${repeats}-character string, generated via ${repeats} chained \`substr(...)\` calls - see source for the exact character set>)`;
};

function extractLineComment(line) {
    // SQL line comment, but only outside of a quoted string
    let inString = null;
    for (let i = 0; i < line.length - 1; i++) {
        const c = line[i];
        if (inString) { if (c === inString) inString = null; continue; };
        if (c === "'" || c === '"') { inString = c; continue; };
        if (c === '-' && line[i + 1] === '-') {
            return { code: line.slice(0, i), comment: line.slice(i + 2).trim() };
        };
    };
    return { code: line, comment: '' };
};

function genDatabaseSchema() {
    const relPath = 'server-services/src/data_management/recordsManagement.js';
    const code = readFile(relPath);
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

    const tables = [];
    walk.simple(ast, {
        TemplateLiteral(node) {
            const raw = node.quasis.map(q => q.value.raw).join('');
            const m = raw.match(/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*)\)\s*$/);
            if (!m) return;
            const [, tableName, rawColumnsBlock] = m;

            // strip SQL line comments per-line first, attaching each to the column name it trails,
            // so a comment on one line can't bleed into the next column's definition text
            const notesByColumn = {};
            const columnsBlock = rawColumnsBlock.split('\n').map(line => {
                const { code: stripped, comment } = extractLineComment(line);
                if (comment) {
                    const nameMatch = stripped.match(/^\s*(\w+)/);
                    if (nameMatch) notesByColumn[nameMatch[1]] = comment;
                };
                return stripped;
            }).join('\n');

            const columns = splitTopLevelCommas(columnsBlock)
                .map(c => c.replace(/\s+/g, ' ').trim())
                .filter(c => c && !/^CREATE INDEX/i.test(c))
                .map(c => {
                    const nameMatch = c.match(/^(\w+)/);
                    const note = nameMatch ? notesByColumn[nameMatch[1]] : '';
                    return { definition: collapseRepeatedSubstrDefault(c), note: note || '' };
                });
            tables.push({ tableName, columns, line: node.loc.start.line });
        },
    });
    tables.sort((a, b) => a.line - b.line);

    const lines = [];
    lines.push(GENERATED_BANNER, '');
    lines.push('# Database Schema', '');
    lines.push('> **Audience:** Server operators, plugin authors, AI agents · **Prereqs:** [The Database](../../02-Running%20a%20Server/the-database.md)', '');
    lines.push(`Every \`CREATE TABLE\` statement in \`${relPath}\`, extracted directly from source. This is the literal DDL LegacyShell runs on boot - for the editability tags (USER-EDITABLE / SYS-EDITABLE / SYS-READONLY) and what each table is *for*, see [The Database](../../02-Running%20a%20Server/the-database.md) instead; this page is the mechanical column-level reference.`, '');

    for (const table of tables) {
        lines.push(`## \`${table.tableName}\``, '');
        lines.push('| Column definition | Note |');
        lines.push('|---|---|');
        for (const col of table.columns) {
            lines.push(`| \`${mdEscape(col.definition)}\` | ${mdEscape(col.note) || '-'} |`);
        };
        lines.push('');
    };

    lines.push(AI_FOOTER, '');
    writeFile('wiki/docs/05-Codebase Reference/Generated/database-schema.md', lines.join('\n'));
};

// ============================================================================
// 3. Config reference - extracts every key + comment from src/defaultconfig/*.yaml.
// ============================================================================

function genConfigReference() {
    const dir = path.join(rootDir, 'src/defaultconfig');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml')).sort();

    const lines = [];
    lines.push(GENERATED_BANNER, '');
    lines.push('# Config Reference', '');
    lines.push('> **Audience:** Server operators, AI agents · **Prereqs:** [Config Files](../../01-Getting%20Started/config-files.md)', '');
    lines.push('Every key in every `src/defaultconfig/*.yaml` template, with its default value and the comment(s) written above/beside it in source - extracted directly, not hand-maintained. Your actual settings live in `store/config/*.yaml`, a personal copy of these defaults (see [Config Files](../../01-Getting%20Started/config-files.md)).', '');

    for (const file of files) {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        const rawLines = text.split('\n');

        lines.push(`## \`${file}\``, '');
        lines.push('| Key | Default | Comment |');
        lines.push('|---|---|---|');

        let pendingComment = [];
        const pathStack = []; // [{indent, key}]

        for (const raw of rawLines) {
            const line = raw.replace(/\r$/, '');
            const trimmed = line.trim();
            if (trimmed === '') { pendingComment = []; continue; };

            const commentOnlyMatch = trimmed.match(/^#\s?(.*)$/);
            if (commentOnlyMatch) {
                pendingComment.push(commentOnlyMatch[1]);
                continue;
            };

            const indent = line.match(/^ */)[0].length;

            const listItemMatch = line.match(/^(\s*)-\s+(.+)$/);
            if (listItemMatch) {
                const parentPath = pathStack.map(p => p.key).join('.');
                lines.push(`| \`${mdEscape(parentPath)}[]\` | \`${mdEscape(listItemMatch[2].trim())}\` | ${mdEscape(pendingComment.join(' ')) || '-'} |`);
                pendingComment = [];
                continue;
            };

            const kvMatch = line.match(/^(\s*)([^:#\s][^:]*):\s*(.*)$/);
            if (!kvMatch) { pendingComment = []; continue; };

            let [, , key, rest] = kvMatch;
            key = key.trim();

            // split trailing inline comment from the value
            let value = rest;
            let inlineComment = '';
            const hashIdx = findUnquotedHash(rest);
            if (hashIdx !== -1) {
                value = rest.slice(0, hashIdx).trim();
                inlineComment = rest.slice(hashIdx + 1).trim();
            };

            while (pathStack.length && pathStack[pathStack.length - 1].indent >= indent) pathStack.pop();
            const fullPath = [...pathStack.map(p => p.key), key].join('.');

            if (value === '') {
                // this key is a parent for nested keys below it - no row of its own unless it never gets children
                pathStack.push({ indent, key });
                pendingComment = [];
                continue;
            };

            const comment = [...pendingComment, inlineComment].filter(Boolean).join(' ');
            lines.push(`| \`${mdEscape(fullPath)}\` | \`${mdEscape(value)}\` | ${mdEscape(comment) || '-'} |`);
            pendingComment = [];
        };

        lines.push('');
    };

    lines.push(AI_FOOTER, '');
    writeFile('wiki/docs/05-Codebase Reference/Generated/config-reference.md', lines.join('\n'));
};

function findUnquotedHash(text) {
    let inString = null;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inString) { if (c === inString) inString = null; continue; };
        if (c === '"' || c === "'") { inString = c; continue; };
        if (c === '#') return i;
    };
    return -1;
};

// ============================================================================
// 4. Slash commands - extracts every `this.newCommand({...})` call in permissions.js.
// ============================================================================

function genSlashCommands() {
    const relPath = 'src/shell/permissions.js';
    const code = readFile(relPath);
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });

    const commands = [];
    walk.simple(ast, {
        CallExpression(node) {
            const callee = node.callee;
            const isNewCommand = callee.type === 'MemberExpression' && callee.property.type === 'Identifier' && callee.property.name === 'newCommand';
            if (!isNewCommand) return;

            const arg = node.arguments[0];
            if (!arg || arg.type !== 'ObjectExpression') return;

            const fields = {};
            for (const prop of arg.properties) {
                if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
                fields[prop.key.name] = code.slice(prop.value.start, prop.value.end);
            };
            commands.push({ fields, line: node.loc.start.line });
        },
    });
    commands.sort((a, b) => a.line - b.line);

    const lines = [];
    lines.push(GENERATED_BANNER, '');
    lines.push('# Slash Command Reference', '');
    lines.push('> **Audience:** Server operators, plugin authors, AI agents · **Prereqs:** [Commands](../../04-Plugin%20Development/commands.md)', '');
    lines.push(`Every built-in \`this.newCommand({...})\` call in \`${relPath}\`, extracted directly from source. Plugin-registered commands aren't included here since they don't exist until a plugin loads - see [Commands](../../04-Plugin%20Development/commands.md) for the registration mechanism itself.`, '');
    lines.push('| Command | Category | Description | Permission `[bypass, private, requireOwner]` | Input | Cheat | Location |');
    lines.push('|---|---|---|---|---|---|---|');

    for (const cmd of commands) {
        const f = cmd.fields;
        const full = f.category && f.name ? `/${f.category.replace(/['"]/g, '')} ${f.name.replace(/['"]/g, '')}` : (f.identifier || '?');
        lines.push(`| \`${mdEscape(full)}\` | ${mdEscape(f.category || '-')} | ${mdEscape((f.description || '').replace(/['"]/g, ''))} | \`${mdEscape(f.permissionLevel || '-')}\` | \`${mdEscape(f.inputType || '-')}\` | ${f.isCheat === 'true' ? 'Yes' : 'No'} | \`${relPath}:${cmd.line}\` |`);
    };

    lines.push('');
    lines.push(AI_FOOTER, '');
    writeFile('wiki/docs/05-Codebase Reference/Generated/slash-commands.md', lines.join('\n'));
};

// ============================================================================
// 5. Wire protocol opcodes - extracts Comm.Code's entries + their JSDoc comments.
// ============================================================================

function genCommOpcodes() {
    const relPath = 'src/shell/comm.js';
    const code = readFile(relPath);
    const comments = [];
    const ast = acorn.parse(code, {
        ecmaVersion: 'latest', sourceType: 'module', locations: true,
        onComment: comments,
    });

    let codeObjectNode = null;
    walk.simple(ast, {
        Property(node) {
            if (node.key.type === 'Identifier' && node.key.name === 'Code' && node.value.type === 'ObjectExpression') {
                codeObjectNode = node.value;
            };
        },
    });

    const opcodes = [];
    if (codeObjectNode) {
        for (const prop of codeObjectNode.properties) {
            if (prop.type !== 'Property') continue;
            const name = prop.key.type === 'Identifier' ? prop.key.name : code.slice(prop.key.start, prop.key.end);
            const value = code.slice(prop.value.start, prop.value.end);
            // find the nearest comment ending before this property starts, on the lines above it
            const preceding = comments
                .filter(c => c.end <= prop.start)
                .sort((a, b) => b.end - a.end)[0];
            let doc = '';
            if (preceding && code.slice(preceding.end, prop.start).trim() === '') {
                doc = preceding.value
                    .replace(/\*/g, '')
                    .replace(/@constant\s*\{[^}]*\}/g, '')
                    .replace(/@enum\s*\{[^}]*\}/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            };
            opcodes.push({ name, value, doc, line: prop.loc.start.line });
        };
    };
    opcodes.sort((a, b) => a.line - b.line);

    const lines = [];
    lines.push(GENERATED_BANNER, '');
    lines.push('# Wire Protocol Opcodes', '');
    lines.push('> **Audience:** Plugin authors, AI agents · **Prereqs:** [Networking](../../04-Plugin%20Development/networking.md)', '');
    lines.push(`Every entry in \`Comm.Code\` (\`${relPath}\`), extracted directly from source, along with its JSDoc comment where one exists. See [Networking](../../04-Plugin%20Development/networking.md) for how to register your own opcode with \`Comm.Add\`.`, '');
    lines.push('| Name | Code | Notes |');
    lines.push('|---|---|---|');

    for (const op of opcodes) {
        lines.push(`| \`${mdEscape(op.name)}\` | \`${mdEscape(op.value)}\` | ${mdEscape(op.doc) || '-'} |`);
    };

    lines.push('');
    lines.push(AI_FOOTER, '');
    writeFile('wiki/docs/05-Codebase Reference/Generated/comm-opcodes.md', lines.join('\n'));
};

// ============================================================================
// 6. llms.txt / llms-full.txt - the llmstxt.org convention: a short curated
//    index (one line per page: link + description) plus a companion full-text
//    dump of every page concatenated. llms.txt is meant to stay short and
//    scannable; llms-full.txt is meant to be long - that's the entire point of
//    having both. Both are generated from the same page set gen-wiki-reference.js
//    already knows about, so neither can drift out of sync with the real
//    sidebar the way a hand-maintained index already had.
//
//    Both files are written to wiki/.vuepress/public/ (VuePress copies that
//    directory verbatim into the built site) but per the spec they need to
//    resolve at the site's true root - https://<domain>/llms.txt, not
//    /wiki/llms.txt, since the whole wiki is mounted under a /wiki/ base path.
//    server-client/start-client.js adds two explicit routes that serve these
//    same files at the real root, alongside the existing /wiki/ static mount.
// ============================================================================

function walkMdFiles(baseDir, relDir = '') {
    const full = path.join(rootDir, baseDir, relDir);
    if (!fs.existsSync(full)) return [];
    const items = fs.readdirSync(full).filter(f => !f.startsWith('.'));
    let results = [];
    for (const item of items) {
        const itemRel = path.join(relDir, item);
        if (fs.statSync(path.join(full, item)).isDirectory()) {
            results.push(...walkMdFiles(baseDir, itemRel));
        } else if (item.endsWith('.md')) {
            results.push(itemRel.replace(/\\/g, '/'));
        };
    };
    return results;
};

function mdPathToUrl(baseDir, relMdPath) {
    const base = baseDir === 'wiki/docs' ? '/wiki/docs/' : '/wiki/plugins/';
    let urlPath;
    if (path.basename(relMdPath) === 'README.md') {
        const dir = path.dirname(relMdPath);
        urlPath = dir === '.' ? '' : `${dir}/`;
    } else {
        urlPath = relMdPath.replace(/\.md$/, '.html');
    };
    return (base + urlPath).split('/').map(seg => seg.replace(/ /g, '%20')).join('/');
};

function stripDocBoilerplate(content) {
    let c = content.replace(/\r\n/g, '\n'); // a couple of pre-existing pages use CRLF - normalize so line-based regexes below don't silently fail to match
    c = c.replace(/^(<!--[^\n]*-->\n)+\n?/, ''); // leading GENERATED banner / canonical-source comment(s)
    c = c.replace(/\n+---\n\*This page was drafted with AI assistance[^\n]*\*\n?$/, ''); // trailing AI-footer
    return c.trim();
};

// Title/description extraction over already-loaded markdown text - shared by the file-based
// extractPageSummary() below and by the plugin-doc path in genLLMsTxt(), which has no file to
// read (the content comes from buildPluginPageContent() instead).
function extractSummaryFromContent(rawContent) {
    const content = stripDocBoilerplate(rawContent);
    const lines = content.split('\n');
    let i = 0;

    let title = null;
    for (; i < lines.length; i++) {
        const m = lines[i].match(/^#\s+(.+)$/);
        if (m) { title = m[1].trim(); i++; break; };
    };

    // Skip blank lines, blockquote lines, and - for content whose first line after those is a
    // heading rather than a lead-in paragraph (some pages go straight to "## Foo") - that
    // heading line too, so the description is always real prose, never a heading's text.
    while (i < lines.length && (lines[i].trim() === '' || lines[i].trim().startsWith('>') || lines[i].trim().startsWith('#'))) i++;

    let desc = '';
    while (i < lines.length && lines[i].trim() !== '') {
        desc += (desc ? ' ' : '') + lines[i].trim();
        i++;
    };
    desc = desc.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*]/g, '');
    if (desc.length > 200) desc = desc.slice(0, 197).trimEnd() + '...';

    return { title, description: desc, content };
};

function extractPageSummary(baseDir, relMdPath) {
    const { title, description, content } = extractSummaryFromContent(readFile(path.join(baseDir, relMdPath)));
    return { title: title ?? relMdPath, description, content };
};

const LLMS_TIERS = [
    ['01-Getting Started', 'Getting Started'],
    ['02-Running a Server', 'Running a Server'],
    ['03-Content Creation', 'Content Creation'],
    ['04-Plugin Development', 'Plugin Development'],
    ['05-Codebase Reference', 'Codebase Reference'],
    ['06-Contributing', 'Contributing'],
];

function genLLMsTxt() {
    const indexLines = [
        '# LegacyShell Wiki', '',
        '> LegacyShell is a from-scratch reimplementation of the backend and client for the browser game Shell Shockers (shellshock.io) at version 0.17.0, plus original extensions (a commands system, new gamemodes, an in-game map editor, a plugin API). This file indexes the documentation wiki for humans and AI agents; see https://github.com/onlypuppy7/LegacyShell for the source. The complete text of every page below is concatenated at /llms-full.txt.', '',
        '## Documentation', '',
        "- [Documentation Home](/wiki/docs/): Router page - start here to find the right section for what you're trying to do.", '',
    ];

    const fullLines = [
        '# LegacyShell Wiki - Full Text', '',
        '> Every page in the LegacyShell documentation wiki, concatenated in full. See /llms.txt for a short curated index instead. Every page was drafted with AI assistance and reviewed for accuracy - flag anything wrong at https://github.com/onlypuppy7/LegacyShell. Generated by src/scripts/gen-wiki-reference.js from wiki/docs/ and wiki/plugins/ - do not hand-edit.', '',
    ];

    let pageCount = 0;

    const emit = (base, relPath) => {
        const { title, description, content } = extractPageSummary(base, relPath);
        indexLines.push(`- [${title}](${mdPathToUrl(base, relPath)}): ${description}`);
        fullLines.push(`## ${path.join(base, relPath).replace(/\\/g, '/')}`, '', content, '', '---', '');
        pageCount++;
    };

    for (const [dir, label] of LLMS_TIERS) {
        const files = walkMdFiles('wiki/docs', dir);
        if (!files.length) continue;
        files.sort((a, b) => {
            const ar = path.basename(a) === 'README.md', br = path.basename(b) === 'README.md';
            return ar !== br ? (ar ? -1 : 1) : a.localeCompare(b);
        });

        indexLines.push(`### ${label}`, '');
        for (const relPath of files) emit('wiki/docs', relPath);
        indexLines.push('');
    };

    indexLines.push('## Plugins', '');
    for (const f of ['README.md', 'listofplugins.md']) {
        if (fs.existsSync(path.join(rootDir, 'wiki/plugins', f))) emit('wiki/plugins', f);
    };
    indexLines.push('');

    // Plugin docs aren't files under wiki/plugins/ (see the note at the top of this script) -
    // built the same way pluginDocsPlugin.js builds the live VuePress pages, from the same
    // shared discovery/rendering logic, so llms.txt never drifts from what the site itself shows.
    const { entries: pluginEntries, pluginInfo } = discoverPluginDocs(rootDir);
    const pluginsByCategory = {};
    for (const entry of pluginEntries) {
        if (entry.nodocs) continue;
        (pluginsByCategory[entry.category] ??= []).push(entry);
    };

    for (const category of ['Default', 'Examples', 'Plugins']) {
        const categoryEntries = (pluginsByCategory[category] || [])
            .slice()
            .sort((a, b) => (a.identifier < b.identifier ? -1 : a.identifier > b.identifier ? 1 : 0));
        if (!categoryEntries.length) continue;

        indexLines.push(`### Plugins - ${category}`, '');
        for (const entry of categoryEntries) {
            const { title, description, content } = extractSummaryFromContent(buildPluginPageContent(rootDir, entry, pluginInfo));
            const url = `/wiki/plugins/Plugin%20Docs/${category}/${entry.identifier}/info.html`;
            indexLines.push(`- [${title ?? entry.identifier}](${url}): ${description}`);
            fullLines.push(`## wiki/plugins/Plugin Docs/${category}/${entry.identifier}/info.md`, '', content, '', '---', '');
            pageCount++;
        };
        indexLines.push('');
    };

    indexLines.push('## Wiki', '');
    indexLines.push('- [Wiki Home](/wiki/wiki/): Shell Shockers lore, history, and trivia - not part of /llms-full.txt.', '');

    writeFile('wiki/.vuepress/public/llms.txt', indexLines.join('\n'));
    writeFile('wiki/.vuepress/public/llms-full.txt', fullLines.join('\n'));

    console.log(`  generated llms.txt + llms-full.txt (${pageCount} pages)`);
};

// ============================================================================
// 7. Enums / lookup tables - top-level object literals in constants.js and
//    comm.js that are either explicitly JSDoc-tagged `@enum` or are plain
//    flat name->number maps (no tag needed - the shape alone says enough).
//    Deliberately excludes name->function maps (item_classes, Ease),
//    name->string maps (item_classes_strings, inputToControlMap), and
//    name->array maps (teamColors) - these hold real values, not enum-style
//    numeric codes, even though some sit right next to genuine enums in the
//    same file. `Comm.Code` already has its own dedicated page (see
//    genCommOpcodes above), so it's skipped here even though its siblings
//    Comm.Close/Worker/Chat are picked up as enums in their own right.
// ============================================================================

function isEnumDoc(doc) {
    return /@enum/.test(doc || '');
};

function isFlatAllNumberObject(objExprNode) {
    return objExprNode.properties.length > 0 && objExprNode.properties.every(p =>
        p.type === 'Property' && p.value.type === 'Literal' && typeof p.value.value === 'number');
};

function cleanEnumDoc(raw) {
    if (!raw) return '';
    return raw.replace(/\*/g, '').replace(/@enum\s*\{[^}]*\}/g, '').replace(/@constant\s*\{[^}]*\}/g, '')
        .split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim();
};

function findPrecedingComment(comments, code, beforePos) {
    const preceding = comments.filter(c => c.end <= beforePos).sort((a, b) => b.end - a.end)[0];
    if (preceding && code.slice(preceding.end, beforePos).trim() === '') return preceding.value;
    return '';
};

function renderEnumRows(objExprNode, code) {
    const rows = [];
    for (const prop of objExprNode.properties) {
        if (prop.type !== 'Property') continue;
        let key;
        if (prop.computed) key = `[${code.slice(prop.key.start, prop.key.end)}]`;
        else if (prop.key.type === 'Identifier') key = prop.key.name;
        else key = code.slice(prop.key.start, prop.key.end);

        const value = prop.value.type === 'Literal'
            ? String(prop.value.value)
            : code.slice(prop.value.start, prop.value.end).replace(/\s+/g, ' ').trim();

        rows.push({ key, value });
    };
    return rows;
};

// Top-level `export var X = {...}` object literals in one file, filtered down to enum-shaped
// ones. Also folds in a following `Object.assign(X, {...})` statement's keys where present
// (itemIdOffsetsByName and itemIdOffsetsByNameOLD both get alias keys bolted on this way) so the
// page shows the complete real key set, not just the initial literal.
function extractFileEnums(relPath) {
    const code = readFile(relPath);
    const comments = [];
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments });

    const enums = [];

    for (const stmt of ast.body) {
        const declNode = stmt.type === 'ExportNamedDeclaration' && stmt.declaration && stmt.declaration.type === 'VariableDeclaration'
            ? stmt.declaration
            : (stmt.type === 'VariableDeclaration' ? stmt : null);
        if (!declNode) continue;

        for (const decl of declNode.declarations) {
            if (!decl.init || decl.init.type !== 'ObjectExpression') continue;

            const rawDoc = findPrecedingComment(comments, code, stmt.start);
            if (!isEnumDoc(rawDoc) && !isFlatAllNumberObject(decl.init)) continue;

            const rows = renderEnumRows(decl.init, code);

            for (const other of ast.body) {
                if (other.type !== 'ExpressionStatement' || other.expression.type !== 'CallExpression') continue;
                const call = other.expression;
                const callee = call.callee;
                const isObjectAssign = callee.type === 'MemberExpression' && callee.object.type === 'Identifier' &&
                    callee.object.name === 'Object' && callee.property.type === 'Identifier' && callee.property.name === 'assign';
                if (!isObjectAssign) continue;
                const [target, extra] = call.arguments;
                if (!target || target.type !== 'Identifier' || target.name !== decl.id.name) continue;
                if (!extra || extra.type !== 'ObjectExpression') continue;
                rows.push(...renderEnumRows(extra, code));
            };

            enums.push({ name: decl.id.name, doc: cleanEnumDoc(rawDoc), rows, file: relPath, line: stmt.loc.start.line });
        };
    };

    return { enums, code, comments, ast };
};

// `comm.js` doesn't export its enum-shaped sub-tables as their own top-level declarations - they're
// nested properties of the single top-level `const Comm = {...}` object (alongside Comm.Code, which
// already has its own page, and non-enum members like the Comm.Out/In classes).
function extractCommSubEnums(relPath, code, comments, ast) {
    let commNode = null;
    for (const stmt of ast.body) {
        if (stmt.type !== 'VariableDeclaration') continue;
        for (const decl of stmt.declarations) {
            if (decl.id.type === 'Identifier' && decl.id.name === 'Comm' && decl.init && decl.init.type === 'ObjectExpression') {
                commNode = decl.init;
            };
        };
    };
    if (!commNode) return [];

    const enums = [];
    for (const prop of commNode.properties) {
        if (prop.type !== 'Property' || prop.key.type !== 'Identifier') continue;
        if (prop.key.name === 'Code') continue; // has its own dedicated page - see genCommOpcodes
        if (prop.value.type !== 'ObjectExpression') continue;

        const rawDoc = findPrecedingComment(comments, code, prop.start);
        if (!isEnumDoc(rawDoc) && !isFlatAllNumberObject(prop.value)) continue;

        enums.push({
            name: `Comm.${prop.key.name}`,
            doc: cleanEnumDoc(rawDoc),
            rows: renderEnumRows(prop.value, code),
            file: relPath,
            line: prop.loc.start.line,
        });
    };
    return enums;
};

function genEnumsReference() {
    const constantsPath = 'src/shell/constants.js';
    const commPath = 'src/shell/comm.js';

    const { enums: constantsEnums } = extractFileEnums(constantsPath);
    const { code: commCode, comments: commComments, ast: commAst } = extractFileEnums(commPath);
    const commSubEnums = extractCommSubEnums(commPath, commCode, commComments, commAst);

    const allEnums = [...constantsEnums, ...commSubEnums];

    const lines = [];
    lines.push(GENERATED_BANNER, '');
    lines.push('# Enums & Lookup Tables', '');
    lines.push('> **Audience:** Plugin authors, AI agents · **Prereqs:** [Wire Protocol Opcodes](./comm-opcodes.md)', '');
    lines.push(`Every top-level, flat, all-number-valued object literal in \`${constantsPath}\` and \`${commPath}\`, extracted directly from source - whether or not it carries a JSDoc \`@enum\` tag (most of the real ones do; a few, like \`Team\` and \`CONTROL\`, don't but are unambiguously enum-shaped anyway). Deliberately excludes name→function maps (\`item_classes\`, \`Ease\`), name→string maps (\`item_classes_strings\`, \`inputToControlMap\`), and name→array maps (\`teamColors\`) even where they sit right next to genuine enums in the same file - those hold real values, not numeric codes. \`Comm.Code\` has its own dedicated page: see [Wire Protocol Opcodes](./comm-opcodes.md).`, '');

    for (const e of allEnums) {
        lines.push(`## \`${e.name}\``, '');
        if (e.doc) lines.push(e.doc, '');
        lines.push(`Defined at \`${e.file}:${e.line}\`.`, '');
        lines.push('| Key | Value |');
        lines.push('|---|---|');
        for (const row of e.rows) {
            lines.push(`| \`${mdEscape(row.key)}\` | \`${mdEscape(row.value)}\` |`);
        };
        lines.push('');
    };

    lines.push(AI_FOOTER, '');
    writeFile('wiki/docs/05-Codebase Reference/Generated/enums-reference.md', lines.join('\n'));
};

// ============================================================================
// main
// ============================================================================

function main() {
    console.log('Generating plugin event catalog...');
    genEventCatalog();

    console.log('Generating database schema...');
    genDatabaseSchema();

    console.log('Generating config reference...');
    genConfigReference();

    console.log('Generating slash command reference...');
    genSlashCommands();

    console.log('Generating wire protocol opcode reference...');
    genCommOpcodes();

    console.log('Generating enums & lookup table reference...');
    genEnumsReference();

    console.log('Generating llms.txt / llms-full.txt...');
    genLLMsTxt();
};

main();
