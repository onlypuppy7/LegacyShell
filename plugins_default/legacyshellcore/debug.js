//client debug settings, kept out of the normal settings tabs until enabled
const LegacyShellCoreDebug = {
    enabled: function () {
        return !!LegacySettings.get("enableDebug", false);
    },

    sync: function () {
        const enabled = this.enabled();
        if (enabled && !LegacySettings.tabOrder.includes("Debug")) LegacySettings.tabOrder.push("Debug");
        if (!enabled) LegacySettings.tabOrder = LegacySettings.tabOrder.filter(name => name !== "Debug");
        const root = LegacySettings.root;
        if (root) {
            const tabs = root.querySelector(".ssTabs");
            let button = document.getElementById(LegacySettings.id + "Tab_Debug");
            if (enabled && !button) {
                button = document.createElement("div"); button.className = "ssTab";
                button.id = LegacySettings.id + "Tab_Debug"; button.textContent = "Debug";
                button.onclick = () => {
                    if (!this.enabled()) return;
                    LegacySettings.activeTab = "Debug";
                    tabs.querySelectorAll(".ssTab").forEach(tab => tab.classList.remove("active"));
                    button.classList.add("active"); LegacySettings.renderTab("Debug");
                    if (typeof FranciumBenchmark !== "undefined") FranciumBenchmark.buttons();
                };
                tabs.appendChild(button);
            };
            if (!enabled) {
                button?.remove();
                if (LegacySettings.tabCache.Debug) LegacySettings.tabCache.Debug.style.display = "none";
                if (LegacySettings.activeTab === "Debug") {
                    LegacySettings.activeTab = "General"; LegacySettings.renderTab("General");
                    document.getElementById(LegacySettings.id + "Tab_General")?.classList.add("active");
                };
            };
        };
        if (typeof DebugF3 !== "undefined") {
            if (!enabled) DebugF3.setShown(false);
            else DebugF3.update(true);
        };
        if (typeof FranciumBenchmark !== "undefined") FranciumBenchmark.buttons();
    },

    setup: function () {
        LegacySettings.addOption("General", { type: "checkbox", key: "enableDebug", label: "Enable Debug", default: false,
            tooltip: "Show the Debug settings tab and enable debug tools.", onChange: () => this.sync() }, 0, "Debug");
        LegacySettings.addTab("Debug", [1]);
        LegacySettings.addOption("Debug", { type: "bind", key: "debugF3Key", label: "F3 Debug Overlay", default: "F3",
            tooltip: "Toggle the debug overlay while in a game. Debug must be enabled.",
            getValue: () => LegacySettings.get("debugF3Key", "F3"), setValue: key => {
                LegacySettings.set("debugF3Key", key);
                if (typeof DebugF3 !== "undefined") DebugF3.update(true);
            } }, 0, "Overlay");
        LegacySettings.addOption("Debug", { type: "checkbox", key: "debugF3HideInfo", label: "Hide identifying info in F3", default: false,
            tooltip: "Hide browser, CPU, display, GPU and room code in the F3 overlay.", onChange: () => {
                if (typeof DebugF3 !== "undefined") DebugF3.update(true);
            } }, 0, "Overlay");
        LegacySettings.addOption("Debug", { type: "checkbox", key: "debugMaps", label: "Debug Maps", default: false,
            tooltip: "Placeholder. This option has no effect yet." }, 0, "Experimental");
        LegacySettings.addOption("Debug", { type: "checkbox", key: "removedGamemodes", label: "Removed Gamemodes", default: false,
            tooltip: "Placeholder. This option has no effect yet." }, 0, "Experimental");
        if (typeof FranciumBenchmark !== "undefined") FranciumBenchmark.settings();
        if (typeof DebugF3 !== "undefined") DebugF3.managed = true;
        this.sync();
        plugins.on('game:waitForSetupAndAuthCompleteReady', () => this.sync());
    },
};

LegacyShellCoreDebug.setup();
