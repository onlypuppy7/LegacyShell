class LegacySettingsClass {
    constructor(id, { absorbOldSettings = true } = {}) {
        this.id = id;
        this.state = JSON.parse(localStorage.getItem(id) || "{}");
        this.tabs = {};
        this.tabOrder = [];
        this.activeTab = null;
        this.root = null;
        this.finalised = false;
        this.absorbOldSettings = absorbOldSettings;
    }
    
    registerListeners(pluginManager) {
        console.log("registering listeners... (LegacySettings)");

        this.plugins = pluginManager;
    }

    applyCSS () {
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
        const cat = {
            label,
            options: [],
            defaultOpen: options.defaultOpen ?? true,
            collapsible: options.collapsible ?? false
        };
        panel.categories.push(cat);
        return cat;
    }

    addOption(tabName, option, panelIndex = 0, categoryLabel = null) {
        const tab = this.addTab(tabName);
        const panel = tab.panels[panelIndex];
        if (categoryLabel) {
            let cat = panel.categories.find(c => c.label === categoryLabel);
            if (!cat) cat = this.addCategory(tabName, panelIndex, categoryLabel);
            cat.options.push(option);
        } else {
            panel.standalone.push(option);
        }
    }

    buildOption(opt) {
        if (opt.type === "customDiv" && opt.el) return opt.el;

        const row = document.createElement("div");
        row.id = opt.key ? `${this.id}_option_${opt.key}` : "";
        row.className = "ssOption";

        if (opt.label) {
            const label = document.createElement("label");
            label.textContent = opt.label;
            row.appendChild(label);
        }

        let input;
        if (opt.type === "checkbox") {
            input = document.createElement("input");
            input.type = "checkbox";
            input.className = "ss_checkbox";
            input.checked = this.get(opt.key, opt.default || false);
            input.onchange = () => this.set(opt.key, input.checked);
        }

        if (opt.type === "slider") {
            input = document.createElement("input");
            input.type = "range";
            input.className = "ss_slider";
            input.min = opt.min;
            input.max = opt.max;
            input.step = opt.step;
            input.value = this.get(opt.key, opt.default ?? opt.min);
            input.oninput = () => this.set(opt.key, Number(input.value));
        }

        if (opt.type === "button") {
            input = document.createElement("button");
            input.className = "ssbutton orange";
            input.textContent = opt.text;
            input.onclick = opt.onClick;
        }

        if (opt.type === "bind") {
            input = document.createElement("div");
            input.className = "bindBox";
            input.textContent = this.get(opt.key, opt.default || "UNBOUND");

            // Use mousedown instead of click for binding
            input.addEventListener("mousedown", (e) => {
                if (this.globalBindingActive) return;
                this.globalBindingActive = true;

                input.classList.add("active");
                input.oldText = input.textContent;
                input.textContent = "PRESS KEY OR MOUSE";

                const cleanup = () => {
                    input.classList.remove("active");
                    this.globalBindingActive = false;
                    window.removeEventListener("keydown", keyHandler, true);
                    window.removeEventListener("mousedown", mouseHandler, true);
                    window.removeEventListener("wheel", wheelHandler, true);
                };

                const keyHandler = (e) => {
                    if (!["Escape","Tab","Enter"].includes(e.key)) {
                        let keyName = e.key === " " ? "SPACE" : e.key.toUpperCase();
                        input.textContent = keyName;
                        this.set(opt.key, keyName);
                    } else { input.textContent = input.oldText; }
                    cleanup();
                    e.preventDefault(); e.stopPropagation();
                };

                const mouseHandler = (e) => {
                    input.textContent = "MOUSE " + e.button;
                    this.set(opt.key, "MOUSE " + e.button);
                    cleanup();
                    e.preventDefault(); e.stopPropagation();
                };

                const wheelHandler = (e) => {
                    const dir = e.deltaY < 0 ? "WHEEL UP" : "WHEEL DOWN";
                    input.textContent = dir;
                    this.set(opt.key, dir);
                    cleanup();
                    e.preventDefault(); e.stopPropagation();
                };

                window.addEventListener("keydown", keyHandler, true);
                window.addEventListener("mousedown", mouseHandler, true);
                window.addEventListener("wheel", wheelHandler, true);
            });
        }

        row.appendChild(input);
        return row;
    }

    buildCategory(cat) {
        const wrap = document.createElement("div");
        wrap.className = "ssCategory";
        if(cat.collapsible) wrap.classList.add("collapsible");
        if(cat.defaultOpen) wrap.classList.add("open");

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
        cat.options.forEach(opt => body.appendChild(this.buildOption(opt)));
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
                panelData.standalone.forEach(opt => stand.appendChild(this.buildOption(opt)));
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
            const generalTab = this.addTab("General");
            this.tabOrder = ["General", ...this.tabOrder.filter(t => t !== "General")];
            generalTab.panels[0].standalone.push({ type: "customDiv", el: settingsContainer });
            document.getElementById("settingsMenu").remove();
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
LegacySettings.addOption("Gameplay", { type: "slider", key: "speed", label: "Move Speed", min:1,max:10,step:1,default:5 }, 0, "Movement");
LegacySettings.addOption("Gameplay", { type: "checkbox", key: "autoRun", label: "Auto Run", default: false }, 0, "Movement");
LegacySettings.addOption("Gameplay", { type: "bind", key: "forwardKey", label: "Forward Key", default: "W" }, 0, "Movement");
LegacySettings.addCategory("Gameplay", 1, "Jumping", { defaultOpen: true });
LegacySettings.addOption("Gameplay", { type: "slider", key: "jumpHeight", label: "Jump Height", min:1,max:10,step:1,default:5 }, 1, "Jumping");