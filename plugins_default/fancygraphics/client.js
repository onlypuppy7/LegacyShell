export const FancyItemsPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (FancyItemsPlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));

        this.plugins.on('game:onMapCompleteBeforeSetup', this.onMapCompleteBeforeSetup.bind(this));

        this.plugins.on('game:playerActorShadowRenderList', this.playerActorShadowRenderList.bind(this));
        this.plugins.on('game:onShadowGeneratorCreated', this.onShadowGeneratorCreated.bind(this));
        this.plugins.on('game:gunActorSetup', this.gunActorSetup.bind(this));
        this.plugins.on('game:bulletHitEffect', this.bulletHitEffect.bind(this));
        this.plugins.on('game:bulletHitAfter', this.bulletHitAfter.bind(this));
    },

    permissionsAfterSetup: function (data) {
        LegacySettings.addTab("Graphics", [1,1]);
        LegacySettings.addCategory("Graphics", 0, "Throwback Options", { defaultOpen: true, collapsible: false });
        LegacySettings.addCategory("Graphics", 1, "Modern Options", { defaultOpen: true, collapsible: false });

        this.bulletHoles = LegacySettings.addOption("Graphics", { type: "checkbox", key: "bulletHoles", label: "Bullet Holes", default: false }, 0, "Throwback Options");
        this.bulletSmoke = LegacySettings.addOption("Graphics", { type: "checkbox", key: "bulletSmoke", label: "Bullet Smoke", default: true }, 0, "Throwback Options");

        this.fancyShadows = LegacySettings.addOption("Graphics", { type: "checkbox", key: "fancyShadows", label: "Fancy Shadows", default: false }, 1, "Modern Options");
    },

    onMapCompleteBeforeSetup: function (data) {
        //from older shell js's
        bulletHoleManager = new BABYLON.SpriteManager("bulletHoleManager", "img/bulletHoles.png?v=1", 1e3, 32, gameScene);
        bulletHoleManager.fogEnabled = true;
        bulletHoleManager.idx = 0;
        bulletHoleManager.addHole = function (f, x, y, z) {
            var s = bulletHoleManager.sprites[this.idx] || new BABYLON.Sprite("", this);
            s.position.x = x;
            s.position.y = y;
            s.position.z = z;
            s.angle = 6.282 * Math.random();
            s.cellIndex = f;
            s.width = .03;
            s.height = .03
            this.idx = (this.idx + 1) % 1e3;
        };
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

    bulletHitEffect: function (data) {
        plugins.cancel = !this.bulletSmoke.get();
    },

    bulletHitAfter: function (data) {
        var { x, y, z, dx, dy, dz } = data;

        if (this.bulletHoles.get()) {
            bulletHoleManager.addHole(0, x + (dx/4), y + (dy/4), z + (dz/4));
        };
    },
};

FancyItemsPlugin.registerListeners(plugins);

var bulletHoleManager;