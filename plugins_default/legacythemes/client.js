// LegacyThemesCSS
const LegacyThemesPlugin = {
    registerListeners: function (pluginManager) {
        this.applyBaseCSS();
        this.setupSettings();

        this.plugins = pluginManager;
        
        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
        this.plugins.on('game:setupComplete', this.setupComplete.bind(this));
        this.plugins.on('game:loadSounds', this.loadSounds.bind(this));

        this.stylePacks = [];
        this.styleCache = {};

        this.soundPacks = [];
        this.defaultSounds = {};
        this.defaultCues = {};
        this.appliedSounds = {};
        this.cueGeneration = 0;

        loadCue = (name, srcs) => {
            this.defaultCues[name] = srcs.slice();
            const overrides = this.getSoundOverrides(this.soundCurrentList?.get() || []);
            const src = overrides[name] || srcs;
            this.loadSoundCue(name, Array.isArray(src) ? src : [src]);
        };

        this.initialApplied = false;
    },

    applyBaseCSS: function () {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/includes/legacythemesbase.css";
        document.head.appendChild(link);
    },

    setupSettings: function () {
        devlog("Setting up LegacyThemes settings...");
        LegacySettings.addTab("Theming", [1,1]);
        LegacySettings.addCategory("Theming", 0, "Style Packs", { defaultOpen: true, collapsible: false });
        LegacySettings.addCategory("Theming", 1, "Sound Packs", { defaultOpen: true, collapsible: false });
    },

    permissionsAfterSetup: function () {
        const styleOptions = []; //{ value: "none", label: "None" }

        //order this.stylePacks by name
        this.stylePacks.sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });

        this.stylePacks = [
            {
                name: "[Default Theme]",
                identifier: "defaulttheme",
                description: "The default colours of LegacyShell.",
                cssFile: "/includes/legacythemesbase.css",
                images: [
                    'img/logo.png'
                ]
            },
            {
                name: "Old LegacyShell Assets",
                identifier: "oldlegacyassets",
                description: "Revert to the old LegacyShell look if you aren't a fan of the new ones!",
                cssFile: "/includes/oldlegacyassets.css",
                images: [
                    'img/logo_old.png'
                ]
            },
            {
                name: "Shell Shockers Assets",
                identifier: "shellshockersassets",
                description: "Use the old Shell Shockers assets for a more familiar look.",
                cssFile: "/includes/shellshockersassets.css",
                images: [
                    'img/logo_shell.png'
                ]
            },
            ...this.stylePacks
        ]

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
            tooltip: "The style packs currently active. Reorder or remove them here.",
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

        this.soundPacks.sort((a, b) => {
            if (a.name < b.name) return -1;
            if (a.name > b.name) return 1;
            return 0;
        });

        this.soundPacks = [
            {
                name: "[Default Sounds]",
                identifier: "defaultsounds",
                description: "The default sounds of LegacyShell.",
                sounds: {},
                images: [
                    '/img/noSound.png'
                ]
            },
            ...this.soundPacks
        ]

        const soundOptions = this.soundPacks.map(pack => ({ value: pack.identifier, label: pack.name }));

        this.soundSelect = LegacySettings.addOption("Theming", {
            type: "select",
            key: "soundSelect",
            options: soundOptions,
            default: this.soundPacks[0].identifier,
            onChange: (val) => { this.updateSoundInfo(val); }
        }, 1, "Sound Packs");
        this.soundGallery = LegacySettings.addOption("Theming", {
            type: "gallery",
            key: "soundGallery",
            label: "Selected Info:",
            labelAbove: true,
            images: []
        }, 1, "Sound Packs");
        this.soundInfo = LegacySettings.addOption("Theming", {
            type: "info",
            key: "soundInfo",
            text: ""
        }, 1, "Sound Packs");
        this.soundAddButton = LegacySettings.addOption("Theming", {
            type: "button",
            key: "soundAddButton",
            label: "Add This Sound Pack",
            text: "‎ +‎ ‎ ",
            onClick: () => {
                this.addPackToCurrentList(this.soundSelect.get() ?? this.soundPacks[0].identifier, this.soundCurrentList, this.applySoundsFromList);
            }
        }, 1, "Sound Packs");
        this.soundCurrentList = LegacySettings.addOption("Theming", {
            type: "list",
            key: "soundCurrentList",
            label: "Current Applied Sound Packs:",
            tooltip: "The sound packs currently active. Reorder or remove them here.",
            labelAbove: true,
            items: [],
            reorderable: true,
            removable: true,
            onChange: (newList) => { this.applySoundsFromList(newList); }
        }, 1, "Sound Packs");

        this.updateSoundInfo(this.soundSelect.get() ?? this.soundPacks[0].identifier);

        this.applySoundsFromList(this.soundCurrentList.get());
    },

    setupComplete: function () {
        this.updateStyleInfo(this.styleSelect.get());
        this.updateSoundInfo(this.soundSelect.get() ?? this.soundPacks[0].identifier);
    },

    loadSounds: function (data) {
        for (const sound of data.soundsList) this.defaultSounds[sound[1]] = sound.slice();

        const overrides = this.getSoundOverrides(this.soundCurrentList?.get() || []);
        for (const sound of data.soundsList.slice()) {
            const src = overrides[sound[1]];
            if (Array.isArray(src)) {
                this.loadSoundCue(sound[1], src);
                data.soundsList.splice(data.soundsList.indexOf(sound), 1);
            } else if (src) sound[0] = src;
        }
        this.appliedSounds = overrides;
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

    updateSoundInfo: function (identifier) {
        const pack = this.soundPacks.find(p => p.identifier === identifier);

        if (pack) {
            this.soundInfo.set(pack.description || "No description available.");
            this.soundGallery.set(pack.images || ['/img/noSound.png']);
        } else {
            this.soundInfo.set("Selected sound pack not found.");
            this.soundGallery.set(['/img/noSound.png']);
        }
    },

    addPackToCurrentList: function (identifier, listOption, apply = this.applyStylesFromList) {
        if (!identifier || identifier === "none") return;

        let currentItems = listOption.get();
        if (currentItems.find(i => i === identifier)) return;

        currentItems = [identifier, ...currentItems];
        listOption.set(currentItems);

        apply.call(this, currentItems);
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

    getCSSVariable: function (varName, reformat = true) {
        const style = getComputedStyle(document.documentElement);
        const value = style.getPropertyValue(varName).trim();
        if (reformat) {
            if (value.startsWith('#')) {
                return this.hexToNormalizedRGB(value);
            } else if (value.startsWith('url(')) {
                const urlMatch = value.match(/url\(["']?(.*?)["']?\)/);
                if (urlMatch) {
                    return urlMatch[1];
                }
            }
        }
        return value;
    },

    getAllCSSVariables: function (cssRules = []) {
        const results = {};

        for (const rule of cssRules) {
            if (!rule.style) continue;
            for (const name of rule.style) {
                if (!name.startsWith("--")) continue;
                const value = this.getCSSVariable(name);
                results[name] = value;
            }
        }

        return results;
    },

    // searchCSSVariables: function (searchString, reformat = true) {
    //     const style = getComputedStyle(document.documentElement);
    //     const results = [];
    //     for (let i = 0; i < style.length; i++) {
    //         const varName = style[i];
    //         if (varName.includes(searchString)) {
    //             const value = this.getCSSVariable(varName, reformat);
    //             results.push({ name: varName, value: value });
    //         }
    //     }
    //     return results;
    // },

    applyStylesFromList: function (list) {
        if (!this.cacheComplete) return;
        this.initialApplied = true;

        Object.values(this.styleCache).forEach(style => {
            style?.remove();
        });

        list = (list || []).slice().reverse(); //a fresh profile has no saved list yet

        devlog("Applying styles:", list);

        const vars = {};

        for (const style of document.styleSheets) {
            try {
                if (!style.cssRules) continue;
                Object.assign(vars, this.getAllCSSVariables(style.cssRules));
            } catch (error) { };
        }

        list.forEach(id => {
            const style = this.styleCache[id];
            if (!style) return;
            document.head.appendChild(style);

            Object.assign(vars, this.getAllCSSVariables(style?.sheet?.cssRules));

            devlog("style inject", { id, style, cssRules: style?.sheet?.cssRules });
        });

        devlog("applied all themes, Final CSS Variables:", vars);

        this.updateThingsFromCSS(vars);
    },

    getSoundOverrides: function (list) {
        const overrides = {};

        for (const id of list.slice().reverse()) { //first in the list wins, like styles
            const pack = this.soundPacks.find(p => p.identifier === id);
            if (pack) Object.assign(overrides, pack.sounds);
        }

        return overrides;
    },

    loadSoundCue: function (name, srcs) {
        const cue = new Cue(name);
        const generation = ++this.cueGeneration;
        const members = srcs.map((src, i) => `CUE.${name}.legacythemes.${generation}.${i}`);
        const remove = member => {
            sounds[member]?.unload();
            delete sounds[member];
        };
        cue.unload = () => {
            cue.dead = true;
            members.forEach(remove);
        };
        setSound(name, cue);
        srcs.forEach((src, i) => {
            cue.sounds[i] = 'RESERVED';
            loadSound(src, members[i], () => {
                if (cue.dead) remove(members[i]);
                else cue.sounds[i] = members[i];
            });
        });
    },

    applySoundsFromList: function (list) {
        if (!soundsLoaded) return; //loadSounds picks the list up itself

        const overrides = this.getSoundOverrides(list);

        devlog("Applying sounds:", list, overrides);

        for (const name of new Set([...Object.keys(this.appliedSounds), ...Object.keys(overrides)])) {
            const fallback = this.defaultCues[name] || this.defaultSounds[name]?.[0];
            const src = overrides[name] || fallback;
            if (!src || src === (this.appliedSounds[name] || fallback)) continue;
            if (Array.isArray(src) || this.defaultCues[name]) {
                this.loadSoundCue(name, Array.isArray(src) ? src : [src]);
            } else loadSound(src, name, () => {}, this.defaultSounds[name]?.[2]);
        }

        this.appliedSounds = overrides;
    },

    updateThingsFromCSS: function (vars = {}) {
        Customizer.skyColor.set(...this.getCSSVariable('--customizer-skyColor'));
        Customizer.diffuseColor.set(...this.getCSSVariable('--customizer-diffuseColor'));

        for (const cssVar of Object.keys(vars)) {
            const value = vars[cssVar];

            // devlog(`CSS Variable ${cssVar}: ${value}`);

            if (cssVar.startsWith('--replaceImgSrc-')) {
                const identifier = cssVar.replace('--replaceImgSrc-', '');
                const el = document.getElementById(identifier);
                if (el) {
                    el.src = this.getCSSVariable(cssVar); //i want it cleaned
                    devlog(`Replaced image source for #${identifier} to ${el.src}`);
                }
            }
        }
    }
};

(typeof isMapEditor === 'undefined') && LegacyThemesPlugin.registerListeners(plugins);
