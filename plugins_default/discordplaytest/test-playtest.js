import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import misc, { ss } from '#misc';
import { PlaytestAccess, parseDuration } from './access.js';
import { Plugin } from './index.js';

misc.instantiateSS(import.meta, [], true, true);

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'discordplaytest-'));
    t.after(() => {
        assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
        assert.ok(path.basename(dir).startsWith('discordplaytest-'));
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    });
    return { dir, access: new PlaytestAccess(path.join(dir, 'state.json')) };
};

function interaction(id, commandName, options = {}) {
    return {
        user: { id }, commandName, guildId: '100',
        options: {
            getUser: key => options[key] ? { id: options[key] } : null,
            getBoolean: key => options[key],
            getString: key => options[key],
        },
        reply: async function (message) { this.message = message; },
    };
};

function commandPlugin(access) {
    return Object.assign(Object.create(Plugin.prototype), { access, ownerId: '1', config: { guild_id: '100' } });
};

test('duration bounds and malformed input', () => {
    assert.equal(parseDuration('2h'), 7200000);
    assert.equal(parseDuration('30m'), 1800000);
    assert.equal(parseDuration('7D'), 604800000);
    for (const input of ['0m', '8d', '-1h', '1.5h', '2h rubbish', '999999999999999h', '', null]) {
        assert.equal(parseDuration(input), null);
    };
});

test('hashed credentials survive restart, rotate and expire at the deadline', t => {
    const { dir, access } = fixture(t);
    access.approve('2', true);
    const pass = access.issue('2', 60000);
    assert.equal(access.check('playtest', pass.password), true);
    assert.equal(access.check('wrong', pass.password), false);
    assert.equal(access.check('playtest', 'wrong'), false);
    assert.equal(access.check('playtest', null), false);
    const saved = fs.readFileSync(path.join(dir, 'state.json'), 'utf8');
    assert.equal(saved.includes(pass.password), false);
    const restored = new PlaytestAccess(path.join(dir, 'state.json'));
    assert.equal(restored.approved('2'), true);
    assert.equal(restored.check('playtest', pass.password), true);
    const rotated = restored.issue('2', 60000);
    assert.equal(restored.check('playtest', pass.password), false);
    assert.equal(restored.check('playtest', rotated.password), true);
    const now = Date.now;
    Date.now = () => rotated.expiresAt;
    try {
        assert.equal(restored.check('playtest', rotated.password), false);
        assert.equal(new PlaytestAccess(path.join(dir, 'state.json')).check('playtest', rotated.password), false);
    } finally { Date.now = now; };
});

test('only owner approves; approval removal revokes access', async t => {
    const { access } = fixture(t);
    const plugin = commandPlugin(access);
    const denied = interaction('2', 'playtest-approve', { user: '3' });
    await plugin.handleCommand(denied);
    assert.match(denied.message.content, /Only the bot owner/);
    assert.equal(access.approved('3'), false);
    await plugin.handleCommand(interaction('1', 'playtest-approve', { user: '2' }));
    assert.equal(access.approved('2'), true);
    const issue = interaction('2', 'playtest', { duration: '2h' });
    await plugin.handleCommand(issue);
    assert.equal(issue.message.flags, 64);
    const password = /playtest:([a-f0-9]+)/.exec(issue.message.content)[1];
    assert.equal(access.check('playtest', password), true);
    await plugin.handleCommand(interaction('1', 'playtest-unapprove', { user: '2' }));
    assert.equal(access.approved('2'), false);
    assert.equal(access.check('playtest', password), false);
    const blocked = interaction('2', 'playtest', { duration: '2h' });
    await plugin.handleCommand(blocked);
    assert.match(blocked.message.content, /approve you first/);
});

test('clear permissions, scope and owner bypass', async t => {
    const { access } = fixture(t);
    const plugin = commandPlugin(access);
    access.approve('2', true);
    const first = access.issue('2', 60000);
    const second = access.issue('3', 60000);
    await plugin.handleCommand(interaction('2', 'playtest-clear', { user: '3' }));
    await plugin.handleCommand(interaction('2', 'playtest-clear', { all: true }));
    assert.equal(access.check('playtest', second.password), true);
    const wrongGuild = interaction('1', 'playtest-clear', { all: true });
    wrongGuild.guildId = '200';
    await plugin.handleCommand(wrongGuild);
    assert.equal(access.check('playtest', second.password), true);
    await plugin.handleCommand(interaction('2', 'playtest-clear'));
    assert.equal(access.check('playtest', first.password), false);
    assert.equal(access.check('playtest', second.password), true);
    await plugin.handleCommand(interaction('1', 'playtest-clear', { user: '3' }));
    assert.equal(access.check('playtest', second.password), false);
    const ownerIssue = interaction('1', 'playtest', { duration: '2h' });
    await plugin.handleCommand(ownerIssue);
    assert.match(ownerIssue.message.content, /playtest:/);
    await plugin.handleCommand(interaction('1', 'playtest-clear', { all: true }));
    assert.deepEqual(access.state.passes, {});
    assert.equal(access.approved('2'), true);
});

test('first client run creates disabled config; other roles do nothing', async t => {
    const { dir } = fixture(t);
    const hooks = {};
    const manager = { type: 'game', on: (event, listener) => { hooks[event] = listener; } };
    new Plugin(manager, dir);
    assert.equal(fs.existsSync(path.join(dir, 'store')), false);
    ss.config = { client: { login: { enabled: false, username: 'legacy', password: 'static' } } };
    manager.type = 'client';
    new Plugin(manager, dir);
    const configPath = path.join(dir, 'store', 'config.json');
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath)), { enabled: false, token: '', guild_id: '' });
    assert.equal(ss.config.client.login.enabled, false);
    assert.deepEqual(hooks, {});
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true, token: '' }));
    new Plugin(manager, dir);
    assert.deepEqual(hooks, {});
    fs.writeFileSync(configPath, JSON.stringify({ enabled: false, token: 'test' }));
    new Plugin(manager, dir);
    assert.deepEqual(hooks, {});
    class OfflinePlugin extends Plugin { async startBot() { this.started = true; }; };
    fs.writeFileSync(configPath, JSON.stringify({ enabled: true, token: 'test' }));
    const plugin = new OfflinePlugin(manager, dir);
    await plugin.ready;
    assert.equal(plugin.started, true);
    assert.equal(ss.config.client.login.enabled, true);
    assert.equal(ss.config.client.login.password, 'static');
    assert.equal(typeof hooks['client:onCheckPassword'], 'function');
    ss.config.client.login.enabled = false;
    hooks['client:onConfigInfoLoaded']();
    assert.equal(ss.config.client.login.enabled, true);
});

test('actual core password checker accepts temporary/static passwords and rejects revoked ones', async t => {
    const { access } = fixture(t);
    const plugin = commandPlugin(access);
    const pass = access.issue('2', 60000);
    const source = fs.readFileSync(fileURLToPath(new URL('../../server-client/start-client.js', import.meta.url)), 'utf8');
    const start = source.indexOf('    const checkPassword =');
    const end = source.indexOf('    //all this is retrieving the config:', start);
    assert.ok(start >= 0 && end > start);
    const check = vm.runInNewContext(source.slice(start, end) + '\ncheckPassword;', {
        ss: { config: { client: { login: { username: 'legacy', password: 'static' } } } },
        plugins: { cancel: false, emit: async (event, data) => plugin.checkPassword(data) },
        Buffer, console, safeEqual: (a, b) => a === b,
    });
    const request = async credentials => {
        let accepted = false;
        const res = { set() {}, status() { return this; }, send() {} };
        await check({ headers: { authorization: 'Basic ' + Buffer.from(credentials).toString('base64') } }, res, () => { accepted = true; });
        return accepted;
    };
    assert.equal(await request('playtest:' + pass.password), true);
    assert.equal(await request('legacy:static'), true);
    assert.equal(await request('playtest:nope'), false);
    access.clear('2');
    assert.equal(await request('playtest:' + pass.password), false);
    assert.equal(await request('legacy:static'), true);
});

test('command registration preserves unrelated commands and uses team owner', async t => {
    const { access } = fixture(t);
    const plugin = commandPlugin(access);
    const registered = [];
    plugin.bot = { application: { fetch: async () => ({
        owner: { id: '999', ownerId: '1' },
        commands: { create: async (command, guild) => registered.push({ command, guild }) },
    }) } };
    await plugin.setupCommands();
    assert.equal(plugin.ownerId, '1');
    assert.deepEqual(registered.map(entry => entry.command.name), ['playtest', 'playtest-clear', 'playtest-approve', 'playtest-unapprove']);
    assert.ok(registered.every(entry => entry.guild === '100'));
});

test('invalid saved state fails closed', t => {
    const { dir } = fixture(t);
    const file = path.join(dir, 'state.json');
    fs.writeFileSync(file, JSON.stringify({ approved: ['2'], passes: { 2: { hash: 'bad', expiresAt: Date.now() + 60000 } } }));
    assert.throws(() => new PlaytestAccess(file), /Invalid discordplaytest/);
});

test('broken state leaves the HTTP gate on and the original credentials intact', t => {
    const { dir } = fixture(t);
    fs.mkdirSync(path.join(dir, 'store'));
    fs.writeFileSync(path.join(dir, 'store', 'config.json'), JSON.stringify({ enabled: true, token: 'test' }));
    fs.writeFileSync(path.join(dir, 'store', 'state.json'), 'broken');
    ss.config = { client: { login: { enabled: false, username: 'legacy', password: 'static' } } };
    const hooks = {};
    const plugin = new Plugin({ type: 'client', on: (event, listener) => { hooks[event] = listener; } }, dir);
    assert.equal(ss.config.client.login.enabled, true);
    const data = { login: 'playtest', password: 'wrong', auth: { login: 'legacy', password: 'static' } };
    hooks['client:onCheckPassword'](data);
    assert.deepEqual(data.auth, { login: 'legacy', password: 'static' });
    assert.equal(plugin.bot, undefined);
});
