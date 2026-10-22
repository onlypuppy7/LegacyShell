//legacyshell: replay reel editor (browser bundle only). a side panel, not a popup, so the replay stays in view and can be scrubbed while shots are lined up.
//the shots are plain data (see ReplayDirector.cleanReel), this changes them and re-draws
//

export const ReplayEditor = {
    panel: null,
    reel: null, //the shots being edited
    saved: [],
    playing: -1,

    css: `
        .lrSide.lrDialog.alert { position: fixed; z-index: 99998; right: 0.8em; top: 0.8em; bottom: 7.4em; width: min(44em, 62vw); max-height: none; overflow: auto; box-sizing: border-box; pointer-events: auto; user-select: none; }
        .lrSide h1 { margin: 0 0 0.3em 0; text-align: center; }
        .lrSide .lrGrid { display: flex; flex-wrap: wrap; gap: 0.4em 0.8em; align-items: center; margin-bottom: 0.4em; }
        .lrSide .lrGrid label { display: flex; align-items: center; gap: 0.3em; margin: 0; }
        .lrSide .lrGrid label span { font-weight: bold; }
        .lrSide input[type=number] { width: 4.4em; height: 1.75em; box-sizing: border-box; }
        .lrSide input[type=text] { height: 1.75em; box-sizing: border-box; width: 11em; }
        .lrSide select { height: 1.75em; max-width: 8.5em; }
        .lrSide .lrShots { margin: 0.4em 0; }
        .lrSide .lrShot { padding: 0.35em 0.3em; border-top: 1px solid rgba(83, 42, 25, 0.25); }
        .lrSide .lrShot.now { background: rgba(240, 138, 30, 0.22); border-radius: 0.3em; }
        .lrSide .lrShot .top { display: flex; align-items: center; gap: 0.35em; margin-bottom: 0.25em; }
        .lrSide .lrShot .top .why { flex: 1; min-width: 0; font-size: 0.85em; opacity: 0.75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .lrSide .lrShot .rest { display: flex; flex-wrap: wrap; gap: 0.3em; align-items: center; }
        .lrSide .lrShot .rest label { display: flex; align-items: center; gap: 0.3em; margin: 0; flex: none; white-space: nowrap; }
        .lrSide .lrShot .ssbutton { padding: 0 0.55em; min-width: 1.9em; }
        .lrSide .lrFoot { display: flex; flex-wrap: wrap; gap: 0.4em; align-items: center; border-top: 1px solid rgba(83, 42, 25, 0.25); padding-top: 0.5em; }
        .lrSide .sub { opacity: 0.7; font-size: 0.85em; }
    `,

    seconds: function (ms) {
        return Math.round(ms / 100) / 10;
    },

    registerListeners: function (pluginManager) {
        var style = document.createElement("style");
        style.textContent = this.css;
        document.head.appendChild(style);
    },

    names: function () {
        var names = {};
        var anonymous = ReplaySession.anonymous();
        ReplaySession.header.players.forEach((p) => names[p.id] = anonymous || !p.name ? "Player " + p.id : p.name);
        return names;
    },

    close: function () {
        if (this.panel) this.panel.remove();
        this.panel = null;
    },

    toggle: function () {
        this.panel ? this.close() : this.open();
    },

    open: async function () {
        if (this.panel) return;
        var el = ReplayViewer.el.bind(ReplayViewer);
        var header = ReplaySession.header, names = this.names();
        var select = (options, value) => { var s = el("select"); options.forEach(([v, t]) => s.appendChild(el("option", { value: String(v), text: t }))); s.value = String(value); return s };

        this.who = select([["all", "Everyone"], ...header.players.map((p) => [p.id, names[p.id]])], "all");
        this.length = select([[15, "15 s"], [30, "30 s"], [60, "60 s"], [90, "90 s"], [120, "2 min"]], 30);
        this.style = select([["chill", "Chill"], ["hype", "Hype"]], "hype");
        this.look = select([["clean", "Clean"], ["cinematic", "Cinematic"], ["hype", "Hype"], ["retro", "Retro"]], "clean");
        this.savedSelect = select([["", "(none saved)"]], "");
        this.musicName = el("span", { class: "sub", text: ReplayAudio.music ? ReplayAudio.music.name : "none" });
        this.musicInput = el("input", { type: "file", accept: "audio/*", style: "display: none" });
        this.musicInput.onchange = async () => { try { if (this.musicInput.files[0]) { await ReplayAudio.loadMusic(this.musicInput.files[0]); this.musicName.textContent = ReplayAudio.music.name } } catch (e) { ReplayViewer.toast("Couldn't use that: " + e.message) } };
        this.nameInput = el("input", { type: "text", value: "My reel", maxLength: 60 });
        this.summary = el("div", { class: "sub" });
        this.list = el("div", { class: "lrShots" });
        this.fileInput = el("input", { type: "file", accept: ".json,.lsreel", style: "display: none" });
        this.fileInput.onchange = () => { if (this.fileInput.files[0]) this.importFile(this.fileInput.files[0]) };

        var generate = el("button", { class: "ssbutton orange", text: "Generate", onclick: () => this.generate() });
        var play = el("button", { class: "ssbutton green", text: "Play reel", onclick: () => this.playAll() });
        var add = el("button", { class: "ssbutton blue", text: "Add shot here", title: "A shot of the current camera, from the current time", onclick: () => this.addHere() });

        this.panel = el("div", { class: "alert roundedBorder lrDialog lrSide" }, [
            el("h1", { text: "Highlights" }),
            el("div", { class: "lrGrid" }, [
                el("label", {}, [el("span", { text: "Who" }), this.who]), el("label", {}, [el("span", { text: "Length" }), this.length]),
                el("label", {}, [el("span", { text: "Style" }), this.style]), el("label", {}, [el("span", { text: "Look" }), this.look]), generate,
            ]),
            el("div", { class: "lrGrid" }, [
                el("label", {}, [el("span", { text: "Saved" }), this.savedSelect]),
                el("button", { class: "ssbutton blue", text: "Load", onclick: () => this.loadSaved() }),
                el("button", { class: "ssbutton red", text: "Delete", onclick: () => this.deleteSaved() }),
                el("button", { class: "ssbutton blue", text: "Import file", onclick: () => this.fileInput.click() }),
            ]),
            el("div", { class: "lrGrid" }, [el("label", {}, [el("span", { text: "Music" }), this.musicName]), el("button", { class: "ssbutton blue", text: "Choose", onclick: () => this.musicInput.click() }), el("button", { class: "ssbutton blue", text: "Clear", onclick: () => { ReplayAudio.clearMusic(); this.musicName.textContent = "none" } }), this.musicInput]),
            this.summary, this.list,
            el("div", { class: "lrFoot" }, [add, play, this.nameInput, el("button", { class: "ssbutton blue", text: "Save", onclick: () => this.save() }),
                el("button", { class: "ssbutton blue", text: "Export", title: "Save the reel as a file", onclick: () => this.exportFile() }), el("button", { class: "ssbutton green", text: "Video", title: "Record the reel as a video (mp4)", onclick: () => ReplayExport.open() }), el("button", { class: "ssbutton red", text: "Close", onclick: () => this.close() })]),
            this.fileInput,
        ]);
        document.body.appendChild(this.panel);
        await this.refreshSaved();
        this.render();
    },

    refreshSaved: async function () {
        var el = ReplayViewer.el.bind(ReplayViewer);
        this.saved = await LegacyReplay.listReels(ReplaySession.key);
        if (!this.savedSelect) return;
        this.savedSelect.innerHTML = "";
        if (!this.saved.length) this.savedSelect.appendChild(el("option", { value: "", text: "(none saved)" }));
        this.saved.forEach((r) => this.savedSelect.appendChild(el("option", { value: r.id, text: r.name + " (" + r.shots + ")" })));
    },

    options: function () {
        return { who: this.who.value === "all" ? "all" : Number(this.who.value), lengthMs: Number(this.length.value) * 1000, style: this.style.value, look: this.look.value };
    },

    generate: function () {
        var options = this.options();
        var generated = ReplayDirector.reel(ReplaySession.records, ReplaySession.header, options);
        this.reel = ReplayDirector.toReel(generated, options, this.nameInput.value);
        this.reel.found = generated.found;
        this.summary.textContent = generated.shots.length ? generated.moments.length + " moments, " + ReplayViewer.time(generated.total) + " (" + generated.found + " found in the replay)" : "Nothing worth a highlight here. Reels are built from kills, and clips saved before this version have none. You can still add shots by hand.";
        this.render();
    },

    //anything changed re-links the cuts and re-draws
    changed: function () {
        ReplayDirector.relink(this.reel.shots);
        this.render();
    },

    ensureReel: function () {
        if (!this.reel) this.reel = { v: 1, name: this.nameInput.value, created: Date.now(), options: this.options(), shots: [] };
        return this.reel;
    },

    addHere: function () {
        var reel = this.ensureReel(), t = ReplaySession.time;
        var mode = ReplayCamera.mode, view = ["first", "pov", "chase", "shoulder", "side", "low", "top", "orbit", "security", "free"].includes(mode) ? mode : "free";
        var shot = ReplayDirector.makeShot(reel.shots, t, Math.min(ReplaySession.duration, t + 3000), view, ReplayCamera.targetId);
        if (shot.end - shot.start < 500) shot.start = Math.max(0, shot.end - 3000), shot.speed = [[shot.start, 1]];
        reel.shots.push(shot);
        reel.shots.sort((a, b) => a.start - b.start);
        this.changed();
    },

    move: function (i, dir) {
        var shots = this.reel.shots, j = i + dir;
        if (j < 0 || j >= shots.length) return;
        [shots[i], shots[j]] = [shots[j], shots[i]];
        this.changed();
    },

    render: function () {
        if (!this.panel) return;
        var el = ReplayViewer.el.bind(ReplayViewer), names = this.names();
        var shots = this.reel ? this.reel.shots : [];
        var duration = ReplaySession.duration;
        this.list.innerHTML = "";
        if (!shots.length) return this.list.appendChild(el("div", { class: "sub", text: "No shots yet. Generate a reel, load a saved one, or add shots by hand." }));

        var total = shots.reduce((n, s) => n + (s.end - s.start), 0);
        this.list.appendChild(el("div", { class: "sub", text: shots.length + " shots, " + ReplayViewer.time(total) + " of replay time" }));

        shots.forEach((shot, i) => {
            var select = (options, value, onchange) => { var s = el("select"); options.forEach(([v, t]) => s.appendChild(el("option", { value: String(v), text: t }))); s.value = String(value); s.onchange = () => onchange(s.value); return s };
            var time = (key) => {
                var input = el("input", { type: "number", step: 0.1, min: 0, max: this.seconds(duration), value: this.seconds(shot[key]) });
                input.onchange = () => {
                    var ms = Math.round(Number(input.value) * 1000);
                    if (!Number.isFinite(ms)) return this.render();
                    shot[key] = Math.max(0, Math.min(duration, ms));
                    if (shot.end < shot.start + 200) { if (key === "start") shot.start = Math.max(0, shot.end - 200); else shot.end = Math.min(duration, shot.start + 200) };
                    ReplayDirector.fitSpeed(shot);
                    this.changed();
                };
                return input;
            };

            var views = [["first", "First person"], ["pov", "Their view (hud)"], ["chase", "Chase"], ["shoulder", "Over the shoulder"], ["side", "Side on"], ["low", "Low angle"], ["top", "Top down"], ["orbit", "Orbit"], ["security", "Security camera"], ["free", "Free (fixed)"], ...(shot.bullet ? [["bullet", "Bullet"]] : [])];
            var speeds = Object.keys(ReplayDirector.speedPresets).map((n) => [n, n]);
            var speedName = ReplayDirector.speedName(shot);
            if (speedName === "as made") speeds.push(["as made", "as made"]);
            var targetOptions = [["", "-"], ...ReplaySession.header.players.map((p) => [p.id, names[p.id]])];

            var row = el("div", { class: "lrShot" + (this.playing === i ? " now" : ""), title: shot.why }, [
                el("div", { class: "top" }, [
                    el("button", { class: "ssbutton green", text: "▶", title: "Preview this shot", onclick: () => this.preview(i) }),
                    el("b", { text: (i + 1) + "." }), el("span", { class: "why", text: shot.why }),
                    el("button", { class: "ssbutton blue", text: "↑", title: "Move up", onclick: () => this.move(i, -1) }),
                    el("button", { class: "ssbutton blue", text: "↓", title: "Move down", onclick: () => this.move(i, 1) }),
                    el("button", { class: "ssbutton blue", text: "⧉", title: "Duplicate", onclick: () => { shots.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(shot)), id: ReplayDirector.newId(shots) }); this.changed() } }),
                    el("button", { class: "ssbutton red", text: "✕", title: "Remove", onclick: () => { shots.splice(i, 1); this.changed() } }),
                ]),
                el("div", { class: "rest" }, [
                    el("span", { text: "from" }), time("start"), el("span", { text: "to" }), time("end"),
                    select(views, shot.view, (v) => { shot.view = v; this.changed() }),
                    select(targetOptions, shot.target === null || shot.target === undefined ? "" : shot.target, (v) => { shot.target = v === "" ? null : Number(v); this.changed() }),
                    select(speeds, speedName, (v) => { if (v !== "as made") shot.speed = ReplayDirector.speedPresets[v](shot); this.changed() }),
                    select([["", "reel look"], ["clean", "clean"], ["cinematic", "cinematic"], ["hype", "hype"], ["retro", "retro"]], shot.fx || "", (v) => { shot.fx = v; this.changed() }),
                    el("label", { title: "Take longer and start more gently when changing camera into this shot, instead of the usual blend" }, [el("input", { type: "checkbox", checked: !!shot.smooth, onchange: (e) => { shot.smooth = e.target.checked; this.changed() } }), el("span", { text: "smooth" })]),
                ]),
            ]);
            this.list.appendChild(row);
        });
    },

    //a copy, so editing while it plays cant change what is playing
    copy: function (shots) {
        return JSON.parse(JSON.stringify(shots));
    },

    preview: function (i) {
        if (!this.reel) return;
        ReplayReel.start({ shots: this.copy([this.reel.shots[i]]).map((s) => ({ ...s, cut: true, smooth: false })), look: this.look.value });
    },

    playAll: function () {
        if (!this.reel || !this.reel.shots.length) return;
        ReplayReel.start({ shots: this.copy(this.reel.shots), look: this.look.value, whole: true });
    },

    //the reel runner says which shot it is on
    highlight: function (shotIndex, count, whole) {
        this.playing = whole && shotIndex >= 0 ? shotIndex : -1;
        this.render();
    },

    cleanCurrent: function () {
        var reel = this.ensureReel();
        reel.name = this.nameInput.value || "Reel";
        reel.options = this.options();
        return ReplayDirector.cleanReel(JSON.parse(JSON.stringify(reel)), ReplaySession.header); //through the same checks a loaded file gets, so what is saved is always loadable
    },

    save: async function () {
        try {
            var reel = this.cleanCurrent();
            if (!reel.shots.length) throw new Error("there are no shots to save");
            await LegacyReplay.saveReel(ReplaySession.key, reel);
            await this.refreshSaved();
            ReplayViewer.toast("Saved \"" + reel.name + "\"");
        } catch (e) {
            ReplayViewer.toast("Couldn't save: " + e.message);
        };
    },

    loadSaved: async function () {
        var id = this.savedSelect.value;
        if (!id) return;
        try {
            var stored = await LegacyReplay.getReel(id);
            this.setReel(ReplayDirector.cleanReel(stored.reel, ReplaySession.header));
        } catch (e) {
            ReplayViewer.toast("Couldn't load: " + e.message);
        };
    },

    deleteSaved: async function () {
        var id = this.savedSelect.value;
        if (!id) return;
        await LegacyReplay.removeReel(id);
        await this.refreshSaved();
    },

    setReel: function (reel) {
        this.reel = reel;
        this.nameInput.value = reel.name;
        this.who.value = String(reel.options.who);
        this.style.value = reel.options.style;
        this.look.value = reel.options.look;
        this.summary.textContent = reel.shots.length + " shots loaded";
        this.render();
    },

    exportFile: function () {
        try {
            var reel = this.cleanCurrent();
            var a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...reel, replayKey: ReplaySession.key }, null, 1)], { type: "application/json" }));
            a.download = (reel.name.replace(/[^\w\- ]+/g, "") || "reel") + ".lsreel.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1e4);
        } catch (e) {
            ReplayViewer.toast("Couldn't export: " + e.message);
        };
    },

    importFile: async function (file) {
        try {
            if (file.size > 2 * 1024 * 1024) throw new Error("that file is too big to be a reel");
            var raw = ReplayFormat.parseJson(new Uint8Array(await file.arrayBuffer()));
            this.setReel(ReplayDirector.cleanReel(raw, ReplaySession.header));
        } catch (e) {
            ReplayViewer.toast("Couldn't read that reel: " + e.message);
        };
    },
};

ReplayEditor.registerListeners(plugins);
