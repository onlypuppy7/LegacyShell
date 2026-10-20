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

    resetToDefaults: function () {
        extern.clearSettings();
        LegacySettings.set("fovDegrees", undefined);
        this.applyFov(); //also resets `settings` from the cleared storage
        for (const key in inputToControlMap) delete inputToControlMap[key];
        Object.assign(inputToControlMap, this.defaultControls);
        apolloSetVolume(settings.volume);
        LegacySettings.refresh();
        this.updateDetailVisibility();
    },

    checkbox: function (tab, panel, category, id, label) {
        return LegacySettings.addOption(tab, {
            type: "checkbox",
            key: id,
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
        for (const control of settingsKeyNames) {
            LegacySettings.addOption("Controls", {
                type: "bind",
                key: "bind_" + control,
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
        this.checkbox("Controls", 1, "Mouse & Aiming", "mouseInvert", () => loc("ui_settings_invertmouse", "Invert Mouse"));
        this.checkbox("Controls", 1, "Mouse & Aiming", "fastPollMouse", () => loc("ui_settings_fastPollMouse", "Fix Mouse Glitch"));
        this.checkbox("Controls", 1, "Mouse & Aiming", "holdToAim", () => loc("ui_settings_holdtoaim", "Hold To Aim"));

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
        this.checkbox("General", 0, "Chat", "enable18Chat", "Allow 18+ chat");

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
            label: "Field of View",
            min: 50, max: 110, step: 1, showNumber: true,
            getValue: () => Math.round((settings.fov || 1.25) * 180 / Math.PI),
            setValue: (val) => {
                LegacySettings.set("fovDegrees", val);
                LegacyShellCoreSettings.applyFov(val);
            },
        }, 0, "View");
        this.applyFov(LegacySettings.get("fovDegrees")); //restore the saved value

        //graphics: one detail group
        LegacySettings.addCategory("Graphics", 1, "Detail");
        this.checkbox("Graphics", 1, "Detail", "autoDetail", () => loc("ui_settings_autodetail", "Auto Detail"));
        this.shadowsOption = this.checkbox("Graphics", 1, "Detail", "shadowsEnabled", "Shadows & Weather");
        this.highResOption = this.checkbox("Graphics", 1, "Detail", "highRes", () => loc("ui_settings_highres", "High Resolution"));

        //once the menu has been built, apply the initial visibility
        plugins.on('game:waitForSetupAndAuthCompleteReady', () => this.updateDetailVisibility());
    },
};

LegacyShellCoreSettings.setup();
