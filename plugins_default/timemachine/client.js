export const TimeMachinePlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (TimeMachinePlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));

        this.plugins.on('game:onMapCompleteBeforeSetup', this.onMapCompleteBeforeSetup.bind(this));

        this.plugins.on('game:bulletHitEffect', this.bulletHitEffect.bind(this));
        this.plugins.on('game:bulletHitAfter', this.bulletHitAfter.bind(this));

        this.plugins.on('game:afterBullshit', this.afterBullshit.bind(this));
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

        LegacyThemesPlugin.soundPacks.push({
            name: "Classic Grenade Sounds",
            identifier: "classicgrenade",
            description: "The first grenade sounds from 0.10.0 to 0.15.0.",
            sounds: {
                "grenade.explode": "/sounds/classicgrenade/grenade.mp3",
                "grenade.beep": "/sounds/classicgrenade/grenadeBeep.mp3"
            },
            images: [
                '/sounds/classicgrenade/classicgrenade.png'
            ]
        });
    },

    permissionsAfterSetup: function (data) {
        LegacySettings.addTab("Graphics", [1,1]);
        LegacySettings.addCategory("Graphics", 0, "Throwback Options", { defaultOpen: true, collapsible: false });

        this.bulletHoles = LegacySettings.addOption("Graphics", { type: "select", key: "bulletHoles", label: "Bullet Holes", tooltip: "Leaves marks where bullets hit walls, as in older versions. The version is the style it had then; 0.17.0 (the version LegacyShell is based on) has none.",

            default: "0.17.0",
            options: [
                { value: "0.17.0", label: "Disabled (0.17.0)" },
                { value: "0.9.0", label: "Enabled (0.9.0)" },
                { value: "0.1.0", label: "Enabled (0.1.0)" },
            ], 
        }, 0, "Throwback Options");
        this.mapSkybox = LegacySettings.addOption("Graphics", { type: "select", key: "mapSkybox", label: "Map Skybox", tooltip: "Replaces the skybox of every map with an older one. Skyboxes leaves each map's own.",
            default: "skyboxes",
            options: [
                { value: "classic-alpha", label: "Alpha (0.0.4)" },
                { value: "classic", label: "Classic (0.1.0)" },
                { value: "skyboxes", label: "Skyboxes (0.14.4+)" },
            ],
        }, 0, "Throwback Options");
        this.bulletSmoke = LegacySettings.addOption("Graphics", { type: "checkbox", key: "bulletSmoke", label: "Bullet Smoke", default: true, tooltip: "The puff of smoke where a bullet hits. Turn off to remove it." }, 0, "Throwback Options");
        //alpha (0.0.4) isn't here: its pieces fell through the floor
        //todo: pre-yolk classic (0.1.1), only the egg breaking with no white or yolk, needs the right animation first
        this.deathAnimation = LegacySettings.addOption("Graphics", { type: "select", key: "deathAnimation", label: "Death Animation", tooltip: "How eggs burst apart when they die.",
            default: "0.15.4d",
            options: [
                { value: "0.4.2", label: "Classic (0.4.2)" },
                { value: "0.15.4d", label: "Current (0.15.4d)" },
            ],
        }, 0, "Throwback Options");
        this.classicFrag = LegacySettings.addOption("Graphics", { type: "checkbox", key: "classicFrag", label: "Classic Frag Particles", default: false, tooltip: "Uses the older shell fragment particles when an egg is hurt or dies." }, 0, "Throwback Options");
    },

    onMapCompleteBeforeSetup: function (data) {
        ClassicSkyboxPlugin.override = this.mapSkybox.get() === "skyboxes" ? null : this.mapSkybox.get();

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

        //they are unlit (the classic burst was), so the time of day would never reach them: they take the sunlight colour the shader gives everything else (legacyweather changes it for night)
        scene.registerBeforeRender(() => {
            const sun = scene.sunLight && scene.sunLight.diffuse;
            if (sun) { this.eggWhiteMaterial.emissiveColor.set(sun.r, sun.g, sun.b); this.eggYolkMaterial.emissiveColor.set(sun.r, sun.g, sun.b); };
        });

        // this.normalBackfaceMaterial = new BABYLON.StandardMaterial("normalBackFace", scene);
        // this.normalBackfaceMaterial.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        // this.normalBackfaceMaterial.ambientColor = new BABYLON.Color3(0.5, 0.5, 0.5);
        // this.normalBackfaceMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
        // this.normalBackfaceMaterial.backFaceCulling = false;
        // this.normalBackfaceMaterial.twoSidedLighting = true;
    },

    //cloning eggExplode (a root with twenty shards, and the white and yolk) cost over 100ms for every player's first death: each cloned mesh sets its
    //material, and setting a material goes through every mesh in the scene. So the loaded meshes only get their material the once and what a
    //player gets are instances of them (the way the bullets are), which share it and set nothing. Instances only copy position and rotation, so the
    //rest of the transform and the animations are copied across by hand. Made a little after the player spawns (see prepareExplodeMeshes), and
    //whatever is not there yet when someone dies is made right then.
    createExplodeMeshes(playerActor) {
        for (let step = 0; step < 3; step++) this.createExplodeMesh(playerActor, step);
    },

    explodeSources(scene) {
        if (this.sources) return this.sources;
        this.createMaterials(scene);
        const root = scene.getMeshByName("eggExplode"), white = scene.getMeshByName("eggWhite"), yolk = scene.getMeshByName("eggYolk");
        root.setMaterial(scene.getMaterialByName("normalBackFace"));
        white.material = this.eggWhiteMaterial;
        yolk.material = this.eggYolkMaterial;
        return this.sources = { root, white, yolk };
    },

    instanceOf(source, parent) {
        const instance = source.createInstance("");
        instance.rotationQuaternion = source.rotationQuaternion ? source.rotationQuaternion.clone() : null;
        instance.scaling.copyFrom(source.scaling);
        instance.animations = source.animations.slice();
        instance.parent = parent;
        return instance;
    },

    createExplodeMesh(playerActor, step) {
        const sources = this.explodeSources(playerActor.player.scene);

        if (step === 0 && !playerActor.explodeMesh) {
            const root = new BABYLON.TransformNode("", playerActor.player.scene);
            root.scaling.copyFrom(sources.root.scaling);
            root.rotation.copyFrom(sources.root.rotation);
            root.position.y = .32;
            root.parent = playerActor.mesh;
            for (const shard of sources.root.getChildMeshes(true)) this.instanceOf(shard, root);
            root.setEnabled(false);
            playerActor.explodeMesh = root;
        };
        if (step === 1 && !playerActor.whiteMesh) {
            this.createExplodeMesh(playerActor, 0);
            playerActor.whiteMesh = this.instanceOf(sources.white, playerActor.explodeMesh);
            playerActor.whiteMesh.setEnabled(false);
        };
        if (step === 2 && !playerActor.yolkMesh) {
            this.createExplodeMesh(playerActor, 0);
            playerActor.yolkMesh = this.instanceOf(sources.yolk, playerActor.explodeMesh);
            playerActor.yolkMesh.setEnabled(false);
        };
    },

    prepareExplodeMeshes(playerActor) {
        if (playerActor.explodePrepared || this.deathAnimation.get() === "0.15.4d") return;
        playerActor.explodePrepared = true;
        for (let step = 0; step < 3; step++) {
            setTimeout(() => {
                if (!playerActor.mesh || playerActor.mesh.isDisposed()) return;
                try { this.createExplodeMesh(playerActor, step); } catch (e) { };
            }, 400 + Math.random() * 2500 + step * 200);
        };
    },

    beginAnimation: function (mesh, start, end, loop, speed) {
        gameScene.beginAnimation(mesh, start, end, loop, speed);
        var children = mesh.getChildMeshes();
        for (var i = 0; i < children.length; i++) gameScene.beginAnimation(children[i], start, end, loop, speed);
    },

    playerDeathAnimation(data) {
        const death = this.deathAnimation.get();
        if (death === "0.15.4d") return;
        plugins.cancel = true;

        const { killedPlayer } = data;

        this.createExplodeMeshes(killedPlayer.actor);
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
        this.prepareExplodeMeshes(playerActor);
        if (playerActor.explodeMesh) playerActor.explodeMesh.setEnabled(false); //(the white and yolk may not be made yet)
        if (playerActor.whiteMesh) playerActor.whiteMesh.setEnabled(false);
        if (playerActor.yolkMesh) playerActor.yolkMesh.setEnabled(false);
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