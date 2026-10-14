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
    MAX_TRANSITION_SECS: 300,

    // One table drives defaults, clamping, validation, help text and the README.
    // def(i) is what a part becomes when only the layer intensity i is given.
    layers: {
        rain: {
            desc: "Falling rain, wet surfaces and the rain sound. Doesn't change the sky or cause lightning.",
            amounts: ["drops", "sound", "wetness", "puddles", "splashes"], //parts that mean "this layer is doing something"
            parts: {
                drops:    { min: 0, max: 1, def: i => i,              desc: "how many drops are visible" },
                streak:   { min: 0, max: 1, def: i => 0.3 + 0.5 * i,  desc: "length of each drop" },
                sound:    { min: 0, max: 1, def: i => i,              desc: "rain loop volume (quieter under a roof)" },
                wetness:  { min: 0, max: 1, def: i => Math.min(1, i * 1.2), desc: "how wet surfaces look" },
                puddles:  { min: 0, max: 1, def: i => i * 0.9,        desc: "puddles and ripples on flat surfaces" },
                splashes: { min: 0, max: 1, def: i => i,              desc: "splash particles where drops land" },
            },
        },
        storm: {
            desc: "Cloud cover, darkness, lightning and thunder. Doesn't make anything wet.",
            amounts: ["clouds", "skyTint", "darkness", "fog", "lightning"],
            parts: {
                clouds:    { min: 0, max: 1,   def: i => i,             desc: "cloud cover over the map's sky" },
                skyTint:   { min: 0, max: 1,   def: i => i * 0.85,      desc: "grey-blue tint over the map's own sky" },
                darkness:  { min: 0, max: 1,   def: i => i * 0.7,       desc: "how much the sunlight is dimmed" },
                fog:       { min: 0, max: 1,   def: i => i * 0.6,       desc: "extra fog thickness and greying" },
                lightning: { min: 0, max: 1,   def: i => i,             desc: "how often lightning strikes" },
                flash:     { min: 0, max: 1,   def: i => 0.4 + 0.6 * i, desc: "brightness of the lightning flash" },
                thunder:   { min: 0, max: 1,   def: i => i,             desc: "thunder volume" },
                distance:  { min: 10, max: 150, def: i => 100 - 60 * i, desc: "typical strike distance in blocks (delay and loudness follow)" },
            },
        },
        snow: {
            desc: "Falling snowflakes. (Snow on blocks is the christmasevent plugin's job.)",
            amounts: ["flakes"],
            parts: {
                flakes: { min: 0, max: 1, def: i => i,              desc: "how many flakes are visible" },
                size:   { min: 0, max: 1, def: i => 0.3 + 0.4 * i,  desc: "flake size" },
                fall:   { min: 0, max: 1, def: i => 0.5,            desc: "fall speed" },
            },
        },
    },

    wind: {
        desc: "Slants rain, drifts snow and flakes.",
        parts: {
            strength:  { min: 0, max: 1,   desc: "wind strength" },
            direction: { min: 0, max: 360, desc: "direction in degrees" },
        },
    },

    // colour parts are [r, g, b]; fogColor null means "use the map's own fog colour"
    timePresets: {
        day:   { sun: [1, 1, 1],         fogColor: null,              fogMult: 1,   sky: 1 },
        dusk:  { sun: [1, 0.65, 0.45],   fogColor: [0.45, 0.3, 0.3],  fogMult: 1.1, sky: 0.6 },
        night: { sun: [0.3, 0.35, 0.55], fogColor: [0.03, 0.04, 0.09], fogMult: 1.3, sky: 0.12 },
    },
    timeParts: {
        sun:      "sunlight colour multiplier, r,g,b or #rrggbb",
        fogColor: "fog colour, r,g,b or #rrggbb, or none for the map's own",
        fogMult:  "fog density multiplier (0-4)",
        sky:      "skybox brightness (0-1)",
    },

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
            out.strength = clamp(value, 0, 1);
        } else if (value && typeof value === "object") {
            for (var key of Object.keys(value)) {
                if (!WeatherState.wind.parts[key]) return { ok: false, error: `Unknown wind part "${key}". Valid parts: strength, direction.` };
                var n = Number(value[key]);
                if (!isFinite(n)) return { ok: false, error: `wind part "${key}" must be a number.` };
                out[key] = clamp(n, WeatherState.wind.parts[key].min, WeatherState.wind.parts[key].max);
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
        if (parts.length === 3 && parts.every(p => isFinite(p))) return parts.map(p => round3(clamp(p, 0, 2)));
        return null;
    },

    // value: preset name | { preset?, sun?, fogColor?, fogMult?, sky?, transitionSecs? }
    resolveTime(value) {
        var presetName = "day";
        var overrides = {};
        var secs;

        if (typeof value === "string") {
            presetName = value;
        } else if (value && typeof value === "object") {
            for (var key of Object.keys(value)) {
                if (key === "preset") presetName = value.preset;
                else if (key === "transitionSecs") secs = value.transitionSecs;
                else if (key === "sun" || key === "fogColor" || key === "fogMult" || key === "sky") overrides[key] = value[key];
                else return { ok: false, error: `Unknown time part "${key}". Valid parts: ${Object.keys(WeatherState.timeParts).join(", ")}.` };
            };
        } else if (value !== undefined && value !== null) {
            return { ok: false, error: `Invalid time value.` };
        };

        var preset = WeatherState.timePresets[presetName];
        if (!preset) return { ok: false, error: `Unknown time "${presetName}". Valid: ${Object.keys(WeatherState.timePresets).join(", ")}.` };

        var out = {
            preset: presetName,
            sun: preset.sun.slice(),
            fogColor: preset.fogColor ? preset.fogColor.slice() : null,
            fogMult: preset.fogMult,
            sky: preset.sky,
            transitionSecs: secs === undefined ? WeatherState.DEFAULT_TRANSITION_SECS : WeatherState.clampSecs(secs),
        };

        for (var k of Object.keys(overrides)) {
            var v = overrides[k];
            if (k === "sun") {
                var c = Array.isArray(v) ? v.map(Number) : WeatherState.parseColor(v);
                if (!c || c.length !== 3 || !c.every(p => isFinite(p))) return { ok: false, error: `time part "sun" must be r,g,b or #rrggbb.` };
                out.sun = c.map(p => round3(clamp(p, 0, 2)));
            } else if (k === "fogColor") {
                if (v === null || v === "none") {
                    out.fogColor = null;
                } else {
                    var fc = Array.isArray(v) ? v.map(Number) : WeatherState.parseColor(v);
                    if (!fc || fc.length !== 3 || !fc.every(p => isFinite(p))) return { ok: false, error: `time part "fogColor" must be r,g,b, #rrggbb or none.` };
                    out.fogColor = fc.map(p => round3(clamp(p, 0, 2)));
                };
            } else {
                var n = Number(v);
                if (!isFinite(n)) return { ok: false, error: `time part "${k}" must be a number.` };
                out[k] = round3(k === "fogMult" ? clamp(n, 0, 4) : clamp(n, 0, 1));
            };
        };

        return { ok: true, value: out };
    },

    sanitizeTime(raw) {
        var r = WeatherState.resolveTime(raw);
        return r.ok ? r.value : WeatherState.resolveTime("day").value;
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

    // "night sky=0.2 fogMult=1.5 seconds=10" -> { ok, value }
    parseTimeSet(str) {
        var { positional, named } = WeatherState.splitTokens(str);
        var preset = (positional.shift() || "").toLowerCase();
        if (!preset) return { ok: false, error: `Usage: /time set <${Object.keys(WeatherState.timePresets).join("|")}> [part=value ...] [seconds=N]` };

        var value = { preset };
        for (var key of Object.keys(named)) {
            if (key === "seconds" || key === "secs") {
                var s = Number(named[key]);
                if (!isFinite(s)) return { ok: false, error: `seconds must be a number.` };
                value.transitionSecs = s;
            } else {
                value[key] = named[key];
            };
        };
        return WeatherState.resolveTime(value);
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
