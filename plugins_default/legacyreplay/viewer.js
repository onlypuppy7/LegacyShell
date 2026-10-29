//legacyshell: replay viewer ui + library (browser bundle only)
//

export const ReplayViewer = {
    bar: null,
    hidden: false,
    scrubbing: false,
    speeds: [0.1, 0.25, 0.5, 1, 2, 4],

    //the looks come from the game's own classes (shadedPane, textShadow, ssbutton, select, alert, roundedBorder), this is only layout
    css: `
        .lrPanel { position: fixed; z-index: 99999; pointer-events: auto; user-select: none; color: #fff; padding: 0.4em 0.6em; }
        .lrBar { left: 50%; transform: translateX(-50%); bottom: 0.8em; width: min(72em, 96vw); display: flex; align-items: center; gap: 0.5em; flex-wrap: wrap; box-sizing: border-box; }
        .lrBar .ssbutton, .lrDialog .ssbutton { padding: 0 0.9em; white-space: nowrap; }
        .lrBar select { height: 1.75em; max-width: 10em; }
        .lrTrack { position: relative; flex: 1; min-width: 8em; display: flex; align-items: center; }
        .lrTrack input[type=range] { width: 100%; margin: 0; accent-color: #e82; }
        .lrTick { position: absolute; top: -0.15em; width: 3px; height: 0.5em; background: #e33; pointer-events: none; border-radius: 1px; }
        .lrTick.mark { background: #f7941d; height: 0.65em; }
        .lrTime { font-variant-numeric: tabular-nums; min-width: 9em; text-align: center; font-weight: bold; }
        .lrNote { top: 0.8em; left: 0.8em; font-size: 0.9em; max-width: 24em; }
        .lrHint { top: 3.2em; left: 0.8em; font-size: 0.8em; max-width: 22em; opacity: 0.9; line-height: 1.35; display: none; }
        .lrToast { left: 50%; transform: translateX(-50%); bottom: 4.6em; opacity: 0; transition: opacity 0.25s; pointer-events: none; font-weight: bold; }
        .lrBack { position: fixed; z-index: 99998; inset: 0; background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center; }
        .lrDialog.alert { position: relative; width: min(46em, 94vw); max-height: 84vh; overflow: auto; box-sizing: border-box; }
        .lrDialog h1 { margin: 0 0 0.4em 0; text-align: center; }
        .lrDialog label { display: flex; align-items: center; gap: 0.6em; margin: 0.4em 0; }
        .lrDialog label span { width: 6em; font-weight: bold; }
        .lrDialog .lrMoments { max-height: 30vh; overflow: auto; margin: 0.6em 0; font-size: 0.9em; }
        .lrRow { display: flex; align-items: center; gap: 0.5em; padding: 0.45em 0; border-top: 1px solid rgba(83, 42, 25, 0.25); }
        .lrRow .info { flex: 1; min-width: 0; }
        .lrRow .sub { opacity: 0.7; font-size: 0.85em; }
        body.replayMode:not(.replayPov) #health, body.replayMode:not(.replayPov) #weaponBox, body.replayMode:not(.replayPov) #ammo, body.replayMode:not(.replayPov) #grenades,
        body.replayMode:not(.replayPov) #reticleContainer, body.replayMode:not(.replayPov) #killBox, body.replayMode:not(.replayPov) #deathBox, body.replayMode:not(.replayPov) #bestStreak, body.replayMode:not(.replayPov) #gameClock,
        body.replayMode:not(.replayHud) #health, body.replayMode:not(.replayHud) #weaponBox, body.replayMode:not(.replayHud) #ammo, body.replayMode:not(.replayHud) #grenades,
        body.replayMode:not(.replayHud) #reticleContainer, body.replayMode:not(.replayHud) #killBox, body.replayMode:not(.replayHud) #deathBox, body.replayMode:not(.replayHud) #bestStreak, body.replayMode:not(.replayHud) #gameClock,
        body.replayMode #upgradeIndicator, body.replayMode #showBuyPassDialogButton, body.replayMode #help, body.replayMode #tipContainer,
        body.replayMode #gameMenu, body.replayMode #spectate, body.replayMode #cheatsEnabled, body.replayMode #scopeBorder, body.replayMode #inGameAd, body.replayMode #grenadeThrowContainer,
        body.replayMode #serverAndMapInfo, body.replayMode #myPlayer { display: none !important; }
        body.replayMode:not(.replayHud) #killTicker, body.replayMode:not(.replayHud) #playerList, body.replayMode:not(.replayHud) #chatOut, body.replayMode:not(.replayHud) #chatIn,
        body.replayMode:not(.replayHud) #readouts, body.replayMode:not(.replayHud) #corner { display: none !important; }
        body.replayMode #readyBrackets:not(.ready):not(.notReady) { display: none; } /* with no size it is four corners on top of each other: a plus in the middle of the screen */
    `,

    el: function (tag, props, children) {
        var node = document.createElement(tag);
        if (props) Object.keys(props).forEach((key) => key === "text" ? node.textContent = props[key] : key === "class" ? node.className = props[key] : node[key] = props[key]);
        (children || []).forEach((child) => node.appendChild(child));
        return node;
    },

    size: function (bytes) { //MB, or GB once it is big
        return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + " GB" : (bytes / 1048576).toFixed(bytes < 10485760 ? 1 : 0) + " MB";
    },

    time: function (ms, tenths) {
        var s = Math.floor(ms / 1000);
        return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0") + (tenths ? "." + Math.floor(ms / 100) % 10 : "");
    },

    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', () => this.registerSettings());

        var style = document.createElement("style");
        style.textContent = this.css;
        document.head.appendChild(style);
        ReplaySpectate.registerListeners(this.plugins);

        window.addEventListener("dragover", (e) => { if (!ReplaySession.active && e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault() });
        window.addEventListener("drop", (e) => {
            var file = !ReplaySession.active && e.dataTransfer && e.dataTransfer.files[0];
            if (file && /\.lsreplay$/i.test(file.name)) { e.preventDefault(); this.importFile(file, true) };
        });

        //the clip key, in a real game (not while watching a replay, and not while typing in chat)
        window.addEventListener("keydown", (e) => {
            if (typeof inGame === "undefined" || !inGame || ReplaySession.active || e.repeat || (e.target && e.target.tagName === "INPUT")) return;
            var name = e.key === " " ? "SPACE" : e.key.toUpperCase();
            if (name === this.bound("replayKeyClip", "F8")) { e.preventDefault(); var seconds = Number(this.bound("replayClipSeconds", "30")) || 30; LegacyReplay.clip(seconds); LegacyReplay.chat("Saving a clip of the last " + seconds + " seconds...") };
        }, true);
    },

    registerSettings: function () {
        if (typeof LegacySettings === "undefined") return;
        LegacySettings.addTab("Replay", [1, 1]);

        LegacySettings.addCategory("Replay", 0, "Your replays", { defaultOpen: true, collapsible: false });
        LegacySettings.addOption("Replay", { type: "button", key: "replayOpenLibrary", text: "Open replays", onClick: () => { LegacySettings.close(); this.openLibrary() } }, 0, "Your replays");
        LegacySettings.addOption("Replay", { type: "button", key: "replayWatchLive", text: "Watch live", tooltip: "Moderators: watch a game as it is played, by its code.", onClick: () => { LegacySettings.close(); ReplayLive.prompt() } }, 0, "Your replays");
        LegacySettings.addOption("Replay", { type: "info", key: "replayLibraryInfo", text: "Clips from a game (F8, /replay clip) and whole games (/replay record, /replay stop)." }, 0, "Your replays");

        LegacySettings.addCategory("Replay", 0, "Free camera", { defaultOpen: true, collapsible: false });
        LegacySettings.addOption("Replay", { type: "select", key: "replayFeel", label: "Feel", default: "smooth", options: [{ value: "raw", label: "Raw (no smoothing)" }, { value: "smooth", label: "Smooth" }, { value: "cinematic", label: "Cinematic" }, { value: "drone", label: "Drone (leans into turns)" }, { value: "custom", label: "Custom (use the sliders)" }], tooltip: "How the free camera moves and turns. Custom uses the two smoothing sliders and the lean below." }, 0, "Free camera");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayFreecamSpeed", label: "Speed", min: 1, max: 40, step: 1, default: 8, tooltip: "Blocks per second. The mouse wheel scales it while flying." }, 0, "Free camera");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayMoveSmoothing", label: "Movement smoothing", min: 0, max: 1, step: 0.05, default: 0.15, tooltip: "Seconds the camera takes to catch up with where you are steering. 0 is instant, higher feels like a drone." }, 0, "Free camera");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayLookSmoothing", label: "Look smoothing", min: 0, max: 0.5, step: 0.01, default: 0.05, tooltip: "The same for turning. Higher is a heavier, more cinematic pan." }, 0, "Free camera");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayBank", label: "Lean into turns", min: 0, max: 1, step: 0.05, default: 0, tooltip: "Custom feel only. How much the camera rolls when it turns, like a drone." }, 0, "Free camera");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayMouseSensitivity", label: "Mouse sensitivity", min: 0.2, max: 3, step: 0.1, default: 1 }, 0, "Free camera");

        LegacySettings.addCategory("Replay", 0, "Chase and orbit", { defaultOpen: true, collapsible: false });
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayChaseDistance", label: "Chase distance", min: 1, max: 8, step: 0.5, default: 3 }, 0, "Chase and orbit");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayChaseHeight", label: "Chase height", min: 0, max: 4, step: 0.1, default: 1.1 }, 0, "Chase and orbit");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayFollowSmoothing", label: "Follow smoothing", min: 0, max: 1.5, step: 0.05, default: 0.3, tooltip: "How loosely the chase and orbit cameras trail the player. Higher lags more." }, 0, "Chase and orbit");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayOrbitSpeed", label: "Orbit speed", min: 5, max: 120, step: 5, default: 25, tooltip: "Degrees a second." }, 0, "Chase and orbit");
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayOrbitRadius", label: "Orbit radius", min: 1.5, max: 10, step: 0.5, default: 3.5 }, 0, "Chase and orbit");

        LegacySettings.addCategory("Replay", 1, "Look and sound", { defaultOpen: true, collapsible: false });
        LegacySettings.addOption("Replay", { type: "slider", showNumber: true, key: "replayMusicVolume", label: "Music volume", min: 0, max: 1, step: 0.05, default: 0.6, tooltip: "Music you pick for a reel. It dips under kills and impacts." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replayLooks", label: "Look effects", default: true, tooltip: "Everything in the cinematic, hype and retro looks. Off means every look is clean." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replayFxBloom", label: "Bloom", default: true, tooltip: "The glow around bright things in the cinematic, hype and retro looks. One of the two effects that cost real framerate: if a look is slow, turn this and the soft background off, and the rest stays." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replayFxDof", label: "Soft background", default: true, tooltip: "Depth of field: the background goes soft behind whoever the camera is on (chase, orbit and bullet shots). The most expensive effect." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "select", key: "replayFxQuality", label: "Bloom and soft background quality", default: "medium", options: [{ value: "low", label: "Low (fastest)" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }], tooltip: "Smaller and coarser versions of the two expensive effects. Applies the next time a look starts." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replayAutoUpload", label: "Keep new clips on my account", default: true, tooltip: "Also keep every new clip on your account." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replayAnonymise", label: "Hide player names", default: false, tooltip: "Players show as Player 1, Player 2... in replays and videos. Applies the next time a replay opens." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replaySfx", label: "Reel sound effects", default: true, tooltip: "A whoosh as a bullet leaves and a thump as it lands." }, 1, "Look and sound");
        LegacySettings.addOption("Replay", { type: "checkbox", key: "replayMuffle", label: "Muffle slow motion", default: true, tooltip: "The game's sound goes dull while time is slowed down." }, 1, "Look and sound");

        LegacySettings.addCategory("Replay", 1, "Keys", { defaultOpen: true, collapsible: false });
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyClip", label: "Save a clip (in a game)", default: "F8" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "select", key: "replayClipSeconds", label: "Clip length", default: "30", options: [10, 15, 30, 45, 60, 90, 120, 180].map((s) => ({ value: String(s), label: s + " seconds" })), tooltip: "How much the clip key saves. Your rank may allow less than the longest." }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyHideUi", label: "Hide the replay controls", default: "H" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyPlayPause", label: "Play / pause", default: "SPACE" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyView", label: "Next camera view", default: "C" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyOrbit", label: "Orbit (hold, move the mouse)", default: "MOUSE 1" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyFree", label: "Free camera", default: "F" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyNext", label: "Next player", default: "ARROWRIGHT" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyPrev", label: "Previous player", default: "ARROWLEFT" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyBack", label: "Back 5 seconds", default: "J" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyForward", label: "Forward 5 seconds", default: "L" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeySlower", label: "Slower", default: "[" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyFaster", label: "Faster", default: "]" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "bind", key: "replayKeyHud", label: "Show the game hud", default: "G" }, 1, "Keys");
        LegacySettings.addOption("Replay", { type: "info", key: "replayKeysInfo", text: "Orbit: hold the orbit button (the middle mouse button) and move the mouse to swing the camera round what it is looking at, or W A S D (A and D round, W and S up and down), the wheel in and out, V puts it back. In first person it looks round from their eyes. Free camera: click the view to look around (Esc lets go), W A S D move, E / Q up and down, Shift fast, wheel speed, Alt + wheel zoom, Z / X roll, V resets roll and zoom." }, 1, "Keys");
    },

    bound: function (key, def) {
        return typeof LegacySettings !== "undefined" ? LegacySettings.get(key, def) : def;
    },

    onKey: function (name, e) {
        if (!ReplaySession.active) return;
        var is = (key, def) => name === this.bound(key, def);
        var handled = true;
        var manual = ["replayKeyView", "replayKeyFree", "replayKeyNext", "replayKeyPrev", "replayKeyBack", "replayKeyForward", "replayKeySlower", "replayKeyFaster"];
        var defaults = { replayKeyView: "C", replayKeyFree: "F", replayKeyNext: "ARROWRIGHT", replayKeyPrev: "ARROWLEFT", replayKeyBack: "J", replayKeyForward: "L", replayKeySlower: "[", replayKeyFaster: "]" };
        if (manual.some((key) => is(key, defaults[key]))) ReplayReel.stop(); //doing it yourself takes over from the reel

        if (is("replayKeyHideUi", "H")) this.setHidden(!this.hidden);
        else if (is("replayKeyPlayPause", "SPACE")) ReplaySession.toggle();
        else if (is("replayKeyView", "C")) ReplayCamera.cycleView();
        else if (is("replayKeyFree", "F")) ReplayCamera.free();
        else if (is("replayKeyNext", "ARROWRIGHT")) ReplayCamera.cycle(1);
        else if (is("replayKeyPrev", "ARROWLEFT")) ReplayCamera.cycle(-1);
        else if (is("replayKeyBack", "J")) ReplaySession.seek(ReplaySession.time - 5000);
        else if (is("replayKeyForward", "L")) ReplaySession.seek(ReplaySession.time + 5000);
        else if (is("replayKeySlower", "[")) this.stepSpeed(-1);
        else if (is("replayKeyFaster", "]")) this.stepSpeed(1);
        else if (is("replayKeyHud", "G")) document.body.classList.toggle("replayHud");
        else handled = false;

        if (handled) e.preventDefault();
    },

    stepSpeed: function (dir) {
        var at = this.speeds.reduce((best, s, i) => Math.abs(s - ReplaySession.speed) < Math.abs(this.speeds[best] - ReplaySession.speed) ? i : best, 0);
        ReplaySession.setSpeed(this.speeds[Math.max(0, Math.min(this.speeds.length - 1, at + dir))]);
    },

    setHidden: function (hidden) {
        this.hidden = hidden;
        if (this.bar) this.bar.style.display = hidden ? "none" : "flex";
        if (this.note) this.note.style.display = hidden ? "none" : "block";
        if (this.hint) this.hint.style.display = hidden || ReplayCamera.mode !== "free" ? "none" : "block";
    },

    open: function () {
        var el = this.el.bind(this);
        this.hidden = false;

        this.playBtn = el("button", { class: "ssbutton orange", text: "Pause", onclick: () => ReplaySession.toggle() });
        this.range = el("input", { type: "range", min: 0, max: ReplaySession.duration, step: 50, value: 0 });
        this.range.oninput = () => { this.scrubbing = true; this.timeLabel.textContent = this.time(this.range.value, true) + " / " + this.time(ReplaySession.duration, true) };
        this.range.onchange = async () => { ReplayReel.stop(); await ReplaySession.seek(Number(this.range.value)); this.scrubbing = false };
        this.track = el("div", { class: "lrTrack" }, [this.range]);
        ReplaySession.kills.forEach((kill) => this.addTick(kill.tMs, "kill"));
        ReplaySession.markers.filter((marker) => marker.kind !== "kill").forEach((marker) => this.addTick(marker.tMs, "mark"));

        this.timeLabel = el("span", { class: "lrTime", text: "0:00.0" });
        this.viewSelect = el("select", { title: "Camera view" });
        ReplayViews.groups.forEach(([group, ids]) => {
            var box = el("optgroup", { label: group });
            ids.forEach((view) => box.appendChild(el("option", { value: view, text: ReplayViews.names[view] })));
            this.viewSelect.appendChild(box);
        });
        this.viewSelect.onchange = () => { ReplayReel.stop(); ReplayCamera.setView(this.viewSelect.value); this.viewSelect.blur() }; //blurred, so the keys go back to the camera and not the list
        this.playerSelect = el("select", { title: "Player" });
        this.playerSelect.onchange = () => { ReplayReel.stop(); ReplayCamera.watch(Number(this.playerSelect.value)); this.playerSelect.blur() };
        this.focusSelect = el("select", { title: "Place", style: "display: none" }); //shown while the view is a place rather than a player
        this.focusSelect.onchange = () => { ReplayReel.stop(); ReplayCamera.setFocus(this.focusSelect.value); this.focusSelect.blur() };
        this.speedSelect = el("select", { title: "Speed" });
        this.speeds.forEach((speed) => this.speedSelect.appendChild(el("option", { value: String(speed), text: speed + "x" })));
        this.speedSelect.value = "1";
        this.speedSelect.onchange = () => { ReplaySession.setSpeed(Number(this.speedSelect.value)); this.speedSelect.blur() };
        this.reelBtn = el("button", { class: "ssbutton blue", text: "Highlights", title: "Make a highlight reel", onclick: () => this.openHighlights() });
        this.lookSelect = el("select", { title: "Look" });
        [["clean", "Clean"], ["cinematic", "Cinematic"], ["hype", "Hype"], ["retro", "Retro"]].forEach(([value, text]) => this.lookSelect.appendChild(el("option", { value, text })));
        this.lookSelect.onchange = () => { ReplayFx.base = this.lookSelect.value; ReplayFx.setLook(ReplayFx.base); this.lookSelect.blur() };
        this.liveBtn = el("button", { class: "ssbutton red", text: "LIVE", title: "Back to the live edge", style: "display: none", onclick: () => ReplaySession.goLive() });
        this.stopBtn = el("button", { class: "ssbutton red", text: "Stop reel", style: "display: none", onclick: () => ReplayReel.stop() });
        this.hudBtn = el("button", { class: "ssbutton blue", text: "HUD", title: "Show the game hud", onclick: () => document.body.classList.toggle("replayHud") });
        this.popBtn = el("button", { class: "ssbutton blue", text: "Pop out", title: "Move these controls to their own window, so the game is all that is in this one", onclick: () => this.popOut() });
        this.exitBtn = el("button", { class: "ssbutton red", text: "Exit", onclick: () => showMainMenu() });

        this.bar = el("div", { class: "shadedPane textShadow lrPanel lrBar" }, [this.playBtn, this.track, this.timeLabel, this.liveBtn, this.speedSelect, this.viewSelect, this.playerSelect, this.focusSelect, this.lookSelect, this.reelBtn, this.stopBtn, this.hudBtn, this.popBtn, this.exitBtn]);
        this.hint = el("div", { class: "shadedPane textShadow lrPanel lrHint", text: "Click the view to look around (Esc lets go). W A S D move, E / Q up and down, Shift fast, wheel speed, Alt + wheel zoom, Z / X roll, V resets." });
        this.host().appendChild(this.hint);
        this.note = el("div", { class: "shadedPane textShadow lrPanel lrNote", text: this.baseNote() });
        this.host().appendChild(this.bar);
        this.host().appendChild(this.note);

        this.timer = setInterval(() => this.tick(), 200);
        this.refresh();
    },

    redrawTicks: function () {
        this.ticksAt = Date.now();
        [...this.track.querySelectorAll(".lrTick")].forEach((tick) => tick.remove());
        ReplaySession.kills.forEach((kill) => this.addTick(kill.tMs, "kill"));
        ReplaySession.markers.filter((marker) => marker.kind !== "kill").forEach((marker) => this.addTick(marker.tMs, "mark"));
    },

    addTick: function (tMs, kind) {
        if (!ReplaySession.duration) return;
        this.track.appendChild(this.el("div", { class: "lrTick " + kind, style: "left: calc(" + (tMs / ReplaySession.duration * 100) + "% - 1px)" }));
    },

    //the control bar in a window of its own (a second monitor, or so the game window can be captured clean). it is the same bar moved over, so everything on it works as before, and
    //the keys work from there too. closing the window puts it back
    //where the replay ui goes: the pop out window if there is one, else the page
    host: function () {
        if (!this.popup || this.popup.closed) return document.body;
        this.syncStyles();
        return this.popup.document.body;
    },

    //styles the ui adds after the window opened (the editor's, the exporter's) are copied over as they appear
    syncStyles: function () {
        var head = this.popup.document.head;
        document.querySelectorAll("link[rel=stylesheet], style").forEach((node) => {
            if (node.lrCopy && node.lrCopy.ownerDocument === this.popup.document) return;
            node.lrCopy = node.cloneNode(true);
            head.insertBefore(node.lrCopy, head.querySelector("#lrPopStyle"));
        });
    },

    popOut: function () {
        if (this.popup && !this.popup.closed) return this.popup.focus();
        var w = window.open("", "legacyreplayPanel", "popup=yes,width=1100,height=720");
        if (!w) return this.toast("The browser blocked the new window");
        this.popup = w;
        w.document.open();
        w.document.write("<!doctype html><title>Replay controls</title>");
        w.document.close();
        var style = w.document.createElement("style");
        style.id = "lrPopStyle"; //the game sizes everything off the window height (2.2vh), which in a tall thin window is huge. here it goes off the width too
        style.textContent = "body { margin: 0; overflow: hidden; background: #ffe9c9 } * { font-size: clamp(12px, min(2.2vh, 1.25vw), 22px) }";
        w.document.head.appendChild(style);
        this.syncStyles();
        [this.bar, ReplaySpectate.bar, this.note, this.hint, this.toastEl, ReplayEditor.panel, ...document.querySelectorAll(".lrBack")].forEach((node) => node && w.document.body.appendChild(node)); //all of it, the game keeps only its own hud. the spectating bar too, when that is what is open
        this.popButtons().forEach((button) => button.style.display = "none");
        w.addEventListener("keydown", ReplayCamera.onKeyDown, true);
        w.addEventListener("keyup", ReplayCamera.onKeyUp, true);
        if (ReplaySpectate.onKey) w.addEventListener("keydown", ReplaySpectate.onKey, true);
        w.addEventListener("pagehide", () => this.popIn());
    },

    //the pop out buttons there are: the replay bar's, and the spectating bar's
    popButtons: function () {
        return [this.bar && this.popBtn, ReplaySpectate.bar && ReplaySpectate.popBtn].filter(Boolean);
    },

    popIn: function () {
        if (!this.popup) return;
        var w = this.popup;
        this.popup = null;
        try { [...w.document.body.children].forEach((node) => document.body.appendChild(node)) } catch (e) { };
        this.popButtons().forEach((button) => button.style.display = "");
        try { w.removeEventListener("keydown", ReplayCamera.onKeyDown, true); w.removeEventListener("keyup", ReplayCamera.onKeyUp, true); if (ReplaySpectate.onKey) w.removeEventListener("keydown", ReplaySpectate.onKey, true); if (!w.closed) w.close() } catch (e) { };
    },

    close: function () {
        this.popIn();
        clearInterval(this.timer);
        ReplayEditor.close();
        [this.bar, this.note, this.hint, this.toastEl].forEach((node) => node && node.remove());
        this.bar = this.note = this.hint = this.toastEl = null;
    },

    //the pickers follow the room and the camera
    refresh: function () {
        if (typeof ReplaySpectate !== "undefined") ReplaySpectate.refresh();
        if (!this.bar) return;
        var el = this.el.bind(this), select = this.playerSelect;
        select.innerHTML = "";
        iteratePlayers((player) => { if (player.id !== meId && player.playing) select.appendChild(el("option", { value: String(player.id), text: player.name || ("Player " + player.id) })) });
        if (ReplayCamera.target) select.value = String(ReplayCamera.target.id);
        [...this.viewSelect.querySelectorAll(".lrShotView")].forEach((o) => o.remove());
        if (ReplayViews.isBullet(ReplayCamera.mode)) this.viewSelect.appendChild(el("option", { value: ReplayCamera.mode, text: ReplayViews.names[ReplayCamera.mode], class: "lrShotView" })); //only ever set by a reel shot
        this.viewSelect.value = ReplayCamera.views.includes(ReplayCamera.mode) || ReplayViews.isBullet(ReplayCamera.mode) ? ReplayCamera.mode : "free";
        this.speedSelect.value = String(this.speeds.includes(ReplaySession.speed) ? ReplaySession.speed : 1);
        this.fillFocus(this.focusSelect, this.playerSelect);
        if (this.hint) this.hint.style.display = ReplayCamera.mode === "free" && !this.hidden ? "block" : "none";
    },

    tick: function () {
        if (!ReplaySession.active || !this.bar) return;
        this.playBtn.textContent = ReplaySession.playing ? "Pause" : (ReplaySession.time >= ReplaySession.duration ? "Replay" : "Play");
        if (ReplaySession.live || this.wasLive) { //what is being watched keeps growing: the bar's length and the ticks along it follow
            this.range.max = ReplaySession.duration;
            this.liveBtn.style.display = ReplaySession.live ? "" : "none";
            this.liveBtn.style.opacity = ReplaySession.following ? "1" : "0.6";
            if (this.wasLive !== ReplaySession.live || Date.now() - (this.ticksAt || 0) > 1500) this.redrawTicks();
            this.wasLive = ReplaySession.live;
        };
        if (!this.scrubbing) {
            this.range.value = ReplaySession.time;
            this.timeLabel.textContent = this.time(ReplaySession.time, true) + " / " + this.time(ReplaySession.duration, true);
        };
        var ids = []; iteratePlayers((player) => { if (player.id !== meId && player.playing) ids.push(player.id) });
        if (ids.join() !== this.lastIds) { this.lastIds = ids.join(); this.refresh() };
        if (ReplayCamera.mode === "focus") this.fillFocus(this.focusSelect, this.playerSelect); //pickups come and go
    },

    //the list of places, in the picker that takes the player picker's place while the view is a place. only rebuilt when the places change, so an open list isn't shut under the mouse
    fillFocus: function (select, playerSelect) {
        var focus = ReplayCamera.mode === "focus";
        select.style.display = focus ? "" : "none";
        if (playerSelect) playerSelect.style.display = focus || ReplayCamera.mode === "tour" ? "none" : "";
        if (!focus) return;
        var list = ReplayCamera.pois(), signature = list.map((p) => p.id).join("|");
        if (select.signature !== signature) {
            select.signature = signature;
            select.innerHTML = "";
            var box = null;
            list.forEach((p) => {
                if (!box || box.label !== p.group) { box = this.el("optgroup", { label: p.group }); select.appendChild(box) };
                box.appendChild(this.el("option", { value: p.id, text: p.label }));
            });
        };
        select.value = ReplayCamera.focusId;
    },

    //a line of feedback near the bottom (camera speed, zoom)
    toast: function (text) {
        if (!this.bar) return;
        if (!this.toastEl) { this.toastEl = this.el("div", { class: "shadedPane textShadow lrPanel lrToast" }); this.host().appendChild(this.toastEl) };
        this.toastEl.textContent = text;
        this.toastEl.style.opacity = "1";
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { if (this.toastEl) this.toastEl.style.opacity = "0" }, 1400);
    },

    //the note in the corner says where the reel is
    //the map, and where the replay came from
    baseNote: function () {
        var trust = ReplaySession.trust, labels = { verified: "Verified" + (trust && trust.serverName ? " (" + trust.serverName + ")" : ""), unverified: "Not verified", unknown: "Other server", unsigned: "Unsigned" };
        return ReplaySession.header.mapName + (ReplaySession.live ? ", LIVE" : trust ? ", " + labels[trust.status] : "") + (ReplaySession.damaged ? " (damaged replay, ends early)" : "");
    },

    reelChanged: function () {
        if (!this.note || !this.bar) return;
        var base = this.baseNote();
        var shot = ReplayReel.active && ReplayReel.shots[ReplayReel.i];
        this.note.textContent = shot ? "Reel " + (ReplayReel.i + 1) + "/" + ReplayReel.shots.length + ": " + shot.why : base;
        this.reelBtn.textContent = "Highlights";
        this.stopBtn.style.display = ReplayReel.active ? "" : "none";
        if (typeof ReplayEditor !== "undefined") ReplayEditor.highlight(ReplayReel.active ? ReplayReel.i : -1, ReplayReel.shots.length, ReplayReel.active && ReplayReel.whole);
    },

    //the highlights panel (who, how long, what style, then the shots to edit) is editor.js
    openHighlights: function () {
        ReplayEditor.toggle();
    },

    //the list of what is saved on this device. it is opened from the Replay tab of the settings
    openLibrary: async function () {
        var el = this.el.bind(this);
        if (document.getElementById("lrLibBack")) return;
        var list = el("div"), back = el("div", { id: "lrLibBack", class: "lrBack" });
        var close = () => back.remove();
        back.onclick = (e) => { if (e.target === back) close() };

        var fileInput = el("input", { type: "file", accept: ".lsreplay", style: "display: none" });
        fileInput.onchange = () => { if (fileInput.files[0]) { close(); this.importFile(fileInput.files[0], true) } };

        var panel = el("div", { class: "alert roundedBorder lrDialog" }, [
            el("h1", { text: "Replays" }),
            list,
            el("div", { class: "lrRow" }, [
                el("div", { class: "info sub", text: "Clips from /replay clip (or F8 in a game) are saved here. Drop a .lsreplay file on the page to watch one." }),
                el("button", { class: "ssbutton blue", text: "Open file", onclick: () => fileInput.click() }),
                el("button", { class: "ssbutton red", text: "Close", onclick: close }),
            ]),
            fileInput,
        ]);
        back.appendChild(panel);
        document.body.appendChild(back);

        var reopen = () => { back.remove(); this.openLibrary() };
        var items = await LegacyReplay.fillKeys(await LegacyReplay.list());
        var remote = null, problem = "";
        try { remote = await LegacyReplay.refreshRemote() } catch (e) { problem = e.message };
        var online = remote && remote.list;
        var account = el("div", { class: "sub", title: remote && remote.stale ? remote.stale : "", text: (remote && remote.stale ? "(Couldn't refresh: " + remote.stale + ".) " : "") + (!LegacyReplay.signedIn() ? "Sign in to keep replays on your account." : online ? "Account: " + remote.list.length + "/" + remote.limits.replays + " replays, " + this.size(remote.used.bytes) + " of " + this.size(remote.limits.bytes) : "Account unavailable: " + problem) });
        list.insertBefore(account, list.firstChild);

        //one row for each replay, wherever it is kept
        var rows = items.map((item) => ({ key: item.key, local: item, remote: online ? remote.list.find((r) => r.replayKey === item.key) : null }));
        if (online) remote.list.forEach((r) => { if (!rows.some((row) => row.remote === r)) rows.push({ key: r.replayKey, local: null, remote: r }) });
        if (!rows.length) list.appendChild(el("div", { class: "sub", text: "Nothing saved yet. In a game, press F8 or type /replay clip to keep the last 30 seconds." }));

        rows.forEach(({ local, remote: kept }) => {
            var info = local || { mapName: kept.map, created: kept.created, duration: kept.duration, players: kept.players, size: kept.bytes };
            var where = [local ? "this device" : null, kept ? (kept.pinned ? "your account (pinned)" : "your account, " + Math.max(0, Math.ceil((kept.expires - Date.now()) / 864e5)) + " days left") : null].filter(Boolean).join(" and ");
            var buttons = [el("button", { class: "ssbutton green", text: "Watch", onclick: () => { close(); local ? this.watch(local.id) : this.watchRemote(kept.id) } })];
            if (local) buttons.push(el("button", { class: "ssbutton blue", text: "Download", onclick: () => LegacyReplay.download(local.id) }));
            if (local && online && !kept) buttons.push(el("button", { class: "ssbutton blue", text: "Upload", title: "Keep it on your account too", onclick: async () => { try { await LegacyReplay.upload(local.id) } catch (e) { alert(e.message) }; reopen() } }));
            if (kept) buttons.push(el("button", { class: "ssbutton blue", text: kept.pinned ? "Unpin" : "Pin", title: "Pinned replays don't expire", onclick: async () => { try { await LegacyReplay.pinRemote(kept.id, !kept.pinned) } catch (e) { alert(e.message) }; reopen() } }));
            if (local) buttons.push(el("button", { class: "ssbutton red", text: "Delete", title: kept ? "Delete it from this device (it stays on your account)" : "Delete it", onclick: async () => { await LegacyReplay.remove(local.id); reopen() } }));
            if (kept) buttons.push(el("button", { class: "ssbutton red", text: local ? "Remove" : "Delete", title: "Delete it from your account", onclick: async () => { try { await LegacyReplay.removeRemote(kept.id) } catch (e) { alert(e.message) }; reopen() } }));
            list.appendChild(el("div", { class: "lrRow" }, [
                el("div", { class: "info" }, [
                    el("div", { text: info.mapName || "Replay" }),
                    el("div", { class: "sub", text: new Date(info.created).toLocaleString() + "  |  " + this.time(info.duration) + "  |  " + info.players + " players  |  " + Math.ceil(info.size / 1024) + "KB" + (kept && kept.trust === "verified" ? "  |  verified" : "") }),
                    el("div", { class: "sub", text: "On " + where }),
                ]),
                ...buttons,
            ]));
        });
    },

    watchRemote: async function (remoteId) {
        try {
            await ReplaySession.start(await LegacyReplay.fetchRemote(remoteId));
        } catch (e) {
            ReplaySession.failed(e);
        };
    },

    watch: async function (id) {
        try {
            var replay = await LegacyReplay.get(id);
            if (!replay) throw new Error("it is no longer saved");
            await ReplaySession.start(new Uint8Array(replay.bytes));
        } catch (e) {
            ReplaySession.failed(e);
        };
    },

    importFile: async function (file, watch) {
        try {
            var bytes = new Uint8Array(await file.arrayBuffer());
            var parsed = ReplayFormat.parse(await ReplayFormat.unpack(bytes)); //read through the safe reader before it is kept
            var id = await LegacyReplay.save(bytes, parsed);
            if (watch) await this.watch(id);
        } catch (e) {
            LegacyReplay.chat("That file couldn't be read: " + ReplayFormat.escapeHtml(e.message));
            console.log("[legacyreplay] import failed:", e);
            alert("That file couldn't be read as a replay: " + e.message);
        };
    },
};

ReplayViewer.registerListeners(plugins);
