export const FranciumHud = {
    improvements: (() => {
        try { return JSON.parse(localStorage.getItem('settingsMenu') || '{}').franciumImprovements !== false; }
        catch (error) { return true; };
    })(),
    nodes: new WeakSet(),
    patched: false,

    patchFrames() {
        if (this.framesPatched || typeof MessageChannel === 'undefined') return;
        this.framesPatched = true;
        const plugin = this, queue = BABYLON.Tools.QueueNewFrame;
        BABYLON.Tools.QueueNewFrame = function (callback, requester) {
            if (requester || typeof engine === 'undefined' || callback !== engine._bindedRenderFunction ||
                typeof inGame === 'undefined' || !inGame || document.hidden ||
                typeof LegacySettings === 'undefined' || !LegacySettings.get('enableDebug', false) ||
                !LegacySettings.get('franciumUnlockFps', false)) return queue.apply(this, arguments);
            if (!plugin.frameChannel) {
                plugin.frameChannel = new MessageChannel();
                plugin.frameCallbacks = new Map(); plugin.frameId = 0;
                plugin.frameChannel.port1.onmessage = event => {
                    const frame = plugin.frameCallbacks.get(event.data);
                    plugin.frameCallbacks.delete(event.data);
                    if (!frame) return;
                    if (document.hidden) queue(frame);
                    else frame(performance.now());
                };
            };
            const id = --plugin.frameId;
            plugin.frameCallbacks.set(id, callback);
            plugin.frameChannel.port2.postMessage(id);
            return id;
        };
    },

    watchDebug(debug) {
        if (!this.improvements) {
            const loop = () => { debug.update(); requestAnimationFrame(loop); };
            requestAnimationFrame(loop);
            return;
        };
        if (debug._franciumLoop) return;
        debug._franciumLoop = true;
        const update = debug.update;
        let frame = null;
        const loop = () => { frame = null; debug.update(); };
        debug.update = function () {
            const result = update.apply(this, arguments);
            if (this.shown && frame === null) frame = requestAnimationFrame(loop);
            if (!this.shown && frame !== null) { cancelAnimationFrame(frame); frame = null; };
            return result;
        };
        debug.update();
    },

    text(el, interval) {
        if (!el || this.nodes.has(el)) return;
        this.nodes.add(el);
        let last = -Infinity;
        Object.defineProperty(el, 'innerText', {
            configurable: true,
            get() { return this.textContent; },
            set(value) {
                const now = performance.now();
                if (now - last < interval) return;
                last = now;
                const text = String(value);
                if (this.textContent !== text) this.textContent = text;
            }
        });
    },

    attach() {
        this.text(document.getElementById('FPS'), 250);
        this.text(document.getElementById('healthHp'), 0);
        const bar = document.getElementById('healthBar');
        if (bar && !this.nodes.has(bar)) {
            this.nodes.add(bar);
            const set = bar.setAttribute;
            bar.setAttribute = function (name, value) {
                if (name === 'stroke-dashoffset' && this.getAttribute(name) === String(value)) return;
                return set.apply(this, arguments);
            };
        };
        if (!this.style) {
            this.style = document.createElement('style');
            this.style.textContent = 'body.francium-active .upgradedPlayer { animation: none !important; } body.francium-active .healthBar { transition: none !important; }';
            document.head.appendChild(this.style);
        };
        document.body.classList.add('francium-active');
        if (this.patched || typeof Reticle === 'undefined') return;
        this.patched = true;
        const update = Reticle.prototype.update;
        Reticle.prototype.update = function () {
            if (!me.weapon || !this.crosshairs || this.crosshairs.length !== 4) return update.apply(this, arguments);
            const spread = me.shotSpread + me.weapon.subClass.accuracy;
            const size = spread * (1.25 / camera.fov);
            //ignore subpixel spread jitter, without delaying shots or readiness
            const offset = Math.round((.069 * size + .12) * 100) / 100;
            if (this._franciumOffset !== offset) {
                this._franciumOffset = offset;
                this._franciumTransforms = this.crosshairs.map((_, i) => 'rotate(' + 90 * i + 'deg) translateY(' + offset + 'em)');
            };
            for (let i = 0; i < 4; i++) {
                const style = this.crosshairs[i].style, transform = this._franciumTransforms[i];
                if (style.transform !== transform) style.transform = transform;
            };
            if (me.weapon.subClass.readySpread) {
                const ready = spread <= 5 * me.weapon.subClass.accuracy ? 'ready' : 'notReady';
                if (this.readyBrackets.className !== ready) this.readyBrackets.className = ready;
            };
        };
    },

    leave() {
        document.body.classList.remove('francium-active');
    },
};
