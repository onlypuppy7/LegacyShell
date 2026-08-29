//legacyshell: basic
import { isClient, isServer, devlog } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
//

// Weather/time state lives under gameOptions.plugins.weather / gameOptions.plugins.time - the
// same "arbitrary flags for plugins to use (synced in updateRoomParams)" bucket every room's
// gameOptions already carries, rather than the top-level gameOptions.weather/gameOptions.time
// this used to be core-owned at. Nothing else about packUpdateRoomParams needed to change to
// carry this - `plugins: this.gameOptions.plugins` was already part of every sync.
var rainParticleSystem;
var rainSound;
var wetMaterial;
var snowParticleSystem;

export const LegacyWeatherPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (LegacyWeatherPlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
        this.plugins.on('game:GameTypesInit', this.GameTypesInit.bind(this));
        this.plugins.on('game:metaLoop', this.metaLoop.bind(this));
        this.plugins.on('game:LegacyShellOnMessage', this.LegacyShellOnMessage.bind(this));
        this.plugins.on('game:roomParamsUpdated', this.roomParamsUpdated.bind(this));
        this.plugins.on('game:loadSounds', this.loadSounds.bind(this));
        this.plugins.on('game:loadMaterials', this.loadMaterials.bind(this));
        this.plugins.on('game:joinGame', this.joinGame.bind(this));
        this.plugins.on('game:onMapComplete', this.onMapComplete.bind(this));
    },

    permissionsAfterSetup: function (data) {
        Comm.Add("doThunderStrike"); //this is an arbitrary way to add it in reality.

        console.log("registering weather/time commands... (legacyweather plugin)");
        var ctx = data.this;

        //time
        ctx.newCommand({
            identifier: "timeDay",
            name: "day",
            category: "time",
            description: "Set time to day (default).",
            example: "(no input needed)",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = ctx.room.gameOptions.plugins.time != "day";
                ctx.room.gameOptions.plugins.time = "day";

                if (changed) {
                    ctx.room.notify(`Time has been updated to day.`, 5);
                    ctx.room.updateRoomParamsForClients();
                };
            },
        });
        ctx.newCommand({
            identifier: "timeNight",
            name: "night",
            category: "time",
            description: "Set time to night.",
            example: "(no input needed)",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = ctx.room.gameOptions.plugins.time != "night";
                ctx.room.gameOptions.plugins.time = "night";

                if (changed) {
                    ctx.room.notify(`Time has been updated to night.`, 5);
                    ctx.room.updateRoomParamsForClients();
                };
            },
        });

        //weather
        ctx.newCommand({
            identifier: "rainEnabled",
            name: "rain",
            category: "weather",
            description: "Enable/disable rainy weather.",
            example: "true",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = ctx.room.gameOptions.plugins.weather.rainEnabled != opts;
                ctx.room.gameOptions.plugins.weather.rainEnabled = opts;

                if (changed) {
                    ctx.room.notify(`Rain has been ${opts ? "enabled" : "disabled"}.`, 5);
                    ctx.room.updateRoomParamsForClients();
                };
            },
        });
        ctx.newCommand({
            identifier: "stormEnabled",
            name: "storm",
            category: "weather",
            description: "Enable/disable stormy weather.",
            example: "true",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = ctx.room.gameOptions.plugins.weather.stormEnabled != opts;
                ctx.room.gameOptions.plugins.weather.stormEnabled = opts;

                if (changed) {
                    ctx.room.notify(`Stormy weather has been ${opts ? "enabled" : "disabled"}.`, 5);
                    ctx.room.updateRoomParamsForClients();
                };
            },
        });
        ctx.newCommand({
            identifier: "snowStormEnabled",
            name: "snowstorm",
            category: "weather",
            description: "Enable/disable the snowstorm.",
            example: "true",
            permissionLevel: [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true],
            inputType: ["bool"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var changed = ctx.room.gameOptions.plugins.weather.snowStormEnabled != opts;
                ctx.room.gameOptions.plugins.weather.snowStormEnabled = opts;

                if (changed) {
                    ctx.room.notify(`Snowstorm has been ${opts ? "enabled" : "disabled"}.`, 5);
                    ctx.room.updateRoomParamsForClients();
                };
            },
        });
    },

    // Injects the weather/time defaults into the SAME defaultOptions object gametypes.js's own
    // module-level IIFE immediately merges into every GameType's options right after this emit
    // resolves - see parkourmode/shared.js's own GameTypesInit comment for why importing
    // #gametypes directly from a plugin's module scope (instead of reading it off `data` here)
    // is unsafe (fires the emit before any plugin has registered listeners).
    GameTypesInit(data) {
        data.defaultOptions.plugins.weather = {
            rainEnabled: false,
            stormEnabled: false,
            snowStormEnabled: false,
        };
        data.defaultOptions.plugins.time = "day";
    },

    // Server-only: 1-in-4 chance of a synced lightning strike every ~2s (metaLoop's own real
    // cadence), while storm is enabled for the room. Moved verbatim out of rooms.js's metaLoop -
    // that function already emits this event unconditionally, so no core change was needed here.
    metaLoop(data) {
        if (isClient) return;
        var room = data.this;

        if (!room.gameOptions.plugins.weather?.stormEnabled) return;

        if (Math.getRandomChance(1 / 4)) { //1 in 4 chance of storm every 2 seconds
            var output = new Comm.Out();
            output.packInt8U(Comm.Code.doThunderStrike);
            room.sendToAll(output, null, "doThunderStrike");
        };
    },

    // Client-only: intercepts the doThunderStrike opcode entirely (nothing else in core needs to
    // run for it, unlike updateRoomParams below which is a shared/mixed opcode).
    LegacyShellOnMessage(data) {
        if (isServer) return;
        var input = data.input;
        var cmd = data.cmd;

        let didSomething = true;

        switch (cmd) {
            case Comm.Code.doThunderStrike:
                doThunderStrike();
                break;
            default:
                didSomething = false;
                break;
        };

        if (didSomething) plugins.cancel = true; //dont set it directly! otherwise you could interfere with other plugins.
    },

    // Client-only: the weather/time-specific slice of handling Comm.Code.updateRoomParams -
    // core keeps the cheatsEnabled toggle and the Object.assign(gameOptions, roomParamsObj) merge
    // (neither is weather-specific), and emits this event with the parsed payload in between the
    // two, in place of what used to be this logic inline.
    roomParamsUpdated(data) {
        if (isServer) return;
        var roomParamsObj = data.roomParamsObj;
        var weather = roomParamsObj.plugins?.weather || { rainEnabled: false, stormEnabled: false, snowStormEnabled: false };
        var time = roomParamsObj.plugins?.time;

        setParticleSystems(roomParamsObj);

        switch (time) {
            case "night":
                skyboxMaterial.reflectionTexture.level = 0.1;

                gameScene.fogColor = new BABYLON.Color4(0, 0, 0, 1);
                gameScene.fogDensity = .065;

                mapMesh.overlayAlpha = 0.5;
                mapMesh.overlayColor = {r: 0, g: 0, b: 0};
                mapMesh.renderOverlay = true;
                break;
            default:
                skyboxMaterial.reflectionTexture.level = 1;

                if (weather.snowStormEnabled) {
                    devlog("snowStormEnabled");
                    gameScene.fogDensity = 0.025;
                    gameScene.fogColor = new BABYLON.Color4(1, 1, 1, 1);
                } else {
                    setFog();
                };

                mapMesh.overlayAlpha = 0;
                mapMesh.renderOverlay = false;
                break;
        };

        if (weather.rainEnabled) {
            if (!rainSound) rainSound = playSoundIndependent2D("rain", {vol: 0.75, loop: true});
            mapMesh.material = wetMaterial;
            me.weapons[0].actor.gunMesh.material = wetMaterial;
            me.weapons[1].actor.gunMesh.material = wetMaterial;
            me.actor.hands.material = wetMaterial;
        } else {
            if (rainSound) {
                rainSound.stop();
                rainSound = null;
            };
            var materialName = gameScene.shadowsEnabled ? "map" : "mapNoShadows";
            mapMesh.material = gameScene.getMaterialByName(materialName);
            me.weapons[0].actor.gunMesh.material = gameScene.getMaterialByName("standard");
            me.weapons[1].actor.gunMesh.material = gameScene.getMaterialByName("standard");
            me.actor.hands.material = gameScene.getMaterialByName("standard");
        };

        if (weather.stormEnabled) {
            setSkybox("thunderstorm");
            skyboxMaterial.reflectionTexture.level = 0;

            mapMesh.overlayAlpha = 0.5;
            mapMesh.overlayColor = {r: 0, g: 0, b: 0};

            gameScene.fogColor = new BABYLON.Color4(0, 0, 0, 1);
            gameScene.fogDensity = .25;
        } else {
            var skyboxName = minMap.skybox || "default";
            setSkybox(skyboxName);

            if (!weather.snowStormEnabled) setFog();
        };
    },

    loadSounds: function (data) {
        data.soundsList.push(["sound/ambiance/rain.mp3", "rain"]);

        //thunder, with cue
        let thunderSrcs = [];
        for (var i = 1; i < 4; i++) {
            thunderSrcs.push("sound/ambiance/thunder" + i + ".mp3");
        };
        loadCue("thunder", thunderSrcs);

        devlog("legacyweather plugin loaded sounds list additions");
    },

    // Client-only: wetMaterial is one of loadMaterials' own materials, just no longer defined
    // inline in core - loadMaterials didn't previously emit anything, so this needed one new
    // line added there (see shellshock.min.js's own comment at the call site).
    loadMaterials(data) {
        if (isServer) return;
        var scene = data.scene;

        wetMaterial = new BABYLON.StandardMaterial("wetMaterial", scene);
        wetMaterial.diffuseColor = new BABYLON.Color3(0.75, 0.75, 0.85);
        wetMaterial.specularColor = new BABYLON.Color3(1, 1, 1);
        wetMaterial.specularPower = 24;
    },

    joinGame(data) {
        if (isServer) return;
        rainSound = null;
    },

    // Client-only: creates the rain/snow particle systems once per map load, same point in
    // onMapComplete this used to run inline at (order relative to the OTHER managers created in
    // that function doesn't matter - independent objects, nothing depends on creation order).
    onMapComplete(data) {
        if (isServer) return;

        rainParticleSystem = new BABYLON.ParticleSystem("rain", 2000, gameScene);

        rainParticleSystem.particleTexture = new BABYLON.Texture("/img/rain.png", gameScene);

        rainParticleSystem.minEmitBox = new BABYLON.Vector3(-10, 20, -10);
        rainParticleSystem.maxEmitBox = new BABYLON.Vector3(10, 20, 10);

        rainParticleSystem.minSize = 0.05;
        rainParticleSystem.maxSize = 0.1;
        rainParticleSystem.minLifeTime = 1.0;
        rainParticleSystem.maxLifeTime = 1.5;
        rainParticleSystem.emitRate = 2000;

        rainParticleSystem.direction1 = new BABYLON.Vector3(0, -1, 0);
        rainParticleSystem.direction2 = new BABYLON.Vector3(0, -1, 0);
        rainParticleSystem.minEmitPower = 3;
        rainParticleSystem.maxEmitPower = 5;
        rainParticleSystem.updateSpeed = 0.01;

        rainParticleSystem.minScaleX = 0.25;
        rainParticleSystem.maxScaleY = 0.5;
        rainParticleSystem.minScaleY = 10;
        rainParticleSystem.maxScaleY = 15;
        rainParticleSystem.gravity = new BABYLON.Vector3(0, -30.81, 0);
        rainParticleSystem.isLocal = false;

        gameScene.registerBeforeRender(function () {
            rainParticleSystem.particles.forEach(function (p) {
                var pointCollidesWithMap = Collider.pointCollidesWithMap(p.position);
                if (pointCollidesWithMap) {
                    p.position.y = -1e7;
                };
            });
        });

        snowParticleSystem = new BABYLON.ParticleSystem("snow", 10e3, gameScene);

        snowParticleSystem.particleTexture = new BABYLON.Texture("/img/flare.png", gameScene);

        snowParticleSystem.emitter = new BABYLON.Vector3(0, 10, 0);

        snowParticleSystem.minLifeTime = 15;
        snowParticleSystem.maxLifeTime = 30;

        snowParticleSystem.emitRate = 500;

        snowParticleSystem.minEmitPower = 0.5;
        snowParticleSystem.maxEmitPower = 1.25;

        snowParticleSystem.minEmitBox = new BABYLON.Vector3(-10, 5, -10);
        snowParticleSystem.maxEmitBox = new BABYLON.Vector3(10, 5, 10);

        snowParticleSystem.minSize = 0.03;
        snowParticleSystem.maxSize = 0.07;

        snowParticleSystem.direction1 = new BABYLON.Vector3(-0.5, -1, 0.5);
        snowParticleSystem.direction2 = new BABYLON.Vector3(0.5, -1, -0.5);

        snowParticleSystem.updateSpeed = 0.01;

        snowParticleSystem.color1 = new BABYLON.Color4(1, 1, 1, 1);
        snowParticleSystem.color2 = new BABYLON.Color4(1, 1, 1, 0.5);
        snowParticleSystem.colorDead = new BABYLON.Color4(1, 1, 1, 0);

        // snowParticleSystem.start();

        gameScene.registerBeforeRender(() => {
            const time = performance.now() * 0.002;
            snowParticleSystem.emitter.x = Math.sin(time) * 5;
            snowParticleSystem.emitter.z = Math.cos(time) * 5;

            snowParticleSystem.particles.forEach(function (p) {
                var pointCollidesWithMap = Collider.pointCollidesWithMap(p.position);
                if (pointCollidesWithMap) {
                    p.position.y = -1e7;
                };
            });
        });
    },
};

// Moved verbatim from shellshock.min.js - purely client-side rendering, called from
// roomParamsUpdated above (still gameOptions-agnostic itself, current call convention unchanged)
// and from the two shadow-toggle functions in core (disableShadows/enableShadows), which call it
// with no arguments (falls back to the global `gameOptions`, whose .plugins.weather is kept
// current by the Object.assign(gameOptions, roomParamsObj) core still does on every sync).
function setParticleSystems(gameOptionsP = gameOptions) {
    var weather = gameOptionsP.plugins?.weather || {};

    if (weather.snowStormEnabled && gameScene.shadowsEnabled) {
        snowParticleSystem.start();
    } else {
        snowParticleSystem.stop();
    };

    if (weather.rainEnabled && gameScene.shadowsEnabled) {
        rainParticleSystem.start();
    } else {
        rainParticleSystem.stop();
    };
};

// Moved verbatim from shellshock.min.js - triggered by the doThunderStrike opcode above.
function doThunderStrike() {
    var idx = 0;
    var fpsinterval = 1e3 / fps;

    function setDynamics(percent) {
        gameScene.fogColor = new BABYLON.Color4(1, 1, 1, 1); //white
        gameScene.fogDensity = Math.max(.5 - percent, 0);
        mapMesh.overlayAlpha = Math.max(.5 - percent, 0);
        skyboxMaterial.reflectionTexture.level = Math.max(percent, 0.01);
    };

    var stormInterval = intervalGame.set(function() {
        idx++;
        setDynamics(Math.sin(idx / 6));

        if (idx == 10) playSoundIndependent2D("thunder");

        if (idx > 14) {
            intervalGame.clear(stormInterval);
            idx = 0;
            var stormInterval2 = intervalGame.set(function() {
                var percent = idx/50;
                skyboxMaterial.reflectionTexture.level = 1 - percent;

                var fogColor = 1 - Math.min(percent * 10, 1);
                gameScene.fogColor = new BABYLON.Color4(fogColor, fogColor, fogColor, 1);
                gameScene.fogDensity = .25 * percent;

                var overlayColor = 1 - Math.min(percent * 2, 1);
                gameScene.overlayColor = new BABYLON.Color4(overlayColor, overlayColor, overlayColor, 1);
                gameScene.overlayAlpha = 1 - percent;

                if (idx >= 50) {
                    intervalGame.clear(stormInterval2);
                };
                idx++;
            }, fpsinterval);
        };
    }, fpsinterval);

    skybox.rotation.y = Math.PI2 * 2 * Math.random();
};

if (isClient) LegacyWeatherPlugin.registerListeners(plugins);
