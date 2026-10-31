//plugin: dynamicmapblocks
import BABYLON from 'babylonjs';
import { PlatformMotion } from './motion.js';
import { PlatformTeams } from './platforms.js';

//Blocks that only move when something sets them off. A triggered block has a progress, 0 at the start of its track and 1 at the end,
//and progress is a straight line in time between moments the server announced (segments), so every client works out the same place.
export const PlatformTriggers = {
    lagLimit: .3, //the longest a start is back-dated, in seconds
    slack: .1, //how much more generously the server judges who is inside or touching than a client does: the two never agree to the last hair on where a player is, and a guess the server turns down is a block that does not move for someone standing on it
    leadLimit: 3, //and how far ahead of the server clock the players' may be before it stops following them
    defaults: {
        source: 'contact', players: true, items: true, bullets: false, surface: 'top',
        mode: 'run', release: 'pause', returnSeconds: 2, delayStart: 0, delayReset: 0, cooldown: 0, angle: 90,
        zone: { shape: 'sphere', radius: 3, size: { x: 2, y: 2, z: 2 }, height: 2, offset: { x: 0, y: 0, z: 0 }, follow: false },
    },
    config(motion) {
        var t = motion.trigger || {}, zone = { ...this.defaults.zone, ...t.zone };
        zone.size = { ...this.defaults.zone.size, ...t.zone?.size }; zone.offset = { ...this.defaults.zone.offset, ...t.zone?.offset };
        return { ...this.defaults, ...t, zone };
    },
    centre(body) { //the middle of the block's collision, in its own space
        if (!body.centre) {
            var points = body.parts.flatMap(part => part.corners.map(corner => BABYLON.Vector3.TransformCoordinates(corner, part.matrix)));
            var min = points.reduce((low, point) => BABYLON.Vector3.Minimize(low, point), points[0]), max = points.reduce((high, point) => BABYLON.Vector3.Maximize(high, point), points[0]);
            body.centre = min.add(max).scale(.5);
        };
        return body.centre;
    },
    inZone(world, body, c, point, time, slack = 0) {
        var z = c.zone, matrix = z.follow ? world.pose(body, time).matrix : PlatformMotion.sample(body.definition, 0); //or where the block starts
        var centre = BABYLON.Vector3.TransformCoordinates(this.centre(body), matrix).add(PlatformMotion.vector(z.offset));
        var d = point.subtract(centre);
        if (z.shape === 'box') return Math.abs(d.x) <= z.size.x + slack && Math.abs(d.y) <= z.size.y + slack && Math.abs(d.z) <= z.size.z + slack;
        if (z.shape === 'cylinder') return Math.hypot(d.x, d.z) <= z.radius + slack && Math.abs(d.y) <= z.height + slack;
        return d.length() <= z.radius + slack;
    },
    detect(world, body, c, entities, time, slack = 0) { //the earliest time by the clocks of those touching it, or null if nothing is
        var found = null, note = entity => { found = found === null ? (entity.time ?? time) : Math.min(found, entity.time ?? time); };
        for (var entity of entities) {
            if (!PlatformTeams.allows(c[entity.kind], entity.team)) continue;
            if (entity.hitBody !== undefined) { //a bullet is only ever there for the moment it lands: on the block itself, or inside the zone
                if (c.source === 'zone' ? this.inZone(world, body, c, new BABYLON.Vector3(entity.pos.x, entity.pos.y, entity.pos.z), time, slack) : entity.hitBody === body.definition.id) note(entity);
                continue;
            };
            if (c.source === 'zone') {
                var centre = new BABYLON.Vector3(entity.pos.x + (entity.bounds.min.x + entity.bounds.max.x) / 2, entity.pos.y + (entity.bounds.min.y + entity.bounds.max.y) / 2, entity.pos.z + (entity.bounds.min.z + entity.bounds.max.z) / 2);
                if (this.inZone(world, body, c, centre, time, slack)) note(entity);
                continue;
            };
            var side = world.as(entity.kind, () => world.solid(body) && world.touch(body, entity.pos, entity.bounds, time, .04 + slack), entity.team);
            if (side && (c.surface === 'any' || (c.surface === 'top' ? side === 'top' : side === 'sides'))) note(entity);
        };
        return found;
    },
    advance(world, body, now, detected, predict = false) { //decides, from what is touching it now, which way and how fast progress should be going
        var motion = body.definition.motion, c = this.config(motion), length = PlatformMotion.triggerLength(motion);
        var st = body.trigState ||= { since: null, seen: -1e9, latched: false, cycling: false, atEnd: false, cooldownUntil: 0 };
        if (detected !== null && detected !== false) { if (st.since === null) st.since = now; st.seen = now; st.lastTime = detected; } //lastTime: by the toucher's own clock
        else if (st.since !== null && now - st.seen > c.delayReset) st.since = null; //let go for longer than the reset delay
        var active = st.since !== null && now - st.since >= c.delayStart;
        var segs = body.progress.segs, current = segs.filter(seg => seg.t0 <= now || !seg.sched).at(-1) ?? segs[0], p = world.progressAt(body, now); //what is in force now, or already set going, not the end that is only planned
        if (st.endsAt !== undefined && now >= st.endsAt) { st.atEnd = true; st.cooldownUntil = st.endsAt + c.cooldown; st.cycling = false; st.endsAt = undefined; } //the cycle ran out, as planned
        else if (p >= 1 && !st.atEnd) { st.atEnd = true; st.cooldownUntil = now + c.cooldown; st.cycling = false; }
        else if (p < 1) st.atEnd = false;
        if (st.cycling && current.rate <= 0) { st.cycling = false; if (current.snap) st.cooldownUntil = current.t0 + c.cooldown; } //the server's snap landed before this side ever saw the end
        var canStart = now >= st.cooldownUntil || p > 0, forward;
        if (c.mode === 'latch') { if (active && canStart) st.latched = true; forward = st.latched; }
        else if (c.mode === 'cycle') { if (active && canStart && p <= 0 && !st.atEnd) st.cycling = true; forward = st.cycling; }
        else forward = active && canStart;
        //a player's own clock says when they really stepped on, or off; the server only hears about either a ping later, so it dates the change to then (never before the last one)
        var clamp = time => Math.max(now - this.lagLimit, Math.min(now + this.leadLimit, time));
        var began = detected === null || detected === false ? now : clamp(detected);
        var ended = current.rate > 0 && p >= 1 ? current.t0 + (1 - current.p0) / current.rate : now; //reaching the end happened when the track ran out, whoever noticed first
        var letGo = c.mode === 'run' && !active && st.lastTime !== undefined ? clamp(st.lastTime + 1 / 60 + c.delayReset) : Math.min(now, ended); //only losing the toucher counts: a cooldown happened just now
        var rate = forward ? 1 / length : c.release === 'reverse' ? -1 / length : c.release === 'return' ? -1 / c.returnSeconds : 0, made = null;
        if (!forward && c.release === 'snap' && p > 0) made = { t0: letGo > current.t0 ? letGo : now, p0: 0, rate: 0, snap: true };
        else if (Math.abs(current.rate - (forward || c.release !== 'snap' ? rate : 0)) > 1e-9) {
            var wanted = forward ? began : letGo, at = wanted > current.t0 ? wanted : now;
            made = { t0: at, p0: at === now ? p : world.progressAt(body, at), rate: forward || c.release !== 'snap' ? rate : 0 };
        };
        if (predict && made) made.pred = true; //a guess until the server has spoken
        if (made && world.addSegment(body, made) && c.mode === 'cycle' && made.rate > 0) { //a cycle is known from the start: where it ends and what happens then are planned now, so nobody waits to be told
            var end = made.t0 + (1 - made.p0) / made.rate, then = c.release === 'snap' ? { t0: end, p0: 0, rate: 0, snap: true } : { t0: end, p0: 1, rate: c.release === 'reverse' ? -1 / length : c.release === 'return' ? -1 / c.returnSeconds : 0 };
            then.sched = true; if (predict) { then.pred = true; then.after = made.t0; };
            st.endsAt = end; world.addSegment(body, then);
        };
        return made;
    },
    predict(world, entities, now) { //on a client: move, and stop, the instant the player it controls does, instead of a ping later
        for (var body of world.triggered) {
            var c = this.config(body.definition.motion);
            if (c.bullets !== false) continue; //a client never sees a shot land, so it would only guess the block is let go of every tick, and be put right at every sync: it follows the server instead
            this.advance(world, body, now, this.detect(world, body, c, entities, now), true);
        };
    },
    step(world, entities, now) { //once a tick, on the server
        var made = [], times = entities.filter(entity => entity.kind !== 'items' && Number.isFinite(entity.time)).map(entity => entity.time).sort((a, b) => a - b);
        if (times.length) world.lead = Math.max(0, Math.min(this.leadLimit, times[times.length >> 1] - now)); //how far the players' clock runs ahead of the server's, as last seen: the middle one, so one player cannot move it for the rest
        now += world.lead || 0; //decided by the players' clock, as the guess a client makes is: both then notice the end of a track at the same moment
        for (var body of world.triggered) {
            var c = this.config(body.definition.motion), segment = this.advance(world, body, now, this.detect(world, body, c, entities, now, this.slack));
            if (segment) made.push({ id: body.definition.id, ...segment });
        };
        return made;
    },
};
