//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';
import { isClient, stateBufferSize } from '#constants';
import { PlatformTeams } from './platforms.js';

//Pads on a block that send whatever steps into their zone somewhere else. Nothing here is sent over the wire: the server and every client run the same rule
//on the same position, so an egg that hops on one side hops on the other. A ledger says what each thing was in last tick, so arriving inside a pad never sends it straight back.
export const PlatformTeleporters = {
    limit: 32,
    palette: [['Cyan', '#20dfff'], ['Orange', '#ffb13b'], ['Pink', '#fa70d7'], ['Lime', '#a3ed45'], ['Violet', '#ad9cff'], ['Coral', '#ff8577']],
    blank: { pad: null, armed: false, held: 0, wait: 0 },
    hopLimit: 8, //how many pads one shot may go through, so a ring of them cannot keep it alive for ever
    sample: .05, //how far apart a shot is tested along the way, in blocks
    sides: { //where on its block a pad sits: v is straight out of that face, u is across it, and facing is the way an egg comes out of there
        top: { v: [0, 1, 0], u: [1, 0, 0], facing: 0, name: 'Top · Y+' },
        bottom: { v: [0, -1, 0], u: [1, 0, 0], facing: 0, name: 'Bottom · Y−' },
        'x+': { v: [1, 0, 0], u: [0, 0, 1], facing: 90, name: 'X+ side' },
        'x-': { v: [-1, 0, 0], u: [0, 0, 1], facing: -90, name: 'X− side' },
        'z+': { v: [0, 0, 1], u: [1, 0, 0], facing: 0, name: 'Z+ side' },
        'z-': { v: [0, 0, -1], u: [1, 0, 0], facing: 180, name: 'Z− side' },
    },
    defaults: {
        send: true, to: { type: 'link' }, side: 'top', rotation: 0, keepOffset: false,
        zone: { shape: 'cylinder', radius: .45, height: .75, size: { x: .45, y: .75, z: .45 } },
        players: true, items: true, bullets: false,
        velocity: 'turn', speed: 8, view: 'turn', charge: 0, cooldown: .5,
        look: { color: 0, pad: true, puff: true, off: 'dim' }, //off is how a powered pad looks while it has no power: dim, hide or keep (the whole portal, in offColor if there is one)
    },
    vector(value) { return value && new BABYLON.Vector3(value.x || 0, value.y || 0, value.z || 0); },
    sideDefaults(side) { //a side's own zone, exit and facing: on top (the default) just above the block, on a wall just out from it, with the exit a cell out from the face
        var v = (this.sides[side] || this.sides.top).v, wall = v[1] === 0;
        return { offset: { x: v[0] * .4, y: v[1] * .4, z: v[2] * .4 }, facing: (this.sides[side] || this.sides.top).facing,
            exit: wall ? { x: v[0], y: -.5, z: v[2] } : { x: 0, y: v[1] > 0 ? .5 : -1.5, z: 0 } };
    },
    basis(side, degrees = 0) { //the zone's own axes: v out of the face, u and w across it, turned about v by the spin
        var s = this.sides[side] || this.sides.top, u = s.u, v = s.v, w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        var r = degrees * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
        return { u: u.map((value, i) => value * cos + w[i] * sin), v: [...v], w: w.map((value, i) => value * cos - u[i] * sin) };
    },
    info(def) { //its settings with the defaults filled in, the middle of its zone, its axes and how far it reaches, worked out once (and kept on the pad where saving and copying cannot see it)
        if (def.dmbInfo) return def.dmbInfo;
        var d = this.defaults, z = def.zone || {}, side = this.sides[def.side] ? def.side : 'top', sd = this.sideDefaults(side);
        var c = { ...d, ...def, side, rotation: def.rotation || 0, facing: def.facing ?? sd.facing, to: { ...d.to, ...def.to }, exit: { ...sd.exit, ...def.exit }, look: { ...d.look, ...def.look },
            zone: { ...d.zone, ...z, size: { ...d.zone.size, ...z.size }, offset: { ...sd.offset, ...z.offset } } };
        var zone = { x: def.block.x + .5 + c.zone.offset.x, y: def.block.y + .5 + c.zone.offset.y, z: def.block.z + .5 + c.zone.offset.z };
        var reach = c.zone.shape === 'box' ? Math.hypot(c.zone.size.x, c.zone.size.y, c.zone.size.z) : c.zone.shape === 'cylinder' ? Math.hypot(c.zone.radius, c.zone.height) : c.zone.radius;
        var axes = this.basis(side, c.rotation), upright = side === 'top' && c.rotation % 360 === 0; //a top pad that is not turned is the plain case, tested without the axes
        return Object.defineProperty(def, 'dmbInfo', { value: { c, zone, reach, axes: upright ? null : axes, basis: { u: new BABYLON.Vector3(...axes.u), v: new BABYLON.Vector3(...axes.v), w: new BABYLON.Vector3(...axes.w) } } }).dmbInfo;
    },
    entryFacing(c) { //the way something is heading as it goes in: on a floor pad that is whatever it was doing, through a wall it is against the way the pad faces
        return c.side === 'top' || c.side === 'bottom' ? c.facing : c.facing + 180;
    },
    config(def) { return this.info(def).c; },
    centre(def) { return { x: def.block.x + .5, y: def.block.y + .5, z: def.block.z + .5 }; },
    zoneCentre(def) { return this.info(def).zone; },
    valid(def, minMap) {
        var finite = (value, low, high) => value === undefined || (Number.isFinite(value) && value >= low && value <= high), choice = (value, list) => value === undefined || list.includes(value);
        var text = value => typeof value === 'string' && value.length > 0 && value.length <= 64, flag = value => value === undefined || typeof value === 'boolean';
        var vector = (value, limit) => value === undefined || (value && typeof value === 'object' && ['x', 'y', 'z'].every(axis => finite(value[axis], -limit, limit)));
        if (!def || typeof def !== 'object' || !text(def.id)) return false;
        var b = def.block;
        if (!b || typeof b.mesh !== 'string' || b.mesh.length > 256 || !['x', 'y', 'z'].every(axis => Number.isInteger(b[axis]) && b[axis] >= 0 && b[axis] < minMap[{ x: 'width', y: 'height', z: 'depth' }[axis]])) return false;
        if (!flag(def.send) || !flag(def.keepOffset) || !vector(def.exit, 64) || !finite(def.facing, -3600, 3600) || !choice(def.side, Object.keys(this.sides)) || !finite(def.rotation, -3600, 3600)) return false;
        var to = def.to;
        if (to !== undefined) {
            if (!to || typeof to !== 'object' || !choice(to.type, ['link', 'point', 'offset']) || !finite(to.facing, -3600, 3600)) return false;
            if ((to.type ?? 'link') === 'link') { if (to.id !== undefined && (!text(to.id) || to.id === def.id)) return false; }
            else if (!['x', 'y', 'z'].every(axis => Number.isFinite(to[axis])) || !vector(to, 4096)) return false;
            else if (to.type === 'point' && ['x', 'y', 'z'].some(axis => to[axis] < 0 || to[axis] >= minMap[{ x: 'width', y: 'height', z: 'depth' }[axis]])) return false;
        };
        var z = def.zone;
        if (z !== undefined) {
            if (!z || typeof z !== 'object' || !choice(z.shape, ['sphere', 'box', 'cylinder']) || !finite(z.radius, .25, 64) || !finite(z.height, .25, 64)) return false;
            if (!vector(z.offset, 64) || !vector(z.size, 64) || (z.size && ['x', 'y', 'z'].some(axis => (z.size[axis] ?? 1) < .25))) return false;
        };
        if (['players', 'items', 'bullets'].some(key => def[key] !== undefined && !PlatformTeams.valid(def[key]))) return false;
        if (!choice(def.velocity, ['keep', 'stop', 'turn', 'set']) || !choice(def.view, ['keep', 'turn', 'face'])) return false;
        if (!finite(def.speed, 0, 30) || !finite(def.charge, 0, 10) || !finite(def.cooldown, 0, 60)) return false;
        if (def.power !== undefined && (!def.power || !text(def.power.id) || !choice(def.power.when ?? 'moved', ['moved', 'end', 'start']))) return false;
        var look = def.look;
        return look === undefined || (look && typeof look === 'object' && (look.color === undefined || (Number.isInteger(look.color) && look.color >= 0 && look.color < this.palette.length)) && flag(look.pad) && flag(look.puff) && choice(look.off, ['dim', 'hide', 'keep']) && (look.offColor === undefined || (Number.isInteger(look.offColor) && look.offColor >= 0 && look.offColor < this.palette.length)));
    },
    read(minMap) {
        var list = Array.isArray(minMap?.extents?.teleporters) ? minMap.extents.teleporters : [], ids = new Set(), cells = new Set(), result = [];
        for (var def of list.slice(0, this.limit)) {
            if (!this.valid(def, minMap)) continue;
            var cell = [def.block.x, def.block.y, def.block.z].join(',');
            if (ids.has(def.id) || cells.has(cell)) continue;
            ids.add(def.id); cells.add(cell); result.push(JSON.parse(JSON.stringify(def)));
        };
        return result;
    },
    attach(world, minMap) { //what the world needs to know: every pad, by name, and the ones a shot can use
        world.teleporters = this.read(minMap);
        world.teleporterIndex = new Map(world.teleporters.map(def => [def.id, def]));
        world.teleporterShots = world.teleporters.filter(def => { var c = this.config(def); return c.send && c.bullets !== false && c.charge <= 0; });
        return world;
    },
    inside(def, p) {
        var k = this.info(def), z = k.c.zone, dx = p.x - k.zone.x, dy = p.y - k.zone.y, dz = p.z - k.zone.z, a = k.axes;
        if (a) { var x = dx, y = dy; dx = x * a.u[0] + y * a.u[1] + dz * a.u[2]; dy = x * a.v[0] + y * a.v[1] + dz * a.v[2]; dz = x * a.w[0] + y * a.w[1] + dz * a.w[2]; } //into the zone's own axes
        if (z.shape === 'box') return Math.abs(dx) <= z.size.x && Math.abs(dy) <= z.size.y && Math.abs(dz) <= z.size.z;
        if (z.shape === 'cylinder') return Math.abs(dy) <= z.height && dx * dx + dz * dz <= z.radius * z.radius;
        return dx * dx + dy * dy + dz * dz <= z.radius * z.radius;
    },
    padAt(world, p) { return world.teleporters.find(def => this.inside(def, p)) || null; },
    powered(world, c, time) { //a pad can be tied to a triggered block: working only once that has moved, or while it is at its end, or at its start
        if (!c.power) return true;
        var body = world.triggered.find(item => item.definition.id === c.power.id);
        if (!body) return false;
        var progress = world.progressAt(body, time), when = c.power.when ?? 'moved';
        return when === 'moved' ? progress > 0 : when === 'end' ? progress >= 1 : progress <= 0;
    },
    step(world, kind, team, from, to, rec, delta, time) { //what a thing was in, and whether that sends it now: the ledger goes in and comes out, one tick on
        var held = rec.pad && world.teleporterIndex.get(rec.pad), def = held && this.inside(held, to) ? held : this.padAt(world, to);
        var next = { pad: def ? def.id : null, armed: false, held: 0, wait: Math.max(0, rec.wait - delta) };
        if (!def) return { rec: next, def: null };
        var same = def === held;
        next.armed = same ? rec.armed : !this.inside(def, from); //only what came in from outside is sent: not what was put there, or was always there
        next.held = (same ? rec.held : 0) + delta;
        var c = this.config(def);
        var fire = c.send && next.armed && next.wait <= 0 && next.held >= c.charge * 60 && PlatformTeams.allows(c[kind], team) && this.powered(world, c, time);
        return { rec: next, def: fire ? def : null };
    },
    after(world, def, at) { //where it is now, once sent: inside whatever pad it came out in, but not for sending again until it has left
        return { pad: this.padAt(world, at)?.id ?? null, armed: false, held: 0, wait: this.config(def).cooldown * 60 };
    },
    resolve(world, def, at) { //where it comes out, which way that faces, and how far round that is from the way this pad faces
        var c = this.config(def), to = c.to, spot, facing = c.facing;
        if (to.type === 'point') { spot = { x: to.x, y: to.y, z: to.z }; facing = to.facing ?? this.entryFacing(c); }
        else if (to.type === 'offset') { var centre = this.centre(def); spot = { x: centre.x + to.x, y: centre.y + to.y, z: centre.z + to.z }; facing = to.facing ?? this.entryFacing(c); }
        else {
            var other = to.id && world.teleporterIndex.get(to.id);
            if (!other || other === def) return null;
            var o = this.config(other), middle = this.centre(other);
            spot = { x: middle.x + o.exit.x, y: middle.y + o.exit.y, z: middle.z + o.exit.z }; facing = o.facing;
        };
        var turn = (facing - this.entryFacing(c)) * Math.PI / 180;
        if (c.keepOffset && at) { //how far off the middle it went in, turned round with it
            var zone = this.zoneCentre(def), ox = at.x - zone.x, oz = at.z - zone.z, sin = Math.sin(turn), cos = Math.cos(turn);
            spot.x += ox * cos + oz * sin; spot.z += -ox * sin + oz * cos;
        };
        return { ...spot, facing, turn };
    },
    arrive(collider, world, def, at, blocked, lift = 0) { //where it can actually stand: up to a block higher if the exit is in something, not at all if that is no good either
        var spot = this.resolve(world, def, at), bounds = collider.platformBounds;
        if (!spot) return null;
        for (var k = 0; k <= 10; k++) {
            var y = spot.y + lift + k * .1;
            if (bounds && (spot.x < 0 || spot.z < 0 || y < 0 || spot.x >= bounds.width || spot.z >= bounds.depth || y >= bounds.height)) return null;
            if (!blocked({ x: spot.x, y, z: spot.z })) return { ...spot, y };
        };
        return null;
    },
    velocity(c, thing, spot) { //how it leaves: as it was, stopped dead, turned round with the exit, or sent off the way the exit faces
        if (c.velocity === 'stop') thing.dx = thing.dy = thing.dz = 0;
        else if (c.velocity === 'turn') { var sin = Math.sin(spot.turn), cos = Math.cos(spot.turn), dx = thing.dx; thing.dx = dx * cos + thing.dz * sin; thing.dz = -dx * sin + thing.dz * cos; }
        else if (c.velocity === 'set') { var facing = spot.facing * Math.PI / 180; thing.dx = Math.sin(facing) * c.speed / 60; thing.dz = Math.cos(facing) * c.speed / 60; };
    },
    effect(x, y, z, c) { //a puff of smoke and a poof, where it went in and where it came out
        if (!isClient || !c.look.puff || typeof addExplosionSprite === 'undefined' || typeof explosionSmokeManager === 'undefined') return;
        for (var i = 0; i < 8; i++) addExplosionSprite(explosionSmokeManager, 10, x, y + .3, z, .1 * Math.random() - .05, .06 * Math.random(), .1 * Math.random() - .05, .25 + .2 * Math.random(), false);
        if (typeof playSoundIndependent === 'function') playSoundIndependent('rpegg.poof', { pos: new BABYLON.Vector3(x, y + .3, z) });
    },
    reset(player) { player.dmbHops = undefined; player.dmbHopNow = undefined; player.dmbView = undefined; },
    snap(player, x, y, z) { //on screen, jump to where it went instead of gliding there
        var mesh = isClient && player.actor?.mesh;
        if (mesh) { mesh.position.x = x; mesh.position.y = y; mesh.position.z = z; };
    },
    player(player, start, delta, idx, time) { //after a step of a player's own: did that put them in a pad, and does it send them
        var collider = player.Collider, world = collider.platformWorld, mods = player.modifiers;
        var ledger = idx !== undefined ? (player.dmbHops ||= new Array(stateBufferSize)) : null;
        if (!player.playing || mods.noclip || player.isDead()) { player.dmbHopNow = this.blank; if (ledger) ledger[idx] = this.blank; return; };
        var lift = .3 * (mods.scale || 1), replay = isClient && player.dmbResim; //feet to middle
        var prev = ledger?.[(idx + stateBufferSize - 1) % stateBufferSize] || player.dmbHopNow || this.blank;
        var at = { x: player.x, y: player.y + lift, z: player.z };
        var out = this.step(world, 'players', player.team, { x: start.x, y: start.y + lift, z: start.z }, at, prev, delta, time), rec = out.rec;
        if (out.def) {
            var c = this.config(out.def), spot = this.arrive(collider, world, out.def, at, pos => world.at(time, () => player.collidesWithMap(pos)));
            if (spot) {
                var gone = { x: player.x, y: player.y, z: player.z };
                player.x = spot.x; player.y = spot.y; player.z = spot.z;
                this.velocity(c, player, spot);
                player.climbing = false;
                if (isClient) player.corrections = 0;
                if (c.view !== 'keep' && !replay) player.dmbView = c.view === 'face' ? { face: spot.facing * Math.PI / 180 } : { turn: spot.turn };
                rec = this.after(world, out.def, { x: spot.x, y: spot.y + lift, z: spot.z });
                player.dmbLastHop = { from: out.def.id, to: c.to.id || c.to.type, time };
                if (!replay) { this.snap(player, spot.x, spot.y, spot.z); this.effect(gone.x, gone.y, gone.z, c); this.effect(spot.x, spot.y, spot.z, c); };
            };
        };
        player.dmbHopNow = rec;
        if (ledger) ledger[idx] = rec;
    },
    view({ player, resim }) { //turn their view with them: through the yaw the player records as input, so the server hears it like any other turn
        var turn = player.dmbView;
        if (!turn || resim) return;
        player.dmbView = undefined;
        if (isClient ? player.id !== meId : player.client?.isHuman) return;
        if (turn.face !== undefined) { player.yaw = (turn.face + Math.PI * 2) % (Math.PI * 2); player.pitch = 0; }
        else player.yaw = ((player.yaw + turn.turn) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    },
    item(grenade, start, collider) { //a thrown grenade, after it has moved
        var world = collider.platformWorld;
        if (!world?.teleporters?.length || grenade.ttl <= 0) return;
        var time = grenade.platformTime ?? world.now(), at = { x: grenade.x, y: grenade.y, z: grenade.z };
        var out = this.step(world, 'items', grenade.player?.team, start, at, grenade.dmbHopNow || this.blank, 1, time), rec = out.rec;
        if (out.def) {
            var c = this.config(out.def), spot = this.arrive(collider, world, out.def, at, pos => world.at(time, () => collider.pointCollidesWithMap(pos)), .3);
            if (spot) {
                this.effect(grenade.x, grenade.y, grenade.z, c);
                grenade.x = spot.x; grenade.y = spot.y; grenade.z = spot.z;
                this.velocity(c, grenade, spot);
                rec = this.after(world, out.def, spot);
                this.effect(spot.x, spot.y, spot.z, c);
                grenade.actor?.update();
            };
        };
        grenade.dmbHopNow = rec;
    },
    shot(shot, start, collider, world) { //a bullet or rocket, after it has moved: through the first pad its way crossed, then on from the exit
        var pads = world.teleporterShots, dx = shot.x - start.x, dy = shot.y - start.y, dz = shot.z - start.z, length = Math.hypot(dx, dy, dz);
        var near = [], team = shot.player?.team, time = shot.player?.platformTime ?? world.now(), full = length;
        if (!pads.length || !length) return;
        length = Math.min(length, Math.max(0, length + shot.range) + this.sample); //past the wall it never really went
        for (var def of pads) { //the ones close enough to the line to be worth testing
            var k = this.info(def), qx = k.zone.x - start.x, qy = k.zone.y - start.y, qz = k.zone.z - start.z;
            var along = Math.max(0, Math.min(1, (qx * dx + qy * dy + qz * dz) / (full * full)));
            var ex = qx - dx * along, ey = qy - dy * along, ez = qz - dz * along, reach = k.reach + this.sample;
            if (ex * ex + ey * ey + ez * ez <= reach * reach) near.push(def);
        };
        var here = shot.dmbPad ?? null, steps = Math.max(1, Math.ceil(length / this.sample)), scale = length / full;
        var p = { x: 0, y: 0, z: 0 };
        for (var i = 1; i <= steps && near.length; i++) {
            p.x = start.x + dx * scale * i / steps; p.y = start.y + dy * scale * i / steps; p.z = start.z + dz * scale * i / steps; var found = null;
            for (var def of near) if (this.inside(def, p)) { found = def; break; };
            var c = found && this.config(found);
            if (found && found.id !== here && PlatformTeams.allows(c.bullets, team) && (shot.dmbCount || 0) < this.hopLimit && this.powered(world, c, time)) {
                var spot = this.arrive(collider, world, found, p, pos => world.at(time, () => collider.pointCollidesWithMap(pos)), .3);
                if (spot) { this.sendShot(shot, found, c, spot, collider, world, team); return; };
            };
            here = found ? found.id : null;
        };
        shot.dmbPad = here;
    },
    sendShot(shot, def, c, spot, collider, world, team) {
        this.effect(shot.x, shot.y, shot.z, c);
        shot.x = spot.x; shot.y = spot.y; shot.z = spot.z;
        if (c.velocity === 'turn') { var sin = Math.sin(spot.turn), cos = Math.cos(spot.turn), dx = shot.dx; shot.dx = dx * cos + shot.dz * sin; shot.dz = -dx * sin + shot.dz * cos; }
        else if (c.velocity === 'set') { var flat = Math.hypot(shot.dx, shot.dz), facing = spot.facing * Math.PI / 180; shot.dx = Math.sin(facing) * flat; shot.dz = Math.cos(facing) * flat; };
        shot.dmbCount = (shot.dmbCount || 0) + 1; shot.dmbPad = this.padAt(world, spot)?.id ?? null;
        var origin = new BABYLON.Vector3(spot.x, spot.y, spot.z), direction = new BABYLON.Vector3(shot.dx, shot.dy, shot.dz).normalize().scale(shot.weaponClass.range);
        world.shooterTime = shot.player?.platformTime; //a shot is dated by the shooter's clock, like when it was fired
        var res; try { res = world.as('bullets', () => collider.rayCollidesWithMap(origin, direction, collider.dmbProjectile ||= collider.projectileCollidesWithCell.bind(collider)), team); } finally { world.shooterTime = undefined; };
        shot.range = res ? BABYLON.Vector3.Distance(origin, res.pick.pickedPoint) : shot.weaponClass.range;
        if (shot.actor) {
            if (res) shot.end.copyFrom(res.pick.pickedPoint);
            shot.actor.mesh.position.set(spot.x, spot.y, spot.z);
            shot.actor.mesh.lookAt(new BABYLON.Vector3(spot.x + shot.dx, spot.y + shot.dy, spot.z + shot.dz));
        };
        this.effect(spot.x, spot.y, spot.z, c);
    },
    wrapShots(Bullet, Rocket) { //a shot flies itself, so what it does on the way is done after each of its updates
        [Bullet, Rocket].forEach(shot => {
            var update = shot.prototype.update;
            if (update.dmbWrapped) return;
            shot.prototype.update = function (...args) {
                var collider = this.player?.Collider, world = collider?.platformWorld;
                if (!world?.teleporterShots?.length) return update.apply(this, args);
                var start = { x: this.x, y: this.y, z: this.z };
                var result = update.apply(this, args);
                if (this.active) PlatformTeleporters.shot(this, start, collider, world);
                return result;
            };
            shot.prototype.update.dmbWrapped = true;
        });
    },
};
