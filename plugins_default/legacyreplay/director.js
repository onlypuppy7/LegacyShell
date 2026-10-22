//legacyshell: replay director (runs in the browser bundle and in node, no dom or babylon in here)
//reads a recording once to find what happened, scores the moments worth showing, and turns the best ones into a list of shots (a reel).
//the browser side that plays a reel is reel.js
import Comm from "#comm";
import { ReplayFormat } from "./format.js";
//

export const ReplayDirector = {
    //how the scores add up. a starting point, everything in here is meant to be tuned
    scoring: {
        kill: 10,
        multikillEach: 15, //per extra kill inside the multikill window
        multikillWindowMs: 4000,
        distanceFrom: 8, //blocks. past this each block is worth distancePerBlock, up to distanceMax
        distancePerBlock: 1,
        distanceMax: 25,
        airborne: 8,
        lowHp: 10, //killer at or under lowHpAt when they got it
        lowHpAt: 30,
        streakEvery: 5, //+5 per this many kills in a row without dying
        revenge: 6, //killed whoever just killed them
        revengeWindowMs: 10000,
        victimStreak: 1, //per kill the victim had in a row
        posthumous: 30, //the shooter was already dead when the bullet landed
        marker: 25, //a player marked it
        repeatPenalty: 12, //per time the same killer was already picked
    },

    bulletMin: { hype: 3, chill: 5 }, //blocks. closer than this there is nothing to follow
    bulletSpeed: 45, //blocks a second, when the real flight time can't be worked out
    leadInMs: 2500,
    tailMs: 2000,

    int16: function (data, at) {
        return ((data[at] | (data[at + 1] << 8)) << 16 >> 16) / 300; //core's unPackFloat
    },

    //a recording -> what happened. { kills, fires, marks, tracks, hits }
    index: function (records, header) {
        const F = ReplayFormat, T = F.Type, D = ReplayDirector;
        const entry = F.syncEntrySize(header.syncFrames);
        const index = { kills: [], fires: [], marks: [], hits: [], tracks: {}, duration: header.duration || 0 };

        const track = (id) => index.tracks[id] || (index.tracks[id] = { t: [], x: [], y: [], z: [], dy: [] });

        for (const r of records) {
            index.duration = Math.max(index.duration, r.tMs);

            if (r.type === T.sync) {
                for (let base = 0; base + entry <= r.data.length; base += entry) {
                    const tr = track(r.data[base + 1]);
                    tr.t.push(r.tMs);
                    tr.x.push(D.int16(r.data, base + 3));
                    tr.y.push(D.int16(r.data, base + 5));
                    tr.z.push(D.int16(r.data, base + 7));
                    tr.dy.push(D.int16(r.data, base + 11));
                };
            } else if (r.type === T.marker) {
                if (r.data.kind === "kill") index.kills.push({ tMs: r.tMs, killer: r.data.a, victim: r.data.b });
                else index.marks.push({ tMs: r.tMs, label: r.data.label });
            } else if (r.type === T.packets) {
                D.walk(r.data, (op, d, i) => {
                    if (op === Comm.Code.fire) index.fires.push({ tMs: r.tMs, shooter: d[i + 1], pos: [D.int16(d, i + 2), D.int16(d, i + 4), D.int16(d, i + 6)], dir: [D.int16(d, i + 8), D.int16(d, i + 10), D.int16(d, i + 12)] });
                    else if (op === Comm.Code.hitThem) index.hits.push({ tMs: r.tMs, id: d[i + 1], hp: d[i + 2] });
                });
            };
        };

        index.kills.sort((a, b) => a.tMs - b.tMs);
        return index;
    },

    //commands we know the length of. anything else and the rest of the record is skipped, never guessed at
    sizes: function () {
        return { [Comm.Code.fire]: 15, [Comm.Code.die]: 4, [Comm.Code.hitThem]: 9 };
    },

    walk: function (data, onCommand) {
        const sizes = ReplayDirector.sizes();
        let i = 0;
        while (i < data.length) {
            const size = sizes[data[i]];
            if (!size || i + size > data.length) return;
            onCommand(data[i], data, i);
            i += size;
        };
    },

    //where a player was at tMs (the last sync at or before it)
    at: function (index, id, tMs) {
        const tr = index.tracks[id];
        if (!tr || !tr.t.length) return null;
        let lo = 0, hi = tr.t.length - 1, found = -1;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (tr.t[mid] <= tMs) { found = mid; lo = mid + 1 } else hi = mid - 1;
        };
        if (found < 0) found = 0;
        return { x: tr.x[found], y: tr.y[found], z: tr.z[found], dy: tr.dy[found], tMs: tr.t[found] };
    },

    //the shot that did it: the killer's fire whose line passes closest to where the victim was, and whose flight time fits the gap before the kill
    fatalFire: function (index, kill) {
        const D = ReplayDirector;
        const victim = D.at(index, kill.victim, kill.tMs);
        if (!victim) return null;
        let best = null;

        for (const fire of index.fires) {
            if (fire.shooter !== kill.killer || fire.tMs > kill.tMs || fire.tMs < kill.tMs - 3000) continue;
            const dx = victim.x - fire.pos[0], dy = victim.y + 0.3 - fire.pos[1], dz = victim.z - fire.pos[2];
            const len = Math.hypot(...fire.dir) || 1;
            const along = (dx * fire.dir[0] + dy * fire.dir[1] + dz * fire.dir[2]) / len; //how far down the line the victim is
            if (along < 0) continue;
            const off = Math.hypot(dx - fire.dir[0] / len * along, dy - fire.dir[1] / len * along, dz - fire.dir[2] / len * along);
            const flightErr = Math.abs((kill.tMs - fire.tMs) / 1000 - along / D.bulletSpeed);
            const cost = off + flightErr * 6; //a miss by a block and a flight time off by a sixth of a second are about as bad
            if (off < 2.5 && (!best || cost < best.cost)) best = { fire, cost, distance: along, victim };
        };
        return best;
    },

    //every kill with what made it good. moments are built from these
    analyse: function (index) {
        const D = ReplayDirector, S = D.scoring;
        const streaks = {}, hp = {}, diedAt = {}, lastKilledBy = {};
        const out = [];

        let hitAt = 0;

        for (const kill of index.kills) {
            while (hitAt < index.hits.length && index.hits[hitAt].tMs <= kill.tMs) { hp[index.hits[hitAt].id] = index.hits[hitAt].hp; hitAt++ };

            const fatal = D.fatalFire(index, kill);
            const killerPos = D.at(index, kill.killer, kill.tMs), victimPos = D.at(index, kill.victim, kill.tMs);
            const selfKill = kill.killer === kill.victim || kill.killer === 255 || !killerPos;
            const distance = !selfKill && killerPos && victimPos ? Math.hypot(killerPos.x - victimPos.x, killerPos.y - victimPos.y, killerPos.z - victimPos.z) : 0;

            const analysed = { ...kill, selfKill, distance, fatal, why: [], score: 0, killerStreak: 0 };

            if (!selfKill) {
                streaks[kill.killer] = (streaks[kill.killer] || 0) + 1;
                analysed.killerStreak = streaks[kill.killer];
                analysed.score += S.kill;
                analysed.why.push("kill");

                if (distance > S.distanceFrom) { analysed.score += Math.min(S.distanceMax, (distance - S.distanceFrom) * S.distancePerBlock); analysed.why.push("long range " + Math.round(distance) + " blocks") };
                if (killerPos && Math.abs(killerPos.dy) > 0.05) { analysed.score += S.airborne; analysed.why.push("in the air") };
                if ((hp[kill.killer] ?? 100) <= S.lowHpAt) { analysed.score += S.lowHp; analysed.why.push("low health") };
                if (analysed.killerStreak % S.streakEvery === 0) { analysed.score += 5 * (analysed.killerStreak / S.streakEvery); analysed.why.push(analysed.killerStreak + " in a row") };
                if (lastKilledBy[kill.killer] && lastKilledBy[kill.killer].by === kill.victim && kill.tMs - lastKilledBy[kill.killer].tMs < S.revengeWindowMs) { analysed.score += S.revenge; analysed.why.push("revenge") };
                analysed.score += (analysed.victimStreak = streaks[kill.victim] || 0) * S.victimStreak;
                if (analysed.victimStreak >= 3) analysed.why.push("ended a " + analysed.victimStreak + " streak");
                if (fatal && diedAt[kill.killer] !== undefined && diedAt[kill.killer] > fatal.fire.tMs && diedAt[kill.killer] <= kill.tMs + 200) { analysed.score += S.posthumous; analysed.why.push("killed from beyond"); analysed.posthumous = true };
            };

            streaks[kill.victim] = 0;
            diedAt[kill.victim] = kill.tMs;
            hp[kill.victim] = 100;
            lastKilledBy[kill.victim] = { by: kill.killer, tMs: kill.tMs };
            out.push(analysed);
        };

        return out;
    },

    //kills that follow each other inside the multikill window become one moment, with the multikill bonus on top. a marker a player dropped is a moment of its own
    moments: function (index) {
        const D = ReplayDirector, S = D.scoring;
        const kills = D.analyse(index).filter((k) => !k.selfKill);
        const moments = [];

        for (const kill of kills) {
            const last = moments[moments.length - 1];
            if (last && last.killer === kill.killer && kill.tMs - last.kills[last.kills.length - 1].tMs <= S.multikillWindowMs) {
                last.kills.push(kill);
                last.score += kill.score + S.multikillEach;
                last.end = kill.tMs + D.tailMs;
                last.why.push("multikill x" + last.kills.length);
            } else {
                moments.push({ killer: kill.killer, kills: [kill], start: Math.max(0, kill.tMs - D.leadInMs), end: kill.tMs + D.tailMs, score: kill.score, why: [...kill.why] });
            };
        };

        for (const mark of index.marks) {
            moments.push({ killer: null, kills: [], marked: true, start: Math.max(0, mark.tMs - D.leadInMs), end: mark.tMs + D.tailMs, score: S.marker, why: ["marked: " + (mark.label || "a marker")] });
        };

        return moments.sort((a, b) => a.start - b.start);
    },

    //who = "all" or a player id, length in ms, style = chill | hype. the best moments that fit, in time order, never the same shooter over and over
    pick: function (moments, options) {
        const D = ReplayDirector, S = D.scoring;
        const who = options.who ?? "all", budget = options.lengthMs ?? 60000;
        const pool = moments.filter((m) => who === "all" || m.killer === who || m.kills.some((k) => k.victim === who));
        const taken = [], used = {};
        let total = 0;

        for (;;) {
            let best = null;
            for (const m of pool) {
                if (taken.includes(m)) continue;
                const length = m.end - m.start;
                if (total + length > budget) continue;
                if (taken.some((t) => t.start < m.end && m.start < t.end)) continue; //overlapping a moment already in
                const score = m.score - (used[m.killer] || 0) * S.repeatPenalty;
                if (!best || score > best.score) best = { m, score };
            };
            if (!best) break;
            taken.push(best.m);
            total += best.m.end - best.m.start;
            used[best.m.killer] = (used[best.m.killer] || 0) + 1;
        };

        return taken.sort((a, b) => a.start - b.start);
    },

    //a shot: [start, end] in replay time, what to look at, how, and a speed curve of [time, rate] points eased between
    //views: chase and orbit and first (a player), bullet (a bullet in flight, see reel.js)
    shotsFor: function (moment, style, previousPreset) {
        const D = ReplayDirector;
        const hype = style === "hype";
        const first = moment.kills[0], last = moment.kills[moment.kills.length - 1];
        const shots = [];
        let preset;

        if (moment.marked) {
            preset = "marked";
            shots.push({ start: moment.start, end: moment.end, view: "free", target: null, speed: [[moment.start, 1]], why: moment.why.join(", ") });
            return { preset, shots };
        };

        const min = hype ? D.bulletMin.hype : D.bulletMin.chill;
        const bulletOk = first.fatal && first.fatal.distance >= min && moment.kills.length === 1;
        const lastBullet = last !== first && last.fatal && last.fatal.distance >= min && last.fatal.fire.tMs > first.tMs + 400; //the last kill of a multikill, if it was a shot worth riding
        if (moment.kills.length >= 2) preset = lastBullet && (hype || previousPreset !== "bullet follow") ? "multikill, then the bullet" : "multikill";
        else if (bulletOk && (hype || previousPreset !== "bullet follow")) preset = "bullet follow";
        else preset = previousPreset === "chase and orbit" ? "chase" : "chase and orbit";

        const dip = hype ? 0.15 : 0.4;

        if (preset === "bullet follow") {
            const fire = first.fatal.fire, tFire = fire.tMs, tHit = first.tMs;
            const flight = Math.max(80, tHit - tFire);
            shots.push({ start: moment.start, end: tFire - 250, view: "chase", target: first.killer, speed: [[moment.start, 1]], why: "line up the shot" });
            shots.push({
                start: tFire - 250, end: tHit + 1300, view: "bullet", target: first.killer, victim: first.victim,
                bullet: { shooter: first.killer, victim: first.victim, tFire, tHit, from: fire.pos, distance: first.fatal.distance },
                speed: D.bulletRate(tFire, tHit, hype, first.fatal.distance), fx: "cinematic",
                why: "follow the bullet (" + Math.round(first.fatal.distance) + " blocks, " + flight + "ms)",
            });
            const snipe = D.isSnipe(tFire, tHit, first.fatal.distance);
            shots.push({ start: tHit + 1300, end: Math.max(tHit + 1300, moment.end), view: "orbit", target: first.victim, speed: [[tHit + 1300, snipe ? 2 : 1]], fx: snipe && hype ? "hype" : "", why: "where it landed" });
        } else if (preset === "multikill, then the bullet") {
            const fire = last.fatal.fire, tFire = fire.tMs, tHit = last.tMs;
            const speed = [[moment.start, 1]];
            for (const kill of moment.kills.slice(0, -1)) speed.push([kill.tMs - 250, 1], [kill.tMs, dip], [kill.tMs + 500, 1]);
            shots.push({ start: moment.start, end: tFire - 250, view: "chase", target: moment.killer, speed, why: moment.kills.length + " kills in a row" });
            shots.push({
                start: tFire - 250, end: tHit + 1300, view: "bullet", target: last.killer, victim: last.victim,
                bullet: { shooter: last.killer, victim: last.victim, tFire, tHit, from: fire.pos, distance: last.fatal.distance },
                speed: D.bulletRate(tFire, tHit, hype, last.fatal.distance), fx: "cinematic",
                why: "the last kill, following the bullet (" + Math.round(last.fatal.distance) + " blocks)",
            });
            const snipe = D.isSnipe(tFire, tHit, last.fatal.distance);
            shots.push({ start: tHit + 1300, end: Math.max(tHit + 1300, moment.end), view: "orbit", target: last.victim, speed: [[tHit + 1300, snipe ? 2 : 1]], fx: snipe && hype ? "hype" : "", why: "where it landed" });
        } else if (preset === "multikill") {
            const speed = [[moment.start, 1]];
            for (const kill of moment.kills) speed.push([kill.tMs - 250, 1], [kill.tMs, dip], [kill.tMs + 500, 1]);
            shots.push({ start: moment.start, end: moment.end, view: "chase", target: moment.killer, speed, why: moment.kills.length + " kills in a row" });
        } else if (preset === "chase and orbit") {
            shots.push({ start: moment.start, end: first.tMs + 150, view: "chase", target: first.killer, speed: [[moment.start, 1], [first.tMs - 300, 1], [first.tMs, dip]], why: "the kill" });
            shots.push({ start: first.tMs + 150, end: moment.end, view: "orbit", target: first.victim, speed: [[first.tMs + 150, dip], [first.tMs + 900, 1]], why: "the aftermath" });
        } else {
            shots.push({ start: moment.start, end: moment.end, view: "first", target: first.killer, speed: [[moment.start, 1], [first.tMs - 200, 1], [first.tMs, dip], [first.tMs + 700, 1]], why: "their view" });
        };

        return { preset, shots };
    },

    //why a moment didnt get the bullet shot, for the highlights dialog (empty when it did or when it doesnt apply)
    bulletReason: function (moment, style) {
        const D = ReplayDirector, min = style === "hype" ? D.bulletMin.hype : D.bulletMin.chill;
        if (moment.marked) return "";
        const target = moment.kills[moment.kills.length - 1];
        if (!target.fatal) return "no bullet shot: the bullet that did it wasn't found in the recording";
        if (target.fatal.distance < min) return "no bullet shot: only " + Math.round(target.fatal.distance) + " blocks, it needs " + min;
        return "";
    },

    //the whole thing: options { who, lengthMs, style }. returns { shots, moments, total }
    reel: function (records, header, options) {
        const D = ReplayDirector;
        const index = D.index(records, header);
        const moments = D.moments(index);
        const picked = D.pick(moments, options);
        const shots = [];
        let previous = null;

        picked.forEach((moment, i) => {
            const made = D.shotsFor(moment, options.style, previous);
            previous = made.preset;
            made.shots.forEach((shot, n) => shots.push({ ...shot, moment: i, preset: made.preset, cut: n === 0 }));
        });

        return { shots, moments: picked, total: picked.reduce((n, m) => n + m.end - m.start, 0), found: moments.length, index };
    },

    //a long shot (a sniper kill): the bullet is in the air long enough that a crawl would drag, so the whole shot runs at one steady slow rate instead, and the orbit after it makes the time back
    isSnipe: function (tFire, tHit, distance) {
        return tHit - tFire >= 150 || distance >= 10;
    },

    bulletRate: function (tFire, tHit, hype, distance) {
        const D = ReplayDirector;
        if (!D.isSnipe(tFire, tHit, distance || 0)) return D.bulletTime(tFire, tHit, hype);
        const flight = Math.max(tHit - tFire, (distance || 0) / D.bulletSpeed * 1000); //the time in the air, or what the distance says it should be if the recording's times are short
        const rate = Math.max(0.2, Math.min(0.5, flight / 700)); //the flight lasts about 0.7s on screen
        return [[tFire - 250, rate], [tHit + 1300, rate]];
    },

    //the speed curve of a bullet shot: normal, then down to a crawl as the bullet leaves, a crawl through the flight, and back up quickly after it lands.
    //slow motion makes everything after it last longer in real time (0.08x stretches a quarter second to three), so the way back up is short
    bulletTime: function (tFire, tHit, hype) {
        const crawl = hype ? 0.08 : 0.15;
        return [[tFire - 250, 1], [tFire - 60, 1], [tFire + 80, crawl], [Math.max(tFire + 100, tHit - 40), crawl], [tHit + 120, crawl], [tHit + 450, 1]];
    },

    //---- editing and saving. a reel is { v, name, options, shots }. the shots are plain data, so the editor changes them directly and these keep them valid

    views: ["first", "pov", "chase", "shoulder", "side", "low", "top", "orbit", "security", "free", "bullet"],
    looks: ["clean", "cinematic", "hype", "retro"],

    //how fast a shot plays, by name. "as made" keeps whatever curve the director gave it
    speedPresets: {
        normal: (shot) => [[shot.start, 1]],
        slow: (shot) => [[shot.start, 0.35]],
        crawl: (shot) => [[shot.start, 0.1]],
        ramp: (shot) => [[shot.start, 1], [shot.start + (shot.end - shot.start) * 0.35, 0.2], [shot.start + (shot.end - shot.start) * 0.8, 0.2], [shot.end, 1]],
        fast: (shot) => [[shot.start, 2]],
    },

    //which of the named speeds a shot is on (for the editor's picker), or "as made"
    speedName: function (shot) {
        const D = ReplayDirector;
        for (const name of Object.keys(D.speedPresets)) {
            const made = D.speedPresets[name](shot);
            if (made.length === shot.speed.length && made.every((p, i) => Math.abs(p[0] - shot.speed[i][0]) < 1 && Math.abs(p[1] - shot.speed[i][1]) < 1e-6)) return name;
        };
        return "as made";
    },

    //a shot's speed curve after its times were changed: points outside it are dropped, and it starts and ends with the rate it had there
    fitSpeed: function (shot) {
        const D = ReplayDirector;
        const curve = shot.speed.slice().sort((a, b) => a[0] - b[0]);
        const first = D.rate(curve, shot.start), last = D.rate(curve, shot.end);
        shot.speed = [[shot.start, first], ...curve.filter((p) => p[0] > shot.start && p[0] < shot.end), ...(shot.end > shot.start ? [[shot.end, last]] : [])];
        return shot;
    },

    //a shot that picks up where the one before it ended just changes the camera, anything else is a cut
    relink: function (shots) {
        shots.forEach((shot, i) => { shot.cut = i === 0 || Math.abs(shots[i - 1].end - shot.start) > 600 });
        return shots;
    },

    newId: function (shots) {
        return shots.reduce((n, s) => Math.max(n, s.id || 0), 0) + 1;
    },

    //a shot from the camera as it is: view, who, and a time range
    makeShot: function (shots, start, end, view, target) {
        const shot = { id: ReplayDirector.newId(shots), start, end, view, target, speed: [[start, 1]], fx: "", cut: true, why: "added by hand", preset: "by hand", moment: -1 };
        return shot;
    },

    //anything that came from a file (or storage) is untrusted. this returns a clean reel or throws, and never trusts a field it didnt check
    cleanReel: function (raw, header) {
        const D = ReplayDirector, F = ReplayFormat;
        if (!F.isPlainObject(raw) || raw.v !== 1) throw new Error("not a reel (or a newer version)");
        if (!Array.isArray(raw.shots) || raw.shots.length > 200) throw new Error("bad shot list");
        const duration = Math.max(header.duration || 0, 1);
        const num = (n, lo, hi, def) => Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
        const id8 = (n) => F.isInt(n, 0, 255) ? n : null;

        const shots = raw.shots.map((s, i) => {
            if (!F.isPlainObject(s)) throw new Error("bad shot " + (i + 1));
            if (!D.views.includes(s.view)) throw new Error("bad view in shot " + (i + 1));
            const start = num(s.start, 0, duration, 0), end = num(s.end, 0, duration, start);
            if (end <= start) throw new Error("shot " + (i + 1) + " has no length");
            const shot = {
                id: F.isInt(s.id, 1, 1e6) ? s.id : i + 1, start, end, view: s.view, target: id8(s.target),
                speed: Array.isArray(s.speed) ? s.speed.slice(0, 32).filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])).map((p) => [num(p[0], 0, duration, 0), num(p[1], 0.05, 8, 1)]) : [],
                fx: D.looks.includes(s.fx) ? s.fx : "", cut: !!s.cut, smooth: !!s.smooth,
                why: F.cleanString(s.why, 80) ?? "", preset: F.cleanString(s.preset, 40) ?? "", moment: F.isInt(s.moment, -1, 1e4) ? s.moment : -1,
            };
            if (!shot.speed.length) shot.speed = [[start, 1]];
            if (s.victim !== undefined) shot.victim = id8(s.victim);
            if (s.view === "bullet") {
                const b = s.bullet;
                if (!F.isPlainObject(b) || !Array.isArray(b.from) || b.from.length !== 3 || !b.from.every(Number.isFinite)) throw new Error("bad bullet in shot " + (i + 1));
                shot.bullet = { shooter: id8(b.shooter), victim: id8(b.victim), tFire: num(b.tFire, 0, duration, start), tHit: num(b.tHit, 0, duration, end), from: b.from.map((n) => num(n, -1e4, 1e4, 0)), distance: num(b.distance, 0, 1e4, 0) };
                if (shot.bullet.shooter === null || shot.bullet.victim === null || shot.bullet.tHit <= shot.bullet.tFire) throw new Error("bad bullet in shot " + (i + 1));
            };
            return D.fitSpeed(shot);
        });

        D.relink(shots);
        return { v: 1, name: F.cleanString(raw.name, 60) ?? "Reel", created: Number.isFinite(raw.created) ? raw.created : 0, options: F.isPlainObject(raw.options) ? { who: raw.options.who === "all" || F.isInt(raw.options.who, 0, 255) ? raw.options.who : "all", lengthMs: num(raw.options.lengthMs, 1000, 3600e3, 60e3), style: raw.options.style === "chill" ? "chill" : "hype", look: D.looks.includes(raw.options.look) ? raw.options.look : "clean" } : { who: "all", lengthMs: 60e3, style: "hype", look: "clean" }, shots };
    },

    //a generated reel in the saved shape
    toReel: function (generated, options, name) {
        const D = ReplayDirector;
        const shots = generated.shots.map((s, i) => ({ ...s, id: i + 1, fx: s.fx || "" }));
        return { v: 1, name: name || "Reel", created: Date.now(), options: { ...options, look: options.look || "clean" }, shots };
    },

    //the speed at a replay time, eased between the curve's points (smoothstep, so a ramp has no corners)
    rate: function (curve, tMs) {
        if (!curve.length || tMs <= curve[0][0]) return curve.length ? curve[0][1] : 1;
        for (let i = 1; i < curve.length; i++) {
            if (tMs <= curve[i][0]) {
                const [t0, r0] = curve[i - 1], [t1, r1] = curve[i];
                const u = t1 > t0 ? (tMs - t0) / (t1 - t0) : 1;
                return r0 + (r1 - r0) * (u * u * (3 - 2 * u));
            };
        };
        return curve[curve.length - 1][1];
    },
};
