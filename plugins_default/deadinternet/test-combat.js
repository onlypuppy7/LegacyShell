// Standalone tests for combat.js - pure logic, no running server needed. Uses mock players and a
// synthetic `map.data` grid (same shape as test-pathfinding.js's fixtures), and a seeded RNG so
// every run is deterministic.
//
// Run with: node plugins_default/deadinternet/test-combat.js
//
// Like test-pathfinding.js, this covers the decision logic in isolation. It does NOT prove a
// bot's shots actually land in a live room - that needs a running game server.

import {
    CombatController, resolveCombatOptions, parseCombatArgs, coerceOption, listPresets,
    registerPreset, hasLineOfSight, hasGroundAhead, angleDiff, stepAngle, anglesTo, COMBAT_OPTIONS,
    weaponProfile, setClassProvider, resolveClassIndex, angleBetweenDirs, dirFromAngles,
    SoundTracker, findCover, solveGrenadeThrow, resolveShellColor, SHELL_COLORS,
} from './combat.js';
import { FIELD_SCENARIOS, listScenarios, planField, allocate } from './scenarios.js';

let passed = 0, failed = 0;

function assert(name, condition, detail = '') {
    if (condition) {
        passed++;
        console.log(`  ok - ${name}`);
    } else {
        failed++;
        console.log(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`);
    };
};

function makeMap(width, height, depth) {
    const data = [];
    for (let x = 0; x < width; x++) {
        data[x] = [];
        for (let y = 0; y < height; y++) {
            data[x][y] = [];
            for (let z = 0; z < depth; z++) data[x][y][z] = {};
        };
    };
    return { data, width, height, depth };
};

function setCell(map, x, y, z, colliderType) {
    map.data[x][y][z] = { idx: 1, mesh: { colliderType }, rx: 0, ry: 0, rz: 0 };
};

function flatMap(size = 40) {
    const map = makeMap(size, 6, size);
    for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) setCell(map, x, 0, z, 'full');
    return map;
};

// Seeded RNG (mulberry32) so error sampling/strafing are reproducible.
function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

// Real weapon stats, copied from guns.js (and the Crackshot plugin's M24) - the controller derives
// everything weapon-specific from these, so the fixtures need to be the real numbers.
const GUNS = {
    eggk: { weaponName: 'EggK-47', range: 20, velocity: 0.5, accuracy: 12, automatic: true, rof: 3600 / 550, shotSpreadIncrement: 40 },
    dozen: { weaponName: 'Dozen Gauge', range: 7, velocity: 0.45, accuracy: 30, automatic: false, rof: 15, shotSpreadIncrement: 120 },
    csg: { weaponName: 'CSG-1', range: 50, velocity: 0.6, accuracy: 0, automatic: false, rof: 60, shotSpreadIncrement: 180 },
    cluck: { weaponName: 'Cluck 9mm', range: 15, velocity: 0.45, accuracy: 26, automatic: false, rof: 6 },
    rpegg: { weaponName: 'RPEGG', range: 45, velocity: 0.2, accuracy: 5, radius: 3, readySpread: 5, automatic: false, rof: 80 },
    m24: { weaponName: 'M2DZ', range: 60, velocity: 0.6, accuracy: 1, automatic: false, rof: 15 },
};

function mockWeapon({ rounds = 30, capacity = 30, store = 90 } = {}, subClass = GUNS.eggk) {
    return { ammo: { rounds, capacity, store }, subClass };
};

function mockPlayer(extra = {}) {
    return {
        id: 1, team: 0, playing: true, x: 5.5, y: 1, z: 5.5, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0,
        modifiers: { scale: 1, bulletSpeedModifier: 1 },
        jumping: false, isFalling: false, hp: 100, shotSpread: 0, grenadeCount: 2, grenadeCountdown: 0, grenadesQueued: 0,
        weaponIdx: 0, weapons: [mockWeapon(), mockWeapon()], reloadCountdown: 0, swapWeaponCountdown: 0,
        client: { isHuman: false },
        ...extra,
    };
};

function mockHuman(extra = {}) {
    return mockPlayer({ id: 2, client: { isHuman: true }, x: 5.5, y: 1, z: 15.5, ...extra });
};

function makeController(player, others, options = {}, extra = {}) {
    player.weapon = player.weapons[player.weaponIdx];
    for (const o of others) o.weapon ??= o.weapons[0];
    // Tests expect hits, identical bots and no grenade interruptions unless they ask otherwise, so misses, per-bot variance and grenades default off.
    const resolvedOptions = { variance: 0, grenades: 0, ...(options.difficulty || options.skill !== undefined ? {} : { missChance: 0 }), ...options };
    return new CombatController({
        player,
        map: extra.map ?? flatMap(),
        iteratePlayers: (cb) => { for (const o of [player, ...others]) if (cb(o) === false) break; },
        owner: extra.owner ?? null,
        getAmmoCrates: extra.crates ? () => extra.crates : undefined,
        getPickups: extra.pickups ? (kind) => extra.pickups[kind] ?? [] : undefined,
        sounds: extra.sounds,
        squad: extra.squad,
        now: extra.now,
        rng: seeded(1234),
    }, resolvedOptions);
};

// Runs the controller for `seconds` of game time at 60Hz, applying yaw/pitch back to the player the
// way DeadInternetBot.applyCombat does, and returns every command it produced.
function run(ctl, seconds, hz = 60) {
    const cmds = [];
    for (let i = 0; i < seconds * hz; i++) {
        const cmd = ctl.update(1 / hz);
        if (cmd.engaged) { ctl.player.yaw = cmd.yaw; ctl.player.pitch = cmd.pitch; };
        cmds.push(cmd);
    };
    return cmds;
};

// --- Options / presets -------------------------------------------------------------------
{
    console.log('Test: option resolution and presets');
    const base = resolveCombatOptions();
    assert('no errors for defaults', base.errors.length === 0, base.errors.join('; '));
    assert('default difficulty is normal (speed 0.6)', base.options.speed === 0.6);

    const hard = resolveCombatOptions({ difficulty: 'hard' });
    assert('hard preset tightens aim', hard.options.aimErrorDeg < base.options.aimErrorDeg);
    assert('hard preset shortens reaction time', hard.options.reactionTime < base.options.reactionTime);

    const mixed = resolveCombatOptions({ difficulty: 'hard', aimErrorDeg: '0.2', role: 'ally' });
    assert('explicit override beats preset', mixed.options.aimErrorDeg === 0.2);
    assert('preset values not overridden are kept', mixed.options.reactionTime === hard.options.reactionTime);

    const aliased = resolveCombatOptions({ aim: 3, 'fire_cone_deg': 9 });
    assert('aliases and snake_case resolve', aliased.options.aimErrorDeg === 3 && aliased.options.fireConeDeg === 9, JSON.stringify(aliased.errors));

    assert('unknown option is an error', resolveCombatOptions({ banana: 1 }).errors.length === 1);
    assert('unknown difficulty is an error', resolveCombatOptions({ difficulty: 'impossible' }).errors.length === 1);
    assert('out-of-range number is clamped with a warning', (() => {
        const r = resolveCombatOptions({ aimErrorDeg: 9999 });
        return r.options.aimErrorDeg === COMBAT_OPTIONS.aimErrorDeg.max && r.warnings.length === 1 && r.errors.length === 0;
    })());
    assert('bad enum is an error', coerceOption('role', 'wizard').error !== undefined);
    assert('bool accepts on/off', coerceOption('holdFire', 'on').value === true && coerceOption('holdFire', 'off').value === false);
    assert('nullable number accepts "default"', coerceOption('speed', 'default').value === null);
    assert('min/max preferred range reconciled', (() => {
        const r = resolveCombatOptions({ preferredRangeMin: 30, preferredRangeMax: 10 });
        return r.options.preferredRangeMax === 30 && r.warnings.length === 1;
    })());

    assert('custom preset registers and applies', (() => {
        registerPreset('sniper', { sightRange: 200, maxFireRange: 200, engageMovement: 'static', burstShots: 1 });
        return listPresets().includes('sniper') && resolveCombatOptions({ difficulty: 'sniper' }).options.maxFireRange === 200;
    })());
    assert('registerPreset rejects unknown options', (() => { try { registerPreset('bad', { nope: 1 }); return false; } catch { return true; } })());
};

// --- Arg parsing -------------------------------------------------------------------------
{
    console.log('Test: /bots add argument parsing');
    const a = parseCombatArgs('3 hard aim=1.5 role=ally');
    assert('parses count, preset and overrides', a.count === 3 && a.difficulty === 'hard' && a.overrides.aim === '1.5' && a.overrides.role === 'ally' && a.errors.length === 0);
    const b = parseCombatArgs('');
    assert('empty input gives defaults', b.count === 1 && b.difficulty === 'normal' && b.errors.length === 0);
    const c = parseCombatArgs('easy 4');
    assert('order of count/preset is free', c.count === 4 && c.difficulty === 'easy');
    assert('unknown bare word is an error', parseCombatArgs('banana').errors.length === 1);
    assert('count out of range is an error', parseCombatArgs('99').errors.length === 1);
    assert('key= with no value is an error', parseCombatArgs('aim=').errors.length === 1);
};

// --- Geometry ----------------------------------------------------------------------------
{
    console.log('Test: angles, line of sight, ground checks');
    assert('angleDiff wraps across +-PI', Math.abs(angleDiff(3.0, -3.0) - (2 * Math.PI - 6.0)) < 1e-9);
    assert('stepAngle takes the short way round', stepAngle(3.0, -3.0, 0.1) > 3.0);
    assert('stepAngle lands exactly when in reach', stepAngle(0, 0.05, 0.1) === 0.05);

    const a = anglesTo({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 10 });
    assert('looking +z is yaw 0, pitch 0', Math.abs(a.yaw) < 1e-9 && Math.abs(a.pitch) < 1e-9);
    assert('looking down gives positive pitch', anglesTo({ x: 0, y: 5, z: 0 }, { x: 0, y: 0, z: 5 }).pitch > 0);

    const map = flatMap();
    assert('clear line of sight on open floor', hasLineOfSight(map, { x: 5.5, y: 1.3, z: 5.5 }, { x: 5.5, y: 1.3, z: 15.5 }));
    for (let y = 1; y <= 3; y++) setCell(map, 5, y, 10, 'full');
    assert('a wall blocks line of sight', !hasLineOfSight(map, { x: 5.5, y: 1.3, z: 5.5 }, { x: 5.5, y: 1.3, z: 15.5 }));
    assert('sight around the wall is clear', hasLineOfSight(map, { x: 5.5, y: 1.3, z: 5.5 }, { x: 8.5, y: 1.3, z: 15.5 }));
    assert('diagonal sight across open floor', hasLineOfSight(map, { x: 20.5, y: 1.3, z: 20.5 }, { x: 30.5, y: 2.3, z: 31.5 }));

    const ledge = flatMap();
    for (let z = 0; z < 40; z++) for (let x = 20; x < 40; x++) ledge.data[x][0][z] = {};
    assert('ground ahead on solid floor', hasGroundAhead(ledge, 10.5, 1, 10.5, 1, 0));
    assert('no ground ahead at a drop', !hasGroundAhead(ledge, 19.6, 1, 10.5, 1, 0));
    assert('ground check respects direction (still solid sideways)', hasGroundAhead(ledge, 19.6, 1, 10.5, 0, 1));
};

// --- Controller --------------------------------------------------------------------------
{
    console.log('Test: target acquisition');
    const bot = mockPlayer();
    const human = mockHuman();
    const ctl = makeController(bot, [human], { difficulty: 'normal', jumpChance: 0 });
    const cmds = run(ctl, 0.5);
    assert('engages a visible human', cmds[cmds.length - 1].engaged && ctl.target === human);

    const map = flatMap();
    for (let y = 1; y <= 3; y++) for (let x = 3; x <= 8; x++) setCell(map, x, y, 10, 'full');
    const bot2 = mockPlayer(), human2 = mockHuman();
    const ctl2 = makeController(bot2, [human2], { jumpChance: 0 }, { map });
    const cmds2 = run(ctl2, 0.5);
    assert('does not engage through a wall', !cmds2[cmds2.length - 1].engaged && !ctl2.target);
    assert('enemy hunts the human it cannot see', cmds2[cmds2.length - 1].state === 'hunt' && Math.hypot(cmds2[cmds2.length - 1].moveTo.x - human2.x, cmds2[cmds2.length - 1].moveTo.z - human2.z) < 2);

    const far = mockHuman({ z: 5.5 + 80 });
    const ctl3 = makeController(mockPlayer(), [far], { sightRange: 45 }, { map: flatMap(100) });
    run(ctl3, 0.5);
    assert('does not notice targets beyond sightRange', !ctl3.target);

    const behind = mockHuman({ z: 5.5 - 10 });
    const ctl4 = makeController(mockPlayer(), [behind], { fovDeg: 90 });
    run(ctl4, 0.5);
    assert('fov limits noticing targets behind the bot', !ctl4.target);
    const ctl4b = makeController(mockPlayer(), [mockHuman({ z: 5.5 - 10 })], { fovDeg: 360 });
    run(ctl4b, 0.5);
    assert('360 fov notices targets behind', !!ctl4b.target);
};

{
    console.log('Test: friend/foe filtering');
    const bot = mockPlayer({ team: 1 });
    const mate = mockHuman({ team: 1 });
    const ctl = makeController(bot, [mate]);
    run(ctl, 0.5);
    assert('never targets a teammate', !ctl.target);

    const ffaBot = mockPlayer({ team: 0 });
    const other = mockHuman({ team: 0 });
    const ctlFfa = makeController(ffaBot, [other]);
    run(ctlFfa, 0.5);
    assert('team 0 (free for all) is fair game', ctlFfa.target === other);

    const botB = mockPlayer({ id: 3 });
    const ctlHumans = makeController(mockPlayer(), [botB], { targets: 'humans' });
    run(ctlHumans, 0.5);
    assert('targets=humans ignores other bots', !ctlHumans.target);
    const ctlBots = makeController(mockPlayer(), [mockPlayer({ id: 3 })], { targets: 'bots' });
    run(ctlBots, 0.5);
    assert('targets=bots engages bots', !!ctlBots.target);

    const owner = mockHuman();
    const ally = makeController(mockPlayer(), [owner], { role: 'ally' }, { owner });
    run(ally, 0.5);
    assert('never targets its owner', !ally.target);
};

{
    console.log('Test: aim and fire control');
    const bot = mockPlayer({ yaw: Math.PI }); // facing directly away
    const human = mockHuman();
    const ctl = makeController(bot, [human], { reactionTime: 0.4, aimErrorDeg: 0, fireConeDeg: 3, burstShots: 0, jumpChance: 0, turnRateDeg: 360, engageMovement: 'static', fovDeg: 360, peripheralDeg: 360, sprayControl: 0, flinch: 0 });
    const cmds = run(ctl, 2);
    const firstFire = cmds.findIndex((c) => c.fire);
    assert('eventually fires', firstFire >= 0);
    assert('does not fire before the reaction time', firstFire / 60 >= 0.4, `fired at ${(firstFire / 60).toFixed(2)}s`);
    assert('does not fire before the aim has swung to within the cone (180deg at 360deg/s, 3deg cone)', firstFire / 60 >= 0.45, `fired at ${(firstFire / 60).toFixed(2)}s`);
    assert('aim settles on the target', Math.abs(angleDiff(bot.yaw, 0)) < 0.02, `yaw ${bot.yaw}`);
    assert('keeps firing once on target', cmds.slice(-30).every((c) => c.fire));
    assert('fire bit is in the controls mask', cmds[cmds.length - 1].controls & 32);

    const dummy = makeController(mockPlayer(), [mockHuman()], { holdFire: true, reactionTime: 0 });
    assert('holdFire never shoots', run(dummy, 2).every((c) => !c.fire));

    const empty = mockPlayer({ weapons: [mockWeapon({ rounds: 0, store: 0 }), mockWeapon({ rounds: 0, store: 0 })] });
    const ctlEmpty = makeController(empty, [mockHuman()], { reactionTime: 0 });
    assert('does not fire an empty weapon', run(ctlEmpty, 1).every((c) => !c.fire));

    const tooFar = makeController(mockPlayer(), [mockHuman({ z: 5.5 + 30 })], { maxFireRange: 20, sightRange: 50, reactionTime: 0, engageMovement: 'static' }, { map: flatMap(60) });
    assert('does not fire beyond maxFireRange', run(tooFar, 1.5).every((c) => !c.fire));

    // Burst: fires 3 rounds then pauses. The mock drains ammo itself, the way the real fire() does.
    const burstBot = mockPlayer();
    const burstCtl = makeController(burstBot, [mockHuman()], { reactionTime: 0, aimErrorDeg: 0, burstShots: 3, burstPause: 0.5, jumpChance: 0, engageMovement: 'static', fireConeDeg: 10 });
    let shots = 0, pausedTicks = 0, maxStreak = 0, streak = 0;
    for (let i = 0; i < 60 * 2; i++) {
        const c = burstCtl.update(1 / 60);
        if (c.engaged) { burstBot.yaw = c.yaw; burstBot.pitch = c.pitch; };
        if (c.fire) { burstBot.weapon.ammo.rounds--; shots++; streak++; maxStreak = Math.max(maxStreak, streak); }
        else { streak = 0; if (shots) pausedTicks++; };
    };
    assert('burst fire limits consecutive rounds', maxStreak <= 3, `streak ${maxStreak}`);
    assert('burst fire pauses between bursts', pausedTicks >= 20, `paused ticks ${pausedTicks}`);
    assert('burst fire still fires repeatedly', shots > 3, `shots ${shots}`);
};

{
    console.log('Test: aim error scales with difficulty');
    function meanOffset(difficulty) {
        const bot = mockPlayer(), human = mockHuman();
        const ctl = makeController(bot, [human], { difficulty, jumpChance: 0, engageMovement: 'static', reactionTime: 0 });
        const truth = anglesTo({ x: bot.x, y: bot.y + 0.34, z: bot.z }, { x: human.x, y: human.y + 0.32, z: human.z });
        let sum = 0, n = 0;
        for (let i = 0; i < 60 * 8; i++) {
            const c = ctl.update(1 / 60);
            if (!c.engaged) continue;
            bot.yaw = c.yaw; bot.pitch = c.pitch;
            if (i > 60) { sum += Math.abs(angleDiff(c.yaw, truth.yaw)); n++; };
        };
        return sum / n;
    };
    const easy = meanOffset('easy'), hard = meanOffset('hard'), nightmare = meanOffset('nightmare');
    assert('easy aims worse than hard', easy > hard, `${easy.toFixed(4)} vs ${hard.toFixed(4)}`);
    assert('hard aims worse than nightmare', hard > nightmare, `${hard.toFixed(4)} vs ${nightmare.toFixed(4)}`);
};

{
    console.log('Test: reload / swap');
    const low = mockPlayer({ weapons: [mockWeapon({ rounds: 2, capacity: 30, store: 60 }), mockWeapon()] });
    const idle = makeController(low, [], { reloadBelow: 0.3 });
    const idleCmds = run(idle, 1);
    assert('reloads when idle and magazine is low', idleCmds.some((c) => c.reload));

    const noReload = makeController(mockPlayer({ weapons: [mockWeapon({ rounds: 2, capacity: 30, store: 60 }), mockWeapon()] }), [], { autoReload: false });
    assert('autoReload=false never reloads', run(noReload, 1).every((c) => !c.reload));

    const swapBot = mockPlayer({ weapons: [mockWeapon({ rounds: 0, store: 0 }), mockWeapon({ rounds: 10 })] });
    const swapCtl = makeController(swapBot, [mockHuman()], { reactionTime: 0 });
    const swapCmds = run(swapCtl, 1);
    assert('swaps to the loaded weapon when fighting with an empty one', swapCmds.some((c) => c.swap === 1));

    const noSwap = makeController(mockPlayer({ weapons: [mockWeapon({ rounds: 0, store: 0 }), mockWeapon({ rounds: 10 })] }), [mockHuman()], { autoSwap: false });
    assert('autoSwap=false never swaps', run(noSwap, 1).every((c) => c.swap === null));

    const prefer = makeController(mockPlayer(), [], { weapon: 'secondary' });
    assert('weapon=secondary switches to the secondary when idle', run(prefer, 1).some((c) => c.swap === 1));
};

{
    console.log('Test: movement while engaged');
    const strafeBot = mockPlayer(), strafeHuman = mockHuman({ z: 5.5 + 12 });
    const strafe = makeController(strafeBot, [strafeHuman], { engageMovement: 'strafe', strafeInterval: 0.5, jumpChance: 0, preferredRangeMin: 6, preferredRangeMax: 18 });
    const sc = run(strafe, 4);
    assert('strafe mode moves sideways', sc.some((c) => c.controls & (4 | 8)));
    assert('strafe mode changes direction', sc.some((c) => c.controls & 4) && sc.some((c) => c.controls & 8));

    const still = makeController(mockPlayer(), [mockHuman({ z: 5.5 + 12 })], { engageMovement: 'static', jumpChance: 0 });
    assert('static mode never moves', run(still, 2).every((c) => (c.controls & 15) === 0));

    const farBot = makeController(mockPlayer(), [mockHuman({ z: 5.5 + 30 })], { engageMovement: 'advance', preferredRangeMax: 15, jumpChance: 0, sightRange: 50 }, { map: flatMap(60) });
    assert('advances when beyond preferred range', run(farBot, 1).some((c) => c.controls & 1));

    const closeBot = makeController(mockPlayer(), [mockHuman({ z: 5.5 + 2 })], { engageMovement: 'strafe', preferredRangeMin: 6, jumpChance: 0 });
    assert('backs off when too close', run(closeBot, 1).some((c) => c.controls & 2));

    // Ledge safety: a bot standing at the edge must not be told to walk off it.
    const ledge = flatMap();
    for (let z = 0; z < 40; z++) for (let x = 0; x < 40; x++) if (z > 6) ledge.data[x][0][z] = {};
    const edgeBot = mockPlayer({ z: 6.5 });
    const edge = makeController(edgeBot, [mockHuman({ x: 5.5, z: 6.5 + 20 })], { engageMovement: 'advance', jumpChance: 0, sightRange: 50 }, { map: ledge });
    // Target is out over the void, so advancing (+z) would walk off the edge.
    assert('does not advance off a ledge', run(edge, 1.5).every((c) => !(c.controls & 1)));

    const jumper = makeController(mockPlayer(), [mockHuman()], { jumpChance: 5, engageMovement: 'static' });
    assert('jumpChance triggers jumps', run(jumper, 2).some((c) => c.jump));
    const noJump = makeController(mockPlayer(), [mockHuman()], { jumpChance: 0, engageMovement: 'static' });
    assert('jumpChance=0 never jumps', run(noJump, 2).every((c) => !c.jump));
};

{
    console.log('Test: memory, ally follow, death');
    const bot = mockPlayer(), human = mockHuman();
    const ctl = makeController(bot, [human], { memoryTime: 2, reactionTime: 0, jumpChance: 0 });
    run(ctl, 0.5);
    assert('has a target', !!ctl.target);
    human.z = 5.5 + 15; // still visible but now put a wall in the way
    const map = ctl.map;
    for (let y = 1; y <= 3; y++) for (let x = 0; x < 20; x++) setCell(map, x, y, 10, 'full');
    const lost = run(ctl, 0.6);
    const last = lost[lost.length - 1];
    assert('searches the last known position after losing sight', last.state === 'search' && !!last.moveTo, last.state);
    const gone = run(ctl, 3);
    assert('gives up after memoryTime', !ctl.target && gone[gone.length - 1].state !== 'search');

    const owner = mockHuman({ x: 5.5, z: 5.5 + 25 });
    const allyBot = makeController(mockPlayer(), [owner], { role: 'ally', followDistance: 6, sightRange: 10 }, { owner, map: flatMap(60) });
    const follow = run(allyBot, 0.5);
    assert('ally follows an owner that is too far away', follow[follow.length - 1].state === 'follow' && Math.hypot(follow[follow.length - 1].moveTo.x - owner.x, follow[follow.length - 1].moveTo.z - owner.z) < 6);
    owner.z = 5.5 + 3;
    const near = run(allyBot, 0.5);
    assert('ally idles once within followDistance', near[near.length - 1].state === 'idle' && !near[near.length - 1].moveTo);

    const deadBot = mockPlayer();
    const dctl = makeController(deadBot, [mockHuman()]);
    run(dctl, 0.5);
    deadBot.playing = false;
    const dead = run(dctl, 0.2);
    assert('does nothing while dead and drops its target', dead.every((c) => !c.engaged && !c.fire) && !dctl.target);
};

{
    console.log('Test: restocking from ammo crates');
    const dry = () => mockPlayer({ weapons: [mockWeapon({ rounds: 0, store: 0 }), mockWeapon({ rounds: 0, store: 0 })] });
    const crates = [{ x: 20.5, y: 1.1, z: 5.5 }, { x: 8.5, y: 1.1, z: 5.5 }];

    const a = makeController(dry(), [], {}, { crates });
    const ac = run(a, 0.5);
    const last = ac[ac.length - 1];
    assert('out of ammo -> heads for the nearest crate', last.state === 'restock' && last.moveTo && last.moveTo.x === 8.5, JSON.stringify(last.moveTo));

    const b = makeController(dry(), [mockHuman()], { reactionTime: 0 }, { crates });
    const bc = run(b, 1);
    assert('prefers restocking over fighting with empty guns', bc.every((c) => !c.fire) && bc[bc.length - 1].state === 'restock');

    const closePlayer = dry();
    closePlayer.x = 8.0;
    const c = makeController(closePlayer, [], {}, { crates });
    const cc = run(c, 0.5);
    const cl = cc[cc.length - 1];
    assert('walks straight at a crate once close', cl.engaged && (cl.controls & 1) && Math.abs(cl.yaw - Math.PI / 2) < 0.01 && !cl.moveTo, `yaw ${cl.yaw}`);

    const d = makeController(mockPlayer(), [], {}, { crates });
    assert('has ammo -> ignores crates', run(d, 0.5).every((x) => x.state !== 'restock'));

    const oneLeft = mockPlayer({ weapons: [mockWeapon({ rounds: 0, store: 0 }), mockWeapon({ rounds: 5, store: 0 })] });
    assert('one usable weapon left is not out of ammo', run(makeController(oneLeft, [], {}, { crates }), 0.5).every((x) => x.state !== 'restock'));

    const e = makeController(dry(), [], { restock: false }, { crates });
    assert('restock=false never goes for crates', run(e, 0.5).every((x) => x.state !== 'restock'));

    const f = makeController(dry(), [], { restockRange: 2 }, { crates });
    assert('ignores crates beyond restockRange', run(f, 0.5).every((x) => x.state !== 'restock'));

    const g = makeController(dry(), [], {}, { crates });
    run(g, 0.5);
    g.markUnreachable({ x: 8.5, y: 1.1, z: 5.5 });
    const gc = run(g, 0.5);
    assert('switches to another crate after one is marked unreachable', gc[gc.length - 1].moveTo?.x === 20.5, JSON.stringify(gc[gc.length - 1].moveTo));

    const h = makeController(dry(), [], {}, { crates: [] });
    assert('no crates anywhere -> carries on normally', run(h, 0.5).every((x) => x.state !== 'restock'));
};

{
    console.log('Test: weapon profiles (every gun, plugin or not)');
    const eggk = weaponProfile(GUNS.eggk);
    const dozen = weaponProfile(GUNS.dozen);
    const csg = weaponProfile(GUNS.csg);
    const cluck = weaponProfile(GUNS.cluck);
    const rpegg = weaponProfile(GUNS.rpegg);
    const m24 = weaponProfile(GUNS.m24);

    assert('EggK-47 is a close-to-mid range weapon (well inside its bullet range)', eggk.prefMax < GUNS.eggk.range * 0.5 && eggk.maxFire < GUNS.eggk.range, `${eggk.prefMin.toFixed(1)}-${eggk.prefMax.toFixed(1)} max ${eggk.maxFire.toFixed(1)}`);
    assert('shotgun is fought closer than the EggK-47', dozen.prefMax < eggk.prefMin + 1 && dozen.maxFire < eggk.maxFire);
    assert('pistol is closer than the EggK-47', cluck.prefMax < eggk.prefMax);
    assert('CSG-1 and M24 are long range', csg.prefMin > eggk.prefMax && m24.prefMin > eggk.prefMax && csg.maxFire > 40 && m24.maxFire > 40);
    assert('RPEGG is explosive, keeps clear of its own blast, needs to be steady', rpegg.explosive && rpegg.prefMin > GUNS.rpegg.radius * 2 && rpegg.minUseful > GUNS.rpegg.radius && rpegg.needsSteady);
    assert('rockets are slower than bullets', rpegg.speed < eggk.speed);
    assert('unknown/missing weapon stats fall back to a sane profile', weaponProfile(undefined).maxFire > 0 && weaponProfile({}).maxFire > 0);
    assert('profiles are cached per weapon', weaponProfile(GUNS.eggk) === eggk);

    // Derived ranges drive behavior: the same bot holds a different distance with different guns.
    function holdsAt(gun) {
        const bot = mockPlayer({ weapons: [mockWeapon({}, gun), mockWeapon({}, gun)] });
        const human = mockHuman({ z: 5.5 + 25 });
        const ctl = makeController(bot, [human], { engageMovement: 'advance', jumpChance: 0, sightRange: 60, missChance: 0 }, { map: flatMap(80) });
        return run(ctl, 1).some((c) => c.controls & 1);
    };
    assert('shotgun bot advances at 25 blocks', holdsAt(GUNS.dozen));
    assert('sniper bot is content at 25 blocks', !holdsAt(GUNS.csg));
}

{
    console.log('Test: missed shots');
    function hitRate(opts, seconds = 20) {
        const bot = mockPlayer(), human = mockHuman({ z: 5.5 + 12 });
        const ctl = makeController(bot, [human], { reactionTime: 0, jumpChance: 0, engageMovement: 'static', aimErrorDeg: 0, burstShots: 0, turnRateDeg: 720, ...opts });
        const truth = anglesTo({ x: bot.x, y: bot.y + 0.34, z: bot.z }, { x: human.x, y: human.y + 0.32, z: human.z });
        let fired = 0, hits = 0;
        for (let i = 0; i < 60 * seconds; i++) {
            const c = ctl.update(1 / 60);
            if (c.engaged) { bot.yaw = c.yaw; bot.pitch = c.pitch; };
            if (c.fire) {
                fired++;
                bot.weapon.ammo.rounds--; if (bot.weapon.ammo.rounds < 2) bot.weapon.ammo.rounds = 30; // count shots, never run dry
                if (angleBetweenDirs(dirFromAngles(c.yaw, c.pitch), dirFromAngles(truth.yaw, truth.pitch)) < Math.atan(0.375 / 12)) hits++;
            };
        };
        return { fired, hits, rate: hits / Math.max(1, fired) };
    };

    const never = hitRate({ missChance: 0 });
    assert('missChance=0 hits every shot', never.fired > 50 && never.rate > 0.95, JSON.stringify(never));
    const always = hitRate({ missChance: 1 });
    assert('missChance=1 still fires, but never hits', always.fired > 50 && always.hits === 0, JSON.stringify(always));
    const half = hitRate({ missChance: 0.5 });
    assert('missChance=0.5 hits roughly half the time', half.rate > 0.3 && half.rate < 0.7, `rate ${half.rate.toFixed(2)}`);

    const easy = hitRate({ difficulty: 'easy', engageMovement: 'static' }, 30);
    const normal = hitRate({ difficulty: 'normal', engageMovement: 'static' }, 30);
    const hard = hitRate({ difficulty: 'hard', engageMovement: 'static' }, 30);
    assert('easy lands far fewer shots than normal', easy.rate < normal.rate, `${easy.rate.toFixed(2)} vs ${normal.rate.toFixed(2)}`);
    assert('normal lands fewer shots than hard', normal.rate < hard.rate, `${normal.rate.toFixed(2)} vs ${hard.rate.toFixed(2)}`);
    assert('easy misses a majority of shots', easy.rate < 0.5, `rate ${easy.rate.toFixed(2)}`);

    // A "miss" must clear the target even at point-blank range, where a fixed 10 degree offset would not.
    const closeBot = mockPlayer(), closeHuman = mockHuman({ z: 5.5 + 2 });
    const closeCtl = makeController(closeBot, [closeHuman], { reactionTime: 0, jumpChance: 0, engageMovement: 'static', aimErrorDeg: 0, missChance: 1, missAngleDeg: 1, burstShots: 0, turnRateDeg: 720 });
    const closeTruth = anglesTo({ x: closeBot.x, y: closeBot.y + 0.34, z: closeBot.z }, { x: closeHuman.x, y: closeHuman.y + 0.32, z: closeHuman.z });
    let closeHits = 0, closeFired = 0;
    for (let i = 0; i < 60 * 10; i++) {
        const c = closeCtl.update(1 / 60);
        if (c.engaged) { closeBot.yaw = c.yaw; closeBot.pitch = c.pitch; };
        if (c.fire) { closeFired++; closeBot.weapon.ammo.rounds--; if (closeBot.weapon.ammo.rounds < 2) closeBot.weapon.ammo.rounds = 30; if (angleBetweenDirs(dirFromAngles(c.yaw, c.pitch), dirFromAngles(closeTruth.yaw, closeTruth.pitch)) < Math.atan(0.375 / 2)) closeHits++; };
    };
    assert('deliberate misses clear the target even point-blank', closeFired > 20 && closeHits === 0, `fired ${closeFired}, hits ${closeHits}`);
}

{
    console.log('Test: picking the weapon for the range');
    const bot = mockPlayer({ weapons: [mockWeapon({}, GUNS.csg), mockWeapon({}, GUNS.cluck)] });
    const closeFight = makeController(bot, [mockHuman({ z: 5.5 + 3 })], { reactionTime: 0, missChance: 0 });
    assert('sniper swaps to the pistol at close range', run(closeFight, 1).some((c) => c.swap === 1));

    const bot2 = mockPlayer({ weapons: [mockWeapon({}, GUNS.dozen), mockWeapon({}, GUNS.csg)] });
    const farFight = makeController(bot2, [mockHuman({ z: 5.5 + 30 })], { reactionTime: 0, missChance: 0, sightRange: 60 }, { map: flatMap(80) });
    assert('shotgun swaps to the sniper at long range', run(farFight, 1).some((c) => c.swap === 1));

    const bot3 = mockPlayer({ weapons: [mockWeapon({}, GUNS.eggk), mockWeapon({}, GUNS.cluck)] });
    const midFight = makeController(bot3, [mockHuman({ z: 5.5 + 5 })], { reactionTime: 0, missChance: 0 });
    assert('does not swap when the current weapon suits the range', run(midFight, 2).every((c) => c.swap === null));

    const bot4 = mockPlayer({ weapons: [mockWeapon({}, GUNS.csg), mockWeapon({}, GUNS.cluck)] });
    const pinned = makeController(bot4, [mockHuman({ z: 5.5 + 3 })], { reactionTime: 0, missChance: 0, weapon: 'primary' });
    assert('weapon=primary stops range-based swapping', run(pinned, 1).every((c) => c.swap === null));
    const noAuto = makeController(mockPlayer({ weapons: [mockWeapon({}, GUNS.csg), mockWeapon({}, GUNS.cluck)] }), [mockHuman({ z: 5.5 + 3 })], { reactionTime: 0, missChance: 0, autoSwap: false });
    assert('autoSwap=false stops range-based swapping', run(noAuto, 1).every((c) => c.swap === null));

    // RPEGG: refuses to fire while unsteady, and holds still until steady again.
    const rocketBot = mockPlayer({ weapons: [mockWeapon({}, GUNS.rpegg), mockWeapon({}, GUNS.cluck)] });
    rocketBot.isSteady = () => false;
    const rocket = makeController(rocketBot, [mockHuman({ z: 5.5 + 20 })], { reactionTime: 0, missChance: 0, sightRange: 60 }, { map: flatMap(60) });
    const rc = run(rocket, 1.5);
    assert('does not fire an unsteady RPEGG', rc.every((c) => !c.fire));
    assert('stands still while unsteady', rc.every((c) => (c.controls & 15) === 0));
    rocketBot.isSteady = () => true;
    assert('fires once steady', run(rocket, 1.5).some((c) => c.fire));
}

{
    console.log('Test: weapon classes (incl. plugin-provided ones)');
    setClassProvider(() => [{ name: 'Soldier' }, { name: 'Scrambler' }, { name: 'Free Ranger' }, { name: 'Eggsploder' }]);
    assert('base classes resolve by name', resolveClassIndex('scrambler') === 1 && resolveClassIndex('free_ranger') === 2 && resolveClassIndex('FreeRanger') === 2);
    assert('default/unset is the soldier', resolveClassIndex(null) === 0 && resolveClassIndex('default') === 0);
    assert('a class from a plugin that is not loaded is rejected', resolveClassIndex('crackshot') === -1 && resolveCombatOptions({ class: 'crackshot' }).errors.length === 1);
    assert('the error lists the classes that DO exist', /soldier/.test(resolveCombatOptions({ class: 'crackshot' }).errors[0]) && !/crackshot,|, crackshot$/.test(resolveCombatOptions({ class: 'nope' }).errors[0]));

    // Crackshot adds a class when its plugin loads - the same list, one more entry.
    setClassProvider(() => [{ name: 'Soldier' }, { name: 'Scrambler' }, { name: 'Free Ranger' }, { name: 'Eggsploder' }, { name: 'Crackshot' }]);
    assert('a plugin-added class resolves once the plugin is present', resolveClassIndex('crackshot') === 4 && resolveCombatOptions({ class: 'crackshot' }).errors.length === 0);
    assert('random picks a valid class', (() => { for (let i = 0; i < 50; i++) { const n = resolveClassIndex('random', seeded(i)); if (n < 0 || n > 4) return false; } return true; })());
    assert('class=default resolves to unset', resolveCombatOptions({ class: 'default' }).options.class === null);

    setClassProvider(() => []);
    assert('with no class list available, only the default class resolves', resolveClassIndex(null) === 0 && resolveClassIndex('soldier') === -1);
}

{
    console.log('Test: skill rating underlies the presets');
    const at = (d) => resolveCombatOptions({ difficulty: d }).options;
    assert('presets are skill values', at('dummy').skill === 0 && at('easy').skill === 0.25 && at('normal').skill === 0.5 && at('hard').skill === 0.75 && at('nightmare').skill === 1);
    assert('a numeric difficulty is the same as the skill', resolveCombatOptions({ difficulty: 0.75 }).options.reactionTime === at('hard').reactionTime);
    assert('skill=0.5 is exactly normal', JSON.stringify(resolveCombatOptions({ skill: 0.5 }).options) === JSON.stringify(at('normal')));
    const mid = resolveCombatOptions({ difficulty: 0.625 }).options;
    assert('in-between skills interpolate between the presets', mid.reactionTime < at('normal').reactionTime && mid.reactionTime > at('hard').reactionTime);
    const monotone = ['reactionTime', 'aimErrorDeg', 'missChance', 'movePenalty', 'flinch', 'peripheralDelay'];
    const rising = ['turnRateDeg', 'sightRange', 'hearingRange', 'fovDeg', 'sprayControl', 'useCover', 'grenades', 'spacing', 'focusFire'];
    const levels = [0, 0.25, 0.5, 0.75, 1].map((x) => resolveCombatOptions({ skill: x }).options);
    assert('better skill never makes these worse (falling ones)', monotone.every((k) => levels.every((o, i) => i === 0 || o[k] <= levels[i - 1][k])));
    assert('better skill never makes these worse (rising ones)', rising.every((k) => levels.every((o, i) => i === 0 || o[k] >= levels[i - 1][k])));
    assert('explicit options still beat skill', resolveCombatOptions({ skill: 1, reactionTime: 2 }).options.reactionTime === 2);
    assert('explicit skill beats the preset\'s', resolveCombatOptions({ difficulty: 'hard', skill: 0.1 }).options.skill === 0.1);
    assert('percentages are accepted', resolveCombatOptions({ skill: '70%' }).options.skill === 0.7);
    assert('a bad skill is an error', resolveCombatOptions({ skill: 'banana' }).errors.length === 1 && resolveCombatOptions({ skill: 3 }).errors.length === 1);
    assert('dummy never shoots and is deaf', at('dummy').holdFire && at('dummy').hearingRange === 0 && at('dummy').grenades === 0);
    assert('only easy-ish skills deal reduced damage', at('easy').damage < 1 && at('normal').damage === null && at('nightmare').damage === null);
    assert('low skill advances, higher strafes', at('easy').engageMovement === 'advance' && at('hard').engageMovement === 'strafe');
    assert('resumeAbove is kept above retreatBelow', (() => { const r = resolveCombatOptions({ retreatBelow: 0.8, resumeAbove: 0.3 }); return r.options.resumeAbove > r.options.retreatBelow && r.warnings.length === 1; })());

    const p1 = parseCombatArgs('3 0.7 aim=1');
    assert('/bots add accepts a number for the difficulty', p1.count === 3 && p1.difficulty === 0.7 && p1.errors.length === 0);
    assert('...or a percentage', parseCombatArgs('70%').difficulty === 0.7);
    assert('...or skill= / difficulty= with a number or a name', parseCombatArgs('skill=0.3').overrides.skill === '0.3' && parseCombatArgs('difficulty=0.3').difficulty === 0.3 && parseCombatArgs('difficulty=hard').difficulty === 'hard');
    assert('a bare integer is still the count, not a skill', parseCombatArgs('1').count === 1 && parseCombatArgs('1').difficulty === 'normal');
    assert('a bad difficulty= is an error', parseCombatArgs('difficulty=wat').errors.length === 1);
}

{
    console.log('Test: movement prediction (lead)');
    function leadYaw(targetSpeedMod, lead) {
        const bot = mockPlayer(), human = mockHuman({ z: 5.5 + 15, dx: 0.035, dz: 0, modifiers: { scale: 1, bulletSpeedModifier: 1, speedModifier: targetSpeedMod } });
        const ctl = makeController(bot, [human], { reactionTime: 0, aimErrorDeg: 0, leadFactor: lead, engageMovement: 'static', jumpChance: 0, sightRange: 40, turnRateDeg: 3000, flinch: 0 }, { map: flatMap(50) });
        const cmds = run(ctl, 0.6);
        return cmds[cmds.length - 1].yaw;
    };
    const none = leadYaw(1, 0), some = leadYaw(1, 1), more = leadYaw(2, 1);
    assert('leadFactor aims ahead of a target that is moving sideways', some > none + 0.01, `${none.toFixed(3)} -> ${some.toFixed(3)}`);
    assert('a faster-moving target (speed modifier) gets more lead', more > some + 0.005, `${some.toFixed(3)} -> ${more.toFixed(3)}`);
}

{
    console.log('Test: movement penalty');
    function meanErr(penalty, moving) {
        const bot = mockPlayer({ dx: moving ? 0.035 : 0 }), human = mockHuman({ z: 5.5 + 12 });
        const ctl = makeController(bot, [human], { reactionTime: 0, aimErrorDeg: 5, movePenalty: penalty, engageMovement: 'static', jumpChance: 0, leadFactor: 0, flinch: 0, turnRateDeg: 3000 });
        const truth = anglesTo({ x: bot.x, y: bot.y + 0.34, z: bot.z }, { x: human.x, y: human.y + 0.32, z: human.z });
        let sum = 0, n = 0;
        for (let i = 0; i < 60 * 30; i++) {
            const c = ctl.update(1 / 60);
            if (c.engaged) { bot.yaw = c.yaw; bot.pitch = c.pitch; bot.dx = moving ? 0.035 : 0; if (i > 60) { sum += Math.abs(angleDiff(c.yaw, truth.yaw)); n++; }; };
        };
        return sum / n;
    };
    assert('moving makes the aim worse when there is a penalty', meanErr(3, true) > meanErr(3, false) * 1.5, `${meanErr(3, false).toFixed(4)} vs ${meanErr(3, true).toFixed(4)}`);
    assert('...and not at all when the penalty is 0', Math.abs(meanErr(0, true) - meanErr(0, false)) < 0.005);
    assert('a bigger penalty hurts more', meanErr(3, true) > meanErr(1, true));
}

{
    console.log('Test: spray control');
    function fires(sprayControl, spread) {
        const bot = mockPlayer({ shotSpread: spread }), human = mockHuman({ z: 5.5 + 6 });
        const ctl = makeController(bot, [human], { reactionTime: 0, aimErrorDeg: 0, sprayControl, engageMovement: 'static', burstShots: 0, jumpChance: 0, fovDeg: 360 });
        const out = [];
        for (let i = 0; i < 60; i++) { const c = ctl.update(1 / 60); if (c.engaged) { bot.yaw = c.yaw; bot.pitch = c.pitch; }; out.push(c.fire); };
        return out.some(Boolean);
    };
    assert('a disciplined bot holds fire while the spread is blown out', !fires(1, 100));
    assert('...and fires once it has settled', fires(1, 20));
    assert('an undisciplined bot sprays regardless', fires(0, 100));
    assert('discipline scales with the setting', fires(0.4, 100) && !fires(0.95, 100));
}

{
    console.log('Test: flinch, and who hit me');
    const mk = (opts = {}) => {
        const bot = mockPlayer(), human = mockHuman({ z: 5.5 + 6 });
        const ctl = makeController(bot, [human], { reactionTime: 0, aimErrorDeg: 0, engageMovement: 'static', burstShots: 0, jumpChance: 0, fovDeg: 360, sprayControl: 0, ...opts });
        run(ctl, 1);
        return { bot, human, ctl };
    };
    const hit = mk({ flinch: 1 });
    hit.bot.hp = 70;
    const cmds = run(hit.ctl, 0.1);
    assert('being hit knocks the aim off', Math.abs(hit.ctl.flinchYaw) + Math.abs(hit.ctl.flinchPitch) > 0.01);
    assert('...and delays the next shot slightly', cmds.slice(0, 4).every((c) => !c.fire));
    const later = run(hit.ctl, 1.5);
    assert('...then it settles and keeps firing', Math.abs(hit.ctl.flinchYaw) < 0.002 && later.slice(-20).some((c) => c.fire));
    const subtle = Math.hypot(hit.ctl.flinchYaw, hit.ctl.flinchPitch);
    assert('flinch is subtle (a few degrees at most)', (() => { const f = mk({ flinch: 1 }); f.bot.hp = 70; f.ctl.update(1 / 60); return Math.hypot(f.ctl.flinchYaw, f.ctl.flinchPitch) < toRadTest(5); })());
    const steady = mk({ flinch: 0 });
    steady.bot.hp = 70;
    const sc = run(steady.ctl, 0.2);
    assert('flinch=0 shrugs it off', Math.hypot(steady.ctl.flinchYaw, steady.ctl.flinchPitch) < 1e-9 && sc.some((c) => c.fire));
    const regen = mk({ flinch: 1 });
    regen.bot.hp = 99.9; run(regen.ctl, 0.2);
    assert('regenerating health is not mistaken for being hit', Math.hypot(regen.ctl.flinchYaw, regen.ctl.flinchPitch) < 1e-9);

    // The attacker becomes the priority target.
    const bot = mockPlayer(), near = mockHuman({ id: 7, z: 5.5 + 8 }), shooter = mockHuman({ id: 8, x: 5.5 + 6, z: 5.5 + 8 });
    const ctl = makeController(bot, [near, shooter], { reactionTime: 0, targetSwitchDelay: 0.2, fovDeg: 360, engageMovement: 'static', jumpChance: 0 });
    run(ctl, 1);
    assert('starts on the nearest', ctl.target === near);
    bot.firedPlayer = shooter; bot.hp = 80;
    run(ctl, 1);
    assert('switches to whoever hit it', ctl.target === shooter && ctl.attacker === shooter);

    // Hit by someone it cannot see: it goes to look.
    const wallMap = flatMap();
    for (let y = 1; y <= 3; y++) for (let x = 0; x < 30; x++) setCell(wallMap, x, y, 10, 'full');
    const blind = mockPlayer(), hidden = mockHuman({ id: 9, z: 5.5 + 12 });
    const bctl = makeController(blind, [hidden], { fovDeg: 360, huntRange: 1 }, { map: wallMap });
    run(bctl, 0.5);
    blind.firedPlayer = hidden; blind.hp = 80;
    const bc = run(bctl, 0.3);
    assert('shot by an unseen attacker: goes to investigate where they are', bc[bc.length - 1].state === 'investigate' && Math.abs(bc[bc.length - 1].moveTo.z - hidden.z) < 8);
}

function toRadTest(d) { return d * Math.PI / 180; }

{
    console.log('Test: hearing (gunshots, grenades, explosions only)');
    const clock = { t: 0 };
    const mkWorld = (botOpts = {}, shooterOpts = {}) => {
        const bot = mockPlayer({ id: 1 });
        const shooter = mockHuman({ id: 2, z: 5.5 + 20, ...shooterOpts });
        const projectiles = { grenades: [], rockets: [] };
        const all = [bot, shooter];
        const sounds = new SoundTracker({ iteratePlayers: (cb) => { for (const q of all) cb(q); }, getProjectiles: () => projectiles, now: () => clock.t });
        const wall = flatMap();
        for (let y = 1; y <= 3; y++) for (let x = 0; x < 30; x++) setCell(wall, x, y, 10, 'full'); // shooter is behind a wall: heard, not seen
        const ctl = makeController(bot, [shooter], { huntRange: 1, hearingRange: 40, fovDeg: 360, ...botOpts }, { map: wall, sounds });
        return { bot, shooter, projectiles, sounds, ctl, all };
    };
    const tick = (w, seconds, each) => { const out = []; for (let i = 0; i < seconds * 60; i++) { clock.t += 1 / 60; if (each) each(i); out.push(w.ctl.update(1 / 60)); }; return out; };

    // SoundTracker on its own
    const t0 = mkWorld();
    t0.sounds.poll();
    t0.shooter.weapon.ammo.rounds -= 1; clock.t += 0.2; t0.sounds.poll();
    assert('a drop in loaded rounds is a gunshot at the shooter', t0.sounds.events.length === 1 && t0.sounds.events[0].kind === 'gunshot' && t0.sounds.events[0].source === t0.shooter && t0.sounds.events[0].z === t0.shooter.z);
    clock.t += 0.2; t0.sounds.poll();
    assert('...once, not on every poll', t0.sounds.events.length === 1);
    t0.shooter.weapon.ammo.rounds = 30; clock.t += 0.2; t0.sounds.poll();
    assert('reloading (rounds going UP) is silent', t0.sounds.events.length === 1);
    t0.shooter.weaponIdx = 1; t0.shooter.weapon = t0.shooter.weapons[1]; t0.shooter.weapon.ammo.rounds -= 0; clock.t += 0.2; t0.sounds.poll();
    assert('swapping weapons is silent', t0.sounds.events.length === 1);
    t0.shooter.x += 3; clock.t += 0.2; t0.sounds.poll(); t0.shooter.dx = 0.035; t0.shooter.jumping = true; clock.t += 0.2; t0.sounds.poll();
    assert('walking and jumping make no sound', t0.sounds.events.length === 1);
    t0.shooter.grenadeCount--; clock.t += 0.2; t0.sounds.poll();
    assert('throwing a grenade is heard, more quietly', t0.sounds.events.length === 2 && t0.sounds.events[1].kind === 'grenade' && t0.sounds.events[1].loud < 1);
    const g = { x: 10, y: 2, z: 12, player: t0.shooter };
    t0.projectiles.grenades.push(g); clock.t += 0.2; t0.sounds.poll();
    assert('a grenade in flight is not itself a sound', t0.sounds.events.length === 2);
    g.x = 11; clock.t += 0.2; t0.sounds.poll(); t0.projectiles.grenades.length = 0; clock.t += 0.2; t0.sounds.poll();
    const ex = t0.sounds.events[t0.sounds.events.length - 1];
    assert('a grenade that disappears is an explosion where it was last seen', ex.kind === 'explosion' && ex.x === 11 && ex.z === 12 && ex.loud > 1);
    const before = t0.sounds.events.length; t0.sounds.poll(); t0.sounds.poll();
    assert('polling inside the interval does no work', t0.sounds.events.length === before);
    assert('since(cursor) returns only newer events', t0.sounds.since(t0.sounds.cursor).length === 0 && t0.sounds.since(0).length === t0.sounds.events.length);

    // Bot reactions
    const w1 = mkWorld();
    const idle = tick(w1, 0.5);
    assert('silence: nothing to investigate', idle.every((c) => c.state !== 'investigate'));
    const shot = tick(w1, 0.6, (i) => { if (i === 0) w1.shooter.weapon.ammo.rounds--; });
    const heard = shot[shot.length - 1];
    assert('a gunshot out of sight makes the bot go and look', heard.state === 'investigate' && !!heard.moveTo);
    assert('...roughly where it came from, not exactly', Math.hypot(heard.moveTo.x - w1.shooter.x, heard.moveTo.z - w1.shooter.z) < 6);
    assert('...but it does not know the shooter is there', !w1.ctl.target);

    const w2 = mkWorld({ hearingRange: 0 });
    assert('a deaf bot (hearingRange 0) hears nothing', tick(w2, 1, (i) => { if (i === 5) w2.shooter.weapon.ammo.rounds--; }).every((c) => c.state !== 'investigate'));
    const w3 = mkWorld({ hearingRange: 10 });
    assert('a gunshot beyond hearing range is not heard', tick(w3, 1, (i) => { if (i === 5) w3.shooter.weapon.ammo.rounds--; }).every((c) => c.state !== 'investigate'));
    const w4 = mkWorld({ hearingRange: 15 });
    const bang = tick(w4, 1, (i) => { if (i === 5) { w4.projectiles.grenades.push({ x: 5.5, y: 1, z: 5.5 + 25, player: w4.shooter }); } if (i === 20) w4.projectiles.grenades.length = 0; });
    assert('explosions carry farther than gunshots (25 blocks heard at hearingRange 15)', bang.some((c) => c.state === 'investigate'));
    const w5 = mkWorld({ hearingRange: 15 }, { z: 5.5 + 25 });
    assert('...the same distance as a gunshot is not', tick(w5, 1, (i) => { if (i === 5) w5.shooter.weapon.ammo.rounds--; }).every((c) => c.state !== 'investigate'));

    const w6 = mkWorld({}, { team: 1 }); w6.bot.team = 1;
    assert('friendly gunfire is ignored', tick(w6, 1, (i) => { if (i === 5) w6.shooter.weapon.ammo.rounds--; }).every((c) => c.state !== 'investigate'));
    const w7 = mkWorld();
    assert('its own gunfire is ignored', tick(w7, 1, (i) => { if (i === 5) w7.bot.weapon.ammo.rounds--; }).every((c) => c.state !== 'investigate'));

    // Already fighting something visible: sounds don't distract it.
    const w8 = mkWorld();
    const visible = mockHuman({ id: 3, x: 5.5 + 3, z: 5.5 + 3 });
    w8.all.push(visible);
    const w8ctl = makeController(w8.bot, [w8.shooter, visible], { huntRange: 1, hearingRange: 40, fovDeg: 360, reactionTime: 0 }, { map: flatMap(), sounds: w8.sounds });
    clock.t += 1; w8.sounds.poll();
    const busy = []; for (let i = 0; i < 60; i++) { clock.t += 1 / 60; if (i === 20) w8.shooter.weapon.ammo.rounds--; const c = w8ctl.update(1 / 60); if (c.engaged) { w8.bot.yaw = c.yaw; w8.bot.pitch = c.pitch; }; busy.push(c); };
    assert('a bot fighting a visible target ignores sounds', busy.every((c) => c.state !== 'investigate') && w8ctl.target === visible);
}

{
    console.log('Test: peripheral vision and noticing');
    const place = (deg, dist = 10) => ({ x: 5.5 + dist * Math.sin(deg * Math.PI / 180), z: 5.5 + dist * Math.cos(deg * Math.PI / 180) });
    const notices = (deg, seconds, opts = {}) => {
        const bot = mockPlayer(), human = mockHuman(place(deg));
        const ctl = makeController(bot, [human], { fovDeg: 100, peripheralDeg: 200, peripheralDelay: 1, huntRange: 1, ...opts });
        run(ctl, seconds);
        return ctl.target === human;
    };
    assert('straight ahead is noticed at once', notices(0, 0.3));
    assert('inside the focus cone is noticed at once', notices(40, 0.3));
    assert('peripheral targets are NOT noticed immediately', !notices(70, 0.5));
    assert('...but are after the peripheral delay', notices(70, 1.5));
    assert('outside peripheral vision is never noticed', !notices(130, 5));
    assert('a longer delay takes longer', !notices(70, 1.5, { peripheralDelay: 3 }) && notices(70, 3.5, { peripheralDelay: 3 }));
    assert('360 vision notices everything immediately', notices(170, 0.3, { fovDeg: 360, peripheralDeg: 360 }));
    assert('a target that leaves the peripheral cone resets the timer', (() => {
        const bot = mockPlayer(), human = mockHuman(place(70));
        const ctl = makeController(bot, [human], { fovDeg: 100, peripheralDeg: 200, peripheralDelay: 1, huntRange: 1 });
        run(ctl, 0.7); Object.assign(human, place(150)); run(ctl, 0.5); Object.assign(human, place(70)); run(ctl, 0.6);
        return ctl.target === null;
    })());
}

{
    console.log('Test: focus fire');
    const shared = { focus: null, until: 0 };
    let t = 0;
    const now = () => t;
    const A = mockHuman({ id: 20, x: 5.5, z: 5.5 + 9 }), B = mockHuman({ id: 21, x: 5.5 + 5, z: 5.5 + 5 });
    const first = mockPlayer({ id: 10, team: 1 });
    const c1 = makeController(first, [A], { reactionTime: 0, fovDeg: 360, focusFire: 1, jumpChance: 0, engageMovement: 'static' }, { squad: shared, now });
    for (let i = 0; i < 60; i++) { t += 1 / 60; const c = c1.update(1 / 60); if (c.engaged) { first.yaw = c.yaw; first.pitch = c.pitch; } };
    assert('a bot fighting someone posts it as the squad focus', shared.focus === A);

    const second = mockPlayer({ id: 11, team: 1, x: 5.5 + 1 });
    const c2 = makeController(second, [A, B, first], { reactionTime: 0, fovDeg: 360, focusFire: 1, jumpChance: 0 }, { squad: shared, now });
    for (let i = 0; i < 40; i++) { t += 1 / 60; c2.update(1 / 60); };
    assert('squadmates go for the focus target even when someone else is a bit closer', c2.target === A, c2.target && c2.target.id);
    const third = mockPlayer({ id: 12, team: 1, x: 5.5 + 1 });
    const c3 = makeController(third, [A, B, first], { reactionTime: 0, fovDeg: 360, focusFire: 0, jumpChance: 0 }, { squad: shared, now });
    for (let i = 0; i < 40; i++) { t += 1 / 60; c3.update(1 / 60); };
    assert('focusFire=0 ignores it and takes the nearest', c3.target === B);
    t += 10;
    const fourth = mockPlayer({ id: 13, team: 1, x: 5.5 + 1 });
    const c4 = makeController(fourth, [A, B, first], { reactionTime: 0, fovDeg: 360, focusFire: 1, jumpChance: 0 }, { squad: shared, now });
    for (let i = 0; i < 40; i++) { t += 1 / 60; c4.update(1 / 60); };
    assert('a stale focus expires', c4.target === B);

    // Allies focus on what their owner is aiming at.
    const owner = mockHuman({ id: 30, x: 5.5, z: 5.5, yaw: 0, pitch: 0, team: 1 });
    const near = mockHuman({ id: 31, x: 5.5 + 5, z: 5.5 + 5 }), aimed = mockHuman({ id: 32, x: 5.5, z: 5.5 + 9 });
    const ally = mockPlayer({ id: 33, team: 1, x: 5.5 + 2, z: 5.5 });
    const ac = makeController(ally, [owner, near, aimed], { role: 'ally', reactionTime: 0, fovDeg: 360, focusFire: 1, jumpChance: 0, sightRange: 30 }, { owner });
    for (let i = 0; i < 40; i++) ac.update(1 / 60);
    assert('an ally attacks what its owner is aiming at, over something nearer', ac.target === aimed, ac.target && ac.target.id);
}

{
    console.log('Test: cover, retreat and health');
    const wallMap = () => {
        const m = flatMap();
        for (let y = 1; y <= 3; y++) for (let x = 4; x <= 20; x++) setCell(m, x, y, 10, 'full');
        return m;
    };
    const threatEye = { x: 11.5, y: 1.34, z: 18.5 };
    const spot = findCover(wallMap(), { x: 11.5, y: 1, z: 13.5 }, threatEye, { radius: 10 });
    assert('findCover returns a spot the threat cannot see', !!spot && !hasLineOfSight(wallMap(), threatEye, { x: spot.x, y: spot.y + 0.45, z: spot.z }), JSON.stringify(spot));
    assert('...within the search radius', Math.hypot(spot.x - 11.5, spot.z - 13.5) <= 10.01);
    assert('there is no cover on an open field', findCover(flatMap(), { x: 11.5, y: 1, z: 13.5 }, threatEye, { radius: 10 }) === null);
    const spot2 = findCover(wallMap(), { x: 11.5, y: 1, z: 13.5 }, threatEye, { radius: 10, isExcluded: (s) => Math.floor(s.x) === Math.floor(spot.x) && Math.floor(s.z) === Math.floor(spot.z) });
    assert('excluded spots are skipped', spot2 && (Math.floor(spot2.x) !== Math.floor(spot.x) || Math.floor(spot2.z) !== Math.floor(spot.z)));

    const mkFight = (botOpts = {}, extra = {}) => {
        const bot = mockPlayer({ z: 13.5, x: 11.5, ...(extra.bot ?? {}) }), human = mockHuman({ x: 11.5, z: 18.5 });
        const ctl = makeController(bot, [human], { reactionTime: 0, fovDeg: 360, aggression: 0, useCover: 1, jumpChance: 0, ...botOpts }, { map: wallMap(), ...(extra.deps ?? {}) });
        run(ctl, 0.5);
        return { bot, human, ctl };
    };

    const hurt = mkFight();
    assert('starts out fighting', hurt.ctl.target === hurt.human && hurt.ctl.cover === null);
    hurt.bot.hp = 20;
    const hc = run(hurt.ctl, 0.5);
    assert('badly hurt: ducks behind cover', !!hurt.ctl.cover && hc.some((c) => c.state === 'cover'));
    const goTo = hc.find((c) => c.state === 'cover');
    assert('...heading for a spot out of the threat\'s sight', !!goTo && !hasLineOfSight(wallMap(), threatEye, { x: goTo.moveTo.x, y: goTo.moveTo.y + 0.45, z: goTo.moveTo.z }));
    Object.assign(hurt.bot, { x: hurt.ctl.cover.spot.x, y: hurt.ctl.cover.spot.y, z: hurt.ctl.cover.spot.z });
    hurt.human.z = 30; // threat wanders off, so nothing is visible any more
    const held = run(hurt.ctl, 1);
    assert('at the spot it holds still', held.some((c) => c.state === 'hold' && c.engaged && (c.controls & 15) === 0));
    assert('...and stays while recovering', !!hurt.ctl.cover);
    hurt.bot.hp = 100;
    const out = run(hurt.ctl, 2);
    assert('once recovered it leaves cover', hurt.ctl.cover === null);
    assert('...and goes back out toward where the threat was (the peek)', out.some((c) => c.state === 'search' || c.state === 'hunt') || hurt.ctl.target === null);
    const timeout = mkFight({ coverMaxTime: 2 }); timeout.bot.hp = 20; run(timeout.ctl, 0.5);
    run(timeout.ctl, 3);
    assert('it never hides forever (coverMaxTime)', timeout.ctl.cover === null);

    const never = mkFight({ useCover: 0 }); never.bot.hp = 20;
    run(never.ctl, 1);
    assert('useCover=0 never takes cover', never.ctl.cover === null);
    const open = mkFight({}, { deps: { map: flatMap() } }); open.bot.hp = 20;
    run(open.ctl, 1);
    assert('no cover to be found: it fights on', open.ctl.cover === null && open.ctl.target === open.human);
    const healthy = mkFight(); run(healthy.ctl, 1);
    assert('a healthy bot does not hide', healthy.ctl.cover === null);

    // Retreat: backs off while still shooting.
    const retreat = mkFight({ useCover: 0, engageMovement: 'strafe', preferredRangeMin: 1, preferredRangeMax: 30 }, { deps: { map: flatMap() } });
    const calm = run(retreat.ctl, 1);
    retreat.bot.hp = 20;
    const rc = run(retreat.ctl, 1);
    assert('hurt without cover: backs away', rc.filter((c) => c.controls & 2).length > 30, `${rc.filter((c) => c.controls & 2).length}`);
    assert('...while still firing back', rc.some((c) => c.fire));
    assert('a healthy bot does not back away at this range', calm.every((c) => !(c.controls & 2)));
    const bolder = mkFight({ useCover: 0, aggression: 1, engageMovement: 'strafe', preferredRangeMin: 1, preferredRangeMax: 30 }, { deps: { map: flatMap() } });
    bolder.bot.hp = 33; run(bolder.ctl, 0.5);
    const cautious = mkFight({ useCover: 0, aggression: 0, engageMovement: 'strafe', preferredRangeMin: 1, preferredRangeMax: 30 }, { deps: { map: flatMap() } });
    cautious.bot.hp = 33; run(cautious.ctl, 0.5);
    assert('cautious bots retreat sooner than aggressive ones', cautious.ctl.retreating && !bolder.ctl.retreating);

    // Reload in cover.
    const dry = () => mockWeapon({ rounds: 0, store: 30 });
    const reload = mkFight({}, { bot: { weapons: [dry(), dry()] } });
    run(reload.ctl, 1);
    assert('out of rounds with an enemy in view and nothing to swap to: takes cover to reload', !!reload.ctl.cover && reload.ctl.cover.reason === 'reload');
    const swappable = mkFight({}, { bot: { weapons: [dry(), mockWeapon()] } });
    run(swappable.ctl, 1);
    assert('...but just swaps if the other weapon is loaded', swappable.ctl.cover === null);

    // Health packs.
    const kit = { x: 14.5, y: 1.1, z: 3.5 };
    const hb = mockPlayer({ hp: 20 });
    const hctl = makeController(hb, [], { huntRange: 1, healthPacks: true }, { pickups: { HEALTH: [kit] } });
    const hcm = run(hctl, 0.5);
    assert('hurt and alone: goes to a health pack', hcm[hcm.length - 1].state === 'heal' && hcm[hcm.length - 1].moveTo.x === 14.5);
    const nohb = makeController(mockPlayer({ hp: 20 }), [], { huntRange: 1, healthPacks: false }, { pickups: { HEALTH: [kit] } });
    assert('healthPacks=false: ignores them', run(nohb, 0.5).every((c) => c.state !== 'heal'));
    const fullhp = makeController(mockPlayer({ hp: 100 }), [], { huntRange: 1 }, { pickups: { HEALTH: [kit] } });
    assert('full health: ignores them', run(fullhp, 0.5).every((c) => c.state !== 'heal'));
    const nopack = makeController(mockPlayer({ hp: 20 }), [], { huntRange: 1 }, { pickups: { HEALTH: [] } });
    assert('no health packs in the room (plugin absent): carries on', run(nopack, 0.5).every((c) => c.state !== 'heal'));
    const fighting = makeController(mockPlayer({ hp: 20 }), [mockHuman({ z: 5.5 + 6 })], { reactionTime: 0, fovDeg: 360, useCover: 0 }, { pickups: { HEALTH: [kit] } });
    assert('mid-fight it does not wander off for a pack', run(fighting, 1).every((c) => c.state !== 'heal'));
    hctl.markUnreachable(kit);
    assert('an unreachable pack is skipped', run(hctl, 0.5).every((c) => c.state !== 'heal'));
}

{
    console.log('Test: grenades');
    const mkThrow = (opts = {}, extra = {}) => {
        const bot = mockPlayer(extra.bot ?? {}), human = mockHuman({ z: 5.5 + (extra.dist ?? 6) });
        const ctl = makeController(bot, [human], { reactionTime: 0, fovDeg: 360, grenades: 1, jumpChance: 0, engageMovement: 'static', aimErrorDeg: 0, ...opts }, { map: flatMap(50) });
        return { bot, human, ctl };
    };
    const thrown = (w, seconds = 30) => { for (let i = 0; i < seconds * 60; i++) { const c = w.ctl.update(1 / 60); if (c.engaged) { w.bot.yaw = c.yaw; w.bot.pitch = c.pitch; }; if (c.grenade !== null) return c; } return null; };

    const a = mkThrow();
    const c = thrown(a);
    assert('eventually throws at a target in range', !!c && c.state === 'throw' && c.grenade > 0 && c.grenade <= 1, JSON.stringify(c && c.grenade));
    assert('...aimed up and toward the target', c.pitch < 0 && Math.abs(angleDiff(c.yaw, 0)) < 0.2);
    const lock = [];
    for (let i = 0; i < 20; i++) { const x = a.ctl.update(1 / 60); lock.push(x); }
    assert('it holds the aim still while the throw happens', lock.every((x) => x.state === 'throw' && x.yaw === c.yaw && x.pitch === c.pitch && x.grenade === null));
    a.bot.grenadesQueued = 1;
    assert('...until the throw is done', a.ctl.update(1 / 60).state === 'throw');
    a.bot.grenadesQueued = 0;
    const resume = run(a.ctl, 0.5);
    assert('then goes back to fighting', resume[resume.length - 1].state === 'engage');
    const again = (() => { for (let i = 0; i < 60 * 3; i++) { if (a.ctl.update(1 / 60).grenade !== null) return true; } return false; })();
    assert('and does not spam them (cooldown)', !again);

    assert('grenades=0 never throws', thrown(mkThrow({ grenades: 0 }), 20) === null);
    assert('no grenades left: no throw', thrown(mkThrow({}, { bot: { grenadeCount: 0 } }), 20) === null);
    assert('too far away: no throw', thrown(mkThrow({ sightRange: 40 }, { dist: 20 }), 20) === null);
    assert('too close (inside the blast): no throw', thrown(mkThrow({}, { dist: 2 }), 20) === null);
    assert('busy (reloading): no throw', thrown(mkThrow({}, { bot: { reloadCountdown: 30 } }), 5) === null);
    assert('already mid-throw: no second one', thrown(mkThrow({}, { bot: { grenadesQueued: 1 } }), 5) === null);

    // Over a wall at a target that is not visible.
    const wallMap = flatMap(50);
    for (let y = 1; y <= 4; y++) for (let x = 0; x < 50; x++) setCell(wallMap, x, y, 9, 'full');
    const bot = mockPlayer(), ctl = makeController(bot, [], { grenades: 1 }, { map: wallMap });
    const cmd = { engaged: false, yaw: 0, pitch: 0, controls: 0, grenade: null };
    let lobbed = false;
    for (let i = 0; i < 60 * 40 && !lobbed; i++) { ctl.time += 1 / 60; ctl.dt = 1 / 60; lobbed = ctl.tryGrenade(cmd, { x: 5.5, y: 1, z: 12.5 }, false); };
    assert('it lobs one over a wall at where an enemy was last seen', lobbed && cmd.grenade > 0.5 && cmd.pitch < -0.4, JSON.stringify({ g: cmd.grenade, p: cmd.pitch }));

    // The solver, directly: where does the grenade actually land?
    const flat = flatMap(50);
    for (const d of [4, 6, 7]) {
        const s = solveGrenadeThrow(flat, { x: 5.5, y: 1, z: 5.5 }, { x: 5.5, y: 1, z: 5.5 + d });
        assert(`solver lands a throw ${d} blocks away`, !!s && s.error < 1.3, JSON.stringify(s));
    };
    assert('solver gives up beyond a grenade\'s range', solveGrenadeThrow(flat, { x: 5.5, y: 1, z: 5.5 }, { x: 5.5, y: 1, z: 5.5 + 15 }) === null);
    assert('solver respects a weaker throw modifier', (() => { const strong = solveGrenadeThrow(flat, { x: 5.5, y: 1, z: 5.5 }, { x: 5.5, y: 1, z: 11.5 }, { throwModifier: 1 }); const weak = solveGrenadeThrow(flat, { x: 5.5, y: 1, z: 5.5 }, { x: 5.5, y: 1, z: 11.5 }, { throwModifier: 0.7 }); return strong && weak && weak.power > strong.power; })());
}

{
    console.log('Test: smarter strafing');
    const strafeRuns = (variance, seconds = 40, opts = {}) => {
        const bot = mockPlayer(), human = mockHuman({ z: 5.5 + 5 });
        const ctl = makeController(bot, [human], { engageMovement: 'strafe', strafeInterval: 1, strafeVariance: variance, preferredRangeMin: 1, preferredRangeMax: 30, jumpChance: 0, holdFire: true, fovDeg: 360, reactionTime: 0, ...opts });
        const cmds = run(ctl, seconds);
        const runs = []; let cur = null;
        for (const c of cmds) {
            const dir = (c.controls & 8) ? 1 : (c.controls & 4) ? -1 : 0;
            if (cur && cur.dir === dir) cur.len++; else { cur = { dir, len: 1 }; runs.push(cur); };
        };
        return { cmds, runs };
    };
    const rigid = strafeRuns(0);
    const moveRuns = rigid.runs.filter((r) => r.dir !== 0 && r.len > 5).map((r) => r.len / 60);
    assert('strafeVariance 0 flips like a metronome', moveRuns.length > 20 && moveRuns.slice(1, -1).every((l) => Math.abs(l - 1) < 0.1), moveRuns.slice(0, 5).map((x) => x.toFixed(2)).join(','));
    assert('...with no pauses', rigid.cmds.slice(30).every((c) => (c.controls & 12) !== 0));
    const wild = strafeRuns(1);
    const wildRuns = wild.runs.filter((r) => r.dir !== 0 && r.len > 5).map((r) => r.len / 60);
    const spread = Math.max(...wildRuns) - Math.min(...wildRuns);
    assert('strafeVariance 1 varies the timing', spread > 0.5, `spread ${spread.toFixed(2)}`);
    assert('...stops to take shots', wild.cmds.filter((c) => (c.controls & 12) === 0).length > 20);
    assert('...and sometimes keeps going the same way', (() => { let same = 0; const dirs = wild.runs.filter((r) => r.dir !== 0).map((r) => r.dir); for (let i = 1; i < dirs.length; i++) if (dirs[i] === dirs[i - 1]) same++; return same > 2; })());

    // Dodging when hit
    const flips = (variance) => {
        let n = 0;
        for (let seed = 1; seed <= 30; seed++) {
            const bot = mockPlayer(), human = mockHuman({ z: 5.5 + 5 });
            const ctl = new CombatController({ player: Object.assign(bot, { weapon: bot.weapons[0] }), map: flatMap(), iteratePlayers: (cb) => { for (const q of [bot, human]) cb(q); }, rng: seeded(seed) }, { engageMovement: 'strafe', strafeVariance: variance, variance: 0, holdFire: true, fovDeg: 360, reactionTime: 0, flinch: 0 });
            run(ctl, 0.6);
            const dir = ctl.strafeDir; bot.hp = 70; ctl.update(1 / 60);
            if (ctl.strafeDir !== dir) n++;
        };
        return n;
    };
    assert('a strafing bot often dodges the other way when hit', flips(1) >= 20, `${flips(1)}/30`);
    assert('...far less when it is not unpredictable', flips(0) === 0);

    // Precise guns stand still to shoot.
    const sniper = mockPlayer({ weapons: [mockWeapon({}, GUNS.csg), mockWeapon({}, GUNS.cluck)] });
    const sctl = makeController(sniper, [mockHuman({ z: 5.5 + 20 })], { engageMovement: 'strafe', strafeVariance: 0, strafeInterval: 0.5, reactionTime: 0, aimErrorDeg: 0, jumpChance: 0, fovDeg: 360, sightRange: 40, preferredRangeMin: 1, preferredRangeMax: 40, burstShots: 1, burstPause: 0.8 }, { map: flatMap(50) });
    const sc = [];
    for (let i = 0; i < 60 * 6; i++) { const c = sctl.update(1 / 60); if (c.engaged) { sniper.yaw = c.yaw; sniper.pitch = c.pitch; }; if (c.fire) { sniper.weapon.ammo.rounds--; if (sniper.weapon.ammo.rounds < 2) sniper.weapon.ammo.rounds = 5; }; sc.push(c); };
    assert('a precise weapon does not strafe while it is firing', sc.filter((c) => c.fire).every((c) => (c.controls & 12) === 0) && sc.some((c) => c.fire));
    assert('...but does strafe between shots', sc.some((c) => !c.fire && (c.controls & 12) !== 0));
}

{
    console.log('Test: per-bot variance and aggression');
    const opts = (variance, seed) => new CombatController({ player: mockPlayer(), map: flatMap(), iteratePlayers: () => {}, rng: seeded(seed) }, { difficulty: 'normal', variance }).opts;
    const a = opts(0, 1), b = opts(0, 2);
    assert('variance 0: every bot is identical', a.reactionTime === b.reactionTime && a.aimErrorDeg === b.aimErrorDeg && a.turnRateDeg === b.turnRateDeg);
    const c = opts(1, 1), d = opts(1, 2);
    assert('variance 1: bots differ from each other', c.reactionTime !== d.reactionTime && c.aimErrorDeg !== d.aimErrorDeg && c.turnRateDeg !== d.turnRateDeg);
    assert('...by a bounded amount', (() => { for (let s = 1; s < 60; s++) { const o = opts(1, s); if (o.reactionTime < 0.45 * 0.6 || o.reactionTime > 0.45 * 1.4 || o.aggression < 0 || o.aggression > 1) return false; } return true; })());
    assert('a bigger variance spreads them more', (() => { const spread = (v) => { const xs = []; for (let s = 1; s < 60; s++) xs.push(opts(v, s).reactionTime); return Math.max(...xs) - Math.min(...xs); }; return spread(1) > spread(0.3) * 2; })());
    assert('variance is deterministic for the same seed', opts(1, 5).reactionTime === opts(1, 5).reactionTime);

    const cc = (aggression, extra = {}) => makeController(mockPlayer(), [], { aggression, ...extra });
    const prof = weaponProfile(GUNS.eggk);
    assert('aggressive bots fight closer', cc(1).rangesFor(prof).prefMax < cc(0).rangesFor(prof).prefMax && cc(1).rangesFor(prof).prefMin < cc(0).rangesFor(prof).prefMin);
    assert('...and retreat later', cc(1).retreatThreshold() < cc(0).retreatThreshold());
    assert('explicit preferred ranges are not rescaled', cc(1, { preferredRangeMin: 5, preferredRangeMax: 9 }).rangesFor(prof).prefMax === cc(0, { preferredRangeMin: 5, preferredRangeMax: 9 }).rangesFor(prof).prefMax);
    const chase = (aggression) => { const bot = mockPlayer(), human = mockHuman(); const ctl = makeController(bot, [human], { aggression, memoryTime: 3, reactionTime: 0, fovDeg: 360 }); run(ctl, 0.5); human.z = 500; return ctl; };
    const bold = chase(1), shy = chase(0);
    run(bold, 3.5); run(shy, 3.5);
    assert('aggressive bots keep hunting a lost target longer', bold.target !== null && shy.target === null);
}

{
    console.log('Test: spacing');
    const mkTeam = (spacing, id) => {
        const bot = mockPlayer({ id, team: 1 }), human = mockHuman({ id: 90, team: 2, z: 5.5 + 20 });
        const ctl = makeController(bot, [human], { spacing, huntRange: 200, fovDeg: 360, sightRange: 3 }, { map: flatMap(60) });
        return { bot, ctl };
    };
    const goalOf = (m) => run(m.ctl, 0.5).slice(-1)[0].moveTo;
    const g1 = goalOf(mkTeam(1, 1)), g2 = goalOf(mkTeam(1, 2)), g3 = goalOf(mkTeam(1, 3));
    assert('with spacing, bots hunting the same target aim for different spots', Math.hypot(g1.x - g2.x, g1.z - g2.z) > 0.5 && Math.hypot(g2.x - g3.x, g2.z - g3.z) > 0.5);
    assert('...all near the target', [g1, g2, g3].every((g) => Math.hypot(g.x - 5.5, g.z - 25.5) < 3));
    const n1 = goalOf(mkTeam(0, 1)), n2 = goalOf(mkTeam(0, 2));
    assert('spacing 0: they all aim for the same point', n1.x === n2.x && n1.z === n2.z);

    // Not walking into a teammate.
    const walk = (spacing) => {
        const bot = mockPlayer({ id: 1, team: 1 }), mate = mockPlayer({ id: 2, team: 1, x: 5.5, z: 5.5 + 1.2 }), human = mockHuman({ id: 90, team: 2, z: 5.5 + 25 });
        mate.client = { isHuman: false };
        const ctl = makeController(bot, [mate, human], { spacing, engageMovement: 'advance', preferredRangeMax: 8, preferredRangeMin: 1, fovDeg: 360, sightRange: 40, jumpChance: 0, reactionTime: 0 }, { map: flatMap(60) });
        return run(ctl, 1);
    };
    assert('with spacing it does not advance into a teammate standing in the way', walk(1).every((c) => !(c.controls & 1)));
    assert('without spacing it does', walk(0).some((c) => c.controls & 1));

    // Allies spread out around their owner rather than all standing on them.
    const owner = mockHuman({ id: 50, team: 1, x: 20.5, z: 20.5 });
    const follow = (id, spacing) => {
        const bot = mockPlayer({ id, team: 1, x: 5.5, z: 5.5 });
        const ctl = makeController(bot, [owner], { role: 'ally', spacing, followDistance: 6 }, { owner, map: flatMap(60) });
        return run(ctl, 0.5).slice(-1)[0].moveTo;
    };
    const f1 = follow(1, 1), f2 = follow(2, 1);
    assert('allies take different spots around the owner', Math.hypot(f1.x - f2.x, f1.z - f2.z) > 1);
    assert('...at about the follow distance, not on top of them', Math.hypot(f1.x - 20.5, f1.z - 20.5) > 1.5 && Math.hypot(f1.x - 20.5, f1.z - 20.5) < 6);
}

{
    console.log('Test: /botsdebug field scenarios');
    const ids = listScenarios();
    assert('there are at least 10 scenarios', ids.length >= 10, `${ids.length}`);
    assert('allocate hands out exactly the total', [1, 5, 12, 13, 40].every((n) => allocate(n, [3, 4, 2, 1]).reduce((a, b) => a + b, 0) === n));
    assert('allocate gives every group someone when it can', allocate(4, [3, 4, 2, 1]).every((c) => c >= 1));
    assert('allocate follows the weights', (() => { const c = allocate(20, [1, 3]); return c[1] > c[0] * 2; })());

    setClassProvider(() => [{ name: 'Soldier' }, { name: 'Scrambler' }, { name: 'Free Ranger' }, { name: 'Eggsploder' }]);
    let bad = [];
    for (const id of ids) for (const total of [undefined, 1, 2, 5, 13, 40, 99]) {
        const r = planField(id, total);
        const want = Math.min(total ?? FIELD_SCENARIOS[id].defaultTotal, 40);
        if (r.errors.length || r.plan.length !== want) bad.push(`${id}/${total}: ${r.errors.join(',')} ${r.plan.length}!=${want}`);
    };
    assert('every scenario plans cleanly at every size, with exactly the number asked for', bad.length === 0, bad.slice(0, 3).join(' | '));
    assert('defaults apply when no total is given', planField('stress').plan.length === FIELD_SCENARIOS.stress.defaultTotal);
    assert('asking for too many is capped, with a warning', (() => { const r = planField('mixed', 500); return r.plan.length === 40 && r.warnings.length === 1; })());
    assert('an unknown scenario is an error', planField('nope', 5).errors.length === 1);
    assert('zero bots is an error', planField('mixed', 0).errors.length === 1);
    assert('every bot gets a resolvable config', ids.every((id) => planField(id, 13).plan.every((e) => resolveCombatOptions(e.config).errors.length === 0)));

    const kinds = (r) => new Set(r.plan.map((e) => e.label));
    assert('mixed has a spread of difficulties', kinds(planField('mixed', 12)).size === 4);
    assert('rookies are all low skill', planField('rookies', 10).plan.every((e) => resolveCombatOptions(e.config).options.skill <= 0.25));
    assert('gauntlet is all hard or better', planField('gauntlet', 10).plan.every((e) => resolveCombatOptions(e.config).options.skill >= 0.75));
    assert('dummies never shoot and stay put', planField('dummies', 6).plan.every((e) => { const o = resolveCombatOptions(e.config).options; return o.holdFire && o.huntRange === 1; }));
    assert('rushers are aggressive close-range brawlers', planField('rushers', 8).plan.every((e) => { const o = resolveCombatOptions(e.config).options; return o.aggression === 1 && e.config.class === 'scrambler'; }));
    assert('stealth is half deaf, half keen, and nobody hunts', (() => { const r = planField('stealth', 10).plan.map((e) => resolveCombatOptions(e.config).options); return r.filter((o) => o.hearingRange === 0).length === 5 && r.filter((o) => o.hearingRange > 50).length === 5 && r.every((o) => o.huntRange === 1); })());

    // Who fights whom
    const teamOf = (r) => r.plan.map((e) => e.team);
    assert('ffa is everyone on team 0, targeting everyone', planField('ffa', 12).plan.every((e) => e.team === 0 && resolveCombatOptions(e.config).options.targets === 'all'));
    const teams = teamOf(planField('teams', 12));
    assert('teams splits evenly across teams 1 and 2', teams.filter((t) => t === 1).length === 6 && teams.filter((t) => t === 2).length === 6);
    assert('...and an odd total is off by at most one', Math.abs(teamOf(planField('teams', 7)).filter((t) => t === 1).length - teamOf(planField('teams', 7)).filter((t) => t === 2).length) <= 1);
    assert('botwar: two teams that only target bots', (() => { const r = planField('botwar', 10); return new Set(teamOf(r)).size === 2 && r.plan.every((e) => resolveCombatOptions(e.config).options.targets === 'bots'); })());
    const squad = planField('squad', 12);
    assert('squad: allies defend the player, enemies hunt', squad.plan.filter((e) => e.config.role === 'ally').length >= 4 && squad.plan.filter((e) => e.config.role !== 'ally').length >= 5);
    assert('squad from a free-for-all player: allies team 1, enemies team 2', squad.plan.filter((e) => e.ally).every((e) => e.team === 1) && squad.plan.filter((e) => !e.ally).every((e) => e.team === 2));
    const squad2 = planField('squad', 12, { invokerTeam: 2 });
    assert('squad from a player on team 2: allies join team 2, enemies team 1', squad2.plan.filter((e) => e.ally).every((e) => e.team === 2) && squad2.plan.filter((e) => !e.ally).every((e) => e.team === 1));
    assert('squad enemies target everyone, allies included', squad.plan.filter((e) => !e.ally).every((e) => resolveCombatOptions(e.config).options.targets === 'all'));

    // Classes, including plugin ones
    const cls = (r) => r.plan.map((e) => e.config.class);
    assert('classes: one group per class that exists', new Set(cls(planField('classes', 8))).size === 4);
    setClassProvider(() => [{ name: 'Soldier' }, { name: 'Scrambler' }, { name: 'Free Ranger' }, { name: 'Eggsploder' }, { name: 'Crackshot' }]);
    assert('...and picks up Crackshot when that plugin is present', cls(planField('classes', 10)).includes('crackshot') && new Set(cls(planField('classes', 10))).size === 5);
    assert('snipers use Crackshot when it is there', cls(planField('snipers', 4)).every((c) => c === 'crackshot'));
    setClassProvider(() => [{ name: 'Soldier' }, { name: 'Scrambler' }, { name: 'Free Ranger' }, { name: 'Eggsploder' }]);
    assert('...and the Free Ranger when it is not', cls(planField('snipers', 4)).every((c) => c === 'freeranger'));
    assert('classes without Crackshot never mention it', !cls(planField('classes', 10)).includes('crackshot'));
    setClassProvider(() => []);
    assert('with no class list at all, snipers fall back to the default class', cls(planField('snipers', 2)).every((c) => c === 'default'));
    setClassProvider(() => [{ name: 'Soldier' }, { name: 'Scrambler' }, { name: 'Free Ranger' }, { name: 'Eggsploder' }]);

    // Overrides
    const ov = planField('mixed', 6, { overrides: { skill: '0.9', aggression: '1' } });
    assert('overrides apply to every bot', ov.errors.length === 0 && ov.plan.every((e) => { const o = resolveCombatOptions(e.config).options; return o.skill === 0.9 && o.aggression === 1; }));
    assert('a bad override is reported once, not per bot', planField('mixed', 6, { overrides: { banana: '1' } }).errors.length === 1);
    assert('overrides cannot move a bot to another team', planField('teams', 6, { overrides: { team: '0' } }).plan.every((e) => e.team === 1 || e.team === 2));

    // The fights really happen: wire up controllers the way the scenario says and see who they pick.
    const duel = (aOpts, bOpts, aTeam, bTeam, humanToo) => {
        const a = mockPlayer({ id: 1, team: aTeam, x: 8, z: 8 }), b = mockPlayer({ id: 2, team: bTeam, x: 8, z: 16 });
        const people = [a, b];
        if (humanToo) people.push(mockHuman({ id: 3, team: 0, x: 40, z: 40 }));
        const ca = makeController(a, people.filter((p) => p !== a), { fovDeg: 360, reactionTime: 0, huntRange: 1, sightRange: 60, ...aOpts }, { map: flatMap(60) });
        const cb = makeController(b, people.filter((p) => p !== b), { fovDeg: 360, reactionTime: 0, huntRange: 1, sightRange: 60, ...bOpts }, { map: flatMap(60) });
        run(ca, 0.6); run(cb, 0.6);
        return { a, b, ca, cb };
    };
    const tcfg = (id) => resolveCombatOptions(planField(id, 4).plan[0].config).options;
    const ffa = duel({ targets: tcfg('ffa').targets }, { targets: tcfg('ffa').targets }, 0, 0);
    assert('ffa: bots on team 0 pick each other', ffa.ca.target === ffa.b && ffa.cb.target === ffa.a);
    const rival = duel({ targets: 'all' }, { targets: 'all' }, 1, 2);
    assert('teams: bots on opposite teams pick each other', rival.ca.target === rival.b && rival.cb.target === rival.a);
    const mates = duel({ targets: 'all' }, { targets: 'all' }, 1, 1);
    assert('teams: bots on the same team leave each other alone', mates.ca.target === null && mates.cb.target === null);
    const watch = duel({ targets: 'bots' }, { targets: 'bots' }, 1, 2, true);
    assert('botwar: they fight each other and ignore the human', watch.ca.target === watch.b && watch.cb.target === watch.a);
    const pve = duel({ targets: 'humans' }, { targets: 'humans' }, 0, 0, true);
    assert('PvE scenarios: they ignore each other and go for the human', pve.ca.target !== pve.b && pve.cb.target !== pve.a && pve.ca.target && pve.ca.target.id === 3 && pve.cb.target && pve.cb.target.id === 3);
}

{
    console.log('Test: egg colours');
    assert('the palette has the game\'s 14 colours in the game\'s order', SHELL_COLORS.length === 14 && SHELL_COLORS[0] === 'white' && SHELL_COLORS[7] === 'red' && SHELL_COLORS[11] === 'blue' && SHELL_COLORS[13] === 'lime');
    assert('names resolve to palette indices', resolveShellColor('red') === 7 && resolveShellColor('Blue') === 11 && resolveShellColor('white') === 0);
    assert('numbers resolve, as numbers or text', resolveShellColor(7) === 7 && resolveShellColor('11') === 11 && resolveShellColor(13) === 13);
    assert('out of range and unknown names do not resolve', resolveShellColor(14) === null && resolveShellColor(-1) === null && resolveShellColor('chartreuse') === null && resolveShellColor('99') === null);
    assert('unset / default leaves it alone', resolveShellColor(null) === null && resolveShellColor(undefined) === null && resolveShellColor('default') === null);
    assert('random picks a valid colour', (() => { for (let i = 0; i < 80; i++) { const n = resolveShellColor('random', seeded(i)); if (!(n >= 0 && n <= 13)) return false; } return true; })());
    assert('the option accepts names (case-insensitively), numbers, random and default', coerceOption('color', 'BLUE').value === 'blue' && coerceOption('color', '7').value === 'red' && coerceOption('color', 'random').value === 'random' && coerceOption('color', 'default').value === null);
    assert('a bad colour lists the choices', /one of: default, random, white\(0\).*lime\(13\)/.test(coerceOption('color', 'chartreuse').error ?? ''));
    assert('it is in the options with no colour set by default', resolveCombatOptions().options.color === null && resolveCombatOptions({ color: 'red' }).options.color === 'red');
    assert('botwar: team 1 is blue and team 2 is red', (() => { const r = planField('botwar', 8).plan; return r.filter((e) => e.team === 1).every((e) => e.config.color === 'blue') && r.filter((e) => e.team === 2).every((e) => e.config.color === 'red') && r.some((e) => e.team === 1) && r.some((e) => e.team === 2); })());
    assert('...matching the game\'s own team colours (1 = blue, 2 = red)', SHELL_COLORS[11] === 'blue' && planField('botwar', 2).plan.find((e) => e.team === 1).config.color === 'blue');
    assert('a colour given on the command line applies to every bot instead', planField('botwar', 6, { overrides: { color: 'green' } }).plan.every((e) => e.config.color === 'green'));
    assert('other scenarios do not set colours', ['mixed', 'ffa', 'teams', 'squad', 'stress'].every((id) => planField(id, 8).plan.every((e) => e.config.color === undefined)));
    assert('every botwar config still resolves', planField('botwar', 8).plan.every((e) => resolveCombatOptions(e.config).errors.length === 0));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
