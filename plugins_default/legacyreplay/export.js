//legacyshell: replay video export (browser bundle only). plays the reel through once, as it would play on screen, and records it: the game's canvas with the letterbox and flash laid over it,
//the game's sound and the music, into an mp4 (a webm on a browser that can't make mp4). it records live, so it takes as long as the reel does and the tab has to stay in front.
//everything stays in the browser, nothing is sent anywhere
//

export const ReplayExport = {
    aspects: [["window", "Window"], ["16:9", "16:9 (widescreen)"], ["9:16", "9:16 (vertical)"], ["1:1", "1:1 (square)"], ["4:3", "4:3"], ["21:9", "21:9 (ultrawide)"]],
    sizes: [[480, "480p"], [720, "720p"], [1080, "1080p"], [1440, "1440p"]], //the short side
    rates: [24, 30, 60],
    qualities: { low: ["Low", 0.05], medium: ["Medium", 0.09], high: ["High", 0.16], max: ["Max", 0.28] }, //bits per pixel per frame
    chosen: { aspect: "window", size: 1080, fps: 30, quality: "high", sound: true, smooth: true },
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
            body.lrExporting #playerList, body.lrExporting #killTicker, body.lrExporting #chatOut { display: none !important; } /* the video is only the picture, and these are laid out again on every kill */
            .lrExportBox { position: fixed; top: 0.8em; left: 50%; transform: translateX(-50%); z-index: 99999; display: flex; align-items: center; gap: 0.8em; padding: 0.4em 0.9em; }
            .lrExportBar { width: 14em; height: 0.7em; background: rgba(0, 0, 0, 0.35); border-radius: 0.4em; overflow: hidden; }
            .lrExportBar div { height: 100%; width: 0; background: #f2a022; }
        ` });
        document.head.appendChild(style);
    },

    open: function () {
        if (this.running || ReplayViewer.host().ownerDocument.getElementById("lrExportBack")) return;
        if (!ReplayEditor.reel || !ReplayEditor.reel.shots.length) return ReplayViewer.toast("Make a reel first (Generate)");
        this.css();
        try { Object.assign(this.chosen, JSON.parse(localStorage.getItem("legacyreplayExport") || "{}")) } catch (e) { };

        var el = ReplayViewer.el.bind(ReplayViewer), format = this.format();
        var select = (options, value) => { var s = el("select"); options.forEach(([v, t]) => s.appendChild(el("option", { value: String(v), text: t }))); s.value = String(value); return s };
        var aspect = select(this.aspects, this.chosen.aspect), size = select(this.sizes, this.chosen.size), fps = select(this.rates.map((r) => [r, r + " fps"]), this.chosen.fps);
        var quality = select(Object.keys(this.qualities).map((k) => [k, this.qualities[k][0]]), this.chosen.quality);
        var sound = el("input", { type: "checkbox", checked: !!this.chosen.sound });
        var smooth = el("input", { type: "checkbox", checked: this.chosen.smooth !== false });
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
            this.chosen = { aspect: aspect.value, size: Number(size.value), fps: Number(fps.value), quality: quality.value, sound: sound.checked, smooth: smooth.checked };
            try { localStorage.setItem("legacyreplayExport", JSON.stringify(this.chosen)) } catch (e) { };
            close();
            this.run(this.chosen);
        } });
        if (!format) go.disabled = true;

        back.appendChild(el("div", { class: "alert roundedBorder lrDialog" }, [
            el("h1", { text: "Make a video" }),
            el("div", { class: "sub", text: "Smooth renders it frame by frame, so nothing that slows the game down shows up in the video (it takes a few times the length of the reel, keep this tab in front). Without it the reel is filmed live as it plays." + (format && format.ext !== "mp4" ? " (This browser makes WebM, not MP4.)" : "") }),
            el("div", { class: "lrGrid" }, [row("Shape", aspect), row("Size", size)]),
            el("div", { class: "lrGrid" }, [row("Frame rate", fps), row("Quality", quality)]),
            el("div", { class: "lrGrid" }, [el("label", {}, [sound, el("span", { text: "Sound", style: "width: auto" })]), el("label", { title: "Draws the game one frame at a time, as slowly as it needs to, so a stutter while it renders can't get into the video. Takes a few times as long as the reel." }, [smooth, el("span", { text: "Smooth (frame by frame, slower)", style: "width: auto" })])]),
            summary,
            el("div", { class: "lrRow" }, [el("div", { class: "info" }), go, el("button", { class: "ssbutton red", text: "Cancel", onclick: close })]),
        ]));
        ReplayViewer.host().appendChild(back);
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

    save: function (blob, filename) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 6e4);
    },

    //the video, played in the game to look at before anything is done with it, and where it goes next. nothing is saved until Download is pressed. Share hands it to the system's share sheet where the browser can (a phone, or Chrome / Edge on Windows), the others open the
    //site's upload or post page, where the file is dragged in. nothing is uploaded from here, and nothing is sent anywhere without a click
    finished: function (blob, filename, info) {
        var el = ReplayViewer.el.bind(ReplayViewer);
        var back = el("div", { id: "lrShareBack", class: "lrBack" });
        var url = URL.createObjectURL(blob);
        var close = () => { back.remove(); URL.revokeObjectURL(url) };
        back.onclick = (e) => { if (e.target === back) close() };

        var file = typeof File !== "undefined" ? new File([blob], filename, { type: blob.type }) : null;
        var canShare = !!(file && navigator.canShare && navigator.canShare({ files: [file] }));
        var open = (url) => window.open(url, "_blank", "noopener");

        var buttons = [
            el("button", { class: "ssbutton red", text: "YouTube", title: "Opens YouTube's upload page, drag the file in", onclick: () => open("https://www.youtube.com/upload") }),
            el("button", { class: "ssbutton blue", text: "TikTok", title: "Opens TikTok's upload page, drag the file in", onclick: () => open("https://www.tiktok.com/upload") }),
            el("button", { class: "ssbutton blue", text: "X", title: "Opens a new post on X, attach the file", onclick: () => open("https://x.com/compose/post") }),
        ];
        if (canShare) buttons.push(el("button", { class: "ssbutton green", text: "Share", title: "Send it to another app", onclick: async () => { try { await navigator.share({ files: [file], title: filename }) } catch (e) { } } }));
        buttons.unshift(el("button", { class: "ssbutton green", text: "Download", onclick: () => this.save(blob, filename) }));
        buttons.push(el("button", { class: "ssbutton red", text: "Close", onclick: close }));

        back.appendChild(el("div", { class: "alert roundedBorder lrDialog" }, [
            el("h1", { text: "Video ready" }),
            el("video", { src: url, controls: true, autoplay: true, loop: true, style: "display: block; max-width: 100%; max-height: 50vh; margin: 0.5em auto; border-radius: 0.3em; background: #000" }),
            el("div", { class: "sub", text: filename + " (" + info + ")" }),
            el("div", { class: "lrRow" }, buttons),
        ]));
        ReplayViewer.host().appendChild(back);
    },

    //the part of the game's picture that is kept, with the letterbox and flash over it (those are page elements, so they are drawn here)
    paint: function (ctx, canvas, d) {
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
    },

    //keeps the game drawing, and the export going, when the window isn't the one in use or the tab isn't showing: the engine stops drawing the moment the window loses the focus (unless told not to),
    //and a tab nobody can see gets no animation frames and its timers slowed to one a second or less. so the frames come from a worker's clock (which isn't slowed), and waits are done by it too.
    //stop() puts everything back
    pace: function () {
        var original = BABYLON.Tools.QueueNewFrame, kept = { renderEvenInBackground: engine.renderEvenInBackground, sleep: ReplaySession.sleep };
        engine.renderEvenInBackground = true;
        var worker = null, pending = null, calls = [], waits = new Map(), count = 0;
        try {
            worker = new Worker(URL.createObjectURL(new Blob(["var every = null; onmessage = function (e) { var m = e.data; if (m.every) { clearInterval(every); every = setInterval(function () { postMessage({ tick: 1 }) }, m.every) }; if (m.after !== undefined) setTimeout(function () { postMessage({ done: m.id }) }, m.after) }"], { type: "text/javascript" })));
        } catch (e) { worker = null };
        var pacer = {
            next: (func) => { if (worker) calls.push(func); else requestAnimationFrame(func) },
            after: (ms) => new Promise((resolve) => { if (!worker) return setTimeout(resolve, ms); var id = ++count; waits.set(id, resolve); worker.postMessage({ after: ms, id }) }),
            every: (ms) => { if (worker) worker.postMessage({ every: ms }) }, //how often a frame may be drawn
            stop: () => {
                pacer.gate = null;
                engine.renderEvenInBackground = kept.renderEvenInBackground;
                ReplaySession.sleep = kept.sleep;
                ReplaySession.maxStep = 0;
                if (!worker) return;
                BABYLON.Tools.QueueNewFrame = original;
                worker.terminate();
                if (pending) { var again = pending; pending = null; original(again) }; //the loop is waiting for a frame that the worker won't send now
                calls.splice(0).forEach((func) => requestAnimationFrame(func));
            },
        };
        if (worker) {
            worker.onmessage = (e) => {
                var m = e.data;
                if (m.tick) {
                    if (pending && (!pacer.gate || pacer.gate())) { var func = pending; pending = null; func() };
                    calls.splice(0).forEach((func) => func());
                } else if (m.done) { var resolve = waits.get(m.done); waits.delete(m.done); if (resolve) resolve() };
            };
            BABYLON.Tools.QueueNewFrame = (func) => { pending = func; return ++count };
            //the engine is waiting on a frame the page was asked for before this, and in a tab nobody can see it never comes, so the loop would never get to ask the worker for the next. that one is called off and the loop started by hand
            if (engine._bindedRenderFunction) { try { cancelAnimationFrame(engine._frameHandler) } catch (e) { }; pending = engine._bindedRenderFunction };
            ReplaySession.sleep = (ms) => pacer.after(ms);
            pacer.every(4);
        };
        return pacer;
    },

    //can this browser encode the video itself? then nothing needs to be played back in real time to make it. null if not (or the sound can't be, which the other way can)
    encodeSupport: async function (options) {
        if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined" || typeof VideoFrame === "undefined" || typeof AudioData === "undefined" || typeof ReplayMux === "undefined") return null;
        var d = this.dimensions(options.aspect, options.size), bitrate = this.bitrate(d, options.fps, options.quality), video = null, audio = null;
        for (const codec of ["avc1.640034", "avc1.640033", "avc1.64002a", "avc1.640028", "avc1.4d0028"]) { //High at level 5.2, 5.1, 4.2, 4, then Main
            try {
                var found = await VideoEncoder.isConfigSupported({ codec, width: d.w, height: d.h, bitrate, framerate: options.fps, avc: { format: "avc" } });
                if (found.supported) { video = found.config; break };
            } catch (e) { };
        };
        if (!video) return null;
        if (options.sound) {
            try { var heard = await AudioEncoder.isConfigSupported({ codec: "mp4a.40.2", sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 }); if (heard.supported) audio = heard.config } catch (e) { };
            if (!audio) return null;
        };
        return { video, audio, d };
    },

    runSmooth: async function (options) {
        var support = await this.encodeSupport(options);
        return support ? this.runEncoded(options, support) : this.runRecorded(options);
    },

    //the same three goes, but nothing is played back to make the video: the pictures go straight into the browser's encoder as they are drawn, each with the time it is for, and the sound, once recorded, is
    //encoded the same way and the two are put in an mp4 by mux.js. so how fast it can all go on is the only thing that matters, and nothing is lost when it is slow, or when nobody is looking
    runEncoded: async function (options, support) {
        if (this.running || !ReplayEditor.reel || !ReplayEditor.reel.shots.length) return;
        this.running = true;
        this.cancelled = false;
        this.failure = null;
        var el = ReplayViewer.el.bind(ReplayViewer);
        var canvas = engine.getRenderingCanvas(), d = support.d, interval = 1000 / options.fps;

        var scaling = engine.getHardwareScalingLevel();
        var cropHeight = canvas.clientWidth / canvas.clientHeight > d.ratio ? canvas.clientHeight : canvas.clientWidth / d.ratio;
        engine.setHardwareScalingLevel(Math.max(0.25, Math.min(4, cropHeight / d.h), canvas.clientWidth / 4096));
        engine.resize();

        var box = el("div", { class: "shadedPane textShadow lrExportBox" });
        var label = el("span", { text: "Getting ready..." }), fill = el("div"), bar = el("div", { class: "lrExportBar" }, [fill]);
        box.append(label, bar, el("button", { class: "ssbutton red", text: "Cancel", onclick: () => { this.cancelled = true; ReplayReel.stop() } }));
        ReplayViewer.host().append(box);
        document.body.classList.add("lrExporting");
        var say = (text, fraction) => { label.textContent = text; if (fraction !== undefined) fill.style.width = Math.round(100 * Math.max(0, Math.min(1, fraction))) + "%" };

        var reel = () => ({ shots: ReplayEditor.copy(ReplayEditor.reel.shots), look: ReplayEditor.look.value, whole: true });
        var expected = Math.max(1, Math.round(this.estimate() * options.fps));
        var movie = null, info = "", pace = this.pace(), problem = null;
        var bytesOf = (description) => description && (description.buffer ? new Uint8Array(description.buffer.slice(description.byteOffset, description.byteOffset + description.byteLength)) : new Uint8Array(description.slice(0)));
        try {
            //1. the pictures, straight into the encoder
            var videoSamples = [], avcC = null;
            var encoder = new VideoEncoder({
                output: (chunk, meta) => {
                    var data = new Uint8Array(chunk.byteLength);
                    chunk.copyTo(data);
                    videoSamples.push({ data, key: chunk.type === "key" });
                    if (!avcC && meta && meta.decoderConfig && meta.decoderConfig.description) avcC = bytesOf(meta.decoderConfig.description);
                },
                error: (e) => { problem = problem || e },
            });
            encoder.configure(support.video);
            var out = el("canvas", { width: d.w, height: d.h }), ctx = out.getContext("2d", { alpha: false });
            var real = performance.now.bind(performance), clock = real(), capturing = false, advanced = false, made = 0;
            var began = 0, firstAt = 0, spent = { draw: 0, hand: 0, slowest: 0 };
            var playMusic = ReplayAudio.playMusic;
            ReplayAudio.playMusic = function () { }; //nothing is heard while it is drawn at its own pace, the sound is a go of its own
            Howler.mute(true);
            performance.now = () => clock; //what the game's ticks, its animations and the replay's own time are worked from
            pace.gate = () => encoder.encodeQueueSize <= 3; //the game isn't drawn again until the encoder can take another frame: drawing it meanwhile only takes the machine's time from the encoder
            var frameStart = engine.onBeginFrameObservable || gameScene.onBeforeRenderObservable;
            var tick = frameStart.add(() => { began = real(); advanced = encoder.encodeQueueSize <= 6; if (advanced) clock += interval });
            var shutter = gameScene.onAfterRenderObservable.add(() => {
                if (!capturing || !advanced || problem) return;
                var drawn = real();
                if (!firstAt) firstAt = began;
                this.paint(ctx, canvas, d);
                var frame = new VideoFrame(out, { timestamp: Math.round(made * 1e6 / options.fps), duration: Math.round(1e6 / options.fps) });
                encoder.encode(frame, { keyFrame: made % (options.fps * 2) === 0 });
                frame.close();
                made++;
                var handed = real();
                spent.draw += drawn - began;
                spent.hand += handed - drawn;
                spent.slowest = Math.max(spent.slowest, handed - began);
                //a frame that took seconds is said where it was, which is what is needed to find out why
                if (handed - began > 1500 && spent.said !== made) { spent.said = made; console.log("[legacyreplay] frame " + made + " took " + Math.round(handed - began) + " ms (drawing " + Math.round(drawn - began) + ", handing to the encoder " + Math.round(handed - drawn) + ") at " + Math.round(ReplaySession.time) + " ms of the replay, view " + ReplayCamera.mode + ", " + gameScene.getActiveMeshes().length + " meshes drawn, " + encoder.encodeQueueSize + " frames waiting in the encoder, " + this.where()) };
                if (made % 6 === 0 || handed - began > 1500) {
                    var left = made > 5 ? Math.round((real() - firstAt) / made * (expected - made) / 1000) : null;
                    say("Drawing frame " + made + " of about " + expected + (left !== null ? ", about " + left + " s left" : ""), made / expected);
                };
            });
            try {
                var ended = new Promise((resolve) => { ReplayReel.onEnd = resolve });
                var ok = false;
                try { ok = await ReplayReel.start(reel()) } catch (e) { };
                if (ok) { capturing = true; await ended; capturing = false } else ReplayReel.onEnd = null;
            } finally {
                capturing = false;
                pace.gate = null;
                frameStart.remove(tick);
                gameScene.onAfterRenderObservable.remove(shutter);
                delete performance.now;
                ReplayAudio.playMusic = playMusic;
                Howler.mute(false);
            };
            if (made) console.log("[legacyreplay] drew " + made + " frames in " + Math.round((real() - firstAt) / 100) / 10 + " s: " + Math.round(spent.draw / made) + " ms a frame to draw, " + Math.round(spent.hand / made) + " ms a frame to hand to the encoder, the slowest " + Math.round(spent.slowest) + " ms, " + this.where());
            if (this.cancelled || !made) throw new Error(this.cancelled ? "cancelled" : "nothing was recorded");
            say("Finishing the picture...", 1);
            await encoder.flush();
            encoder.close();
            if (problem) throw problem;
            if (!avcC) throw new Error("the encoder gave no decoder settings");

            //2. the sound, recorded as it plays
            var audioSamples = [], asc = null, tap = options.sound ? ReplayAudio.tap() : null, audioBlob = null;
            pace.every(16); //at the speed it is meant to go
            ReplaySession.maxStep = 5000; //and keeping up with the clock however slowly it is being drawn, or the sound comes out as long as the slow drawing took
            if (tap && tap.getAudioTracks().length) {
                var mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
                if (mime) {
                    var parts = [], recorder = new MediaRecorder(new MediaStream(tap.getAudioTracks()), { mimeType: mime, audioBitsPerSecond: 192000 });
                    recorder.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data) };
                    var ended2 = new Promise((resolve) => { ReplayReel.onEnd = resolve });
                    var ok2 = false;
                    try { ok2 = await ReplayReel.start(reel()) } catch (e) { };
                    if (ok2) {
                        recorder.start(500);
                        var started = performance.now(), progress = setInterval(() => say("Recording the sound, " + Math.round((performance.now() - started) / 1000) + " s of about " + Math.round(expected / options.fps), (performance.now() - started) / 1000 / (expected / options.fps)), 250);
                        await ended2;
                        clearInterval(progress);
                        await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop() });
                        audioBlob = new Blob(parts, { type: mime.split(";")[0] });
                    } else ReplayReel.onEnd = null;
                };
            };
            ReplayAudio.untap();
            if (this.cancelled) throw new Error("cancelled");

            //3. the sound encoded, at 48000 and in stereo whatever it was, and then everything into the file
            if (audioBlob) {
                say("Decoding the sound...");
                var context = new (window.AudioContext || window.webkitAudioContext)();
                var heard = await context.decodeAudioData(await audioBlob.arrayBuffer());
                context.close();
                say("Mixing the sound down...");
                var offline = new OfflineAudioContext(2, Math.max(1, Math.ceil(heard.duration * 48000)), 48000), source = offline.createBufferSource();
                source.buffer = heard;
                source.connect(offline.destination);
                source.start();
                var pcm = await offline.startRendering(), left = pcm.getChannelData(0), right = pcm.getChannelData(1);
                say("Encoding the sound...");
                var audioEncoder = new AudioEncoder({
                    output: (chunk, meta) => {
                        var data = new Uint8Array(chunk.byteLength);
                        chunk.copyTo(data);
                        audioSamples.push({ data });
                        if (!asc && meta && meta.decoderConfig && meta.decoderConfig.description) asc = bytesOf(meta.decoderConfig.description);
                    },
                    error: (e) => { problem = problem || e },
                });
                audioEncoder.configure(support.audio);
                for (var at = 0; at < left.length; at += 4800) {
                    var n = Math.min(4800, left.length - at), planes = new Float32Array(n * 2);
                    planes.set(left.subarray(at, at + n), 0);
                    planes.set(right.subarray(at, at + n), n);
                    var piece = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(at / 48000 * 1e6), data: planes });
                    audioEncoder.encode(piece);
                    piece.close();
                    if (audioEncoder.encodeQueueSize > 40) await pace.after(0);
                };
                await audioEncoder.flush();
                audioEncoder.close();
                if (problem) throw problem;
            };
            say("Putting it together...");
            var timescale = 90000;
            movie = ReplayMux.mp4(
                { samples: videoSamples, width: d.w, height: d.h, timescale, delta: Math.round(timescale / options.fps), avcC },
                audioSamples.length && asc ? { samples: audioSamples, sampleRate: 48000, channels: 2, delta: 1024, asc, bitrate: 192000 } : null);
            info = d.w + " x " + d.h + ", " + (movie.size / 1048576).toFixed(1) + "MB";
        } catch (e) {
            if (e.message !== "cancelled") console.log("[legacyreplay] video failed:", e);
            this.failure = e.message;
        } finally {
            ReplayAudio.untap();
            pace.stop();
            engine.setHardwareScalingLevel(scaling);
            engine.resize();
            document.body.classList.remove("lrExporting");
            box.remove();
            this.running = false;
        };
        if (this.cancelled) return ReplayViewer.toast("Video cancelled");
        if (!movie) return ReplayViewer.toast("Couldn't make the video" + (this.failure ? ": " + this.failure : ""));
        var name = (ReplayEditor.reel.name || "reel").replace(/[^\w\- ]+/g, "").trim() || "reel";
        this.finished(movie, name + ".mp4", info);
    },

    //what the machine is drawing at, for the log: the size, the look, and which of the graphics options that cost the most are on
    where: function () {
        var on = ["fancyShadows", "fancyGlow", "fancyBullets", "fancyMuzzleFlash"].filter((key) => typeof LegacySettings !== "undefined" && LegacySettings.get(key, false));
        return engine.getRenderWidth() + "x" + engine.getRenderHeight() + " drawn, look " + (ReplayFx.name || "?") + ", " + (on.length ? on.join(" ") : "no fancy graphics");
    },

    //a video that has nothing of how the game happened to run in it. filming it live carries every hitch of the machine into the file, so instead it is made in three goes:
    //1. the game's clock is the video's: every frame it draws is exactly one frame of the video later, however long drawing it took, and each frame is kept as a picture
    //2. the sound, which can't be made that way, is recorded once the ordinary way
    //3. the pictures are laid on the sound, one every frame time by the sound's own clock, which is cheap enough to never miss, and that is what is recorded
    runRecorded: async function (options) {
        var format = this.format();
        if (!format || this.running || !ReplayEditor.reel || !ReplayEditor.reel.shots.length) return;
        this.running = true;
        this.cancelled = false;
        this.failure = null;
        var el = ReplayViewer.el.bind(ReplayViewer);
        var canvas = engine.getRenderingCanvas(), d = this.dimensions(options.aspect, options.size), interval = 1000 / options.fps;

        var scaling = engine.getHardwareScalingLevel();
        var cropHeight = canvas.clientWidth / canvas.clientHeight > d.ratio ? canvas.clientHeight : canvas.clientWidth / d.ratio;
        engine.setHardwareScalingLevel(Math.max(0.25, Math.min(4, cropHeight / d.h), canvas.clientWidth / 4096));
        engine.resize();

        var box = el("div", { class: "shadedPane textShadow lrExportBox" });
        var label = el("span", { text: "Getting ready..." }), fill = el("div"), bar = el("div", { class: "lrExportBar" }, [fill]);
        box.append(label, bar, el("button", { class: "ssbutton red", text: "Cancel", onclick: () => { this.cancelled = true; ReplayReel.stop() } }));
        ReplayViewer.host().append(box);
        document.body.classList.add("lrExporting");
        var say = (text, fraction) => { label.textContent = text; if (fraction !== undefined) fill.style.width = Math.round(100 * Math.max(0, Math.min(1, fraction))) + "%" };

        var reel = () => ({ shots: ReplayEditor.copy(ReplayEditor.reel.shots), look: ReplayEditor.look.value, whole: true });
        var expected = Math.max(1, Math.round(this.estimate() * options.fps));
        var pictures = [], audioBlob = null, movie = null, info = "";
        var pace = this.pace();
        try {
            //1. the pictures
            var out = el("canvas", { width: d.w, height: d.h }), ctx = out.getContext("2d", { alpha: false });
            var real = performance.now.bind(performance), clock = real(), capturing = false;
            var playMusic = ReplayAudio.playMusic;
            ReplayAudio.playMusic = function () { }; //nothing is heard while it is drawn at its own pace, the sound is a go of its own
            Howler.mute(true);
            performance.now = () => clock; //what the game's ticks, its animations and the replay's own time are worked from
            var frameStart = engine.onBeginFrameObservable || gameScene.onBeforeRenderObservable;
            var tick = frameStart.add(() => { clock += interval });
            var shutter = gameScene.onAfterRenderObservable.add(() => {
                if (!capturing) return;
                this.paint(ctx, canvas, d);
                pictures.push(new Promise((resolve) => out.toBlob(resolve, "image/jpeg", 0.93)));
                if (pictures.length % 6 === 0) say("Drawing frame " + pictures.length + " of about " + expected, pictures.length / expected);
            });
            try {
                var ended = new Promise((resolve) => { ReplayReel.onEnd = resolve });
                var ok = false;
                try { ok = await ReplayReel.start(reel()) } catch (e) { };
                if (ok) { capturing = true; await ended; capturing = false } else ReplayReel.onEnd = null;
            } finally {
                capturing = false;
                frameStart.remove(tick);
                gameScene.onAfterRenderObservable.remove(shutter);
                delete performance.now;
                ReplayAudio.playMusic = playMusic;
                Howler.mute(false);
            };
            if (this.cancelled || !pictures.length) throw new Error(this.cancelled ? "cancelled" : "nothing was recorded");

            //2. the sound
            pace.every(16); //at the speed it is meant to go
            ReplaySession.maxStep = 5000; //keeping up with the clock however slowly it is being drawn
            var tap = options.sound ? ReplayAudio.tap() : null;
            if (tap && tap.getAudioTracks().length) {
                var mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
                if (mime) {
                    var parts = [], recorder = new MediaRecorder(new MediaStream(tap.getAudioTracks()), { mimeType: mime, audioBitsPerSecond: 192000 });
                    recorder.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data) };
                    var ended2 = new Promise((resolve) => { ReplayReel.onEnd = resolve });
                    var ok2 = false;
                    try { ok2 = await ReplayReel.start(reel()) } catch (e) { };
                    if (ok2) {
                        recorder.start(500);
                        var started = performance.now(), progress = setInterval(() => say("Recording the sound, " + Math.round((performance.now() - started) / 1000) + " s of about " + Math.round(expected / options.fps), (performance.now() - started) / 1000 / (expected / options.fps)), 250);
                        await ended2;
                        clearInterval(progress);
                        await new Promise((resolve) => { recorder.onstop = resolve; recorder.stop() });
                        audioBlob = new Blob(parts, { type: mime.split(";")[0] });
                    } else ReplayReel.onEnd = null;
                };
            };
            ReplayAudio.untap();
            if (this.cancelled) throw new Error("cancelled");

            //3. the pictures on the sound
            say("Putting it together...", 0);
            var blobs = (await Promise.all(pictures)).filter(Boolean);
            pictures = null;
            var screen = el("canvas", { width: d.w, height: d.h }), screenCtx = screen.getContext("2d", { alpha: false });
            var stream = screen.captureStream(0), track = stream.getVideoTracks()[0], sound = null, context = null, url = null;
            if (audioBlob) {
                url = URL.createObjectURL(audioBlob);
                sound = new Audio(url);
                context = new (window.AudioContext || window.webkitAudioContext)();
                await context.resume();
                var feed = context.createMediaStreamDestination();
                context.createMediaElementSource(sound).connect(feed); //into the video, and not out of the speakers
                feed.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
                await new Promise((resolve) => { sound.onloadedmetadata = resolve; setTimeout(resolve, 3000) });
            };
            var chunks = [], bytes = 0;
            var film = new MediaRecorder(stream, { mimeType: format.type, videoBitsPerSecond: this.bitrate(d, options.fps, options.quality), audioBitsPerSecond: 192000 });
            film.ondataavailable = (e) => { if (e.data && e.data.size) { chunks.push(e.data); bytes += e.data.size } };
            var decoded = new Map(), want = (i) => { if (i < blobs.length && !decoded.has(i)) decoded.set(i, createImageBitmap(blobs[i])) };
            for (var i = 0; i < 12; i++) want(i);
            film.start(1000);
            var begun = performance.now();
            if (sound) sound.play();
            var last = -1;
            await new Promise((resolve) => {
                var step = async () => {
                    if (this.cancelled) return resolve();
                    var seconds = sound && sound.currentTime > 0 && !sound.ended ? sound.currentTime : (performance.now() - begun) / 1000;
                    var frame = Math.min(blobs.length - 1, Math.floor(seconds * options.fps));
                    for (var k = frame; k < frame + 12; k++) want(k);
                    if (frame !== last) {
                        decoded.forEach((bitmap, k) => { if (k < frame) { Promise.resolve(bitmap).then((b) => b.close && b.close()); decoded.delete(k) } });
                        var bitmap = await decoded.get(frame);
                        screenCtx.drawImage(bitmap, 0, 0);
                        if (track.requestFrame) track.requestFrame();
                        last = frame;
                        if (frame % 15 === 0) say("Putting it together...", frame / blobs.length);
                    };
                    var done = seconds * options.fps >= blobs.length && (!sound || sound.ended || seconds >= blobs.length / options.fps + 0.5);
                    if (done) resolve(); else pace.next(step);
                };
                pace.next(step);
            });
            await new Promise((resolve) => { film.onstop = resolve; film.state !== "inactive" ? film.stop() : resolve() });
            if (sound) sound.pause();
            if (context) context.close();
            if (url) URL.revokeObjectURL(url);
            if (this.cancelled) throw new Error("cancelled");
            movie = chunks.length ? new Blob(chunks, { type: format.type.split(";")[0] }) : null;
            info = d.w + " x " + d.h + ", " + (bytes / 1048576).toFixed(1) + "MB";
        } catch (e) {
            if (e.message !== "cancelled") console.log("[legacyreplay] video failed:", e);
            this.failure = e.message;
        } finally {
            ReplayAudio.untap();
            pace.stop();
            engine.setHardwareScalingLevel(scaling);
            engine.resize();
            document.body.classList.remove("lrExporting");
            box.remove();
            this.running = false;
        };
        if (this.cancelled) return ReplayViewer.toast("Video cancelled");
        if (!movie) return ReplayViewer.toast("Couldn't make the video" + (this.failure ? ": " + this.failure : ""));
        var name = (ReplayEditor.reel.name || "reel").replace(/[^\w\- ]+/g, "").trim() || "reel";
        this.finished(movie, name + "." + format.ext, info);
    },

    run: async function (options) {
        if (options.smooth) return this.runSmooth(options);
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
        ReplayViewer.host().append(box);
        document.body.classList.add("lrExporting");

        //every frame the game draws, the part that is kept goes onto the video's canvas with the letterbox and flash over it (those are page elements, so they are drawn here)
        var observer = gameScene.onAfterRenderObservable.add(() => {
            var now = performance.now();
            if (now - last < interval - 2 || recorder.state !== "recording") return;
            last = now;
            this.paint(ctx, canvas, d);
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
                var name = (ReplayEditor.reel.name || "reel").replace(/[^\w\- ]+/g, "").trim() || "reel";
                var blob = new Blob(chunks, { type: format.type.split(";")[0] });
                this.finished(blob, name + "." + format.ext, d.w + " x " + d.h + ", " + (bytes / 1048576).toFixed(1) + "MB");
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
