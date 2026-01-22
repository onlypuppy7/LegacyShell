// LegacyThemesCSS
const LegacyThemesPlugin = {
    registerListeners: function (pluginManager) {
        this.applyBaseCSS();
        this.setupSettings();

        this.plugins = pluginManager;
        
        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
        this.plugins.on('game:setupComplete', this.setupComplete.bind(this));

        this.stylePacks = [];
        this.styleCache = {};

        this.initialApplied = false;
    },

    applyBaseCSS: function () {
        const style = document.createElement("style");
        style.textContent = LegacyThemesCSS;
        document.head.appendChild(style);
    },

    setupSettings: function () {
        devlog("Setting up LegacyThemes settings...");
        LegacySettings.addTab("Theming", [1,1]);
        LegacySettings.addCategory("Theming", 0, "Style Packs", { defaultOpen: true, collapsible: false });
        LegacySettings.addCategory("Theming", 1, "Sound Packs", { defaultOpen: true, collapsible: false });
    },

    permissionsAfterSetup: function () {
        const styleOptions = [{ value: "none", label: "None" }];
        for (const pack of this.stylePacks) {
            styleOptions.push({ value: pack.identifier, label: pack.name });
        }

        this.cacheAllStyles();

        this.styleSelect = LegacySettings.addOption("Theming", {
            type: "select",
            key: "styleSelect",
            options: styleOptions,
            onChange: (val) => { this.updateStyleInfo(val); }
        }, 0, "Style Packs");
        this.styleGallery = LegacySettings.addOption("Theming", {
            type: "gallery",
            key: "styleGallery",
            label: "Selected Info:",
            labelAbove: true,
            images: []
        }, 0, "Style Packs");
        this.styleInfo = LegacySettings.addOption("Theming", {
            type: "info",
            key: "styleInfo",
            text: ""
        }, 0, "Style Packs");
        this.styleAddButton = LegacySettings.addOption("Theming", {
            type: "button",
            key: "styleAddButton",
            label: "Add This Style Pack",
            text: "‎ +‎ ‎ ",
            onClick: () => {
                this.addPackToCurrentList(this.styleSelect.get(), this.styleCurrentList);
            }
        }, 0, "Style Packs");
        this.styleCurrentList = LegacySettings.addOption("Theming", {
            type: "list",
            key: "styleCurrentList",
            label: "Current Applied Style Packs:",
            labelAbove: true,
            items: [],
            reorderable: true,
            removable: true,
            onChange: (newList) => { this.applyStylesFromList(newList); }
        }, 0, "Style Packs");

        this.updateStyleInfo(this.styleSelect.get());

        if (this.cacheComplete) {
            this.applyStylesFromList(this.styleCurrentList.get());
        }
    },

    setupComplete: function () {
        this.updateStyleInfo(this.styleSelect.get());
    },

    updateStyleInfo: function (identifier) {
        const pack = this.stylePacks.find(p => p.identifier === identifier);

        if (pack) {
            this.styleInfo.set(pack.description || "No description available.");
            this.styleGallery.set(pack.images || ['/img/noTheme.png']);
        } else if (identifier === "none") {
            this.styleInfo.set("No style selected.");
            this.styleGallery.set(['/img/noTheme.png']);
        } else {
            this.styleInfo.set("Selected style not found.");
            this.styleGallery.set(['/img/noTheme.png']);
        }
    },

    addPackToCurrentList: function (identifier, listOption) {
        if (identifier === "none") return;

        const currentItems = listOption.get();
        if (currentItems.find(i => i === identifier)) return;

        currentItems.push(identifier);
        listOption.set(currentItems);

        this.applyStylesFromList(currentItems);
    },

    cacheAllStyles: async function () {
        for (const pack of this.stylePacks) {
            if (this.styleCache[pack.identifier]) continue;
            const response = await fetch(pack.cssFile);
            const cssText = await response.text();
            const styleElement = document.createElement("style");
            styleElement.textContent = cssText;
            this.styleCache[pack.identifier] = styleElement;
        }

        this.cacheComplete = true;

        if (this.styleCurrentList && !this.initialApplied) {
            this.applyStylesFromList(this.styleCurrentList.get());
        }
    },

    hexToNormalizedRGB: function (hex) {
        hex = hex.replace(/^#/, '');
        
        // Parse R, G, B
        const r = parseInt(hex.slice(0,2), 16) / 255;
        const g = parseInt(hex.slice(2,4), 16) / 255;
        const b = parseInt(hex.slice(4,6), 16) / 255;
        
        return [r, g, b];
    },

    getCSSVariable: function (varName) {
        const style = getComputedStyle(document.documentElement);
        const value = style.getPropertyValue(varName).trim();
        return value;
    },

    applyStylesFromList: function (list) {
        this.initialApplied = true;

        Object.values(this.styleCache).forEach(style => {
            style.disabled = true;
        });

        list.forEach(id => {
            const style = this.styleCache[id];
            if (!style) return;

            style.disabled = false;

            style?.remove();
            document.head.appendChild(style);
        });

        Customizer.skyColor.set(...this.hexToNormalizedRGB(this.getCSSVariable('--customizer-skyColor')));
        Customizer.diffuseColor.set(...this.hexToNormalizedRGB(this.getCSSVariable('--customizer-diffuseColor')));
    },
};

LegacyThemesPlugin.registerListeners(plugins);