//legacyshell: watching a game live (browser bundle only). moderators connect to a room by its code, without taking a player slot, and the room's recording is sent as it is made (cast.js, recorder.js).
//it is played by the same viewer as a replay, kept a little behind the live edge, with every camera and the highlight tools working on what has arrived so far
//

export const ReplayLive = {
    ws: null,

    prompt: function () {
        if (document.getElementById("lrLiveBack")) return;
        var el = ReplayViewer.el.bind(ReplayViewer);
        var input = el("input", { type: "text", placeholder: "Game code", maxLength: 8, style: "text-transform: uppercase" });
        var back = el("div", { id: "lrLiveBack", class: "lrBack" });
        var close = () => back.remove();
        back.onclick = (e) => { if (e.target === back) close() };
        var go = () => { var code = input.value.trim(); if (code) { close(); this.open(code) } };
        input.onkeydown = (e) => { if (e.key === "Enter") go() };
        back.appendChild(el("div", { class: "alert roundedBorder lrDialog" }, [
            el("h1", { text: "Watch live" }),
            el("div", { class: "lrRow" }, [input, el("button", { class: "ssbutton green", text: "Watch", onclick: go }), el("button", { class: "ssbutton red", text: "Cancel", onclick: close })]),
        ]));
        document.body.appendChild(back);
        input.focus();
    },

    fail: function (text) {
        openAlertDialog("Can't watch live", text, { label: "OK" });
    },

    //code = the game's join code, read the same way the game reads it
    open: function (code) {
        if (inGame || ReplaySession.active || this.ws) return;
        if (!LegacyReplay.signedIn()) return this.fail("Sign in with a moderator account.");

        code = code.trim().slice(-7);
        if (code.startsWith("#")) code = code.substr(1);
        var server = Number.parseInt(code.substr(0, 1), 36), id = Number.parseInt(code.substr(1, 3), 36), key = Number.parseInt(code.substr(4, 2), 36);
        if (!servers[server]) return this.fail("That isn't a game code.");

        var url = ("https:" === location.protocol ? "wss://" : "ws://") + servers[server].address;
        var ws = this.ws = new WebSocket(url);
        ws.binaryType = "arraybuffer";
        this.started = false;
        this.pending = [];
        this.header = null;
        this.closeCode = null;

        ws.onopen = () => {
            //the join message a player sends, with nothing of a player in it and a note that this is a caster
            var output = new Comm.Out();
            output.packInt8(Comm.Code.joinGame);
            output.packInt8(Comm.Code.joinPrivateGame);
            output.packInt8(0);
            output.packInt8(0);
            output.packInt16(id);
            output.packInt16(key);
            output.packInt8(0);
            output.packInt16U(0);
            output.packInt16U(0);
            output.packInt8U(0);
            output.packInt16U(0);
            output.packInt16U(0);
            output.packString("caster");
            output.packInt32U(Math.randomInt(1, 4294967295));
            output.packVeryLongString(JSON.stringify({ session: playerAccount.session, replayCast: true }));
            ws.send(output.buffer);
        };
        ws.onmessage = (e) => this.message(new Uint8Array(e.data));
        ws.onclose = (e) => {
            if (this.ws !== ws) return;
            this.ws = null;
            clearTimeout(this.starter);
            if (this.started) return ReplaySession.liveEnded();
            this.fail(e.code === Comm.Close.gameNotFound ? "That game isn't there any more." : e.code === Comm.Close.booted ? "Only moderators can watch live." : "Couldn't connect to that game.");
        };
        ws.onerror = () => { };
    },

    close: function () {
        var ws = this.ws;
        this.ws = null;
        clearTimeout(this.starter);
        this.started = false;
        try { ws && ws.close() } catch (e) { };
    },

    //u8 replayLive, then u8 0 + header json, or u8 1 + u8 type + u32 tMs + the record. a caster is sent nothing else, and the number the game gave replayLive isn't known here yet (the codes plugins add are only set up once a game starts), so the first byte is not looked at
    message: function (bytes) {
        if (bytes.length < 2) return;
        if (bytes[1] === 0) {
            try { this.header = ReplayFormat.cleanHeader(ReplayFormat.parseJson(bytes.subarray(2))) } catch (e) { return this.close() };
            this.starter = setTimeout(() => this.tryStart(0), 700);
        } else if (bytes[1] === 1 && bytes.length >= 7) {
            var type = bytes[2], tMs = new DataView(bytes.buffer, bytes.byteOffset).getUint32(3, true), data = bytes.slice(7);
            if (this.started) ReplaySession.liveRecord(type, tMs, data);
            else this.pending.push({ type, tMs, data });
        };
    },

    //enough has arrived: the first keyframe is what the world is built from
    tryStart: async function (attempt) {
        if (!this.ws || this.started) return;
        if (!this.pending.some((r) => r.type === ReplayFormat.Type.keyframe)) {
            if (attempt > 16) { this.close(); return this.fail("Nothing came through from that game.") };
            this.starter = setTimeout(() => this.tryStart(attempt + 1), 500);
            return;
        };
        var records = [], last = 0;
        this.pending.forEach((r) => {
            var data = r.data;
            if (r.type === ReplayFormat.Type.marker) { try { data = ReplayFormat.cleanMarker(data) } catch (e) { return } };
            last = Math.max(last, r.tMs);
            records.push({ type: r.type, tMs: last, data, toId: null });
        });
        this.pending = [];
        try {
            this.started = true;
            ReplaySession.startLive(this.header, records);
        } catch (e) {
            this.close();
            this.fail(e.message);
        };
    },
};
