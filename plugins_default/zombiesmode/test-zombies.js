// Headless test of the zombies gamemode: boots a real room (real map, physics and bots) with this plugin's listeners
// registered the way the loader would (without the loader's git pull), adds stand-in humans, and drives the room on a virtual
// clock. Covers infection, sudden death, the win conditions, eggs, the round restart and whether zombies actually reach and
// bite someone.
//
// Run with: node plugins_default/zombiesmode/test-zombies.js [map name] [seed]     (takes a minute or so)

import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

if (isMainThread) {
    const worker = new Worker(fileURLToPath(import.meta.url), { workerData: { args: process.argv.slice(2) }, stdout: false, stderr: false });
    worker.on('message', (msg) => { if (msg?.__test) { console.log(msg.line); if (msg.done) process.exit(msg.failed ? 1 : 0); } }); //the room posts its own messages on this port too
    worker.on('error', (e) => { console.error('test worker error:', e); process.exit(1); });
    worker.on('exit', (code) => process.exit(code));
} else {
    if (workerData.args[1] !== undefined) {
        let seed = +workerData.args[1] >>> 0;
        Math.random = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    };
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
        const { GameType, GameTypes } = await import('#gametypes');
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
            const ammo = items.AllItems[items.ItemTypes.AMMO], grenade = items.AllItems[items.ItemTypes.GRENADE];
            for (const p of [z0, H1]) { p.weapons[0].ammo.store = 0; p.grenadeCount = 0; };
            const got = { ammoZ: ammo.collect(z0, 0), ammoH: ammo.collect(H1, 0), grenadeZ: grenade.collect(z0, 0), grenadeH: grenade.collect(H1, 0) };
            assert('...nor ammo or grenades, which humans can', got.ammoZ === false && got.grenadeZ === false && got.ammoH === true && got.grenadeH === true, JSON.stringify(got));
            assert('...and their stock does not change', z0.weapons[0].ammo.store === 0 && z0.grenadeCount === 0);
            H1.grenadeCount = 0; H1.weapons[0].ammo.store = 0;
        };
        assert('zombies are on team 2', zs.every((p) => p.team === 2), zs.map((p) => p.team).join());
        const baseSpeeds = zs.map((p) => p.modifiers.speedModifier);
        assert('zombies are all exactly the zombie speed', baseSpeeds.every((v) => Math.abs(v - room.gameOptions.plugins.zombies.zombieSpeed) < 1e-9), baseSpeeds.join());
        assert('humans are a little faster than normal', Math.abs(H2.modifiers.speedModifier - 1.1) < 1e-9, `${H2.modifiers.speedModifier}`);
        assert('zombies are slow and have about 70 hp', zs.every((p) => Math.abs(p.modifiers.resistanceModifier - 0.7) < 1e-9 && p.modifiers.speedModifier < 0.9), JSON.stringify(zs[0].modifiers));
        assert('zombies bite', zs.every((p) => p.modifiers.contactDamage === 12));
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
        const eggPackets = []; //what the egg counter on screen is told: [eggs for this kill, eggs this round]
        const sendToMe = h1.sendToMe.bind(h1);
        h1.sendToMe = (output, debug) => {
            if (debug === 'zombiesEggs') { const input = new Comm.In(output.buffer); eggPackets.push([input.unPackInt8U() === Comm.Code.zombiesEggs, input.unPackInt8U(), input.unPackInt16U()]); };
            return sendToMe(output, debug);
        };
        mute(); H1.kills = 0;
        H1.scoreKill(zs[0]); H1.scoreKill(zs[0]);
        await sleep(50); unmute();
        assert('killing zombies pays killEggs each, not the usual reward', eggs.Human1 === 4, JSON.stringify(eggs));
        assert('...and the killer is told each one, with their total for the round', JSON.stringify(eggPackets) === JSON.stringify([[true, 2, 2], [true, 2, 4]]), JSON.stringify(eggPackets));
        mute(); for (let i = 0; i < 100; i++) H1.scoreKill(zs[0]); await sleep(50); unmute();
        assert('kill eggs are capped per round', eggs.Human1 === 100, JSON.stringify(eggs));
        assert('...and what the counter is told stops at the cap too, 2 a kill', eggPackets.length === 50 && eggPackets.every((p, i) => p[1] === 2 && p[2] === (i + 1) * 2), `${eggPackets.length} packets, last ${JSON.stringify(eggPackets.at(-1))}`);
        h1.sendToMe = sendToMe;
        mute(); H1.scoreKill(H2); await sleep(50); unmute();
        assert('killing a human pays nothing', eggs.Human1 === 100);

        // ---- infection and sudden death ----
        const killByZombie = async (victim) => { mute(); victim.hit(1000, zs[0], 1, 0, undefined, 1000); await sleep(20); unmute(); };
        await spawn(h1); await spawn(h2);
        await meta();
        await see(H1, H2); await meta();
        const cues = []; //the sounds the browsers are told to play
        const sendCue = h1.sendToMe.bind(h1);
        h1.sendToMe = (output, debug) => { if (debug === 'zombiesSound') { const input = new Comm.In(output.buffer); cues.push([input.unPackInt8U() === Comm.Code.zombiesSound, input.unPackInt8U()]); }; return sendCue(output, debug); };
        assert('the siren has gone off for the round by the time the horde is out', zombies.getState(room).sirened === true);
        await killByZombie(H1);
        h1.sendToMe = sendCue;
        assert('sudden death sounds its horn to the humans, once', JSON.stringify(cues) === JSON.stringify([[true, 1]]), JSON.stringify(cues));
        assert('a human who dies joins the horde', H1.team === 2, `${H1.team}`);
        assert('...and gets the horde\'s modifiers: bites, no gun, about 60 hp', H1.modifiers.contactDamage === 12 && H1.modifiers.damageModifier === 0 && Math.abs(H1.modifiers.resistanceModifier - 0.6) < 1e-9, JSON.stringify(H1.modifiers));
        assert('...and is announced', notes.some((n) => n.includes('Human1') && n.includes('infected')), notes.join(' | '));
        assert('the last human left starts sudden death', room.gameOptions.plugins.time?.preset === 'night', JSON.stringify(room.gameOptions.plugins.time));
        assert('...in a downpour with lightning every second or two', room.gameOptions.plugins.weather?.storm?.lightning >= 3 && room.gameOptions.plugins.weather?.storm?.intensity === 1 && room.gameOptions.plugins.weather?.rain >= 0.8, JSON.stringify(room.gameOptions.plugins.weather));
        assert('...and the horde is faster', zs.every((p) => Math.abs(p.modifiers.speedModifier - 1.15) < 1e-6), zs.map((p) => p.modifiers.speedModifier).join());
        assert('...which includes the infected human', Math.abs(H1.modifiers.speedModifier - 1.15) < 1e-6, `${H1.modifiers.speedModifier}`);
        assert('...with no pop-up for it (the red text under the clock is how it is said)', !notes.some((n) => n.includes('SUDDEN DEATH')), notes.join(' | '));
        assert('...the human left is quicker (1.1 to 1.3) and reloads faster (1.2 to 1.3)', Math.abs(H2.modifiers.speedModifier - 1.3) < 1e-9 && Math.abs(H2.modifiers.reloadSpeedModifier - 1.3) < 1e-9, JSON.stringify(H2.modifiers));
        assert('...and the browsers are told', room.gameOptions.plugins.zombiesSuddenDeath === true);

        // ---- an exploding ghost ----
        {
            const z = zombies.getState(room), cfg = room.gameOptions.plugins.zombies, inst = zombies.pluginInstance;
            mute(); const bomber = await inst.spawnGhost(room, z, cfg, true); bomber.player.nextRespawn = 0; await bomber.respawn(); unmute();
            const b = bomber.player, extra = {};
            inst.packModifiers({ this: { player: b }, extra });
            assert('an exploding ghost is a ghost the browsers are told about: its tick, no fuse yet, and the quick grenade timer', b.zBomber && b.modifiers.noclip && extra.zombieBomber === zombies.bombIdleOf(z, cfg) && extra.zombieFuse === 0 && extra.grenadeTimerModifier === 0.01, JSON.stringify(extra));
            assert('...a gun-less one with the damage a blast should do (100 of the grenade 130)', Math.abs(b.modifiers.damageModifier - 100 / 130) < 1e-9);
            const put = (x, z2) => { b.x = H2.x + x; b.y = H2.y; b.z = H2.z + z2; };
            put(20, 0); inst.ghostThink(room, b);
            assert('it keeps ticking only, with the fuse unlit, while nobody is near', !b.zFuseAt && b.modifiers.zombieFuse === 0);
            const pace = b.modifiers.speedModifier;
            put(2.2, 0); inst.ghostThink(room, b);
            assert('it does not light its fuse from just outside its range (1.875 blocks)', !b.zFuseAt && b.modifiers.speedModifier === pace);
            put(1.5, 0); inst.ghostThink(room, b);
            assert('it lights its fuse when someone is within 1.875 blocks, and the browsers are told how long', b.zFuseAt > 0 && b.modifiers.zombieFuse === zombies.bombFuseOf(z, cfg), JSON.stringify(b.modifiers.zombieFuse));
            assert('...and it dashes: 1.3x as quick while the fuse burns', Math.abs(b.modifiers.speedModifier - pace * 1.3) < 1e-9, `${pace} -> ${b.modifiers.speedModifier}`);
            H2.shield = 0; const hp = H2.hp; mute(); inst.ghostThink(room, b); for (let i = 0; i < 4; i++) room.munitionsManager.update(1); unmute();
            assert('...and nothing goes off before the fuse is out', H2.hp === hp && !b.isDead(), `${H2.hp}`);
            inst.defuse(b);
            assert('...and back to its pace if the fuse is put out', Math.abs(b.modifiers.speedModifier - pace) < 1e-9 && !b.zRush, `${b.modifiers.speedModifier}`);
            clearTimeout(bomber.zombieTimer); z.bots = z.bots.filter((x) => x !== bomber); bomber.remove();
            //the blast itself, from beside the human on whichever side has open air (the map has walls, which stop it, as they should)
            let hurt = false, last = null, zHp = 0;
            for (const [ox, oz] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) {
                mute(); const bomb = await inst.spawnGhost(room, z, cfg, true); bomb.player.nextRespawn = 0; await bomb.respawn(); unmute();
                last = bomb; const p = bomb.player;
                p.x = H2.x + ox; p.y = H2.y; p.z = H2.z + oz; H2.shield = 0; H2.hp = 100; zHp = zs[0].hp;
                zs[0].x = p.x - 0.5; zs[0].y = p.y; zs[0].z = p.z;
                p.zFuseAt = Date.now() - 1; mute(); inst.ghostThink(room, p); for (let i = 0; i < 4; i++) room.munitionsManager.update(1); await sleep(200); unmute();
                hurt = H2.hp < 100;
                if (hurt) break;
                clearTimeout(bomb.zombieTimer); z.bots = z.bots.filter((x) => x !== bomb); bomb.remove();
            };
            assert('when it is out it goes off: the human is hurt', hurt, `${H2.hp}`);
            assert('...the ghost is out of play after it (not dead, so no death animation), with its fuse put out', !last.player.playing && !last.player.isDead() && !last.player.zFuseAt && last.player.modifiers.zombieFuse === 0);
            assert('...and a zombie standing right next to it is not hurt by it', zs[0].hp === zHp, `${zHp} -> ${zs[0].hp}`);
            clearTimeout(last.zombieTimer); z.bots = z.bots.filter((x) => x !== last); last.remove();
        };

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
        {
            const params = room.gameOptions.plugins;
            assert('...and the horde winning is told too, with a card for each of them: bitten, no survival bonus', params.zombiesWinner === 2 && params.zombiesResults?.[H1.id]?.[0] === 2 && params.zombiesResults?.[H2.id]?.[0] === 2 && params.zombiesResults[H2.id][2] === 0, JSON.stringify([params.zombiesWinner, params.zombiesResults]));
            assert('...the one who killed zombies has the eggs on theirs, a guest (no session) is marked as one', params.zombiesResults[H1.id][1] === 100 && params.zombiesResults[H1.id][4] === 2, JSON.stringify(params.zombiesResults));
            assert('...and a streak of nothing, counting from the first round', params.zombiesStreak === 0 && params.zombiesRound >= 1 && params.zombiesNextIn > 0, JSON.stringify([params.zombiesStreak, params.zombiesRound, params.zombiesNextIn]));
        };

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
        h1.userData = { ...h1.userData, upgradeMultiplier: 2, upgradeExpiryDate: Math.floor(Date.now() / 1e3) + 3600 }; //Human1 has VIP, Human2 does not (the card says how much the services will multiply it by)
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
        mute(); room.packUpdateRoomParams(new Comm.Out()); unmute();
        {
            const params = room.gameOptions.plugins;
            assert('...Human2, with no VIP, has a multiplier of 1', params.zombiesResults?.[H2.id]?.[5] === 1, JSON.stringify(params.zombiesResults?.[H2.id]));
            assert('after the humans win the survivors have cards: survived, the win bonus, no streak bonus on the first, and the VIP multiplier', params.zombiesWinner === 1 && JSON.stringify(params.zombiesResults?.[H1.id]) === JSON.stringify([1, 0, 20, 0, 2, 2]), JSON.stringify([params.zombiesWinner, params.zombiesResults]));
            assert('...and the win starts a streak', params.zombiesStreak === 1, `${params.zombiesStreak}`);
            assert('...the next round is worth more (20 + 10)', zombies.winBonus(zombies.getState(room), room.gameOptions.plugins.zombies) === 30);
        };
        say(`  (after the humans win: zombiesInterim ${room.gameOptions.plugins.zombiesInterim}, round end ${room.roundEndTime - Date.now()}ms, restart in ${room.roundRestartTime - Date.now()}ms)`);
        assert('after the humans win the room params also say it is the gap', room.gameOptions.plugins.zombiesInterim === true, JSON.stringify(room.gameOptions.plugins.zombiesInterim));

        // ---- leaving through the menu ----
        mute(); notes.length = 0; clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
        await sleep(150); await see(H1, H2); await meta(); await see(H1, H2);
        assert("the next round gives the horde its bite back after the victory", zs.every((p) => p.modifiers.contactDamage === 12), zs.map((p) => p.modifiers.contactDamage).join());
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
                assert('zombies go to the closest point they can reach to a human they cannot', best < 8, best.toFixed(2));
            };
        };

        // ---- out of route: wander ----
        {
            const z = zombies.pluginInstance, b = bots().find((x) => x.player.playing), p = b.player;
            const cmd = { engaged: false, state: 'hunt', moveTo: { x: p.x + 20, y: p.y, z: p.z } };
            p.dx = p.dz = 0.01; b.zIdle = 119; b.zWander = 0; b.stopPath();
            b.zProgress = { x: p.x, y: p.y, z: p.z };
            z.zombieDrive(b, cmd);
            const far = b.zWanderTo && Math.hypot(b.zWanderTo.x - p.x, b.zWanderTo.z - p.z);
            assert('a zombie standing still on the way to someone starts wandering to a random spot 3 to 8 blocks off', b.zWander > 0 && far >= 3 - 1e-9 && far <= 8 + 1e-9, `${b.zWander} ${far}`);
            const next = { engaged: false, state: 'search', moveTo: null };
            z.zombieThink(b, next);
            assert('...and goes there, instead of towards them', next.moveTo === b.zWanderTo && next.state === 'hunt');
            b.zWander = 0;
            b.zIdle = 119; b.zPath = 0;
            b.combat.target = { x: p.x + 1.8, y: p.y, z: p.z };
            z.zombieDrive(b, { engaged: true });
            assert('pushing against an obstacle near someone still hands over to a route', b.zPath === 150);
            b.combat.target = null;
            b.zIdle = 119;
            const route = b.currentPath = [{ x: p.x + 3, y: p.y, z: p.z, type: 'jump' }];
            z.zombieDrive(b, cmd);
            assert('a pause during a route leaves its own jump and stuck recovery in charge', b.zWander === 0 && b.currentPath === route);
            b.stopPath();
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
            //The static estimates can reach perches the real body cannot. Check the zombie's physics and the actual landing point.
            const probe = bots()[0].player, saved = { x: probe.x, y: probe.y, z: probe.z };
            let ledge;
            try {
                Object.assign(probe, from);
                ledge = standable.filter((c) => c.y >= start.y + 2 && c.y <= start.y + 3).slice(0, 150).find((c) => {
                    const goal = { x: c.x + 0.5, y: c.y, z: c.z + 0.5 };
                    if (!deadinternet.findPath(room, from, goal)) return false;
                    const end = deadinternet.findPath(room, probe, goal)?.at(-1);
                    return end && Math.hypot(end.x - goal.x, end.y - goal.y, end.z - goal.z) < 0.3;
                });
            } finally { Object.assign(probe, saved); }
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

            //the top of a stairwell: a floor with a two wide opening in it and the stairs a block and two below, the human on the other side. A
            //zombie that has just climbed out must not walk at them across the opening (a couple of blocks is not a drop to the bots' own guard)
            const solid = () => ({ idx: 1, mesh: { colliderType: 'full' }, rx: 0, ry: 0, rz: 0 });
            const data = Array.from({ length: 40 }, () => Array.from({ length: 10 }, () => new Array(40).fill(null)));
            for (let x = 0; x < 40; x++) for (let z = 0; z < 40; z++) data[x][3][z] = solid();
            data[20][3][10] = data[21][3][10] = null;
            data[20][2][10] = solid(); data[21][1][10] = solid();
            const stairwell = (x) => {
                const fake = { player: { x, y: 4, z: 10.5 }, room: { map: { width: 40, height: 10, depth: 40, data } }, combat: { target: null }, zPath: 0 };
                const cmd = { engaged: true, fire: true, state: 'engage', controls: 1 };
                fake.combat.target = { x: 24.5, y: 4, z: 10.5 };
                zombies.pluginInstance.zombieThink(fake, cmd);
                return cmd;
            };
            assert('a zombie sees the stairwell in its way before it reaches the edge and goes by route', stairwell(15.5).engaged === false);
            const atOpening = stairwell(19.6);
            assert('...but at the edge of the opening it goes by route instead of falling down it', atOpening.engaged === false && atOpening.state === 'hunt', JSON.stringify(atOpening));
        };

        // ---- ghosts ----
        {
            const cfgNow = room.gameOptions.plugins.zombies;
            cfgNow.ghostRatio = 0.5; cfgNow.count = 6; //the two new ones will be ghosts
            cfgNow.streakGhostSpeed = 0; cfgNow.streakBrutishRatio = 0; //(the streak the round before left has its own section below)
            mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
            await sleep(100);
            mute(); await plugins.emit('metaLoop', { this: room }); unmute();
            for (let i = 0; i < 400 && !(bots().filter((b) => b.zGhost && b.onDeath).length >= 2); i++) await sleep(50);
            const ghosts = bots().filter((b) => b.zGhost);
            const normal = bots().filter((b) => !b.zGhost);
            assert('the horde has ghosts among it, spread by the ratio', ghosts.length === 2 && normal.length === 4, `${ghosts.length} ghosts, ${normal.length} others`);
            const g = ghosts.find((b) => !b.zBomber) || ghosts[0], gp = g.player; //(a plain one if there is one: an exploding one dashes once its fuse is lit)
            assert('a ghost is white, named Ghost, in the ghost hat', g.client.colorIdx === 0 && /^(Ghost|Bomber Ghost)$/.test(g.client.nickname) && g.client.loadout[ItemType.Hat]?.id === 50244, `${g.client.colorIdx} ${g.client.nickname} ${g.client.loadout[ItemType.Hat]?.id}`);
            assert('...has noclip, bites for ghostBite and moves at ghostSpeed', gp.modifiers.noclip === 1 && gp.modifiers.contactDamage === 6 && Math.abs(gp.modifiers.speedModifier - 0.5) < 1e-9 && Math.abs(gp.modifiers.resistanceModifier - 0.7) < 1e-9, JSON.stringify(gp.modifiers));
            assert('...and the zombies do not', normal.every((b) => !b.player.modifiers.noclip && b.player.modifiers.contactDamage === 12));

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
                assert('...and takes ghostBite off them, not a zombie\'s bite', H1.hp === 94, `${H1.hp}`);
            };
        };

        // ---- never spawned in ----
        {
            mute(); clearTimeout(room.roundTimeout); room.setRoundTimeout(); unmute();
            await sleep(150);
            mute(); H2.removeFromPlay(); H2.playing = false; H2.zombieSeen = null; H2.zWaitKey = null; if (H2.team !== 1) H2.switchTeam(1); unmute();
            await meta();
            virtual += 14000; await meta();
            assert('a human who has not spawned in is left alone for a while', H2.team === 1, `${H2.team}`);
            virtual += 2000; await meta();
            assert('...and infected after 15 seconds', H2.team === 2, `${H2.team}`);
            assert('...and it says so', notes.some((n) => n.includes('Human2') && n.includes('never spawned in')), notes.join(' | '));

            const endBefore = room.roundEndTime;
            await meta();
            assert('...the round carries on while a human who did spawn is still in it', room.roundEndTime === endBefore);
            mute(); H1.switchTeam(2); unmute(); //the last human is infected as well
            await meta();
            await sleep(1700);
            assert('...and with nobody left to play it the round ends', room.roundEndTime !== endBefore && room.roundEndTime <= Date.now(), `${room.roundEndTime - endBefore}`);
            assert('...as a win for the horde', notes.some((n) => n.includes('horde wins')), notes.join(' | '));

            const PlayerClass = H1.constructor, shooter = (team) => ({ team, gameOptions: room.gameOptions }); //(a player that would throw if the real trigger code ran)
            let threw = {};
            for (const team of [2, 1]) for (const method of ['fire', 'pullTrigger']) { try { PlayerClass.prototype[method].call(shooter(team)); } catch { threw[team + method] = true; } }
            assert('the infected cannot fire or pull the trigger (the original code never runs)', !threw['2fire'] && !threw['2pullTrigger'], JSON.stringify(threw));
            assert('...and everyone else still can', threw['1fire'] && threw['1pullTrigger'], JSON.stringify(threw));
        };

        // ---- the win streak ----
        {
            const cfg = { ...room.gameOptions.plugins.zombies, count: 20, ghostSpeed: 0.5, streakGhostSpeed: 0.04, ghostSpeedMax: 0.9, brutishRatio: 0.1, streakBrutishRatio: 0.07, brutishRatioMax: 0.45, brutishPhysics: 0.7, streakBrutishPhysics: 0.1, brutishPhysicsMax: 1, winEggs: 20, streakWinEggs: 10, streakCap: 10 };
            const at = (streak) => ({ streak });
            const list = (fn, ...streaks) => streaks.map((n) => +fn(at(n), cfg).toFixed(3)).join();
            assert('the win bonus is 20 with no streak, 30 with one, and 120 at the cap (which is where it stops)', list(zombies.winBonus, 0, 1, 10, 50) === '20,30,120,120', list(zombies.winBonus, 0, 1, 10, 50));
            assert('...so a round pays at most the kill cap of 200 plus 120', cfg.eggCap * cfg.killEggs + zombies.winBonus(at(10), cfg) === 320);
            assert('the brutish share goes 10%, 17%, ... up to 45%', list(zombies.brutishRatioOf, 0, 1, 3, 10) === '0.1,0.17,0.31,0.45', list(zombies.brutishRatioOf, 0, 1, 3, 10));
            assert('...and they speed up to the pace of the plain zombies, 0.7 to 1', list(zombies.brutishPhysicsOf, 0, 1, 3, 10) === '0.7,0.8,1,1', list(zombies.brutishPhysicsOf, 0, 1, 3, 10));
            assert('ghosts speed up 0.04 a round, to 0.9', list(zombies.ghostSpeedOf, 0, 1, 5, 10, 50) === '0.5,0.54,0.7,0.9,0.9', list(zombies.ghostSpeedOf, 0, 1, 5, 10, 50));

            const bot = (extra = {}) => ({ player: { mods: [], changeModifiers(m) { this.mods.push(m); } }, removed: false, remove() { this.removed = true; }, ...extra });
            const horde = () => [...Array(3)].map(() => bot({ zGhost: true })).concat([...Array(2)].map(() => bot({ zVariant: 'brutish' })), [...Array(3)].map(() => bot({ zVariant: 'small' })), [...Array(12)].map(() => bot()));
            const zs3 = { streak: 3, bots: horde() };
            const before = [...zs3.bots];
            zombies.pluginInstance.applyStreak(room, zs3, { ...cfg, bombStreak: 99 }); //(the exploding ghosts have their own checks below)
            const gone = before.filter((b) => b.removed);
            assert('a round with a streak of 3 takes 4 plain zombies out, for brutish ones to come in their place (6 of 20)', gone.length === 4 && gone.every((b) => !b.zGhost && !b.zVariant) && zs3.bots.length === 16, `${gone.length} ${zs3.bots.length}`);
            assert('...gives the ghosts there already their new pace and the brutes theirs', before.filter((b) => b.zGhost).every((b) => Math.abs(b.player.mods[0].speedModifier - 0.62) < 1e-9) && before.filter((b) => b.zVariant === 'brutish').every((b) => b.player.mods[0].physicsSpeedModifier === 1));
            assert('...and leaves the small ones alone', before.filter((b) => b.zVariant === 'small').every((b) => !b.removed && !b.player.mods.length));

            const ended = { streak: 0, bots: [...Array(6)].map(() => bot({ zVariant: 'brutish' })).concat([...Array(14)].map(() => bot())) };
            zombies.pluginInstance.applyStreak(room, ended, cfg);
            assert('a streak that has ended sends the extra brutes back (6 down to the usual 2)', ended.bots.filter((b) => b.zVariant === 'brutish').length === 2 && ended.bots.length === 16, `${ended.bots.length}`);

            assert('exploding ghosts: none in round 1, one from round 2, two from round 4, never more', [0, 1, 2, 3, 5, 9].map((n) => zombies.bombersOf(at(n), cfg)).join() === '0,1,1,2,2,2', [0, 1, 2, 3, 5, 9].map((n) => zombies.bombersOf(at(n), cfg)).join());
            assert('...with a fuse that goes 3s to 1.8s and a tick that goes 1.2s to 0.7s by round 10', list(zombies.bombFuseOf, 1, 9, 30) === '3000,1800,1800' && list(zombies.bombIdleOf, 1, 9, 30) === '1200,700,700', list(zombies.bombFuseOf, 1, 9, 30) + ' ' + list(zombies.bombIdleOf, 1, 9, 30));
            const zb = { streak: 1, bots: horde() }, ghostsBefore = zb.bots.filter((b) => b.zGhost);
            zombies.pluginInstance.applyStreak(room, zb, { ...cfg, streakBrutishRatio: 0 });
            assert('round 2 takes a plain ghost out for the exploding one to come in its place', ghostsBefore.filter((b) => b.removed).length === 1 && zb.bots.filter((b) => b.zGhost).length === 2, `${ghostsBefore.filter((b) => b.removed).length}`);
            const zc = { streak: 0, bots: [bot({ zGhost: true, zBomber: true }), bot({ zGhost: true })] };
            zombies.pluginInstance.applyStreak(room, zc, cfg);
            assert('...and a streak that has ended turns it back into a plain one', zc.bots.length === 1 && !zc.bots[0].zBomber);
            const zd = { streak: 4, bots: [bot({ zGhost: true, zBomber: true }), bot({ zGhost: true })] };
            zombies.pluginInstance.applyStreak(room, zd, cfg);
            assert('a bomber in the horde gets the speed of the ghosts and its own tick for the round', Math.abs(zd.bots[0].player.mods[0].speedModifier - 0.66) < 1e-9 && zd.bots[0].player.mods[0].zombieBomber === zombies.bombIdleOf(zd, cfg), JSON.stringify(zd.bots[0].player.mods));

            const zroom = zombies.getState(room), keep = zroom.streak, ghost = (speedModifier) => ({ room, modifiers: { noclip: 1, speedModifier }, changeModifiers(m) { this.modifiers = { ...this.modifiers, ...m }; } });
            const sd = { ...room.gameOptions.plugins.zombies, ghostSpeed: 0.5, streakGhostSpeed: 0.04, ghostSpeedMax: 0.9 };
            zroom.streak = 0; const slow = ghost(0.5); zombies.pluginInstance.speedUp(slow, sd);
            zroom.streak = 5; const quick = ghost(0.7); zombies.pluginInstance.speedUp(quick, sd);
            zroom.streak = keep;
            assert('in sudden death a ghost keeps its place under the zombies: slower with no streak, as quick as them once it is fast enough', Math.abs(slow.modifiers.speedModifier - 1.15 * 0.5 / sd.zombieSpeed) < 1e-9 && Math.abs(quick.modifiers.speedModifier - 1.15) < 1e-9, `${slow.modifiers.speedModifier} ${quick.modifiers.speedModifier}`);
        };

        // ---- the maps ----
        {
            const insert = (map) => { zombies.pluginInstance.insertMaps({ map }); return map; };
            const castle = insert({ name: 'Castle', modes: { FFA: true, Teams: true, Hiroshima: false } });
            assert('the maps the mode is played on get the Zombies mode, and keep the rest', castle.modes.Zombies === true && castle.modes.FFA === true && castle.modes.Teams === true && castle.modes.Hiroshima === false, JSON.stringify(castle.modes));
            assert('...including one with no modes of its own', JSON.stringify(insert({ name: 'Two Towers' }).modes) === JSON.stringify({ FFA: true, Teams: true, Zombies: true }));
            const other = insert({ name: 'Flat', modes: { FFA: true, Teams: true } });
            assert('other maps are left alone', other.modes.Zombies === undefined && Object.keys(other.modes).length === 2, JSON.stringify(other.modes));
            assert('the gametype draws from that pool', GameType.zombies !== undefined && GameTypes.find((g) => g.codeName === 'zombies').mapPool === 'Zombies');
        };

        say(`\n${passed} passed, ${failed} failed`);
        parentPort.postMessage({ __test: true, line: '', done: true, failed });
    })().catch((e) => { say('test crashed: ' + (e?.stack || e)); parentPort.postMessage({ __test: true, line: '', done: true, failed: 1 }); });
}
