// node plugins_default/legacyadmin/test-adminroles.js - the AdminRoles tab's services side, against a temp config (never the real one)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';
import misc from '#misc';
import { ss } from '#misc';

misc.instantiateSS(import.meta, [], true, true);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'adminroles-'));
fs.mkdirSync(path.join(dir, 'store', 'config'), { recursive: true });
const file = path.join(dir, 'store', 'config', 'distributed_permissions.yaml');
const original = fs.readFileSync(new URL('../../src/defaultconfig/distributed_permissions.yaml', import.meta.url), 'utf8');

const { registerAdminRoles, validate, writeConfig } = await import('./services/adminRoles.js');

function reset(text = original) {
    fs.writeFileSync(file, text);
    ss.rootDir = dir;
    ss.config = { distributed_permissions: yaml.load(text) };
};
const base = () => ({ roles: Object.entries(ss.config.distributed_permissions.ranks).map(([value, name]) => ({ value: Number(value), name })), icons: {} });
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>';

test('someone without a login cannot save', async () => {
    reset();
    const handlers = [];
    registerAdminRoles({ on: (event, fn) => handlers.push(fn) });
    const sent = [];
    await handlers[0]({ msg: { cmd: 'adminSetRoles', ...base() }, ws: { send: (s) => sent.push(JSON.parse(s)) }, ip: '', rawIp: '' });
    assert.match(sent[0].error, /Not authorized/);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
});

test('a new rank and its icons are written, and the rest of the file is left alone', () => {
    reset();
    const body = base();
    body.roles.push({ value: 30, name: 'Helper' });
    body.icons = { 5: 'creator', 30: svg };
    writeConfig(validate(body));
    const text = fs.readFileSync(file, 'utf8');
    const parsed = yaml.load(text);
    assert.equal(parsed.ranks[30], 'Helper');
    assert.equal(parsed.rankIcons[30], svg);
    assert.equal(parsed.rankIcons[5], 'creator');
    assert.deepEqual(parsed.permissions, yaml.load(original).permissions);
    assert.ok(text.includes('# examples:'), 'comments further down survive');
    assert.equal(ss.config.distributed_permissions.ranks[30], 'Helper');
    assert.ok(fs.existsSync(file + '.bak'));
});

test('writing twice does not pile up blocks, and removing a rank drops its icon', () => {
    reset();
    const body = base();
    body.roles.push({ value: 30, name: 'Helper' });
    body.icons = { 30: 'mod' };
    writeConfig(validate(body));
    const again = { roles: body.roles.filter(r => r.value !== 30), icons: { 30: 'mod', 5: 'creator' } };
    writeConfig(validate(again));
    const text = fs.readFileSync(file, 'utf8');
    assert.equal(text.split('\nranks:').length, 2);
    assert.equal(text.split('\nrankIcons:').length, 2);
    assert.deepEqual(yaml.load(text).rankIcons, { 5: 'creator' });
});

test('crlf files stay crlf', () => {
    reset(original.replace(/\r?\n/g, '\r\n'));
    const body = base();
    body.roles.push({ value: 40, name: 'Vip' });
    writeConfig(validate(body));
    assert.ok(!/[^\r]\n/.test(fs.readFileSync(file, 'utf8')));
});

test('positions and names are checked', () => {
    reset();
    const bad = (mutate, message) => { const body = base(); mutate(body); assert.throws(() => validate(body), message); };
    bad(b => b.roles.push({ value: 5, name: 'Twice' }), /taken twice/);
    bad(b => b.roles.push({ value: 256, name: 'Too high' }), /0 to 255/);
    bad(b => b.roles.push({ value: 1.5, name: 'Half' }), /0 to 255/);
    bad(b => b.roles.push({ value: 30, name: '' }), /needs a name/);
    bad(b => b.roles.push({ value: 30, name: 'admin' }), /used twice/);
    bad(b => { b.roles.find(r => r.value === 20).name = 'Boss'; }, /Admin has to stay at 20/);
    bad(b => { b.roles = b.roles.filter(r => r.value !== 10); }, /Moderator has to stay at 10/);
    bad(b => { b.roles = b.roles.filter(r => r.value !== 5); }, /rank at 5/);
    bad(b => { b.roles.find(r => r.value === 5).value = 6; }, /rank at 5/);
    const renamed = base(); renamed.roles.find(r => r.value === 5).name = 'Streamer';
    assert.equal(validate(renamed).roles.find(r => r.value === 5).name, 'Streamer');
});

test('icons: built in names and clean svgs only', () => {
    reset();
    const icons = (value) => { const body = base(); body.icons = { 5: value }; return validate(body).icons; };
    assert.deepEqual(icons('mod'), { 5: 'mod' });
    assert.deepEqual(icons(svg), { 5: svg });
    assert.deepEqual(icons(''), {});
    assert.throws(() => icons('nonsense'), /not an svg/);
    assert.throws(() => icons('<svg viewBox="0 0 1 1"><script>alert(1)</script></svg>'), /not allowed/);
    assert.throws(() => icons('<svg viewBox="0 0 1 1" onload="alert(1)"></svg>'), /not allowed/);
    assert.throws(() => icons('<svg viewBox="0 0 1 1"><image href="http://x/y.png"/></svg>'), /not allowed/);
    assert.throws(() => icons('<svg viewBox="0 0 1 1"><use href="https://x/y.svg#a"/></svg>'), /not allowed/);
    assert.throws(() => icons('<svg><path d="M0 0"/></svg>'), /viewBox/);
    assert.throws(() => icons(svg.replace('</svg>', ' '.repeat(9000) + '</svg>')), /too big/);
    assert.doesNotThrow(() => icons('<svg viewBox="0 0 1 1"><defs><path id="a" d="M0 0"/></defs><use href="#a"/></svg>'));
    const body = base(); body.icons = { 99: 'mod' };
    assert.deepEqual(validate(body).icons, {}, 'an icon for a rank that is not there is dropped');
});
