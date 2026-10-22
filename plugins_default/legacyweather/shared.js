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
const weatherCycleState = new WeakMap(); //room -> { nextAt }, server-only timing for the automatic cycle
const timeAutoState = new WeakMap(); //room -> { last }, when the automatic day's clock was last advanced

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
        this.plugins.on('game:leaveGame', this.leaveGame.bind(this));
        this.plugins.on('game:onMapComplete', this.onMapComplete.bind(this));
        this.plugins.on('game:shadowsToggled', this.shadowsToggled.bind(this));
        this.plugins.on('game:shellFragBurstAfter', (data) => { if (!isServer) WeatherRender.tintRecentSprites(shellFragManager, data.count); });
        this.plugins.on('game:explosionSpriteAfter', (data) => { if (!isServer) WeatherRender.tintSpriteColors(data.sprite); });
        this.plugins.on('game:bulletHitSpriteAfter', (data) => { if (!isServer) WeatherRender.tintSpriteColors(data.sprite); });
        this.plugins.on('game:yolkBurstAfter', (data) => { if (!isServer) WeatherRender.tintRecentSprites(data.manager, 10); });
    },

    permissionsAfterSetup: function (data) {
        Comm.Add("doThunderStrike"); //this is an arbitrary way to add it in reality.

        if (isClient && typeof LegacySettings !== "undefined") {
            LegacySettings.addTab("Graphics", [1,1]);
            this.weatherQuality = LegacySettings.addOption("Graphics", {
                type: "select", key: "weatherQuality", label: "Rain & Snow", default: "high", tooltip: "How many rain and snow particles are drawn. Lower it, or turn it off, if weather hurts your framerate.",
                options: [
                    { value: "high", label: "High" },
                    { value: "low", label: "Low (fewer drops)" },
                    { value: "off", label: "Off" },
                ],
            }, 1, "Detail"); //joins the Detail group (created by legacyshellcore, or on demand)
        };

        console.log("registering weather/time commands... (legacyweather plugin)");
        var ctx = data.this;

        var adminLevel = [ctx.ranksEnum.Moderator, ctx.ranksEnum.Guest, true];
        var openLevel = [ctx.ranksEnum.Guest, ctx.ranksEnum.Guest, false];

        var layerList = WeatherState.layerNames().join("|");
        var layerOptions = WeatherState.layerNames().concat(["wind"]);
        var timeOptions = Object.keys(WeatherState.timePresets);
        //shown in the command info panel: every layer with every part it understands
        var partsHelp = WeatherState.layerNames().map(n => `<b>${n}</b>: ${Object.keys(WeatherState.layers[n].parts).join(", ")}`).concat(["<b>wind</b>: strength, direction"]).join("<br>");

        var feedback = (player, text) => {
            if (isClient) addChat(text, null, Comm.Chat.cmd);
            else player.client.commandFeedback(text);
        };

        //a manual change takes over from the automatic cycle instead of fighting it
        var stopCycle = (room) => {
            var cycle = WeatherState.sanitizeCycle(room.gameOptions.plugins.weatherCycle);
            if (!cycle.enabled) return "";
            room.gameOptions.plugins.weatherCycle = { enabled: false, snow: cycle.snow };
            weatherCycleState.delete(room);
            return " (automatic weather turned off)";
        };

        var describeWeather = (weather) => {
            weather = WeatherState.sanitizeWeather(weather);
            var lines = WeatherState.layerNames().map(name => WeatherState.describeLayer(name, weather[name]));
            lines.push(weather.wind.strength > 0 ? `wind: ${weather.wind.strength} at ${weather.wind.direction} degrees` : "wind: calm");
            var cycle = WeatherState.sanitizeCycle(isClient && gameOptions.plugins && gameOptions.plugins.weatherCycle);
            lines.push(`auto: ${cycle.enabled ? (cycle.snow ? "on (with snow)" : "on") : "off"}`);
            return lines.join(" | ");
        };

        //weather
        ctx.newCommand({
            identifier: "weatherSet",
            name: "set",
            category: "weather",
            description: "Set one weather layer. Each layer is independent, so rain + storm gives a thunderstorm.",
            example: "storm 0.5 thunder=0.1 distance=80 seconds=20",
            usage: `&lt;${layerList}|wind&gt; [intensity 0-1] [part=value ...] [seconds=N]<br>${partsHelp}`, //shown as HTML in the command info panel, so the angle brackets are escaped
            options: layerOptions,
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var result = WeatherState.parseWeatherSet(opts);
                if (!result.ok) return feedback(player, result.error);

                var weather = WeatherState.sanitizeWeather(ctx.room.gameOptions.plugins.weather);
                weather[result.layer] = result.value;
                weather.transitionSecs = result.seconds === undefined ? WeatherState.DEFAULT_TRANSITION_SECS : WeatherState.clampSecs(result.seconds);
                if (result.layer === "rain") weather.dryingSecs = WeatherState.isLayerActive("rain", result.value) ? WeatherState.DEFAULT_DRYING_SECS : weather.transitionSecs; //switching rain off by hand dries the ground over the same time
                ctx.room.gameOptions.plugins.weather = weather;

                var text = result.layer === "wind" ? `wind: ${result.value.strength} at ${result.value.direction} degrees` : WeatherState.describeLayer(result.layer, result.value);
                ctx.room.notify(`Weather updated - ${text}${stopCycle(ctx.room)}`, 5);
                ctx.room.updateRoomParamsForClients();
            },
        });
        ctx.newCommand({
            identifier: "weatherClear",
            name: "clear",
            category: "weather",
            description: "Turn off one weather layer, or everything (all). Clearing rain also dries the ground over the same time, so seconds=0 dries it instantly.",
            example: "all seconds=5",
            usage: `[all|${layerList}|wind] [seconds=N]`,
            options: ["all"].concat(layerOptions),
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var { positional, named } = WeatherState.splitTokens(opts);
                var layer = (positional[0] || "").toLowerCase();
                if (layer === "all") layer = ""; //"all" and no argument mean the same thing
                if (layer && layer !== "wind" && !WeatherState.layers[layer]) {
                    return feedback(player, `Unknown layer "${layer}". Valid layers: all, ${layerList}, wind.`);
                };
                var secs = Number(named.seconds !== undefined ? named.seconds : named.secs);

                var weather = WeatherState.sanitizeWeather(ctx.room.gameOptions.plugins.weather);
                for (var name of WeatherState.layerNames()) {
                    if (!layer || layer === name) weather[name] = WeatherState.resolveLayer(name, 0).value;
                };
                if (!layer || layer === "wind") weather.wind = { strength: 0, direction: 0 };
                weather.transitionSecs = isFinite(secs) ? WeatherState.clampSecs(secs) : WeatherState.DEFAULT_TRANSITION_SECS;
                if (!layer || layer === "rain") weather.dryingSecs = weather.transitionSecs; //the ground dries with the rain, not a minute later
                ctx.room.gameOptions.plugins.weather = weather;

                ctx.room.notify(`Weather cleared${layer ? ` (${layer})` : " (all)"}.${stopCycle(ctx.room)}`, 5);
                ctx.room.updateRoomParamsForClients();
            },
        });
        ctx.newCommand({
            identifier: "weatherAuto",
            name: "auto",
            category: "weather",
            description: "Turn automatic weather on or off. While on, the weather drifts between clear, overcast, rain and thunderstorms by itself; setting or clearing weather by hand turns it off.",
            example: "on snow",
            usage: "&lt;on|off&gt; [snow]",
            options: ["on", "off"],
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var { positional } = WeatherState.splitTokens(opts);
                var word = (positional[0] || "").toLowerCase();
                var current = WeatherState.sanitizeCycle(ctx.room.gameOptions.plugins.weatherCycle);
                if (!word) return feedback(player, `Automatic weather is ${current.enabled ? "on" : "off"}. Usage: /weather auto <on|off> [snow]`);

                var on = ["on", "true", "1", "yes"].includes(word), off = ["off", "false", "0", "no"].includes(word);
                if (!on && !off) return feedback(player, "Usage: /weather auto <on|off> [snow]");

                var snow = on ? positional.slice(1).some(w => w.toLowerCase() === "snow") : current.snow;
                ctx.room.gameOptions.plugins.weatherCycle = { enabled: on, snow };
                weatherCycleState.delete(ctx.room); //starts straight away when turned on
                ctx.room.notify(`Automatic weather is ${on ? "on" + (snow ? " (snow allowed)" : "") : "off"}.`, 5);
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
            description: "Set the time of day to a preset, or let it run by itself with auto (a full day, dawn to dusk to night).",
            example: "auto 20 at=dawn",
            usage: `&lt;${timeOptions.join("|")}|auto&gt; [sun=r,g,b] [fogColor=r,g,b|none] [fogMult=N] [sky=0-1] [stars=0-1] [glow=0-1] [at=0-1|dawn|noon|dusk...] [seconds=N]<br>presets: ${timeOptions.join(", ")}<br>auto [minutes]: a day that runs by itself (default ${WeatherState.DEFAULT_DAY_MINUTES} minutes long), starting at=...<br>at: where the sun is (${Object.keys(WeatherState.phaseNames).join(", ")}, or 0-1)<br>daylight=-1..1: the season for auto (0 is an equinox, positive means longer days)<br>linger=N: how long sunrise, sunset and twilight last in auto (1 is their real length, 2-3 makes them linger)`,
            options: timeOptions.concat(["auto"]),
            permissionLevel: adminLevel,
            inputType: ["string"],
            executeClient: ({ player, opts, mentions }) => {},
            executeServer: ({ player, opts, mentions }) => {
                var result = WeatherState.parseTimeSet(opts);
                if (!result.ok) return feedback(player, result.error);

                var time = result.value;
                var previous = WeatherState.sanitizeTime(ctx.room.gameOptions.plugins.time).auto;
                if (time.auto) {
                    //keep the current point in the day unless at= said otherwise; seq tells clients to jump to it
                    if (previous && !/\bat=/i.test(opts)) time.auto.phase = previous.phase;
                    time.auto.seq = (previous ? previous.seq : 0) + 1;
                    timeAutoState.set(ctx.room, { last: Date.now() });
                } else {
                    timeAutoState.delete(ctx.room);
                };
                ctx.room.gameOptions.plugins.time = time;

                var text = time.auto ? `Time is now automatic - a day lasts ${time.auto.minutes} minutes.` : `Time has been updated to ${time.preset}.${previous ? " (automatic time turned off)" : ""}`;
                ctx.room.notify(text, 5);
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
                if (time.auto) {
                    var now = WeatherRender.autoPhaseNow();
                    return feedback(player, `time: auto - a day lasts ${time.auto.minutes} minutes, it's about ${WeatherState.phaseName(now, time.daylight, time.linger)} (${Math.round(now * 100)}% through the day, sun ${Math.round(WeatherState.sunElevation(now, time.daylight))} degrees)`);
                };
                feedback(player, `time: ${time.preset} (sun=${time.sun.join(",")} fogColor=${time.fogColor ? time.fogColor.join(",") : "map"} fogMult=${time.fogMult} sky=${time.sky} stars=${time.stars} glow=${time.glow})`);
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
        data.defaultOptions.plugins.weatherCycle = { enabled: false, snow: false }; //a gametype can turn this on to get weather that drifts by itself
    },

    // Server-only: keeps the automatic day's clock current, so anyone who joins (or any other settings sync)
    // gets roughly the right point in the day. Clients run their own clock between syncs.
    timeAutoTick(room) {
        var time = WeatherState.sanitizeTime(room.gameOptions.plugins.time);
        if (!time.auto) return;
        var state = timeAutoState.get(room) || { last: Date.now() };
        var now = Date.now();
        time.auto.phase = Math.round((((time.auto.phase + (now - state.last) / (time.auto.minutes * 60000)) % 1) + 1) % 1 * 10000) / 10000;
        state.last = now;
        timeAutoState.set(room, state);
        room.gameOptions.plugins.time = time; //no sync here: clients already know the day is running
    },

    // Server-only: while automatic weather is on, pick the next stretch of weather whenever the last
    // one has run its course. Timing lives server-side only; clients just see ordinary weather changes.
    cycleTick(room) {
        var cycle = WeatherState.sanitizeCycle(room.gameOptions.plugins.weatherCycle);
        if (!cycle.enabled) return;

        var state = weatherCycleState.get(room) || { nextAt: 0 };
        if (Date.now() < state.nextAt) return;

        var step = WeatherState.cycleStep(Math.random, cycle.snow);
        var weather = step.weather;
        weather.transitionSecs = step.transitionSecs;
        room.gameOptions.plugins.weather = WeatherState.sanitizeWeather(weather);
        state.nextAt = Date.now() + step.holdSecs * 1000;
        weatherCycleState.set(room, state);
        room.updateRoomParamsForClients();
    },

    // Server-only: lightning is a random process whose rate comes from the storm layer's
    // `lightning` part. metaLoop runs every 2s, so each tick strikes with the matching chance.
    metaLoop(data) {
        if (isClient) return;
        var room = data.this;

        this.cycleTick(room);
        this.timeAutoTick(room);

        var storm = WeatherState.sanitizeWeather(room.gameOptions.plugins.weather).storm;
        if (!storm.lightning) return;

        var chance = 1 - Math.exp(-storm.lightning * LIGHTNING_MAX_RATE * METALOOP_SECS);
        if (Math.random() < chance) {
            //every client draws the same bolt: the seed shapes it, angle + distance place it around each player
            var distance = Math.max(0, Math.min(255, storm.distance * (0.6 + Math.random() * 0.8))); //a byte on the wire
            var output = new Comm.Out();
            output.packInt8U(Comm.Code.doThunderStrike);
            output.packInt16U(Math.floor(Math.random() * 65536)); //seed
            output.packInt8U(Math.floor(Math.random() * 256)); //angle, 0-255 around the full circle
            output.packInt8U(Math.round(distance)); //blocks
            room.sendToAll(output, null, "doThunderStrike");
            plugins.emit('thunderStrike', { room, distance }); //for other plugins to react to (the zombies surge on it)
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
        data.soundsList.push(["sound/ambiance/rain.mp3", "rain", { preload: false }]);

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

    // back to the main menu: nothing weather-related should keep sounding
    leaveGame(data) {
        if (isServer) return;
        WeatherRender.reset();
        WeatherRender.disposePrecip();
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
