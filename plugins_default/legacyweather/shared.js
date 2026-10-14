//legacyshell: basic
import { isClient, isServer, devlog } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
//plugin: legacyweather
import { WeatherState } from './weatherState.js';
//

// Weather/time state lives under gameOptions.plugins.weather / gameOptions.plugins.time (the
// "arbitrary flags for plugins, synced in updateRoomParams" bucket). See weatherState.js for the
// shape: three independent layers (rain/storm/snow), each a number or an object of parts, plus
// wind, plus time of day. Anything may write either form; WeatherState.sanitize* normalises.
const LIGHTNING_MAX_RATE = 0.2; //strikes per second at lightning = 1
const METALOOP_SECS = 2; //rooms.js runs metaLoop every 2s

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
        this.plugins.on('game:shadowsToggled', this.shadowsToggled.bind(this));
    },

    permissionsAfterSetup: function (data) {
        Comm.Add("doThunderStrike"); //this is an arbitrary way to add it in reality.

        if (isClient && typeof LegacySettings !== "undefined") {
            LegacySettings.addTab("Graphics", [1,1]);
            LegacySettings.addCategory("Graphics", 1, "Weather", { defaultOpen: true, collapsible: false });
            this.weatherQuality = LegacySettings.addOption("Graphics", {
                type: "select", key: "weatherQuality", label: "Rain & Snow", default: "high",
                options: [
                    { value: "high", label: "High" },
                    { value: "low", label: "Low (fewer drops)" },
                    { value: "off", label: "Off" },
                ],
            }, 1, "Weather");
        };

        console.log("registering weather/time commands... (legacyweather plugin)");
        var ctx = data.this;

        var adminLevel = [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true];
        var openLevel = [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false];

        var layerList = WeatherState.layerNames().join("|");

        var feedback = (player, text) => {
            if (isClient) addChat(text, null, Comm.Chat.cmd);
            else player.client.commandFeedback(text);
        };

        var describeWeather = (weather) => {
            weather = WeatherState.sanitizeWeather(weather);
            var lines = WeatherState.layerNames().map(name => WeatherState.describeLayer(name, weather[name]));
            lines.push(weather.wind.strength > 0 ? `wind: ${weather.wind.strength} at ${weather.wind.direction} degrees` : "wind: calm");
            return lines.join(" | ");
        };

        //weather
        ctx.newCommand({
            identifier: "weatherSet",
            name: "set",
            category: "weather",
            description: "Set one weather layer. Each layer is independent, so rain + storm gives a thunderstorm.",
            example: "storm 0.5 thunder=0.1 distance=80 seconds=20",
            usage: `<${layerList}|wind> [intensity 0-1] [part=value ...] [seconds=N]`,
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var result = WeatherState.parseWeatherSet(opts);
                if (!result.ok) return feedback(player, result.error);

                var weather = WeatherState.sanitizeWeather(ctx.room.gameOptions.plugins.weather);
                weather[result.layer] = result.value;
                weather.transitionSecs = result.seconds === undefined ? WeatherState.DEFAULT_TRANSITION_SECS : WeatherState.clampSecs(result.seconds);
                ctx.room.gameOptions.plugins.weather = weather;

                var text = result.layer === "wind" ? `wind: ${result.value.strength} at ${result.value.direction} degrees` : WeatherState.describeLayer(result.layer, result.value);
                ctx.room.notify(`Weather updated - ${text}`, 5);
                ctx.room.updateRoomParamsForClients();
            },
        });
        ctx.newCommand({
            identifier: "weatherClear",
            name: "clear",
            category: "weather",
            description: "Turn off one weather layer, or all of them.",
            example: "rain",
            usage: `[${layerList}|wind] [seconds=N]`,
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var { positional, named } = WeatherState.splitTokens(opts);
                var layer = (positional[0] || "").toLowerCase();
                if (layer && layer !== "wind" && !WeatherState.layers[layer]) {
                    return feedback(player, `Unknown layer "${layer}". Valid layers: ${layerList}, wind.`);
                };
                var secs = Number(named.seconds !== undefined ? named.seconds : named.secs);

                var weather = WeatherState.sanitizeWeather(ctx.room.gameOptions.plugins.weather);
                for (var name of WeatherState.layerNames()) {
                    if (!layer || layer === name) weather[name] = WeatherState.resolveLayer(name, 0).value;
                };
                if (!layer || layer === "wind") weather.wind = { strength: 0, direction: 0 };
                weather.transitionSecs = isFinite(secs) ? WeatherState.clampSecs(secs) : WeatherState.DEFAULT_TRANSITION_SECS;
                ctx.room.gameOptions.plugins.weather = weather;

                ctx.room.notify(`Weather cleared${layer ? ` (${layer})` : ""}.`, 5);
                ctx.room.updateRoomParamsForClients();
            },
        });
        ctx.newCommand({
            identifier: "weatherGet",
            name: "get",
            category: "weather",
            description: "Show the current weather settings.",
            example: "(no input needed)",
            usage: "(no input needed)",
            permissionLevel: openLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {
                //the client already holds the synced state, so it can answer instantly
                feedback(player, describeWeather(gameOptions.plugins && gameOptions.plugins.weather));
            },
            executeServer: ({ player, opts, mentions }) => {},
        });

        //time
        ctx.newCommand({
            identifier: "timeSet",
            name: "set",
            category: "time",
            description: "Set the time of day.",
            example: "night seconds=10",
            usage: `<${Object.keys(WeatherState.timePresets).join("|")}> [sun=r,g,b] [fogColor=r,g,b|none] [fogMult=N] [sky=0-1] [seconds=N]`,
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var result = WeatherState.parseTimeSet(opts);
                if (!result.ok) return feedback(player, result.error);

                ctx.room.gameOptions.plugins.time = result.value;
                ctx.room.notify(`Time has been updated to ${result.value.preset}.`, 5);
                ctx.room.updateRoomParamsForClients();
            },
        });
        ctx.newCommand({
            identifier: "timeGet",
            name: "get",
            category: "time",
            description: "Show the current time of day settings.",
            example: "(no input needed)",
            usage: "(no input needed)",
            permissionLevel: openLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {
                var time = WeatherState.sanitizeTime(gameOptions.plugins && gameOptions.plugins.time);
                feedback(player, `time: ${time.preset} (sun=${time.sun.join(",")} fogColor=${time.fogColor ? time.fogColor.join(",") : "map"} fogMult=${time.fogMult} sky=${time.sky})`);
            },
            executeServer: ({ player, opts, mentions }) => {},
        });
    },

    // Injects the weather/time defaults into the SAME defaultOptions object gametypes.js's own
    // module-level IIFE immediately merges into every GameType's options right after this emit
    // resolves - see parkourmode/shared.js's own GameTypesInit comment for why importing
    // #gametypes directly from a plugin's module scope (instead of reading it off `data` here)
    // is unsafe (fires the emit before any plugin has registered listeners).
    GameTypesInit(data) {
        data.defaultOptions.plugins.weather = WeatherState.defaultWeather();
        data.defaultOptions.plugins.time = WeatherState.sanitizeTime("day");
    },

    // Server-only: lightning is a random process whose rate comes from the storm layer's
    // `lightning` part. metaLoop runs every 2s, so each tick strikes with the matching chance.
    metaLoop(data) {
        if (isClient) return;
        var room = data.this;

        var storm = WeatherState.sanitizeWeather(room.gameOptions.plugins.weather).storm;
        if (!storm.lightning) return;

        var chance = 1 - Math.exp(-storm.lightning * LIGHTNING_MAX_RATE * METALOOP_SECS);
        if (Math.random() < chance) {
            //every client draws the same bolt: the seed shapes it, angle + distance place it around each player
            var distance = Math.max(10, Math.min(150, storm.distance * (0.6 + Math.random() * 0.8)));
            var output = new Comm.Out();
            output.packInt8U(Comm.Code.doThunderStrike);
            output.packInt16U(Math.floor(Math.random() * 65536)); //seed
            output.packInt8U(Math.floor(Math.random() * 256)); //angle, 0-255 around the full circle
            output.packInt8U(Math.round(distance)); //blocks
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
                var seed = input.unPackInt16U();
                var angle = input.unPackInt8U();
                var distance = input.unPackInt8U();
                WeatherRender.strike(seed, angle, distance);
                break;
            default:
                didSomething = false;
                break;
        };

        if (didSomething) plugins.cancel = true; //dont set it directly! otherwise you could interfere with other plugins.
    },

    // Client-only: the server synced new weather/time. Core keeps the cheatsEnabled toggle and the
    // Object.assign(gameOptions, roomParamsObj) merge, and emits this in between the two.
    roomParamsUpdated(data) {
        if (isServer) return;
        var roomParamsObj = data.roomParamsObj;

        var weather = WeatherState.sanitizeWeather(roomParamsObj.plugins && roomParamsObj.plugins.weather);
        var time = WeatherState.sanitizeTime(roomParamsObj.plugins && roomParamsObj.plugins.time);

        var snap = WeatherRender.snapNext; //the first sync after joining applies instantly
        WeatherRender.snapNext = false;
        WeatherRender.setTarget(time, weather, snap);
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

    // Client-only: core just built its materials. The ones on the shared shader get the wet-surface
    // uniforms added (the GLSL itself is patched in at build time, see weatherShader.js).
    loadMaterials(data) {
        if (isServer) return;
        WeatherRender.hookMaterials(data.scene);
    },

    joinGame(data) {
        if (isServer) return;
        WeatherRender.reset();
    },

    // Client-only: runs once per map load. The height map and rain/snow meshes are rebuilt (the old
    // ones disposed) so maps don't stack up meshes and per-frame callbacks, and the sky/fog/materials
    // the map just created get the current weather applied again.
    onMapComplete(data) {
        if (isServer) return;
        WeatherRender.buildPrecip();
        WeatherRender.lastSkyMat = null;
        WeatherRender.refresh();
    },

    // The auto-detail optimiser turns shadows off on slow machines; rain/snow drop from High to Low with them.
    shadowsToggled(data) {
        if (isServer) return;
        WeatherRender.autoLow = !data.shadowsEnabled;
    },
};

if (isClient) LegacyWeatherPlugin.registerListeners(plugins);
