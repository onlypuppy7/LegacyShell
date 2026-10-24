//the original (0.17.0) settings menu, rebuilt on top of LegacySettings.
//the core still owns the actual state (`settings`, `inputToControlMap` and the original localStorage keys), these options are just a new view onto it.
//client only, inserted at the end of the bundle so all the core functions and globals exist.

const LegacyShellCoreSettings = {
    loc: function (id, fallback) {
        try {
            return getLocText(id);
        } catch (e) {
            return fallback;
        };
    },

    //options on the original menu behave like the old inputs did, so go through the very same extern handlers
    checkOption: function (id, checked) {
        extern.setCheckOption({ id, checked });
        LegacySettings.refresh(); //e.g. toggling auto detail changes what shadows/high res actually are
        this.updateDetailVisibility();
    },

    updateDetailVisibility: function () {
        const visible = !settings.autoDetail; //manual detail settings are only offered when auto detail is off
        this.shadowsOption?.setVisible(visible);
        this.highResOption?.setVisible(visible);
    },

    getBind: function (control) {
        for (const key in inputToControlMap) {
            if (inputToControlMap[key] === control) return key;
        };
    },

    setBind: function (control, key) {
        for (const other in inputToControlMap) {
            if (inputToControlMap[other] === control || other === key) delete inputToControlMap[other]; //one key per control, and the new key takes over from whatever had it
        };
        inputToControlMap[key] = control;
        localStorage.setItem("controlConfig", JSON.stringify(inputToControlMap));
        LegacySettings.refresh();
    },

    //vertical field of view, shown in degrees. the core default is 1.25 rad (~72 degrees) and stays in force until the player changes it
    applyFov: function (degrees) {
        settings.fov = degrees ? degrees * Math.PI / 180 : undefined;
        if (typeof camera !== "undefined" && camera) camera.fov = getDefaultFov(); //takes effect immediately when not scoped (scoping lerps toward the weapon's own fov)
    },

    gunOffsets: { //where the viewmodel sits relative to the default, in head space
        default: { x: 0, y: 0, z: 0, s: 1 },
        classic: { x: -0.02, y: -0.04, z: -0.02, s: 1 },
        minimal: { x: -0.06, y: -0.13, z: -0.04, s: 0.9 },
    },

    //the core eases gunContainer's own position/rotation every frame, so mirroring and lowering live on a parent node it knows nothing about
    setupViewmodel: function () {
        const self = this;
        const update = PlayerActor.prototype.update;
        PlayerActor.prototype.update = function (delta) {
            if (this.player.id == meId) {
                if (!this.gunOffsetNode || this.gunOffsetNode.isDisposed()) {
                    this.gunOffsetNode = new BABYLON.TransformNode("gunOffset");
                    this.gunOffsetNode.parent = this.head;
                    this.gunContainer.parent = this.gunOffsetNode;
                    this.hands.alwaysSelectAsActiveMesh = true; //skinned, so its bounds stay where the rest pose is and the hands get culled once the gun is moved off it
                };
                const target = (this.scope ? self.gunOffsets.default : self.gunOffsets[self.gunViewport]) || self.gunOffsets.default; //sights have to stay lined up when scoped
                const mirror = self.mirrorGun ? -1 : 1;
                const node = this.gunOffsetNode;
                node.position.x += (target.x * mirror - node.position.x) / 3;
                node.position.y += (target.y - node.position.y) / 3;
                node.position.z += (target.z - node.position.z) / 3;
                node.scaling.y += (target.s - node.scaling.y) / 3;
                node.scaling.z = node.scaling.y;
                node.scaling.x = mirror * node.scaling.y;
            };
            return update.call(this, delta);
        };
    },

    hudParts: [
        { id: "crosshair", label: "Crosshair", selector: "#reticleContainer" },
        { id: "health", label: "Health", selector: "#health" },
        { id: "weapon", label: "Weapon & Ammo", selector: "#weaponBox" },
        { id: "chat", label: "Chat", selector: "#chatOut" },
        { id: "killTicker", label: "Kill Feed", selector: "#killTicker" },
        { id: "playerList", label: "Player List", selector: "#playerList" },
        { id: "clock", label: "Game Clock", selector: "#gameClock, #bestStreak" },
    ],

    //the core flips these elements' inline display itself, so hide with a stylesheet instead of fighting it
    applyHud: function () {
        const all = LegacySettings.get("hudHideAll");
        const selectors = this.hudParts.filter(part => all || LegacySettings.get("hud_" + part.id)).map(part => part.selector);
        if (!this.hudStyle) {
            this.hudStyle = document.createElement("style");
            document.head.appendChild(this.hudStyle);
        };
        this.hudStyle.textContent = selectors.length ? `${selectors.join(", ")} { display: none !important; }` : "";
    },

    resetToDefaults: function () {
        extern.clearSettings();
        LegacySettings.set("fovDegrees", undefined);
        this.applyFov();
        LegacySettings.set("scopeSensitivity", undefined);
        settings.scopeSensitivity = undefined; //also resets `settings` from the cleared storage
        for (const key in inputToControlMap) delete inputToControlMap[key];
        Object.assign(inputToControlMap, this.defaultControls);
        apolloSetVolume(settings.volume);
        LegacySettings.refresh();
        this.updateDetailVisibility();
    },

    checkbox: function (tab, panel, category, id, label, tooltip) {
        return LegacySettings.addOption(tab, {
            type: "checkbox",
            key: id,
            tooltip,
            get label() { return typeof label === "function" ? label() : label; },
            getValue: () => id === "mouseInvert" ? settings.mouseInvert === -1 : !!settings[id],
            setValue: (val) => LegacyShellCoreSettings.checkOption(id, val),
        }, panel, category);
    },

    setup: function () {
        const loc = this.loc;
        this.defaultControls = { ...inputToControlMap }; //snapshot before the stored config is merged in

        LegacySettings.absorbOldSettings = false;
        LegacySettings.addTab("Controls", [1, 1]);
        LegacySettings.addTab("General", [1]);
        LegacySettings.addTab("Graphics", [1, 1]); //other plugins (e.g. fancygraphics) add to this tab too
        LegacySettings.tabOrder = ["Controls", "General", "Graphics", ...LegacySettings.tabOrder.filter(t => !["Controls", "General", "Graphics"].includes(t))];

        //controls: bindings on the left, mouse on the right
        LegacySettings.addCategory("Controls", 0, "Control Bindings");
        const bindTooltips = {
            unfocus: "Releases your mouse from the game so you can click outside it (chat, other windows). Press again to grab the mouse back.",
        };
        for (const control of settingsKeyNames) {
            LegacySettings.addOption("Controls", {
                type: "bind",
                key: "bind_" + control,
                tooltip: bindTooltips[control],
                get label() { return loc("ui_settings_bind_" + control, control); },
                getValue: () => LegacyShellCoreSettings.getBind(control),
                setValue: (key) => LegacyShellCoreSettings.setBind(control, key),
            }, 0, "Control Bindings");
        };

        LegacySettings.addCategory("Controls", 1, "Mouse & Aiming");
        LegacySettings.addOption("Controls", {
            type: "slider",
            key: "mouseSensitivity",
            get label() { return loc("ui_settings_mousespeed", "Mouse Speed"); },
            min: 0.1, max: 11, step: 0.1, showNumber: true,
            getValue: () => Number(settings.mouseSensitivity),
            setValue: (val) => extern.setMouseSensitivity({ value: val }),
        }, 1, "Mouse & Aiming");
        LegacySettings.addOption("Controls", {
            type: "slider",
            key: "scopeSensitivity",
            label: "Scoped Sensitivity",
            tooltip: "Multiplier on your mouse speed while aiming down sights. Lower is slower and steadier.",
            min: 0.05, max: 1.5, step: 0.05, showNumber: true, //a multiplier on mouse speed while scoped, the original is a fixed 0.3
            getValue: () => settings.scopeSensitivity ?? 0.3,
            setValue: (val) => {
                settings.scopeSensitivity = val;
                LegacySettings.set("scopeSensitivity", val);
            },
        }, 1, "Mouse & Aiming");
        settings.scopeSensitivity = LegacySettings.get("scopeSensitivity"); //restore the saved value
        this.checkbox("Controls", 1, "Mouse & Aiming", "mouseInvert", () => loc("ui_settings_invertmouse", "Invert Mouse"));
        this.checkbox("Controls", 1, "Mouse & Aiming", "fastPollMouse", () => loc("ui_settings_fastPollMouse", "Fix Mouse Glitch"), "Uses raw, unaccelerated mouse input. Try this if your mouse jumps, lags or feels inconsistent.");
        this.checkbox("Controls", 1, "Mouse & Aiming", "holdToAim", () => loc("ui_settings_holdtoaim", "Hold To Aim"), "On: you only aim while the aim key is held. Off: pressing it toggles aiming.");

        //general: sound, chat, reset
        LegacySettings.addCategory("General", 0, "Sound");
        LegacySettings.addOption("General", {
            type: "slider",
            key: "volume",
            get label() { return loc("ui_settings_mastervol", "Master Volume"); },
            min: 0, max: 1, step: 0.01, showNumber: true,
            getValue: () => Number(settings.volume),
            setValue: (val) => extern.setVolume({ value: val }),
        }, 0, "Sound");

        LegacySettings.addCategory("General", 0, "Chat");
        this.checkbox("General", 0, "Chat", "enableChat", () => loc("ui_settings_chat", "Enable chat"));
        this.checkbox("General", 0, "Chat", "enable18Chat", "Allow 18+ chat", "Turns off the profanity filter, so you will see uncensored messages from other players.");

        LegacySettings.addCategory("General", 0, "Defaults");
        LegacySettings.addOption("General", {
            type: "button",
            key: "resetToDefaults",
            get text() { return loc("ui_settings_defaults", "Reset to Defaults"); },
            onClick: () => LegacyShellCoreSettings.resetToDefaults(),
        }, 0, "Defaults");

        //graphics: view on the left, one detail group on the right
        LegacySettings.addCategory("Graphics", 0, "View");
        LegacySettings.addOption("Graphics", {
            type: "slider",
            key: "fovDegrees",
            label: "FOV",
            min: 50, max: 110, step: 1, showNumber: true,
            getValue: () => Math.round((settings.fov || 1.25) * 180 / Math.PI),
            setValue: (val) => {
                LegacySettings.set("fovDegrees", val);
                LegacyShellCoreSettings.applyFov(val);
            },
        }, 0, "View");
        this.applyFov(LegacySettings.get("fovDegrees")); //restore the saved value
        LegacySettings.addOption("Graphics", {
            type: "checkbox",
            key: "mirrorGun",
            label: "Mirror Gun",
            tooltip: "Holds the gun on the left side of the screen instead of the right.",
            default: false,
            onChange: (val) => this.mirrorGun = val,
        }, 0, "View");
        LegacySettings.addOption("Graphics", {
            type: "select",
            key: "gunViewport",
            label: "Gun Position",
            tooltip: "How low the gun sits on screen. Minimal keeps it mostly out of your view. Aiming down sights ignores this.",
            default: "default",
            options: [{ value: "default", label: "Default" }, { value: "classic", label: "Classic" }, { value: "minimal", label: "Minimal" }],
            onChange: (val) => this.gunViewport = val,
        }, 0, "View");
        this.mirrorGun = !!LegacySettings.get("mirrorGun");
        this.gunViewport = LegacySettings.get("gunViewport", "default");
        this.setupViewmodel();

        //graphics: hud parts, hidden by default
        LegacySettings.addCategory("Graphics", 0, "Hide HUD", { collapsible: true, defaultOpen: false });
        LegacySettings.addOption("Graphics", { type: "checkbox", key: "hudHideAll", label: "Hide Entire HUD", default: false, onChange: () => this.applyHud() }, 0, "Hide HUD");
        for (const part of this.hudParts) {
            LegacySettings.addOption("Graphics", { type: "checkbox", key: "hud_" + part.id, label: part.label, default: false, onChange: () => this.applyHud() }, 0, "Hide HUD");
        };
        this.applyHud();

        //graphics: one detail group
        LegacySettings.addCategory("Graphics", 1, "Detail");
        this.checkbox("Graphics", 1, "Detail", "autoDetail", () => loc("ui_settings_autodetail", "Auto Detail"), "Lowers shadows and resolution on its own when your framerate drops. Turn off to choose the settings below yourself.");
        this.shadowsOption = this.checkbox("Graphics", 1, "Detail", "shadowsEnabled", "Shadows & Weather", "Shadows, and the rain/snow effects that depend on them. Turning these off helps framerate.");
        this.highResOption = this.checkbox("Graphics", 1, "Detail", "highRes", () => loc("ui_settings_highres", "High Resolution"), "Renders at your screen's full resolution. Off renders lower and scales up, which is faster but blurrier.");

        //once the menu has been built, apply the initial visibility
        plugins.on('game:waitForSetupAndAuthCompleteReady', () => this.updateDetailVisibility());
    },
};

LegacyShellCoreSettings.setup();
