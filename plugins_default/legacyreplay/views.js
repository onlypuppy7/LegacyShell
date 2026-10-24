//legacyshell: replay camera views (browser bundle, and node for the tests). a view is a function of what is going on around the player: where the camera wants to be, what it should look at, and a few
//extras (field of view, roll, how loosely it follows). it works in plain {x, y, z} so it can be tested without a game. cameras.js turns the answer into a moving camera, smoothed
//
//the context c: p (the player: x y z yaw pitch scale), eye, f (forward: x z) and r (right: x z) from the yaw, t (replay ms), dt (seconds), s (this view's own memory, wiped when the view changes),
//opt (the settings), others (the other players that are playing), kills ([{ tMs, by, victim }]), povOf(id), posOf(id) (a player's eye), map ({ width, height, depth }), proj (the projectile in flight), partner (a chosen
//second player), cam (where the camera is now)

const vAdd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const vSub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const vMul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const vLen = (a) => Math.hypot(a.x, a.y, a.z);
const vDist = (a, b) => vLen(vSub(a, b));
const vClamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const vEase = (u) => { u = vClamp(u, 0, 1); return u * u * (3 - 2 * u) };
const vLerp = (a, b, u) => vAdd(vMul(a, 1 - u), vMul(b, u));
const vPt = (x, y, z) => ({ x, y, z });
const VTAU = Math.PI * 2;

export const ReplayViews = {
    //how the picker groups them, in order. the bullet ones only come from a reel shot that has a bullet in it
    groups: [
        ["On the player", ["first", "pov", "chase", "shoulder", "shoulderleft", "overhead", "lead", "low", "skim", "helmet", "muzzle", "dutch"]],
        ["Alongside", ["side", "telepside", "orbit", "drone", "crane", "dolly", "flyby"]],
        ["Fixed", ["top", "topclose", "toptele", "security", "securityclose", "securitycorner", "cctv", "tiltshift", "arena"]],
        ["Places", ["focus", "tour"]],
        ["Fights", ["duel", "group", "killcam", "killchain", "auto"]],
        ["Projectiles", ["grenade", "rocket"]],
        ["Free", ["free"]],
    ],
    bulletViews: ["bullet", "bulletfront", "bulletside", "incoming"],
    names: {
        first: "First person", pov: "Their view (hud)", chase: "Chase", shoulder: "Over the shoulder", shoulderleft: "Over the left shoulder", overhead: "Over the head", lead: "Out in front",
        low: "Low angle", skim: "Ground skim", helmet: "Helmet cam", muzzle: "Muzzle cam", dutch: "Tilted chase",
        side: "Side on", telepside: "Telephoto side", orbit: "Orbit", drone: "Drone", crane: "Crane", dolly: "Dolly zoom", flyby: "Fly-by",
        top: "Top down", topclose: "Top down (close)", toptele: "Top down (telephoto)", security: "Security camera", securityclose: "Security camera (close)", securitycorner: "Security camera (corner)",
        cctv: "CCTV", tiltshift: "Tilt-shift", arena: "Arena overview",
        duel: "Duel two-shot", group: "Group", killcam: "Killcam", killchain: "Kill chain", auto: "Auto, closest action",
        focus: "Focus on a place", tour: "Fly tour",
        grenade: "Grenade cam", rocket: "Rocket cam", free: "Free camera",
        bullet: "Bullet cam", bulletfront: "Bullet from the front", bulletside: "Bullet side on", incoming: "Incoming",
    },

    all: function () {
        return this.groups.flatMap(([name, ids]) => ids).concat(this.bulletViews);
    },

    //views you can pick from the list (the bullet ones come with a shot)
    pickable: function () {
        return this.groups.flatMap(([name, ids]) => ids);
    },

    //the views that circle with C: everything but the free camera, which has its own key
    cycled: function () {
        return this.pickable().filter((id) => this.needsPlayer(id) && id !== "tiltshift" && id !== "cctv");
    },

    needsPlayer: function (view) {
        return view !== "free" && view !== "arena" && view !== "focus" && view !== "tour";
    },

    //the views that smooth their way to where they want to be (the others are the first person ones, set straight, and the bullet ones)
    following: function () {
        return this.pickable().filter((id) => id !== "first" && id !== "pov" && id !== "free");
    },

    isBullet: function (view) {
        return this.bulletViews.includes(view);
    },

    //the places there are to look at that are not a player: the whole map, its corners, the spawns and what is lying around to pick up. info = { map: { width, height, depth }, spawns: [{ team, x, y, z }], pickups: [{ kind, x, y, z }] }
    //each is { id, group, label, x, y, z (what is looked at), dist and height (how far out and how high the camera orbits), spin (radians a second), fixed (a point to film from instead of orbiting), tour (is it on the fly tour) }
    pois: function (info) {
        var m = info.map || { width: 30, height: 10, depth: 30 }, cx = m.width / 2, cz = m.depth / 2, cy = m.height * 0.25, span = Math.max(m.width, m.depth);
        var list = [{ id: "map", group: "Map", label: "Whole map", x: cx, y: cy, z: cz, dist: span * 0.85, height: m.height + 6, spin: 0.12, tour: true }];
        [["Corner, back left", 0, 0], ["Corner, back right", m.width, 0], ["Corner, front right", m.width, m.depth], ["Corner, front left", 0, m.depth]].forEach(([label, x, z]) => {
            list.push({ id: "corner:" + x + "," + z, group: "Map", label, x: cx, y: cy, z: cz, fixed: { x: x + (x ? -1 : 1), y: m.height + 3, z: z + (z ? -1 : 1) }, dist: 0, height: 0, spin: 0, tour: true });
        });
        var nth = (items, wanted) => (item) => items.indexOf(item) % Math.max(1, Math.ceil(items.length / wanted)) === 0; //an even few of them for the tour
        var spawns = info.spawns || [], pickups = info.pickups || [];
        var counts = {};
        var inTour = nth(spawns, 4), inTourPickups = nth(pickups, 4);
        spawns.forEach((s) => { counts[s.team] = (counts[s.team] || 0) + 1; list.push({ id: "spawn:" + s.team + ":" + s.x + "," + s.y + "," + s.z, group: "Spawns", label: "Spawn " + s.team + " " + counts[s.team], x: s.x + 0.5, y: s.y + 0.5, z: s.z + 0.5, dist: 5, height: 3, spin: 0.35, tour: inTour(s) }) });
        counts = {};
        pickups.forEach((p) => { counts[p.kind] = (counts[p.kind] || 0) + 1; list.push({ id: "pickup:" + p.kind + ":" + Math.round(p.x) + "," + Math.round(p.y) + "," + Math.round(p.z), group: "Pickups", label: p.kind + " " + counts[p.kind], x: p.x, y: p.y, z: p.z, dist: 3.5, height: 2, spin: 0.4, tour: inTourPickups(p) }) });
        return list;
    },

    //round a place. it sets off from the bearing the camera is already on, and the smoothing does the rest, so going from one place to the next is a flight and never a jump
    orbitPoint: function (c, poi, moveTau, turnTau) {
        var s = c.s;
        if (s.poi !== poi.id) {
            var dx = c.cam.x - poi.x, dz = c.cam.z - poi.z;
            s.angle = Math.hypot(dx, dz) > 0.5 ? Math.atan2(dz, dx) : 0;
            s.poi = poi.id;
        };
        s.angle += poi.spin * c.dt;
        var want = poi.fixed ? vPt(poi.fixed.x, poi.fixed.y, poi.fixed.z) : vPt(poi.x + Math.cos(s.angle) * poi.dist, poi.y + poi.height, poi.z + Math.sin(s.angle) * poi.dist);
        return { want, look: vPt(poi.x, poi.y, poi.z), fov: 1.1, moveTau, turnTau, free: true };
    },

    //the answer for one view, or null when there isn't one (a view that needs a second player with nobody there, say: the caller falls back to a chase)
    compute: function (kind, c) {
        var fn = this.views[kind];
        return fn ? fn.call(this, c) : null;
    },

    //where the camera was put the last time, kept while it still makes sense: a camera on a wall stays where it is until the player gets too far away or past it
    anchor: function (c, name, maxDistance, make) {
        var a = c.s[name];
        if (!a || vDist(a, c.eye) > maxDistance) a = c.s[name] = make();
        return a;
    },

    //the chase, which a few views are a variation on
    chased: function (c, back, height, ahead) {
        return {
            want: vPt(c.eye.x - c.f.x * back, c.eye.y + height, c.eye.z - c.f.z * back),
            look: vPt(c.eye.x + c.f.x * ahead, c.eye.y + 0.1, c.eye.z + c.f.z * ahead),
        };
    },

    //looking along where they are looking, from a point
    along: function (from, c, reach) {
        var pitch = vClamp(c.p.pitch || 0, -1.2, 1.2);
        return vPt(from.x + c.f.x * reach, from.y - Math.tan(pitch) * reach, from.z + c.f.z * reach);
    },

    views: {
        chase: function (c) {
            return this.chased(c, c.opt.chaseDistance, c.opt.chaseHeight, 3);
        },

        shoulder: function (c) {
            return { want: vPt(c.eye.x - c.f.x * 1.5 + c.r.x * 0.75, c.eye.y + 0.45, c.eye.z - c.f.z * 1.5 + c.r.z * 0.75), look: vPt(c.eye.x + c.f.x * 6, c.eye.y + 0.05, c.eye.z + c.f.z * 6) };
        },
        shoulderleft: function (c) {
            return { want: vPt(c.eye.x - c.f.x * 1.5 - c.r.x * 0.75, c.eye.y + 0.45, c.eye.z - c.f.z * 1.5 - c.r.z * 0.75), look: vPt(c.eye.x + c.f.x * 6, c.eye.y + 0.05, c.eye.z + c.f.z * 6) };
        },
        overhead: function (c) {
            return { want: vPt(c.eye.x - c.f.x * 1.6, c.eye.y + 2.6, c.eye.z - c.f.z * 1.6), look: vPt(c.eye.x + c.f.x * 1.4, c.eye.y - 0.2, c.eye.z + c.f.z * 1.4) };
        },

        //ahead of them, looking back at their face. it has to stay ahead as they run, so it follows tightly
        lead: function (c) {
            return { want: vPt(c.eye.x + c.f.x * 3.4, c.eye.y + 0.6, c.eye.z + c.f.z * 3.4), look: vPt(c.eye.x, c.eye.y + 0.1, c.eye.z), moveTau: 0.22 };
        },

        low: function (c) {
            return { want: vPt(c.eye.x - c.f.x * 2.6, c.p.y + 0.1, c.eye.z - c.f.z * 2.6), look: vPt(c.eye.x + c.f.x * 2, c.eye.y + 0.35, c.eye.z + c.f.z * 2) };
        },

        //on the floor, close behind, wide: the ground rushing past is what sells the speed
        skim: function (c) {
            return { want: vPt(c.eye.x - c.f.x * 2.2, c.p.y + 0.18, c.eye.z - c.f.z * 2.2), look: vPt(c.eye.x + c.f.x * 4, c.p.y + 0.25, c.eye.z + c.f.z * 4), fov: 1.55, moveTau: 0.1, turnTau: 0.12 };
        },

        //on top of the head, very wide, a little shake
        helmet: function (c) {
            var from = vPt(c.eye.x + c.f.x * 0.05, c.eye.y + 0.42 + Math.sin(c.t * 0.031) * 0.012, c.eye.z + c.f.z * 0.05);
            return { want: from, look: this.along(from, c, 8), fov: 1.95, roll: Math.sin(c.t * 0.017) * 0.012, moveTau: 0.03, turnTau: 0.03, free: true };
        },

        //where the barrel is, looking the way it points
        muzzle: function (c) {
            var from = vPt(c.eye.x + c.f.x * 0.75 + c.r.x * 0.28, c.eye.y - 0.12, c.eye.z + c.f.z * 0.75 + c.r.z * 0.28);
            return { want: from, look: this.along(from, c, 8), fov: 1.45, moveTau: 0.04, turnTau: 0.04, free: true };
        },

        dutch: function (c) {
            var v = this.chased(c, 2.6, 1.0, 3);
            v.roll = 0.22;
            return v;
        },

        side: function (c) {
            return { want: vPt(c.eye.x + c.r.x * 3.5, c.eye.y + 0.4, c.eye.z + c.r.z * 3.5), look: vPt(c.eye.x, c.eye.y, c.eye.z) };
        },

        //a long lens from far off that sits still and pans, and only moves when they get away
        telepside: function (c) {
            var a = this.anchor(c, "tele", 17, () => vPt(c.eye.x + c.r.x * 14 + c.f.x * 3, c.eye.y + 1.3, c.eye.z + c.r.z * 14 + c.f.z * 3));
            return { want: a, look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: 0.4, moveTau: 0.9, turnTau: 0.08 };
        },

        orbit: function (c) {
            c.s.angle = (c.s.angle || 0) + c.opt.orbitSpeed * (Math.PI / 180) * c.dt;
            return { want: vPt(c.eye.x + Math.sin(c.s.angle) * c.opt.orbitRadius, c.eye.y + 0.7, c.eye.z + Math.cos(c.s.angle) * c.opt.orbitRadius), look: vPt(c.eye.x, c.eye.y, c.eye.z) };
        },

        //high behind them and loose, drifting from side to side
        drone: function (c) {
            var swing = Math.sin(c.t / 1000 * 0.35), heading = c.p.yaw + Math.PI + swing * 1.0, h = 5.2 + Math.sin(c.t / 1000 * 0.7) * 0.8;
            return { want: vPt(c.eye.x + Math.sin(heading) * 6, c.eye.y + h, c.eye.z + Math.cos(heading) * 6), look: vPt(c.eye.x, c.eye.y, c.eye.z), roll: swing * 0.05, moveTau: 1.3, turnTau: 0.35 };
        },

        //low, rising and drawing back and coming down again, over fourteen seconds
        crane: function (c) {
            var u = 0.5 - 0.5 * Math.cos(VTAU * c.t / 14000), back = 3.4 + 1.2 * u;
            return { want: vPt(c.eye.x - c.f.x * back, c.eye.y - 0.3 + 0.7 + 4.8 * u, c.eye.z - c.f.z * back), look: vPt(c.eye.x + c.f.x * 1.5, c.eye.y, c.eye.z + c.f.z * 1.5), moveTau: 0.3 };
        },

        //pulling away while the lens tightens, so they stay the same size and everything behind them stretches
        dolly: function (c) {
            var u = 0.5 - 0.5 * Math.cos(VTAU * c.t / 6000), d = 2.6 + 5.4 * u;
            return { want: vPt(c.eye.x - c.f.x * d, c.eye.y + 0.5 + d * 0.08, c.eye.z - c.f.z * d), look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: vClamp(2 * Math.atan(1.15 / d), 0.28, 1.5), moveTau: 0.12, turnTau: 0.1 };
        },

        //waits ahead of where they are going, turns as they pass, and when they are past, cuts to a new spot ahead
        flyby: function (c) {
            var a = c.s.flyby, cut = false;
            if (!a || vDist(a, c.eye) > 24 || (a.x - c.eye.x) * c.f.x + (a.z - c.eye.z) * c.f.z < -3) {
                cut = !!a;
                a = c.s.flyby = vPt(c.eye.x + c.f.x * 13 + c.r.x * 3.2, c.eye.y + 1.3, c.eye.z + c.f.z * 13 + c.r.z * 3.2);
            };
            return { want: a, look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: 0.95, moveTau: 0.6, turnTau: 0.08, cut, free: true };
        },

        //north up, straight down. the close one is just above their head, the telephoto one is far up with a narrow lens, which is flatter
        top: function (c) { return { want: vPt(c.eye.x, c.eye.y + 9, c.eye.z - 0.01), look: vPt(c.eye.x, c.eye.y, c.eye.z) } },
        topclose: function (c) { return { want: vPt(c.eye.x, c.eye.y + 4.5, c.eye.z - 0.01), look: vPt(c.eye.x, c.eye.y, c.eye.z) } },
        toptele: function (c) { return { want: vPt(c.eye.x, c.eye.y + 18, c.eye.z - 0.01), look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: 0.45, moveTau: 0.5 } },

        //a camera on a wall: it stays where it is and only turns, until they get too far away and it moves to a new spot
        security: function (c) {
            var a = this.anchor(c, "security", 16, () => { var h = c.p.yaw + 2.4; return vPt(c.eye.x + Math.sin(h) * 6, c.eye.y + 3.5, c.eye.z + Math.cos(h) * 6) });
            return { want: a, look: vPt(c.eye.x, c.eye.y, c.eye.z), moveTau: 0.8 };
        },
        securityclose: function (c) {
            var a = this.anchor(c, "securityclose", 9, () => { var h = c.p.yaw + 2.4; return vPt(c.eye.x + Math.sin(h) * 3.2, c.eye.y + 2.0, c.eye.z + Math.cos(h) * 3.2) });
            return { want: a, look: vPt(c.eye.x, c.eye.y, c.eye.z), moveTau: 0.8 };
        },

        //high in the nearest corner of the map, with the lens tightening as they get further away
        securitycorner: function (c) {
            var m = c.map;
            if (!m) return this.views.security.call(this, c);
            var corners = [vPt(0.8, 0, 0.8), vPt(m.width - 0.8, 0, 0.8), vPt(0.8, 0, m.depth - 0.8), vPt(m.width - 0.8, 0, m.depth - 0.8)];
            var y = Math.max(c.eye.y + 3, m.height * 0.8);
            var near = corners.map((k) => ({ k, d: Math.hypot(k.x - c.eye.x, k.z - c.eye.z) })).sort((a, b) => a.d - b.d)[0];
            var keep = c.s.corner && Math.hypot(c.s.corner.x - c.eye.x, c.s.corner.z - c.eye.z) <= near.d * 1.15; //not for a small difference
            if (!keep) c.s.corner = near.k;
            var a = vPt(c.s.corner.x, y, c.s.corner.z), d = vDist(a, c.eye);
            return { want: a, look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: vClamp(2 * Math.atan(3.2 / d), 0.4, 1.25), moveTau: 1.0, turnTau: 0.1, free: true };
        },

        //a security camera with the look of one (see cameras.js for the picture on top)
        cctv: function (c) {
            var a = this.anchor(c, "cctv", 11, () => { var h = c.p.yaw + 2.4; return vPt(c.eye.x + Math.sin(h) * 4.5, c.eye.y + 2.8, c.eye.z + Math.cos(h) * 4.5) });
            return { want: a, look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: 1.0, moveTau: 0.8, cctv: true };
        },

        //not quite from above, high, with the picture's top and bottom blurred so they look like toys (the blur is the look's, see fx.js)
        tiltshift: function (c) {
            return { want: vPt(c.eye.x, c.eye.y + 11, c.eye.z - 5), look: vPt(c.eye.x, c.eye.y, c.eye.z), fov: 0.9, moveTau: 0.7, tilt: true };
        },

        //high over the middle of the map, slowly circling the whole thing
        arena: function (c) {
            var m = c.map || { width: 30, height: 10, depth: 30 };
            var a = c.t * 0.00006, r = Math.max(m.width, m.depth) * 0.55, centre = vPt(m.width / 2, m.height * 0.25, m.depth / 2);
            return { want: vPt(centre.x + Math.cos(a) * r, m.height + 6, centre.z + Math.sin(a) * r), look: centre, fov: 1.0, moveTau: 0.8, turnTau: 0.2, free: true };
        },

        //one place, picked from the list (c.focus)
        focus: function (c) {
            return c.focus ? this.orbitPoint(c, c.focus, 1, 0.5) : this.views.arena.call(this, c);
        },

        //the places on the tour, one after another, a few seconds each. the camera flies between them without a cut
        tour: function (c) {
            var list = (c.pois || []).filter((p) => p.tour);
            if (!list.length) return this.views.arena.call(this, c);
            var s = c.s;
            s.elapsed = (s.elapsed || 0) + c.dt;
            if (s.elapsed > (c.opt.tourDwell || 7)) { s.elapsed = 0; s.i = ((s.i || 0) + 1) % list.length };
            s.i = (s.i || 0) % list.length;
            return this.orbitPoint(c, list[s.i], 1.5, 0.8);
        },

        //both of them in the frame, from the side. the camera stays on the side it is on
        duel: function (c) {
            var other = c.partner;
            if (!other) return null;
            var a = c.eye, b = c.posOf(other.id) || vPt(other.x, other.y, other.z);
            var m = vLerp(a, b, 0.5), ab = vSub(b, a), separation = Math.hypot(ab.x, ab.z);
            var n = separation < 0.01 ? vPt(c.r.x, 0, c.r.z) : vPt(-ab.z / separation, 0, ab.x / separation);
            if (c.s.sign === undefined) c.s.sign = 1;
            if (c.cam) { var here = (c.cam.x - m.x) * n.x + (c.cam.z - m.z) * n.z; if (Math.abs(here) > 0.5) c.s.sign = here >= 0 ? 1 : -1 };
            var d = Math.max(3.4, separation * 0.95 + 2.2), h = 1.0 + separation * 0.1;
            return { want: vPt(m.x + n.x * c.s.sign * d, m.y + h, m.z + n.z * c.s.sign * d), look: vPt(m.x, m.y - 0.1, m.z), moveTau: 0.35 };
        },

        //the middle of whoever is near them, from behind and above, pulling back as the group spreads
        group: function (c) {
            var near = c.others.filter((o) => Math.hypot(o.x - c.p.x, o.z - c.p.z) <= 12);
            var all = [c.eye].concat(near.map((o) => c.posOf(o.id) || vPt(o.x, o.y, o.z)));
            var centre = vMul(all.reduce((s, p) => vAdd(s, p), vPt(0, 0, 0)), 1 / all.length);
            var radius = Math.max.apply(null, all.map((p) => vDist(p, centre)));
            return { want: vPt(centre.x - c.f.x * (radius + 4.5), centre.y + 2.2 + radius * 0.35, centre.z - c.f.z * (radius + 4.5)), look: centre, moveTau: 0.5 };
        },

        //through the eyes of whoever is about to die: the last second and a bit before a kill by them, or before their own
        killcam: function (c) {
            var near = c.kills.filter((k) => (k.by === c.p.id || k.victim === c.p.id) && k.tMs - c.t >= -300 && k.tMs - c.t <= 1300).sort((a, b) => a.tMs - b.tMs)[0];
            if (!near) return null;
            var pov = c.povOf(near.victim === c.p.id ? c.p.id : near.victim);
            if (!pov) return null;
            var from = vPt(pov.x, pov.y, pov.z), left = near.tMs - c.t, panic = left < 400 ? 1 - Math.max(0, left) / 400 : 0;
            return { want: from, look: this.along(from, { f: { x: Math.sin(pov.yaw), z: Math.cos(pov.yaw) }, p: { pitch: pov.pitch } }, 8), fov: 1.4, roll: Math.sin(c.t * 0.05) * 0.03 * panic, moveTau: 0.2, turnTau: 0.1, free: true };
        },

        //a chase that swings round to the next person they are about to kill, and holds for a moment after
        killchain: function (c) {
            var next = c.kills.filter((k) => k.by === c.p.id && k.tMs - c.t >= -500 && k.tMs - c.t <= 3000).sort((a, b) => a.tMs - b.tMs)[0];
            var base = this.chased(c, 3.2, 1.2, 3);
            if (!next) return base;
            var victim = c.posOf(next.victim);
            if (!victim) return base;
            var w = vEase((1500 - (next.tMs - c.t)) / 1000);
            return { want: vPt(base.want.x + c.r.x * 1.2 * w, base.want.y, base.want.z + c.r.z * 1.2 * w), look: vLerp(base.look, victim, w), moveTau: 0.35 };
        },

        //the fight that is closest: a kill that has just happened or is about to, else the two nearest each other. re-chosen every second or so and not for a small change
        auto: function (c) {
            var s = c.s, everyone = [{ id: c.p.id, x: c.p.x, y: c.p.y, z: c.p.z }].concat(c.others);
            if (everyone.length < 2) return null;
            var pair = s.pair && s.pair.every((id) => everyone.some((e) => e.id === id)) ? s.pair : null;
            if (!pair || c.t - (s.chosenAt || -1e9) > 1200 || c.t < (s.chosenAt || 0)) {
                var kill = c.kills.filter((k) => Math.abs(k.tMs - c.t) < 1500 && everyone.some((e) => e.id === k.by) && everyone.some((e) => e.id === k.victim))
                    .sort((a, b) => Math.abs(a.tMs - c.t) - Math.abs(b.tMs - c.t))[0];
                var best = null, bestD = Infinity, kept = pair ? vPairDistance(everyone, pair) : Infinity;
                if (kill) best = [kill.by, kill.victim];
                else {
                    for (var i = 0; i < everyone.length; i++) for (var j = i + 1; j < everyone.length; j++) {
                        var d = Math.hypot(everyone[i].x - everyone[j].x, everyone[i].z - everyone[j].z);
                        if (d < bestD) { bestD = d; best = [everyone[i].id, everyone[j].id] };
                    };
                    if (pair && kept <= bestD * 1.6) best = pair; //the one that is being filmed is nearly as close, so stay on it
                };
                if (!pair || best[0] !== pair[0] || best[1] !== pair[1]) s.moved = true;
                s.pair = best;
                s.chosenAt = c.t;
            };
            return { choose: { target: s.pair[0], partner: s.pair[1] } }; //cameras.js points the duel at them
        },

        //rides the player's grenade or rocket, then circles where it went off
        grenade: function (c) { return this.projectile(c, "grenade", 1.8, 0.8, 1.25) },
        rocket: function (c) { return this.projectile(c, "rocket", 2.4, 0.7, 1.35) },
    },

    projectile: function (c, kind, back, up, fov) {
        var s = c.s, p = c.proj;
        if (p) {
            //the way it is going, eased: a grenade bouncing or sliding along the ground turns round every few ticks, and the camera and what it looks at went with it
            var speed = Math.hypot(p.dx, p.dy, p.dz), moving = speed > 0.05;
            if (moving) {
                var now = vPt(p.dx / speed, p.dy / speed, p.dz / speed), k = s.dir ? 1 - Math.exp(-(c.dt || 0.016) / 0.35) : 1;
                var mix = s.dir ? vPt(s.dir.x + (now.x - s.dir.x) * k, s.dir.y + (now.y - s.dir.y) * k, s.dir.z + (now.z - s.dir.z) * k) : now, length = Math.hypot(mix.x, mix.y, mix.z) || 1;
                s.dir = vPt(mix.x / length, mix.y / length, mix.z / length);
            };
            var dir = s.dir || vPt(c.f.x, 0, c.f.z);
            s.last = vPt(p.x, p.y, p.z);
            s.lastSeen = c.t;
            return { want: vPt(p.x - dir.x * back, p.y - dir.y * back + up, p.z - dir.z * back), look: vPt(p.x + dir.x, p.y + dir.y, p.z + dir.z), fov, moveTau: 0.15, turnTau: 0.1, free: true };
        };
        //it went off: round and round where it was for a moment (the time is the replay's, so it also works going backwards). it starts from where the camera is, going the way round it already is,
        //and eases in to the circle it settles on, instead of swinging across to a fixed place the moment the bang happens
        if (s.last && c.t >= s.lastSeen && c.t - s.lastSeen < 1800) {
            if (s.exitFor !== s.lastSeen) {
                s.exitFor = s.lastSeen;
                var cam = c.cam || vPt(s.last.x + 4, s.last.y + 2.2, s.last.z), dx = cam.x - s.last.x, dz = cam.z - s.last.z;
                s.exitAngle = Math.atan2(dx, dz);
                s.exitRadius = Math.max(1.5, Math.min(6, Math.hypot(dx, dz)));
                s.exitHeight = cam.y - s.last.y;
            };
            var e = (c.t - s.lastSeen) / 1000, angle = s.exitAngle + e * 1.2, k = Math.min(1, e / 0.8);
            var radius = s.exitRadius + (4 - s.exitRadius) * k, height = s.exitHeight + (2.2 - s.exitHeight) * k;
            return { want: vPt(s.last.x + Math.sin(angle) * radius, s.last.y + height, s.last.z + Math.cos(angle) * radius), look: s.last, moveTau: 0.35 };
        };
        return null;
    },
};

function vPairDistance(everyone, pair) {
    var a = everyone.find((e) => e.id === pair[0]), b = everyone.find((e) => e.id === pair[1]);
    return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
};
