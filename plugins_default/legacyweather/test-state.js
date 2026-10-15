// Self-checks for the pure weather/time state logic. Run: node plugins_default/legacyweather/test-state.js
// (there's no test runner in this repo, so this is just assertions that exit non-zero on failure.)
import assert from 'node:assert/strict';
import { WeatherState as W } from './weatherState.js';

var tests = 0;
var test = (name, fn) => { fn(); tests++; console.log("ok -", name); };

test("a bare number scales every part of a layer", () => {
    var r = W.resolveLayer("rain", 0.5);
    assert.ok(r.ok);
    assert.equal(r.value.intensity, 0.5);
    assert.equal(r.value.drops, 0.5);
    assert.ok(r.value.wetness > r.value.drops); //wetness curve is steeper than drops
});

test("object form overrides single parts and defaults the rest from the intensity", () => {
    var r = W.resolveLayer("storm", { intensity: 0.5, thunder: 0.1 });
    assert.equal(r.value.thunder, 0.1);
    assert.equal(r.value.clouds, 0.5);
    assert.equal(W.resolveLayer("storm", { thunder: 0.1 }).value.intensity, W.DEFAULT_INTENSITY);
});

test("values are clamped to each part's range", () => {
    assert.equal(W.resolveLayer("rain", 7).value.intensity, 1);
    assert.equal(W.resolveLayer("storm", { distance: 9999 }).value.distance, 255); //the most a packet byte holds
    assert.equal(W.resolveLayer("storm", { distance: -5 }).value.distance, 0);
    assert.equal(W.resolveLayer("storm", { distance: 1 }).value.distance, 1); //no invented minimum
    assert.equal(W.resolveLayer("storm", { thunder: 1 }).value.thunder, 1);
});

test("unknown parts, layers and non-numbers are rejected with a message", () => {
    assert.match(W.resolveLayer("rain", { bogus: 1 }).error, /Unknown rain part "bogus"/);
    assert.match(W.resolveLayer("hail", 1).error, /Unknown layer/);
    assert.ok(!W.resolveLayer("rain", { drops: "lots" }).ok);
    assert.ok(!W.resolveLayer("rain", NaN).ok);
});

test("re-resolving a resolved state changes nothing (anything may write either form)", () => {
    var once = W.sanitizeWeather({ rain: 0.6, storm: { thunder: 0.2 }, snow: true, wind: { strength: 0.3, direction: 90 } });
    assert.deepEqual(W.sanitizeWeather(once), once);
    var time = W.sanitizeTime({ preset: "night", sky: 0.3 });
    assert.deepEqual(W.sanitizeTime(time), time);
});

test("garbage state falls back to off instead of throwing", () => {
    var w = W.sanitizeWeather({ rain: { bogus: 1 }, storm: "nope", wind: [1, 2] });
    assert.equal(w.rain.drops, 0);
    assert.equal(w.storm.clouds, 0);
    assert.deepEqual(w.wind, { strength: 0, direction: 0 });
    assert.equal(W.sanitizeTime("teatime").preset, "day");
});

test("a default room is fully off", () => {
    var w = W.defaultWeather();
    for (var name of W.layerNames()) assert.ok(!W.isLayerActive(name, w[name]), name + " should be off");
});

test("/weather set parsing", () => {
    var r = W.parseWeatherSet("storm 0.5 thunder=0.1 distance=80 seconds=20");
    assert.ok(r.ok);
    assert.equal(r.layer, "storm");
    assert.equal(r.value.thunder, 0.1);
    assert.equal(r.value.distance, 80);
    assert.equal(r.seconds, 20);
    assert.equal(W.parseWeatherSet("rain").value.intensity, W.DEFAULT_INTENSITY);
    assert.equal(W.parseWeatherSet("rain off").value.intensity, 0);
    assert.deepEqual(W.parseWeatherSet("wind 0.4 90").value, { strength: 0.4, direction: 90 });
    assert.ok(!W.parseWeatherSet("").ok);
    assert.ok(!W.parseWeatherSet("rain 0.5 bad=1").ok);
    assert.ok(!W.parseWeatherSet("rain lots").ok);
});

test("/time set parsing", () => {
    var r = W.parseTimeSet("night sky=0.2 fogColor=#112233 seconds=10");
    assert.ok(r.ok);
    assert.equal(r.value.preset, "night");
    assert.equal(r.value.sky, 0.2);
    assert.equal(r.value.transitionSecs, 10);
    assert.deepEqual(r.value.fogColor, [0.067, 0.133, 0.2]);
    assert.equal(W.parseTimeSet("day fogColor=none").value.fogColor, null);
    assert.ok(!W.parseTimeSet("teatime").ok);
    assert.ok(!W.parseTimeSet("night sun=red").ok);
});

test("automatic weather: every step it can pick is valid and eventually varied", () => {
    var seen = new Set();
    for (var i = 0; i < 400; i++) {
        var step = W.cycleStep(Math.random, i % 2 === 0);
        seen.add(step.name);
        var resolved = W.sanitizeWeather(Object.assign({}, step.weather, { transitionSecs: step.transitionSecs }));
        //nothing the cycle picks may be silently dropped by sanitising
        for (var layer of W.layerNames()) {
            var again = W.resolveLayer(layer, step.weather[layer]);
            assert.ok(again.ok, `${step.name}: ${layer} rejected: ${again.error}`);
        };
        assert.ok(step.transitionSecs >= 20 && step.transitionSecs <= 45);
        assert.ok(step.holdSecs >= 60 && step.holdSecs <= 300);
        assert.ok(resolved.wind.strength >= 0 && resolved.wind.strength <= 1);
        if (step.name === "snow") assert.ok(W.isLayerActive("snow", resolved.snow));
    };
    for (var n of ["clear", "overcast", "rain", "thunderstorm", "snow"]) assert.ok(seen.has(n), n + " never picked");
    //snow only when allowed
    for (var j = 0; j < 300; j++) assert.notEqual(W.cycleStep(Math.random, false).name, "snow");
});

test("automatic weather only strikes lightning in thunderstorms", () => {
    for (var i = 0; i < 300; i++) {
        var step = W.cycleStep(Math.random, true);
        var storm = W.resolveLayer("storm", step.weather.storm).value;
        if (step.name !== "thunderstorm") assert.equal(storm.lightning, 0, step.name + " should be quiet");
    };
});

test("limits are generous: only real limits remain", () => {
    //parts that are meaningful above 1 take values above 1
    assert.equal(W.resolveLayer("storm", { lightning: 8 }).value.lightning, 8);
    assert.equal(W.resolveLayer("storm", { fog: 4 }).value.fog, 4);
    assert.equal(W.resolveLayer("rain", { streak: 3 }).value.streak, 3);
    assert.equal(W.resolveLayer("snow", { size: 5 }).value.size, 5);
    assert.equal(W.resolveWind({ strength: 3 }).value.strength, 3);
    //direction wraps instead of clamping
    assert.equal(W.resolveWind({ direction: 370 }).value.direction, 10);
    assert.equal(W.resolveWind({ direction: -90 }).value.direction, 270);
    //time: brighter than normal is allowed, and so are long transitions
    assert.equal(W.parseTimeSet("day sky=2 fogMult=20").value.sky, 2);
    assert.equal(W.parseTimeSet("day fogMult=20").value.fogMult, 20);
    assert.deepEqual(W.parseTimeSet("day sun=3,2,1").value.sun, [3, 2, 1]);
    assert.equal(W.parseTimeSet("night seconds=1800").value.transitionSecs, 1800);
    //but volumes and the like still can't go negative, and nonsense is still rejected
    assert.equal(W.resolveLayer("rain", { drops: -3 }).value.drops, 0);
    assert.ok(!W.resolveLayer("storm", { thunder: "loud" }).ok);
});

test("how fast the ground dries is part of the state, defaults slow, and is clamped", () => {
    assert.equal(W.sanitizeWeather({}).dryingSecs, W.DEFAULT_DRYING_SECS);
    assert.equal(W.sanitizeWeather({ dryingSecs: 0 }).dryingSecs, 0); //0 = dries instantly
    assert.equal(W.sanitizeWeather({ dryingSecs: 99999 }).dryingSecs, W.MAX_TRANSITION_SECS);
    assert.equal(W.sanitizeWeather({ dryingSecs: "soon" }).dryingSecs, W.DEFAULT_DRYING_SECS); //garbage falls back to its own default instead of throwing
    //the automatic cycle never sets it, so natural rain endings keep the slow default
    assert.equal(W.sanitizeWeather(W.cycleStep(Math.random, true).weather).dryingSecs, W.DEFAULT_DRYING_SECS);
});

// phase of the day at which the sun is at a given elevation, on the rising (morning) or setting (evening) side
var phaseAtElevation = (deg, rising) => {
    var asin = Math.asin(Math.sin(deg * Math.PI / 180));
    return rising ? 0.25 + asin / (2 * Math.PI) : 0.25 + (Math.PI - asin) / (2 * Math.PI);
};
var fractionOfDay = (test, daylight) => { var n = 100000, c = 0; for (var i = 0; i < n; i++) if (test(W.sunElevation(i / n, daylight))) c++; return c / n; };

test("the day is weighted by the sun's real path: night ~40%, twilight ~5% each, daylight 50%, golden hour ~2.8% each", () => {
    var near = (a, b) => Math.abs(a - b) < 0.003;
    assert.ok(near(fractionOfDay(e => e < -18), 0.40), "night (sun more than 18 degrees down)");
    assert.ok(near(fractionOfDay(e => e >= -18 && e < 0), 0.10), "both twilights together");
    assert.ok(near(fractionOfDay(e => e >= 0), 0.50), "sun above the horizon");
    assert.ok(near(fractionOfDay(e => e >= 0 && e < 10), 2 * 0.0278), "golden hour, both sides");
    assert.ok(near(fractionOfDay(e => e >= 30), 1 / 3), "high sun (above 30 degrees) is a third of the day");
});

test("daylight=season really lengthens or shortens the day", () => {
    var day = d => fractionOfDay(e => e >= 0, d);
    assert.ok(day(0.3) > 0.55 && day(-0.3) < 0.45, `summer ${day(0.3)}, winter ${day(-0.3)}`);
    assert.ok(Math.abs(day(0) - 0.5) < 0.003);
    assert.equal(W.parseTimeSet("auto daylight=0.4").value.daylight, 0.4);
    assert.equal(W.parseTimeSet("auto daylight=9").value.daylight, 1); //it's a sine's offset, so 1 is the real limit
});

test("every look hits its preset exactly at its elevation (both sides of the day)", () => {
    var map = [0.4, 0.5, 0.6];
    for (var rising of [true, false]) {
        for (var [deg, name] of W.autoElevations[rising ? "rising" : "setting"]) {
            if (Math.abs(deg) >= 90) continue;
            var at = W.timeAt(phaseAtElevation(deg, rising), map), pre = W.timePresets[name];
            assert.deepEqual(at.sun.map(v => +v.toFixed(3)), pre.sun, `${name} sun at ${deg} degrees ${rising ? "rising" : "setting"}`);
            assert.equal(+at.sky.toFixed(3), pre.sky, name + " sky");
            assert.deepEqual(at.fogColor.map(v => +v.toFixed(3)), pre.fogColor || map, name + " fog");
        };
    };
});

test("morning and evening differ: dawn comes before sunrise, dusk after sunset", () => {
    assert.equal(W.phaseName(phaseAtElevation(-6, true)), "dawn");
    assert.equal(W.phaseName(phaseAtElevation(-6, false)), "dusk");
    assert.equal(W.phaseName(phaseAtElevation(0, true)), "sunrise");
    assert.equal(W.phaseName(phaseAtElevation(0, false)), "sunset");
    assert.equal(W.phaseName(0.5), "day"); assert.equal(W.phaseName(0), "night");
    assert.ok(W.timeAt(0.25).glow >= W.timeAt(0.5).glow);
});

test("linger stretches the horizon looks without changing day or night", () => {
    var glowing = l => { var n = 20000, c = 0; for (var i = 0; i < n; i++) if (W.timeAt(i / n, null, 0, l).glow > 0.3) c++; return c / n; };
    assert.ok(glowing(3) > glowing(1) * 1.5, `${glowing(3)} vs ${glowing(1)}`);
    assert.deepEqual(W.timeAt(0.5, null, 0, 3).sun, W.timePresets.day.sun); //noon is noon whatever
    assert.deepEqual(W.timeAt(0, null, 0, 3).sun, W.timePresets.night.sun);
    assert.equal(W.parseTimeSet("auto linger=2").value.linger, 2);
});

test("the day cycle loops and never jumps: neighbouring moments are almost identical", () => {
    var map = [0.5, 0.5, 0.5];
    assert.deepEqual(W.timeAt(0, map), W.timeAt(1, map)); //midnight is midnight whichever way you reach it
    assert.deepEqual(W.timeAt(0.3, map), W.timeAt(1.3, map)); //any phase wraps
    for (var [daylight, linger] of [[0, 1], [0.4, 1], [-0.4, 2], [0, 4]]) {
        var prev = W.timeAt(0, map, daylight, linger), worst = 0;
        for (var p = 0.0005; p <= 1.0001; p += 0.0005) {
            var now = W.timeAt(p, map, daylight, linger);
            for (var key of ["sky", "stars", "glow", "fogMult"]) worst = Math.max(worst, Math.abs(now[key] - prev[key]));
            for (var key of ["sun", "fogColor", "glowColor"]) for (var c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(now[key][c] - prev[key][c]));
            prev = now;
        };
        assert.ok(worst < 0.05, `daylight ${daylight} linger ${linger}: biggest step ${worst}`);
    };
});

test("brightest at noon, darkest at night, stars only at night", () => {
    var noon = W.timeAt(0.5), night = W.timeAt(0), sunrise = W.timeAt(0.25);
    assert.ok(noon.sky > sunrise.sky && sunrise.sky > night.sky);
    assert.equal(noon.stars, 0); assert.equal(night.stars, 1);
    assert.ok(sunrise.glow > noon.glow, "the horizon glows at sunrise but not at noon");
});

test("the sun rises toward +x, sets toward -x, is overhead at noon, and the moon is opposite", () => {
    var near = (a, b) => Math.abs(a - b) < 0.05;
    var rise = W.sunDir(0.25), noon = W.sunDir(0.5), set = W.sunDir(0.75), mid = W.sunDir(0);
    assert.ok(rise[0] > 0.9 && near(rise[1], 0)); assert.ok(noon[1] > 0.95); assert.ok(set[0] < -0.9 && near(set[1], 0)); assert.ok(mid[1] < -0.95);
    for (var p of [0, 0.1, 0.25, 0.5, 0.8]) assert.ok(near(Math.hypot(...W.sunDir(p)), 1), "unit length at " + p);
    assert.ok(W.sunDir(0.1)[0] > 0 && W.sunDir(0.9)[0] < 0, "east in the morning, west in the evening");
});

test("/time set auto parsing", () => {
    var r = W.parseTimeSet("auto 10 at=sunrise seconds=5");
    assert.ok(r.ok, r.error);
    assert.equal(r.value.preset, "auto"); assert.equal(r.value.auto.minutes, 10); assert.equal(r.value.auto.phase, 0.25);
    assert.equal(r.value.transitionSecs, 5);
    assert.ok(!W.parseTimeSet("auto discs=off").ok, "there are no discs any more");
    var d = W.parseTimeSet("auto").value.auto;
    assert.equal(d.minutes, W.DEFAULT_DAY_MINUTES); assert.equal(d.phase, 0.3);
    assert.equal(W.parseTimeSet("auto 99999").value.auto.minutes, 1440); //clamped to a real day
    assert.equal(W.parseTimeSet("auto 0.2").value.auto.minutes, 0.2); //a very short day is allowed
    assert.ok(!W.parseTimeSet("auto soon").ok);
    assert.ok(!W.parseTimeSet("auto at=teatime").ok);
    //a manual preset has no auto, and can still place the sun
    var m = W.parseTimeSet("day at=sunset");
    assert.equal(m.value.auto, null); assert.equal(m.value.phase, 0.75);
    for (var name of ["dawn", "sunrise", "golden", "sunset", "dusk", "twilight"]) assert.ok(W.parseTimeSet(name).ok, name);
});

test("sunrise and sunset are distinct looks, not just the sun at a different angle", () => {
    var dist = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0);
    var sr = W.timePresets.sunrise, ss = W.timePresets.sunset;
    assert.ok(dist(sr.sun, ss.sun) > 0.5, "sunlight colour");
    assert.ok(dist(sr.glowColor, ss.glowColor) > 0.4, "horizon colour");
    assert.ok(dist(sr.glowTop, ss.glowTop) > 0.8, "high-sky colour (cool blue in the morning, magenta in the evening)");
    assert.ok(dist(sr.fogColor, ss.fogColor) > 0.5, "haze colour");
    assert.ok(sr.sky > ss.sky, "the morning is lighter and clearer");
    assert.ok(sr.glowTop[2] > sr.glowTop[0], "sunrise: blue above"); assert.ok(ss.glowTop[0] > ss.glowTop[1], "sunset: magenta/red above");
    //every look has both colours, and they blend like everything else
    for (var name of Object.keys(W.timePresets)) assert.equal(W.timePresets[name].glowTop.length, 3, name);
    var mid = W.timeAt(phaseAtElevation(-3, true));
    assert.equal(mid.glowTop.length, 3);
});

test("dawn, sunrise, sunset and dusk are four different looks, and there are no alias names", () => {
    var look = n => JSON.stringify([W.timePresets[n].sun, W.timePresets[n].fogColor, W.timePresets[n].sky, W.timePresets[n].glowColor]);
    var names = ["dawn", "sunrise", "sunset", "dusk"];
    assert.equal(new Set(names.map(look)).size, 4);
    for (var n of names) assert.ok(W.parseTimeSet(n).ok, n);
    assert.ok(W.timePresets.dawn.phase < W.timePresets.sunrise.phase, "dawn comes before the sun is up");
    assert.ok(W.timePresets.sunset.phase < W.timePresets.dusk.phase, "dusk comes after the sun is down");
    assert.equal(W.timeAliases, undefined);
    for (var bad of ["goldenhour", "bluehour", "noon", "midnight"]) assert.ok(!W.parseTimeSet(bad).ok, bad + " should not be a preset name");
    assert.equal(W.parseAt("sunrise"), 0.25); assert.equal(W.parseAt("sunset"), 0.75); //but they work for at=
});

test("automatic time re-resolves unchanged (anything may write either form)", () => {
    var once = W.sanitizeTime({ auto: { minutes: 15, phase: 0.6, seq: 3 }, stars: 0.5 });
    assert.deepEqual(W.sanitizeTime(once), once);
    assert.equal(once.auto.seq, 3);
    assert.equal(W.sanitizeTime("night").auto, null);
});

test("lightning is placed in the half-circle in front of the player, never behind", () => {
    var angleBetween = (a, b) => Math.abs(((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
    for (var yaw of [0, 1, 2.5, -3, 6, 100]) {
        var worst = 0, left = 0, right = 0;
        for (var byte = 0; byte < 256; byte++) {
            var az = W.frontAzimuth(byte, yaw);
            worst = Math.max(worst, angleBetween(az, yaw));
            if (az < yaw - 1) left++; if (az > yaw + 1) right++;
        };
        assert.ok(worst <= Math.PI / 2 + 1e-9, `yaw ${yaw}: a strike ${worst} rad from where they face (limit ${Math.PI / 2})`);
        assert.ok(left > 40 && right > 40, "it uses the whole arc, to both sides");
    };
    assert.ok(Math.abs(W.frontAzimuth(0, 0) + Math.PI / 2) < 1e-9 && Math.abs(W.frontAzimuth(255, 0) - Math.PI / 2) < 1e-9, "the arc's edges are exactly 90 degrees either side");
    assert.equal(W.frontAzimuth(128, 0, 0), 0); //an arc of 0 would be straight ahead
});

test("front is a normal storm part, defaulting to always", () => {
    assert.equal(W.resolveLayer("storm", 0.5).value.front, 1);
    assert.equal(W.resolveLayer("storm", { front: 0 }).value.front, 0);
    assert.equal(W.parseWeatherSet("storm 0.6 front=0").value.front, 0);
    assert.ok(!W.parseWeatherSet("storm 0.6 inView=0").ok, "the old name is gone");
});

test("cycle settings sanitise", () => {
    assert.deepEqual(W.sanitizeCycle(undefined), { enabled: false, snow: false });
    assert.deepEqual(W.sanitizeCycle({ enabled: 1, snow: "yes" }), { enabled: true, snow: true });
});

console.log(`\n${tests} test groups passed`);
