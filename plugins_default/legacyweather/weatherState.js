// Pure weather/time state logic, shared by the game server (validation, commands, lightning
// scheduling) and the browser client (resolving what the server synced). No BABYLON/DOM here.
//
// Stored under gameOptions.plugins.weather / gameOptions.plugins.time. Every layer can be written
// as a bare number (intensity 0-1) or as an object of individual parts; resolveLayer() expands
// either to the full parts object, and re-resolving an already-resolved object is a no-op, so
// anything (a gametype, another plugin, a command) may write either form and sanitize() fixes it.

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const round3 = (v) => Math.round(v * 1000) / 1000;

export const WeatherState = {
    DEFAULT_INTENSITY: 0.7,
    DEFAULT_TRANSITION_SECS: 8,
    MAX_TRANSITION_SECS: 3600, //an hour
    DEFAULT_DRYING_SECS: 60, //how long wet ground takes to dry once the rain has stopped by itself

    // One table drives defaults, clamping, validation, help text and the README.
    // def(i) is what a part becomes when only the layer intensity i is given.
    layers: {
        rain: {
            desc: "Falling rain, wet surfaces and the rain sound. Doesn't change the sky or cause lightning.",
            amounts: ["drops", "sound", "wetness", "puddles", "splashes"], //parts that mean "this layer is doing something"
            parts: {
                drops:    { min: 0, max: 1, def: i => i,              desc: "how many drops are visible" },
                streak:   { min: 0, max: 5, def: i => 0.3 + 0.5 * i,  desc: "length of each drop" },
                sound:    { min: 0, max: 1, def: i => i,              desc: "rain loop volume (quieter under a roof)" },
                wetness:  { min: 0, max: 1, def: i => Math.min(1, i * 1.2), desc: "how wet surfaces look" },
                puddles:  { min: 0, max: 1, def: i => i * 0.9,        desc: "puddles and ripples on flat surfaces" },
                splashes: { min: 0, max: 5, def: i => i,              desc: "splash particles where drops land" },
            },
        },
        storm: {
            desc: "Cloud cover, darkness, lightning and thunder. Doesn't make anything wet.",
            amounts: ["clouds", "skyTint", "darkness", "fog", "lightning"],
            parts: {
                clouds:    { min: 0, max: 1,   def: i => i,             desc: "cloud cover over the map's sky" },
                skyTint:   { min: 0, max: 1,   def: i => i * 0.85,      desc: "grey-blue tint over the map's own sky" },
                darkness:  { min: 0, max: 1,   def: i => i * 0.7,       desc: "how much the sunlight is dimmed" },
                fog:       { min: 0, max: 10,  def: i => i * 0.6,       desc: "extra fog thickness and greying" },
                lightning: { min: 0, max: 20,  def: i => i,             desc: "how often lightning strikes" },
                flash:     { min: 0, max: 5,   def: i => 0.4 + 0.6 * i, desc: "brightness of the lightning flash" },
                thunder:   { min: 0, max: 1,   def: i => i,             desc: "thunder volume" },
                distance:  { min: 0, max: 255, def: i => 100 - 60 * i, desc: "typical strike distance in blocks (delay and loudness follow)" },
                front:     { min: 0, max: 1,   def: i => 1,            desc: "how often a strike is placed in the half-circle in front of you rather than anywhere around you (1 is always)" },
            },
        },
        snow: {
            desc: "Falling snowflakes. (Snow on blocks is the christmasevent plugin's job.)",
            amounts: ["flakes"],
            parts: {
                flakes: { min: 0, max: 1, def: i => i,              desc: "how many flakes are visible" },
                size:   { min: 0, max: 10, def: i => 0.3 + 0.4 * i,  desc: "flake size" },
                fall:   { min: 0, max: 10, def: i => 0.5,            desc: "fall speed" },
            },
        },
    },

    wind: {
        desc: "Slants rain, drifts snow and flakes.",
        parts: {
            strength:  { min: 0, max: 5,   desc: "wind strength" },
            direction: { min: 0, max: 360, wrap: true, desc: "direction in degrees (wraps round, so 370 is 10)" },
        },
    },

    // colour parts are [r, g, b]; fogColor null means "use the map's own fog colour".
    // stars/glow are 0-1 (stars in the sky, glow on the horizon toward the sun), phase is where the sun is
    // in the day (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset - see sunDir()).
    timePresets: {
        day:      { sun: [1, 1, 1],          fogColor: null,               fogMult: 1,    sky: 1,    stars: 0,    glow: 0,   glowColor: [1, 0.8, 0.5],    glowTop: [0.55, 0.72, 1],    phase: 0.5 },
        golden:   { sun: [1, 0.82, 0.62],    fogColor: [0.8, 0.66, 0.5],   fogMult: 1.05, sky: 0.9,  stars: 0,    glow: 0.5, glowColor: [1, 0.72, 0.38],   glowTop: [0.85, 0.8, 0.7],    phase: 0.69 },
        // sunrise is clean, light and a little misty: peach on the horizon, cool blue above
        sunrise:  { sun: [1, 0.8, 0.62],     fogColor: [0.8, 0.7, 0.62],   fogMult: 1.2,  sky: 0.85, stars: 0.05, glow: 0.9, glowColor: [1, 0.7, 0.45],    glowTop: [0.5, 0.78, 0.95],  phase: 0.25 },
        // sunset is deep, dusty and saturated: red-orange on the horizon, magenta above
        sunset:   { sun: [1, 0.5, 0.32],     fogColor: [0.5, 0.24, 0.2],   fogMult: 1.15, sky: 0.55, stars: 0.1,  glow: 1,   glowColor: [1, 0.3, 0.12],    glowTop: [0.62, 0.18, 0.42], phase: 0.75 },
        dawn:     { sun: [0.75, 0.62, 0.7],  fogColor: [0.5, 0.4, 0.5],    fogMult: 1.15, sky: 0.5,  stars: 0.35, glow: 0.9, glowColor: [0.92, 0.55, 0.62], glowTop: [0.32, 0.42, 0.78], phase: 0.22 },
        dusk:     { sun: [0.8, 0.5, 0.55],   fogColor: [0.4, 0.25, 0.35],  fogMult: 1.15, sky: 0.4,  stars: 0.3,  glow: 0.9, glowColor: [0.8, 0.28, 0.4],   glowTop: [0.2, 0.14, 0.42],  phase: 0.78 },
        twilight: { sun: [0.5, 0.52, 0.75],  fogColor: [0.15, 0.17, 0.3],  fogMult: 1.2,  sky: 0.3,  stars: 0.6,  glow: 0.5, glowColor: [0.4, 0.34, 0.7],   glowTop: [0.08, 0.1, 0.28],  phase: 0.81 },
        night:    { sun: [0.3, 0.35, 0.55],  fogColor: [0.03, 0.04, 0.09], fogMult: 1.3,  sky: 0.12, stars: 1,    glow: 0.25, glowColor: [0.1, 0.14, 0.32],  glowTop: [0.02, 0.03, 0.1],  phase: 0 },
    },
    timeParts: {
        sun:       "sunlight colour multiplier, r,g,b or #rrggbb",
        fogColor:  "fog colour, r,g,b or #rrggbb, or none for the map's own",
        fogMult:   "fog density multiplier (1 is normal, up to 50)",
        sky:       "skybox brightness (1 is normal, up to 4)",
        stars:     "how many stars show (1 is full, up to 4)",
        glow:      "horizon glow toward the sun (1 is full, up to 4)",
        glowColor: "sky colour low on the horizon, r,g,b or #rrggbb",
        glowTop:   "sky colour high up (the glow fades from glowColor into this), r,g,b or #rrggbb",
        at:        "where the sun is: 0-1, or midnight/dawn/morning/noon/afternoon/dusk/night",
        daylight:  "auto only: season. 0 is an equinox (12h of daylight); positive means longer days, negative shorter (-1 to 1)",
        linger:    "auto only: how long the sunrise/sunset/twilight looks last. 1 is how long they really are; 2 or 3 makes them linger",
    },

    // The automatic day. The look of the sky is a function of how high the sun is, in degrees, so how long
    // each look lasts comes from the sun's real path rather than from where I put it on a clock: at the
    // equinox it's dark (sun more than 18 degrees down) for about 40% of the day, each twilight is about 5%,
    // and golden hour (sun 0-10 degrees up) is under 3% each side. Mornings and evenings differ, so the two
    // sides have their own lists: [elevation in degrees, preset].
    autoElevations: {
        rising:  [[-90, "night"], [-18, "night"], [-12, "twilight"], [-6, "dawn"], [0, "sunrise"], [10, "golden"], [30, "day"], [90, "day"]],
        setting: [[-90, "night"], [-18, "night"], [-12, "twilight"], [-6, "dusk"], [0, "sunset"], [10, "golden"], [30, "day"], [90, "day"]],
    },
    DEFAULT_DAY_MINUTES: 20,

    phaseNames: { midnight: 0, dawn: 0.22, sunrise: 0.25, morning: 0.33, noon: 0.5, day: 0.5, afternoon: 0.62, sunset: 0.75, dusk: 0.78, night: 0.9 },

    layerNames() { return Object.keys(WeatherState.layers); },

    clampSecs(secs) {
        secs = Number(secs);
        if (!isFinite(secs)) return WeatherState.DEFAULT_TRANSITION_SECS;
        return clamp(secs, 0, WeatherState.MAX_TRANSITION_SECS);
    },

    // value: number | boolean | { intensity?, ...parts } | undefined. Never throws.
    // returns { ok: true, value: { intensity, ...every part } } or { ok: false, error }
    resolveLayer(name, value) {
        var spec = WeatherState.layers[name];
        if (!spec) return { ok: false, error: `Unknown layer "${name}". Valid layers: ${WeatherState.layerNames().join(", ")}, wind.` };

        var intensity;
        var overrides = {};

        if (value === undefined || value === null || value === false) {
            intensity = 0;
        } else if (value === true) {
            intensity = WeatherState.DEFAULT_INTENSITY;
        } else if (typeof value === "number") {
            if (!isFinite(value)) return { ok: false, error: `Intensity must be a number from 0 to 1.` };
            intensity = clamp(value, 0, 1);
        } else if (typeof value === "object") {
            var validKeys = Object.keys(spec.parts);
            for (var key of Object.keys(value)) {
                if (key === "intensity") continue;
                if (!spec.parts[key]) return { ok: false, error: `Unknown ${name} part "${key}". Valid parts: intensity, ${validKeys.join(", ")}.` };
                var n = Number(value[key]);
                if (!isFinite(n)) return { ok: false, error: `${name} part "${key}" must be a number.` };
                overrides[key] = clamp(n, spec.parts[key].min, spec.parts[key].max);
            };
            if (value.intensity === undefined) {
                intensity = WeatherState.DEFAULT_INTENSITY;
            } else {
                var i = Number(value.intensity);
                if (!isFinite(i)) return { ok: false, error: `${name} intensity must be a number from 0 to 1.` };
                intensity = clamp(i, 0, 1);
            };
        } else {
            return { ok: false, error: `Invalid value for ${name}.` };
        };

        var out = { intensity: round3(intensity) };
        for (var part of Object.keys(spec.parts)) {
            out[part] = round3(overrides[part] !== undefined ? overrides[part] : spec.parts[part].def(intensity));
        };
        return { ok: true, value: out };
    },

    // value: number (strength) | { strength?, direction? }
    resolveWind(value) {
        var out = { strength: 0, direction: 0 };
        if (typeof value === "number" && isFinite(value)) {
            out.strength = clamp(value, WeatherState.wind.parts.strength.min, WeatherState.wind.parts.strength.max);
        } else if (value && typeof value === "object") {
            for (var key of Object.keys(value)) {
                if (!WeatherState.wind.parts[key]) return { ok: false, error: `Unknown wind part "${key}". Valid parts: strength, direction.` };
                var n = Number(value[key]);
                if (!isFinite(n)) return { ok: false, error: `wind part "${key}" must be a number.` };
                var wp = WeatherState.wind.parts[key];
                out[key] = wp.wrap ? ((n % wp.max) + wp.max) % wp.max : clamp(n, wp.min, wp.max);
            };
        } else if (value !== undefined && value !== null) {
            return { ok: false, error: `Invalid value for wind.` };
        };
        out.strength = round3(out.strength);
        out.direction = round3(out.direction);
        return { ok: true, value: out };
    },

    // Full off state (what a room starts with).
    defaultWeather() {
        return WeatherState.sanitizeWeather({});
    },

    // Normalises anything into the full resolved shape. Invalid parts fall back to off
    // rather than throwing - this runs on the server every sync and on the client every receive.
    sanitizeWeather(raw) {
        raw = (raw && typeof raw === "object") ? raw : {};
        var out = {};
        for (var name of WeatherState.layerNames()) {
            var r = WeatherState.resolveLayer(name, raw[name]);
            out[name] = r.ok ? r.value : WeatherState.resolveLayer(name, 0).value;
        };
        var wind = WeatherState.resolveWind(raw.wind);
        out.wind = wind.ok ? wind.value : { strength: 0, direction: 0 };
        out.transitionSecs = raw.transitionSecs === undefined ? WeatherState.DEFAULT_TRANSITION_SECS : WeatherState.clampSecs(raw.transitionSecs);
        var drying = Number(raw.dryingSecs);
        out.dryingSecs = (raw.dryingSecs === undefined || !isFinite(drying)) ? WeatherState.DEFAULT_DRYING_SECS : WeatherState.clampSecs(drying);
        return out;
    },

    parseColor(str) {
        str = String(str).trim();
        var m = /^#?([0-9a-f]{6})$/i.exec(str);
        if (m) {
            var hex = parseInt(m[1], 16);
            return [round3(((hex >> 16) & 255) / 255), round3(((hex >> 8) & 255) / 255), round3((hex & 255) / 255)];
        };
        var parts = str.split(",").map(Number);
        if (parts.length === 3 && parts.every(p => isFinite(p))) return parts.map(p => round3(clamp(p, 0, 10)));
        return null;
    },

    // value: preset name | { preset?, sun?, fogColor?, fogMult?, sky?, stars?, glow?, glowColor?, glowTop?, phase?, auto?, transitionSecs? }
    // auto: true | { minutes?, phase?, seq? } - the day then runs by itself (see timeAt)
    resolveTime(value) {
        var presetName = "day";
        var overrides = {};
        var secs, auto = null;

        if (typeof value === "string") {
            presetName = value;
        } else if (value && typeof value === "object") {
            for (var key of Object.keys(value)) {
                if (key === "preset") presetName = value.preset;
                else if (key === "transitionSecs") secs = value.transitionSecs;
                else if (key === "auto") auto = value.auto;
                else if (["sun", "fogColor", "fogMult", "sky", "stars", "glow", "glowColor", "glowTop", "phase", "daylight", "linger"].includes(key)) overrides[key] = value[key];
                else return { ok: false, error: `Unknown time part "${key}". Valid parts: ${Object.keys(WeatherState.timeParts).join(", ")}.` };
            };
        } else if (value !== undefined && value !== null) {
            return { ok: false, error: `Invalid time value.` };
        };

        if (presetName === "auto") { presetName = "day"; if (!auto) auto = true; }; //"auto" is what a running cycle is stored as: a day's worth of sky plus the clock
        var preset = WeatherState.timePresets[presetName];
        if (!preset) return { ok: false, error: `Unknown time "${presetName}". Valid: ${Object.keys(WeatherState.timePresets).join(", ")}, auto.` };

        var out = {
            preset: presetName,
            sun: preset.sun.slice(),
            fogColor: preset.fogColor ? preset.fogColor.slice() : null,
            fogMult: preset.fogMult,
            sky: preset.sky,
            stars: preset.stars,
            glow: preset.glow,
            glowColor: preset.glowColor.slice(),
            glowTop: preset.glowTop.slice(),
            phase: preset.phase,
            daylight: 0,
            linger: 1,
            auto: null,
            transitionSecs: secs === undefined ? WeatherState.DEFAULT_TRANSITION_SECS : WeatherState.clampSecs(secs),
        };

        if (auto) {
            var a = auto === true ? {} : auto;
            var minutes = a.minutes === undefined ? WeatherState.DEFAULT_DAY_MINUTES : Number(a.minutes);
            if (!isFinite(minutes)) return { ok: false, error: `Day length must be a number of minutes.` };
            var startPhase = a.phase === undefined ? 0.3 : Number(a.phase);
            if (!isFinite(startPhase)) return { ok: false, error: `Start of day must be 0-1 or a name like dawn, noon, dusk.` };
            out.preset = "auto";
            out.auto = { minutes: round3(clamp(minutes, 0.1, 1440)), phase: Math.round((((startPhase % 1) + 1) % 1) * 10000) / 10000, seq: Math.max(0, Math.floor(Number(a.seq) || 0)) };
        };

        for (var k of Object.keys(overrides)) {
            var v = overrides[k];
            if (k === "sun" || k === "glowColor" || k === "glowTop") {
                var c = Array.isArray(v) ? v.map(Number) : WeatherState.parseColor(v);
                if (!c || c.length !== 3 || !c.every(p => isFinite(p))) return { ok: false, error: `time part "${k}" must be r,g,b or #rrggbb.` };
                out[k] = c.map(p => round3(clamp(p, 0, 10)));
            } else if (k === "fogColor") {
                if (v === null || v === "none") {
                    out.fogColor = null;
                } else {
                    var fc = Array.isArray(v) ? v.map(Number) : WeatherState.parseColor(v);
                    if (!fc || fc.length !== 3 || !fc.every(p => isFinite(p))) return { ok: false, error: `time part "fogColor" must be r,g,b, #rrggbb or none.` };
                    out.fogColor = fc.map(p => round3(clamp(p, 0, 10)));
                };
            } else if (k === "phase") {
                var ph = typeof v === "string" ? WeatherState.parseAt(v) : Number(v);
                if (!isFinite(ph)) return { ok: false, error: `time part "at" must be 0-1 or one of ${Object.keys(WeatherState.phaseNames).join(", ")}.` };
                out.phase = round3(((ph % 1) + 1) % 1);
            } else {
                var n = Number(v);
                if (!isFinite(n)) return { ok: false, error: `time part "${k}" must be a number.` };
                out[k] = round3(k === "fogMult" ? clamp(n, 0, 50) : k === "daylight" ? clamp(n, -1, 1) : k === "linger" ? clamp(n, 0, 20) : clamp(n, 0, 4)); //sky/stars/glow can go past 1 (brighter than normal)
            };
        };

        return { ok: true, value: out };
    },

    // a point in the day: a number 0-1, or a name (dawn, noon, dusk...). NaN if it's neither.
    parseAt(str) {
        var t = String(str).toLowerCase();
        if (WeatherState.phaseNames[t] !== undefined) return WeatherState.phaseNames[t];
        var n = Number(str);
        return isFinite(n) ? n : NaN;
    },

    // How high the sun is at a point in the day, as the sine of its elevation (-1 below, 1 overhead).
    // Phase 0 is midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset. daylight (-1..1) is the season: it lifts or
    // lowers the sun's whole path, so days get longer or shorter.
    sunHeight(phase, daylight) {
        return clamp(Math.sin((phase - 0.25) * Math.PI * 2) + (daylight || 0), -1, 1);
    },

    // the sun's elevation in degrees (-90 straight down, 90 overhead)
    sunElevation(phase, daylight) {
        return Math.asin(WeatherState.sunHeight(phase, daylight)) * 180 / Math.PI;
    },

    // Where the sun is for a point in the day, as a unit vector. Sunrise is toward +x, sunset toward -x,
    // noon overhead; the moon is the opposite direction.
    sunDir(phase, daylight) {
        var y = WeatherState.sunHeight(phase, daylight);
        var side = Math.cos((phase - 0.25) * Math.PI * 2) >= 0 ? 1 : -1; //east in the morning, west in the evening
        var x = side * Math.sqrt(Math.max(0, 1 - y * y)), z = 0.25;
        var len = Math.hypot(x, y, z);
        return [x / len, y / len, z / len];
    },

    // The keyframes for one side of the day, with the horizon looks stretched by linger.
    _elevationFrames(rising, linger) {
        var list = WeatherState.autoElevations[rising ? "rising" : "setting"];
        linger = linger === undefined ? 1 : linger;
        return list.map(([deg, name]) => [Math.abs(deg) >= 90 ? deg : clamp(deg * linger, -89, 89), name]);
    },

    // Sky values at a point in the day (phase 0-1, wrapping), blended between the two looks either side of
    // where the sun is. mapFog [r,g,b] stands in for presets that use the map's own fog colour.
    // Also returns `look` (the nearer of the two looks) for display.
    timeAt(phase, mapFog, daylight, linger) {
        mapFog = mapFog || [0.5, 0.55, 0.6];
        phase = ((phase % 1) + 1) % 1;
        var rising = phase < 0.5;
        var e = WeatherState.sunElevation(phase, daylight);
        var kf = WeatherState._elevationFrames(rising, linger);
        var i = 0;
        while (i < kf.length - 2 && e >= kf[i + 1][0]) i++;
        var a = kf[i], b = kf[i + 1];
        var t = b[0] === a[0] ? 0 : clamp((e - a[0]) / (b[0] - a[0]), 0, 1);
        var eased = t * t * (3 - 2 * t);
        var pa = WeatherState.timePresets[a[1]], pb = WeatherState.timePresets[b[1]];
        var mix = (x, y) => x + (y - x) * eased;
        var mix3 = (x, y) => [mix(x[0], y[0]), mix(x[1], y[1]), mix(x[2], y[2])];
        return {
            sun: mix3(pa.sun, pb.sun),
            fogColor: mix3(pa.fogColor || mapFog, pb.fogColor || mapFog),
            fogMult: mix(pa.fogMult, pb.fogMult),
            sky: mix(pa.sky, pb.sky),
            stars: mix(pa.stars, pb.stars),
            glow: mix(pa.glow, pb.glow),
            glowColor: mix3(pa.glowColor, pb.glowColor),
            glowTop: mix3(pa.glowTop, pb.glowTop),
            look: t < 0.5 ? a[1] : b[1],
            elevation: e,
        };
    },

    // what the sky looks like at a point in the day ("dusk", "night"...), for display
    phaseName(phase, daylight, linger) {
        return WeatherState.timeAt(phase, null, daylight, linger).look;
    },

    sanitizeTime(raw) {
        var r = WeatherState.resolveTime(raw);
        return r.ok ? r.value : WeatherState.resolveTime("day").value;
    },

    // ---- lightning placement ----

    // Where around the player a strike goes: somewhere in the half-circle in front of them (arc = PI, 180 degrees,
    // centred on the way they're facing), picked by the server's angle byte (0-255). So it's usually in view,
    // and sometimes off to one side, never behind.
    frontAzimuth(angleByte, yaw, arc) {
        arc = arc === undefined ? Math.PI : arc;
        return yaw + (angleByte / 255 - 0.5) * arc;
    },

    // ---- command parsing (server validates, so a bad line never touches room state) ----

    // "key=value" tokens -> { key: value }; positional tokens are returned separately.
    splitTokens(str) {
        var positional = [];
        var named = {};
        for (var tok of String(str || "").trim().split(/\s+/).filter(Boolean)) {
            var eq = tok.indexOf("=");
            if (eq > 0) named[tok.slice(0, eq)] = tok.slice(eq + 1);
            else positional.push(tok);
        };
        return { positional, named };
    },

    parseNumberToken(tok) {
        if (tok === undefined) return undefined;
        var lower = String(tok).toLowerCase();
        if (lower === "on" || lower === "true") return true;
        if (lower === "off" || lower === "false") return 0;
        var n = Number(tok);
        return isFinite(n) ? n : NaN;
    },

    // "rain 0.6 drops=1 sound=0.3 seconds=20" -> { ok, layer, value, seconds }
    parseWeatherSet(str) {
        var { positional, named } = WeatherState.splitTokens(str);
        var layer = (positional.shift() || "").toLowerCase();
        var usage = `Usage: /weather set <${WeatherState.layerNames().join("|")}|wind> [intensity] [part=value ...] [seconds=N]`;
        if (!layer) return { ok: false, error: usage };

        var seconds;
        var secKey = named.seconds !== undefined ? "seconds" : (named.secs !== undefined ? "secs" : null);
        if (secKey) {
            seconds = Number(named[secKey]);
            if (!isFinite(seconds)) return { ok: false, error: `seconds must be a number.` };
            delete named[secKey];
        };

        if (layer === "wind") {
            var wind = {};
            var first = positional[0] !== undefined ? Number(positional[0]) : undefined;
            var second = positional[1] !== undefined ? Number(positional[1]) : undefined;
            if (first !== undefined) { if (!isFinite(first)) return { ok: false, error: `wind strength must be a number from 0 to 1.` }; wind.strength = first; };
            if (second !== undefined) { if (!isFinite(second)) return { ok: false, error: `wind direction must be a number in degrees.` }; wind.direction = second; };
            Object.assign(wind, named);
            var rw = WeatherState.resolveWind(wind);
            if (!rw.ok) return rw;
            return { ok: true, layer: "wind", value: rw.value, seconds };
        };

        if (!WeatherState.layers[layer]) return { ok: false, error: `Unknown layer "${layer}". Valid layers: ${WeatherState.layerNames().join(", ")}, wind. ${usage}` };

        var intensity = WeatherState.parseNumberToken(positional[0]);
        if (typeof intensity === "number" && isNaN(intensity)) return { ok: false, error: `Intensity must be a number from 0 to 1. ${usage}` };

        var hasParts = Object.keys(named).length > 0;
        var value;
        if (!hasParts) {
            value = intensity === undefined ? WeatherState.DEFAULT_INTENSITY : intensity;
        } else {
            value = {};
            for (var key of Object.keys(named)) value[key] = named[key];
            if (intensity !== undefined) value.intensity = intensity === true ? WeatherState.DEFAULT_INTENSITY : intensity;
        };

        var r = WeatherState.resolveLayer(layer, value);
        if (!r.ok) return r;
        return { ok: true, layer, value: r.value, seconds };
    },

    // "night sky=0.2 fogMult=1.5 seconds=10" or "auto 20 at=dawn" -> { ok, value }
    parseTimeSet(str) {
        var { positional, named } = WeatherState.splitTokens(str);
        var preset = (positional.shift() || "").toLowerCase();
        var presetList = Object.keys(WeatherState.timePresets).join("|");
        if (!preset) return { ok: false, error: `Usage: /time set <${presetList}|auto> [minutes] [part=value ...] [seconds=N]` };

        var value = { preset };
        if (preset === "auto") {
            value.preset = "day";
            value.auto = {};
            if (positional[0] !== undefined) {
                var minutes = Number(positional[0]);
                if (!isFinite(minutes)) return { ok: false, error: `Day length must be a number of minutes. Usage: /time set auto [minutes] [at=dawn]` };
                value.auto.minutes = minutes;
            };
        };

        for (var key of Object.keys(named)) {
            if (key === "seconds" || key === "secs") {
                var s = Number(named[key]);
                if (!isFinite(s)) return { ok: false, error: `seconds must be a number.` };
                value.transitionSecs = s;
            } else if (key === "at") {
                var at = WeatherState.parseAt(named[key]);
                if (!isFinite(at)) return { ok: false, error: `"at" must be 0-1 or one of ${Object.keys(WeatherState.phaseNames).join(", ")}.` };
                if (value.auto) value.auto.phase = at; else value.phase = at;
            } else if (key === "minutes" && value.auto) {
                value.auto.minutes = Number(named[key]);
            } else {
                value[key] = named[key];
            };
        };
        return WeatherState.resolveTime(value);
    },

    // ---- automatic weather ----

    // gameOptions.plugins.weatherCycle: { enabled, snow } - snow says whether the cycle may pick snow
    sanitizeCycle(raw) {
        raw = (raw && typeof raw === "object") ? raw : {};
        return { enabled: !!raw.enabled, snow: !!raw.snow };
    },

    // Picks the next stretch of automatic weather: what it is, how long it takes to blend in, and how
    // long it lasts. rand is injected (Math.random in the game) so this can be tested.
    cycleStep(rand, allowSnow) {
        var between = (a, b) => a + rand() * (b - a);
        var wind = (lo, hi) => ({ strength: between(lo, hi), direction: rand() * 360 });
        var quiet = (lo, hi) => ({ intensity: between(lo, hi), lightning: 0, thunder: 0 }); //cloud without lightning

        var options = [
            { name: "clear", weight: 40, hold: [120, 300], make: () => ({ rain: 0, storm: 0, snow: 0, wind: wind(0, 0.2) }) },
            { name: "overcast", weight: 20, hold: [90, 200], make: () => ({ rain: 0, storm: quiet(0.3, 0.55), snow: 0, wind: wind(0.05, 0.3) }) },
            { name: "rain", weight: 25, hold: [90, 240], make: () => ({ rain: between(0.3, 0.8), storm: quiet(0.2, 0.4), snow: 0, wind: wind(0.1, 0.4) }) },
            { name: "thunderstorm", weight: 15, hold: [60, 150], make: () => ({ rain: between(0.6, 1), storm: between(0.6, 1), snow: 0, wind: wind(0.2, 0.6) }) },
        ];
        if (allowSnow) options.push({ name: "snow", weight: 20, hold: [90, 240], make: () => ({ rain: 0, storm: quiet(0.2, 0.35), snow: between(0.4, 0.9), wind: wind(0.05, 0.3) }) });

        var total = options.reduce((sum, o) => sum + o.weight, 0);
        var roll = rand() * total;
        var pick = options[options.length - 1];
        for (var o of options) { if (roll < o.weight) { pick = o; break; }; roll -= o.weight; };

        return {
            name: pick.name,
            weather: pick.make(),
            transitionSecs: Math.round(between(20, 45)),
            holdSecs: Math.round(between(pick.hold[0], pick.hold[1])),
        };
    },

    isLayerActive(name, layer) {
        var spec = WeatherState.layers[name];
        return !!layer && !!spec && spec.amounts.some(p => layer[p] > 0);
    },

    describeLayer(name, layer) {
        if (!WeatherState.isLayerActive(name, layer)) return `${name}: off`;
        var spec = WeatherState.layers[name];
        return `${name}: ${layer.intensity} (${Object.keys(spec.parts).map(p => `${p}=${layer[p]}`).join(" ")})`;
    },
};
