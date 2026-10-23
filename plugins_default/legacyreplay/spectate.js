//legacyshell: spectating in a game you are in (browser bundle only). a button in the respawn menu takes you out of the menu and onto the replay cameras, in the same scene, with the game still running
//play puts you back in at once. nothing here is a replay: the cameras (cameras.js, views.js) just read the live players
//

export const ReplaySpectate = {
    active: false,
    noLock: () => { },
    bar: null,
    hiddenViews: ["killcam", "killchain", "tiltshift"], //these need a recording (the kills so far) or the look pipeline
    hudIds: ["weaponName", "ammo", "grenade1", "grenade2", "grenade3", "bestStreak", "health", "weaponBox", "grenades", "reticleContainer", "killBox", "deathBox"], //what their hud (the pov view) writes over, put back afterwards
    css: "body.lrSpectate:not(.replayPov) #weaponBox, body.lrSpectate:not(.replayPov) #ammo, body.lrSpectate:not(.replayPov) #grenades, body.lrSpectate:not(.replayPov) #reticleContainer, body.lrSpectate:not(.replayPov) #killBox, body.lrSpectate:not(.replayPov) #deathBox { display: none !important }",

    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;
        this.plugins.on('game:leaveGame', () => this.close());
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.addButton());
        else this.addButton();
    },

    //the button sits in the respawn menu where the game had it, under the team button and over play. the game sets play's height inline at every game start (6.5em, 4em with teams), for a menu without this
    //button, so it is made smaller here with a rule that beats an inline height. no teams: 4.5em like the game had it with this button, teams: 3em
    addButton: function () {
        var play = document.getElementById("goButton");
        if (!play || this.button) return;
        var style = ReplayViewer.el("style", { text: "#spectateButtonContainer ~ div > #goButton { height: 4.5em !important } #teamButtonContainer:not([style*=\"display: none\"]) ~ #spectateButtonContainer ~ div > #goButton { height: 3em !important }" });
        document.head.appendChild(style);
        document.head.appendChild(ReplayViewer.el("style", { text: this.css }));
        this.button = ReplayViewer.el("button", { id: "spectateButton", class: "ssbutton purple", text: "Spectate", style: "width: 100%; height: 2em", title: "Watch the game from any camera. play puts you back in", onclick: () => this.enter() });
        var holder = ReplayViewer.el("div", { id: "spectateButtonContainer", style: "margin-top: 0.3em" }, [this.button]);
        play.parentElement.parentElement.insertBefore(holder, play.parentElement);
    },

    //while spectating
    tick: function () {
        if (!inGame || !me || me.playing || ReplaySession.active) return this.exit(false); //spawned by the game (a new round, say), or the game is over
        var menu = document.getElementById("gameMenu");
        if (menu && menu.style.display !== "none") menu.style.display = "none"; //the game opens it again when it moves on to a new round
        var ids = [];
        iteratePlayers((player) => { if (player.id !== meId && player.playing) ids.push(player.id) });
        if (ids.join() !== this.lastIds) { this.lastIds = ids.join(); this.refresh() };
        if (ReplayCamera.mode === "focus") ReplayViewer.fillFocus(this.focusSelect, this.playerSelect);
    },

    enter: function () {
        if (this.active || ReplaySession.active || !inGame || !me || me.playing) return;
        this.active = true;
        this.lastIds = null;
        this.timer = setInterval(() => this.tick(), 250);
        var menu = document.getElementById("gameMenu");
        this.menuDisplay = menu ? menu.style.display : "";
        if (menu) menu.style.display = "none";
        document.getElementById("spectate").style.display = "none"; //the game's own spectator caption, the bar below says it

        this.saveHud();
        document.body.classList.add("lrSpectate");
        ReplaySession.wrapAmmo(); //their ammo is counted from their shots and reloads, the game only keeps it for me
        ReplayCamera.start();
        ReplayCamera.live = true;
        //the game answers the mouse being let go (Esc out of the free camera) by pausing you: it tells the server, starts the respawn countdown and takes you out of play. that is for a player who stopped playing, not one watching
        if (document.onpointerlockchange !== this.noLock) this.lockHandler = document.onpointerlockchange; //(not our own, from a leave a moment ago)
        document.onpointerlockchange = this.noLock;
        this.onKey = (e) => {
            if (e.key === "Escape" && !document.pointerLockElement) return this.exit(false); //Esc with the mouse already free leaves, like Esc does everywhere else
            if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
            var name = e.key === " " ? "SPACE" : e.key.toUpperCase(), is = (key, def) => name === ReplayViewer.bound(key, def);
            if (is("replayKeyView", "C")) ReplayCamera.cycleView();
            else if (is("replayKeyFree", "F")) ReplayCamera.free();
            else if (is("replayKeyNext", "ARROWRIGHT")) ReplayCamera.cycle(1);
            else if (is("replayKeyPrev", "ARROWLEFT")) ReplayCamera.cycle(-1);
            else return;
            e.preventDefault();
        };
        window.addEventListener("keydown", this.onKey, true);

        var el = ReplayViewer.el.bind(ReplayViewer);
        this.viewSelect = el("select", { title: "Camera view" });
        ReplayViews.groups.forEach(([group, ids]) => {
            ids = ids.filter((id) => !this.hiddenViews.includes(id));
            if (!ids.length) return;
            var box = el("optgroup", { label: group });
            ids.forEach((view) => box.appendChild(el("option", { value: view, text: ReplayViews.names[view] })));
            this.viewSelect.appendChild(box);
        });
        this.viewSelect.onchange = () => ReplayCamera.setView(this.viewSelect.value);
        this.playerSelect = el("select", { title: "Player" });
        this.playerSelect.onchange = () => ReplayCamera.watch(Number(this.playerSelect.value));
        this.focusSelect = el("select", { title: "Place", style: "display: none" });
        this.focusSelect.onchange = () => ReplayCamera.setFocus(this.focusSelect.value);
        this.bar = el("div", { class: "shadedPane textShadow lrPanel lrBar" }, [
            el("span", { text: "SPECTATING", style: "font-weight: bold" }), this.viewSelect, this.playerSelect, this.focusSelect,
            this.popBtn = el("button", { class: "ssbutton blue", text: "Pop out", title: "Move this bar to its own window, so the game is all that is in this one", onclick: () => ReplayViewer.popOut() }),
            el("button", { class: "ssbutton blue", text: "Menu", title: "Back to the menu, still out of the game", onclick: () => this.exit(false) }),
            el("button", { class: "ssbutton green", text: "PLAY", title: "Back into the game", onclick: () => this.exit(true) }),
        ]);
        ReplayViewer.host().appendChild(this.bar);

        ReplayCamera.cycle(1, "chase");
        if (ReplayCamera.mode === "overview") ReplayCamera.free();
        this.refresh();
    },

    //leaving puts the game's own camera back. play goes on to respawn at once
    exit: function (play) {
        if (!this.active) return;
        this.close();
        if (inGame && me && !me.playing) doMapOverviewCamera(); //the game's menu camera, until the spawn puts the camera on the player
        var menu = document.getElementById("gameMenu");
        if (menu && inGame && me && !me.playing) menu.style.display = this.menuDisplay || "block"; //with play too, the spawn closes it like it does for the play button
        if (play) extern.respawn();
    },

    close: function () {
        if (!this.active) return;
        this.active = false;
        ReplayViewer.popIn(); //the bar comes back from its window, which closes
        clearInterval(this.timer);
        window.removeEventListener("keydown", this.onKey, true);
        ReplayCamera.live = false;
        ReplaySession.unwrapAmmo();
        document.body.classList.remove("lrSpectate", "replayPov");
        if (ReplayCamera.povHud) { document.body.classList.remove("replayHud"); ReplayCamera.povHud = false };
        this.restoreHud();
        ReplayCamera.releaseFirstPerson();
        //the game's handler goes back now, so that play (which takes the mouse and has the game close its menu) is heard. only if the mouse is still held here, which ReplayCamera.stop lets go of and the game would hear as a pause, it goes back a moment later
        var handler = this.lockHandler, held = !!document.pointerLockElement;
        ReplayCamera.stop();
        if (held) setTimeout(() => { if (!this.active) document.onpointerlockchange = handler }, 200);
        else document.onpointerlockchange = handler;
        if (this.bar) this.bar.remove();
        this.bar = null;
        try { viewingPlayer = me; viewingPlayerId = meId; camera.fov = getDefaultFov() } catch (e) { };
    },

    //their hud is drawn over mine, so mine is kept and put back
    saveHud: function () {
        this.hud = this.hudIds.map((id) => { var el = document.getElementById(id); return el && { el, text: ["weaponName", "ammo", "bestStreak"].includes(id) ? el.textContent : null, display: el.style.display, color: el.style.color, className: el.className, src: el.tagName === "IMG" ? el.src : null } }).filter(Boolean);
    },

    restoreHud: function () {
        (this.hud || []).forEach((h) => { if (h.text !== null) h.el.textContent = h.text; h.el.style.display = h.display; h.el.style.color = h.color; h.el.className = h.className; if (h.src) h.el.src = h.src });
        this.hud = null;
    },

    refresh: function () {
        if (!this.bar) return;
        var select = this.playerSelect, el = ReplayViewer.el.bind(ReplayViewer);
        select.innerHTML = "";
        iteratePlayers((player) => { if (player.id !== meId && player.playing) select.appendChild(el("option", { value: String(player.id), text: player.name || ("Player " + player.id) })) });
        if (ReplayCamera.target) select.value = String(ReplayCamera.target.id);
        this.viewSelect.value = this.hiddenViews.includes(ReplayCamera.mode) ? "free" : ReplayCamera.mode;
        ReplayViewer.fillFocus(this.focusSelect, this.playerSelect);
    },
};
