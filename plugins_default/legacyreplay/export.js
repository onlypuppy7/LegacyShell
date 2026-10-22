//legacyshell: replay video export (browser bundle only). plays the reel through once, as it would play on screen, and records it: the game's canvas with the letterbox and flash laid over it,
//the game's sound and the music, into an mp4 (a webm on a browser that can't make mp4). it records live, so it takes as long as the reel does and the tab has to stay in front.
//everything stays in the browser, nothing is sent anywhere
//

export const ReplayExport = {
    aspects: [["window", "Window"], ["16:9", "16:9 (widescreen)"], ["9:16", "9:16 (vertical)"], ["1:1", "1:1 (square)"], ["4:3", "4:3"], ["21:9", "21:9 (ultrawide)"]],
    sizes: [[480, "480p"], [720, "720p"], [1080, "1080p"], [1440, "1440p"]], //the short side
    rates: [24, 30, 60],
    qualities: { low: ["Low", 0.05], medium: ["Medium", 0.09], high: ["High", 0.16], max: ["Max", 0.28] }, //bits per pixel per frame
    chosen: { aspect: "window", size: 1080, fps: 30, quality: "high", sound: true },
    running: false,

    //what this browser can record to, best first
    format: function () {
        if (typeof MediaRecorder === "undefined") return null;
        var list = [["video/mp4;codecs=avc1.640034,mp4a.40.2", "mp4"], ["video/mp4;codecs=avc1.4d0034,mp4a.40.2", "mp4"], ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"], ["video/mp4", "mp4"],
            ["video/webm;codecs=vp9,opus", "webm"], ["video/webm;codecs=vp8,opus", "webm"], ["video/webm", "webm"]];
        var found = list.find(([type]) => MediaRecorder.isTypeSupported(type));
        return found ? { type: found[0], ext: found[1] } : null;
    },

    //output size: the short side as picked, the long side from the aspect, both even (video wants that)
    dimensions: function (aspect, short) {
        var ratio = aspect === "window" ? innerWidth / innerHeight : Number(aspect.split(":")[0]) / Number(aspect.split(":")[1]);
        var w = ratio >= 1 ? short * ratio : short, h = ratio >= 1 ? short : short / ratio;
        return { w: Math.round(w / 2) * 2, h: Math.round(h / 2) * 2, ratio: w / h };
    },

    css: function () {
        if (document.getElementById("lrExportCss")) return;
        var style = ReplayViewer.el("style", { id: "lrExportCss", text: `
            body.lrExporting .lrPanel, body.lrExporting .lrSide, body.lrExporting .lrHint, body.lrExporting .lrToast { display: none !important; }
            .lrExportBox { position: fixed; top: 0.8em; left: 50%; transform: translateX(-50%); z-index: 99999; display: flex; align-items: center; gap: 0.8em; padding: 0.4em 0.9em; }
            .lrExportBar { width: 14em; height: 0.7em; background: rgba(0, 0, 0, 0.35); border-radius: 0.4em; overflow: hidden; }
            .lrExportBar div { height: 100%; width: 0; background: #f2a022; }
        ` });
        document.head.appendChild(style);
    },

    open: function () {
        if (this.running || document.getElementById("lrExportBack")) return;
        if (!ReplayEditor.reel || !ReplayEditor.reel.shots.length) return ReplayViewer.toast("Make a reel first (Generate)");
        this.css();
        try { Object.assign(this.chosen, JSON.parse(localStorage.getItem("legacyreplayExport") || "{}")) } catch (e) { };

        var el = ReplayViewer.el.bind(ReplayViewer), format = this.format();
        var select = (options, value) => { var s = el("select"); options.forEach(([v, t]) => s.appendChild(el("option", { value: String(v), text: t }))); s.value = String(value); return s };
        var aspect = select(this.aspects, this.chosen.aspect), size = select(this.sizes, this.chosen.size), fps = select(this.rates.map((r) => [r, r + " fps"]), this.chosen.fps);
        var quality = select(Object.keys(this.qualities).map((k) => [k, this.qualities[k][0]]), this.chosen.quality);
        var sound = el("input", { type: "checkbox", checked: !!this.chosen.sound });
        var summary = el("div", { class: "sub" });
        var back = el("div", { id: "lrExportBack", class: "lrBack" });
        var close = () => back.remove();
        back.onclick = (e) => { if (e.target === back) close() };

        var update = () => {
            var d = this.dimensions(aspect.value, Number(size.value)), bits = this.bitrate(d, Number(fps.value), quality.value);
            summary.textContent = d.w + " x " + d.h + ", " + Math.round(bits / 1e5) / 10 + " Mbit/s, about " + Math.round(bits / 8 / 1048576 * this.estimate()) + "MB for " + Math.round(this.estimate()) + " s" + (format ? "" : ". This browser can't record video.");
        };
        [aspect, size, fps, quality].forEach((s) => s.onchange = update);
        var row = (label, node) => el("label", {}, [el("span", { text: label }), node]);

        var go = el("button", { class: "ssbutton green", text: "Start", onclick: () => {
            this.chosen = { aspect: aspect.value, size: Number(size.value), fps: Number(fps.value), quality: quality.value, sound: sound.checked };
            try { localStorage.setItem("legacyreplayExport", JSON.stringify(this.chosen)) } catch (e) { };
            close();
            this.run(this.chosen);
        } });
        if (!format) go.disabled = true;

        back.appendChild(el("div", { class: "alert roundedBorder lrDialog" }, [
            el("h1", { text: "Make a video" }),
            el("div", { class: "sub", text: "Records the reel as it plays, so keep this tab in front." + (format && format.ext !== "mp4" ? " (This browser makes WebM, not MP4.)" : "") }),
            el("div", { class: "lrGrid" }, [row("Shape", aspect), row("Size", size)]),
            el("div", { class: "lrGrid" }, [row("Frame rate", fps), row("Quality", quality)]),
            el("div", { class: "lrGrid" }, [el("label", {}, [sound, el("span", { text: "Sound" })])]),
            summary,
            el("div", { class: "lrRow" }, [el("div", { class: "info" }), go, el("button", { class: "ssbutton red", text: "Cancel", onclick: close })]),
        ]));
        document.body.appendChild(back);
        update();
    },

    //how long the reel plays for on screen, about: each shot's length divided by how fast it plays (the speed curve's average)
    estimate: function () {
        var shots = ReplayEditor.reel ? ReplayEditor.reel.shots : [];
        var total = 0;
        shots.forEach((shot) => {
            var length = Math.max(0, shot.end - shot.start), steps = 20, sum = 0;
            for (var i = 0; i < steps; i++) sum += ReplayDirector.rate(shot.speed, shot.start + length * (i + 0.5) / steps);
            total += length / Math.max(0.05, sum / steps);
        });
        return Math.max(1, total / 1000);
    },

    bitrate: function (d, fps, quality) {
        return Math.max(1e6, Math.min(80e6, d.w * d.h * fps * this.qualities[quality][1]));
    },

    run: async function (options) {
        var format = this.format();
        if (!format || this.running || !ReplayEditor.reel || !ReplayEditor.reel.shots.length) return;
        this.running = true;
        this.cancelled = false;
        var el = ReplayViewer.el.bind(ReplayViewer);
        var canvas = engine.getRenderingCanvas(), d = this.dimensions(options.aspect, options.size), interval = 1000 / options.fps;

        //the game draws at a size that covers what is kept: scaled so the kept part has about as many pixels as the video
        var scaling = engine.getHardwareScalingLevel();
        var cropHeight = canvas.clientWidth / canvas.clientHeight > d.ratio ? canvas.clientHeight : canvas.clientWidth / d.ratio;
        engine.setHardwareScalingLevel(Math.max(0.25, Math.min(4, cropHeight / d.h), canvas.clientWidth / 4096));
        engine.resize();

        var out = el("canvas", { width: d.w, height: d.h }), ctx = out.getContext("2d", { alpha: false });
        var stream = out.captureStream(0), track = stream.getVideoTracks()[0];
        var audio = options.sound ? ReplayAudio.tap() : null;
        if (audio) audio.getAudioTracks().forEach((t) => stream.addTrack(t));
        var recorder = new MediaRecorder(stream, { mimeType: format.type, videoBitsPerSecond: this.bitrate(d, options.fps, options.quality), audioBitsPerSecond: 192000 });
        var chunks = [], bytes = 0, last = 0, frames = 0, started = performance.now();
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) { chunks.push(e.data); bytes += e.data.size } };

        var box = el("div", { class: "shadedPane textShadow lrExportBox" });
        var label = el("span", { text: "Getting ready..." }), fill = el("div"), bar = el("div", { class: "lrExportBar" }, [fill]);
        box.append(label, bar, el("button", { class: "ssbutton red", text: "Cancel", onclick: () => { this.cancelled = true; ReplayReel.stop() } }));
        document.body.append(box);
        document.body.classList.add("lrExporting");

        //every frame the game draws, the part that is kept goes onto the video's canvas with the letterbox and flash over it (those are page elements, so they are drawn here)
        var observer = gameScene.onAfterRenderObservable.add(() => {
            var now = performance.now();
            if (now - last < interval - 2 || recorder.state !== "recording") return;
            last = now;
            var bw = canvas.width, bh = canvas.height, sw = bw / bh > d.ratio ? bh * d.ratio : bw, sh = bw / bh > d.ratio ? bh : bw / d.ratio;
            ctx.drawImage(canvas, (bw - sw) / 2, (bh - sh) / 2, sw, sh, 0, 0, d.w, d.h);
            var s = ReplayFx.state;
            if (s && s.bars > 0.01) {
                var bars = Math.max(0, (d.h - d.w / 2.39) / 2) * s.bars;
                ctx.fillStyle = "#000";
                ctx.fillRect(0, 0, d.w, bars);
                ctx.fillRect(0, d.h - bars, d.w, bars);
            };
            var flash = ReplayFx.flashEl ? parseFloat(getComputedStyle(ReplayFx.flashEl).opacity) : 0;
            if (flash > 0.01) { ctx.globalAlpha = flash; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, d.w, d.h); ctx.globalAlpha = 1 };
            if (track.requestFrame) track.requestFrame();
            frames++;
        });

        var timer = setInterval(() => {
            var reel = ReplayReel, shot = reel.shots[reel.i], seconds = Math.round((performance.now() - started) / 1000);
            if (shot) fill.style.width = Math.round(100 * Math.max(0, Math.min(1, (reel.i + (ReplaySession.time - shot.start) / Math.max(1, shot.end - shot.start)) / reel.shots.length))) + "%";
            label.textContent = "Recording shot " + (reel.i + 1) + "/" + reel.shots.length + ", " + seconds + " s, " + (bytes / 1048576).toFixed(1) + "MB" + (document.hidden ? " (bring this tab to the front!)" : "");
        }, 250);

        var finish = () => {
            clearInterval(timer);
            gameScene.onAfterRenderObservable.remove(observer);
            var done = () => {
                audio && ReplayAudio.untap();
                engine.setHardwareScalingLevel(scaling);
                engine.resize();
                document.body.classList.remove("lrExporting");
                box.remove();
                this.running = false;
                if (this.cancelled) return ReplayViewer.toast("Video cancelled");
                if (!chunks.length) return ReplayViewer.toast("Nothing was recorded");
                var a = document.createElement("a"), name = (ReplayEditor.reel.name || "reel").replace(/[^\w\- ]+/g, "").trim() || "reel";
                a.href = URL.createObjectURL(new Blob(chunks, { type: format.type.split(";")[0] }));
                a.download = name + "." + format.ext;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 6e4);
                ReplayViewer.toast("Saved " + a.download + " (" + d.w + " x " + d.h + ", " + (bytes / 1048576).toFixed(1) + "MB, " + frames + " frames)");
            };
            if (recorder.state !== "inactive") { recorder.onstop = done; recorder.stop() } else done();
        };

        ReplayReel.onEnd = finish; //the reel ending, or Cancel
        var ok = false;
        try {
            ok = await ReplayReel.start({ shots: ReplayEditor.copy(ReplayEditor.reel.shots), look: ReplayEditor.look.value, whole: true });
        } catch (e) { };
        if (!ok) { ReplayReel.onEnd = null; this.cancelled = true; return finish() };
        recorder.start(1000);
    },
};
