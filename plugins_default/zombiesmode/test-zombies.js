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
        const { plugins } = await import('#plugins');

        // Plugin listeners go in before the room (and with it gametypes.js) is loaded, as the gametype is registered at load.
        const zombies = await import('./index.js');
        const deadinternet = await import('../deadinternet/index.js');
        const healthpack = await import('../healthpackitem/index.js');
        new zombies.Plugin(plugins, here);
        new deadinternet.Plugin(plugins, path.join(here, '..', 'deadinternet'));
        new healthpack.Plugin(plugins, path.join(here, '..', 'healthpackitem'));
        const items = await import('#items');
        await items.initItems(); //after the plugins, so they get to add their items and wrap each other\'s

        if (process.env.NOSWARM) zombies.pluginInstance.zombieMove = () => {}; //to compare with zombies that just wait
        const RoomConstructor = (await import('#rooms')).default;
        const Comm = (await import('#comm')).default;
        const { GameType } = await import('#gametypes');
        const { TickStep, iteratePlayers, ItemType } = await import('#constants');
        await sleep(100); //GameType is filled in by an async block
        unmute();

        const mapName = (workerData.args[0] || 'Two Towers').toLowerCase();
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
        room.gameOptions.plugins.zombies.ghostRatio = 0; //(ghosts have their own section at the end)
        if (process.env.ZSPEED) room.gameOptions.plugins.zombies.zombieSpeed = Number(process.env.ZSPEED); //to find out what speed a gap needs
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
        assert('the room has health packs, for the humans', room.gameOptions.itemsEnabled.some((e) => e[0] === items.ItemTypes.HEALTH), JSON.stringify(room.gameOptions.itemsEnabled));
        {
            const pack = items.AllItems[items.ItemTypes.HEALTH];
            const z0 = bots()[0].player;
            z0.hp = 50; H1.hp = 50;
            const zombieGot = pack.collect(z0, 0), humanGot = pack.collect(H1, 0);
            assert('...a human can pick one up, and is healed', humanGot === true && H1.hp === 100, `${humanGot} ${H1.hp}`);
            assert('...the horde cannot, and the pack stays put', zombieGot === false && z0.hp === 50, `${zombieGot} ${z0.hp}`);
            z0.hp = 100;
        };
        assert('zombies are on team 2', zs.every((p) => p.team === 2), zs.map((p) => p.team).join());
        const baseSpeeds = zs.map((p) => p.modifiers.speedModifier);
        assert('zombies are all exactly the zombie speed', baseSpeeds.every((v) => Math.abs(v - room.gameOptions.plugins.zombies.zombieSpeed) < 1e-9), baseSpeeds.join());
        assert('humans are a little faster than normal', Math.abs(H2.modifiers.speedModifier - 1.1) < 1e-9, `${H2.modifiers.speedModifier}`);
        assert('zombies are slow and have about 70 hp', zs.every((p) => Math.abs(p.modifiers.resistanceModifier - 0.7) < 1e-9 && p.modifiers.speedModifier < 0.9), JSON.stringify(zs[0].modifiers));
        assert('zombies bite', zs.every((p) => p.modifiers.contactDamage === 15));
        assert('zombies cannot shoot', zs.every((p) => p.modifiers.damageModifier === 0));

        // ---- spawn points ----
        {
            const all = room.spawnPoints.flat().filter(Boolean);
            const where = all[0];
            H1.x = where.x + 0.5; H1.y = where.y; H1.z = where.z + 0.5;
            const near = Math.min(12, 0.4 * Math.max(room.map.width, room.map.depth));
            const places = new Set();
            let tooClose = 0, respawned = 0, packetsMatch = 0, extraPackets = 0;
            const sent = [];
            const sendToAll = room.sendToAll.bind(room);
            room.sendToAll = (output, id, debug) => { sent.push({ debug, buffer: output.buffer.slice(0) }); return sendToAll(output, id, debug); };
            for (let i = 0; i < 16; i++) {
                const b = bots()[i % COUNT];
                sent.length = 0;
                mute(); b.player.removeFromPlay(); b.player.nextRespawn = 0; await b.respawn(); unmute();
                if (!b.player.playing) continue;
                respawned++;
                const p = b.player;
                const packets = sent.filter((m) => m.debug === 'respawn');
                if (packets.length === 1) { //the position it spawned at is in the one respawn packet: nothing moves it afterwards
                    const input = new Comm.In(packets[0].buffer);
                    input.unPackInt8U(); input.unPackInt8U();
                    const px = input.unPackFloat(), py = input.unPackFloat(), pz = input.unPackFloat();
                    if (Math.abs(px - p.x) < 1e-4 && Math.abs(py - p.y) < 1e-4 && Math.abs(pz - p.z) < 1e-4) packetsMatch++;
                };
                extraPackets += sent.filter((m) => m.debug !== 'respawn' && /tele|move|pos|sync/i.test(m.debug)).length;
                for (const h of [H1, H2]) if (Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z) <= near) tooClose++;
                places.add(`${Math.round(p.x)},${Math.round(p.z)}`);
            };
            assert('zombies respawn', respawned === 16, `${respawned}`);
            assert(`...never within ${near.toFixed(1)} blocks of a human`, tooClose === 0, `${tooClose}`);
            assert('...and at different spawn points, not all in one place', places.size >= 3, `${places.size} places of ${all.length} spawn points`);
            room.sendToAll = sendToAll;
            assert('the spawn position is in the respawn packet, not a teleport after it', packetsMatch === 16 && extraPackets === 0, `${packetsMatch} of 16 packets match, ${extraPackets} other movement packets`);
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
        assert('...and gets the horde\'s modifiers: bites, no gun, about 60 hp', H1.modifiers.contactDamage === 15 && H1.modifiers.damageModifier === 0 && Math.abs(H1.modifiers.resistanceModifier - 0.6) < 1e-9, JSON.stringify(H1.modifiers));
        assert('...and is announced', notes.some((n) => n.includes('Human1') && n.includes('infected')), notes.join(' | '));
        assert('the last human left starts sudden death', room.gameOptions.plugins.time?.preset === 'night', JSON.stringify(room.gameOptions.plugins.time));
        assert('...in a downpour with lightning every second or two', room.gameOptions.plugins.weather?.storm?.lightning >= 3 && room.gameOptions.plugins.weather?.storm?.intensity === 1 && room.gameOptions.plugins.weather?.rain >= 0.8, JSON.stringify(room.gameOptions.plugins.weather));
        assert('...and the horde is faster', zs.every((p) => Math.abs(p.modifiers.speedModifier - 0.9) < 1e-6), zs.map((p) => p.modifiers.speedModifier).join());
        assert('...which includes the infected human', Math.abs(H1.modifiers.speedModifier - 0.9) < 1e-6, `${H1.modifiers.speedModifier}`);
        assert('...and says so', notes.some((n) => n.includes('SUDDEN DEATH')));
        assert('...the human left is quicker (1.1 to 1.3) and reloads faster (1.2 to 1.3)', Math.abs(H2.modifiers.speedModifier - 1.3) < 1e-9 && Math.abs(H2.modifiers.reloadSpeedModifier - 1.3) < 1e-9, JSON.stringify(H2.modifiers));
        assert('...and the browsers are told', room.gameOptions.plugins.zombiesSuddenDeath === true);

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
        assert('...and the sky goes back to what the room had', room.gameOptions.plugins.time === undefined && room.gameOptions.plugins.weather === undefined, JSON.stringify(room.gameOptions.plugins));
        assert('...and the human buff is gone from the infected (back to the team reload)', Math.abs(H2.modifiers.reloadSpeedModifier - 1.2) < 1e-9 && room.gameOptions.plugins.zombiesSuddenDeath === false, `${H2.modifiers.reloadSpeedModifier}`);
        assert('...and the speed-up with it', H1.modifiers.speedModifier < 1.1 && zs.every((p, i) => Math.abs(p.modifiers.speedModifier - baseSpeeds[i]) < 1e-9), `${H1.modifiers.speedModifier} ${zs.map((p) => p.modifiers.speedModifier)} vs ${baseSpeeds}`);
        await sleep(5);
        mute(); room.packUpdateRoomParams(new Comm.Out()); unmute(); //what everyone is sent, and anyone joining
        assert('between rounds the room params tell the browsers it is the gap', room.gameOptions.plugins.zombiesInterim === true, JSON.stringify(room.gameOptions.plugins.zombiesInterim));

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
        mute(); room.packUpdateRoomParams(new Comm.Out()); unmute();
        assert("...and the room params say the gap is over", room.gameOptions.plugins.zombiesInterim === false, JSON.stringify(room.gameOptions.plugins.zombiesInterim));
        await see(H1, H2); await meta(); await see(H1, H2);

        // ---- the sky ----
        const sky = () => room.gameOptions.plugins;
        assert("a round starts as an ordinary day", sky().time?.preset === "day" && sky().time.transitionSecs === 0 && !(sky().weather?.rain > 0), JSON.stringify(sky()));
        room.gameOptions.plugins.zombies.dayHoldSecs = 0; room.gameOptions.plugins.zombies.darkenSecs = 0.3;
        await meta();
        assert("...which turns into a dark, stormy dusk", sky().time.preset === "twilight" && sky().weather.storm.intensity >= 0.7 && sky().weather.rain >= 0.4, JSON.stringify(sky()));
        assert("...over darkenSecs", sky().time.transitionSecs === 0.3 && sky().weather.transitionSecs === 0.3);
        await sleep(400); await meta();
        assert("...and then slowly on towards night, the storm building", sky().time.preset === "night" && sky().time.transitionSecs >= 10 && sky().weather.storm.lightning > 1 && sky().weather.storm.intensity > 0.75, JSON.stringify(sky()));
        room.gameOptions.plugins.zombies.dayHoldSecs = 4; room.gameOptions.plugins.zombies.darkenSecs = 40;

        // ---- the humans win ----
        eggs.Human1 = 0; eggs.Human2 = 0;
        room.gameOptions.plugins.zombies.respawnSecs = 0.05; //so a zombie that did come back would do so quickly
        for (const b of bots()) { mute(); if (!b.player.playing) { b.player.nextRespawn = 0; await b.respawn(); }; unmute(); };
        const alive = () => zs.filter((p) => p.playing && !p.isDead()).length;
        assert("the horde is all there to start with", alive() === COUNT, `${alive()}`);
        const victoryRoundEnd = room.roundEndTime;
        mute(); zombies.pluginInstance.roundTimeUp(room); unmute(); //the round timer running out, with the humans still standing
        await sleep(30);
        assert("when the humans win the horde starts to die, one at a time", alive() === COUNT - 1, `${alive()}`);
        assert("...and nobody gets bitten while it plays out", zs.every((p) => p.modifiers.contactDamage === 0));
        await sleep(COUNT * 100);
        assert("...until none are left", alive() === 0, `${alive()}`);
        await sleep(300);
        assert("...and none come back, with the round still to be ended", alive() === 0 && room.roundEndTime === victoryRoundEnd, `${alive()} ${room.roundEndTime === victoryRoundEnd}`);
        await sleep(1400);
        assert("...which then ends", room.roundEndTime !== victoryRoundEnd);
        assert("surviving the round wins it", notes.some((n) => n.includes("humans survived")), notes.join(" | "));
        assert("...and pays each survivor", eggs.Human1 === 20 && eggs.Human2 === 20, JSON.stringify(eggs));

        // ---- leaving through the menu ----
        mute(); notes.length = 0; clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
        await sleep(150); await see(H1, H2); await meta(); await see(H1, H2);
        assert("the next round gives the horde its bite back after the victory", zs.every((p) => p.modifiers.contactDamage === 15), zs.map((p) => p.modifiers.contactDamage).join());
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
                H1.hp = 100; H1.team = 1; H1.x = perch.x + 0.5; H1.y = perch.y; H1.z = perch.z + 0.5; H1.predicted = H1; //(the zombies chase the predicted position, which a real client keeps up to date)
                mute(); H2.removeFromPlay(); H2.playing = false; H1.playing = true; unmute();
                const closeTo = (r) => zs.filter((p) => p.playing && Math.hypot(p.x - H1.x, p.z - H1.z) < r).length;
                let best = Infinity;
                mute();
                for (let t = 0; t < 60 * 60; t++) {
                    virtual += TickStep;
                    await room.updateLoop(1);
                    if (t % 120 === 0) await plugins.emit('metaLoop', { this: room });
                    H1.hp = 100; H1.predicted = H1; //only watching where they go
                    for (const p of zs) if (p.playing) best = Math.min(best, Math.hypot(p.x - H1.x, p.z - H1.z));
                };
                unmute();
                say(`  (a human at ${perch.x},${perch.y},${perch.z}, which no route leads to the top of: after 60s the closest zombie is ${best.toFixed(1)} blocks away, ${closeTo(4)} of ${zs.length} within 4 blocks)`);
                assert('zombies crowd up against a human they cannot reach', best < 4 && closeTo(5) >= 2, `${best.toFixed(2)}, ${closeTo(5)} within 5`);
            };
        };

        // ---- someone higher up who can be reached ----
        {
            const map = room.map;
            const standable = [];
            for (let x = 0; x < map.width; x++) for (let z = 0; z < map.depth; z++) for (let y = map.height - 1; y >= 1; y--) if (deadinternet.isStandable(map, x, y, z)) { standable.push({ x, y, z }); break; };
            standable.sort((a, b) => b.y - a.y);
            const from = { x: start.x + 0.5, y: start.y, z: start.z + 0.5 };
            mute();
            //somewhere a few levels up (not the highest place there is: that is a parkour course, not a stair)
            const ledge = standable.filter((c) => c.y >= start.y + 2 && c.y <= start.y + 3).slice(0, 150).find((c) => deadinternet.findPath(room, from, { x: c.x + 0.5, y: c.y, z: c.z + 0.5 }));
            unmute();
            if (!ledge) say('  (no reachable place two or three levels above the spawn found on this map: the next check is skipped)');
            else {
                mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
                await sleep(100);
                for (const b of bots()) { mute(); if (!b.player.playing) { b.player.nextRespawn = 0; await b.respawn(); }; unmute(); };
                mute(); H2.removeFromPlay(); H2.playing = false; unmute();
                H1.hp = 100; H1.team = 1; H1.x = ledge.x + 0.5; H1.y = ledge.y; H1.z = ledge.z + 0.5; H1.playing = true; H1.predicted = H1;
                for (const b of bots()) { mute(); b.player.removeFromPlay(); b.player.nextRespawn = 0; await b.respawn(); unmute(); }; //spawned again now the human is there: the horde starts well away
                let bitten = null;
                mute();
                for (let t = 0; t < 120 * 60 && bitten === null; t++) {
                    virtual += TickStep;
                    await room.updateLoop(1);
                    if (t % 120 === 0) await plugins.emit('metaLoop', { this: room });
                    H1.predicted = H1;
                    if (H1.hp < 100) bitten = t / 60;
                };
                unmute();
                say(`  (a human at ${ledge.x},${ledge.y},${ledge.z}, ${ledge.y - start.y} levels above the spawn, reachable by a route: first bitten after ${bitten === null ? 'never' : bitten.toFixed(1) + 's'})`);
                assert('zombies find their way up to someone standing higher up, and bite them', bitten !== null);
            };
        };

        // ---- crossing a one block gap, from a run-up ----
        {
            const map = room.map;
            const stand = (x, y, z) => deadinternet.isStandable(map, x, y, z);
            let gap = null;
            mute();
            for (let x = 0; x < map.width && !gap; x++) for (let z = 0; z < map.depth && !gap; z++) for (let y = 1; y < map.height && !gap; y++) {
                if (!stand(x, y, z)) continue;
                for (const [dx, dz] of [[2, 0], [0, 2]]) {
                    const bx = x + dx, bz = z + dz;
                    if (gap || !stand(bx, y, bz) || stand(x + dx / 2, y, z + dz / 2)) continue;
                    const route = deadinternet.findPath(room, { x: x + 0.5, y, z: z + 0.5 }, { x: bx + 0.5, y, z: bz + 0.5 });
                    if (!route || route.length > 4 || !route.some((w) => w.type === 'jump')) continue;
                    const ux = Math.sign(dx), uz = Math.sign(dz);
                    let back = 0;
                    while (back < 6 && stand(x - ux * (back + 1), y, z - uz * (back + 1))) back++;
                    if (back >= 3) gap = { x, y, z, bx, bz, ux, uz, back: Math.min(back, 5) };
                };
            };
            unmute();
            if (!gap) say('  (no one block gap with room for a run-up found on this map: the next check is skipped)');
            else {
                mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
                await sleep(100);
                for (const b of bots()) { mute(); if (!b.player.playing) { b.player.nextRespawn = 0; await b.respawn(); }; unmute(); };
                mute(); H2.removeFromPlay(); H2.playing = false; unmute();
                H1.hp = 100; H1.team = 1; H1.playing = true;
                H1.x = gap.bx + 0.5; H1.y = gap.y; H1.z = gap.bz + 0.5; H1.predicted = H1;
                const Z = zs[0], bot0 = bots().find((b) => b.player === Z);
                Z.x = gap.x - gap.ux * gap.back + 0.5; Z.y = gap.y; Z.z = gap.z - gap.uz * gap.back + 0.5; Z.dx = Z.dy = Z.dz = 0;
                bot0.stopPath(); bot0.combat.reset();
                let crossed = null;
                mute();
                for (let t = 0; t < 30 * 60 && crossed === null; t++) {
                    virtual += TickStep;
                    await room.updateLoop(1);
                    H1.hp = 100; H1.predicted = H1;
                    if (Math.hypot(Z.x - H1.x, Z.z - H1.z) < 0.8 && Math.abs(Z.y - H1.y) < 1) crossed = t / 60;
                };
                unmute();
                say(`  (a zombie ${gap.back} blocks back from a one block gap at ${gap.x},${gap.y},${gap.z}, the human across it: ${crossed === null ? 'did not get across' : 'across after ' + crossed.toFixed(1) + 's'})`);
                assert('zombies jump a one block gap to get at someone', crossed !== null);
            };
        };

        // ---- handing over to a route ----
        {
            const bot = bots()[0], p = bot.player;
            const attempt = (target, state = 'engage') => {
                const cmd = { engaged: true, fire: true, state, controls: 1 };
                bot.combat.target = target;
                let threw = null;
                try { zombies.pluginInstance.zombieThink(bot, cmd); } catch (e) { threw = e; };
                bot.combat.target = null;
                return { cmd, threw };
            };
            const above = attempt({ x: p.x + 5, y: p.y + 3, z: p.z });
            assert('someone in sight on another level is gone to by route (and that does not throw: it once did, which froze the zombie)', !above.threw && above.cmd.engaged === false && above.cmd.state === 'hunt' && above.cmd.moveTo?.y === p.y + 3 && above.cmd.fire === false, String(above.threw ?? JSON.stringify(above.cmd)));
            const far = attempt({ x: p.x + 40, y: p.y, z: p.z });
            assert('...and so is someone a long way off on the level', !far.threw && far.cmd.engaged === false && far.cmd.moveTo?.x === p.x + 40, String(far.threw ?? JSON.stringify(far.cmd)));
        };

        // ---- ghosts ----
        {
            const cfgNow = room.gameOptions.plugins.zombies;
            cfgNow.ghostRatio = 0.5; cfgNow.count = 6; //the two new ones will be ghosts
            mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
            await sleep(100);
            mute(); await plugins.emit('metaLoop', { this: room }); unmute();
            for (let i = 0; i < 400 && !(bots().filter((b) => b.zGhost && b.onDeath).length >= 2); i++) await sleep(50);
            const ghosts = bots().filter((b) => b.zGhost);
            const normal = bots().filter((b) => !b.zGhost);
            assert('the horde has ghosts among it, spread by the ratio', ghosts.length === 2 && normal.length === 4, `${ghosts.length} ghosts, ${normal.length} others`);
            const g = ghosts[0], gp = g.player;
            assert('a ghost is white, named Ghost, in the ghost hat', g.client.colorIdx === 0 && g.client.nickname === 'Ghost' && g.client.loadout[ItemType.Hat]?.id === 50244, `${g.client.colorIdx} ${g.client.nickname} ${g.client.loadout[ItemType.Hat]?.id}`);
            assert('...has noclip, bites for ghostBite and moves at ghostSpeed', gp.modifiers.noclip === 1 && gp.modifiers.contactDamage === 8 && Math.abs(gp.modifiers.speedModifier - 0.5) < 1e-9 && Math.abs(gp.modifiers.resistanceModifier - 0.7) < 1e-9, JSON.stringify(gp.modifiers));
            assert('...and the zombies do not', normal.every((b) => !b.player.modifiers.noclip && b.player.modifiers.contactDamage === 15));

            //everything else out of the way: just this ghost and one human, with solid ground between them
            for (const b of bots()) if (b !== g) { mute(); b.player.removeFromPlay(); clearTimeout(b.zombieTimer); unmute(); };
            mute(); H2.removeFromPlay(); H2.playing = false; unmute();
            H1.team = 1; H1.playing = true; H1.hp = 100;

            const solidBetween = (a, b) => { for (let s = 0.1; s < 0.9; s += 0.02) if (gp.collidesWithMap({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: a.z + (b.z - a.z) * s })) return true; return false; };
            const from = { x: gp.x, y: gp.y, z: gp.z };
            let to = null;
            mute();
            search: for (const dy of [0, 2, -1]) for (let radius = 4; radius <= 9; radius++) for (let a = 0; a < 16; a++) {
                const cand = { x: from.x + Math.cos(a * Math.PI / 8) * radius, y: from.y + dy, z: from.z + Math.sin(a * Math.PI / 8) * radius };
                if (cand.x < 1 || cand.z < 1 || cand.x > room.map.width - 1 || cand.z > room.map.depth - 1 || cand.y < 0) continue;
                if (gp.collidesWithMap(cand) || !solidBetween(from, cand)) continue;
                to = cand; break search;
            };
            unmute();
            if (!to) say('  (no free spot with a wall between it and the ghost found: the chase check is skipped)');
            else {
                H1.x = to.x; H1.y = to.y; H1.z = to.z; H1.predicted = H1;
                const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
                const steps = [], inWall = [];
                let last = { x: gp.x, y: gp.y, z: gp.z }, bitten = null, arrived = null;
                mute();
                for (let t = 0; t < 60 * 60 && bitten === null; t++) {
                    virtual += TickStep;
                    await room.updateLoop(1);
                    H1.predicted = H1; H1.x = to.x; H1.y = to.y; H1.z = to.z;
                    const now = { x: gp.x, y: gp.y, z: gp.z };
                    const step = Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z);
                    if (arrived === null && Math.hypot(now.x - to.x, now.y - to.y, now.z - to.z) > 0.3) steps.push(step);
                    if (gp.collidesWithMap(now)) inWall.push(t);
                    if (arrived === null && Math.hypot(now.x - to.x, now.z - to.z) < 0.8) arrived = t / 60;
                    if (H1.hp < 100) bitten = t / 60;
                    last = now;
                };
                unmute();
                const expected = 0.0315 * 0.5;
                say(`  (a ghost ${distance.toFixed(1)} blocks from a human with a wall between: arrived after ${arrived === null ? 'never' : arrived.toFixed(1) + 's'}, bitten after ${bitten === null ? 'never' : bitten.toFixed(1) + 's'}, ${inWall.length} ticks inside solid blocks on the way)`);
                assert('a ghost goes straight at a human at a constant speed in all three axes', steps.length > 20 && steps.every((s) => Math.abs(s - expected) < expected * 0.1), `${Math.min(...steps).toFixed(4)} to ${Math.max(...steps).toFixed(4)}, expected ${expected.toFixed(4)}`);
                assert('...through the wall', inWall.length > 0 && bitten !== null, `${inWall.length} ticks in solid, bitten ${bitten}`);
                assert('...and takes ghostBite off them, not a zombie\'s bite', H1.hp === 92, `${H1.hp}`);
            };
        };

        say(`\n${passed} passed, ${failed} failed`);
        parentPort.postMessage({ __test: true, line: '', done: true, failed });
    })().catch((e) => { say('test crashed: ' + (e?.stack || e)); parentPort.postMessage({ __test: true, line: '', done: true, failed: 1 }); });
}
