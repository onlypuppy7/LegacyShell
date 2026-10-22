//legacyshell: replay audio (browser bundle only). the game's sound already comes from wherever the camera is, so this adds what a film has: the game's sound muffled while time is slow,
//music that dips under the big moments, and a few synthesised sounds (a whoosh as a bullet leaves, a thud as it lands). nothing here needs a sound file, and nothing is sent anywhere
//

export const ReplayAudio = {
    ctx: null,
    music: null, //{ name, buffer } from a file the viewer chose
    source: null,
    wired: false,

    setting: function (key, def) {
        return typeof LegacySettings !== "undefined" ? LegacySettings.get(key, def) : def;
    },

    //howler plays everything through one gain node, so the game's whole sound can be put through a filter by wedging it in between
    start: function () {
        try {
            this.ctx = Howler.ctx;
            if (!this.ctx || !Howler.masterGain) return;
            this.filter = this.ctx.createBiquadFilter();
            this.filter.type = "lowpass";
            this.filter.frequency.value = 22000;
            this.filter.Q.value = 0.7;
            Howler.masterGain.disconnect();
            Howler.masterGain.connect(this.filter);
            this.filter.connect(this.ctx.destination);
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0;
            this.musicGain.connect(this.ctx.destination); //music and the sounds below go round the filter, so they stay clear while the game's sound is muffled
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.8;
            this.sfxGain.connect(this.ctx.destination);
            this.wired = true;
        } catch (e) {
            console.log("[legacyreplay] audio effects are not available:", e);
            this.wired = false;
        };
    },

    //the sound as it is mixed (game, music, effects) as a stream, for recording a video
    tap: function () {
        if (!this.wired) return null;
        if (!this.capture) {
            this.capture = this.ctx.createMediaStreamDestination();
            [this.filter, this.musicGain, this.sfxGain].forEach((node) => node.connect(this.capture));
        };
        return this.capture.stream;
    },

    untap: function () {
        if (!this.capture) return;
        [this.filter, this.musicGain, this.sfxGain].forEach((node) => { try { node.disconnect(this.capture) } catch (e) { } });
        this.capture = null;
    },

    stop: function () {
        this.untap();
        this.stopMusic();
        if (!this.wired) return;
        try {
            this.filter.disconnect();
            Howler.masterGain.disconnect();
            Howler.masterGain.connect(this.ctx.destination);
        } catch (e) { };
        this.wired = false;
    },

    //the game's sound goes dull as time slows: full range at half speed and above, down to a low rumble at a crawl
    frame: function (speed) {
        if (!this.wired) return;
        var muffle = this.setting("replayMuffle", true);
        var u = Math.max(0, Math.min(1, (0.6 - speed) / 0.55));
        var freq = muffle ? 22000 * Math.pow(650 / 22000, u) : 22000; //an even drop on the log scale, which is how ears hear pitch
        this.filter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.12);
    },

    loadMusic: async function (file) {
        if (!this.ctx) this.ctx = Howler.ctx;
        if (!this.ctx) throw new Error("no audio on this browser");
        if (file.size > 40 * 1024 * 1024) throw new Error("that file is too big for music (40MB)");
        var buffer = await this.ctx.decodeAudioData(await file.arrayBuffer());
        this.music = { name: file.name, buffer };
    },

    clearMusic: function () {
        this.stopMusic();
        this.music = null;
    },

    volume: function () {
        return Math.max(0, Math.min(1, this.setting("replayMusicVolume", 0.6)));
    },

    playMusic: function () {
        if (!this.wired || !this.music) return;
        this.stopMusic();
        this.source = this.ctx.createBufferSource();
        this.source.buffer = this.music.buffer;
        this.source.loop = true;
        this.source.connect(this.musicGain);
        this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.musicGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.musicGain.gain.linearRampToValueAtTime(this.volume(), this.ctx.currentTime + 0.8); //fades in
        this.source.start();
    },

    stopMusic: function () {
        if (!this.source) return;
        var source = this.source;
        this.source = null;
        try {
            this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
            this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
            setTimeout(() => { try { source.stop() } catch (e) { } }, 900);
        } catch (e) { };
    },

    //the music gets out of the way for a moment (a kill, an impact)
    duck: function (ms, amount) {
        if (!this.wired || !this.source) return;
        var now = this.ctx.currentTime, gain = this.musicGain.gain;
        gain.cancelScheduledValues(now);
        gain.setTargetAtTime(this.volume() * (amount === undefined ? 0.3 : amount), now, 0.03);
        gain.setTargetAtTime(this.volume(), now + (ms || 700) / 1000, 0.3);
    },

    noise: function (seconds) {
        var buffer = this.ctx.createBuffer(1, Math.ceil(this.ctx.sampleRate * seconds), this.ctx.sampleRate), data = buffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    },

    //a bullet leaving: filtered noise sweeping up and fading
    whoosh: function () {
        if (!this.wired || !this.setting("replaySfx", true)) return;
        var ctx = this.ctx, now = ctx.currentTime;
        var source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
        source.buffer = this.noise(1.2);
        filter.type = "bandpass";
        filter.Q.value = 1.4;
        filter.frequency.setValueAtTime(300, now);
        filter.frequency.exponentialRampToValueAtTime(3200, now + 0.9);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.5, now + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
        source.connect(filter).connect(gain).connect(this.sfxGain);
        source.start(now);
        source.stop(now + 1.2);
    },

    //an impact: a low thump that drops in pitch, and a short click on top
    thud: function () {
        if (!this.wired || !this.setting("replaySfx", true)) return;
        var ctx = this.ctx, now = ctx.currentTime;
        var osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.4);
        gain.gain.setValueAtTime(0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        osc.connect(gain).connect(this.sfxGain);
        osc.start(now);
        osc.stop(now + 0.6);

        var click = ctx.createBufferSource(), clickFilter = ctx.createBiquadFilter(), clickGain = ctx.createGain();
        click.buffer = this.noise(0.1);
        clickFilter.type = "lowpass";
        clickFilter.frequency.value = 1800;
        clickGain.gain.setValueAtTime(0.5, now);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
        click.connect(clickFilter).connect(clickGain).connect(this.sfxGain);
        click.start(now);
        click.stop(now + 0.1);
    },
};
