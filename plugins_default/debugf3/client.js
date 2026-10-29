//legacyshell: basic
import { isClient } from "#constants";
import { plugins } from "#plugins";
//

export const DebugF3 = {
    shown: false,
    lastUpdate: 0,
    maxFps: 0,

    init: function () {
        try { this.shown = localStorage.getItem("debugF3") === "1" } catch (e) {};

        if (typeof LegacySettings !== "undefined") {
            const tab = LegacySettings.addTab("General", [1, 1]);
            if (tab.panels.length < 2) { //legacyshellcore already made General as one panel, split it so this can sit on the right
                tab.panels.forEach(panel => panel.width = 0.5);
                tab.panels.push({ width: 0.5, categories: [], standalone: [] });
            };
            LegacySettings.addOption("General", {
                type: "checkbox",
                key: "debugF3HideInfo",
                label: "Hide identifying info in F3",
                default: false,
                tooltip: "Hides your GPU, CPU thread count, display size, browser and the room code from the F3 debug screen, so it's safe to stream or screenshot.",
            }, 1, "Debug");
        };

        const style = document.createElement("style");
        style.textContent = `
            .debugF3 { position: fixed; top: 0; z-index: 9999; display: none; flex-direction: column; pointer-events: none; user-select: none; padding: 2px; font: 16px/18px Consolas, "Courier New", monospace; color: #fff; text-shadow: 2px 2px 0 #3f3f3f; white-space: pre; }
            .debugF3.left { left: 0; align-items: flex-start; }
            .debugF3.right { right: 0; align-items: flex-end; }
            .debugF3 div { min-height: 18px; padding: 0 2px; background: rgba(80, 80, 80, 0.56); }
            .debugF3 div.gap { background: none; }
            .debugF3 div.underline { text-decoration: underline; }
        `;
        document.head.appendChild(style);

        this.left = document.createElement("div");
        this.left.className = "debugF3 left";
        this.right = document.createElement("div");
        this.right.className = "debugF3 right";
        document.body.appendChild(this.left);
        document.body.appendChild(this.right);

        window.addEventListener("keydown", (event) => {
            if (event.key !== "F3") return;
            event.preventDefault();
            this.shown = !this.shown;
            try { localStorage.setItem("debugF3", this.shown ? "1" : "0") } catch (e) {};
            this.update(true);
        });

        const loop = () => {
            this.update();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    },

    render: function (el, lines) {
        el.style.display = "flex";
        while (el.children.length > lines.length) el.lastChild.remove();
        lines.forEach((line, i) => {
            let row = el.children[i];
            if (!row) row = el.appendChild(document.createElement("div"));
            row.className = line === "" ? "gap" : /^Targeted /.test(line) ? "underline" : "";
            if (row.textContent !== line) row.textContent = line;
        });
    },

    facing: function (yaw) {
        const x = Math.sin(yaw), z = Math.cos(yaw); //forward is +z at yaw 0
        if (Math.abs(x) > Math.abs(z)) return x > 0 ? "east (Towards positive X)" : "west (Towards negative X)";
        return z > 0 ? "south (Towards positive Z)" : "north (Towards negative Z)";
    },

    browser: function () {
        const ua = navigator.userAgent;
        const brand = navigator.userAgentData?.brands?.filter(b => !/Not.?A.?Brand/i.test(b.brand)).pop();
        if (brand) return `${brand.brand} ${brand.version}`;
        const match = ua.match(/(Firefox|Edg|Chrome|Safari)\/([\d.]+)/);
        return match ? `${match[1]} ${match[2].split(".")[0]}` : "Unknown";
    },

    update: function (force) {
        const now = performance.now();
        if (!this.shown || typeof inGame === "undefined" || !inGame || !me || !gameScene || !engine) {
            if (force || this.left.style.display !== "none") this.left.style.display = this.right.style.display = "none";
            return;
        };
        if (!force && now - this.lastUpdate < 100) return;
        this.lastUpdate = now;

        const fps = Math.round(engine.getFps());
        this.maxFps = Math.max(this.maxFps, fps);

        const pingText = document.getElementById("ping")?.innerText || "?";
        const mapName = minMap?.name || "?";
        const modeName = GameTypes?.[gameType]?.longNameDisplay || "?";
        const serverName = (typeof servers !== "undefined" && servers[selectedServer]?.nameDisplay) || "local";

        let humans = 0, total = 0, rendered = 0;
        iteratePlayers((player) => {
            total++;
            if (player.actor && player.playing) rendered++;
            if (player.client?.isHuman !== false) humans++;
        });

        const bullets = munitionsManager?.bulletPool?.numActive ?? 0;
        const rockets = munitionsManager?.rocketPool?.numActive ?? 0;
        const grenades = munitionsManager?.grenadePool?.numActive ?? 0;

        const p = viewingPlayer || me;
        let yawDeg = -(p.yaw * 180 / Math.PI) % 360; //minecraft yaw turns the other way
        if (yawDeg > 180) yawDeg -= 360;
        if (yawDeg < -180) yawDeg += 360;
        const pitchDeg = p.pitch * 180 / Math.PI;

        let target = null, targetName = "";
        try {
            const origin = camera.globalPosition.clone();
            const dir = camera.getDirection(BABYLON.Vector3.Forward()).scale(8);
            target = Collider.rayCollidesWithMap(origin, dir, (o, d, voxel) => {
                const res = Collider.projectileCollidesWithCell(o, d, voxel);
                if (res) res.voxel = voxel;
                return res;
            });
            if (target?.cell) {
                const mesh = mapMeshes[target.cell.idx];
                targetName = mesh ? [mesh.theme, mesh.name, mesh.colliderType, mesh.softness].filter(Boolean).join(".") : `#${target.cell.idx}`;
            };
        } catch (e) {};

        const gl = engine.getGlInfo?.() || {};
        const mem = performance.memory;
        const mb = (n) => Math.floor(n / 1048576);
        const hide = typeof LegacySettings !== "undefined" && LegacySettings.get("debugF3HideInfo", false);

        const left = [
            `LegacyShell ${'LEGACYSHELLEXTVERSION'} (${modeName}/${mapName})`, //placeholder gets filled in by prepare-modified, same as the editor's version text
            `${fps} fps T: ${this.maxFps} max${engine.getHardwareScalingLevel?.() !== 1 ? ` (scale ${engine.getHardwareScalingLevel()})` : ""}`,
            `Server: ${serverName} @ ${pingText}${typeof myPingLevel !== "undefined" ? ` (level ${myPingLevel?.int ?? 0})` : ""}`,
            `C: ${gameScene.getActiveMeshes().length}/${gameScene.meshes.length} D: ${gameScene.getActiveIndices ? Math.floor(gameScene.getActiveIndices() / 3) : 0} tris`,
            `E: ${rendered}/${total}, B: ${bullets}, R: ${rockets}, G: ${grenades}`,
            `P: ${humans}. T: All: ${total}/${playerLimit}`,
            `${gameCode ? `Room: ${hide ? "hidden" : gameCode}${privateGame ? " (private)" : ""}` : "Room: local"}`,
            "",
            `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(5)} / ${p.z.toFixed(3)}`,
            `Block: ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}`,
            `Velocity: ${p.dx.toFixed(3)} / ${p.dy.toFixed(3)} / ${p.dz.toFixed(3)}`,
            `Facing: ${this.facing(p.yaw)} (${yawDeg.toFixed(1)} / ${pitchDeg.toFixed(1)})`,
            `Ground: ${p.onGround?.() ?? (p.lastTouchedGround !== 0)}${p.climbing ? " (climbing)" : ""}${p.jumping ? " (jumping)" : ""}`,
            `Map: ${mapName}`,
            `Gamemode: ${modeName} (Team ${p.team})`,
            `Health: ${Math.floor(p.hp)} Grenades: ${p.grenadeCount}`,
            target ? `Looking at block: ${target.voxel.x} ${target.voxel.y} ${target.voxel.z}` : "Looking at block: none",
            "",
            `Debug: F3: toggle`,
        ];

        const right = [
            ...(hide ? [] : [`Browser: ${this.browser()}`]),
            mem ? `Mem: ${Math.floor(mem.usedJSHeapSize / mem.jsHeapSizeLimit * 100)}% ${mb(mem.usedJSHeapSize)}/${mb(mem.jsHeapSizeLimit)}MB` : "Mem: unavailable",
            mem ? `Allocated: ${Math.floor(mem.totalJSHeapSize / mem.jsHeapSizeLimit * 100)}% ${mb(mem.totalJSHeapSize)}MB` : "",
            ...(hide ? [] : [
                "",
                `CPU: ${navigator.hardwareConcurrency || "?"}x`,
                "",
                `Display: ${window.innerWidth}x${window.innerHeight} (${gl.vendor || "?"})`,
                gl.renderer || "?",
                gl.version || "?",
            ]),
            "",
            "",
            "Targeted Block",
            target ? `${target.voxel.x}, ${target.voxel.y}, ${target.voxel.z}` : "none",
            target ? targetName : "",
        ];

        const extra = { left: [], right: [], player: p, target, hide }; //other plugins add their own lines here
        plugins.emitSync("debugF3Lines", extra);
        left.splice(-2, 0, ...extra.left);
        right.push(...extra.right);

        this.render(this.left, left);
        this.render(this.right, right);
    },
};

if (isClient) {
    if (document.body) DebugF3.init();
    else document.addEventListener("DOMContentLoaded", () => DebugF3.init());
};
