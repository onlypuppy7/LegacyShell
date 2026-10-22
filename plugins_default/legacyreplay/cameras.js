//legacyshell: replay cameras (browser bundle only). everything drives the game's one global camera, because the audio listener, fov and visibility checks all read it.
//first person is the game's own spectator camera. chase, orbit and free are driven here, and every move they make is smoothed: nothing is ever set straight from where the target is
//

export const ReplayCamera = {
    mode: "overview", //overview | first | chase | orbit | free | bullet (bullet is only ever set by a shot, see reel.js)
    views: ["first", "pov", "chase", "shoulder", "side", "low", "top", "orbit", "security", "free"], //pov is first person with their hud on (ammo, grenades, health), as if it were their game
    blendLength: 1600,
    blendStrength: 1,
    following: ["chase", "shoulder", "side", "low", "top", "orbit", "security"], //the views that sit outside the player and are smoothed by aim
    target: null, //the player being watched
    targetId: null,
    keys: {},
    look: { yaw: 0, pitch: 0, roll: 0 }, //free: where the mouse says to look
    pos: null, //free: where the keys say to be (a Vector3, made in start)
    cur: { yaw: 0, pitch: 0, roll: 0, fov: 1, pos: null }, //what the camera is actually doing, chasing the above
    fovWanted: 1,
    //how the free camera feels. move / look are smoothing times in seconds (0 = instant), bank leans into turns like a drone
    feels: { raw: { move: 0, look: 0, bank: 0 }, smooth: { move: 0.15, look: 0.05, bank: 0 }, cinematic: { move: 0.45, look: 0.18, bank: 0.3 }, drone: { move: 0.7, look: 0.12, bank: 0.8 } },
    orbitAngle: 0,
    dragging: false,

    //slider values live in LegacySettings (Replay tab), these are the defaults when it isnt there
    setting: function (key, def) {
        return typeof LegacySettings !== "undefined" ? LegacySettings.get(key, def) : def;
    },

    //smoothing and banking for the free camera: from the chosen feel, or from the sliders when it is set to custom
    feel: function (what) {
        var preset = this.feels[this.setting("replayFeel", "smooth")];
        if (preset) return preset[what];
        return what === "move" ? this.setting("replayMoveSmoothing", 0.15) : what === "look" ? this.setting("replayLookSmoothing", 0.05) : this.setting("replayBank", 0);
    },

    isUi: function (target) {
        return !!(target && target.closest && target.closest(".lrPanel, .lrDialog, #settingsMenu, button, select, input, textarea"));
    },

    start: function () {
        this.mode = "overview";
        this.keys = {};
        this.target = null;
        this.pos = new BABYLON.Vector3(0, 0, 0);
        this.cur.pos = new BABYLON.Vector3(0, 0, 0);
        this.speedScale = 1;
        this.onKeyDown = (e) => this.key(e, true);
        this.onKeyUp = (e) => this.key(e, false);
        //looking around: click the view to capture the mouse (Esc lets go), or hold a button and drag where the mouse can't be captured. both turn the camera by the same amount
        this.onMove = (e) => {
            var canvas = engine.getRenderingCanvas();
            if (this.mode !== "free" || !(document.pointerLockElement === canvas || this.dragging)) return;
            var sensitivity = 0.0022 * this.setting("replayMouseSensitivity", 1);
            this.look.yaw += (e.movementX || 0) * sensitivity;
            this.look.pitch = Math.max(-1.55, Math.min(1.55, this.look.pitch + (e.movementY || 0) * sensitivity));
        };
        this.onDown = (e) => {
            if (this.mode !== "free" || this.isUi(e.target)) return;
            this.dragging = true;
            var canvas = engine.getRenderingCanvas();
            try { if (canvas.requestPointerLock && document.pointerLockElement !== canvas) canvas.requestPointerLock() } catch (error) { };
        };
        this.onUp = () => this.dragging = false;
        this.onWheel = (e) => {
            if (this.mode !== "free" || this.isUi(e.target)) return;
            if (e.altKey) { //zoom
                this.fovWanted = Math.max(0.3, Math.min(2.2, this.fovWanted * (e.deltaY < 0 ? 0.93 : 1 / 0.93)));
                ReplayViewer.toast("Field of view " + Math.round(this.fovWanted * 57.3) + " degrees");
            } else {
                this.speedScale = Math.max(0.1, Math.min(10, this.speedScale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
                ReplayViewer.toast("Camera speed " + (this.setting("replayFreecamSpeed", 8) * this.speedScale).toFixed(1) + " blocks a second");
            };
        };
        window.addEventListener("keydown", this.onKeyDown, true);
        window.addEventListener("keyup", this.onKeyUp, true);
        window.addEventListener("pointermove", this.onMove);
        window.addEventListener("pointerdown", this.onDown);
        window.addEventListener("pointerup", this.onUp);
        window.addEventListener("wheel", this.onWheel, { passive: true });
        this.observer = gameScene.onBeforeRenderObservable.add(() => this.frame());
        this.last = performance.now();
    },

    stop: function () {
        window.removeEventListener("keydown", this.onKeyDown, true);
        window.removeEventListener("keyup", this.onKeyUp, true);
        window.removeEventListener("pointermove", this.onMove);
        window.removeEventListener("pointerdown", this.onDown);
        window.removeEventListener("pointerup", this.onUp);
        window.removeEventListener("wheel", this.onWheel);
        try { if (document.pointerLockElement) document.exitPointerLock() } catch (error) { };
        this.target = null;
        this.mode = "overview";
        document.body.classList.remove("replayPov");
    },

    key: function (e, down) {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") && e.target.type !== "range") return;
        var name = e.key === " " ? "SPACE" : e.key.toUpperCase();
        this.keys[name] = down;
        if (down) ReplayViewer.onKey(name, e);
    },

    //exponential smoothing: the same result at any framerate. tau is how long it takes to close ~63% of the gap, 0 = instant
    smooth: function (dt, tau) {
        return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
    },

    //turning the short way round: 359 degrees to 1 degree is a 2 degree move, not a spin
    angleDiff: function (to, from) {
        var d = (to - from) % (2 * Math.PI);
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        return d;
    },

    //picks up from exactly where the camera is now, so changing view never jumps
    adoptPose: function () {
        var world = camera.globalPosition.clone();
        var forward = camera.getDirection(BABYLON.Vector3.Forward());
        this.releaseFirstPerson();
        camera.parent = null;
        camera.lockedTarget = null;
        this.cur.yaw = this.look.yaw = Math.atan2(forward.x, forward.z);
        this.cur.pitch = this.look.pitch = -Math.asin(Math.max(-1, Math.min(1, forward.y)));
        this.pos.copyFrom(world);
        this.cur.pos.copyFrom(world);
        this.cur.roll = this.look.roll = 0;
        this.cur.fov = camera.fov;
        this.fovWanted = camera.fov;
        camera.position.copyFrom(world);
        camera.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(this.cur.yaw, this.cur.pitch, 0);
        mapOverview = false;
        viewingPlayer = me;
        viewingPlayerId = meId;
    },

    //watch a player, in the current view (or first person if there wasnt one)
    watch: function (id, view) {
        var player = players_by_id[id];
        if (!player || id === meId) return;
        this.target = player;
        this.targetId = id;
        this.setView(view || (this.views.includes(this.mode) && this.mode !== "free" ? this.mode : "first"));
    },

    setView: function (view) {
        this.stopBullet();
        if (view !== "free") camera.fov = getDefaultFov(); //zoom is the free camera's, nothing else should inherit it
        if (view !== "free" && !this.target) return this.cycle(1, view);
        if (this.mode === view) return ReplayViewer.refresh();

        document.body.classList.toggle("replayPov", view === "pov");
        if (view === "pov" && !document.body.classList.contains("replayHud")) { document.body.classList.add("replayHud"); this.povHud = true }; //their view is the whole game hud, G puts it away
        if (view !== "pov" && this.povHud) { document.body.classList.remove("replayHud"); this.povHud = false };
        if (view === "first" || view === "pov") {
            this.releaseFirstPerson();
            var player = this.target;
            player.actor.hands.setRenderingGroupId(1);
            player.weapon.actor.gunMesh.setRenderingGroupId(1);
            if (player.actor.hat) player.actor.hat.setEnabled(false);
            player.actor.hideNameSprite();
            this.firstPerson = player;
            viewingPlayer = player;
            viewingPlayerId = player.id;
            //not parented to the eye like the game's own spectator camera: that left the camera's matrices stale after the world was rebuilt (camera at 0,0,0, black screen).
            //frameFirst puts it on the eye every frame instead, which cant go stale
            camera.parent = null;
            camera.lockedTarget = null;
            mapOverview = false;
        } else {
            this.adoptPose(); //the smoothing below then carries it from here to where the new view wants it
        };
        this.mode = view;
        this.blendStart = performance.now();
        this.blendLength = this.smoothNext ? 3200 : 1600; //a shot marked smooth takes twice as long and starts twice as gently
        this.blendStrength = this.smoothNext ? 2 : 1;
        this.smoothNext = false;
        ReplayViewer.refresh();
    },

    free: function () {
        this.setView("free");
    },

    //put the player's gun and head back the way the game has them
    releaseFirstPerson: function () {
        var player = this.firstPerson;
        this.firstPerson = null;
        if (!player || !player.actor || !player.actor.hands) return;
        player.actor.hands.setRenderingGroupId(0);
        if (player.weapon && player.weapon.actor) player.weapon.actor.gunMesh.setRenderingGroupId(0);
        if (player.actor.hat) player.actor.hat.setEnabled(true);
    },

    //seeking rebuilds every player, so whoever was being watched is gone: pick them up again
    afterSeek: function () {
        this.firstPerson = null;
        var id = this.targetId, view = this.mode;
        if (this.mode === "free" || this.mode === "overview" || this.mode === "bullet") return; //these dont hang on one player staying put
        this.target = null;
        this.mode = "overview"; //so setView doesnt think nothing changed
        if (id !== null && players_by_id[id]) this.watch(id, view);
        else this.cycle(1, view);
    },

    //where the egg's eyes are, in the world
    eye: function (player) {
        return new BABYLON.Vector3(player.x, player.y + 0.32 * (player.modifiers ? player.modifiers.scale : 1) + 0.1, player.z);
    },

    frame: function () {
        var now = performance.now();
        var dt = Math.min((now - this.last) / 1000, 0.1);
        this.last = now;

        if (this.target) this.targetId = this.target.id;

        //whoever is being watched has died (or was never playing): after a moment move on to someone who is, so the screen isnt stuck inside a dead egg
        if (this.target && this.mode !== "free" && this.mode !== "overview" && this.mode !== "bullet") {
            if (!this.target.playing) {
                this.lostFor = (this.lostFor || 0) + dt;
                if (this.lostFor > 1.2) { this.lostFor = 0; this.cycle(1) };
            } else this.lostFor = 0;
        };

        if (this.mode === "first" || this.mode === "pov") { this.frameFirst(); this.shortenOwnBullets() };
        if (this.mode === "pov") this.frameHud();
        else if (this.following.includes(this.mode)) this.frameFollowing(dt);
        else if (this.mode === "bullet") this.frameBullet(dt);
        else if (this.mode === "free") this.frameFree(dt);
    },

    //their eyes, looking where they look. read from what is drawn (the actor's mesh and head, which the interpolation moves when slowed down). the eye node itself is not used:
    //nothing renders it, so its world position is not kept up to date (it sat at 0,0,0 once the camera was no longer parented to it)
    frameFirst: function () {
        var actor = this.target && this.target.actor;
        if (!actor || !actor.mesh || !actor.head) return;
        var scale = this.target.modifiers ? this.target.modifiers.scale : 1;
        camera.parent = null;
        camera.position.set(actor.mesh.position.x, actor.mesh.position.y + 0.4 * scale, actor.mesh.position.z);
        camera.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(actor.mesh.rotation.y, actor.head.rotation.x, 0);
    },

    //the game only stretches other players' bullets into streaks, your own stay short. from the eyes of the player being watched their bullets are their own, and a streak flying away from the camera is a cross in the middle of the screen
    shortenOwnBullets: function () {
        var target = this.target;
        munitionsManager.bulletPool.forEachActive((m) => { if (m.player === target && m.actor && m.actor.mesh) m.actor.mesh.scaling.z = 0.5 });
    },

    //the game only ever draws its ammo and grenades for me, so for them it is done here
    frameHud: function () {
        var p = this.target, set = (id, f) => { var el = document.getElementById(id); if (el) f(el) };
        if (!p || !p.weapon || !p.weapon.ammo) return;
        ReplaySession.settleReload(p, ReplaySession.time);
        set("weaponName", (el) => el.textContent = p.weapon.subClass.weaponName);
        set("ammo", (el) => { el.style.color = "#fff"; el.textContent = p.weapon.ammo.rounds + "/" + Math.min(p.weapon.ammo.store, p.weapon.ammo.storeMax) });
        for (var i = 1; i <= 3; i++) set("grenade" + i, (el) => { var src = "img/grenadeIcon" + (p.grenadeCount >= i ? "" : "Dark") + ".png?v=1"; if (!el.src.endsWith(src)) el.src = src });
        ["health", "weaponBox", "grenades"].forEach((id) => set(id, (el) => el.style.display = "block"));

        //the reticle, with the spread they have
        set("reticleContainer", (el) => el.className = p.playing ? "" : "hideme");
        if (typeof reticle !== "undefined" && reticle.crosshairs) {
            var size = (p.shotSpread + p.weapon.subClass.accuracy) * (1.25 / camera.fov);
            reticle.crosshairs.forEach((c, i) => c.style.transform = "rotate(" + 90 * i + "deg) translateY(" + (.069 * size + .12) + "em)");
        };

        //kill streak and the banners for their kills and their death, which the game only shows for me
        set("bestStreak", (el) => { el.style.display = "block"; el.textContent = "BEST STREAK: " + (p.bestOverallStreak || 0) });
        var t = ReplaySession.time, byThem = null, ofThem = null;
        ReplaySession.kills.forEach((k) => { if (k.tMs <= t) { if (k.by === p.id && t - k.tMs < 4000) byThem = k; if (k.victim === p.id && t - k.tMs < 3000) ofThem = k } });
        var killBox = document.getElementById("killBox"), deathBox = document.getElementById("deathBox");
        if (killBox) {
            killBox.style.display = byThem ? "block" : "none";
            if (byThem) {
                var victim = players_by_id[byThem.victim], streak = document.getElementById("KILL_STREAK");
                document.getElementById("KILLED_NAME").textContent = victim ? victim.name : "N/A";
                if (streak) streak.textContent = p.streak > 1 ? p.streak + "-KILL STREAK" : "";
            };
        };
        if (deathBox) {
            deathBox.style.display = ofThem ? "block" : "none";
            if (ofThem) { var killer = players_by_id[ofThem.by]; document.getElementById("KILLED_BY_NAME").textContent = killer ? killer.name : "N/A" };
        };
    },

    frameFollowing: function (dt, kind) {
        var player = this.target;
        if (!player) return;
        kind = kind || this.mode;
        var eye = this.eye(player), want = new BABYLON.Vector3(), lookAt = new BABYLON.Vector3();

        if (kind === "chase") {
            var back = this.setting("replayChaseDistance", 3), height = this.setting("replayChaseHeight", 1.1);
            var sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
            want.set(eye.x - sy * back, eye.y + height, eye.z - cy * back);
            lookAt.set(eye.x + sy * 3, eye.y + 0.1, eye.z + cy * 3); //a little ahead of them, where they are going
        } else if (kind === "shoulder") {
            var sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
            want.set(eye.x - sy * 1.5 + cy * 0.75, eye.y + 0.45, eye.z - cy * 1.5 - sy * 0.75);
            lookAt.set(eye.x + sy * 6, eye.y + 0.05, eye.z + cy * 6);
        } else if (kind === "side") {
            var sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
            want.set(eye.x + cy * 3.5, eye.y + 0.4, eye.z - sy * 3.5);
            lookAt.set(eye.x, eye.y, eye.z);
        } else if (kind === "low") {
            var sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
            want.set(eye.x - sy * 2.6, player.y + 0.1, eye.z - cy * 2.6);
            lookAt.set(eye.x + sy * 2, eye.y + 0.35, eye.z + cy * 2);
        } else if (kind === "top") {
            want.set(eye.x, eye.y + 9, eye.z - 0.01);
            lookAt.set(eye.x, eye.y, eye.z);
        } else if (kind === "security") { //a camera on a wall: it stays where it is and only turns, until they get too far away and it moves to a new spot
            if (!this.securityAt || this.securityId !== player.id || BABYLON.Vector3.Distance(this.securityAt, eye) > 16) {
                var a = player.yaw + 2.4;
                this.securityId = player.id;
                this.securityAt = new BABYLON.Vector3(eye.x + Math.sin(a) * 6, eye.y + 3.5, eye.z + Math.cos(a) * 6);
            };
            want.copyFrom(this.securityAt);
            lookAt.set(eye.x, eye.y, eye.z);
        } else {
            this.orbitAngle += this.setting("replayOrbitSpeed", 25) * (Math.PI / 180) * dt;
            var radius = this.setting("replayOrbitRadius", 3.5);
            want.set(eye.x + Math.sin(this.orbitAngle) * radius, eye.y + 0.7, eye.z + Math.cos(this.orbitAngle) * radius);
            lookAt.copyFrom(eye);
        };

        this.aim(dt, this.clearOfWalls(eye, want), lookAt, this.setting("replayFollowSmoothing", 0.3), this.setting("replayLookSmoothing", 0.05) + 0.1);
    },

    //the camera is a point, so it can end up inside a wall (the screen goes black). walk back from the thing being filmed towards where the camera wants to be, and stop just short of the first wall
    clearOfWalls: function (from, want) {
        try {
            var line = want.subtract(from);
            var hit = Collider.rayCollidesWithMap(from, line, Collider.projectileCollidesWithCell.bind(Collider));
            if (!hit || !hit.pick || !hit.pick.pickedPoint) return want;
            var length = line.length() || 1, wall = BABYLON.Vector3.Distance(from, hit.pick.pickedPoint);
            return from.add(line.scale(Math.min(1, Math.max(0.25, wall - 0.35) / length)));
        } catch (e) {
            return want;
        };
    },

    //moves the camera towards where it wants to be and turns it towards what it wants to see, both smoothed. a cut (snapNext) skips the smoothing once
    aim: function (dt, want, lookAt, moveTau, turnTau) {
        //just after a change of view the smoothing starts out heavy and eases off, so the camera sets off gently, swings across and settles (a plain exponential starts at full speed)
        var settled = this.blendStart ? Math.min(1, (performance.now() - this.blendStart) / this.blendLength) : 1;
        if (this.snapNext) settled = 1;
        moveTau += 1.1 * this.blendStrength * (1 - settled) * (1 - settled);
        turnTau += 0.7 * this.blendStrength * (1 - settled) * (1 - settled);
        var move = this.smooth(dt, moveTau);
        this.cur.pos.x += (want.x - this.cur.pos.x) * move;
        this.cur.pos.y += (want.y - this.cur.pos.y) * move;
        this.cur.pos.z += (want.z - this.cur.pos.z) * move;
        if (this.snapNext) this.cur.pos.copyFrom(want);

        //aim from where the camera really is (not where it wants to be), so the turn follows the move
        var dx = lookAt.x - this.cur.pos.x, dy = lookAt.y - this.cur.pos.y, dz = lookAt.z - this.cur.pos.z;
        var yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));
        var turn = this.smooth(dt, turnTau);
        this.cur.yaw += this.angleDiff(yaw, this.cur.yaw) * turn;
        this.cur.pitch += (pitch - this.cur.pitch) * turn;
        if (this.snapNext) { this.cur.yaw = yaw; this.cur.pitch = pitch; this.snapNext = false };

        camera.position.copyFrom(this.cur.pos);
        camera.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(this.cur.yaw, this.cur.pitch, 0);
    },

    //a cut: the next frame puts the camera where the view wants it, no travelling there
    cut: function () {
        this.snapNext = true;
    },

    //a shot that rides a bullet. shot.bullet = { shooter, victim, tFire, tHit (replay ms), from: [x, y, z] }.
    //before the shot is fired it is a chase on the shooter. in flight the camera sits behind the bullet, and the bullet always ends on the victim's eyes
    //(the replay's positions are rebuilt from syncs so a straight line from the muzzle can miss by a bit, and a kill bullet that misses on screen ruins the shot)
    startBullet: function (shot) {
        this.stopBullet();
        document.body.classList.remove("replayPov"); //the bullet shot is not their view, so none of their hud (setView does this for the rest)
        if (this.povHud) { document.body.classList.remove("replayHud"); this.povHud = false };
        this.blendStart = 0;
        this.ghost = BABYLON.MeshBuilder.CreateCylinder("replayBullet", { height: 0.35, diameter: 0.08, tessellation: 6 }, gameScene); //stands in when the real bullet cant be found
        var material = new BABYLON.StandardMaterial("replayBulletMaterial", gameScene);
        material.emissiveColor = new BABYLON.Color3(1, 0.85, 0.45);
        material.disableLighting = true;
        this.ghost.material = material;
        this.ghost.isPickable = false;
        this.ghost.setEnabled(false);
        this.bulletShot = shot.bullet;
        this.target = players_by_id[shot.bullet.shooter] || null;
        this.targetId = shot.bullet.shooter;
        this.adoptPose();
        this.mode = "bullet";
        ReplayViewer.refresh();
    },

    stopBullet: function () {
        this.bulletShot = null;
        this.tracked = null;
        this.hadBullet = false;
        if (this.ghost) { this.ghost.dispose(); this.ghost = null };
    },

    //the bullet being ridden is drawn short: the game stretches the other players' bullets into a long streak as they fly, which across a whole shot is a trail
    shortenTracked: function () {
        var mesh = this.tracked && this.tracked.actor && this.tracked.actor.mesh;
        if (mesh) mesh.scaling.z = 0.5;
    },

    frameBullet: function (dt) {
        var b = this.bulletShot, t = ReplaySession.time;
        var shooter = b && players_by_id[b.shooter], victim = b && players_by_id[b.victim];
        if (!shooter || !victim) return;

        if (t < b.tFire) {
            this.target = shooter;
            return this.frameFollowing(dt, "chase");
        };

        var origin = new BABYLON.Vector3(b.from[0], b.from[1], b.from[2]), end = this.eye(victim);
        var line = end.subtract(origin), length = line.length() || 1;
        var dir = line.scale(1 / length);
        var progress = Math.max(0, Math.min(1, (t - b.tFire) / Math.max(1, b.tHit - b.tFire)));
        var ghost = origin.add(line.scale(progress));

        //the camera rides the bullet the game is really flying (its path, spread and all). the made up line only stands in when that one can't be found
        var real = this.findBullet(b, ghost);
        var flying = t <= b.tHit + 80 && !(real === null && this.hadBullet);
        var pos = ghost;
        if (real) {
            this.hadBullet = true;
            var mesh = real.actor && real.actor.mesh;
            pos = mesh && mesh.isEnabled() ? mesh.position.clone() : new BABYLON.Vector3(real.x, real.y, real.z);
            var speed = Math.hypot(real.dx, real.dy, real.dz) || 1;
            dir = new BABYLON.Vector3(real.dx / speed, real.dy / speed, real.dz / speed);
        };
        this.shortenTracked();
        if (this.ghost) {
            this.ghost.setEnabled(flying && !real);
            if (flying && !real) {
                this.ghost.position.copyFrom(ghost);
                var axis = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), dir);
                this.ghost.rotationQuaternion = axis.lengthSquared() < 1e-8 ? BABYLON.Quaternion.Identity() : BABYLON.Quaternion.RotationAxis(axis.normalize(), Math.acos(Math.max(-1, Math.min(1, dir.y))));
            };
        };

        var want = new BABYLON.Vector3(), lookAt = new BABYLON.Vector3(), moveTau = 0.12, turnTau = 0.08;
        if (flying) {
            //stuck to the bullet: no smoothing once it is going (it would be left behind), only the first moments blend in from the chase on the shooter
            var blend = Math.max(0, Math.min(1, (t - b.tFire) / 350));
            var side = BABYLON.Vector3.Cross(BABYLON.Vector3.Up(), dir).normalize(); //a little off to the side and above, so the bullet is seen from an angle and not end on
            want.set(pos.x - dir.x * 1.4 + side.x * 0.45, pos.y - dir.y * 1.4 + 0.4, pos.z - dir.z * 1.4 + side.z * 0.45);
            lookAt.copyFrom(pos);
            moveTau = 0.3 * (1 - blend);
            turnTau = 0.2 * (1 - blend);
        } else { //it landed: pull back a little and stay on them
            want.set(end.x - dir.x * 3.2, end.y - dir.y * 3.2 + 0.9, end.z - dir.z * 3.2);
            lookAt.copyFrom(end);
        };
        this.aim(dt, flying ? want : this.clearOfWalls(end, want), lookAt, moveTau, turnTau);
    },

    //the live bullet of the shooter that is on the course of the shot: picked once (the one nearest to where it should be), then followed until the game removes it
    findBullet: function (b, expected) {
        if (this.tracked && this.tracked.active) return this.tracked;
        if (this.tracked) return this.tracked = null;
        if (this.hadBullet) return null;
        var best = null, bestDistance = 6;
        [munitionsManager.bulletPool, munitionsManager.rocketPool].forEach((pool) => pool.forEachActive((m) => {
            if (!m.player || m.player.id !== b.shooter) return;
            var d = Math.hypot(m.x - expected.x, m.y - expected.y, m.z - expected.z);
            if (d < bestDistance) { best = m; bestDistance = d };
        }));
        return this.tracked = best;
    },

    frameFree: function (dt) {
        var k = this.keys;
        var speed = this.setting("replayFreecamSpeed", 8) * this.speedScale * (k.SHIFT ? 3 : 1) * dt;
        var forwardAmount = (k.W ? 1 : 0) - (k.S ? 1 : 0), side = (k.D ? 1 : 0) - (k.A ? 1 : 0), up = (k.E ? 1 : 0) - (k.Q ? 1 : 0);
        var sy = Math.sin(this.cur.yaw), cy = Math.cos(this.cur.yaw), sp = Math.sin(this.cur.pitch), cp = Math.cos(this.cur.pitch);

        this.pos.x += (sy * cp * forwardAmount + cy * side) * speed;
        this.pos.y += (-sp * forwardAmount + up) * speed;
        this.pos.z += (cy * cp * forwardAmount - sy * side) * speed;

        //roll by hand (Z and X), V puts the horizon and the zoom back
        this.look.roll += ((k.X ? 1 : 0) - (k.Z ? 1 : 0)) * 1.2 * dt;
        if (k.V) { this.look.roll = 0; this.fovWanted = getDefaultFov() };
        var turnLeft = this.look.yaw - this.cur.yaw; //how far the camera still has to turn: leaning into it is what a drone does
        var bank = Math.max(-0.6, Math.min(0.6, -turnLeft * 2.5)) * this.feel("bank");

        var move = this.smooth(dt, this.feel("move"));
        var turn = this.smooth(dt, this.feel("look"));
        this.cur.pos.x += (this.pos.x - this.cur.pos.x) * move;
        this.cur.pos.y += (this.pos.y - this.cur.pos.y) * move;
        this.cur.pos.z += (this.pos.z - this.cur.pos.z) * move;
        this.cur.yaw += (this.look.yaw - this.cur.yaw) * turn;
        this.cur.pitch += (this.look.pitch - this.cur.pitch) * turn;
        this.cur.roll += (this.look.roll + bank - this.cur.roll) * this.smooth(dt, Math.max(0.08, this.feel("look")));
        this.cur.fov += (this.fovWanted - this.cur.fov) * this.smooth(dt, 0.12);

        camera.position.copyFrom(this.cur.pos);
        camera.fov = this.cur.fov;
        camera.rotationQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(this.cur.yaw, this.cur.pitch, this.cur.roll);
    },

    //the player after (dir 1) or before (dir -1) the watched one, in id order. only ones that are playing, nobody to watch = free camera
    cycle: function (dir, view) {
        var ids = [];
        iteratePlayers((player) => { if (player.id !== meId && player.playing) ids.push(player.id) });
        if (!ids.length) return this.mode === "free" ? undefined : this.free();
        var at = ids.indexOf(this.target ? this.target.id : -1);
        this.watch(ids[(at + dir + ids.length) % ids.length], view);
    },

    //first person -> chase -> orbit -> free -> first person
    cycleView: function () {
        this.setView(this.views[(this.views.indexOf(this.mode) + 1) % this.views.length]);
    },
};
