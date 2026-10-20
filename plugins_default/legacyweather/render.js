// Client-only weather/time rendering. Spliced into the browser bundle (see index.js) - never
// imported by the server, so BABYLON and the core globals (gameScene, mapMesh, skyboxMaterial,
// me, minMap...) are referenced freely here.
//
// Pipeline: the server syncs a resolved target state -> setTarget() records, per channel, where it
// is blending from/to -> frame() eases every channel -> apply() combines ALL channels into the
// scene (sun colour, fog, sky, sound, particles) in one place. Nothing else writes those, so
// transitions can't fight each other like the old per-branch if/else did.

// uniforms/sampler the wet-surface + flash GLSL (weatherShader.js) adds to every material that uses the shared "standard" shader
const WET_UNIFORMS = ["wetness", "wetPuddles", "wetTime", "wetSky", "wetCam", "wetMap", "wetHS", "flashDir", "flashAmount", "wetRipple"];

// GPU rain/snow. One fixed mesh of pre-randomised quads per effect; the vertex shader places every
// drop each frame from time + its random numbers, wrapped around the camera so the field is endless.
// Nothing is updated on the CPU. position.xy = quad corner (-1..1), position.z = speed random,
// color = (x, z, height phase, visibility) randoms. The fragment shader hides anything below the
// highest block in its column (a height map texture), which is what keeps roofs dry.
const WeatherShaders = {
    vertex: `
precision highp float;
attribute vec3 position;
attribute vec4 color;
uniform mat4 viewProjection;
uniform vec3 camPos;
uniform float time;
uniform float amount;
uniform vec2 wind;
uniform vec4 field;   // x: box size (xz), y: box height, z: fall speed, w: how far above the camera the box is centred
uniform vec2 shape;   // rain: streak length, width. snow: flake size, unused
varying vec2 vC;
varying float vT;
varying float vFade;
varying vec3 vWorld;
void main(void) {
    if (color.w > amount) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float S = field.x;
    float H = field.y;
    vec2 xz = camPos.xz + mod(color.xy * S - camPos.xz + 0.5 * S, S) - 0.5 * S;
    float speed = field.z * (0.85 + 0.3 * position.z);
    float yy = color.z * H - time * speed;
    float cy = camPos.y + field.w; //the box is centred above the camera, so there's rain overhead as well as around
    float y = cy + mod(yy - cy + 0.5 * H, H) - 0.5 * H;
    xz += wind * (camPos.y - y) * 0.35;
    #ifdef SNOW
        xz += vec2(sin(time * 0.7 + color.z * 40.0), cos(time * 0.9 + color.x * 40.0)) * 0.35;
    #endif
    vec3 p = vec3(xz.x, y, xz.y);
    vec3 toP = p - camPos;
    float dist = length(toP);
    #ifdef SNOW
        vec3 toCam = -toP / max(dist, 0.001);
        vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
        vec3 up = cross(toCam, right);
        float sz = shape.x * (0.6 + 0.8 * position.z) * (1.0 + dist * 0.04);
        vec3 wp = p + (right * position.x + up * position.y) * sz;
    #else
        vec3 d = normalize(vec3(wind.x * 0.35, -1.0, wind.y * 0.35));
        vec3 side = normalize(cross(d, toP));
        float w = shape.y * (1.0 + dist * 0.06);
        vec3 wp = p - d * (shape.x * (position.y * 0.5 + 0.5)) + side * position.x * w;
    #endif
    vC = position.xy;
    vT = position.y * 0.5 + 0.5;
    vWorld = wp;
    float edge = 1.0 - smoothstep(0.35 * S, 0.5 * S, length(xz - camPos.xz));
    float top = 1.0 - smoothstep(0.38 * H, 0.5 * H, abs(y - cy));
    float near = smoothstep(0.8, 3.5, dist); //drops right at the camera would be huge streaks across the screen
    vFade = edge * top * near;
    gl_Position = viewProjection * vec4(wp, 1.0);
}`,
    fragment: `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D heightSampler;
uniform vec4 mapInfo;  // x,y: map size in blocks; z,w: height texture size in blocks
uniform float hs;      // height texture byte -> blocks divisor
uniform vec3 camPos;
uniform vec3 tint;
uniform float alpha;
uniform float fogDensity;
varying vec2 vC;
varying float vT;
varying float vFade;
varying vec3 vWorld;
void main(void) {
    vec2 inMap = step(vec2(0.0), vWorld.xz) * step(vWorld.xz, mapInfo.xy);
    if (inMap.x * inMap.y > 0.5) {
        float h = texture2D(heightSampler, vWorld.xz / mapInfo.zw).r * 255.0 / hs;
        if (vWorld.y < h) discard;
    }
    float dist = length(vWorld - camPos);
    float fog = exp(-dist * dist * fogDensity * fogDensity * 4.0);
    #ifdef SNOW
        float a = 1.0 - smoothstep(0.45, 1.0, length(vC));
    #else
        float a = (1.0 - abs(vC.x)) * mix(1.0, 0.15, vT);
    #endif
    gl_FragColor = vec4(tint, a * alpha * vFade * fog);
}`,
};

// The sky layer between the map's own skybox and the clouds: stars, and the colour of the sky at dawn,
// sunrise, sunset and dusk (a gradient from the horizon colour up to the high-sky colour, all the way round,
// a little stronger on the sun's side). One sphere, one shader.
const WeatherSkyShaders = {
    vertex: `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
    vDir = normalize(position);
    gl_Position = worldViewProjection * vec4(position, 1.0);
}`,
    fragment: `
precision highp float;
uniform float time;
uniform float stars;
uniform vec3 glowColor;
uniform vec3 glowTop;
uniform float glowAmt;
uniform vec3 sunDir;
uniform float dim;
varying vec3 vDir;
float sH(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float sN(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(sH(i), sH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(sH(i + vec3(0.0, 1.0, 0.0)), sH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
               mix(mix(sH(i + vec3(0.0, 0.0, 1.0)), sH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(sH(i + vec3(0.0, 1.0, 1.0)), sH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
void main(void) {
    vec3 d = normalize(vDir);
    vec3 sd = normalize(sunDir);
    float up = smoothstep(-0.03, 0.12, d.y);

    // The sky's colour: horizon colour fading up into the high-sky colour, the same all the way round. The
    // sun's side is only slightly stronger, and the change is spread smoothly over the whole circle (a cosine,
    // not a spike): anything sharper turns into a splotch of colour on one side of the view.
    vec2 az = sd.xz / max(length(sd.xz), 0.001);
    vec2 dz = d.xz / max(length(d.xz), 0.001);
    float side = 0.5 + 0.5 * dot(az, dz);
    float band = exp(-pow(max(d.y, 0.0) / 0.65, 2.0)) * smoothstep(-0.25, 0.02, d.y);
    float a = clamp(glowAmt * band * (0.92 + 0.08 * side), 0.0, 1.0) * 0.85 * dim;
    vec3 away = glowColor * 0.94 + vec3(-0.02, 0.0, 0.03);
    vec3 col = mix(mix(away, glowColor, side), glowTop, smoothstep(0.02, 0.85, d.y));

    // stars: one possible star per cell of a 3D grid, twinkling; most are faint, a few are bright
    if (stars > 0.01 && d.y > 0.0) {
        vec3 p = d * 120.0;
        vec3 c = floor(p);
        float h = sH(c);
        if (h > 0.965) {
            float mag = (h - 0.965) / 0.035;
            vec3 j = vec3(sH(c + 1.7), sH(c + 3.1), sH(c + 5.3)) - 0.5;
            float dist = length(fract(p) - 0.5 - j * 0.45);
            float tw = 0.7 + 0.3 * sin(time * (1.5 + h * 5.0) + h * 60.0);
            float s = smoothstep(0.16 + 0.2 * mag, 0.0, dist) * tw * stars * up * dim * (0.35 + 0.65 * mag);
            vec3 sc = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.7), fract(h * 91.7));
            col = mix(col, sc, clamp(s / max(a + s, 0.001), 0.0, 1.0));
            a = max(a, s);
        }
        // a faint band of distant stars and dust across the sky
        float band2 = exp(-pow(dot(d, normalize(vec3(0.35, 0.55, 0.75))) * 2.6, 2.0));
        float dust = band2 * (0.45 + 0.55 * sN(d * 7.0)) * smoothstep(0.35, 0.95, sN(d * 16.0));
        float m = dust * 0.2 * stars * up * dim;
        col = mix(col, vec3(0.55, 0.62, 0.9), clamp(m / max(a + m, 0.001), 0.0, 1.0));
        a = max(a, m);
    }


    gl_FragColor = vec4(col, a);
}`,
};

// Cloud dome: a sphere following the camera, drawn over the map's own skybox. Its clouds are
// procedural, scroll with the wind, thicken with storm.clouds and light up around lightning.
const WeatherCloudShaders = {
    vertex: `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
    vDir = normalize(position);
    gl_Position = worldViewProjection * vec4(position, 1.0);
}`,
    fragment: `
precision highp float;
uniform float time;
uniform float cover;
uniform vec3 base;
uniform vec2 wind;
uniform float flash;
uniform vec3 boltDir;
varying vec3 vDir;
float cHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main(void) {
    vec3 d = normalize(vDir);
    float horizon = smoothstep(0.02, 0.35, d.y);
    vec2 uv = d.xz / (d.y + 0.25) * 1.6 + wind * time * 0.04;
    float c = cNoise(uv) * 0.55 + cNoise(uv * 2.03) * 0.3 + cNoise(uv * 4.1) * 0.15;
    float t = mix(0.75, 0.15, cover);
    float dens = smoothstep(t, t + 0.3, c);
    float alpha = dens * horizon * (0.35 + 0.65 * cover);
    vec3 col = base * mix(1.0, 0.55, smoothstep(0.4, 0.9, c) * cover);
    float glow = flash * (0.35 + 0.65 * pow(max(dot(d, boltDir), 0.0), 6.0));
    col = mix(col, vec3(0.85, 0.9, 1.0), clamp(glow, 0.0, 1.0) * 0.9);
    alpha = max(alpha, clamp(glow, 0.0, 1.0) * 0.5 * horizon);
    gl_FragColor = vec4(col, alpha);
}`,
};

// Lightning bolt ribbons: additive, unlit, no fog. uv.x runs across the ribbon so the edges fade out
// and the centre line stays bright, which keeps the core thin and gives the glow a soft falloff.
const WeatherBoltShaders = {
    vertex: `
precision highp float;
attribute vec3 position;
attribute vec4 color;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec4 vC;
varying vec2 vUV;
void main(void) {
    vC = color;
    vUV = uv;
    gl_Position = worldViewProjection * vec4(position, 1.0);
}`,
    fragment: `
precision highp float;
varying vec4 vC;
varying vec2 vUV;
void main(void) {
    float e = 1.0 - abs(vUV.x * 2.0 - 1.0);
    gl_FragColor = vec4(vC.rgb, vC.a * e * e);
}`,
};

const WeatherRender = {
    ch: {},             // channel name -> { cur, from, to, dur, t }
    weather: null,      // last resolved targets (kept so a map change can re-apply them)
    time: null,
    busy: false,
    flash: 0,
    flashT: -1,         // seconds since the current strike began, -1 = no strike
    flashPeak: 0,
    boltMesh: null,     // the lightning ribbons (core + glow), rebuilt for every strike
    bolt: null,         // current strike: path segments, distance, direction
    boltDir: null,      // unit vector from the player toward the current strike
    thunderSounds: [],  // thunder currently playing, so it can be faded out if the storm ends
    thunderTimers: [],  // thunder waiting for its delay to pass
    lastFlashUniform: 0,
    clouds: null,       // cloud dome mesh + material
    sky: null,          // stars + the colour of the sky at dawn/sunrise/sunset/dusk
    auto: null,         // the running automatic day: { minutes, phase at the anchor, at (ms), seq }
    autoStart: 0,       // when it started, to blend in from whatever the sky was
    autoFrom: null,
    fogBase: [0.5, 0.55, 0.6],
    lastFrame: 0,
    snapNext: true,     // first sync after joining applies instantly instead of fading in
    rainSound: null,
    wetMats: [],        // materials on the shared shader in the current game scene
    allWetMats: [],
    wetU: null,         // shared uniform vectors for those materials
    wetLevel: null,     // how wet the world is right now: rises slowly in rain, dries slower still
    wetPuddle: 0,
    lastSkyMat: null,
    heights: null,      // per-column roof height, bytes (blocks * heightScale)
    texW: 0, texD: 0, heightScale: 4,
    heightTex: null,
    rainMesh: null, snowMesh: null,
    rainMat: null, snowMat: null,
    camPos: null,
    splash: null,       // pool of ring sprites where drops land
    shelter: 1,         // 1 = open sky above the player, falls toward 0.35 under a roof (rain loop volume)
    autoLow: false,     // the optimiser turned shadows off, so drop to the Low quality
    frameFn: null,
    frameScene: null,

    reset() {
        this.ch = {};
        this.weather = null;
        this.time = null;
        this.busy = false;
        this.flash = 0;
        this.flashT = -1;
        this.snapNext = true;
        this.wetLevel = null;
        this.wetPuddle = 0;
        this.auto = null;
        this.lastSkyMat = null;
        this.shelter = 1;
        this.silenceThunder(0);
        this.stopRainSound();
    },

    // the map's own fog, i.e. what setFog() in core would pick
    baseFog() {
        var fog = typeof minMap !== "undefined" && minMap && minMap.fog;
        if (fog) {
            if (fog.density > 0) {
                var c = BABYLON.Color3.FromHexString(fog.color);
                return { r: c.r, g: c.g, b: c.b, density: fog.density };
            };
            return { r: 0.5, g: 0.55, b: 0.6, density: 0 };
        };
        return { r: 0.5, g: 0.55, b: 0.6, density: 0.01 };
    },

    // where we are in the automatic day (0-1), by our own clock since the last sync
    autoPhaseNow() {
        var a = this.auto;
        if (!a) return 0.5;
        return (((a.phase + (performance.now() - a.at) / (a.minutes * 60000)) % 1) + 1) % 1;
    },

    channelsFor(time, weather) {
        var base = this.baseFog();
        this.fogBase = [base.r, base.g, base.b];
        var tv = time, phase = time.phase;
        if (time.auto && this.auto) { //the automatic day: the sky for this moment of it
            phase = this.autoPhaseNow();
            tv = WeatherState.timeAt(phase, this.fogBase, time.daylight, time.linger);
        };
        var fogColor = tv.fogColor || this.fogBase;
        var sd = WeatherState.sunDir(phase, time.auto ? time.daylight : 0);
        var timeCh = {
            sunR: tv.sun[0], sunG: tv.sun[1], sunB: tv.sun[2],
            fogR: fogColor[0], fogG: fogColor[1], fogB: fogColor[2],
            baseDensity: base.density, fogMult: tv.fogMult, sky: tv.sky,
            stars: tv.stars, glowAmt: tv.glow, glowR: tv.glowColor[0], glowG: tv.glowColor[1], glowB: tv.glowColor[2], glowTR: tv.glowTop[0], glowTG: tv.glowTop[1], glowTB: tv.glowTop[2],
            sunX: sd[0], sunY: sd[1], sunZ: sd[2],
        };
        var weatherCh = {};
        for (var layer of WeatherState.layerNames()) {
            for (var part of Object.keys(WeatherState.layers[layer].parts)) {
                weatherCh[`${layer}.${part}`] = weather[layer][part];
            };
        };
        var rad = weather.wind.direction * Math.PI / 180;
        weatherCh.windX = Math.cos(rad) * weather.wind.strength;
        weatherCh.windZ = Math.sin(rad) * weather.wind.strength;
        return { timeCh, weatherCh };
    },

    setTarget(time, weather, snap) {
        var wasAuto = !!this.auto;
        this.time = time;
        this.weather = weather;

        // the automatic day keeps its own clock; a sync only re-aims it if it's new or we've drifted
        var now = performance.now();
        if (time.auto) {
            var a = time.auto, mine = this.auto ? this.autoPhaseNow() : null;
            var diff = mine === null ? 1 : Math.abs((((a.phase - mine + 0.5) % 1) + 1) % 1 - 0.5);
            var fresh = !this.auto || this.auto.seq !== a.seq || this.auto.minutes !== a.minutes;
            if (fresh || diff > 0.01) this.auto = { minutes: a.minutes, phase: a.phase, at: now, seq: a.seq };
            if (fresh) {
                this.autoStart = snap ? -1e9 : now;
                this.autoFrom = {};
                for (var n of ["sunR", "sunG", "sunB", "fogR", "fogG", "fogB", "fogMult", "sky", "stars", "glowAmt", "glowR", "glowG", "glowB", "glowTR", "glowTG", "glowTB", "sunX", "sunY", "sunZ"]) {
                    if (this.ch[n]) this.autoFrom[n] = this.ch[n].cur;
                };
            };
        } else {
            this.auto = null;
        };

        var { timeCh, weatherCh } = this.channelsFor(time, weather);

        var set = (name, to, secs) => {
            var c = this.ch[name];
            if (!c) {
                this.ch[name] = { cur: to, from: to, to: to, dur: 0, t: 0 };
                return;
            };
            if (snap || secs <= 0) {
                c.cur = c.from = c.to = to;
                c.dur = 0; c.t = 0;
            } else if (Math.abs(c.to - to) > 1e-6) {
                c.from = c.cur; c.to = to; c.dur = secs; c.t = 0;
            };
        };
        for (var k of Object.keys(timeCh)) {
            if (this.auto && this.ch[k] && k !== "baseDensity") continue; //the automatic day drives these every frame (driveAutoTime)
            set(k, timeCh[k], time.transitionSecs);
        };
        for (var k of Object.keys(weatherCh)) set(k, weatherCh[k], weather.transitionSecs);

        this.busy = Object.values(this.ch).some(c => c.t < c.dur);
        if (weather.storm.thunder <= 0.01) this.silenceThunder(1500); //the storm is over (or muted): let the rumble die away
        this.apply();
    },

    // The automatic day writes the time channels straight from the clock every frame (it's continuous, so it
    // needs no easing), blending in from the sky it replaced over the transition time.
    driveAutoTime(now) {
        var phase = this.autoPhaseNow();
        var v = WeatherState.timeAt(phase, this.fogBase, this.time.daylight, this.time.linger);
        var sd = WeatherState.sunDir(phase, this.time.daylight);
        var vals = {
            sunR: v.sun[0], sunG: v.sun[1], sunB: v.sun[2], fogR: v.fogColor[0], fogG: v.fogColor[1], fogB: v.fogColor[2],
            fogMult: v.fogMult, sky: v.sky, stars: v.stars, glowAmt: v.glow, glowR: v.glowColor[0], glowG: v.glowColor[1], glowB: v.glowColor[2], glowTR: v.glowTop[0], glowTG: v.glowTop[1], glowTB: v.glowTop[2],
            sunX: sd[0], sunY: sd[1], sunZ: sd[2],
        };
        var secs = Math.max(0.001, this.time.transitionSecs);
        var k = Math.min(1, Math.max(0, (now - this.autoStart) / (secs * 1000)));
        var ease = k * k * (3 - 2 * k);
        for (var name in vals) {
            var c = this.ch[name] || (this.ch[name] = { cur: vals[name], from: vals[name], to: vals[name], dur: 0, t: 0 });
            var from = this.autoFrom && this.autoFrom[name] !== undefined ? this.autoFrom[name] : vals[name];
            c.cur = c.from = c.to = from + (vals[name] - from) * ease;
            c.dur = 0; c.t = 0;
        };
    },

    // re-derive channel targets after something they depend on changed (new map -> new base fog)
    refresh() {
        if (this.time && this.weather) this.setTarget(this.time, this.weather, true);
    },

    get(name) {
        var c = this.ch[name];
        return c ? c.cur : 0;
    },

    frame() {
        var self = WeatherRender;
        var now = performance.now();
        var dt = self.lastFrame ? Math.min(0.5, (now - self.lastFrame) / 1000) : 0; //real elapsed time, so transitions take their stated length even at low fps
        self.lastFrame = now;
        var changed = false;

        if (self.time && self.time.auto && self.auto) { self.driveAutoTime(now); changed = true; };

        if (self.busy) {
            var stillBusy = false;
            for (var name in self.ch) {
                var c = self.ch[name];
                if (c.t >= c.dur) continue;
                c.t = Math.min(c.dur, c.t + dt);
                var k = c.dur > 0 ? c.t / c.dur : 1;
                c.cur = c.from + (c.to - c.from) * (k * k * (3 - 2 * k));
                if (c.t < c.dur) stillBusy = true;
            };
            self.busy = stillBusy;
            changed = true;
        };

        if (self.flashT >= 0) {
            self.flashT += dt;
            var t = self.flashT;
            var pulse = (a, b, peak) => (t < a || t >= b) ? 0 : (1 - (t - a) / (b - a)) * peak;
            self.flash = Math.max(pulse(0, 0.1, 1), pulse(0.14, 0.34, 0.8)) * self.flashPeak;
            if (t > 0.34) { self.flashT = -1; self.flash = 0; };
            changed = true;
        };

        if (typeof skyboxMaterial !== "undefined" && skyboxMaterial !== self.lastSkyMat) changed = true; //skybox was (re)created

        if (changed) self.apply();
        self.updateShelter(dt);
        self.updatePrecip();
        self.updateWetness(dt);
        if (self.bolt && self.boltMesh && (self.flashT >= 0 || self.boltMesh.mesh.isEnabled())) self.layoutBolt();
        self.updateFlashLight();
        self.updateSky();
        self.updateClouds();
        self.updateSplashes(dt);
        self.updateRainSound();
    },

    apply() {
        if (!this.time || typeof gameScene === "undefined" || !gameScene || !gameScene.sunLight) return;

        var g = (n) => this.get(n);
        var flash = this.flash;

        // sunlight: time of day, dimmed by the storm, brightened by lightning
        var dark = Math.max(0, 1 - g("storm.darkness"));
        var lift = 1 + flash * 0.35; //the rest of the flash comes from the shader, lighting what faces the bolt
        var sun = gameScene.sunLight.diffuse;
        sun.r = g("sunR") * dark * lift;
        sun.g = g("sunG") * dark * lift;
        sun.b = g("sunB") * dark * lift;

        // fog: time-of-day/map colour, greyed by the storm, whitened by snow, flashed by lightning
        var bright = Math.min(1, (g("sunR") + g("sunG") + g("sunB")) / 3);
        var lerp = (a, b, t) => a + (b - a) * t;
        var fr = g("fogR"), fg = g("fogG"), fb = g("fogB");
        var sg = Math.min(1, g("storm.fog") * 0.8);
        fr = lerp(fr, 0.34 * bright, sg); fg = lerp(fg, 0.37 * bright, sg); fb = lerp(fb, 0.42 * bright, sg);
        var sw = Math.min(1, g("snow.flakes") * 0.7);
        fr = lerp(fr, 0.85 * bright, sw); fg = lerp(fg, 0.88 * bright, sw); fb = lerp(fb, 0.92 * bright, sw);
        fr = lerp(fr, 1, flash * 0.2); fg = lerp(fg, 1, flash * 0.2); fb = lerp(fb, 1, flash * 0.2);

        var density = g("baseDensity") * g("fogMult") + g("storm.fog") * 0.02 + g("rain.drops") * 0.006 + g("snow.flakes") * 0.015;
        gameScene.fogColor.r = fr; gameScene.fogColor.g = fg; gameScene.fogColor.b = fb;
        gameScene.fogDensity = density;
        gameScene.fogEnabled = density > 0.0001;

        // the map's own skybox stays; clouds dim it and skyTint washes it grey-blue
        if (typeof skyboxMaterial !== "undefined" && skyboxMaterial && skyboxMaterial.reflectionTexture) {
            this.lastSkyMat = skyboxMaterial;
            skyboxMaterial.reflectionTexture.level = Math.min(1, g("sky") * (1 - 0.8 * g("storm.clouds")) + flash * 0.7);
            var tint = g("storm.skyTint") * g("sky") * 0.6;
            var emissive = skyboxMaterial.emissiveColor;
            emissive.r = 0.3 * tint; emissive.g = 0.34 * tint; emissive.b = 0.4 * tint;
        };
    },

    // rain loop: volume follows the rain's sound part, softer when the player is under a roof
    updateRainSound() {
        var vol = this.get("rain.sound") * this.shelter * (this.qualityFactor() > 0 ? 1 : 0);
        if (vol > 0.01) {
            if (!this.rainSound) this.rainSound = playSoundIndependent2D("rain", { vol: 0.75 * vol, loop: true });
            else this.rainSound.volume(0.75 * vol);
        } else {
            this.stopRainSound();
        };
    },

    stopRainSound() {
        if (this.rainSound) {
            this.rainSound.stop();
            this.rainSound = null;
        };
    },

    // lightning: the server picks seed, angle and distance (same for everyone); the storm's current
    // flash/thunder parts decide how bright and loud it is on this client
    strike(seed, angleByte, distance) {
        if (!this.weather || !this.camPos) return;
        var storm = this.weather.storm;
        var angle = angleByte / 256 * Math.PI * 2; //anywhere around the player
        var cam = (typeof camera !== "undefined" && camera) || gameScene.activeCamera;
        if (cam && Math.random() < storm.front) { //or in the half-circle in front of them
            var f = cam.getForwardRay(1).direction;
            angle = WeatherState.frontAzimuth(angleByte, Math.atan2(f.z, f.x));
        };
        this.flashPeak = storm.flash * Math.max(0.35, 1.1 - distance / 200); //far bolts are dimmer
        this.flashT = 0;
        this.buildBolt(seed, angle, distance);

        var delay = distance / 120; //seconds until the thunder arrives
        var vol = storm.thunder * Math.min(1, Math.max(0.25, 1.15 - distance / 150));
        var rate = 1.1 - Math.min(0.3, distance / 400); //distant thunder is lower
        var timer = setTimeout(() => {
            this.thunderTimers = this.thunderTimers.filter(t => t !== timer);
            if (!inGame) return;
            this.thunderSounds.push(playSoundIndependent2D("thunder", { vol, rate }));
            if (this.thunderSounds.length > 8) this.thunderSounds.shift();
        }, delay * 1000);
        this.thunderTimers.push(timer);
    },

    // stop thunder that hasn't played yet and fade out what's playing (storm ended, or left the game)
    silenceThunder(fadeMs) {
        this.thunderTimers.forEach(t => clearTimeout(t));
        this.thunderTimers = [];
        this.thunderSounds.forEach(s => {
            try {
                if (fadeMs > 0) { s.fade(s.volume(), 0, fadeMs); setTimeout(() => s.stop(), fadeMs + 50); }
                else s.stop();
            } catch (e) { devlog("legacyweather: couldn't silence thunder", e); };
        });
        this.thunderSounds = [];
    },

    // These meshes place their own vertices (in a shader, or by rewriting them each frame), so their real
    // bounding box means nothing. Don't use alwaysSelectAsActiveMesh to get around that: in this Babylon
    // it skips the layer-mask check too, which made the orthographic UI camera draw them over the screen.
    // A huge bounding box passes the frustum test and still respects layer masks.
    unbounded(mesh) {
        mesh.setBoundingInfo(new BABYLON.BoundingInfo(new BABYLON.Vector3(-1e5, -1e5, -1e5), new BABYLON.Vector3(1e5, 1e5, 1e5)));
        mesh.alwaysSelectAsActiveMesh = false;
        mesh.layerMask = 0x0FFFFFFF; //the player camera's layers only, never the UI camera's
    },

    rng(seed) {
        return function () { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    },

    // midpoint displacement: split every segment, nudge the middle sideways, repeat
    jaggedPath(rand, from, to, levels, jag) {
        var pts = [from, to];
        for (var l = 0; l < levels; l++) {
            var next = [];
            for (var i = 0; i < pts.length - 1; i++) {
                var a = pts[i], b = pts[i + 1];
                var len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
                var off = len * jag;
                next.push(a, [(a[0] + b[0]) / 2 + (rand() - 0.5) * 2 * off, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + (rand() - 0.5) * 2 * off]);
            };
            next.push(pts[pts.length - 1]);
            pts = next;
        };
        return pts;
    },

    buildBolt(seed, angle, distance) {
        var rand = this.rng(seed);
        var renderDist = Math.min(distance, 78); //the camera sees to 100, so far bolts are drawn nearer along the same line
        var dirX = Math.cos(angle), dirZ = Math.sin(angle);
        var bx = this.camPos.x + dirX * renderDist, bz = this.camPos.z + dirZ * renderDist;
        var groundY = Math.max(0, this.heightAt(bx, bz));
        var from = [bx + (rand() - 0.5) * 10, groundY + 55, bz + (rand() - 0.5) * 10];
        var to = [bx, groundY, bz];

        var segments = []; //[ax, ay, az, bx, by, bz, widthScale, alphaScale]
        var main = this.jaggedPath(rand, from, to, 6, 0.16);
        for (var i = 0; i < main.length - 1; i++) segments.push(main[i].concat(main[i + 1], [1, 1]));

        var branches = 2 + Math.floor(rand() * 2);
        for (var k = 0; k < branches; k++) {
            var at = main[Math.floor(main.length * (0.2 + rand() * 0.5))];
            var ang = rand() * Math.PI * 2, reach = 6 + rand() * 9;
            var end = [at[0] + Math.cos(ang) * reach, at[1] - (8 + rand() * 12), at[2] + Math.sin(ang) * reach];
            var path = this.jaggedPath(rand, at, end, 3, 0.2);
            for (var j = 0; j < path.length - 1; j++) segments.push(path[j].concat(path[j + 1], [0.55, 0.6]));
        };

        this.bolt = { segments, dist: distance };
        if (!this.boltDir) this.boltDir = new BABYLON.Vector3();
        this.boltDir.set(dirX, 0.35, dirZ).normalize();
        this.layoutBolt();
    },

    // billboard every segment toward the camera (done each frame while a strike is showing)
    layoutBolt() {
        var m = this.boltMesh, bolt = this.bolt;
        if (!m || !bolt) return;
        var cx = this.camPos.x, cy = this.camPos.y, cz = this.camPos.z;
        var pos = m.positions, col = m.colors;
        var env = this.flashPeak > 0 ? this.flash / this.flashPeak : 0;
        var strength = env * Math.max(0.4, 1.1 - bolt.dist / 200);
        var n = Math.min(bolt.segments.length, m.maxSeg);
        for (var layer = 0; layer < 2; layer++) {
            for (var i = 0; i < m.maxSeg; i++) {
                var q = layer * m.maxSeg + i;
                var o = q * 12, c = q * 16;
                if (i >= n || strength <= 0.001) { for (var z = 0; z < 12; z++) pos[o + z] = 0; for (var y = 0; y < 16; y++) col[c + y] = 0; continue; };
                var sg = bolt.segments[i];
                var mx = (sg[0] + sg[3]) / 2 - cx, my = (sg[1] + sg[4]) / 2 - cy, mz = (sg[2] + sg[5]) / 2 - cz;
                var dx = sg[3] - sg[0], dy = sg[4] - sg[1], dz = sg[5] - sg[2];
                var sx = dy * mz - dz * my, sy = dz * mx - dx * mz, sz = dx * my - dy * mx; //segment direction x view ray
                var sl = Math.hypot(sx, sy, sz) || 1;
                var dist = Math.hypot(mx, my, mz);
                var half = (layer === 0 ? 0.0018 : 0.009) * dist * sg[6]; //constant angular width, so far bolts stay thin
                sx = sx / sl * half; sy = sy / sl * half; sz = sz / sl * half;
                pos[o]     = sg[0] - sx; pos[o + 1]  = sg[1] - sy; pos[o + 2]  = sg[2] - sz;
                pos[o + 3] = sg[0] + sx; pos[o + 4]  = sg[1] + sy; pos[o + 5]  = sg[2] + sz;
                pos[o + 6] = sg[3] + sx; pos[o + 7]  = sg[4] + sy; pos[o + 8]  = sg[5] + sz;
                pos[o + 9] = sg[3] - sx; pos[o + 10] = sg[4] - sy; pos[o + 11] = sg[5] - sz;
                var a = (layer === 0 ? 1 : 0.45) * sg[7] * strength;
                for (var v = 0; v < 4; v++) { col[c + v * 4] = 0.8; col[c + v * 4 + 1] = 0.86; col[c + v * 4 + 2] = 1; col[c + v * 4 + 3] = a; };
            };
        };
        m.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
        m.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, col);
        var on = strength > 0.001;
        if (m.mesh.isEnabled() !== on) m.mesh.setEnabled(on);
    },

    buildBoltMesh() {
        var maxSeg = 120;
        var quads = maxSeg * 2; //core + glow layer
        var positions = new Float32Array(quads * 12);
        var colors = new Float32Array(quads * 16);
        var uvs = new Float32Array(quads * 8);
        var indices = new Uint16Array(quads * 6);
        for (var i = 0; i < quads; i++) {
            indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
            uvs.set([0, 0, 1, 0, 1, 1, 0, 1], i * 8);
        };
        var mesh = new BABYLON.Mesh("weatherBolt", gameScene);
        var vd = new BABYLON.VertexData();
        vd.positions = positions; vd.colors = colors; vd.uvs = uvs; vd.indices = indices;
        vd.applyToMesh(mesh, true);
        this.unbounded(mesh);
        mesh.isPickable = false;

        BABYLON.Effect.ShadersStore["weatherBoltVertexShader"] = WeatherBoltShaders.vertex;
        BABYLON.Effect.ShadersStore["weatherBoltPixelShader"] = WeatherBoltShaders.fragment;
        var mat = new BABYLON.ShaderMaterial("weatherBolt", gameScene, { vertex: "weatherBolt", fragment: "weatherBolt" }, {
            attributes: ["position", "color", "uv"],
            uniforms: ["worldViewProjection"],
            needAlphaBlending: true,
        });
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
        mesh.material = mat;
        mesh.setEnabled(false);
        this.boltMesh = { mesh, mat, positions, colors, maxSeg };
    },

    // ---- sky: stars and the colour of the sky ----

    buildSky() {
        BABYLON.Effect.ShadersStore["weatherSkyVertexShader"] = WeatherSkyShaders.vertex;
        BABYLON.Effect.ShadersStore["weatherSkyPixelShader"] = WeatherSkyShaders.fragment;
        var mesh = BABYLON.MeshBuilder.CreateSphere("weatherSky", { diameter: 94, segments: 24 }, gameScene);
        this.unbounded(mesh);
        mesh.isPickable = false;
        mesh.alphaIndex = 1; //drawn before the clouds (2), so they sit in front of the stars
        var mat = new BABYLON.ShaderMaterial("weatherSky", gameScene, { vertex: "weatherSky", fragment: "weatherSky" }, {
            attributes: ["position"],
            uniforms: ["worldViewProjection", "time", "stars", "glowColor", "glowTop", "glowAmt", "sunDir", "dim"],
            needAlphaBlending: true,
        });
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.u = { glowColor: new BABYLON.Vector3(), glowTop: new BABYLON.Vector3(), sunDir: new BABYLON.Vector3(0, 1, 0) };
        mat.setVector3("glowColor", mat.u.glowColor); mat.setVector3("glowTop", mat.u.glowTop); mat.setVector3("sunDir", mat.u.sunDir);
        mesh.material = mat;
        mesh.setEnabled(false);
        this.sky = { mesh, mat };
    },

    updateSky() {
        var sk = this.sky;
        if (!sk) return;
        var dim = 1 - 0.85 * this.get("storm.clouds"); //cloud cover hides the sky behind it
        var stars = this.get("stars"), glow = this.get("glowAmt");
        var on = (stars * dim > 0.01) || (glow * dim > 0.01);
        if (sk.mesh.isEnabled() !== on) sk.mesh.setEnabled(on);
        if (!on) return;
        if (this.camPos) sk.mesh.position.copyFrom(this.camPos);
        var u = sk.mat.u;
        u.glowColor.set(this.get("glowR"), this.get("glowG"), this.get("glowB"));
        u.glowTop.set(this.get("glowTR"), this.get("glowTG"), this.get("glowTB"));
        u.sunDir.set(this.get("sunX"), this.get("sunY"), this.get("sunZ"));
        sk.mat.setFloat("time", (performance.now() / 1000) % 3600);
        sk.mat.setFloat("stars", stars);
        sk.mat.setFloat("glowAmt", glow);
        sk.mat.setFloat("dim", dim);
    },

    // ---- clouds ----

    buildClouds() {
        BABYLON.Effect.ShadersStore["weatherCloudsVertexShader"] = WeatherCloudShaders.vertex;
        BABYLON.Effect.ShadersStore["weatherCloudsPixelShader"] = WeatherCloudShaders.fragment;
        var mesh = BABYLON.MeshBuilder.CreateSphere("weatherClouds", { diameter: 90, segments: 16 }, gameScene);
        //not infiniteDistance: that follows whichever camera rendered last, and this game renders two (player + UI),
        //which left the dome centred on the UI camera. updateClouds() moves it onto the player camera each frame.
        this.unbounded(mesh);
        mesh.isPickable = false;
        var mat = new BABYLON.ShaderMaterial("weatherClouds", gameScene, { vertex: "weatherClouds", fragment: "weatherClouds" }, {
            attributes: ["position"],
            uniforms: ["worldViewProjection", "time", "cover", "base", "wind", "flash", "boltDir"],
            needAlphaBlending: true,
        });
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.u = { base: new BABYLON.Vector3(), wind: new BABYLON.Vector2(), boltDir: new BABYLON.Vector3(0, 1, 0) };
        mat.setVector3("base", mat.u.base); mat.setVector2("wind", mat.u.wind); mat.setVector3("boltDir", mat.u.boltDir);
        mesh.material = mat;
        mesh.alphaIndex = 2;
        mesh.setEnabled(false);
        this.clouds = { mesh, mat };
    },

    updateClouds() {
        var c = this.clouds;
        if (!c) return;
        if (this.camPos) c.mesh.position.copyFrom(this.camPos);
        var cover = this.get("storm.clouds");
        var on = cover > 0.01;
        if (c.mesh.isEnabled() !== on) c.mesh.setEnabled(on);
        if (!on) return;
        var tone = 1 - 0.45 * this.get("storm.darkness");
        c.mat.u.base.set(0.62 * this.get("sunR") * tone, 0.65 * this.get("sunG") * tone, 0.7 * this.get("sunB") * tone);
        c.mat.u.wind.set(this.get("windX") + 0.15, this.get("windZ") + 0.05);
        if (this.boltDir) c.mat.u.boltDir.copyFrom(this.boltDir);
        c.mat.setFloat("time", (performance.now() / 1000) % 3600);
        c.mat.setFloat("cover", cover);
        c.mat.setFloat("flash", this.flash);
    },

    // surfaces facing the bolt light up: pushed to every material on the shared shader
    updateFlashLight() {
        if (this.flash <= 0.001 && this.lastFlashUniform <= 0.001) return;
        this.lastFlashUniform = this.flash;
        var dir = this.boltDir || new BABYLON.Vector3(0, 1, 0);
        for (var i = 0; i < this.wetMats.length; i++) {
            this.wetMats[i].setFloat("flashAmount", this.flash * 0.9);
            this.wetMats[i].setVector3("flashDir", dir);
        };
    },

    // ---- wet surfaces: uniforms for the GLSL in weatherShader.js ----

    // Every material built on the shared "standard" shader (map, guns, eggs, items) gets the wet
    // uniforms and height sampler added before it first compiles.
    hookMaterials(scene) {
        scene.materials.forEach(m => {
            if (!(m instanceof BABYLON.ShaderMaterial) || m._shaderPath !== "standard") return;
            var o = m._options;
            o.uniforms = o.uniforms || [];
            o.samplers = o.samplers || [];
            WET_UNIFORMS.forEach(u => { if (o.uniforms.indexOf(u) === -1) o.uniforms.push(u); });
            if (o.samplers.indexOf("heightSampler") === -1) o.samplers.push("heightSampler");
            if (this.allWetMats.indexOf(m) === -1) this.allWetMats.push(m);
        });
    },

    // called per map: point the wet materials at this map's height map
    bindWetMaterials() {
        this.wetMats = this.allWetMats.filter(m => m.getScene() === gameScene);
        if (!this.wetU) this.wetU = { sky: new BABYLON.Vector3(), cam: new BABYLON.Vector3(), map: new BABYLON.Vector4() };
        this.wetU.map.x = map.width; this.wetU.map.y = map.depth; this.wetU.map.z = this.texW; this.wetU.map.w = this.texD;
        this.wetMats.forEach(m => {
            m.setTexture("heightSampler", this.heightTex);
            m.setVector3("wetSky", this.wetU.sky);
            m.setVector3("wetCam", this.wetU.cam);
            m.setVector4("wetMap", this.wetU.map);
            m.setFloat("wetHS", this.heightScale);
            m.setFloat("wetness", 0);
            m.setFloat("wetPuddles", 0);
            m.setFloat("wetTime", 0);
            m.setFloat("wetRipple", 0);
            m.setFloat("flashAmount", 0);
            m.setVector3("flashDir", new BABYLON.Vector3(0, 1, 0));
        });
    },

    updateWetness(dt) {
        if (!this.wetMats.length) return;
        var target = this.get("rain.wetness");
        var puddleTarget = this.get("rain.puddles") * (this.qualityFactor() >= 1 ? 1 : 0); //puddles are the expensive part
        if (this.wetLevel === null) { this.wetLevel = target; this.wetPuddle = puddleTarget; }; //first look after joining: already as wet as it should be

        //wets in ~20s of rain; how long it takes to dry comes from the weather state (60s when the rain just ends, the clear's own time when cleared by hand)
        var dry = Math.max(0.001, this.weather ? this.weather.dryingSecs : 60);
        //puddles are gone by the time the rain's transition ends (the ground itself stays damp a while longer)
        var gone = Math.max(0.001, Math.min(dry, this.weather ? this.weather.transitionSecs : 8));
        var step = (cur, to, secs) => cur < to ? Math.min(to, cur + dt / 20) : Math.max(to, cur - dt / secs);
        var prev = this.wetLevel;
        this.wetLevel = step(this.wetLevel, target, dry);
        this.wetPuddle = step(this.wetPuddle, puddleTarget, gone);
        if (this.wetLevel <= 0 && prev <= 0) return;

        var fog = gameScene.fogColor;
        var lift = 0.5 * this.flash;
        this.wetU.sky.x = fog.r * 1.1 + lift; this.wetU.sky.y = fog.g * 1.1 + lift; this.wetU.sky.z = fog.b * 1.15 + lift;
        if (this.camPos) this.wetU.cam.copyFrom(this.camPos);
        var t = (performance.now() / 1000) % 3600;
        var ripple = Math.min(1, this.get("rain.drops") * 1.5); //ripples need rain actually falling; puddles stay while the ground dries
        for (var i = 0; i < this.wetMats.length; i++) {
            var m = this.wetMats[i];
            m.setFloat("wetness", this.wetLevel);
            m.setFloat("wetPuddles", this.wetPuddle);
            m.setFloat("wetTime", t);
            m.setFloat("wetRipple", ripple);
        };
    },

    // Sprites (egg shell fragments, yolk) are unlit, so they'd stay full-bright at night or in a storm
    // while the egg itself is dimmed. Tint the n most recently spawned ones by the current sunlight,
    // the same colour the shader multiplies everything else by. They only live a second or two, so
    // doing it once as they spawn is enough.
    tintRecentSprites(manager, n) {
        if (!manager || typeof gameScene === "undefined" || !gameScene || !gameScene.sunLight) return;
        var sun = gameScene.sunLight.diffuse, len = manager.sprites.length;
        for (var k = 1; k <= n && k <= len; k++) {
            var s = manager.sprites[(manager.nextIdx - k + len * 2) % len];
            s.color.r *= sun.r; s.color.g *= sun.g; s.color.b *= sun.b;
        };
    },

    // Explosion smoke and fire, rocket trails and bullet-impact puffs fade through a colour table that the
    // game copies onto sprite.color every tick, so tinting sprite.color would be overwritten straight away.
    // Give each sprite a tinted copy of its table instead (one copy per table, rebuilt only when the
    // sunlight changes).
    tintSpriteColors(sprite) {
        if (typeof gameScene === "undefined" || !gameScene || !gameScene.sunLight || !sprite.animColors) return;
        var sun = gameScene.sunLight.diffuse;
        var key = sun.r + "," + sun.g + "," + sun.b;
        if (!this.tintedTables || this.tintedKey !== key) { this.tintedTables = new Map(); this.tintedKey = key; };
        var source = sprite.animColors;
        var tinted = this.tintedTables.get(source);
        if (!tinted) {
            tinted = source.map(c => ({ pos: c.pos, color: new BABYLON.Color4(c.color.r * sun.r, c.color.g * sun.g, c.color.b * sun.b, c.color.a) }));
            this.tintedTables.set(source, tinted);
        };
        sprite.animColors = tinted;
    },

    // ---- precipitation ----

    qualityFactor() {
        var opt = typeof LegacyWeatherPlugin !== "undefined" && LegacyWeatherPlugin.weatherQuality;
        var q = (opt && opt.get && opt.get()) || "high";
        if (this.autoLow && q === "high") q = "low";
        return q === "off" ? 0 : (q === "low" ? 0.4 : 1);
    },

    disposePrecip() {
        try {
            if (this.frameFn && this.frameScene) this.frameScene.unregisterBeforeRender(this.frameFn);
            if (this.rainMesh) this.rainMesh.dispose(false, true);
            if (this.snowMesh) this.snowMesh.dispose(false, true);
            if (this.heightTex) this.heightTex.dispose();
            if (this.splash) { this.splash.mesh.dispose(false, true); this.splash.tex.dispose(); };
            if (this.boltMesh) this.boltMesh.mesh.dispose(false, true);
            if (this.clouds) this.clouds.mesh.dispose(false, true);
            if (this.sky) this.sky.mesh.dispose(false, true);
        } catch (e) { devlog("legacyweather: dispose failed", e); };
        this.frameFn = this.frameScene = this.rainMesh = this.snowMesh = this.rainMat = this.snowMat = this.heightTex = this.heights = this.splash = this.boltMesh = this.clouds = this.sky = this.bolt = null;
    },

    // Highest solid point of every x,z column, so the shader (and the rain loop) can tell what's
    // under cover. Built once per map from the collider; ~4 samples per block of height.
    buildHeightMap() {
        var t0 = performance.now();
        var w = map.width, d = map.depth, h = map.height;
        this.texW = w;
        this.texD = d;
        this.heightScale = Math.min(4, 255 / h);
        var data = new Uint8Array(this.texW * this.texD);
        var probe = new BABYLON.Vector3();
        var levels = [0.9, 0.5, 0.1];
        for (var z = 0; z < d; z++) {
            for (var x = 0; x < w; x++) {
                var top = 0;
                var column = map.data[x];
                for (var y = h - 1; y >= 0 && !top; y--) {
                    var cell = column && column[y] && column[y][z];
                    if (!cell || !cell.idx) continue;
                    var shape = mapMeshes[cell.idx];
                    //invisible barriers, ladders and decoration-only blocks don't keep rain off anything
                    if (!shape || shape.colliderType === "none" || shape.colliderType === "ladder" || (shape.name && shape.name.indexOf("barrier") !== -1)) continue;
                    if (shape.colliderType === "full") { top = y + 1; break; };
                    //shaped colliders (slabs, stairs, arches): find where the solid part actually reaches
                    for (var l = 0; l < levels.length; l++) {
                        probe.set(x + 0.5, y + levels[l], z + 0.5);
                        if (Collider.pointCollidesWithMap(probe)) { top = y + levels[l]; break; };
                    };
                };
                data[z * this.texW + x] = Math.min(255, Math.ceil(top * this.heightScale));
            };
        };
        this.heights = data;
        //RGBA rather than a luminance texture: single-channel formats sample as zero on some GPUs/drivers
        var rgba = new Uint8Array(this.texW * this.texD * 4);
        for (var i = 0; i < data.length; i++) { rgba[i * 4] = data[i]; rgba[i * 4 + 3] = 255; };
        this.heightTex = BABYLON.RawTexture.CreateRGBATexture(rgba, this.texW, this.texD, gameScene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE);
        this.heightTex.wrapU = this.heightTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        devlog(`legacyweather: height map ${w}x${d} built in ${Math.round(performance.now() - t0)}ms`);
    },

    // roof height in blocks at a world position (0 outside the map)
    heightAt(x, z) {
        if (!this.heights) return 0;
        var ix = Math.floor(x), iz = Math.floor(z);
        if (ix < 0 || iz < 0 || ix >= map.width || iz >= map.depth) return 0;
        return this.heights[iz * this.texW + ix] / this.heightScale;
    },

    makePrecipMesh(name, count, snow) {
        var rnd = (function (seed) { return function () { seed = (seed + 0x6D2B79F5) | 0; var t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })(snow ? 9137 : 4211);
        var positions = new Float32Array(count * 12);
        var colors = new Float32Array(count * 16);
        var indices = new Uint16Array(count * 6);
        var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (var i = 0; i < count; i++) {
            var rx = rnd(), rz = rnd(), ry = rnd(), vis = (i + rnd()) / count, sp = rnd(); //vis is stratified so any prefix of the quads is evenly spread
            for (var c = 0; c < 4; c++) {
                var v = i * 4 + c;
                positions[v * 3] = corners[c][0]; positions[v * 3 + 1] = corners[c][1]; positions[v * 3 + 2] = sp;
                colors[v * 4] = rx; colors[v * 4 + 1] = rz; colors[v * 4 + 2] = ry; colors[v * 4 + 3] = vis;
            };
            indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
        };
        var mesh = new BABYLON.Mesh(name, gameScene);
        var vd = new BABYLON.VertexData();
        vd.positions = positions; vd.colors = colors; vd.indices = indices;
        vd.applyToMesh(mesh, false);
        this.unbounded(mesh);
        mesh.isPickable = false;

        BABYLON.Effect.ShadersStore["weatherPrecipVertexShader"] = WeatherShaders.vertex;
        BABYLON.Effect.ShadersStore["weatherPrecipPixelShader"] = WeatherShaders.fragment;
        var mat = new BABYLON.ShaderMaterial(name, gameScene, { vertex: "weatherPrecip", fragment: "weatherPrecip" }, {
            attributes: ["position", "color"],
            uniforms: ["viewProjection", "camPos", "time", "amount", "wind", "field", "shape", "tint", "alpha", "fogDensity", "mapInfo", "hs"],
            samplers: ["heightSampler"],
            defines: snow ? ["#define SNOW"] : [],
            needAlphaBlending: true,
        });
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mat.setTexture("heightSampler", this.heightTex);
        mat.u = { wind: new BABYLON.Vector2(), field: new BABYLON.Vector4(), shape: new BABYLON.Vector2(), tint: new BABYLON.Vector3(), mapInfo: new BABYLON.Vector4(), camPos: new BABYLON.Vector3() };
        mat.setVector2("wind", mat.u.wind); mat.setVector4("field", mat.u.field); mat.setVector2("shape", mat.u.shape);
        mat.setVector3("tint", mat.u.tint); mat.setVector4("mapInfo", mat.u.mapInfo); mat.setVector3("camPos", mat.u.camPos);
        mesh.material = mat;
        mesh.setEnabled(false);
        return { mesh, mat };
    },

    buildPrecip() {
        this.disposePrecip();
        this.buildHeightMap();
        var rain = this.makePrecipMesh("weatherRain", 9000, false);
        var snow = this.makePrecipMesh("weatherSnow", 5000, true);
        this.rainMesh = rain.mesh; this.rainMat = rain.mat;
        this.snowMesh = snow.mesh; this.snowMat = snow.mat;
        this.camPos = new BABYLON.Vector3();
        this.bindWetMaterials();
        this.buildSplashes();
        this.buildBoltMesh();
        this.buildSky();
        this.buildClouds();
        this.frameScene = gameScene;
        this.frameFn = this.frame;
        gameScene.registerBeforeRender(this.frameFn);
    },

    updatePrecip() {
        if (!this.rainMesh) return;
        var cam = (typeof camera !== "undefined" && camera) || gameScene.activeCamera;
        if (!cam) return;
        this.camPos.copyFrom(cam.globalPosition || cam.position);

        var qf = this.qualityFactor();
        var now = (performance.now() / 1000) % 3600;
        var light = gameScene.sunLight.diffuse;
        var bright = Math.max(0.3, Math.min(1.2, (light.r + light.g + light.b) / 3));
        var windX = this.get("windX"), windZ = this.get("windZ");

        this.setPrecip(this.rainMesh, this.rainMat, this.get("rain.drops") * qf, now, windX, windZ,
            22, [0.5 + 1.1 * this.get("rain.streak"), 0.012], [0.78 * bright, 0.84 * bright, 0.95 * bright], 0.55);
        this.setPrecip(this.snowMesh, this.snowMat, this.get("snow.flakes") * qf, now, windX * 0.5, windZ * 0.5,
            2.2 + 3 * this.get("snow.fall"), [0.025 + 0.06 * this.get("snow.size"), 0], [bright, bright, bright], 0.9);
    },

    setPrecip(mesh, mat, amount, now, windX, windZ, fallSpeed, shape, tint, alpha) {
        var on = amount > 0.005 && !!this.heights;
        if (mesh.isEnabled() !== on) mesh.setEnabled(on);
        if (!on) return;
        var u = mat.u;
        u.wind.x = windX; u.wind.y = windZ;
        u.field.x = 26; u.field.y = 44; u.field.z = fallSpeed; u.field.w = 9; //26 wide, 44 tall, from ~13 below the camera to ~31 above
        u.shape.x = shape[0]; u.shape.y = shape[1];
        u.tint.x = tint[0]; u.tint.y = tint[1]; u.tint.z = tint[2];
        u.mapInfo.x = map.width; u.mapInfo.y = map.depth; u.mapInfo.z = this.texW; u.mapInfo.w = this.texD;
        u.camPos.copyFrom(this.camPos);
        mat.setFloat("time", now);
        mat.setFloat("amount", Math.min(1, amount));
        mat.setFloat("alpha", alpha);
        mat.setFloat("fogDensity", gameScene.fogEnabled ? gameScene.fogDensity : 0);
        mat.setFloat("hs", this.heightScale);
    },

    // A fixed pool of flat ring sprites. Splashes appear on whatever the rain actually lands on (the
    // height map's roof surfaces), near the camera, and expand and fade. Only High quality has them.
    buildSplashes() {
        var N = 80;
        var positions = new Float32Array(N * 12);
        var colors = new Float32Array(N * 16);
        var uvs = new Float32Array(N * 8);
        var indices = new Uint16Array(N * 6);
        var uvc = [0, 0, 1, 0, 1, 1, 0, 1];
        for (var i = 0; i < N; i++) {
            uvs.set(uvc, i * 8);
            indices.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
        };
        var mesh = new BABYLON.Mesh("weatherSplash", gameScene);
        var vd = new BABYLON.VertexData();
        vd.positions = positions; vd.colors = colors; vd.uvs = uvs; vd.indices = indices;
        vd.applyToMesh(mesh, true);
        mesh.hasVertexAlpha = true;
        this.unbounded(mesh);
        mesh.isPickable = false;

        var tex = new BABYLON.DynamicTexture("weatherSplashRing", 64, gameScene, false);
        var ctx = tex.getContext();
        ctx.clearRect(0, 0, 64, 64);
        ctx.strokeStyle = "white";
        ctx.shadowColor = "white"; ctx.shadowBlur = 4; //soft edge instead of a hard outline
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(32, 32, 22, 0, Math.PI * 2); ctx.stroke();
        tex.update();
        tex.hasAlpha = true;

        var mat = new BABYLON.StandardMaterial("weatherSplash", gameScene);
        mat.disableLighting = true;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.diffuseTexture = tex;
        mat.useAlphaFromDiffuseTexture = true;
        mat.backFaceCulling = false;
        mat.disableDepthWrite = true;
        mesh.material = mat;
        mesh.setEnabled(false);

        var items = [];
        for (var j = 0; j < N; j++) items.push({ on: false, x: 0, y: 0, z: 0, age: 0, life: 1 });
        this.splash = { mesh, mat, tex, items, positions, colors, acc: 0, next: 0, any: false };
    },

    updateSplashes(dt) {
        var sp = this.splash;
        if (!sp || !this.heights) return;
        var amount = this.get("rain.splashes") * (this.qualityFactor() >= 1 ? 1 : 0);

        //spawn
        sp.acc += 30 * amount * dt;
        while (sp.acc >= 1) {
            sp.acc -= 1;
            var ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 13;
            var x = this.camPos.x + Math.cos(ang) * r, z = this.camPos.z + Math.sin(ang) * r;
            var h = this.heightAt(x, z);
            if (h <= 0 || h > this.camPos.y + 10) continue; //off the map or nowhere the rain reaches
            var it = sp.items[sp.next];
            sp.next = (sp.next + 1) % sp.items.length;
            it.on = true; it.x = x; it.y = h + 0.03; it.z = z; it.age = 0; it.life = 0.25 + Math.random() * 0.2;
        };

        //age + write vertices
        var pos = sp.positions, col = sp.colors;
        var light = gameScene.sunLight.diffuse;
        var bright = Math.max(0.3, Math.min(1.2, (light.r + light.g + light.b) / 3));
        var active = 0;
        for (var i = 0; i < sp.items.length; i++) {
            var q = sp.items[i];
            if (q.on) {
                q.age += dt;
                if (q.age >= q.life) q.on = false;
            };
            var o = i * 12, c = i * 16;
            if (!q.on) {
                for (var k = 0; k < 12; k++) pos[o + k] = 0;
                for (var m = 0; m < 16; m++) col[c + m] = 0;
                continue;
            };
            active++;
            var t = q.age / q.life, size = 0.03 + 0.13 * t, fade = Math.pow(1 - t, 1.5) * 0.5;
            pos[o]     = q.x - size; pos[o + 1]  = q.y; pos[o + 2]  = q.z - size;
            pos[o + 3] = q.x + size; pos[o + 4]  = q.y; pos[o + 5]  = q.z - size;
            pos[o + 6] = q.x + size; pos[o + 7]  = q.y; pos[o + 8]  = q.z + size;
            pos[o + 9] = q.x - size; pos[o + 10] = q.y; pos[o + 11] = q.z + size;
            for (var v = 0; v < 4; v++) {
                col[c + v * 4] = 0.8 * bright; col[c + v * 4 + 1] = 0.85 * bright; col[c + v * 4 + 2] = 0.95 * bright; col[c + v * 4 + 3] = fade;
            };
        };

        var on = active > 0;
        if (sp.mesh.isEnabled() !== on) sp.mesh.setEnabled(on);
        if (on || sp.any) {
            sp.mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind, pos);
            sp.mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, col);
        };
        sp.any = on;
    },

    // lets the rain loop get quieter when the player has a roof over their head
    updateShelter(dt) {
        var pos = me && me.actor && me.actor.mesh && me.actor.mesh.position;
        if (!pos || !this.heights) return;
        var covered = pos.y + 0.3 < this.heightAt(pos.x, pos.z);
        var target = covered ? 0.35 : 1;
        this.shelter += (target - this.shelter) * Math.min(1, dt * 3);
    },
};
