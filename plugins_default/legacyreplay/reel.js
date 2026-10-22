//legacyshell: replay reel player (browser bundle only). plays the shot list ReplayDirector made: for each shot it jumps to the right time (or carries straight on), points the camera, and runs the speed curve.
//

export const ReplayReel = {
    active: false,
    shots: [],
    i: -1,
    busy: false,

    //reel = what ReplayDirector.reel gave back
    start: async function (reel) {
        if (!reel.shots.length) return false;
        this.stop();
        this.active = true;
        this.shots = reel.shots;
        this.reel = reel;
        this.look = reel.look || "clean";
        this.whole = !!reel.whole; //the editor lights up the current shot only when the whole reel is playing, not a preview of one
        this.i = -1;
        ReplayAudio.playMusic();
        try {
            await this.goto(0, true);
        } catch (e) {
            this.failed(e);
            return false;
        };
        return true;
    },

    //a shot that cant be set up ends the reel rather than leaving it stuck half way
    failed: function (e) {
        console.log("[legacyreplay] reel stopped:", e);
        this.stop();
    },

    stop: function () {
        if (!this.active) return;
        this.active = false;
        this.shots = [];
        ReplayCamera.stopBullet();
        ReplayAudio.stopMusic();
        ReplayFx.setLook(ReplayFx.base);
        ReplaySession.setSpeed(1);
        ReplayViewer.reelChanged();
        if (this.onEnd) { var done = this.onEnd; this.onEnd = null; done() };
    },

    //carry on from where it is (a shot that follows straight on from the last one) or jump to the start of this one (a cut)
    goto: async function (i, jump) {
        var shot = this.shots[i];
        this.busy = true;
        try {
            this.i = i;
            if (jump) {
                //a shot marked smooth glides from where the camera is to the new place instead of cutting, even when the replay jumps
                var glide = !!shot.smooth;
                ReplayCamera.smoothNext = glide;
                await ReplaySession.seek(shot.start);
                if (!glide) ReplayCamera.cut();
            };
            this.apply(shot);
            if (!ReplaySession.playing) ReplaySession.play();
        } finally {
            this.busy = false;
        };
        ReplayViewer.reelChanged();
    },

    apply: function (shot) {
        this.fired = this.hit = false;
        ReplayCamera.smoothNext = !!shot.smooth;
        this.lastT = ReplaySession.time;
        ReplayFx.setLook(shot.fx || (this.look !== "clean" ? this.look : ReplayFx.base));
        if (shot.view === "bullet") ReplayCamera.startBullet(shot);
        else if (shot.view === "free" || shot.target === null || !players_by_id[shot.target]) ReplayCamera.free();
        else ReplayCamera.watch(shot.target, shot.view);
        ReplayCamera.smoothNext = false;
    },

    //the sounds and flashes that go with the moments: a whoosh as the bullet leaves, a thump and a flash as it lands, and the music making room for each kill
    events: function (shot, from, to) {
        var b = shot.view === "bullet" && shot.bullet;
        if (b && !this.fired && from < b.tFire && to >= b.tFire) { this.fired = true; ReplayAudio.whoosh(); ReplayFx.kick(0.1) };
        if (b && !this.hit && from < b.tHit && to >= b.tHit) { this.hit = true; ReplayAudio.thud(); ReplayAudio.duck(900, 0.25); ReplayFx.flash(220, 0.45); ReplayFx.kick(0.4) };
        ReplaySession.kills.forEach((kill) => {
            if (kill.tMs <= from || kill.tMs > to || (b && Math.abs(kill.tMs - b.tHit) < 150)) return;
            ReplayAudio.duck(500, 0.5);
            ReplayFx.kick(0.15);
        });
    },

    //every render frame, from ReplaySession.frame
    frame: function () {
        if (!this.active || this.busy) return;
        var shot = this.shots[this.i], t = ReplaySession.time;

        ReplaySession.setSpeed(ReplayDirector.rate(shot.speed, t), true);
        this.events(shot, this.lastT === undefined ? t : this.lastT, t);
        this.lastT = t;

        if (t < shot.end) return;
        var next = this.shots[this.i + 1];
        if (!next) {
            ReplaySession.pause();
            return this.stop();
        };
        //a shot that picks up where this one ended just changes the camera (and the camera blends, nothing snaps), a new moment is a cut
        this.goto(this.i + 1, next.cut || Math.abs(next.start - t) > 600).catch(this.failed.bind(this));
    },
};
