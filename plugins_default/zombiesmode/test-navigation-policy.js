// The zombie overrides, with real pathTo/suspend/resume and a small static map. No server needed.
// Run with: node plugins_default/zombiesmode/test-navigation-policy.js
import assert from 'node:assert/strict';
import { Plugin } from './index.js';
import { ZombiesModeDefaults } from './shared.js';
import { DeadInternetBot, DeadInternetBots } from '../deadinternet/index.js';

const mode = Plugin.prototype;
const realNow = Date.now, nowDescriptor = Object.getOwnPropertyDescriptor(performance, 'now');
let time = 100000, wall = 1000, passed = 0, failed = 0;
Date.now = () => time;
Object.defineProperty(performance, 'now', { configurable: true, value: () => wall });
const check = (name, run) => {
    try { run(); passed++; console.log('  ok - ' + name); }
    catch (error) { failed++; console.error('  FAIL - ' + name + ': ' + error.message); }
};
const solid = () => ({ idx: 1, mesh: { colliderType: 'full' }, rx: 0, ry: 0, rz: 0 });
function map() {
    const data = Array.from({ length: 20 }, () => Array.from({ length: 6 }, () => Array.from({ length: 20 }, () => ({}))));
    for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) data[x][0][z] = solid();
    return { data, width: 20, height: 6, depth: 20 };
}
async function fixture() {
    const room = { map: map(), sendToAll() {} };
    const z = { bots: [], searchFrame: wall, searchEnd: wall, searchCost: 0 };
    const init = DeadInternetBot.prototype.init, start = DeadInternetBot.prototype.startCombatAI;
    DeadInternetBot.prototype.init = async function () {
        this.player = { x: 2.5, y: 1, z: 2.5, dx: 0, dy: 0, dz: 0, modifiers: {}, controlKeys: 0,
            client: { room }, changeModifiers(mods) { Object.assign(this.modifiers, mods); } };
    };
    DeadInternetBot.prototype.startCombatAI = () => {};
    try {
        const bot = await mode.spawnZombie.call(mode, room, z, ZombiesModeDefaults);
        z.bots.push(bot);
        return { room, z, bot, goal: { x: 10.5, y: 1, z: 2.5 } };
    } finally { DeadInternetBot.prototype.init = init; DeadInternetBot.prototype.startCombatAI = start; }
}
try {
    {
        const { bot, z, goal } = await fixture();
        const route = bot.pathTo(goal, { chase: true });
        assert.ok(route?.length);
        z.noWay = new Map([['10,1,2', time + 3000]]);
        bot.suspendPath();
        check('an unreachable report from another zombie does not leave a kept route suspended', () => {
            assert.equal(bot.pathTo(goal, { chase: true }), route);
            assert.equal(bot.pathSuspended, false);
        });
    }
    {
        const { bot, z, goal } = await fixture();
        const route = bot.pathTo(goal, { chase: true });
        bot.suspendPath();
        z.searchCost = 10;
        check('resuming a route needs no search budget', () => {
            assert.equal(bot.pathTo(goal, { chase: true }), route);
            assert.equal(bot.pathSuspended, false);
        });
    }
    {
        const { bot, z, goal } = await fixture();
        bot.pathTo({ x: 2.5, y: 1, z: 12.5 }, { chase: true });
        time += 6000;
        z.noWay = new Map([['10,1,2', time + 3000]]);
        check('another zombie failing cannot keep a route to an old goal', () => {
            const route = bot.pathTo(goal, { chase: true });
            assert.equal(route.at(-1).x, goal.x);
            assert.equal(route.at(-1).z, goal.z);
        });
        const old = bot.currentPath;
        check('forced recovery bypasses the unreachable cooldown', () => assert.notEqual(bot.pathTo(goal, { chase: true, force: true }), old));
    }
    {
        const { bot, z, goal } = await fixture();
        z.searchCost = 10;
        check('waiting for the horde budget does not label a goal unreachable', () => {
            assert.equal(bot.pathTo(goal, { chase: true }), null);
            assert.equal(z.noWay?.has('10,1,2') ?? false, false);
            assert.equal(bot.pathFailCount, 0);
        });
    }
    {
        const { bot, room } = await fixture();
        bot.combat = { target: { x: 8.5, y: 1, z: 2.5 } };
        const think = () => {
            bot.zPath = 0;
            const cmd = { engaged: true, state: 'engage', fire: false, controls: 1 };
            mode.zombieThink(bot, cmd);
            return cmd;
        };
        check('a clear floor keeps direct pursuit', () => assert.equal(think().engaged, true));
        room.map.data[5][0][2] = {};
        check('a hole beyond the next step hands over before the zombie reaches its edge', () => assert.equal(think().engaged, false));
        room.map.data[5][0][2] = { idx: 1, mesh: { colliderType: 'aabb' } };
        check('a prop in a hole is not assumed to fill the floor', () => assert.equal(think().engaged, false));
        room.map.data[5][0][2] = solid();
        room.map.data[5][1][2] = solid();
        check('a low wall needs a route even when the human is visible over it', () => assert.equal(think().engaged, false));
        room.map.data[5][1][2] = {};
        bot.combat.target = { x: 3.5, y: 1, z: 2.5 };
        check('direct movement faces the safe direction immediately', () => assert.equal(think().yaw, Math.PI / 2));
    }
    {
        const { bot, goal } = await fixture();
        bot.currentPath = [{ ...goal, type: 'jump' }];
        let jumps = 0;
        bot.player.jump = () => jumps++;
        bot.combat = { nearestHostile: () => ({ x: bot.player.x + 1, y: 2, z: bot.player.z }) };
        const rng = Math.random;
        Math.random = () => 0;
        try {
            mode.zombieDrive(bot, { engaged: false, moveTo: goal });
            check('incidental jumping cannot interrupt a route jump', () => assert.equal(jumps, 0));
            bot.currentPath = null;
            mode.zombieDrive(bot, { engaged: false, moveTo: goal });
            check('a zombie without a route still tries a recovery jump', () => assert.equal(jumps, 1));
        } finally { Math.random = rng; }
    }
} finally {
    Date.now = realNow;
    if (nowDescriptor) Object.defineProperty(performance, 'now', nowDescriptor); else delete performance.now;
    DeadInternetBots.length = 0;
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
