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

    resetToDefaults: function () {
        extern.clearSettings(); //also resets `settings` from the cleared storage
        for (const key in inputToControlMap) delete inputToControlMap[key];
        Object.assign(inputToControlMap, this.defaultControls);
        apolloSetVolume(settings.volume);
        LegacySettings.refresh();
        this.updateDetailVisibility();
    },

    checkbox: function (id, label, category) {
        return LegacySettings.addOption("General", {
            type: "checkbox",
            key: id,
            get label() { return typeof label === "function" ? label() : label; },
            getValue: () => id === "mouseInvert" ? settings.mouseInvert === -1 : !!settings[id],
            setValue: (val) => LegacyShellCoreSettings.checkOption(id, val),
        }, 1, category);
    },

    setup: function () {
        const loc = this.loc;
        this.defaultControls = { ...inputToControlMap }; //snapshot before the stored config is merged in

        LegacySettings.addTab("General", [1, 1]);
        LegacySettings.tabOrder = ["General", ...LegacySettings.tabOrder.filter(t => t !== "General")];
        LegacySettings.absorbOldSettings = false;

        //left panel: bindings
        LegacySettings.addCategory("General", 0, "Control Bindings");
        for (const control of settingsKeyNames) {
            LegacySettings.addOption("General", {
                type: "bind",
                key: "bind_" + control,
                get label() { return loc("ui_settings_bind_" + control, control); },
                getValue: () => LegacyShellCoreSettings.getBind(control),
                setValue: (key) => LegacyShellCoreSettings.setBind(control, key),
            }, 0, "Control Bindings");
        };

        //right panel
        LegacySettings.addCategory("General", 1, "Sound");
        LegacySettings.addOption("General", {
            type: "slider",
            key: "volume",
            get label() { return loc("ui_settings_mastervol", "Master Volume"); },
            min: 0, max: 1, step: 0.01, showNumber: true,
            getValue: () => Number(settings.volume),
            setValue: (val) => extern.setVolume({ value: val }),
        }, 1, "Sound");

        LegacySettings.addCategory("General", 1, "Mouse & Aiming");
        LegacySettings.addOption("General", {
            type: "slider",
            key: "mouseSensitivity",
            get label() { return loc("ui_settings_mousespeed", "Mouse Speed"); },
            min: 0.1, max: 11, step: 0.1, showNumber: true,
            getValue: () => Number(settings.mouseSensitivity),
            setValue: (val) => extern.setMouseSensitivity({ value: val }),
        }, 1, "Mouse & Aiming");
        this.checkbox("mouseInvert", () => loc("ui_settings_invertmouse", "Invert Mouse"), "Mouse & Aiming");
        this.checkbox("fastPollMouse", () => loc("ui_settings_fastPollMouse", "Fix Mouse Glitch"), "Mouse & Aiming");
        this.checkbox("holdToAim", () => loc("ui_settings_holdtoaim", "Hold To Aim"), "Mouse & Aiming");

        LegacySettings.addCategory("General", 1, "Chat");
        this.checkbox("enableChat", () => loc("ui_settings_chat", "Enable chat"), "Chat");
        this.checkbox("enable18Chat", "Allow 18+ chat", "Chat");

        LegacySettings.addCategory("General", 1, "Detail");
        this.checkbox("autoDetail", () => loc("ui_settings_autodetail", "Auto Detail"), "Detail");
        this.shadowsOption = this.checkbox("shadowsEnabled", "Shadows & Weather", "Detail");
        this.highResOption = this.checkbox("highRes", () => loc("ui_settings_highres", "High Resolution"), "Detail");

        LegacySettings.addCategory("General", 1, "Defaults");
        LegacySettings.addOption("General", {
            type: "button",
            key: "resetToDefaults",
            get text() { return loc("ui_settings_defaults", "Reset to Defaults"); },
            onClick: () => LegacyShellCoreSettings.resetToDefaults(),
        }, 1, "Defaults");

        //once the menu has been built, apply the initial visibility
        plugins.on('game:waitForSetupAndAuthCompleteReady', () => this.updateDetailVisibility());
    },
};

LegacyShellCoreSettings.setup();
