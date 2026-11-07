// adminGetRoles / adminSetRoles: the AdminRoles tab. Edits the `ranks` block of store/config/distributed_permissions.yaml
// (the number -> name list adminRoles is checked against) plus a `rankIcons` block, an icon per rank for legacyprofiles.
// Read is Moderator+, write is Admin or the SQL password. game and client only read the file at boot, so a restart applies it.
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { ss } from '#misc';
import { requireModeratorOrAbove, checkAdminOrSql } from './auth.js';
import { recordAudit, actorFromAuth } from './auditLog.js';

const CMDS = ['adminGetRoles', 'adminSetRoles'];

export const BUILTIN_ICONS = ['player', 'creator', 'mod', 'admin', 'owner', 'developer', 'twitch', 'tiktok', 'bot', 'guest']; //legacyprofiles/client/icons/roles
const LOCKED = { 0: 'Guest', 1: 'Signed In', 10: 'Moderator', 20: 'Admin', 255: 'Superuser' }; //permissions.js looks these up by name
const PINNED = [5]; //auth.js wants a Content Creator at 5, the name is free
const MAX_SVG = 8192;

const configPath = () => path.join(ss.rootDir, 'store', 'config', 'distributed_permissions.yaml');

function view() {
    const perms = ss.config.distributed_permissions || {};
    const roles = Object.entries(perms.ranks || {}).map(([value, name]) => ({ value: Number(value), name: String(name) })).sort((a, b) => a.value - b.value);
    return { roles, icons: { ...(perms.rankIcons || {}) }, locked: Object.keys(LOCKED).map(Number), pinned: PINNED, builtin: BUILTIN_ICONS, maxSvg: MAX_SVG };
};

function cleanSvg(raw) {
    const svg = String(raw).trim();
    if (svg.length > MAX_SVG) throw new Error(`That svg is too big (${MAX_SVG} bytes max).`);
    if (!/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) throw new Error('That is not an svg.');
    if (!/viewBox\s*=/i.test(svg)) throw new Error('The svg needs a viewBox.');
    if (/<script|<foreignobject|<iframe|<image|@import|javascript:|\son[a-z]+\s*=|href\s*=\s*["']?[^#"'\s]|url\(\s*["']?[^#"'\s)]/i.test(svg)) throw new Error('That svg has something in it that is not allowed (scripts, images or links to elsewhere).');
    return svg;
};

export function validate(body) {
    if (!Array.isArray(body.roles) || body.roles.length > 256) throw new Error('Bad roles list.');
    const values = new Set(), names = new Set(), roles = [];
    for (const role of body.roles) {
        const value = Number(role?.value), name = String(role?.name ?? '').trim();
        if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Positions are whole numbers from 0 to 255.');
        if (values.has(value)) throw new Error(`Position ${value} is taken twice.`);
        if (!name || name.length > 32 || /[\x00-\x1f]/.test(name)) throw new Error(`Position ${value} needs a name of 1 to 32 characters.`);
        if (names.has(name.toLowerCase())) throw new Error(`The name ${name} is used twice.`);
        values.add(value); names.add(name.toLowerCase());
        roles.push({ value, name });
    };
    for (const [value, name] of Object.entries(LOCKED)) {
        if (!roles.some(role => role.value === Number(value) && role.name === name)) throw new Error(`${name} has to stay at ${value}.`);
    };
    for (const value of PINNED) if (!values.has(value)) throw new Error(`There has to be a rank at ${value}.`);
    roles.sort((a, b) => a.value - b.value);

    const icons = {};
    for (const [key, icon] of Object.entries(body.icons && typeof body.icons === 'object' ? body.icons : {})) {
        if (!values.has(Number(key))) continue; //the rank is gone, so is its icon
        if (typeof icon !== 'string' || !icon.trim()) continue;
        icons[Number(key)] = BUILTIN_ICONS.includes(icon) ? icon : cleanSvg(icon);
    };
    return { roles, icons };
};

function blockRange(lines, key) {
    const start = lines.findIndex(line => line.startsWith(key + ':'));
    if (start < 0) return null;
    let end = start + 1;
    while (end < lines.length && !/^[^\s#]/.test(lines[end])) end++;
    while (end - 1 > start && (lines[end - 1].trim() === '' || lines[end - 1].startsWith('#'))) end--; //blank and comment lines before the next key stay with it
    return [start, end];
};

function setBlock(lines, key, block, after) {
    const range = blockRange(lines, key);
    if (range) return lines.splice(range[0], range[1] - range[0], ...block);
    const anchor = blockRange(lines, after);
    lines.splice(anchor ? anchor[1] : lines.length, 0, '', ...block);
};

export function writeConfig({ roles, icons }) {
    const file = configPath();
    const text = fs.readFileSync(file, 'utf8'), eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const iconEntries = Object.entries(icons);
    setBlock(lines, 'ranks', ['ranks:', ...roles.map(({ value, name }) => `  ${value}: ${JSON.stringify(name)}${LOCKED[value] ? ' # do not modify' : ''}`)], 'ranks');
    setBlock(lines, 'rankIcons', [iconEntries.length ? 'rankIcons: # a built in icon name or an svg for each rank, used by legacyprofiles' : 'rankIcons: {}', ...iconEntries.map(([value, icon]) => `  ${value}: ${JSON.stringify(icon)}`)], 'ranks');
    const next = lines.join(eol);

    const parsed = yaml.load(next); //check what would be written says what was asked, not something the loader reads differently
    const same = (a, b) => JSON.stringify(Object.entries(a).sort((x, y) => x[0] - y[0])) === JSON.stringify(Object.entries(b).sort((x, y) => x[0] - y[0]));
    if (!same(parsed.ranks, Object.fromEntries(roles.map(r => [r.value, r.name]))) || !same(parsed.rankIcons || {}, icons)) throw new Error('Could not write that safely, nothing was saved.');

    fs.copyFileSync(file, file + '.bak');
    fs.writeFileSync(file, next);
    Object.assign(ss.config.distributed_permissions, { ranks: Object.fromEntries(roles.map(r => [r.value, r.name])), rankIcons: icons });
};

export function registerAdminRoles(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip, rawIp }) => {
        if (!CMDS.includes(msg.cmd)) return;
        plugins.cancel = true;

        if (msg.cmd === 'adminGetRoles') {
            if (!(await requireModeratorOrAbove(msg, ws, ip))) return;
            ws.send(JSON.stringify({ adminGetRoles: view() }));
            return;
        };

        const auth = await checkAdminOrSql(msg, ip);
        if (!auth) { ws.send(JSON.stringify({ error: 'Not authorized - editing roles needs an Admin account or the SQL password.' })); return; };
        const who = actorFromAuth(auth, msg);
        try {
            const next = validate(msg);
            writeConfig(next);
            recordAudit({ action: 'adminSetRoles', ...who, ip: rawIp, target: 'distributed_permissions.yaml', result: 'ok', detail: { roles: next.roles.length, icons: Object.keys(next.icons).length } });
            ws.send(JSON.stringify({ adminSetRoles: view() }));
        } catch (error) {
            recordAudit({ action: 'adminSetRoles', ...who, ip: rawIp, target: 'distributed_permissions.yaml', result: 'error', detail: { error: String(error?.message || error) } });
            ws.send(JSON.stringify({ error: String(error?.message || error) }));
        };
    });
};
