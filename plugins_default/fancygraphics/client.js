export const FancyItemsPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (FancyItemsPlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));

        this.plugins.on('game:playerActorShadowRenderList', this.playerActorShadowRenderList.bind(this));
        this.plugins.on('game:onShadowGeneratorCreated', this.onShadowGeneratorCreated.bind(this));
        this.plugins.on('game:gunActorSetup', this.gunActorSetup.bind(this));

        this.plugins.on('game:onBalanceUpdated', this.onBalanceUpdated.bind(this));

        this.plugins.on('game:bulletActorFired', this.bulletActorFired.bind(this));
        this.plugins.on('game:explosionFx', this.explosionFx.bind(this));
        this.plugins.on('game:gunActorFired', this.gunActorFired.bind(this));

        this.createTheme();
    },

    createTheme: function () {
        LegacyThemesPlugin.stylePacks.push({
            name: "Fancy Animations",
            identifier: "fancyanimations",
            description: "Adds little animations to the UI of LegacyShell.\nAn example theme made by onlypuppy7",
            cssFile: "/themes/fancyanimations/fancyanimations.css",
            author: "onlypuppy7",
            // images: [
            //     // '/themes/whatsapptheme/img/logo.png',
            // ]
        });
    },

    permissionsAfterSetup: function (data) {
        LegacySettings.addTab("Graphics", [1,1]);
        LegacySettings.addCategory("Graphics", 1, "Modern Options", { defaultOpen: true, collapsible: false });

        this.fancyShadows = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyShadows", label: "Fancy Shadows", default: false, tooltip: "Higher resolution shadows, and guns and hands cast shadows too. Costs framerate. Applies from the next game." }, 1, "Modern Options");
        this.fancyBullets = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyBullets", label: "Fancy Bullets", default: false, tooltip: "Draws an outline around bullets. Inspiration from Burnt" }, 1, "Modern Options");
        this.fancyMuzzleFlash = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyMuzzleFlash", label: "Fancy Muzzle Flash", default: false, tooltip: "Replaces the muzzle flash with a nicer model. Model by Burnt" }, 1, "Modern Options");
        this.fancyGlow = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyGlow", label: "Fancy Glow", default: false, tooltip: "Explosions and gunfire light up their surroundings. Mostly visible at night and in storms (needs LegacyWeather)" }, 1, "Modern Options");
    },

    explosionFx: function (data) {
        if (!this.fancyGlow.get() || typeof WeatherRender === "undefined") return;

        WeatherRender.addGlow({ x: data.x, y: data.y, z: data.z, color: [1, 0.55, 0.2], radius: 4 + (data.radius || 3) * 2, intensity: 1.2, duration: 0.45 });
    },

    gunActorFired: function (data) {
        if (!this.fancyGlow.get() || typeof WeatherRender === "undefined") return;

        var mesh = data.gunActor.muzzleFlash || data.gunActor.playerActor.gunContainer;
        if (!mesh) return;
        mesh.computeWorldMatrix(true); //the flash mesh is hidden between shots, so its position is stale otherwise
        var pos = mesh.getAbsolutePosition();
        WeatherRender.addGlow({ x: pos.x, y: pos.y, z: pos.z, color: [1, 0.8, 0.45], radius: 3, intensity: 0.9, duration: 0.12, minDark: 0.4 });
    },

    playerActorShadowRenderList: function (data) {
        var playerActor = data.playerActor;
        var shadowGen = data.shadowGen;

        if (this.fancyShadows.get()) {
            shadowGen.getShadowMap().renderList.push(playerActor.hands);
        };
    },

    onShadowGeneratorCreated: function (data) {
        if (this.fancyShadows.get()) {
            shadowGen = new BABYLON.ShadowGenerator(1024 * 5, shadowLight)
        };
    },

    gunActorSetup: function (data) {
        var gunActor = data.gunActor;
        var shadowGen = data.shadowGen;

        if (this.fancyShadows.get()) {
            shadowGen.getShadowMap().renderList.push(gunActor.gunMesh);
        };

        //the base muzzleFlash clone is assigned after this event, so wrap the property: the getter hands out
        //either the base or the fancy clone depending on the live setting, no reload needed
        let baseFlash, fancyFlash;
        let setupDone = false;
        Promise.resolve().then(() => setupDone = true); //setup is synchronous, so this flips once it has finished
        Object.defineProperty(gunActor, "muzzleFlash", {
            configurable: true,
            enumerable: true,
            set: (mesh) => {
                baseFlash = mesh;
            },
            get: () => {
                //until setup has finished, hand out the base so setup's writes land on it
                if (!baseFlash || !setupDone || !this.fancyMuzzleFlash.get() || !gunActor.scene.getMeshByName("muzzleFlash_Burnt")) return baseFlash;

                if (!fancyFlash) {
                    fancyFlash = gunActor.scene.cloneMesh("muzzleFlash_Burnt", gunActor.playerActor.gunContainer);
                    fancyFlash.material = gunActor.scene.getMaterialByName("muzzleFlash");
                    fancyFlash.setEnabled(false);
                    gunActor.gun.player.id == meId && fancyFlash.setRenderingGroupId(1);
                };
                fancyFlash.parent = baseFlash.parent;
                fancyFlash.position.copyFrom(baseFlash.position);
                return fancyFlash;
            },
        });
    },

    onBalanceUpdated: function (data) {
        const el = document.getElementById("currentBalanceContainer");
        if (!el) return;

        el.classList.remove("gain");
        void el.offsetWidth;
        el.classList.add("gain");
    },

    bulletActorFired: function (data) {
        var bulletActor = data.bulletActor;

        const sourceMesh = bulletActor.mesh.sourceMesh;
        sourceMesh.renderOutline = this.fancyBullets.get();
        sourceMesh.outlineColor = new BABYLON.Color3.FromHexString("#EE8923");
        sourceMesh.outlineWidth = 0.02;
    },
};

FancyItemsPlugin.registerListeners(plugins);