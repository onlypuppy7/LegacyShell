class LegacySettingsOptionClass {
    constructor(parent, opt) {
        this.parent = parent;
        this.opt = opt;
        this.el = null;
        this.key = opt.key;
        this.type = opt.type;
    }

    build() {
        if (this.opt.type === "customDiv" && this.opt.el) {
            this.el = this.opt.el;
            return this.el;
        }

        const row = document.createElement("div");
        row.id = this.opt.key ? `${this.parent.id}_option_${this.opt.key}` : "";
        row.className = "ssOption";

        if (this.opt.label) {
            const label = document.createElement("label");
            label.textContent = this.opt.label;
            row.appendChild(label);
        }

        let input;
        const key = this.opt.key;

        const setState = (val) => { if (key) this.parent.set(key, val); };
        const getState = () => key ? this.parent.get(key, this.opt.default) : undefined;

        if (this.opt.type === "checkbox") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.className = "ss_checkbox";
            input.checked = getState();
            input.onchange = () => setState(input.checked);
        }

        if (this.opt.type === "slider") {
            input = document.createElement("input");
            input.type = "range";
            input.className = "ss_slider";
            input.classList.add("ssSlider");
            input.min = this.opt.min;
            input.max = this.opt.max;
            input.step = this.opt.step;
            input.value = getState() ?? this.opt.min;

            let display;
            if (this.opt.showNumber) {
                display = document.createElement("span");
                display.className = "ss_slider_number";
                display.textContent = input.value;
                row.appendChild(display);
            }
 
            input.oninput = () => {
                const val = Number(input.value);
                setState(val);
                if (display) display.textContent = val;
                if (this.opt.onChange) this.opt.onChange(val);
            };
        }

        if (this.opt.type === "button") {
            input = document.createElement("button");
            input.className = "ssbutton orange";
            input.textContent = this.opt.text;
            input.onclick = this.opt.onClick;
        }

        if (this.opt.type === "bind") {
            input = document.createElement("div");
            input.className = "bindBox";
            input.textContent = getState() || "UNBOUND";

            input.addEventListener("mousedown", (e) => {
                if (this.parent.globalBindingActive) return;
                this.parent.globalBindingActive = true;

                input.classList.add("active");
                input.oldText = input.textContent;
                input.textContent = "PRESS KEY OR MOUSE";

                const cleanup = () => {
                    input.classList.remove("active");
                    this.parent.globalBindingActive = false;
                    window.removeEventListener("keydown", keyHandler, true);
                    window.removeEventListener("mousedown", mouseHandler, true);
                    window.removeEventListener("wheel", wheelHandler, true);
                };

                const keyHandler = (e) => {
                    if (!["Escape","Tab","Enter"].includes(e.key)) {
                        let keyName = e.key === " " ? "SPACE" : e.key.toUpperCase();
                        input.textContent = keyName;
                        setState(keyName);
                    } else { input.textContent = input.oldText; }
                    cleanup();
                    e.preventDefault(); e.stopPropagation();
                };

                const mouseHandler = (e) => {
                    input.textContent = "MOUSE " + e.button;
                    setState("MOUSE " + e.button);
                    cleanup();
                    e.preventDefault(); e.stopPropagation();
                };

                const wheelHandler = (e) => {
                    const dir = e.deltaY < 0 ? "WHEEL UP" : "WHEEL DOWN";
                    input.textContent = dir;
                    setState(dir);
                    cleanup();
                    e.preventDefault(); e.stopPropagation();
                };

                window.addEventListener("keydown", keyHandler, true);
                window.addEventListener("mousedown", mouseHandler, true);
                window.addEventListener("wheel", wheelHandler, true);
            });
        }

        if (this.opt.type === "select") {
            input = document.createElement("select");
            input.className = "ss_select";
            input.id = `${this.parent.id}_select_${key}`;
            const current = getState();

            this.opt.options.forEach(o => {
                const optionEl = document.createElement("option");
                optionEl.value = o.value;
                optionEl.textContent = o.label ?? o.value;
                optionEl.id = `${this.parent.id}_select_${key}_option_${o.value}`;
                if (o.value === current) optionEl.selected = true;
                input.appendChild(optionEl);
            });

            input.onchange = () => setState(input.value);
        }

        if (this.opt.type === "radio") {
            input = document.createElement("div");
            input.className = "ss_radio_group horizontal";

            const current = getState();
            const name = `${this.parent.id}_radio_${key}`;

            this.opt.options.forEach(o => {
                const wrap = document.createElement("label");
                wrap.className = "ss_radio_wrap";

                const radio = document.createElement("input");
                radio.type = "radio";
                radio.name = name;
                radio.value = o.value;
                radio.id = `${name}_${o.value}`;
                radio.checked = o.value === current;
                radio.onchange = () => { if (radio.checked) setState(radio.value); };

                const text = document.createElement("span");
                text.textContent = o.label ?? o.value;

                wrap.append(radio, text);
                input.appendChild(wrap);
            });
        }

        if (this.opt.type === "text") {
            input = document.createElement("input");
            input.type = "text";
            input.className = "ss_text_input";
            input.id = `${this.parent.id}_text_${key}`;
            input.value = getState() || "";

            if (this.opt.placeholder) input.placeholder = this.opt.placeholder;
            if (this.opt.maxLength) input.maxLength = this.opt.maxLength;

            input.oninput = () => setState(input.value);
        }

        if (this.opt.type === "info") {
            input = document.createElement("div");
            input.className = "ss_info_text";
            input.id = key ? `${this.parent.id}_info_${key}` : "";
            input.textContent = this.opt.text || "";
        }

        row.appendChild(input);
        this.el = row;
        return row;
    }

    get() { return this.opt.key ? this.parent.get(this.opt.key) : undefined; }
    set(val) { if (this.opt.key) this.parent.set(this.opt.key, val); }
}

class LegacySettingsClass {
    constructor(id, { absorbOldSettings = true } = {}) {
        this.id = id;
        this.state = JSON.parse(localStorage.getItem(id) || "{}");
        this.tabs = {};
        this.tabOrder = [];
        this.allOptions = [];
        this.activeTab = null;
        this.root = null;
        this.finalised = false;
        this.absorbOldSettings = absorbOldSettings;
        this.globalBindingActive = false;
    }

    registerListeners(pluginManager) {
        console.log("registering listeners... (LegacySettings)");
        this.plugins = pluginManager;
    }

    applyCSS() {
        const style = document.createElement("style");
        style.textContent = LegacySettingsCSS;
        document.head.appendChild(style);
    }

    save() { localStorage.setItem(this.id, JSON.stringify(this.state)); }
    get(key, def) { return this.state[key] ?? def; }
    set(key, value) { this.state[key] = value; this.save(); }

    addTab(name, panelWidths = [1]) {
        if (!this.tabs[name]) {
            const total = panelWidths.reduce((a,b)=>a+b,0);
            this.tabs[name] = { panels: Array.from({ length: panelWidths.length }, (_,i) => ({ width: panelWidths[i]/total, categories: [], standalone: [] })) };
            this.tabOrder.push(name);
        }
        return this.tabs[name];
    }

    addCategory(tabName, panelIndex, label, options = {}) {
        const tab = this.addTab(tabName);
        const panel = tab.panels[panelIndex];
        const cat = { label, options: [], defaultOpen: options.defaultOpen ?? true, collapsible: options.collapsible ?? false };
        panel.categories.push(cat);
        return cat;
    }

    addOption(tabName, opt, panelIndex = 0, categoryLabel = null) {
        if (!opt.key) {
            console.warn(`LegacySettings: Option added without a key in tab "${tabName}". This option will have a random key.`);
            opt.key = Math.random().toString(36).substring(2, 10) + (opt.key ? `_${opt.key}` : "");
        }
        if (this.getOption(opt.key)) console.warn(`LegacySettings: Option with key "${opt.key}" already exists! Avoid duplicate keys.`);
        
        const optionObj = new LegacySettingsOptionClass(this, opt);
        this.allOptions.push(optionObj);

        const tab = this.addTab(tabName);
        const panel = tab.panels[panelIndex];

        if (categoryLabel) {
            let cat = panel.categories.find(c => c.label === categoryLabel);
            if (!cat) cat = this.addCategory(tabName, panelIndex, categoryLabel);
            cat.options.push(optionObj);
        } else {
            panel.standalone.push(optionObj);
        }

        return optionObj;
    }

    getOption(key) {
        for (const opt of this.allOptions) {
            if (opt.opt.key === key) return opt;
        }
    }

    buildCategory(cat) {
        const wrap = document.createElement("div");
        wrap.className = "ssCategory";
        if (cat.collapsible) wrap.classList.add("collapsible");
        if (cat.defaultOpen) wrap.classList.add("open");

        const head = document.createElement("div");
        head.className = "ssCategoryHeader";
        head.textContent = cat.label;

        if(cat.collapsible) {
            const arrow = document.createElement("span");
            arrow.className = "ssArrow";
            arrow.textContent = "▶";
            head.appendChild(arrow);
            head.onclick = () => wrap.classList.toggle("open");
        }

        const body = document.createElement("div");
        body.className = "ssCategoryBody";
        cat.options.forEach(optionObj => {
            body.appendChild(optionObj.build());
        });

        wrap.append(head, body);
        return wrap;
    }

    renderTab(tabName) {
        const pane = this.root.querySelector(".ssPane");
        pane.innerHTML = "";
        const tab = this.tabs[tabName];

        tab.panels.forEach(panelData => {
            const panelEl = document.createElement("div");
            panelEl.className = "ssPanel";
            panelEl.style.flex = panelData.width;

            if (panelData.standalone.length) {
                const stand = document.createElement("div");
                stand.className = "ssStandalone";
                panelData.standalone.forEach(optionObj => {
                    stand.appendChild(optionObj.build());
                });
                panelEl.appendChild(stand);
            }

            panelData.categories.forEach(cat => panelEl.appendChild(this.buildCategory(cat)));
            pane.appendChild(panelEl);
        });
    }

    finalise(override = false) {
        if (this.finalised && !override) return;
        this.finalised = true;

        const overlay = document.createElement("div");
        overlay.className = "ssMenuOverlay";
        overlay.id = this.id;

        const menu = document.createElement("div");
        menu.className = "ssMenuRoot";
        menu.id = this.id + "Root";

        const tabsEl = document.createElement("div");
        tabsEl.className = "ssTabs";
        tabsEl.id = this.id + "Tabs";

        const settingsContainer = document.getElementById("settingsContainer");
        if (settingsContainer && this.absorbOldSettings) {
            const optionObj = this.addOption("General", { type: "customDiv", key: "settingsContainer", el: settingsContainer });
            this.tabOrder = ["General", ...this.tabOrder.filter(t => t !== "General")];
            document.getElementById("settingsMenu")?.remove();
        }

        this.tabOrder.forEach(name => {
            const t = document.createElement("div");
            t.className = "ssTab";
            t.id = this.id + "Tab_" + name;
            t.textContent = name;
            t.onclick = () => {
                this.activeTab = name;
                tabsEl.querySelectorAll(".ssTab").forEach(x => x.classList.remove("active"));
                t.classList.add("active");
                this.renderTab(name);
            };
            tabsEl.appendChild(t);
        });

        this.activeTab = this.tabOrder[0];
        tabsEl.querySelector(".ssTab").classList.add("active");

        const pane = document.createElement("div");
        pane.className = "ssPane";

        const close = document.createElement("div");
        close.className = "ssClose";
        const btn = document.createElement("button");
        btn.className = "ssbutton orange";
        btn.textContent = "Close";
        btn.onclick = () => this.close();
        close.appendChild(btn);

        menu.append(tabsEl, pane, close);
        overlay.appendChild(menu);
        document.body.appendChild(overlay);

        this.root = overlay;
        this.renderTab(this.activeTab);
    }

    open() { this.root.style.display = "block"; }
    close() { this.root.style.display = "none"; }
}


const LegacySettings = new LegacySettingsClass("settingsMenu");
LegacySettings.registerListeners(plugins);
LegacySettings.applyCSS();

/* ---------------- Example Usage ---------------- */
LegacySettings.addTab("Gameplay", [1,1]);
LegacySettings.addCategory("Gameplay", 0, "Movement", { defaultOpen: true, collapsible: true });
LegacySettings.addOption("Gameplay", { type: "slider", showNumber: true, key: "speed", label: "Move Speed", min:1,max:10,step:1,default:5 }, 0, "Movement");
LegacySettings.addOption("Gameplay", { type: "checkbox", key: "autoRun", label: "Auto Run", default: false }, 0, "Movement");
LegacySettings.addOption("Gameplay", { type: "bind", key: "forwardKey", label: "Forward Key", default: "W" }, 0, "Movement");
LegacySettings.addCategory("Gameplay", 1, "Jumping", { defaultOpen: true });
LegacySettings.addOption("Gameplay", { type: "slider", key: "jumpHeight", label: "Jump Height", min:1,max:10,step:1,default:5 }, 1, "Jumping");
LegacySettings.addOption(
    "Gameplay",
    {
        type: "select",
        key: "difficulty",
        label: "Difficulty",
        default: "normal",
        options: [
            { value: "easy", label: "Easy" },
            { value: "normal", label: "Normal" },
            { value: "hard", label: "Hard" }
        ],
        onChange: (val) => { console.log("Difficulty changed to:", val); }
    },
    0,
    "Movement"
);
LegacySettings.addOption(
    "Gameplay",
    {
        type: "radio",
        key: "cameraMode",
        label: "Camera Mode",
        default: "follow",
        options: [
            { value: "follow", label: "Follow" },
            { value: "fixed", label: "Fixed" },
            { value: "free", label: "Free" }
        ]
    },
    0,
    "Movement"
);
LegacySettings.addOption(
    "Gameplay",
    {
        type: "text",
        key: "playerName",
        label: "Player Name",
        default: "",
        placeholder: "Enter your name",
        maxLength: 20
    },
    0,
    "Movement"
);
//button
LegacySettings.addOption(
    "Gameplay",
    {
        type: "button",
        key: "testButton",
        label: "Press the button",
        text: "Random Test Button",
        onClick: (e) => {
            console.log("Button clicked!", e);
        }
    },
    0,
    "Movement"
);
LegacySettings.addOption(
    "Gameplay",
    {
        type: "info",
        key: "movementInfo",
        text: "Use the sliders above to adjust your movement settings."
    },
    0,
    "Movement"
);
