//legacyshell: camera view geometry, no game needed. node plugins_default/legacyreplay/test-views.js
import assert from 'node:assert/strict';
import { ReplayViews as V } from './views.js';

var passed = 0;
function test(name, fn) {
    try {
        fn();
        passed++;
        console.log("ok   ", name);
    } catch (e) {
        console.log("FAIL ", name, "\n", e);
        process.exitCode = 1;
    };
};

const opt = { chaseDistance: 3, chaseHeight: 1.1, orbitSpeed: 25, orbitRadius: 3.5 };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const horizontal = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

//a player at (10, 2, 10) looking along +z, the world around them
function context(over = {}) {
    const yaw = over.yaw ?? 0;
    const p = { id: 1, x: 10, y: 2, z: 10, yaw, pitch: 0, scale: 1, ...(over.p || {}) };
    const players = over.others || [{ id: 2, x: 14, y: 2, z: 12, yaw: 3, pitch: 0 }, { id: 3, x: 30, y: 2, z: 30, yaw: 0, pitch: 0 }];
    return {
        p, eye: { x: p.x, y: p.y + 0.42, z: p.z }, f: { x: Math.sin(yaw), z: Math.cos(yaw) }, r: { x: Math.cos(yaw), z: -Math.sin(yaw) },
        t: over.t ?? 5000, dt: 0.016, s: over.s || {}, opt, others: players, kills: over.kills || [],
        povOf: (id) => id === 2 ? { x: 14, y: 2.4, z: 12, yaw: 3, pitch: 0.1 } : id === 1 ? { x: 10, y: 2.4, z: 10, yaw, pitch: 0 } : null,
        posOf: (id) => { const o = [p, ...players].find((q) => q.id === id); return o ? { x: o.x, y: o.y + 0.42, z: o.z } : null },
        map: over.map === undefined ? { width: 40, height: 12, depth: 40 } : over.map, proj: over.proj || null, partner: over.partner === undefined ? players[0] : over.partner, cam: over.cam || null,
    };
};
const view = (kind, over) => V.compute(kind, context(over));

test("every view in the lists has a name, and every name is in a list", () => {
    for (const id of V.all()) assert.ok(V.names[id], "no name for " + id);
    for (const id of Object.keys(V.names)) assert.ok(V.all().includes(id), id + " is named but in no list");
    assert.equal(new Set(V.all()).size, V.all().length, "a view is listed twice");
    assert.equal(V.all().length, 42, "the count"); //38 to pick from and 4 bullet ones
});

test("every view that is computed here has an answer with a place to be and a place to look, and nothing is NaN", () => {
    for (const kind of Object.keys(V.views)) {
        const answers = [view(kind), view(kind, { yaw: 2.2, t: 9000 }), view(kind, { yaw: -1, p: { pitch: 0.4 } })].filter(Boolean);
        for (const a of answers) {
            if (a.choose) continue; //auto answers with who to film
            for (const key of ["want", "look"]) for (const axis of ["x", "y", "z"]) assert.ok(Number.isFinite(a[key]?.[axis]), kind + " " + key + "." + axis);
            if (a.fov !== undefined) assert.ok(a.fov >= 0.25 && a.fov <= 2.1, kind + " fov " + a.fov);
            if (a.roll !== undefined) assert.ok(Math.abs(a.roll) < 0.5, kind + " roll");
        };
    };
});

test("the views that sit on the player stay close to them, and look at or along them", () => {
    for (const kind of ["chase", "shoulder", "shoulderleft", "overhead", "low", "skim", "dutch", "side"]) {
        const a = view(kind), eye = context().eye;
        assert.ok(dist(a.want, eye) < 4, kind + " too far " + dist(a.want, eye));
        assert.ok(dist(a.look, eye) < 8, kind + " looks away");
    };
});

test("chase: behind and a little up. shoulder: behind, to the right (left for the other). overhead: high, tilted down", () => {
    const eye = context().eye;
    assert.ok(view("chase").want.z < eye.z && view("chase").want.y > eye.y);
    assert.ok(view("shoulder").want.x > eye.x && view("shoulderleft").want.x < eye.x);
    assert.ok(view("shoulder").want.z < eye.z && view("shoulderleft").want.z < eye.z);
    const o = view("overhead");
    assert.ok(o.want.y - eye.y > 2 && o.look.y < o.want.y - 2 && o.look.z > o.want.z);
});

test("lead is out in front looking back, skim is on the floor and wide, low is under their eyes", () => {
    const eye = context().eye, lead = view("lead"), skim = view("skim"), low = view("low");
    assert.ok(lead.want.z > eye.z + 3 && lead.look.z < lead.want.z && lead.moveTau < 0.3);
    assert.ok(skim.want.y < 2.3 && skim.fov > 1.4);
    assert.ok(low.want.y < eye.y);
});

test("helmet is on the head, very wide, and looks the way they look (up when they look up)", () => {
    const eye = context().eye, flat = view("helmet"), up = view("helmet", { p: { pitch: -0.5 } }), down = view("helmet", { p: { pitch: 0.5 } });
    assert.ok(horizontal(flat.want, eye) < 0.2 && flat.fov > 1.8 && flat.free);
    assert.ok(up.look.y > flat.look.y && down.look.y < flat.look.y);
    assert.notEqual(view("helmet", { t: 1000 }).roll, view("helmet", { t: 1100 }).roll); //it shakes
});

test("muzzle is at the gun, out in front and to the right of the eye, and looks along the barrel", () => {
    const eye = context().eye, m = view("muzzle");
    assert.ok(m.want.z > eye.z + 0.5 && m.want.x > eye.x && m.want.y < eye.y && m.fov > 1.3);
    assert.ok(m.look.z > m.want.z + 5);
});

test("tilted chase is rolled", () => {
    assert.ok(Math.abs(view("dutch").roll) > 0.15);
    assert.equal(view("chase").roll, undefined);
});

test("top views are above them (north up), the telephoto one is the highest with the narrowest lens, close is the lowest", () => {
    const eye = context().eye, top = view("top"), close = view("topclose"), tele = view("toptele");
    assert.ok(close.want.y - eye.y === 4.5 && top.want.y - eye.y === 9 && tele.want.y - eye.y === 18);
    assert.ok(tele.fov < 0.5 && top.fov === undefined);
    for (const v of [top, close, tele]) assert.ok(horizontal(v.want, eye) < 0.05 && v.look.y === eye.y);
});

test("a camera on a wall stays put until they get far away, then moves", () => {
    for (const kind of ["security", "securityclose", "cctv", "telepside"]) {
        const s = {};
        const first = V.compute(kind, context({ s })).want;
        const again = V.compute(kind, context({ s, p: { x: 11, z: 11 } })).want; //a step
        assert.deepEqual(again, first, kind + " moved for a step");
        const far = V.compute(kind, context({ s, p: { x: 10, z: 60 } })).want; //a long way
        assert.notDeepEqual(far, first, kind + " didn't follow them away");
    };
});

test("close security is closer than security, the corner one is in a corner of the map and tightens its lens with distance", () => {
    const eye = context().eye, a = view("security").want, b = view("securityclose").want;
    assert.ok(dist(b, eye) < dist(a, eye));
    const corner = view("securitycorner");
    assert.ok([0.8, 39.2].includes(corner.want.x) && [0.8, 39.2].includes(corner.want.z), JSON.stringify(corner.want));
    assert.ok(corner.want.y >= 9);
    const nearer = V.compute("securitycorner", context({ p: { x: 2, z: 2 } }));
    assert.ok(nearer.fov >= corner.fov, "farther away should be tighter");
    assert.equal(view("securitycorner", { map: null }).want.y > 0, true); //no map: the plain security camera
});

test("the corner camera doesn't flip between corners for a small difference", () => {
    const s = {};
    const first = V.compute("securitycorner", context({ s, p: { x: 19, z: 19 } })).want;
    const second = V.compute("securitycorner", context({ s, p: { x: 21, z: 19 } })).want; //nearly the same distance to two
    assert.deepEqual(second, first);
});

test("telephoto side is far and narrow", () => {
    const eye = context().eye, t = view("telepside");
    assert.ok(dist(t.want, eye) > 12 && t.fov < 0.5);
});

test("drone is high behind them and moves over time", () => {
    const a = view("drone", { t: 1000 }), b = view("drone", { t: 5000 }), eye = context().eye;
    assert.ok(a.want.y - eye.y > 4 && a.want.z < eye.z);
    assert.notEqual(a.want.x, b.want.x);
    assert.ok(a.moveTau > 1);
});

test("crane rises and comes back down over its cycle", () => {
    const low = view("crane", { t: 0 }).want.y, high = view("crane", { t: 7000 }).want.y, back = view("crane", { t: 14000 }).want.y;
    assert.ok(high - low > 4 && Math.abs(back - low) < 0.01);
});

test("dolly zoom: the further it pulls back the narrower the lens, and the subject stays about the same size", () => {
    const close = view("dolly", { t: 0 }), far = view("dolly", { t: 3000 }), eye = context().eye;
    const dClose = dist(close.want, eye), dFar = dist(far.want, eye);
    assert.ok(dFar > dClose * 2 && far.fov < close.fov);
    assert.ok(Math.abs(Math.tan(close.fov / 2) * dClose - Math.tan(far.fov / 2) * dFar) < 0.25, "size should hold");
});

test("fly-by waits ahead and to the side, and cuts to a new spot once they have gone past", () => {
    const s = {};
    const first = V.compute("flyby", context({ s }));
    assert.ok(first.want.z > 20 && first.cut === false);
    const passing = V.compute("flyby", context({ s, p: { z: 20 } }));
    assert.deepEqual(passing.want, first.want);
    assert.equal(passing.cut, false);
    const past = V.compute("flyby", context({ s, p: { z: 27 } })); //they are past it
    assert.equal(past.cut, true);
    assert.ok(past.want.z > 27);
});

test("tilt-shift and cctv say what they need from the picture", () => {
    assert.equal(view("tiltshift").tilt, true);
    assert.equal(view("cctv").cctv, true);
    assert.equal(view("security").cctv, undefined);
});

test("arena circles the middle of the map from above, and needs no player", () => {
    const a = view("arena", { t: 0 }), b = view("arena", { t: 20000 });
    assert.ok(a.want.y > 12 && Math.abs(a.look.x - 20) < 0.01 && Math.abs(a.look.z - 20) < 0.01);
    assert.ok(dist(a.want, b.want) > 1);
    assert.equal(V.needsPlayer("arena"), false);
    assert.equal(V.needsPlayer("free"), false);
    assert.equal(V.needsPlayer("chase"), true);
    assert.ok(V.compute("arena", context({ map: null })).want.y > 0);
});

test("duel keeps both in the frame, looking at the middle, from the side", () => {
    const eye = context().eye, c = context(), a = V.compute("duel", c);
    const other = c.posOf(2), mid = { x: (eye.x + other.x) / 2, y: (eye.y + other.y) / 2, z: (eye.z + other.z) / 2 };
    assert.ok(Math.abs(a.look.x - mid.x) < 0.01 && Math.abs(a.look.z - mid.z) < 0.01);
    //both inside a half field of view of the camera's aim
    const aim = { x: a.look.x - a.want.x, y: a.look.y - a.want.y, z: a.look.z - a.want.z };
    const angle = (p) => { const to = { x: p.x - a.want.x, y: p.y - a.want.y, z: p.z - a.want.z }; return Math.acos((to.x * aim.x + to.y * aim.y + to.z * aim.z) / (Math.hypot(to.x, to.y, to.z) * Math.hypot(aim.x, aim.y, aim.z))) };
    assert.ok(angle(eye) < 0.6 && angle(other) < 0.6);
    assert.equal(V.compute("duel", context({ partner: null })), null);
});

test("duel stays on the side it is on", () => {
    const s = {}, first = V.compute("duel", context({ s })).want;
    const cam = first;
    const again = V.compute("duel", context({ s, cam, p: { x: 10.5 } })).want;
    assert.ok(dist(first, again) < 1.5);
});

test("duel pulls back as they get further apart", () => {
    const near = V.compute("duel", context()), farOthers = [{ id: 2, x: 28, y: 2, z: 26, yaw: 0, pitch: 0 }];
    const far = V.compute("duel", context({ others: farOthers, partner: farOthers[0] }));
    const eye = context().eye;
    assert.ok(horizontal(far.want, eye) > horizontal(near.want, eye));
});

test("group looks at the middle of the people near them and ignores the far one", () => {
    const g = view("group"), eye = context().eye;
    assert.ok(Math.abs(g.look.x - 12) < 0.6 && Math.abs(g.look.z - 11) < 0.6, JSON.stringify(g.look)); //between 1 and 2, not dragged towards 3
    const alone = view("group", { others: [] });
    assert.ok(Math.abs(alone.look.x - eye.x) < 0.01);
    assert.ok(alone.want.z < eye.z - 3);
});

test("killcam: through the eyes of whoever is about to die, in the last second and a bit, else nothing", () => {
    const kills = [{ tMs: 6000, by: 1, victim: 2 }];
    assert.equal(view("killcam", { t: 3000, kills }), null);
    const inside = view("killcam", { t: 5000, kills });
    assert.ok(inside && inside.free && inside.want.x === 14 && inside.want.z === 12, JSON.stringify(inside));
    assert.equal(view("killcam", { t: 6400, kills }), null); //over
    const own = view("killcam", { t: 5500, kills: [{ tMs: 6000, by: 2, victim: 1 }] }); //their own death
    assert.ok(own && own.want.x === 10);
    assert.ok(Math.abs(view("killcam", { t: 5900, kills }).roll) >= 0); //shakes at the end
});

test("killchain swings towards the next victim as the kill nears, and not before", () => {
    const kills = [{ tMs: 8000, by: 1, victim: 2 }];
    const early = view("killchain", { t: 5000, kills }), late = view("killchain", { t: 7900, kills }), plain = view("chase");
    assert.ok(Math.abs(early.look.x - plain.look.x) < 0.01);
    const victim = context().posOf(2);
    assert.ok(dist(late.look, victim) < dist(early.look, victim) * 0.5);
    assert.deepEqual(view("killchain", { t: 5000 }).look, view("chase").look); //nothing coming, it is a chase
});

test("auto picks the two nearest each other, a kill that is happening beats that, and it holds on to a pair", () => {
    const others = [{ id: 2, x: 40, y: 2, z: 40, yaw: 0, pitch: 0 }, { id: 3, x: 41, y: 2, z: 41, yaw: 0, pitch: 0 }];
    const a = V.compute("auto", context({ others }));
    assert.deepEqual([a.choose.target, a.choose.partner].sort(), [2, 3]); //not the far one
    const withKill = V.compute("auto", context({ others, kills: [{ tMs: 5200, by: 1, victim: 2 }] }));
    assert.deepEqual([withKill.choose.target, withKill.choose.partner], [1, 2]);
    //keeps what it picked while that is still nearly as good
    const s = {};
    V.compute("auto", context({ s, others }));
    const closer = [{ id: 2, x: 40, y: 2, z: 40, yaw: 0, pitch: 0 }, { id: 3, x: 43, y: 2, z: 41, yaw: 0, pitch: 0 }, { id: 4, x: 10, y: 2, z: 10.5, yaw: 0, pitch: 0 }];
    const held = V.compute("auto", context({ s, others: closer, t: 5300 })); //not 1.2 seconds on yet
    assert.deepEqual([held.choose.target, held.choose.partner].sort(), [2, 3]);
    const later = V.compute("auto", context({ s, others: closer, t: 7000 }));
    assert.deepEqual([later.choose.target, later.choose.partner].sort(), [1, 4]); //a better pair now
    assert.equal(V.compute("auto", context({ others: [] })), null);
});

test("grenade and rocket ride the projectile from behind, then circle where it went off, then give up", () => {
    const proj = { x: 20, y: 3, z: 20, dx: 0, dy: 0, dz: 1 }, s = {};
    const riding = V.compute("grenade", context({ s, proj, t: 1000 }));
    assert.ok(riding.want.z < 20 && riding.look.z > 20 && riding.free);
    assert.equal(V.compute("rocket", context({ proj, t: 1000 })).fov, 1.35);
    const off = V.compute("grenade", context({ s, proj: null, t: 1500 })); //gone half a second later
    assert.ok(off && dist(off.look, { x: 20, y: 3, z: 20 }) < 0.01 && horizontal(off.want, off.look) > 3.5);
    assert.equal(V.compute("grenade", context({ s, proj: null, t: 4000 })), null);
    assert.equal(V.compute("grenade", context({ proj: null })), null); //nothing thrown
    const resting = V.compute("grenade", context({ s: { dir: { x: 1, y: 0, z: 0 } }, proj: { x: 5, y: 1, z: 5, dx: 0, dy: 0, dz: 0 } }));
    assert.ok(resting.want.x < 5, "keeps its last direction when it stops");
});

test("the circle round where it went off works going backwards in time too", () => {
    const s = {};
    V.compute("grenade", context({ s, proj: { x: 1, y: 1, z: 1, dx: 1, dy: 0, dz: 0 }, t: 5000 }));
    assert.equal(V.compute("grenade", context({ s, proj: null, t: 4000 })), null);
});

test("the pickers", () => {
    assert.ok(V.pickable().includes("chase") && !V.pickable().includes("bullet"));
    assert.ok(V.isBullet("incoming") && !V.isBullet("chase"));
    assert.ok(!V.cycled().includes("free") && V.cycled().includes("drone"));
    assert.ok(V.following().includes("auto") && !V.following().includes("first") && !V.following().includes("free"));
    assert.equal(V.compute("nonsense", context()), null);
});


const places = V.pois({ map: { width: 40, height: 12, depth: 40 }, spawns: [{ team: "blue", x: 5, y: 1, z: 5 }, { team: "red", x: 35, y: 1, z: 35 }, { team: "free", x: 20, y: 1, z: 6 }], pickups: [{ kind: "Ammo", x: 12.2, y: 1, z: 30 }, { kind: "Grenade", x: 28, y: 3, z: 9 }] });

test("the places: the map, four corners, every spawn and every pickup, each with an id of its own", () => {
    assert.equal(places.length, 1 + 4 + 3 + 2);
    assert.equal(new Set(places.map((p) => p.id)).size, places.length);
    assert.deepEqual(places.map((p) => p.group).filter((g, i, all) => all.indexOf(g) === i), ["Map", "Spawns", "Pickups"]);
    assert.equal(places[0].id, "map");
    for (const p of places) for (const key of ["x", "y", "z", "spin"]) assert.ok(Number.isFinite(p[key]), p.id + " " + key);
    assert.ok(V.pois({ map: null, spawns: [], pickups: [] }).length === 5, "no map known still gives the map and corners");
});

test("a place that is a player-less view: focus and tour need nobody, and are not in the C cycle", () => {
    for (const id of ["focus", "tour"]) { assert.equal(V.needsPlayer(id), false, id); assert.ok(V.pickable().includes(id)); assert.ok(!V.cycled().includes(id)); assert.ok(V.following().includes(id)); };
    assert.equal(V.needsPlayer("chase"), true);
});

test("focus orbits the place at its distance and height, looking at it", () => {
    const poi = places.find((p) => p.id.startsWith("spawn:blue"));
    const a = V.compute("focus", { ...context({ cam: { x: 5.5 + 5, y: 4, z: 5.5 } }), focus: poi, pois: places });
    assert.ok(Math.abs(horizontal(a.want, poi) - poi.dist) < 0.1, "distance " + horizontal(a.want, poi));
    assert.ok(Math.abs(a.want.y - (poi.y + poi.height)) < 1e-9);
    assert.deepEqual(a.look, { x: poi.x, y: poi.y, z: poi.z });
    assert.equal(a.free, true);
});

test("changing place picks up from the bearing the camera is on, so the flight starts where the camera is and there is no jump", () => {
    const s = {};
    const cam = { x: 30, y: 8, z: 12 }, one = places.find((p) => p.id.startsWith("spawn:blue")), two = places.find((p) => p.id.startsWith("spawn:red"));
    V.compute("focus", { ...context({ s, cam }), focus: one, pois: places });
    const first = V.compute("focus", { ...context({ s, cam }), focus: two, pois: places });
    const bearing = Math.atan2(cam.z - two.z, cam.x - two.x), got = Math.atan2(first.want.z - two.z, first.want.x - two.x);
    assert.ok(Math.abs(Math.atan2(Math.sin(bearing - got), Math.cos(bearing - got))) < 0.02, "bearing " + bearing + " vs " + got);
    //and from there it keeps turning, a little a frame
    const next = V.compute("focus", { ...context({ s, cam }), focus: two, pois: places });
    assert.ok(dist(first.want, next.want) < 0.2, "a small step");
});

test("focus with no place (nothing known yet) is the arena view", () => {
    assert.deepEqual(V.compute("focus", { ...context(), focus: null }), V.compute("arena", context()));
});

test("the tour goes through the places on it, one after another, a few seconds each, and comes back round", () => {
    const s = {}, tour = places.filter((p) => p.tour), seen = [];
    for (let frame = 0; frame < 60 * 8 * (tour.length + 1); frame++) {
        const c = { ...context({ s, cam: { x: 0, y: 0, z: 0 } }), dt: 1 / 60, pois: places, opt: { ...opt, tourDwell: 7 } };
        V.compute("tour", c);
        if (seen[seen.length - 1] !== s.poi) seen.push(s.poi);
    };
    assert.ok(seen.length >= tour.length, "got to " + seen.length + " of " + tour.length);
    assert.ok(seen.every((id) => tour.some((p) => p.id === id)), "only places on the tour");
    assert.equal(seen[0], seen[tour.length], "back to the first");
    const slow = V.compute("tour", { ...context({ s: {}, cam: { x: 0, y: 0, z: 0 } }), pois: places });
    assert.ok(slow.moveTau >= 1 && slow.turnTau >= 0.5, "the glide between places is slow");
});

test("the tour keeps to a few spawns and pickups, evenly, however many there are", () => {
    const many = V.pois({ map: { width: 40, height: 12, depth: 40 }, spawns: Array.from({ length: 40 }, (_, i) => ({ team: "free", x: i, y: 1, z: i })), pickups: Array.from({ length: 30 }, (_, i) => ({ kind: "Ammo", x: i, y: 1, z: 2 * i })) });
    assert.ok(many.filter((p) => p.group === "Spawns" && p.tour).length <= 5);
    assert.ok(many.filter((p) => p.group === "Pickups" && p.tour).length <= 5);
    assert.ok(many.filter((p) => p.tour).length >= 7);
});

test("a corner is filmed from the corner, looking at the middle", () => {
    const corner = places.find((p) => p.id === "corner:40,40");
    const a = V.compute("focus", { ...context({ cam: { x: 0, y: 0, z: 0 } }), focus: corner, pois: places });
    assert.ok(a.want.x > 35 && a.want.z > 35 && a.want.y > 12, "up in the corner " + JSON.stringify(a.want));
    assert.ok(Math.abs(a.look.x - 20) < 1e-9 && Math.abs(a.look.z - 20) < 1e-9);
});

console.log(passed + " passed");

test("the grenade camera does not whip round when the grenade bounces about", () => {
    const s = {}, steps = [];
    let last = null;
    for (let i = 0; i < 240; i++) {
        const flip = i % 7 < 3 ? 1 : -1, wobble = Math.sin(i * 1.3) * 0.4; //bouncing and sliding: the way it is going keeps changing
        const proj = { x: 10 + i * 0.01, y: 1, z: 10, dx: 0.12 * flip, dy: wobble * 0.1, dz: 0.09 * -flip };
        const a = V.compute("grenade", { ...context({ s }), proj, dt: 1 / 60 });
        if (last) steps.push(Math.hypot(a.look.x - last.look.x, a.look.z - last.look.z));
        last = a;
    };
    assert.ok(Math.max(...steps.slice(20)) < 0.25, "the look point jumped " + Math.max(...steps.slice(20)));
});

test("when the grenade goes off the camera carries on from where it was, and does not swing across to a fixed place", () => {
    const s = {}, cam = { x: 12, y: 2.8, z: 10 }, proj = { x: 10, y: 2, z: 10, dx: 0.1, dy: 0, dz: 0 };
    V.compute("grenade", { ...context({ s, cam, t: 1000 }), proj, dt: 1 / 60 });
    const first = V.compute("grenade", { ...context({ s, cam, t: 1016 }), proj: null, dt: 1 / 60 });
    assert.ok(dist(first.want, cam) < 0.3, "first frame after the bang is where the camera was: " + dist(first.want, cam));
    let last = first.want, worst = 0;
    for (let t = 1032; t < 2700; t += 16) { const a = V.compute("grenade", { ...context({ s, cam, t }), proj: null, dt: 1 / 60 }); worst = Math.max(worst, dist(a.want, last)); last = a.want };
    assert.ok(worst < 0.2, "no jump along the way: " + worst);
});
