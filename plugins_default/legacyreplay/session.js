//legacyshell: replay session (browser bundle only). plays a parsed .lsreplay inside the real game: same map, same players, same effects, because the recorded packets go through the game's own message handler
//

export const ReplaySession = {
    active: false,
    playing: false,
    time: 0, //ms into the replay
    duration: 0,
    records: [],
    header: null,
    markers: [],
    idx: 0,
    feeding: false,
    seeking: false,
    errors: 0,
    dummyId: 254, //the "me" the game needs, never plays
    speed: 1,
    interp: new Map(), //what was last drawn for each thing that moves (see interpolate)

    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;

        this.plugins.on('game:onMapComplete', (data) => { if (this.active) setTimeout(() => this.begin().catch(this.failed.bind(this)), 100) }); //after onMapComplete has finished its own setup
        this.plugins.on('game:leaveGame', () => this.cleanup());
        this.plugins.on('game:LegacyShellOnMessage', (data) => { if (this.active) this.sanitize(data) });
    },

    //a replay can carry any text, and the game puts chat and notifications into html. the server turns < into ( before it sends, so a replay gets the same treatment, in place (same length, nothing shifts)
    //a command the game doesn't know, or one that is never in a recording, can only be bytes that were mistaken for a command (the one before it took less than it should have), and what the game does with the
    //rest of them is run them as commands: remove players, say a game was joined. so the rest of that record is dropped, and said where, once
    lost: function (data) {
        var recent = this.recent || (this.recent = []);
        recent.push(data.cmd);
        if (recent.length > 6) recent.shift();
        var strays = [Comm.Code.gameJoined, Comm.Code.keyUp, Comm.Code.controlKeys];
        if (data.cmdName !== "unknownCode" && !strays.includes(data.cmd)) return false;
        var record = this.current;
        if (record && !this.warned) {
            this.warned = true;
            console.log("[legacyreplay] a record went out of step and the rest of it was dropped: command " + data.cmd + " (" + data.cmdName + ") at byte " + (data.input.idx - 1) + " of a " + record.data.length + " byte record of type " + record.type + " at " + Math.round(record.tMs) + " ms, the commands before it " + recent.slice(0, -1).join(",") + ", the record starts " + Array.from(record.data.slice(0, 24)).join(","));
        };
        data.input.idx = data.input.buffer.length;
        this.plugins.cancel = true;
        return true;
    },

    sanitize: function (data) {
        if (this.lost(data)) return;
        var input = data.input, buffer = input.buffer, at = input.idx, chars, from;

        if (data.cmd === Comm.Code.chat) { //u8 type, u8 id, u16 length, chars
            if (at + 4 > buffer.length) return;
            chars = buffer[at + 2] | (buffer[at + 3] << 8), from = at + 4;
        } else if (data.cmd === Comm.Code.notification) { //u8 length, chars, then u8 seconds
            if (at + 1 > buffer.length) return;
            chars = buffer[at], from = at + 1;
        } else return;

        if (from + chars * 2 > buffer.length) { //cut off, the rest of this message cant be trusted
            this.plugins.cancel = true;
            return input.idx = buffer.length;
        };
        for (var i = 0; i < chars; i++) {
            if (buffer[from + i * 2] === 60 && buffer[from + i * 2 + 1] === 0) buffer[from + i * 2] = 40;
        };
    },

    failed: function (e) {
        console.log("[legacyreplay] session failed:", e);
        LegacyReplay.chat("Couldn't play that replay: " + ReplayFormat.escapeHtml(e.message));
        if (this.active) showMainMenu();
    },

    //bytes = a whole .lsreplay. everything is read through the safe reader first, nothing touches the game until it passes
    start: async function (bytes) {
        if (inGame || this.active) throw new Error("leave the current game first");

        var body = await ReplayFormat.unpack(bytes);
        var parsed = ReplayFormat.parse(body);
        if (!parsed.records.length) throw new Error("the replay is empty" + (parsed.error ? " (" + parsed.error + ")" : ""));
        if (parsed.error) console.log("[legacyreplay] replay is damaged after " + parsed.records.length + " records:", parsed.error);

        this.live = false;
        this.open(parsed, body);
    },

    //a recording still being made (a caster's connection, see live.js): what has arrived so far, and more through liveRecord
    startLive: function (header, records) {
        if (inGame || this.active) throw new Error("leave the current game first");
        this.live = true;
        this.following = true;
        this.open({ header, records, error: null }, null);
    },

    open: function (parsed, body) {
        this.header = parsed.header;
        this.key = parsed.header.mapHash + ":" + parsed.header.startTime; //which replay this is, for the reels saved against it
        this.records = parsed.records;
        this.markers = parsed.records.filter((r) => r.type === ReplayFormat.Type.marker).map((r) => ({ tMs: r.tMs, label: r.data.label, kind: r.data.kind }));
        this.duration = Math.max(this.header.duration, this.records[this.records.length - 1].tMs);
        this.kills = parsed.records.filter((r) => r.type === ReplayFormat.Type.marker && r.data.kind === "kill").map((r) => ({ tMs: r.tMs, by: r.data.a, victim: r.data.b }));
        this.baseTickStep = TickStep;
        this.mergeItems();
        this.trust = null;
        if (body) LegacyReplay.verify(body, parsed).then((trust) => { if (this.active) { this.trust = trust; ReplayViewer.reelChanged() } }).catch(() => { });
        this.speed = 1;
        this.damaged = parsed.error;
        this.idx = 0;
        this.time = this.now = 0;
        this.errors = 0;
        this.warned = false;
        this.playing = false;
        this.active = true;

        //what a join would have set. the embedded map is used instead of looking one up by number, so editing a map later cant break an old replay
        document.getElementById("mainMenu").style.display = "none";
        minMap = this.header.map;
        mapIdx = this.header.mapId;
        gameType = this.header.gameType;
        gameId = 0;
        gameKey = 0;
        myTeam = 0;
        meId = this.dummyId;
        playerLimit = 18;
        isGameOwner = false;
        ws = { readyState: 3, OPEN: 1, send: function () { }, close: function () { } }; //nothing to send to, and nothing is sent: the game only sends while it is OPEN
        inGame = true;
        startGame();
    },

    //items the replay's players have that this game doesn't (removed or changed since): added for as long as the replay is open, so they can still be built
    mergeItems: function () {
        this.addedItems = this.addedItems || [];
        var before = this.addedItems.length;
        (this.header.items || []).forEach((item) => {
            if (Number.isInteger(item.id) && !catalog.findItemById(item.id)) { catalog.Items.push(item); this.addedItems.push(item) };
        });
        if (this.addedItems.length > before) catalog.setupCatalog();
    },

    unmergeItems: function () {
        if (!this.addedItems || !this.addedItems.length) return;
        catalog.Items = catalog.Items.filter((item) => !this.addedItems.includes(item));
        this.addedItems = [];
        catalog.setupCatalog();
    },

    //names are made up as the players are built, so every name that is shown (list, tags, kill ticker) is the made up one
    wrapAddPlayer: function () {
        if (this.addPlayerOriginal) return;
        this.addPlayerOriginal = addPlayer;
        addPlayer = (data) => this.addPlayerOriginal(this.anonymous() && data.id !== meId ? { ...data, name: "Player " + data.id, username: "" } : data);
    },

    unwrapAddPlayer: function () {
        if (!this.addPlayerOriginal) return;
        addPlayer = this.addPlayerOriginal;
        this.addPlayerOriginal = null;
    },

    anonymous: function () {
        return typeof LegacySettings !== "undefined" && !!LegacySettings.get("replayAnonymise", false);
    },

    //the map is built, this is where a real game would get clientReady
    begin: async function () {
        addPlayer({
            id: meId, uniqueId: 0, name: "", classIdx: 0, team: 0,
            primaryWeaponItem: playerAccount.getPrimaryWeapon(), secondaryWeaponItem: playerAccount.getSecondaryWeapon(),
            shellColor: 0, hatItem: null, stampItem: null, score: 0, kills: 0, deaths: 0, streak: 0, totalKills: 0, totalDeaths: 0, bestGameStreak: 0, bestOverallStreak: 0,
            x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, frame: 0, pitch: 0, yaw: 0, shield: 0, hp: 0, playing: false, weaponIdx: 0, controlKeys: 0, randomSeed: 0, upgradeProductId: 0,
        });

        document.body.classList.add("replayMode");
        startRendering();
        document.onpointerlockchange = null; //the game's own handler would pause and respawn the dummy
        document.onkeydown = document.onkeyup = null; //ReplayCamera / ReplayViewer have their own

        this.wrapSounds();
        this.wrapAmmo();
        if (typeof WeatherRender !== "undefined" && !this.weatherClock) { this.weatherClock = WeatherRender.clock; WeatherRender.clock = () => ReplaySession.worldClock() }; //the sun and the weather go by the replay's time
        this.wrapPlayerList();
        this.wrapAddPlayer();
        ReplayAudio.start();
        ReplayFx.start();
        gameScene.registerBeforeRender(() => this.frame());
        ReplayCamera.start();
        ReplayViewer.open();

        await this.warmUp();
        await this.seek(0);
        //their view with their hud, it is what it was like to be them. whoever got the most kills, since a clip is usually of them, and if they haven't spawned yet the camera waits and goes to them
        var score = {}, star = null;
        this.kills.forEach((k) => score[k.by] = (score[k.by] || 0) + 1);
        Object.keys(score).forEach((id) => { if (star === null || score[id] > score[star]) star = Number(id) });
        ReplayCamera.cycle(1, "pov");
        if (star !== null && players_by_id[star] && players_by_id[star].playing && ReplayCamera.targetId !== star) ReplayCamera.watch(star, "pov");
        if (ReplayCamera.mode === "overview") ReplayCamera.free();
        if (star !== null && ReplayCamera.mode === "free") { ReplayCamera.wantedId = star; ReplayCamera.autoFree = "pov" };
        this.play();
    },

    cleanup: function () {
        if (typeof ReplayLive !== "undefined") ReplayLive.close();
        if (!this.active) return;
        ReplayReel.stop();
        this.active = this.playing = this.live = false;
        this.records = [];
        document.body.classList.remove("replayMode");
        freezeFrame = false;
        if (this.baseTickStep) TickStep = this.baseTickStep;
        this.speed = 1;
        this.unwrapSounds();
        this.unwrapAmmo();
        if (typeof WeatherRender !== "undefined" && this.weatherClock) { WeatherRender.clock = this.weatherClock; this.weatherClock = null };
        this.paths = null;
        this.unwrapPlayerList();
        this.unwrapAddPlayer();
        this.unmergeItems();
        this.interp.clear();
        ReplayFx.stop();
        ReplayAudio.stop();
        ReplayCamera.stop();
        ReplayViewer.close();
    },

    play: function () {
        if (!this.live && this.time >= this.duration) return this.seek(0).then(() => this.play());
        this.playing = true;
        freezeFrame = false;
        lastTimeStamp = performance.now(); //or the game loop would run every tick it "missed" while paused
        this.lastFrame = performance.now();
    },

    pause: function () {
        this.playing = false;
        freezeFrame = true; //the game stops moving everyone but the dummy, so nobody glides on while we aren't feeding packets
    },

    //slower or faster than real time by changing how long a game tick is: everything the game moves per tick (players, bullets) then moves at that speed, and the game's own
    //smoothing between ticks keeps it fluid. records are fed at the same rate
    setSpeed: function (speed, quiet) {
        this.speed = Math.max(0.05, Math.min(8, speed));
        TickStep = this.baseTickStep / this.speed;
        if (gameScene) gameScene.animationTimeScale = this.speed; //babylon's own animations (the gun and hand animations) run on real time otherwise
        if (!quiet) ReplayViewer.refresh();
    },

    toggle: function () {
        this.playing ? this.pause() : this.play();
    },

    frame: function () {
        if (!this.active || this.seeking) return;
        var now = performance.now();
        var dt = Math.max(0, Math.min(now - (this.lastFrame || now), this.maxStep || 100)); //a hitch (or a slow machine) must not skip ahead through a slow motion stretch
        this.lastFrame = now;
        this.interpolate(now);
        this.sweepNameSprites();
        ReplayFx.frame(dt / 1000, now);
        ReplayAudio.frame(this.speed);
        if (!this.playing) return;

        //watching live, playback stays a little behind what has arrived, so a slow packet doesn't stall it. further behind than that it is just a replay, until you go live
        var limit = this.duration;
        if (this.live) {
            this.following = this.time >= this.duration - this.liveDelay - 1000;
            if (this.following) limit = Math.max(this.time, this.duration - this.liveDelay);
        };
        this.time = Math.min(this.time + dt * this.speed, limit);
        this.feedUntil(this.time);
        ReplayReel.frame();
        if (!this.live && this.time >= this.duration && !this.feeding && this.idx >= this.records.length) this.pause();
    },

    //a player who stops playing without the game hiding their name (it only does when it runs the death itself) leaves the name hanging in the air
    sweepNameSprites: function () {
        var kept = new Set();
        iteratePlayers((player) => {
            if (player.actor && player.actor.nameSprite && (!player.playing || !player.actor.mesh.isEnabled())) player.actor.hideNameSprite();
            if (player.actor && player.actor.nameSprite) kept.add(player.actor.nameSprite);
        });
        //a player made again (everyone is at a seek, and a keyframe makes them all, a respawn can) leaves the old one's tag hanging in the air, with nothing to take it down: any tag that is nobody's goes
        if (typeof nameSprites !== "undefined" && nameSprites && nameSprites.sprites) nameSprites.sprites.slice().forEach((sprite) => { if (!kept.has(sprite)) sprite.dispose() });
    },

    liveDelay: 1500,

    //a record from the caster's connection, put on the end exactly as if it had been in the file
    liveRecord: function (type, tMs, data) {
        if (!this.active || !this.live) return;
        var T = ReplayFormat.Type;
        if (type === T.marker) {
            try { data = ReplayFormat.cleanMarker(data) } catch (e) { return };
            this.markers.push({ tMs, label: data.label, kind: data.kind });
            if (data.kind === "kill") this.kills.push({ tMs, by: data.a, victim: data.b });
        } else if (type === T.sync && (data.length === 0 || data.length % ReplayFormat.syncEntrySize(this.header.syncFrames) !== 0)) return;
        tMs = Math.max(tMs, this.duration);
        this.records.push({ type, tMs, data, toId: null });
        this.duration = tMs;
    },

    //the connection ended: what there is now is an ordinary replay
    liveEnded: function () {
        if (!this.live) return;
        this.live = false;
        ReplayViewer.reelChanged();
    },

    //back to the edge
    goLive: async function () {
        if (!this.live) return;
        ReplayReel.stop();
        await this.seek(Math.max(0, this.duration - this.liveDelay));
        if (!this.playing) this.play();
    },

    sleep: function (ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    },

    feedUntil: async function (tMs) {
        if (this.feeding) return;
        this.feeding = true;
        try {
            while (this.idx < this.records.length && this.records[this.idx].tMs <= tMs) {
                var record = this.records[this.idx++];
                if (record.type !== ReplayFormat.Type.keyframe) await this.feed(record); //keyframes are only for starting and seeking, playing straight through the state is already right
            };
        } finally {
            this.feeding = false;
            this.flushPlayerList();
        };
    },

    feed: async function (record) {
        var T = ReplayFormat.Type;
        if (record.type !== T.packets && record.type !== T.sync && record.type !== T.keyframe) return;
        this.now = record.tMs; //when it is, for what only counts from the packets
        try {
            this.beforePacket(record);
            this.current = record;
            this.recent = [];
            await LegacyShellOnMessage({ data: await LegacyReplay.prepareRecord(record, this.header) });
            this.afterPacket(record);
        } catch (e) {
            if (++this.errors <= 5) console.log("[legacyreplay] record failed:", e);
        };
    },

    //the first of anything the game draws costs a stutter (a shader compiled, a mesh built): the first grenade thrown, the first explosion, and so the first bang of a reel, and a video of it, had one.
    //so one of each is drawn before it starts, far too small to see
    warmUp: async function () {
        var made = [], at = camera.getForwardRay(3).origin.add(camera.getForwardRay(3).direction.scale(3));
        try {
            ["bullet", "rocket"].forEach((name) => { var mesh = gameScene.getMeshByName(name); if (mesh) made.push(mesh.createInstance("")) });
            if (gameScene.cloneMesh) made.push(gameScene.cloneMesh("grenade"));
            made.forEach((mesh) => { mesh.position.copyFrom(at); mesh.scaling.set(0.001, 0.001, 0.001); mesh.setEnabled(true) });
            addExplosionSprite(explosionSmokeManager, 1, at.x, at.y, at.z, 0, 0, 0, 0.001, false);
            addExplosionSprite(explosionFireManager, 1, at.x, at.y, at.z, 0, 0, 0, 0.001, false);
        } catch (e) { console.log("[legacyreplay] warm up failed:", e) };
        await new Promise((resolve) => { var done = () => { clearTimeout(timer); resolve() }, timer = setTimeout(done, 700); requestAnimationFrame(() => requestAnimationFrame(done)) }); //(a page nobody is looking at doesn't draw, so it can't wait for that)
        made.forEach((mesh) => { try { mesh.dispose() } catch (e) { } });
    },

    //the replay's own time, for anything that keeps a clock (the sun). while records are being run it is the time of the one being run, which a seek goes through at once
    worldClock: function () {
        return 1e6 + (this.active ? (this.feeding || this.seeking ? this.now : this.time) : performance.now());
    },

    //what the game only does for me, done for everyone here (a record is one packet when it is one of these, they go out on their own)
    //a thrown grenade: the game freezes the hand for the throw when it is me winding up, nobody else's, so the throw animation was overwritten every tick
    beforePacket: function (record) {
        var d = record.data;
        if (record.type !== ReplayFormat.Type.packets || d[0] !== Comm.Code.throwGrenade || d.length !== 14) return;
        var player = players_by_id[d[1]];
        if (player && player.id !== meId && player.actor && player.actor.gripBone) { player.actor.throwingGrenade = true; player.actor.gripBone._frozen = true }; //the throw animation puts them back when it ends
    },

    //picking up ammo or a grenade: the game gives it to me alone (it is the only one it ever tracks), and plays the sound for me
    afterPacket: function (record) {
        var d = record.data;
        if (record.type !== ReplayFormat.Type.packets || d[0] !== Comm.Code.collectItem || d.length !== 6) return;
        var player = players_by_id[d[1]];
        if (!player || player.id === meId || !player.weapons) return;
        this.quiet = !(ReplayCamera.target === player && (ReplayCamera.mode === "first" || ReplayCamera.mode === "pov")); //only heard from the one being watched
        try { player.collectItem(d[2], d[3]) } catch (e) { if (++this.errors <= 5) console.log("[legacyreplay] pickup failed:", e) };
        this.quiet = false;
    },

    //the world as it was at tMs: clear everything, load the keyframe at or before, then run the packets up to there with the sound off
    seek: async function (tMs) {
        tMs = Math.min(Math.max(0, tMs), this.duration);
        while (this.feeding) await this.sleep(5);
        this.seeking = true;
        var wasPlaying = this.playing;
        try {
            Howler.mute(true);
            this.feeding = true;
            //a little further on is quicker to just run on to: rebuilding every player is what takes the time (and is a visible stutter at every cut of a reel)
            var onward = tMs >= this.time && tMs - this.time <= 20000 && this.idx > 0;
            if (onward) this.clearMunitions();
            else {
                this.resetWorld();
                if (typeof WeatherRender !== "undefined") WeatherRender.snapNext = true;

                var k = ReplayFormat.findKeyframe(this.records, tMs);
                if (k < 0) k = this.records.findIndex((r) => r.type === ReplayFormat.Type.keyframe); //asked for before the first one
                if (k >= 0) await this.feed(this.records[k]);
                this.idx = k >= 0 ? k + 1 : 0;
            };
            while (this.idx < this.records.length && this.records[this.idx].tMs <= tMs) {
                var record = this.records[this.idx++];
                if (record.type !== ReplayFormat.Type.keyframe) await this.feed(record);
            };
            this.feeding = false;
            this.flushPlayerList();

            if (onward) this.snapPlayers();
            this.time = tMs;
            if (typeof WeatherRender !== "undefined" && WeatherRender.refresh) WeatherRender.refresh(); //the state as of now, in place at once
            ReplayCamera.afterSeek();
        } finally {
            this.feeding = false;
            Howler.stop(); //anything the catching up started that is still going
            Howler.mute(false);
            this.seeking = false;
            this.lastFrame = performance.now();
            if (wasPlaying) lastTimeStamp = performance.now();
        };
    },

    //where everyone was and which way they looked, from the recorded syncs (about ten a second, with the six ticks of aim that follow each), as paths in time: a player is drawn at a point on their path,
    //not wherever the game has got to by guessing between syncs (which is what is wrong every tenth of a second, and a wobble from inside someone's head). a recording is all there, so the point can be
    //between this sync and the next. a live one isn't, and goes by the ticks
    buildPaths: function () {
        var size = ReplayFormat.syncEntrySize(this.header.syncFrames), frames = this.header.syncFrames, paths = new Map();
        this.records.forEach((record, i) => {
            if (record.type !== ReplayFormat.Type.sync) return;
            var d = record.data, view = new DataView(d.buffer, d.byteOffset, d.byteLength);
            for (var b = 0; b + size <= d.length; b += size) {
                var id = d[b + 1], path = paths.get(id);
                if (!path) paths.set(id, path = { t: [], x: [], y: [], z: [], yaw: [], pitch: [] });
                path.t.push(record.tMs);
                path.x.push(view.getInt16(b + 3, true) / 300); path.y.push(view.getInt16(b + 5, true) / 300); path.z.push(view.getInt16(b + 7, true) / 300);
                var yaws = [], pitches = [];
                for (var f = 0; f < frames; f++) { var at = b + 17 + f * 5; yaws.push(view.getUint16(at + 1, true) / 1e4); pitches.push(view.getUint16(at + 3, true) / 1e4 - Math.PI) };
                path.yaw.push(yaws); path.pitch.push(pitches);
            };
        });
        return paths;
    },

    //a point on a path: position by a smooth curve through the syncs (a teleport, a respawn, is not smoothed over), aim by the tick it is nearest
    pathAt: function (path, t) {
        var ts = path.t, n = ts.length;
        if (!n || t < ts[0]) return null;
        var lo = 0, hi = n - 1;
        while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (ts[mid] <= t) lo = mid; else hi = mid - 1 };
        var k = lo, next = Math.min(n - 1, k + 1), gap = ts[next] - ts[k], u = gap > 0 ? Math.max(0, Math.min(1, (t - ts[k]) / gap)) : 0;
        var at = (key) => path[key][k] + (path[key][next] - path[key][k]) * u, out = {};
        var jump = (a, b) => Math.hypot(path.x[a] - path.x[b], path.z[a] - path.z[b]) > 3 || Math.abs(path.y[a] - path.y[b]) > 3; //far in a tenth of a second is a respawn
        if (next === k || gap > 400 || jump(k, next)) { out.x = path.x[k]; out.y = path.y[k]; out.z = path.z[k] }
        else {
            var before = jump(Math.max(0, k - 1), k) ? k : Math.max(0, k - 1), after = jump(next, Math.min(n - 1, next + 1)) ? next : Math.min(n - 1, next + 1);
            ["x", "y", "z"].forEach((axis) => { //a Catmull-Rom curve through the points either side, by time
                var p = path[axis], m0 = (p[next] - p[before]) / Math.max(1, ts[next] - ts[before]) * gap, m1 = (p[after] - p[k]) / Math.max(1, ts[after] - ts[k]) * gap;
                var u2 = u * u, u3 = u2 * u;
                out[axis] = (2 * u3 - 3 * u2 + 1) * p[k] + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * p[next] + (u3 - u2) * m1;
            });
        };
        //aim: the six ticks after each sync, laid out across the gap to the next
        var frames = path.yaw[k].length, tick = Math.min(frames - 1, Math.floor(u * frames)), nextTick = tick + 1;
        var yawA = path.yaw[k][tick], pitchA = path.pitch[k][tick], yawB, pitchB;
        if (nextTick < frames) { yawB = path.yaw[k][nextTick]; pitchB = path.pitch[k][nextTick] } else { yawB = path.yaw[next][0]; pitchB = path.pitch[next][0] };
        var v = Math.max(0, Math.min(1, u * frames - tick));
        out.yaw = yawA + ReplayCamera.angleDiff(yawB, yawA) * v;
        out.pitch = pitchA + (pitchB - pitchA) * v;
        return out;
    },

    //the game only moves things on its ticks (60 a second) and its smoothing closes the gap in a couple of frames, so everything steps: on a screen that draws more than that, every frame
    //the same as the last or a whole tick on, which from inside someone's head (or on a grenade) is a shake. slowed down it is worse (a tenth speed is 6 ticks a second). so what is drawn is
    //worked out here instead: between where a thing was at the last tick and where it is now, by how far through the tick it is (measured from how long the last tick really took).
    //sped up far enough there is more than a tick in a frame and nothing to fill in
    interpolate: function (now) {
        if (!this.live && !this.paths && this.header) this.paths = this.buildPaths();
        var ticks = this.speed < 3 && !this.paths; //with the paths there is nothing to fill in for players, whatever the speed
        if (this.speed >= 3 || this.paths) this.interp.size && this.interp.clear();

        var turn = (to, from) => ReplayCamera.angleDiff(to, from);
        var step = (key, mesh, head, cur, minGap) => {
            var s = this.interp.get(key);
            if (!s) this.interp.set(key, s = { a: cur, b: cur, tB: now, interval: 100 });
            else if (cur[0] !== s.b[0] || cur[1] !== s.b[1] || cur[2] !== s.b[2] || cur[3] !== s.b[3] || cur[4] !== s.b[4]) {
                s.interval = s.interval * 0.6 + Math.max(minGap, Math.min(now - s.tB, 600)) * 0.4;
                s.a = s.b; s.b = cur; s.tB = now;
            };
            var jump = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.b[2] - s.a[2]) > 4; //a respawn or a seek is a jump, not a move to blend
            var u = jump ? 1 : Math.max(0, Math.min(1, (now - s.tB) / s.interval));
            mesh.position.x = s.a[0] + (s.b[0] - s.a[0]) * u;
            mesh.position.y = s.a[1] + (s.b[1] - s.a[1]) * u;
            mesh.position.z = s.a[2] + (s.b[2] - s.a[2]) * u;
            if (head) {
                mesh.rotation.y = s.a[3] + turn(s.b[3], s.a[3]) * u;
                head.rotation.x = s.a[4] + (s.b[4] - s.a[4]) * u;
            };
        };

        iteratePlayers((player) => {
            if (player.id === meId || !player.playing || !player.actor || !player.actor.mesh) return;
            var path = this.paths && this.paths.get(player.id), at = path && this.pathAt(path, this.time);
            if (at && Math.hypot(at.x - player.x, at.z - player.z) < 6) { //where the game has the player is where they are, give or take a guess: further off is a seek or a respawn the path hasn't got to
                player.actor.mesh.position.set(at.x, at.y, at.z);
                player.actor.mesh.rotation.y = at.yaw;
                if (player.actor.head) player.actor.head.rotation.x = at.pitch;
            } else if (this.speed < 3) step(player, player.actor.mesh, player.actor.head, [player.x, player.y, player.z, player.yaw, player.pitch], 8);
        });
        if (this.speed >= 3) return;
        [munitionsManager.bulletPool, munitionsManager.rocketPool, munitionsManager.grenadePool].forEach((pool) => pool.forEachActive((m) => {
            if (m.actor && m.actor.mesh) step(m, m.actor.mesh, null, [m.x, m.y, m.z, 0, 0], 8);
        }));
    },

    //sounds play at the speed too (as far as howler allows, it wont go under half), and get quieter below that rather than staying cartoonishly fast
    wrapSounds: function () {
        if (this.soundOriginals) return;
        this.soundOriginals = { three: playSoundIndependent, two: playSoundIndependent2D };
        var scale = (params) => {
            params = params || {};
            var rate = (params.rate || 1) * this.speed;
            return { ...params, rate: Math.max(0.5, Math.min(4, rate)), vol: (params.vol === undefined ? 1 : params.vol) * (this.speed < 0.5 ? Math.max(0.2, this.speed * 2) : 1) };
        };
        playSoundIndependent = (name, params) => this.seeking ? undefined : this.soundOriginals.three(name, scale(params)); //what happens while catching up to a seek was already heard
        playSoundIndependent2D = (name, params) => this.seeking || this.quiet ? undefined : this.soundOriginals.two(name, scale(params));
    },

    //the game only counts down its own ammo, other players' shots and reloads are only ever animations, so for the hud theirs are counted here. it can only start from full
    //at the point the world was rebuilt, so after a seek it is right again a magazine later
    wrapAmmo: function () {
        if (this.gunOriginals) return;
        var fire = GunActor.prototype.fire, reload = GunActor.prototype.reload, session = this;
        this.gunOriginals = { fire, reload };
        GunActor.prototype.fire = function () {
            var player = this.playerActor && this.playerActor.player;
            if (session.counting() && player && player.id !== meId) { session.settleReload(player); if (this.gun.ammo.rounds > 0) { this.gun.ammo.rounds--; player.shotSpread += this.gun.subClass.shotSpreadIncrement } };
            return fire.apply(this, arguments);
        };
        GunActor.prototype.reload = function () {
            var player = this.playerActor && this.playerActor.player, ammo = this.gun.ammo;
            if (session.counting() && player && player.id !== meId) {
                session.settleReload(player);
                var ticks = ammo.rounds === 0 ? this.gun.longReloadTime : this.gun.shortReloadTime;
                player.lrReload = { at: session.clockNow() + ticks / player.modifiers.reloadSpeedModifier * 1000 / ticksPerSecond, rounds: Math.max(0, Math.min(Math.min(ammo.capacity, ammo.reload) - ammo.rounds, ammo.store)), ammo };
            };
            return reload.apply(this, arguments);
        };
    },

    //the dummy that stands in for me is on the player list as "undefined"
    wrapPlayerList: function () {
        if (this.listOriginal) return;
        this.listOriginal = rebuildPlayerList;
        //every kill rebuilds the list (twice), and a grenade that kills six in one go rebuilt it twelve times in one frame, which was the stutter. while records are being run it is only marked, and done once after
        rebuildPlayerList = (...args) => {
            if (this.feeding) return this.listDirty = true;
            var result = this.listOriginal(...args);
            [...document.getElementById("playerList").children].forEach((row) => { if (/^\s*undefined\s/.test(row.textContent)) row.style.display = "none" }); //(innerText makes the page lay itself out for every row)
            return result;
        };
    },

    flushPlayerList: function () {
        if (!this.listDirty || this.feeding) return;
        this.listDirty = false;
        if (this.listOriginal) rebuildPlayerList();
    },

    unwrapPlayerList: function () {
        if (!this.listOriginal) return;
        rebuildPlayerList = this.listOriginal;
        this.listOriginal = null;
    },

    unwrapAmmo: function () {
        if (!this.gunOriginals) return;
        GunActor.prototype.fire = this.gunOriginals.fire;
        GunActor.prototype.reload = this.gunOriginals.reload;
        this.gunOriginals = null;
    },

    //other players' ammo is counted while a replay plays, and while spectating a live game (spectate.js), by the replay's time or the real one
    counting: function () {
        return this.active || (typeof ReplaySpectate !== "undefined" && ReplaySpectate.active);
    },

    clockNow: function () {
        return this.active ? this.now : performance.now();
    },

    //a reload counts once it has had time to finish
    settleReload: function (player, now) {
        var r = player.lrReload;
        if (!r || (now === undefined ? this.clockNow() : now) < r.at) return;
        player.lrReload = null;
        r.ammo.rounds += r.rounds;
        r.ammo.store -= r.rounds;
    },

    unwrapSounds: function () {
        if (!this.soundOriginals) return;
        playSoundIndependent = this.soundOriginals.three;
        playSoundIndependent2D = this.soundOriginals.two;
        this.soundOriginals = null;
    },

    //what the camera and scene are doing, for working out why a shot looks wrong
    debug: function () {
        var players = [];
        iteratePlayers((p) => players.push([p.id, p.playing, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10]));
        return {
            fps: Math.round(engine.getFps()), time: Math.round(this.time), idx: this.idx, of: this.records.length, errors: this.errors, playing: this.playing, frozen: freezeFrame,
            animScale: gameScene.animationTimeScale, soundsWrapped: !!this.soundOriginals, mode: ReplayCamera.mode, followed: ReplayCamera.target && ReplayCamera.target.id, speed: this.speed, tickStep: TickStep,
            camera: { inScene: gameScene.cameras.includes(camera), active: gameScene.activeCameras.includes(camera), parentIsEye: !!(ReplayCamera.target && camera.parent === ReplayCamera.target.actor.eye), parentDisposed: camera.parent && camera.parent.isDisposed && camera.parent.isDisposed(), rotQ: camera.rotationQuaternion && camera.rotationQuaternion.asArray().map((n) => Math.round(n * 100) / 100), pos: camera.position.asArray().map((n) => Math.round(n * 10) / 10), view: camera.getViewMatrix().m.slice(12, 15).map((n) => Math.round(n * 10) / 10) }, meshPos: ReplayCamera.target && ReplayCamera.target.actor && ReplayCamera.target.actor.mesh ? ReplayCamera.target.actor.mesh.position.asArray() : null, cameraPos: camera.globalPosition.asArray().map((n) => Math.round(n * 10) / 10), parent: camera.parent && camera.parent.name, fov: camera.fov,
            activeMeshes: gameScene.getActiveMeshes().length, meshes: gameScene.meshes.length, players, sprites: nameSprites.sprites.length, actorSprites: players.filter((p) => players_by_id[p[0]].actor.nameSprite).length, stray: players.filter((p) => { var a = players_by_id[p[0]].actor; return a.nameSprite && (!p[1] || !a.mesh.isEnabled() || !a.mesh.isVisible) }).length,
        };
    },

    resetWorld: function () {
        ReplayCamera.releaseFirstPerson();
        //the eye is removed with its player, and babylon disposes its children too (including our camera)
        camera.parent = null;
        camera.lockedTarget = null;
        iteratePlayers((player) => { if (player.id !== meId) removePlayer(player.id) });
        itemManager.recycleAllItems();
        this.clearMunitions();
        viewingPlayer = me;
        viewingPlayerId = meId;
    },

    //bullets and rockets know how to remove themselves, a grenade only does it by recycling itself and removing its actor when it goes off
    clearMunitions: function () {
        [munitionsManager.bulletPool, munitionsManager.rocketPool, munitionsManager.grenadePool].forEach((pool) => pool.forEachActive((m) => {
            if (m.remove) return m.remove();
            pool.recycle(m);
            if (m.actor && m.actor.remove) m.actor.remove();
        }));
    },

    //the game glides what is drawn towards where players are, which after running on a few seconds would be a slide across the map
    snapPlayers: function () {
        this.interp.clear();
        iteratePlayers((player) => {
            var actor = player.actor;
            if (player.id === meId || !player.playing || !actor || !actor.mesh) return;
            actor.mesh.position.set(player.x, player.y, player.z);
            actor.mesh.rotation.y = player.yaw;
            if (actor.head) actor.head.rotation.x = player.pitch;
        });
    },
};

ReplaySession.registerListeners(plugins);
