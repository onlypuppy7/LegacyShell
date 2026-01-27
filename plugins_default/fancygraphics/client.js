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

        this.fancyShadows = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyShadows", label: "Fancy Shadows", default: false }, 1, "Modern Options");
        this.fancyBullets = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyBullets", label: "Fancy Bullets", default: false }, 1, "Modern Options");
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