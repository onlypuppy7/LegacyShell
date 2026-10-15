// Headless test of the zombies gamemode: boots a real room (real map, physics and bots) with this plugin's listeners
// registered the way the loader would (without the loader's git pull), adds stand-in humans, and drives the room on a virtual
// clock. Covers infection, sudden death, the win conditions, eggs, the round restart and whether zombies actually reach and
// bite someone.
//
// Run with: node plugins_default/zombiesmode/test-zombies.js [map name]     (takes a minute or so)

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { args: process.argv.slice(2) }, stdout: false, stderr: false });
    worker.on('message', (msg) => { if (msg?.__test) { console.log(msg.line); if (msg.done) process.exit(msg.failed ? 1 : 0); } }); //the room posts its own messages on this port too
    worker.on('error', (e) => { console.error('test worker error:', e); process.exit(1); });
    worker.on('exit', (code) => process.exit(code));
} else {
    const lines = [];
    let passed = 0, failed = 0;
    const say = (line) => parentPort.postMessage({ __test: true, line });
    const assert = (name, condition, detail = '') => {
        if (condition) { passed++; say(`  ok - ${name}`); }
        else { failed++; say(`  FAIL - ${name}${detail ? ` (${detail})` : ''}`); };
    };
    const realConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error };
    const mute = () => { console.log = () => {}; console.info = () => {}; console.warn = () => {}; console.error = () => {}; };
    const unmute = () => Object.assign(console, realConsole);
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
        mute();
        const fs = await import('node:fs');
        const path = await import('node:path');
        const yaml = (await import('js-yaml')).default;
        const here = path.dirname(fileURLToPath(import.meta.url));

        const miscModule = await import('#misc');
        miscModule.misc.instantiateSS(import.meta, ['node', 'test', '--game'], true);
        const ss = miscModule.ss;
        ss.maps = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game', 'store', 'maps.json'), 'utf8'));
        ss.items = JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'server-game', 'store', 'items.json'), 'utf8'));
        ss.permissions = yaml.load(fs.readFileSync(path.join(ss.rootDir, 'store', 'config', 'distributed_permissions.yaml'), 'utf8'));
        await (await import('#items')).initItems();
        const { plugins } = await import('#plugins');

        // Plugin listeners go in before the room (and with it gametypes.js) is loaded, as the gametype is registered at load.
        const zombies = await import('./index.js');
        const deadinternet = await import('../deadinternet/index.js');
        new zombies.Plugin(plugins, here);
        new deadinternet.Plugin(plugins, path.join(here, '..', 'deadinternet'));

        if (process.env.NOSWARM) zombies.pluginInstance.zombieMove = () => {}; //to compare with zombies that just wait
        const RoomConstructor = (await import('#rooms')).default;
        const Comm = (await import('#comm')).default;
        const { GameType } = await import('#gametypes');
        const { TickStep, iteratePlayers } = await import('#constants');
        await sleep(100); //GameType is filled in by an async block
        unmute();

        const mapName = (workerData.args[0] || 'Castle').toLowerCase();
        const mapId = ss.maps.findIndex((m) => m.name.toLowerCase() === mapName);
        if (mapId < 0) { say(`unknown map ${mapName}`); parentPort.postMessage({ __test: true, line: '', done: true, failed: 1 }); return; };
        assert('the zombies gametype is registered', typeof GameType.zombies === 'number', JSON.stringify(GameType));

        mute();
        const room = new RoomConstructor({ gameType: GameType.zombies, mapId, gameId: 1, gameKey: 784, joinType: Comm.Code.createPrivateGame, locked: false, extraParams: {} });
        ss.room = room;
        for (let i = 0; i < 600 && !room.map; i++) await sleep(50);
        const stopLoops = () => { for (const loop of ['updateLoopObject', 'dataSyncLoopObject', 'metaLoopObject', 'updateRoomDetailsLoopObject', 'spawnItemsLoopObject']) { try { room[loop]?.stop?.(); room[loop]?.clear?.(); } catch { }; }; };
        stopLoops();
        unmute();
        if (!room.map) { say('room never built'); parentPort.postMessage({ __test: true, line: '', done: true, failed: 1 }); return; };

        const notes = [];
        room.notify = (text) => notes.push(text);
        const packChat = room.packChat.bind(room);
        room.packChat = (output, text, ...rest) => { notes.push(text); return packChat(output, text, ...rest); }; //chat lines
        const COUNT = 4;
        room.gameOptions.plugins.zombies.count = COUNT;
        room.gameOptions.plugins.zombies.headStartSecs = 0; //the real defaults would only slow the test down
        room.gameOptions.plugins.zombies.staggerSecs = 0;

        assert('the room is a timed team game', room.gameOptions.timedGame.enabled && room.gameOptions.teamsEnabled);
        assert('team 2 bites, team 1 does not', room.gameOptions.contactDamage[2] > 0 && room.gameOptions.contactDamage[1] === 0);

        // Stand-in humans: a real client with a websocket id (so isHuman), brought up the way a bot is.
        const eggs = {};
        async function addHuman(name, wsId) {
            mute();
            const client = await room.joinPlayer({ id: null, nickname: name, classIdx: 0, wsId, primary_item_id: 0, secondary_item_id: 0, useOOBid: true });
            client.noConnectionTimeout = true;
            await client.waitUntilReady();
            await client.clientReady();
            client.addEggsViaServices = async (n) => { eggs[name] = (eggs[name] ?? 0) + n; };
            client.addKillViaServices = async () => { eggs[name] = (eggs[name] ?? 0) + 10; };
            unmute();
            return client;
        };
        const spawn = async (client, at) => {
            mute();
            await client.requestRespawn();
            if (at) { client.player.x = at.x; client.player.y = at.y; client.player.z = at.z; };
            unmute();
        };

        const see = async (...players) => { mute(); for (const player of players) await plugins.emit("playerUpdate", { this: room, player }); unmute(); }; //what the room does for everyone each tick
        const meta = async () => { mute(); await plugins.emit('metaLoop', { this: room }); unmute(); };
        const bots = () => deadinternet.DeadInternetBots.filter((b) => b.room === room);

        const h1 = await addHuman('Human1', 7001);
        const h2 = await addHuman('Human2', 7002);
        const H1 = h1.player, H2 = h2.player;
        assert('humans start on team 1', H1.team === 1 && H2.team === 1, `${H1.team} ${H2.team}`);
        await spawn(h1); await spawn(h2);

        // ---- the horde ----
        await meta(); //starts the round and starts filling
        for (let i = 0; i < 1200 && bots().length < COUNT; i++) await sleep(50);
        assert(`the horde is brought up to ${COUNT}`, bots().length === COUNT, `${bots().length}`);
        const zs = bots().map((b) => b.player);
        assert('zombies keep no gun distance', bots().every((b) => b.combat.rangesFor({ prefMax: 20, prefMin: 5 }).prefMax === 0));
        assert('zombies are on team 2', zs.every((p) => p.team === 2), zs.map((p) => p.team).join());
        assert('zombies are slow and about as tough as a player', zs.every((p) => p.modifiers.resistanceModifier === 1 && p.modifiers.speedModifier < 0.9), JSON.stringify(zs[0].modifiers));
        assert('zombies bite', zs.every((p) => p.modifiers.contactDamage === 15));
        assert('zombies cannot shoot', zs.every((p) => p.modifiers.damageModifier === 0));

        // ---- spawn points ----
        {
            const all = room.spawnPoints.flat().filter(Boolean);
            const where = all[0];
            H1.x = where.x + 0.5; H1.y = where.y; H1.z = where.z + 0.5;
            const near = Math.min(12, 0.4 * Math.max(room.map.width, room.map.depth));
            const places = new Set();
            let tooClose = 0, respawned = 0;
            for (let i = 0; i < 16; i++) {
                const b = bots()[i % COUNT];
                mute(); b.player.removeFromPlay(); b.player.nextRespawn = 0; await b.respawn(); unmute();
                if (!b.player.playing) continue;
                respawned++;
                const p = b.player;
                for (const h of [H1, H2]) if (Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) <= near) tooClose++;
                places.add(`${Math.round(p.x)},${Math.round(p.z)}`);
            };
            assert('zombies respawn', respawned === 16, `${respawned}`);
            assert(`...never within ${near.toFixed(1)} blocks of a human`, tooClose === 0, `${tooClose}`);
            assert('...and at different spawn points, not all in one place', places.size >= 3, `${places.size} places of ${all.length} spawn points`);
            await spawn(h1);
        };

        // ---- eggs ----
        mute(); H1.kills = 0;
        H1.scoreKill(zs[0]); H1.scoreKill(zs[0]);
        await sleep(50); unmute();
        assert('killing zombies pays killEggs each, not the usual reward', eggs.Human1 === 4, JSON.stringify(eggs));
        mute(); for (let i = 0; i < 100; i++) H1.scoreKill(zs[0]); await sleep(50); unmute();
        assert('kill eggs are capped per round', eggs.Human1 === 100, JSON.stringify(eggs));
        mute(); H1.scoreKill(H2); await sleep(50); unmute();
        assert('killing a human pays nothing', eggs.Human1 === 100);

        // ---- infection and sudden death ----
        const killByZombie = async (victim) => { mute(); victim.hit(1000, zs[0], 1, 0, undefined, 1000); await sleep(20); unmute(); };
        await spawn(h1); await spawn(h2);
        await meta();
        await see(H1, H2); await meta();
        await killByZombie(H1);
        assert('a human who dies joins the horde', H1.team === 2, `${H1.team}`);
        assert('...and gets the horde\'s modifiers: bites, no gun, about 75 hp', H1.modifiers.contactDamage === 15 && H1.modifiers.damageModifier === 0 && Math.abs(H1.modifiers.resistanceModifier - 0.75) < 1e-9, JSON.stringify(H1.modifiers));
        assert('...and is announced', notes.some((n) => n.includes('Human1') && n.includes('infected')), notes.join(' | '));
        assert('the last human left starts sudden death', room.gameOptions.plugins.time === 'night' && room.gameOptions.plugins.weather?.storm === 1, JSON.stringify(room.gameOptions.plugins));
        assert('...and the horde is faster', zs.every((p) => p.modifiers.speedModifier > 0.7), zs.map((p) => p.modifiers.speedModifier).join());
        assert('...which includes the infected human', H1.modifiers.speedModifier > 1.3, `${H1.modifiers.speedModifier}`);
        assert('...and says so', notes.some((n) => n.includes('SUDDEN DEATH')));

        // ---- thunder ----
        room.gameOptions.plugins.zombies.surgeSecs = 0.3;
        const before = zs[0].modifiers.speedModifier;
        mute(); await plugins.emit("thunderStrike", { room, distance: 50 }); unmute();
        assert("a lightning strike in sudden death makes the horde surge", zs[0].modifiers.speedModifier > before * 1.4, `${before} -> ${zs[0].modifiers.speedModifier}`);
        await sleep(450);
        assert("...briefly", Math.abs(zs[0].modifiers.speedModifier - before) < 1e-9, `${zs[0].modifiers.speedModifier}`);

        // ---- the horde wins ----
        await killByZombie(H2);
        assert('the last human is infected too', H2.team === 2);
        const roundEndBefore = room.roundEndTime;
        await sleep(1800); //endEarly waits a moment
        mute(); await meta(); unmute();
        assert('the round ends early when nobody is left', room.roundEndTime <= Date.now() && room.roundEndTime !== roundEndBefore, `${room.roundEndTime} vs ${roundEndBefore}`);
        assert('...announcing the horde', notes.some((n) => n.includes('horde wins')), notes.join(' | '));
        assert('...and sudden death is put away', room.gameOptions.plugins.time !== 'night' && !(room.gameOptions.plugins.weather?.storm === 1), JSON.stringify(room.gameOptions.plugins));
        assert('...and the speed-up with it', H1.modifiers.speedModifier < 1.1 && zs.every((p) => p.modifiers.speedModifier < 0.8), `${H1.modifiers.speedModifier} ${zs.map((p) => p.modifiers.speedModifier)}`);

        // ---- next round ----
        mute();
        notes.length = 0;
        clearTimeout(room.roundTimeout);
        room.setRoundTimeout(); //what endRound's own timer does after the break
        unmute();
        await sleep(150);
        assert("a new round cures the infected", H1.team === 1 && H2.team === 1, `${H1.team} ${H2.team}`);
        assert("...and gives them the human modifiers back", H1.modifiers.contactDamage === 0 && H1.modifiers.damageModifier === 1, JSON.stringify(H1.modifiers));
        assert("...and spawns everyone into it without anyone pressing play", H1.playing && H2.playing, `${H1.playing} ${H2.playing}`);
        await see(H1, H2); await meta(); await see(H1, H2);

        // ---- the humans win ----
        eggs.Human1 = 0; eggs.Human2 = 0;
        clearTimeout(room.roundTimeout);
        mute(); room.endRound(); unmute();
        assert("surviving the round wins it", notes.some((n) => n.includes("humans survived")), notes.join(" | "));
        assert("...and pays each survivor", eggs.Human1 === 20 && eggs.Human2 === 20, JSON.stringify(eggs));

        // ---- leaving through the menu ----
        mute(); notes.length = 0; clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
        await sleep(150); await see(H1, H2); await meta(); await see(H1, H2);
        mute(); H1.removeFromPlay(); unmute(); //what the game does a few seconds after escape is pressed
        await see(H1);
        assert("dropping out of play without dying infects you", H1.team === 2, `${H1.team}`);
        assert("...and says why", notes.some((n) => n.includes("Human1") && n.includes("left the fight")), notes.join(" | "));
        assert("...and the other human is unaffected", H2.team === 1);

        // ---- late joiners ----
        const h3 = await addHuman("Human3", 7003);
        assert("someone who joins early in a round is human", h3.player.team === 1, `${h3.player.team}`);
        room.gameOptions.plugins.zombies.graceSecs = 0; await sleep(5);
        await spawn(h3);
        assert("...but one who first spawns after the grace period is infected", h3.player.team === 2 && h3.player.playing, `${h3.player.team} ${h3.player.playing}`);
        room.gameOptions.plugins.zombies.graceSecs = 30;
        mute(); h3.onclose?.(); unmute();

        // ---- the head start ----
        room.gameOptions.plugins.zombies.headStartSecs = 5;
        mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
        await sleep(150);
        mute(); for (const b of bots()) { b.player.removeFromPlay(); clearTimeout(b.zombieTimer); b.zombieTimer = null; } unmute();
        await meta();
        await sleep(300);
        assert("zombies do not come back before the humans' head start is up", bots().every((b) => !b.player.playing), bots().map((b) => b.player.playing).join());
        room.gameOptions.plugins.zombies.headStartSecs = 0;
        mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
        await sleep(150);

        // ---- do the zombies actually reach someone? ----
        let virtual = Date.now();
        Date.now = () => virtual;
        room.lastTimeStamp = virtual;
        const spawns1 = (room.spawnPoints[1] || []).filter(Boolean);
        const start = spawns1[0];
        H1.hp = 100; H2.hp = 100;
        await spawn(h1, start);
        mute(); H2.removeFromPlay(); H2.playing = false; unmute();
        const zombiesAlive = () => zs.filter((p) => p.playing && !p.isDead());
        mute();
        for (const b of bots()) { if (!b.player.playing) { b.player.nextRespawn = 0; await b.respawn(); }; };
        unmute();

        let firstBite = null, nearest = Infinity;
        const seconds = 150;
        mute();
        for (let t = 0; t < seconds * 60; t++) {
            virtual += TickStep;
            await room.updateLoop(1);
            if (t % 120 === 0) await plugins.emit('metaLoop', { this: room });
            for (const z of zombiesAlive()) nearest = Math.min(nearest, Math.hypot(z.x - H1.x, z.z - H1.z));
            if (firstBite === null && H1.hp < 100) firstBite = t / 60;
            if (H1.team === 2) break;
        };
        unmute();
        say(`  (a stationary human at the team 1 spawn: first bitten after ${firstBite === null ? 'never' : firstBite.toFixed(1) + 's'}, closest a zombie got ${nearest.toFixed(2)} blocks)`);
        assert('zombies reach a standing human and bite them', firstBite !== null, `closest ${nearest.toFixed(2)}`);
        assert('...walking right up to them rather than stopping short', nearest < 0.6, nearest.toFixed(2));
        assert('...and a standing human does not last: they are infected', H1.team === 2 || H1.hp < 100);

        // ---- someone who cannot be reached ----
        {
            const map = room.map;
            const standable = [];
            for (let x = 0; x < map.width; x++) for (let z = 0; z < map.depth; z++) for (let y = map.height - 1; y >= 1; y--) if (deadinternet.isStandable(map, x, y, z)) { standable.push({ x, y, z }); break; }; //the top of each column
            standable.sort((a, b) => b.y - a.y);
            const from = { x: start.x + 0.5, y: start.y, z: start.z + 0.5 };
            let perch = null;
            mute();
            const reachable = (c) => !!deadinternet.findPath(room, from, { x: c.x + 0.5, y: c.y, z: c.z + 0.5 });
            //a tower: high up, nothing leads to the top, but the ground at its foot can be walked to
            for (const cell of standable.slice(0, 120)) {
                if (reachable(cell)) continue;
                const foot = standable.find((c) => c.y <= cell.y && Math.hypot(c.x - cell.x, c.z - cell.z) <= 3.5 && reachable(c));
                if (foot) { perch = cell; break; };
            };
            unmute();
            if (!perch) say('  (no unreachable tower with a reachable foot found on this map: the next check is skipped)');
            else {
                //a new round, so everyone is back in play and human, then the human sits somewhere nobody can walk to
                mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
                await sleep(100);
                for (const b of bots()) { mute(); if (!b.player.playing) { b.player.nextRespawn = 0; await b.respawn(); }; unmute(); };
                H1.hp = 100; H1.team = 1; H1.x = perch.x + 0.5; H1.y = perch.y; H1.z = perch.z + 0.5;
                mute(); H2.removeFromPlay(); H2.playing = false; H1.playing = true; unmute();
                const closeTo = (r) => zs.filter((p) => p.playing && Math.hypot(p.x - H1.x, p.z - H1.z) < r).length;
                let best = Infinity;
                mute();
                for (let t = 0; t < 60 * 60; t++) {
                    virtual += TickStep;
                    await room.updateLoop(1);
                    if (t % 120 === 0) await plugins.emit('metaLoop', { this: room });
                    H1.hp = 100; //only watching where they go
                    for (const p of zs) if (p.playing) best = Math.min(best, Math.hypot(p.x - H1.x, p.z - H1.z));
                };
                unmute();
                say(`  (a human at ${perch.x},${perch.y},${perch.z}, which no route leads to the top of: after 60s the closest zombie is ${best.toFixed(1)} blocks away, ${closeTo(4)} of ${zs.length} within 4 blocks)`);
                assert('zombies crowd up against a human they cannot reach', best < 4 && closeTo(5) >= 2, `${best.toFixed(2)}, ${closeTo(5)} within 5`);
            };
        };

        say(`\n${passed} passed, ${failed} failed`);
        parentPort.postMessage({ __test: true, line: '', done: true, failed });
    })().catch((e) => { say('test crashed: ' + (e?.stack || e)); parentPort.postMessage({ __test: true, line: '', done: true, failed: 1 }); });
}
