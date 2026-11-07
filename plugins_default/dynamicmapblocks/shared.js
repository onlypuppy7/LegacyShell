//plugin: dynamicmapblocks, engine bridge only
import BABYLON from 'babylonjs';
import { isClient, CONTROL } from '#constants';
import { plugins } from '#plugins';
import { PlatformMap, PlatformWorld, PlatformTeams } from './platforms.js';
import { Bullet, Rocket } from '#bullets';
import { PlatformShapes } from './geometry.js';
import { PlatformTriggers } from './triggers.js';
import { PlatformTeleporters } from './teleporters.js';
import { PlatformProtocol } from './protocol.js';
import { PlatformAssets } from './assets.js';
import { PlatformLighting } from './lighting.js';
import { MapSigns } from './signs.js';
import { SignRender } from './sign-render.js';

export const DynamicMapBlocksPlugin = {
    registerListeners(pluginManager) {
        this.install(pluginManager);
        PlatformProtocol.register(pluginManager);
        pluginManager.on('game:updateBefore', data => this.turnPlayer(data));
        pluginManager.on('game:updateBefore', data => PlatformTeleporters.view(data));
        pluginManager.on('game:onPlayerDeath', data => PlatformTeleporters.reset(data.player));
        if (isClient) pluginManager.on('game:updateBefore', data => { if (data.player.id === meId) data.player.dmbResim = !!data.resim; this.predictTriggers(data); });
        if (!isClient) pluginManager.on('game:roomStateUpdate', data => this.updateTriggers(data.this)); //only the server decides what sets a block off
        pluginManager.on('game:roomBuildMap', data => {
            data.minMap = PlatformMap.prepare(data.minMap);
            data.this.minMap = data.minMap;
        });
        pluginManager.on('game:roomInitEnd', data => this.configure(data.this.Collider, data.this.minMap, data.this.mapMeshes));
        pluginManager.on('game:resetGamePlayer', data => {
            if (data.player?.Collider?.platformWorld) data.player.platformTime = data.player.Collider.platformWorld.now();
            if (data.player) PlatformTeleporters.reset(data.player);
        });
        if (isClient) {
            pluginManager.on('game:inGameSync1', data => { if (data.id === meId && players_by_id[meId]) players_by_id[meId].dmbReplay = data.stateIdx; }); //the core is about to replay from here
            pluginManager.on('game:inGameSync2', data => {
                if (data.id === meId && players_by_id[meId]) players_by_id[meId].dmbReplay = undefined;
                if (data.dist > 1 && data.player?.Collider?.platformWorld?.teleporters?.length) PlatformTeleporters.snap(data.player, data.player.x, data.player.y, data.player.z); //the server sent you through a pad you had not reached: jump, do not glide
            });
            pluginManager.on('game:inGameSync3', data => {
                var mesh = data.player?.actor?.mesh;
                if (mesh && data.player.Collider?.platformWorld?.teleporters?.length && Math.hypot(mesh.position.x - data.player.x, mesh.position.y - data.player.y, mesh.position.z - data.player.z) > 2) PlatformTeleporters.snap(data.player, data.player.x, data.player.y, data.player.z);
            });
            pluginManager.on('game:modifyMinMap', async data => {
                await PlatformAssets.ensure(data.minMap, mapMeshes, gameScene);
                data.minMap = PlatformMap.prepare(data.minMap);
                data.modify = true;
            });
            pluginManager.on('game:permissionsAfterSetup', () => PlatformLighting.registerSettings());
            pluginManager.on('game:debugF3Lines', data => this.debugLines(data));
            pluginManager.on('game:lightmapReady', data => PlatformLighting.capture(data.gameScene, data.lightMap, data.w, data.h, data.d));
            pluginManager.on('game:onMapComplete', () => PlatformLighting.registerSettings());
            pluginManager.on('game:createMapCellsMapLoaded', data => {
                Collider.platformMap = map;
                Collider.platformSources = mapMeshes;
                this.configure(Collider, data.minMap, mapMeshes);
                PlatformRender.create(data.gameScene, Collider.platformWorld, mapMeshes, () =>
                    me?.playing && Number.isFinite(me.platformTime) ? me.platformTime : Collider.platformWorld.now(), {}, { lighting: true, smoothTime: true, material: () => SPS?.mesh?.material });
                TeleporterRender.create(data.gameScene, Collider.platformWorld.teleporters, {}, { active: def => PlatformTeleporters.powered(Collider.platformWorld, PlatformTeleporters.config(def), me?.playing && Number.isFinite(me.platformTime) ? me.platformTime : Collider.platformWorld.now()) });
                SignRender.create(data.gameScene, MapSigns.entries(data.minMap), mapMeshes, {
                    world: Collider.platformWorld, time: () => me?.playing && Number.isFinite(me.platformTime) ? me.platformTime : Collider.platformWorld.now(),
                    active: () => me?.playing && !me.isDead(),
                    camera: () => camera,
                    occluded: (ray, distance) => data.gameScene.pickWithRay(new BABYLON.Ray(ray.origin, ray.direction, distance), mesh => mesh.isVisible && mesh.isEnabled() && mesh.getTotalVertices() > 0, false).hit,
                });
            });
        };
    },
    configure(collider, minMap, sources = []) {
        collider.platformWorld = PlatformTeleporters.attach(new PlatformWorld(PlatformMap.read(minMap).concat(PlatformMap.staticMeshes(minMap)), sources), minMap);
        collider.platformCells = new Map(collider.platformWorld.bodies.filter(body => body.definition.static).map(body => {
            var block = body.definition.blocks[0];
            return [[block.x, block.y, block.z].join(','), body];
        }));
        collider.platformBounds = minMap && { width: minMap.width, height: minMap.height, depth: minMap.depth };
    },
    bulletBounds: { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } },
    grenadeBounds: { min: { x: -.07, y: -.07, z: -.07 }, max: { x: .07, y: .07, z: .07 } }, //core's ray starts .07 below its centre, so this box lands where core's grenades always did
    predictTriggers({ player, resim }) { //the player this client controls, before the server confirms
        if (resim || player.id !== meId || !player.playing) return;
        var world = player.Collider?.platformWorld;
        if (!world?.triggered.length) return;
        var entities = [{ kind: 'players', pos: { x: player.x, y: player.y, z: player.z }, bounds: this.playerBounds(player), team: player.team }];
        iteratePlayers(other => { if (other !== player && other.playing) entities.push({ kind: 'players', pos: { x: other.x, y: other.y, z: other.z }, bounds: this.playerBounds(other), team: other.team }); }); //so it does not stop for you while someone else is still on it
        munitionsManager.grenadePool.forEachActive(grenade => entities.push({ kind: 'items', pos: { x: grenade.x, y: grenade.y, z: grenade.z }, bounds: this.grenadeBounds, team: grenade.player?.team }));
        PlatformTriggers.predict(world, entities, player.platformTime ?? world.now());
    },
    crush(player, body, now = Date.now()) { //caught between a block that crushes and the map: hurt, with no kill credited to anyone
        var damage = body.definition.motion?.crush;
        if (!(damage > 0) || body.definition.motion.pushThroughMap || !player.playing || player.isDead() || player.nextCrush > now) return false;
        player.nextCrush = now + this.crushInterval;
        if (Math.ceil(damage / player.modifiers.resistanceModifier / player.modifiers.scale) >= player.hp) player.setHp(0, player.id); //dies as its own death
        else player.hit(damage, player, 0, 0, true, 0);
        return true;
    },
    crushInterval: 500, //milliseconds between one crushing hit and the next on the same player
    updateTriggers(room) {
        var world = room.Collider?.platformWorld;
        if (!world?.triggered.length) return;
        var entities = [];
        for (var player of room.players_by_id) if (player?.playing) entities.push({ kind: 'players', pos: { x: player.x, y: player.y, z: player.z }, bounds: this.playerBounds(player), team: player.team, time: Number.isFinite(player.platformTime) ? player.platformTime : undefined });
        room.munitionsManager.grenadePool.forEachActive(grenade => entities.push({ kind: 'items', pos: { x: grenade.x, y: grenade.y, z: grenade.z }, bounds: this.grenadeBounds, team: grenade.player?.team }));
        for (var hit of world.hits.splice(0)) entities.push({ kind: 'bullets', pos: hit.point, bounds: this.bulletBounds, team: hit.team, hitBody: hit.id, time: hit.time }); //what was shot this tick
        if (PlatformTriggers.step(world, entities, world.now()).length) PlatformProtocol.send(room); //a block just set going is worth telling everyone now, not at the next sync
    },
    describe(body) {
        var { id, motion = { type: 'none' } } = body.definition;
        var detail = { spin: ' ' + motion.speed + '°/s', path: ' ' + motion.duration + 's ' + motion.loop, circle: ' r' + motion.radius + ' ' + motion.duration + 's' }[motion.type] || '';
        return id + ' (' + motion.type + detail + ')';
    },
    debugLines({ left, right, player, target }) { //debugf3
        var world = player.Collider?.platformWorld, bodies = world?.bodies.filter(body => !body.definition.static);
        if (world?.teleporters?.length) left.push('', 'Teleporters: ' + world.teleporters.length + (player.dmbLastHop ? ' Last hop: ' + player.dmbLastHop.from + ' → ' + player.dmbLastHop.to : ''));
        if (!bodies?.length) return;
        var time = player.platformTime ?? world.now();
        var support = world.vertical(player, -.02, this.playerBounds(player), time);
        var riding = support && Math.abs(player.y - support.y) <= .015 ? support.body : null;
        left.push('', 'Platforms: ' + bodies.length + ' (' + bodies.filter(body => body.definition.motion?.type !== 'none').length + ' moving) T: ' + time.toFixed(3),
            'Riding: ' + (riding ? this.describe(riding) : 'none'));
        var guesses = world.triggered.map(body => body.progress.guesses).reduce((sum, item) => ({ agreed: sum.agreed + item.agreed, near: sum.near + item.near, refused: sum.refused + item.refused, lost: sum.lost + item.lost, worst: Math.max(sum.worst, item.worst) }), { agreed: 0, near: 0, refused: 0, lost: 0, worst: 0 });
        var clock = isClient && PlatformProtocol.rates(); if (clock) left.push(clock);
        if (isClient && world.triggered.length) left.push('Guesses (you are ' + Math.round((time - world.now()) * 1000) + 'ms off the block clock): ' + guesses.agreed + ' spot on, ' + guesses.near + ' near (worst ' + Math.round(guesses.worst * 1000) + 'ms), ' + guesses.refused + ' refused, ' + guesses.lost + ' lost');
        var body = target?.platform && bodies.find(body => body.definition.id === target.platform);
        if (!body) return;
        var box = world.pose(body, time).bounds, centre = [(box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2];
        right.push('', 'Targeted Platform', this.describe(body), 'Centre: ' + centre.map(value => value.toFixed(3)).join(' / '));
    },
    //players and grenades are both boxes riding blocks: one ride() and one set of rules, only who is asking differs
    ride(audience, collider, entity, bounds, from, to, collides, carry, team) {
        var world = collider.platformWorld;
        return world.as(audience, () => world.transport(entity, bounds, from, to, (next, time, body) => world.at(time, () => {
            if (body.definition.motion?.pushThroughMap) return false; //this block wins over the map: whatever it pushes goes through
            var previous = collider.platformIgnore;
            collider.platformIgnore = body;
            try { return collides(next); } finally { collider.platformIgnore = previous; };
        }), carry, .015), team);
    },
    grenadeStep(grenade, collider, world, bounds, to, delta) {
        //core's grenade update on the players' terms: one box, moved an axis at a time, tested by the same collision the players use
        var mesh = collider.platformGrenadeMesh, bounce = grenade.player?.modifiers?.grenadeBounceModifier ?? 1;
        var velocity = new BABYLON.Vector3(grenade.dx, grenade.dy, grenade.dz), at = { x: grenade.x, y: grenade.y, z: grenade.z };
        var meets = next => {
            var block = world.overlap(next, bounds, to, undefined, false, 'verysoft');
            if (block) return { body: block.body };
            var previous = collider.platformStaticOnly;
            collider.platformStaticOnly = true;
            try { return collider.meshCollidesWithMap(mesh, next) ? { body: null } : null; } finally { collider.platformStaticOnly = previous; };
        };
        var impact = (hit, normal) => { //how hard it meets the surface counts the surface's own speed
            var surface = hit.body ? world.surfaceVelocity(hit.body, at, to) : BABYLON.Vector3.Zero();
            var dot = BABYLON.Vector3.Dot(velocity.subtract(surface), normal);
            if (dot >= 0) return;
            var landed = dot >= -.003 * delta * 1.01 && normal.y > .5; //no harder than a tick of gravity: it is resting, not bouncing
            velocity.subtractInPlace(normal.scale(landed ? BABYLON.Vector3.Dot(velocity, normal) : 1.6 * dot * bounce));
            velocity.x *= .98; velocity.z *= .98;
            if (grenade.actor && !landed) grenade.actor.bounce();
        };
        if (world.pushed) impact({ body: world.pushed.body }, world.pushed.normal);
        var inside = !!meets(at);
        for (var axis of ['y', 'x', 'z']) {
            var step = velocity[axis] * delta, parts = Math.max(1, Math.ceil(Math.abs(step) / .04));
            for (var i = 0; i < parts; i++) {
                var next = { ...at, [axis]: at[axis] + step / parts }, hit = inside ? null : meets(next);
                if (!hit) { at = next; continue; };
                impact(hit, new BABYLON.Vector3(axis === 'x' ? -Math.sign(step) : 0, axis === 'y' ? -Math.sign(step) : 0, axis === 'z' ? -Math.sign(step) : 0));
                break;
            };
        };
        grenade.x = at.x; grenade.y = at.y; grenade.z = at.z;
        grenade.dx = velocity.x * Math.pow(.98, delta); grenade.dy = velocity.y - .003 * delta; grenade.dz = velocity.z * Math.pow(.98, delta);
        grenade.ttl -= delta / grenade.player.modifiers.grenadeTimerModifier;
        if (grenade.actor) grenade.actor.update();
    },
    audience(collider, audience, run, team) { //who is asking, and for which team: players, items and bullets can each be told to pass through a block
        var world = collider?.platformWorld;
        return world ? world.as(audience, run, team) : run();
    },
    timeSlack: .5, //how far a player's own clock may fall behind the blocks' before it is put back
    anchor(time, world) { //a player's clock only runs while they are simulated, so a hidden tab or a death leaves it behind for good
        return Number.isFinite(time) && time >= world.now() - this.timeSlack ? time : world.now(); //only behind: the server dates what a player runs ahead by as they say
    },
    steer(time, world, delta = 1) { //the server counts a player's clock a step at a time and it creeps ahead of real time (about 5 ms a second); lean it back a hair each step, harder when it has wandered far
        if (!world.clock?.live) return time;
        var error = time - world.now(), limit = (Math.abs(error) > .3 ? .002 : .0005) * delta;
        return time - Math.max(-limit, Math.min(limit, error * .1));
    },
    playerBounds(player) {
        var scale = player.modifiers.scale || 1;
        return { min: { x: -.25 * scale, y: 0, z: -.25 * scale }, max: { x: .25 * scale, y: .6 * scale, z: .25 * scale } };
    },
    turnPlayer({ player, delta, resim }) {
        var world = player.Collider?.platformWorld;
        if (!world?.turnsPassengers || resim || player.modifiers.noclip || player.climbing || player.jumping || player.dy > 0 ||
            !Number.isFinite(player.yaw) || (player.controlKeys & CONTROL.jump) && !player.jumpHeld) return;
        if (isClient ? player.id !== meId : player.client?.isHuman) return;
        var from = this.anchor(player.platformTime, world), to = from + delta / (player.modifiers.physicsSpeedModifier || 1) / 60;
        var turn = world.as('players', () => world.passengerTurn(player, this.playerBounds(player), from, to), player.team);
        if (turn) player.yaw = (player.yaw + turn + Math.PI * 2) % (Math.PI * 2);
    },
    install(pluginManager) {
        if (this.managers?.has(pluginManager)) return;
        (this.managers ||= new WeakSet()).add(pluginManager);
        var colliderSetParamsHandler = function (setParams, map, sources, ...args) {
            this.platformMap = map;
            this.platformSources = sources;
            return setParams.call(this, map, sources, ...args);
        };
        pluginManager.on('game:colliderSetParams', data => {
            if (pluginManager.cancel) return;
            data.result = colliderSetParamsHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        var colliderMeshCellHandler = function (cellCollides, mesh, pos, x, y, z, ignoreSoft) {
            var cell = this.platformMap?.data[x]?.[y]?.[z];
            var source = cell?.mesh || this.platformSources?.[cell?.idx];
            if (['aabb', 'obb'].includes(source?.colliderType) && !cell.colliderMesh) return false;
            if ((cell?.mesh || this.platformSources?.[cell?.idx])?.colliderType !== 'mesh') return cellCollides.call(this, mesh, pos, x, y, z, ignoreSoft);
            if (this.platformStaticOnly) return false;
            var body = this.platformCells?.get([x, y, z].join(','));
            if (!body) return false;
            var box = mesh.getBoundingInfo().boundingBox;
            var world = this.platformWorld, bounds = world.box(pos, { min: box.minimum, max: box.maximum });
            for (var part of world.pose(body, world.now()).parts) {
                if (part.visualOnly) continue;
                if (ignoreSoft && part.softness) continue;
                if (PlatformShapes.intersects(part.bounds, bounds) && PlatformShapes.overlap(part.geometry, part.matrix, bounds)) return { x, y, z, cell, mesh: cell.mesh };
            };
            return false;
        };
        pluginManager.on('game:colliderMeshCell', data => {
            if (pluginManager.cancel) return;
            data.result = colliderMeshCellHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        var colliderRayCellHandler = function (rayCell, voxel) {
            var cell = rayCell.call(this, voxel);
            return cell?.mesh?.colliderType === 'mesh' || (['aabb', 'obb'].includes(cell?.mesh?.colliderType) && !cell.colliderMesh) ? false : cell;
        };
        pluginManager.on('game:colliderRayCell', data => {
            if (pluginManager.cancel) return;
            data.result = colliderRayCellHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        var colliderMeshMapHandler = function (meshCollides, mesh, pos) {
            var hit = meshCollides.call(this, mesh, pos);
            if (hit || this.platformStaticOnly) return hit;
            var box = mesh.getBoundingInfo().boundingBox;
            var contact = this.platformWorld?.overlap(pos, { min: box.minimum, max: box.maximum }, undefined, this.platformIgnore);
            return contact ? { platform: contact.body.definition.id } : false;
        };
        pluginManager.on('game:colliderMeshMap', data => {
            if (pluginManager.cancel) return;
            data.result = colliderMeshMapHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        var colliderPointMapHandler = function (pointCollides, point, ignoreSoft) {
            if (pointCollides.call(this, point, ignoreSoft)) return true;
            var small = { min: { x: -.0001, y: -.0001, z: -.0001 }, max: { x: .0001, y: .0001, z: .0001 } };
            return !!this.platformWorld?.overlap(point, small, undefined, undefined, ignoreSoft);
        };
        pluginManager.on('game:colliderPointMap', data => {
            if (pluginManager.cancel) return;
            data.result = colliderPointMapHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        [Bullet, Rocket].forEach(shot => {
            var fire = shot.prototype.fireThis;
            if (fire.dmbWrapped) return;
            shot.prototype.fireThis = function (player, ...rest) { //a shot is a ray the moment it leaves the gun, so the shooter is who is asking
                var world = player?.Collider?.platformWorld;
                if (!world) return fire.call(this, player, ...rest);
                world.shooterTime = player.platformTime; //a shot is dated by the shooter's clock, like a player touching a block
                try { return world.as('bullets', () => fire.call(this, player, ...rest), player.team); } finally {
                    world.shooterTime = undefined;
                    if (world.teleporterShots?.length) { this.dmbCount = 0; this.dmbPad = PlatformTeleporters.padAt(world, this)?.id ?? null; } //leaving a pad it was fired inside is not going through it
                }
            };
            shot.prototype.fireThis.dmbWrapped = true;
        });
        PlatformTeleporters.wrapShots(Bullet, Rocket);
        var colliderRayMapHandler = function (rayCollides, origin, direction, callback) {
            var hit = rayCollides.call(this, origin, direction, callback), landed = null;
            var best = hit?.pick ? BABYLON.Vector3.DistanceSquared(origin, hit.pick.pickedPoint) : Infinity;
            for (var intersection of this.platformWorld?.ray(origin, direction) || []) {
                var point = intersection.point, distance = BABYLON.Vector3.DistanceSquared(origin, point);
                if (distance >= best) continue;
                var candidate = { platform: intersection.body.definition.id,
                    pick: { hit: true, pickedPoint: point }, normal: intersection.normal,
                    dot: BABYLON.Vector3.Dot(direction, intersection.normal) };
                var bounds = this.platformBounds;
                var voxel = { x: Math.floor(point.x), y: Math.floor(point.y), z: Math.floor(point.z), platformHit: candidate };
                if (bounds) for (var axis of ['x', 'y', 'z']) {
                    voxel[axis] = Math.max(0, Math.min(bounds[{ x: 'width', y: 'height', z: 'depth' }[axis]] - 1, voxel[axis]));
                };
                var result = callback(origin, direction, voxel);
                delete voxel.platformHit;
                if (!result || intersection.softness === 'verysoft') continue;
                hit = result; best = distance; landed = intersection;
            };
            if (landed && !isClient && this.platformWorld.audience === 'bullets') this.platformWorld.hits.push({ id: landed.body.definition.id, point: landed.point, team: this.platformWorld.team, time: this.platformWorld.shooterTime });
            return hit;
        };
        pluginManager.on('game:colliderRayMap', data => {
            if (pluginManager.cancel) return;
            data.result = colliderRayMapHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        var playerSnapshotHandler = function (snapshot, ...args) {
            var result = snapshot.apply(this, args);
            if (this.platformTime !== undefined) result.platformTime = this.platformTime;
            return result;
        };
        pluginManager.on('game:playerSnapshot', data => {
            if (pluginManager.cancel) return;
            data.result = playerSnapshotHandler.call(data.this, data.run, ...data.args);
            pluginManager.cancel = true;
        });
        var playerMovementHandler = function (simulate, input, dontAssign) {
            var collider = this.Collider, world = collider.platformWorld;
            if (!world?.bodies.length && !world?.teleporters?.length) return simulate.call(this, input, dontAssign);
            var from = input.platformTime ?? this.platformTime ?? world.now(), idx;
            if (!dontAssign) from = DynamicMapBlocksPlugin.anchor(from, world); //replays keep the times they were first played at
            if (isClient && !dontAssign && this.id === meId) { //replayed steps keep the moment they first had: a state's time is the same whenever it is worked out
                idx = this.dmbResim && this.dmbReplay !== undefined ? this.dmbReplay++ : this.stateIdx;
                var mapped = PlatformProtocol.stateTime(this, idx);
                if (mapped !== undefined) from = mapped;
            };
            if (isClient && !dontAssign && this.id === meId) { var stats = PlatformProtocol.stats, key = this.dmbResim ? 'replay' : 'real'; stats[key]++; stats[key + 'Ms'] += (input.delta ?? 1) / (this.modifiers.physicsSpeedModifier || 1) / .06; };
            var to = from + (input.delta ?? 1) / (this.modifiers.physicsSpeedModifier || 1) / 60;
            var pos = { x: input.x ?? this.x, y: input.y ?? this.y, z: input.z ?? this.z };
            var bounds = DynamicMapBlocksPlugin.playerBounds(this);
            if (!this.modifiers.noclip) {
                pos = DynamicMapBlocksPlugin.ride('players', collider, pos, bounds, from, to, next => this.collidesWithMap(next), !this.climbing && (input.dy ?? this.dy) <= 0, this.team);
                if (!isClient && !dontAssign && world.squeezed) DynamicMapBlocksPlugin.crush(this, world.squeezed);
            };
            var out = world.at(to, () => simulate.call(this, { ...input, ...pos }, dontAssign));
            if (dontAssign) { out.platformTime = to; return out; };
            this.platformTime = isClient ? to : DynamicMapBlocksPlugin.steer(to, world, input.delta ?? 1);
            if (world.teleporters?.length) PlatformTeleporters.player(this, pos, input.delta ?? 1, idx, to);
        };
        pluginManager.on('game:playerMovement', data => {
            if (pluginManager.cancel) return;
            data.result = DynamicMapBlocksPlugin.audience(data.this.Collider, 'players', () => playerMovementHandler.call(data.this, data.run, ...data.args), data.this.team);
            pluginManager.cancel = true;
        });
        var playerMoveYHandler = function (moveY, ndy, delta, dontApply = {}) {
            var collider = this.Collider, world = collider.platformWorld;
            if (world?.bodies.length && !this.modifiers.noclip) {
                var pos = { x: dontApply.x ?? this.x, y: dontApply.y ?? this.y, z: dontApply.z ?? this.z };
                var hit = world.vertical(pos, ndy, DynamicMapBlocksPlugin.playerBounds(this));
                if (hit) {
                    var out = { ...pos, y: hit.y, dy: 0 };
                    var previous = collider.platformStaticOnly;
                    collider.platformStaticOnly = true;
                    var blocked;
                    try { blocked = this.collidesWithMap(out); } finally { collider.platformStaticOnly = previous; };
                    if (!blocked) {
                        if (ndy < 0) {
                            this.setJumping(false); this.jumps = 0;
                            if (isClient) this.lastTouchedGround = Date.now();
                        };
                        if (Object.keys(dontApply).length) return out;
                        Object.assign(this, out);
                        return;
                    };
                };
            };
            return moveY.call(this, ndy, delta, dontApply);
        };
        pluginManager.on('game:playerMoveY', data => {
            if (pluginManager.cancel) return;
            data.result = DynamicMapBlocksPlugin.audience(data.this.Collider, 'players', () => playerMoveYHandler.call(data.this, data.run, ...data.args), data.this.team);
            pluginManager.cancel = true;
        });
        var grenadeThrowHandler = function (launch, ...args) {
            launch.apply(this, args);
            this.platformTime = this.player?.Collider?.platformWorld?.now();
        };
        pluginManager.on('game:grenadeThrow', data => {
            if (pluginManager.cancel) return;
            data.result = DynamicMapBlocksPlugin.audience(data.this.player?.Collider || data.this.scene?.room?.Collider, 'items', () => grenadeThrowHandler.call(data.this, data.run, ...data.args), data.this.player?.team);
            data.this.dmbHopNow = undefined; //a fresh grenade has been through no pad
            pluginManager.cancel = true;
        });
        var grenadeUpdateHandler = function (update, delta) {
            var collider = this.player?.Collider || this.scene?.room?.Collider, world = collider?.platformWorld;
            if (!world?.bodies.length || this.ttl <= 0) return update.call(this, delta);
            var from = this.platformTime ?? world.now(), to = from + delta / 60;
            var bounds = DynamicMapBlocksPlugin.grenadeBounds;
            if (!collider.platformGrenadeMesh) {
                collider.platformGrenadeMesh = BABYLON.MeshBuilder.CreateBox('platform-grenade-query', { size: .14 }, this.scene);
                collider.platformGrenadeMesh.setEnabled(false);
            };
            var pos = DynamicMapBlocksPlugin.ride('items', collider, this, bounds, from, to, next => collider.meshCollidesWithMap(collider.platformGrenadeMesh, next), this.dy <= 0, this.player?.team);
            this.x = pos.x; this.y = pos.y; this.z = pos.z;
            this.platformTime = to;
            world.at(to, () => DynamicMapBlocksPlugin.grenadeStep(this, collider, world, bounds, to, delta));
        };
        pluginManager.on('game:grenadeUpdate', data => {
            if (pluginManager.cancel) return;
            var grenade = data.this, collider = grenade.player?.Collider || grenade.scene?.room?.Collider, team = grenade.player?.team;
            var start = collider?.platformWorld?.teleporters?.length && { x: grenade.x, y: grenade.y, z: grenade.z };
            data.result = DynamicMapBlocksPlugin.audience(collider, 'items', () => grenadeUpdateHandler.call(grenade, data.run, ...data.args), team);
            if (start) DynamicMapBlocksPlugin.audience(collider, 'items', () => PlatformTeleporters.item(grenade, start, collider), team);
            pluginManager.cancel = true;
        });
        pluginManager.on('game:colliderProjectileCell', data => {
            if (pluginManager.cancel) return;
            if (!data.args[2].platformHit) return;
            data.result = data.args[2].platformHit; pluginManager.cancel = true;
        });
        pluginManager.on('game:colliderGrenadeCell', data => {
            if (pluginManager.cancel) return;
            if (!data.args[2].platformHit) return;
            data.result = data.args[2].platformHit; pluginManager.cancel = true;
        });
    },
};

if (isClient) DynamicMapBlocksPlugin.registerListeners(plugins);
