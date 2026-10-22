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
    sanitize: function (data) {
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
        this.wrapPlayerList();
        this.wrapAddPlayer();
        ReplayAudio.start();
        ReplayFx.start();
        gameScene.registerBeforeRender(() => this.frame());
        ReplayCamera.start();
        ReplayViewer.open();

        await this.seek(0);
        ReplayCamera.cycle(1, "first");
        if (ReplayCamera.mode === "overview") ReplayCamera.free();
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
        var dt = Math.min(now - (this.lastFrame || now), 100); //a hitch (or a slow machine) must not skip ahead through a slow motion stretch
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
        iteratePlayers((player) => {
            if (player.actor && player.actor.nameSprite && (!player.playing || !player.actor.mesh.isEnabled())) player.actor.hideNameSprite();
        });
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
        };
    },

    feed: async function (record) {
        var T = ReplayFormat.Type;
        if (record.type !== T.packets && record.type !== T.sync && record.type !== T.keyframe) return;
        this.now = record.tMs; //when it is, for what only counts from the packets
        try {
            await LegacyShellOnMessage({ data: await LegacyReplay.prepareRecord(record, this.header) });
        } catch (e) {
            if (++this.errors <= 5) console.log("[legacyreplay] record failed:", e);
        };
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

            if (onward) this.snapPlayers();
            this.time = tMs;
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

    //at normal speed the game's own smoothing is enough. slowed down, the game only moves things on its ticks (a tenth speed is 6 ticks a second), and its smoothing closes the gap in a
    //couple of frames, so everything steps. so below normal speed what is drawn is worked out here instead: between where a thing was at the last tick and where it is now, by how far
    //through the tick it is (measured from how long the last tick really took)
    interpolate: function (now) {
        if (this.speed >= 0.9) return this.interp.size && this.interp.clear();

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
            step(player, player.actor.mesh, player.actor.head, [player.x, player.y, player.z, player.yaw, player.pitch], 8);
        });
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
        playSoundIndependent2D = (name, params) => this.seeking ? undefined : this.soundOriginals.two(name, scale(params));
    },

    //the game only counts down its own ammo, other players' shots and reloads are only ever animations, so for the hud theirs are counted here. it can only start from full
    //at the point the world was rebuilt, so after a seek it is right again a magazine later
    wrapAmmo: function () {
        if (this.gunOriginals) return;
        var fire = GunActor.prototype.fire, reload = GunActor.prototype.reload, session = this;
        this.gunOriginals = { fire, reload };
        GunActor.prototype.fire = function () {
            var player = this.playerActor && this.playerActor.player;
            if (session.active && player && player.id !== meId) { session.settleReload(player); if (this.gun.ammo.rounds > 0) { this.gun.ammo.rounds--; player.shotSpread += this.gun.subClass.shotSpreadIncrement } };
            return fire.apply(this, arguments);
        };
        GunActor.prototype.reload = function () {
            var player = this.playerActor && this.playerActor.player, ammo = this.gun.ammo;
            if (session.active && player && player.id !== meId) {
                session.settleReload(player);
                var ticks = ammo.rounds === 0 ? this.gun.longReloadTime : this.gun.shortReloadTime;
                player.lrReload = { at: session.now + ticks / player.modifiers.reloadSpeedModifier * 1000 / ticksPerSecond, rounds: Math.max(0, Math.min(Math.min(ammo.capacity, ammo.reload) - ammo.rounds, ammo.store)), ammo };
            };
            return reload.apply(this, arguments);
        };
    },

    //the dummy that stands in for me is on the player list as "undefined"
    wrapPlayerList: function () {
        if (this.listOriginal) return;
        this.listOriginal = rebuildPlayerList;
        rebuildPlayerList = (...args) => {
            var result = this.listOriginal(...args);
            [...document.getElementById("playerList").children].forEach((row) => { if (/^\s*undefined\s/.test(row.innerText)) row.style.display = "none" });
            return result;
        };
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

    //a reload counts once it has had time to finish
    settleReload: function (player, now) {
        var r = player.lrReload;
        if (!r || (now === undefined ? this.now : now) < r.at) return;
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
