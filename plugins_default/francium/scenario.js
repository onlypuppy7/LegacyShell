export const FranciumScenario = {
    version: 'castle-1',
    seconds: 45,
    rate: 60,
    seed: 17011337,
    cameraKeys: [
        [0, 29, 17, 24, 11, 2, 7], [7, 20, 8, 13, 12, 2, 9], [15, 14, 4.8, 9, 7, 2, 7],
        [23, 6, 5.5, 7, 13, 2, 8], [31, 9, 8, 16, 12, 2, 8], [38, 23, 11, 8, 11, 2, 7], [45, 29, 17, 24, 11, 2, 7]
    ],

    cameraAt(seconds) {
        const keys = this.cameraKeys;
        let index = 0;
        while (index < keys.length - 2 && seconds > keys[index + 1][0]) index++;
        const a = keys[index], b = keys[index + 1], t = Math.max(0, Math.min(1, (seconds - a[0]) / (b[0] - a[0])));
        const smooth = t * t * (3 - 2 * t);
        return a.slice(1).map((value, axis) => value + (b[axis + 1] - value) * smooth);
    },

    tracks(definition) {
        const spawns = Object.entries(definition.data).filter(([name]) => name.startsWith('SPECIAL.spawn')).flatMap(([, cells]) => Object.values(cells));
        const unique = [...new Map(spawns.map(cell => [cell.x + ':' + cell.y + ':' + cell.z, cell])).values()];
        unique.sort((a, b) => ((a.x - 11) ** 2 + (a.z - 7) ** 2) - ((b.x - 11) ** 2 + (b.z - 7) ** 2) || a.x - b.x || a.y - b.y || a.z - b.z);
        if (unique.length < 6) throw Error('Castle needs at least six spawn positions.');
        return unique.slice(0, 6).map(cell => {
            const neighbours = unique.filter(other => other.y === cell.y && Math.abs(other.x - cell.x) + Math.abs(other.z - cell.z) === 1);
            const other = neighbours[0] || cell;
            return [[cell.x + .5, cell.y - .32, cell.z + .5], [other.x + .5, other.y - .32, other.z + .5]];
        });
    },

    pose(track, index, tick) {
        const phase = (tick + index * 37) % 240, t = phase < 120 ? phase / 120 : (240 - phase) / 120;
        const position = track[0].map((value, axis) => value + (track[1][axis] - value) * t);
        if (track[0].every((value, axis) => value === track[1][axis])) position[0] += .16 * Math.sin((tick + index * 37) * Math.PI / 120);
        const jump = (tick + index * 23) % 300;
        if (jump < 36) position[1] += .65 * Math.sin(jump / 36 * Math.PI);
        return { position, yaw: Math.atan2(11 - position[0], 7 - position[2]), pitch: .02, bobble: tick * .12, jumping: jump < 36 };
    },

    events(tick) {
        const events = [];
        for (let actor = 0; actor < 6; actor++) {
            if ((tick + actor * 7) % (actor === 4 ? 120 : 30) === 0) events.push({ kind: 'fire', actor });
            if ((tick + actor * 31) % 420 === 300) events.push({ kind: 'reload', actor });
            if ((tick + actor * 47) % 600 === 360) events.push({ kind: 'grenade', actor });
            if ((tick + actor * 71) % 900 === 600) events.push({ kind: 'death', actor });
            if ((tick + actor * 71) % 900 === 660) events.push({ kind: 'respawn', actor });
        };
        return events;
    },

    random(seed, run) {
        const original = Math.random, previousSeed = Math.seed;
        let state = seed >>> 0;
        Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
        Math.seed = seed;
        try { return run(); } finally { Math.random = original; Math.seed = previousSeed; };
    },

    create(definition) {
        const tracks = this.tracks(definition), actors = [];
        //the bundled RocketActor reads bullet.player when firing
        for (const rocket of munitionsManager.rocketPool.objects) if (rocket.actor && !rocket.actor.bullet) rocket.actor.bullet = rocket;
        for (let index = 0; index < 7; index++) {
            const classIdx = index === 0 ? 0 : (index - 1) % 5;
            const items = catalog.forClass[classIdx];
            const primary = [...items.primaryWeapons].sort((a, b) => a.id - b.id)[0];
            const secondary = [...items.secondaryWeapons].sort((a, b) => a.id - b.id)[0];
            if (!primary || !secondary) throw Error('The benchmark weapon loadout is unavailable.');
            const position = index === 0 ? [11, 10, 7] : tracks[index - 1][0];
            addPlayer({ id: index, uniqueId: 0, name: index ? 'Benchmark ' + index : 'Camera', username: '', classIdx, team: 0,
                primaryWeaponItem: primary, secondaryWeaponItem: secondary, shellColor: index % shellColors.length,
                hatItem: null, stampItem: null, score: 0, kills: 0, deaths: 0, streak: 0, totalKills: 0, totalDeaths: 0,
                bestGameStreak: 0, bestOverallStreak: 0, x: position[0], y: position[1], z: position[2], dx: 0, dy: 0, dz: 0,
                frame: 0, pitch: 0, yaw: 0, shield: 0, hp: index ? 100 : 0, playing: index !== 0, weaponIdx: 0,
                controlKeys: 0, randomSeed: this.seed + index, upgradeProductId: 0 });
            if (index) { const player = players_by_id[index]; player.actor.restoreToPlay(); actors.push(player); };
        };
        return { actors, tracks, tick: 0, counts: { fire: 0, reload: 0, grenade: 0, death: 0, respawn: 0 } };
    },

    step(state) {
        const tick = state.tick;
        this.random(this.seed + tick, () => {
            state.actors.forEach((player, index) => {
                const pose = this.pose(state.tracks[index], index, tick);
                [player.x, player.y, player.z] = pose.position;
                player.yaw = pose.yaw; player.pitch = pose.pitch; player.bobble = pose.bobble; player.jumping = pose.jumping;
                player.actor.mesh.position.set(...pose.position);
                player.actor.mesh.rotation.y = player.yaw; player.actor.head.rotation.x = player.pitch;
            });
            for (const event of this.events(tick)) {
                const player = state.actors[event.actor];
                if (event.kind === 'respawn') { player.hp = 100; player.playing = true; player.actor.restoreToPlay(); }
                else if (!player.playing) continue;
                else if (event.kind === 'death') { shellFragBurst(player, 80, .2, 40); yolkBurst(player); player.hp = 0; player.playing = false; player.actor.removeFromPlay(); }
                else if (event.kind === 'reload') player.weapon.actor.reload();
                else if (event.kind === 'grenade') {
                    player.actor.throwGrenade();
                    munitionsManager.throwGrenade(player, new BABYLON.Vector3(player.x, player.y + .5, player.z),
                        new BABYLON.Vector3(Math.sin(player.yaw) * .1, .14, Math.cos(player.yaw) * .1));
                } else if (event.kind === 'fire') {
                    player.weapon.actor.fire();
                    const origin = new BABYLON.Vector3(player.x, player.y + .4, player.z);
                    const direction = new BABYLON.Vector3(Math.sin(player.yaw), -.02, Math.cos(player.yaw)).scale(player.weapon.subClass.range);
                    const weapon = player.weapon.subClass;
                    if (weapon === RPEGG) Rocket.fire(player, origin, direction, weapon);
                    else if (weapon === DozenGauge) for (let pellet = 0; pellet < 5; pellet++) {
                        Bullet.fire(player, origin, direction.add(new BABYLON.Vector3((Math.random() - .5) * 2, (Math.random() - .5) * 2, (Math.random() - .5) * 2)), weapon);
                    } else Bullet.fire(player, origin, direction, weapon);
                };
                state.counts[event.kind]++;
            };
            munitionsManager.update(1);
            itemManager.update(1);
            for (const manager of [explosionSmokeManager, explosionFireManager, shellFragManager, yolkManager]) updateParticles(manager, 1);
        });
        state.tick++;
    },

    render(state, delta) {
        for (const player of state.actors) if (player.playing) {
            player.actor.handsToWeaponSkeleton(); player.actor.update(delta); player.weapon.update(delta);
        };
    },

    camera(seconds) {
        const pose = this.cameraAt(seconds);
        camera.position.set(...pose.slice(0, 3)); camera.setTarget(new BABYLON.Vector3(...pose.slice(3)));
        shadowLight.position.set(pose[0], pose[1] + 2, pose[2]);
    },
};
