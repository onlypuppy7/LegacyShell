export const FranciumBenchmark = {
    results: [],

    blocked() {
        return typeof LegacyShellCoreDebug !== 'undefined' && !LegacyShellCoreDebug.enabled() || !!this.session || typeof inGame !== 'undefined' && inGame ||
            typeof ws !== 'undefined' && ws && (ws.readyState === 0 || ws.readyState === 1);
    },

    settings() {
        if (this.option || typeof LegacySettings === 'undefined') return;
        if (typeof LegacyShellCoreDebug === 'undefined') return;
        LegacySettings.addTab('Debug', [1]);
        LegacySettings.addOption('Debug', { type: 'checkbox', key: 'franciumImprovements', label: 'Francium Improvements', default: true,
            tooltip: 'Enable Francium optimizations, including Simple Map. Reload the page after changing this. The benchmark remains available.' }, 0, 'Performance');
        LegacySettings.addOption('Debug', { type: 'checkbox', key: 'franciumUnlockFps', label: 'Unlock FPS', default: false,
            tooltip: 'Render without waiting for display refresh. Applies immediately during games and benchmarks, including with Francium Improvements off. Debug must be enabled. Uses more processing power; browser and GPU limits still apply.' }, 0, 'Performance');
        this.option = LegacySettings.addOption('Debug', { type: 'button', key: 'franciumBenchmarkStart', label: 'Local Benchmark', text: 'Open Test',
            tooltip: 'Home screen only. Load Castle and run a repeatable fly-through with six scripted players. Record it in DevTools.', onClick: () => this.prompt() }, 0, 'Performance');
        this.resultOption = LegacySettings.addOption('Debug', { type: 'button', key: 'franciumBenchmarkResults', label: 'Last Benchmark', text: 'Results',
            onClick: () => { if (!this.blocked()) this.showLast(); } }, 0, 'Performance');
        const open = LegacySettings.open, plugin = this;
        LegacySettings.open = function () { plugin.buttons(); return open.apply(this, arguments); };
    },

    buttons() {
        const disabled = !!this.blocked();
        for (const button of [this.option?.el?.querySelector('button'), this.resultOption?.el?.querySelector('button')]) {
            if (!button) continue;
            button.disabled = disabled; button.style.opacity = disabled ? '.45' : '';
            button.title = disabled ? 'Available from the home screen only.' : '';
        };
    },

    patch() {
        if (this.patched || typeof startGame !== 'function') return;
        this.patched = true;
        const plugin = this, join = joinGame, menu = showMainMenu;
        joinGame = function () {
            if (plugin.session) return;
            const result = join.apply(this, arguments);
            plugin.buttons();
            if (ws?.addEventListener) ws.addEventListener('close', () => plugin.buttons(), { once: true });
            return result;
        };
        showMainMenu = function () {
            const result = menu.apply(this, arguments); plugin.buttons(); return result;
        };
        const complete = onMapComplete;
        onMapComplete = function () {
            if (!plugin.session) return complete.apply(this, arguments);
            const savedServers = servers, savedSelection = selectedServer;
            try {
                if (!servers[selectedServer]) { servers = [{ nameDisplay: 'Local Benchmark' }]; selectedServer = 0; };
                const result = complete.apply(this, arguments);
                const session = plugin.session;
                setTimeout(() => { if (plugin.session === session) plugin.ready().catch(error => plugin.fail(error)); }, 0);
                return result;
            } finally { servers = savedServers; selectedServer = savedSelection; };
        };
    },

    attach(scene) {
        this.buttons();
        if (this.session) this.session.scene = scene;
    },

    leave() {
        const session = this.session;
        if (session && !session.exiting) this.cleanup();
        setTimeout(() => this.buttons(), 0);
    },

    dialog(title) {
        this.dialogElement?.remove();
        if (typeof LegacySettings !== 'undefined') LegacySettings.close();
        const overlay = document.createElement('div'); overlay.className = 'ssMenuOverlay'; overlay.style.display = 'block';
        overlay.id = 'franciumBenchmark'; overlay.style.zIndex = '100200';
        const root = document.createElement('div'); root.className = 'ssMenuRoot';
        root.style.cssText = 'min-width:0;width:min(32em,calc(100vw - 2em));max-height:calc(100vh - 2em);overflow-y:auto;transform:translate(-50%,-50%)';
        root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
        const heading = document.createElement('div'); heading.className = 'ssCategoryHeader'; heading.textContent = title;
        const body = document.createElement('div'); body.className = 'ssCategoryBody';
        const buttons = document.createElement('div'); buttons.className = 'ssClose';
        root.append(heading, body, buttons); overlay.appendChild(root); document.body.appendChild(overlay);
        this.dialogElement = overlay;
        return { body, buttons };
    },

    button(parent, text, click) {
        const button = document.createElement('button'); button.className = 'ssbutton orange'; button.textContent = text;
        button.style.margin = '.2em'; button.onclick = click; parent.appendChild(button);
        return button;
    },

    prompt() {
        if (this.blocked()) return;
        const ui = this.dialog('Local Benchmark');
        ui.body.textContent = 'Castle. Six scripted players. One 45-second fly-through, with fixed movement, shooting, grenades and respawns. No game server or bot plugin is used. Your current graphics options apply; Auto Detail is held off for repeatability. Load the scene first, then start your DevTools recording at the ready screen.';
        this.button(ui.buttons, 'Load Benchmark', () => this.open());
        this.button(ui.buttons, 'Cancel', () => this.dialogElement.remove());
    },

    open() {
        if (this.blocked()) return;
        const definition = typeof minMaps === 'undefined' ? null : minMaps.find(map => map.name === 'Castle');
        if (!definition || !catalog.isSetup) return this.message('Wait for the home screen to finish loading, then try again.');
        this.patch();
        const saved = { minMap, mapIdx, gameType, gameId, gameKey, myTeam, meId, playerLimit, isGameOwner, ws, playOffline,
            autoDetail: settings.autoDetail, focus: window.onfocus, blur: window.onblur, pointer: document.onpointerlockchange,
            down: document.onkeydown, up: document.onkeyup };
        const session = this.session = { saved, phase: 'loading', definition: JSON.parse(JSON.stringify(definition)), lastSecond: -1 };
        this.dialogElement?.remove(); this.buttons();
        document.getElementById('mainMenu').style.display = 'none';
        minMap = session.definition; mapIdx = definition.id; gameType = 0; gameId = gameKey = myTeam = meId = 0;
        playerLimit = 18; isGameOwner = false; playOffline = false; settings.autoDetail = false;
        ws = { readyState: 3, OPEN: 1, send() {}, close() {} };
        inGame = true;
        session.key = event => {
            if (event.key !== 'Escape') return;
            event.preventDefault(); event.stopImmediatePropagation();
            if (session.phase === 'loading') session.cancelled = true;
            else this.exit('Benchmark cancelled.');
        };
        session.visibility = () => { if (document.hidden && session.phase === 'running') this.exit('The tab was hidden. This run was cancelled.'); };
        window.addEventListener('keydown', session.key, true);
        document.addEventListener('visibilitychange', session.visibility);
        try { startGame(); } catch (error) { this.fail(error); };
    },

    async ready() {
        const session = this.session;
        if (!session) return;
        session.scene = gameScene;
        if (session.cancelled) return this.exit('Benchmark cancelled.');
        await new Promise(resolve => onMeshesIdle(gameScene, resolve));
        if (this.session !== session || gameScene.isDisposed) return;
        session.state = FranciumScenario.random(FranciumScenario.seed, () => FranciumScenario.create(session.definition));
        session.phase = 'warming';
        startRendering();
        document.onpointerlockchange = document.onkeydown = document.onkeyup = null;
        gameScene.unregisterBeforeRender(mainGameLoop);
        mapOverview = false; camera.parent = null;
        session.draw = () => this.frame(); gameScene.registerBeforeRender(session.draw);
        const style = session.style = document.createElement('style');
        style.textContent = 'body.franciumBenchmarkMode #help,body.franciumBenchmarkMode #tipContainer,body.franciumBenchmarkMode #gameMenu,body.franciumBenchmarkMode #health,body.franciumBenchmarkMode #weaponBox,body.franciumBenchmarkMode #ammo,body.franciumBenchmarkMode #grenades,body.franciumBenchmarkMode #reticleContainer,body.franciumBenchmarkMode #readouts,body.franciumBenchmarkMode #bestStreak,body.franciumBenchmarkMode #serverAndMapInfo,body.franciumBenchmarkMode #chatOut,body.franciumBenchmarkMode #chatIn,body.franciumBenchmarkMode #playerList,body.franciumBenchmarkMode #corner,body.franciumBenchmarkMode #cornerButtons,body.franciumBenchmarkMode #homeButton,body.franciumBenchmarkMode #friendsButton{display:none!important}';
        document.head.appendChild(style); document.body.classList.add('franciumBenchmarkMode');
        const hud = session.hud = document.createElement('div'); hud.id = 'franciumBenchmarkProgress';
        hud.style.cssText = 'position:fixed;top:.5em;left:50%;transform:translateX(-50%);z-index:100201;pointer-events:none;background:var(--ss-blue4);color:var(--ss-white0);padding:.35em .7em;border-radius:.2em';
        hud.textContent = 'Preparing benchmark…'; document.body.appendChild(hud);
        session.warmAt = performance.now();
        if (FranciumHud.improvements) FranciumWarmup.prepare(gameScene);
        session.timer = setInterval(() => {
            if (this.session !== session || session.phase !== 'warming') return;
            const pending = FranciumWarmup.scenes.get(gameScene)?.pending.length || 0;
            if (performance.now() - session.warmAt < 3000 || pending) return;
            clearInterval(session.timer); session.timer = null; session.phase = 'ready';
            const ui = this.dialog('Benchmark Ready');
            ui.body.textContent = 'Start recording in DevTools, then press Run Fly-through. The same 2,700 simulation ticks will run every time. Esc cancels. Keep this tab visible and do not resize the game during the run.';
            this.button(ui.buttons, 'Run Fly-through', () => this.run());
            this.button(ui.buttons, 'Return Home', () => this.exit());
            session.hud.textContent = 'Local Benchmark · Ready';
        }, 250);
    },

    run() {
        const session = this.session;
        if (!session || session.phase !== 'ready' || document.hidden) return;
        this.dialogElement?.remove();
        session.phase = 'countdown'; session.countdownAt = performance.now(); session.hud.textContent = 'Benchmark starts in 3…';
        session.width = engine.getRenderWidth(); session.height = engine.getRenderHeight();
    },

    frame() {
        const session = this.session;
        if (!session || !session.state) return;
        session.inFrame = true;
        try {
            const now = performance.now();
            if (session.phase === 'running') {
                if (session.width !== engine.getRenderWidth() || session.height !== engine.getRenderHeight()) return this.exit('The render size changed (' +
                    session.width + ' × ' + session.height + ' to ' + engine.getRenderWidth() + ' × ' + engine.getRenderHeight() + '). This run was cancelled.');
            };
            if (session.phase === 'countdown') {
                const seconds = Math.ceil((3000 - now + session.countdownAt) / 1000);
                if (seconds > 0) session.hud.textContent = 'Benchmark starts in ' + seconds + '…';
                else {
                    session.phase = 'running'; session.startAt = now; session.lastSecond = -1;
                    session.width = engine.getRenderWidth(); session.height = engine.getRenderHeight();
                    performance.mark('Francium benchmark start'); console.timeStamp('Francium benchmark start');
                };
            };
            if (session.phase === 'running') {
                const elapsed = Math.min(FranciumScenario.seconds, (now - session.startAt) / 1000);
                const target = Math.min(FranciumScenario.seconds * FranciumScenario.rate, Math.floor(elapsed * FranciumScenario.rate));
                //never skip simulation ticks on a slow device
                let steps = 0;
                while (session.state.tick < target && steps++ < 120) FranciumScenario.step(session.state);
                FranciumScenario.camera(session.state.tick / FranciumScenario.rate);
                const second = Math.floor(session.state.tick / FranciumScenario.rate);
                if (second !== session.lastSecond) {
                    session.lastSecond = second; session.hud.textContent = 'Local Benchmark · ' + second + ' / 45s · Esc cancels';
                };
                if (session.state.tick === FranciumScenario.seconds * FranciumScenario.rate) {
                    session.phase = 'finished';
                    const result = { version: FranciumScenario.version, seed: FranciumScenario.seed, map: 'Castle', actors: 6,
                        improvements: FranciumHud.improvements,
                        unlockFps: typeof LegacySettings !== 'undefined' && LegacySettings.get('enableDebug', false) && LegacySettings.get('franciumUnlockFps', false),
                        detail: FranciumMap.scenes.get(gameScene)?.detail || 'off', width: session.width, height: session.height,
                        ticks: session.state.tick, elapsed: (now - session.startAt) / 1000, counts: { ...session.state.counts } };
                    gameScene.onAfterRenderObservable.addOnce(() => {
                        if (this.session !== session) return;
                        performance.mark('Francium benchmark end'); performance.measure('Francium scripted benchmark', 'Francium benchmark start', 'Francium benchmark end');
                        console.timeStamp('Francium benchmark end');
                        setTimeout(() => {
                            if (this.session !== session) return;
                            this.results.push(result); this.exit(); this.showLast();
                        }, 0);
                    });
                };
            } else FranciumScenario.camera(0);
            if (this.session) {
                FranciumScenario.render(session.state, Math.min(4, engine.getDeltaTime() * FranciumScenario.rate / 1000));
                updateListener(camera.globalPosition, camera.getDirection(BABYLON.Vector3.Forward()), camera.upVector);
            };
        } catch (error) { this.fail(error); } finally { session.inFrame = false; };
    },

    cleanup() {
        const session = this.session;
        if (!session) return;
        clearInterval(session.timer);
        if (session.draw && session.scene && !session.scene.isDisposed) session.scene.unregisterBeforeRender(session.draw);
        session.hud?.remove(); session.style?.remove(); this.dialogElement?.remove();
        document.body.classList.remove('franciumBenchmarkMode');
        window.removeEventListener('keydown', session.key, true); document.removeEventListener('visibilitychange', session.visibility);
        const saved = session.saved;
        minMap = saved.minMap; mapIdx = saved.mapIdx; gameType = saved.gameType; gameId = saved.gameId; gameKey = saved.gameKey;
        myTeam = saved.myTeam; meId = saved.meId; playerLimit = saved.playerLimit; isGameOwner = saved.isGameOwner;
        ws = saved.ws; playOffline = saved.playOffline; settings.autoDetail = saved.autoDetail;
        window.onfocus = saved.focus; window.onblur = saved.blur; document.onpointerlockchange = saved.pointer;
        document.onkeydown = saved.down; document.onkeyup = saved.up;
        this.session = null; this.buttons();
    },

    exit(reason) {
        const session = this.session;
        if (!session || session.exiting) return;
        if (session.inFrame) {
            if (!session.exitQueued) {
                session.exitQueued = true; session.phase = 'cancelled';
                setTimeout(() => { if (this.session === session) this.exit(reason); }, 0);
            };
            return;
        };
        session.exiting = true;
        //the camera is a local dummy; benchmark events must never change account statistics
        me = viewingPlayer = null; kills = deaths = bestOverallStreak = gameStartTime = 0;
        showMainMenu(); this.cleanup();
        if (reason) this.message(reason);
    },

    fail(error) {
        console.error('[francium] benchmark:', error);
        if (this.session) this.exit('Could not run the benchmark: ' + error.message);
    },

    message(text) {
        const ui = this.dialog('Local Benchmark'); ui.body.textContent = text;
        this.button(ui.buttons, 'Close', () => this.dialogElement.remove());
    },

    showLast() {
        if (this.blocked()) return;
        const result = this.results.at(-1);
        if (!result) return this.message('No benchmark has finished yet. Open the test from the home screen.');
        const ui = this.dialog('Benchmark Complete');
        ui.body.textContent = result.map + ' · ' + result.detail + ' · ' + result.width + ' × ' + result.height + '\n' +
            'Francium improvements: ' + (result.improvements ? 'On' : 'Off') + '\n' +
            'Unlock FPS: ' + (result.unlockFps ? 'On' : 'Off') + '\n' +
            result.version + ' · seed ' + result.seed + '\n' + result.actors + ' players · ' + result.ticks + ' ticks · ' + result.elapsed.toFixed(2) + ' seconds\n' +
            Object.entries(result.counts).map(([kind, count]) => kind + ': ' + count).join(' · ') +
            '\nStop your DevTools recording. The measured section is labelled “Francium scripted benchmark” in the Timings track. This is a scripted client workload; it does not measure a game server or network latency.';
        ui.body.style.whiteSpace = 'pre-line';
        this.button(ui.buttons, 'Run Again', () => this.open());
        this.button(ui.buttons, 'Close', () => this.dialogElement.remove());
    },
};
