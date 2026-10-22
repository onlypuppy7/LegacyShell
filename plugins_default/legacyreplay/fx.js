//legacyshell: replay looks (browser bundle only). a look is a set of numbers and moving to another look eases every number, nothing pops on or off.
//
//the colour work (grading, vignette, grain, colour fringing, sharpening) is ONE small shader pass of our own, driven by uniforms, so changing a number costs nothing.
//bloom and the soft background (depth of field) are babylon's, which are the expensive ones, so they are separate settings, built once and only switched on or off when a look or a camera
//change needs them. the first version drove babylon's whole pipeline with eased numbers every frame, and some of those writes (anything on the scene's image processing, which every material
//watches) made the game recompile its shaders every frame, so it ran at 3 fps and showed almost nothing
//

export const ReplayFx = {
    //every look has every key, so easing between any two works
    //bars 0-1 letterbox. bloom and dof are on / off (bloom's strength is the number). the rest go straight into the shader
    looks: {
        clean: { bars: 0, bloom: 0, dof: 0, vignette: 0, grain: 0, chroma: 0, sharpen: 0, tint: 0, contrast: 1, saturation: 1, brightness: 1, sepia: 0 },
        cinematic: { bars: 1, bloom: 0.45, dof: 1, vignette: 0.55, grain: 0.06, chroma: 0.25, sharpen: 0.35, tint: 0.8, contrast: 1.15, saturation: 1.1, brightness: 1, sepia: 0 },
        hype: { bars: 0, bloom: 0.8, dof: 1, vignette: 0.35, grain: 0.04, chroma: 0.8, sharpen: 0.55, tint: 0.35, contrast: 1.25, saturation: 1.45, brightness: 1.05, sepia: 0 },
        retro: { bars: 0, bloom: 0.25, dof: 0, vignette: 0.75, grain: 0.14, chroma: 0.5, sharpen: 0, tint: 0, contrast: 0.95, saturation: 0.55, brightness: 0.97, sepia: 0.5 },
    },
    //bloom and soft background cost by how many pixels they touch: lower quality means a smaller, coarser version
    qualities: {
        low: { bloomScale: 0.25, bloomKernel: 24, blur: "Low" },
        medium: { bloomScale: 0.4, bloomKernel: 40, blur: "Low" },
        high: { bloomScale: 0.5, bloomKernel: 64, blur: "Medium" },
    },
    name: "clean",
    base: "clean", //what the look picker says, a reel goes back to it when it ends
    state: null, //what is on screen right now
    wanted: null,
    kickAmount: 0,
    post: null, //our shader pass
    pipeline: null, //babylon's, for bloom and soft background only
    flags: {},
    lastFlip: 0,
    broken: false,

    setting: function (key, def) {
        return typeof LegacySettings !== "undefined" ? LegacySettings.get(key, def) : def;
    },

    enabled: function () {
        return this.setting("replayLooks", true) && !this.broken;
    },

    start: function () {
        this.state = { ...this.looks.clean };
        this.wanted = { ...this.looks.clean };
        this.name = this.base = "clean";
        this.kickAmount = 0;
        this.broken = false;
        this.flags = {};

        var bar = (side) => ReplayViewer.el("div", { style: "position: fixed; left: 0; right: 0; " + side + ": 0; height: 0; background: #000; z-index: 99990; pointer-events: none" });
        this.top = bar("top");
        this.bottom = bar("bottom");
        this.flashEl = ReplayViewer.el("div", { style: "position: fixed; inset: 0; background: #fff; opacity: 0; z-index: 99991; pointer-events: none" });
        document.body.append(this.top, this.bottom, this.flashEl);
    },

    stop: function () {
        this.disposePost();
        this.disposePipeline();
        [this.top, this.bottom, this.flashEl].forEach((node) => node && node.remove());
        this.top = this.bottom = this.flashEl = null;
        this.state = null;
    },

    setLook: function (name) {
        if (!this.looks[name]) name = "clean";
        this.name = name;
        this.wanted = { ...this.looks[this.enabled() ? name : "clean"] };
    },

    //a quick punch on an impact: colour fringing and contrast jump and settle
    kick: function (amount) {
        this.kickAmount = Math.max(this.kickAmount, amount);
    },

    //a white flash that fades, for an impact
    flash: function (ms, peak) {
        if (!this.flashEl || !this.enabled()) return;
        this.flashEl.style.transition = "none";
        this.flashEl.style.opacity = String(peak === undefined ? 0.5 : peak);
        void this.flashEl.offsetWidth;
        this.flashEl.style.transition = "opacity " + (ms || 180) + "ms ease-out";
        this.flashEl.style.opacity = "0";
    },

    shader: `
        precision highp float;
        varying vec2 vUV;
        uniform sampler2D textureSampler;
        uniform vec2 screen;
        uniform float vignette, grain, time, chroma, sharpen, contrast, saturation, brightness, sepia, tint;
        float rand(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453); }
        void main(void) {
            vec2 uv = vUV, centre = uv - 0.5;
            vec2 shift = centre * chroma * 0.012; //colour fringing grows towards the edges, like a lens
            vec3 c = vec3(texture2D(textureSampler, uv + shift).r, texture2D(textureSampler, uv).g, texture2D(textureSampler, uv - shift).b);
            if (sharpen > 0.001) {
                vec2 px = 1.0 / screen;
                vec3 around = (texture2D(textureSampler, uv + vec2(px.x, 0.0)).rgb + texture2D(textureSampler, uv - vec2(px.x, 0.0)).rgb + texture2D(textureSampler, uv + vec2(0.0, px.y)).rgb + texture2D(textureSampler, uv - vec2(0.0, px.y)).rgb) * 0.25;
                c += (c - around) * sharpen;
            }
            float l = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(vec3(l), c, saturation);
            c = (c - 0.5) * contrast + 0.5;
            c *= brightness;
            vec3 sep = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131)));
            c = mix(c, sep, sepia);
            float lum = dot(c, vec3(0.299, 0.587, 0.114));
            c = mix(c, c * mix(vec3(0.72, 0.95, 1.12), vec3(1.18, 1.0, 0.8), lum), tint); //shadows lean teal, highlights lean orange
            c *= 1.0 - vignette * smoothstep(0.3, 1.0, length(centre) * 1.414);
            c += (rand(uv * screen + time) - 0.5) * grain;
            gl_FragColor = vec4(c, 1.0);
        }
    `,

    ensurePost: function () {
        if (this.post) return;
        BABYLON.Effect.ShadersStore["replayLookFragmentShader"] = this.shader;
        var post = new BABYLON.PostProcess("replayLook", "replayLook", ["screen", "vignette", "grain", "time", "chroma", "sharpen", "contrast", "saturation", "brightness", "sepia", "tint"], null, 1.0, camera);
        post.onApply = (effect) => {
            var s = this.state, kick = this.kickAmount;
            effect.setFloat2("screen", engine.getRenderWidth(), engine.getRenderHeight());
            effect.setFloat("time", (performance.now() / 1000) % 1000);
            effect.setFloat("vignette", s.vignette);
            effect.setFloat("grain", s.grain);
            effect.setFloat("chroma", s.chroma + kick * 3);
            effect.setFloat("sharpen", s.sharpen);
            effect.setFloat("contrast", s.contrast + kick * 0.2);
            effect.setFloat("saturation", s.saturation + kick * 0.3);
            effect.setFloat("brightness", s.brightness);
            effect.setFloat("sepia", s.sepia);
            effect.setFloat("tint", s.tint);
        };
        this.post = post;
    },

    disposePost: function () {
        if (this.post) { try { this.post.dispose(camera) } catch (e) { } };
        this.post = null;
    },

    ensurePipeline: function () {
        if (this.pipeline) return;
        var q = this.qualities[this.setting("replayFxQuality", "medium")] || this.qualities.medium;
        var p = new BABYLON.DefaultRenderingPipeline("replayFx", false, gameScene, [camera], false); //not built yet, so these settings dont each rebuild it
        p.fxaaEnabled = false;
        p.samples = 1;
        p.imageProcessingEnabled = false; //not touched: it is the scene's own image processing, which every material watches
        p.sharpenEnabled = p.grainEnabled = p.chromaticAberrationEnabled = false;
        p.bloomScale = q.bloomScale;
        p.bloomKernel = q.bloomKernel;
        p.bloomThreshold = 0.7;
        p.depthOfFieldBlurLevel = BABYLON.DepthOfFieldEffectBlurLevel[q.blur];
        p.depthOfField.focalLength = 150;
        p.depthOfField.fStop = 2.4;
        p.depthOfField.lensSize = 60;
        p.prepare();
        this.pipeline = p;
        this.flags = {};
    },

    disposePipeline: function () {
        if (this.pipeline) { try { this.pipeline.dispose() } catch (e) { } };
        this.pipeline = null;
        this.flags = {};
    },

    //switching a stage on or off rebuilds the pipeline. so this only happens when the answer changed, and not more than once a second
    flip: function (name, on, set, now) {
        if (this.flags[name] === on) return;
        if (now - this.lastFlip < 1000 && this.flags[name] !== undefined) return;
        this.flags[name] = on;
        this.lastFlip = now;
        set(on);
        this.pipeline.prepare(); //built on demand (it was made with automatic building off), once per switch
    },

    //dt in seconds. every number moves a fraction of the way to where it wants to be, the same fraction of the time at any framerate.
    //nothing in here is allowed to take the render loop down with it: a failure turns the looks off and says so
    frame: function (dt, now) {
        if (!this.state) return;
        try {
            this.step(dt, now);
        } catch (e) {
            this.broken = true;
            console.log("[legacyreplay] looks stopped:", e);
            ReplayViewer.toast("Look effects stopped (see the console)");
            this.wanted = { ...this.looks.clean };
            this.state = { ...this.looks.clean };
            this.disposePost();
            this.disposePipeline();
        };
    },

    step: function (dt, now) {
        if (!this.enabled() && this.name !== "clean") this.setLook("clean"); //switched off in the settings: ease back to clean
        var k = 1 - Math.exp(-dt / 0.45);
        Object.keys(this.state).forEach((key) => this.state[key] += (this.wanted[key] - this.state[key]) * k);
        this.kickAmount *= Math.exp(-dt / 0.2);
        var s = this.state, w = this.wanted;

        //letterbox
        var bars = Math.max(0, (innerHeight - innerWidth / 2.39) / 2) * s.bars;
        if (this.top) this.top.style.height = this.bottom.style.height = Math.round(bars) + "px";

        //our pass: on while anything in it is not neutral, off (and freed) once everything has settled back
        var shaderKeys = ["vignette", "grain", "chroma", "sharpen", "tint", "sepia"];
        var neutral = shaderKeys.every((key) => s[key] < 0.004) && Math.abs(s.contrast - 1) < 0.004 && Math.abs(s.saturation - 1) < 0.004 && Math.abs(s.brightness - 1) < 0.004 && this.kickAmount < 0.01;
        if (!neutral) this.ensurePost(); else if (this.post && Object.keys(w).every((key) => key === "bars" || key === "bloom" || key === "dof" || Math.abs(w[key] - this.looks.clean[key]) < 0.001)) this.disposePost();

        //bloom and soft background: only while the look and the settings want them
        var wantBloom = this.setting("replayFxBloom", true) && w.bloom > 0.02;
        var target = ReplayCamera.target && ReplayCamera.target.actor && ReplayCamera.target.actor.mesh;
        var wantDof = this.setting("replayFxDof", true) && w.dof > 0.5 && !!target && ReplayCamera.mode !== "free" && ReplayCamera.mode !== "first" && ReplayCamera.mode !== "pov";
        if (wantBloom || wantDof) this.ensurePipeline();
        var p = this.pipeline;
        if (p) {
            this.flip("bloom", wantBloom, (on) => p.bloomEnabled = on, now);
            this.flip("dof", wantDof, (on) => p.depthOfFieldEnabled = on, now);
            if (p.bloomEnabled) p.bloomWeight = s.bloom * (1 + this.kickAmount); //writing the weight is cheap, it is not one of the settings that rebuilds
            if (p.depthOfFieldEnabled && target) p.depthOfField.focusDistance = Math.max(0.5, BABYLON.Vector3.Distance(camera.position, target.position)) * 1000;
            if (!wantBloom && !wantDof && !p.bloomEnabled && !p.depthOfFieldEnabled && now - this.lastFlip > 2000) this.disposePipeline();
        };
    },
};
