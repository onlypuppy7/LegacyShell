export const TimeMachinePlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (TimeMachinePlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));

        this.plugins.on('game:onMapCompleteBeforeSetup', this.onMapCompleteBeforeSetup.bind(this));

        this.plugins.on('game:bulletHitEffect', this.bulletHitEffect.bind(this));
        this.plugins.on('game:bulletHitAfter', this.bulletHitAfter.bind(this));

        this.plugins.on('game:afterBullshit', this.afterBullshit.bind(this));
        this.plugins.on('game:playerActorBodyMeshCreated', this.playerActorBodyMeshCreated.bind(this));
        this.plugins.on('game:playerDeathAnimation', this.playerDeathAnimation.bind(this));
        this.plugins.on('game:playerActorRestoreToPlay', this.playerActorRestoreToPlay.bind(this));
        this.plugins.on('game:playerActorRemoveFromPlay', this.playerActorRemoveFromPlay.bind(this));
        this.plugins.on('game:shellFragBurstBefore', this.shellFragBurstBefore.bind(this));

        this.createThemes();
    },

    createThemes: function () {
        LegacyThemesPlugin.stylePacks.push({
            name: "Classic Shell Background",
            identifier: "classicshellbackground",
            description: "Use the lighter background gradient found in versions pre 0.15.7.",
            cssFile: "/themes/classicshellbackground/classicshellbackground.css",
            images: [
                '/themes/classicshellbackground/img/classicbackground.png'
            ]
        });
    },

    permissionsAfterSetup: function (data) {
        LegacySettings.addTab("Graphics", [1,1]);
        LegacySettings.addCategory("Graphics", 0, "Throwback Options", { defaultOpen: true, collapsible: false });

        this.bulletHoles = LegacySettings.addOption("Graphics", { type: "select", key: "bulletHoles", label: "Bullet Holes", 
            default: "0.17.0",
            options: [
                { value: "0.17.0", label: "Disabled (0.17.0)" },
                { value: "0.9.0", label: "Enabled (0.9.0)" },
                { value: "0.1.0", label: "Enabled (0.1.0)" },
            ], 
        }, 0, "Throwback Options");
        this.bulletSmoke = LegacySettings.addOption("Graphics", { type: "checkbox", key: "bulletSmoke", label: "Bullet Smoke", default: true }, 0, "Throwback Options");
        this.classicDeath = LegacySettings.addOption("Graphics", { type: "checkbox", key: "classicDeath", label: "Classic Death Animation", default: false }, 0, "Throwback Options");
        this.classicFrag = LegacySettings.addOption("Graphics", { type: "checkbox", key: "classicFrag", label: "Classic Frag Particles", default: false }, 0, "Throwback Options");
    },

    onMapCompleteBeforeSetup: function (data) {
        //from older shell js's
        bulletHoleManager = new BABYLON.SpriteManager("bulletHoleManager", "img/bulletHoles.png?v=1", 1e3, 32, gameScene);
        bulletHoleManager.fogEnabled = true;
        bulletHoleManager.idx = 0;
        // 0.1.0 added bullet holes, cellIndex 1
        // 0.9.0 changed to cellIndex 0
        // 0.17.0 removed them entirely
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

    bulletHitEffect: function (data) {
        plugins.cancel = !this.bulletSmoke.get();
    },

    bulletHitAfter: function (data) {
        var { x, y, z, dx, dy, dz } = data;

        const holes = this.bulletHoles.get();

        if (holes !== "0.17.0") {
            bulletHoleManager.addHole(holes === "0.1.0" ? 1 : 0, x + (dx/4), y + (dy/4), z + (dz/4));
        };
    },

    afterBullshit(data) {
        //this is real BS.
        // itemRendererBabylons.push("eggExplode");
        loadObjectMeshesBabylons.push("eggExplode");
    },

    createMaterials: function (scene) {
        if (scene.getMaterialByName("eggWhite")) return;

        this.eggWhiteMaterial = new BABYLON.StandardMaterial("eggWhite", scene);
        this.eggWhiteMaterial.disableLighting = true;
        this.eggWhiteMaterial.alpha = 0.8;
        this.eggWhiteMaterial.emissiveColor = BABYLON.Color3.White();

        this.eggYolkMaterial = new BABYLON.StandardMaterial("eggYolk", scene);
        this.eggYolkMaterial.disableLighting = true;
        this.eggYolkMaterial.emissiveColor = BABYLON.Color3.White();

        // this.normalBackfaceMaterial = new BABYLON.StandardMaterial("normalBackFace", scene);
        // this.normalBackfaceMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        // this.normalBackfaceMaterial.ambientColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        // this.normalBackfaceMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        // this.normalBackfaceMaterial.backFaceCulling = false;
        // this.normalBackfaceMaterial.twoSidedLighting = true;
    },

    playerActorBodyMeshCreated(data) {
        const { playerActor, player } = data;

        const scene = player.scene;
        this.createMaterials(scene);

        playerActor.explodeMesh = scene.cloneMesh("eggExplode", playerActor.mesh);
        playerActor.explodeMesh.position.y = .32;
        playerActor.explodeMesh.parent = playerActor.mesh;
        playerActor.explodeMesh.setMaterial(scene.getMaterialByName("normalBackFace"));
        playerActor.explodeMesh.setEnabled(false);

        playerActor.whiteMesh = scene.cloneMesh("eggWhite", playerActor.mesh);
        playerActor.whiteMesh.parent = playerActor.explodeMesh;
        playerActor.whiteMesh.setMaterial(this.eggWhiteMaterial);
        playerActor.whiteMesh.setEnabled(false);

        playerActor.yolkMesh = scene.cloneMesh("eggYolk", playerActor.mesh);
        playerActor.yolkMesh.parent = playerActor.explodeMesh;
        playerActor.yolkMesh.setMaterial(this.eggYolkMaterial);
        playerActor.yolkMesh.setEnabled(false);
    },

    beginAnimation: function (mesh, start, end, loop, speed) {
        gameScene.beginAnimation(mesh, start, end, loop, speed);
        var children = mesh.getChildMeshes();
        for (var i = 0; i < children.length; i++) gameScene.beginAnimation(children[i], start, end, loop, speed);
    },

    playerDeathAnimation(data) {
        if (!this.classicDeath.get()) return;
        plugins.cancel = true;

        const { killedPlayer } = data;

        killedPlayer.actor.explodeMesh.setEnabled(true);
        killedPlayer.actor.whiteMesh.setEnabled(true);
        killedPlayer.actor.yolkMesh.setEnabled(true);
        this.beginAnimation(killedPlayer.actor.explodeMesh, 0, 50, false, 1);
        gameScene.beginAnimation(killedPlayer.actor.whiteMesh, 0, 50, false, 1);
        gameScene.beginAnimation(killedPlayer.actor.yolkMesh, 0, 56, false, 1);

        this.shellFragBurst(killedPlayer.actor.mesh, 200, 1);
    },

    playerActorRestoreToPlay: function (data) {
        const { playerActor } = data;
        playerActor.explodeMesh.setEnabled(false);
        playerActor.whiteMesh.setEnabled(false);
        playerActor.yolkMesh.setEnabled(false);
        playerActor.bodyMesh.setEnabled(true);
        playerActor.head.setEnabled(true);
        playerActor.eye.setEnabled(true);
        playerActor.gunContainer.setEnabled(true);
    },

    playerActorRemoveFromPlay: function (data) {
        const { playerActor } = data;
        playerActor.mesh.setEnabled(true);
        playerActor.bodyMesh.setEnabled(false);
        playerActor.head.setEnabled(false);
        playerActor.eye.setEnabled(false);
        playerActor.gunContainer.setEnabled(false);
    },

    shellFragBurst: function(mesh, count, power = 1) {
        if (mesh.isVisible) {
            var particleSystem = new BABYLON.ParticleSystem("particles", count, gameScene);
            particleSystem.targetStopDuration = .2;
            particleSystem.disposeOnStop = !0;
            particleSystem.particleTexture = new BABYLON.Texture("./img/shellfrag.png", gameScene);
            particleSystem.emitter = mesh;
            particleSystem.minEmitBox = new BABYLON.Vector3(-.2, .2, -.2);
            particleSystem.maxEmitBox = new BABYLON.Vector3(.2, .4, .2);
            particleSystem.color1 = new BABYLON.Color4(1, 1, 1, 4);
            particleSystem.color2 = new BABYLON.Color4(1, 1, 1, 4);
            particleSystem.colorDead = new BABYLON.Color4(1, 1, 1, 0);
            particleSystem.minSize = .01;
            particleSystem.maxSize = .04;
            particleSystem.minLifeTime = .1;
            particleSystem.maxLifeTime = .3;
            particleSystem.emitRate = count;
            particleSystem.manualEmitCount = count;
            particleSystem.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            particleSystem.gravity = new BABYLON.Vector3(0, -10, 0);
            particleSystem.direction1 = new BABYLON.Vector3(-2, -1, -2);
            particleSystem.direction2 = new BABYLON.Vector3(2, 3, 2);
            particleSystem.minAngularSpeed = 10 * -Math.PI;
            particleSystem.maxAngularSpeed = 10 * Math.PI;
            particleSystem.minEmitPower = 1 * power;
            particleSystem.maxEmitPower = 2 * power;
            particleSystem.updateSpeed = .01;
            particleSystem.start()
        }
    },

    shellFragBurstBefore(data) {
        if (!this.classicFrag.get()) return;

        const { player, count, theSize, theAnimLength } = data;

        plugins.cancel = true;
        this.shellFragBurst(player.actor.mesh, count, 1);
    },
};

TimeMachinePlugin.registerListeners(plugins);

var bulletHoleManager;