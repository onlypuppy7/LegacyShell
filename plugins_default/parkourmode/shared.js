//legacyshell: basic
import { devlog, isClient, isServer } from "#constants";
import Comm from "#comm";
//legacyshell: plugins
import { plugins } from '#plugins';
import { setGameOptionInMentions } from "#permissions";
//

export const ParkourModePlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ParkourModePlugin)");

        this.plugins = pluginManager;

        this.plugins.on('game:LegacyShellOnMessage', this.LegacyShellOnMessage.bind(this));
        this.plugins.on('game:GameTypesInit', this.GameTypesInit.bind(this));
        this.plugins.on('game:permissionsAfterSetup', this.permissionsAfterSetup.bind(this));
        this.plugins.on('game:loadSounds', this.loadSounds.bind(this));
        this.plugins.on('game:onStandOnTile', this.onStandOnTile.bind(this));
        this.plugins.on('game:requestRespawn', this.requestRespawn.bind(this));
        this.plugins.on('game:resetGamePlayer', this.resetGamePlayer.bind(this));
        this.plugins.on('game:roundEndSFX', this.roundEndSFX.bind(this));
    },

    LegacyShellOnMessage(data) {
        var input = data.input;
        var cmd = data.cmd;
        var cmdName = data.cmdName;

        let didSomething = true;

        // console.log("LegacyShellOnMessage", cmdName, cmd);

        switch (cmd) {
            case Comm.Code.parkourScore:
                var playerId = input.unPackInt8U();
                var number = input.unPackInt8U();

                devlog("parkourScore,,,", playerId, number);

                var player = players[playerId]

                if (player) {
                    if (number === 255) {
                        this.setGoal(player);
                    } else {
                        this.setCheckpoint(player, number);
                    };
                };
                break;
            default:
                didSomething = false;
                break;
        };

        if (didSomething) plugins.cancel = true; //dont set it directly! otherwise you could interfere with other plugins.
    },

    sendParkourScore(player, number) {
        if (isClient) return; //yea

        devlog("sendParkourScore fr?!!?!?", player.id, number, Comm.Code.parkourScore);

        var output = new Comm.Out();
        output.packInt8U(Comm.Code.parkourScore);
        output.packInt8U(player.id);
        output.packInt8U(number);

        player.room.sendToOthers(output, player.id, "parkourScore");
    },

    GameTypesInit(data) {
        // var ItemTypes = data.ItemTypes;
        var GameTypes = data.GameTypes;

        GameTypes.push({
            shortName: "Parkour",
            longName: "Parkour",
            codeName: "parkour",
            mapPool: "Parkour",
            options: {
                timedGame: {
                    enabled: true,
                    roundLength: 300, //5 mins in seconds
                    spawnDuringInterval: true,
                },
                knockbackModifier: [
                    0.2, //ffa
                    0.2, //team1
                    0.2, //team2
                ],
                damageModifier: [
                    0, //ffa
                    0, //team1
                    0, //team2
                ],
                itemsEnabled: [ //itemType enum, spawn per how much surface area, minimum
                    //no items!
                ],
                startingGrenades: 3,
                rearmOnRespawn: false,
            }
        });
    },
    
    permissionsAfterSetup: function (data) {
        Comm.Add("parkourScore"); //this is an arbitrary way to add it in reality.

        console.log("registering sample command... (sample plugin)");
        var ctx = data.this;

        //erm
    },

    loadSounds: function (data) {
        const additionalSounds = [
            ["sound/parkour/checkpoint1.mp3", "parkour.checkpoint1"],
            ["sound/parkour/checkpoint2.mp3", "parkour.checkpoint2"],
            ["sound/parkour/checkpoint3.mp3", "parkour.checkpoint3"],
            ["sound/parkour/checkpoint4.mp3", "parkour.checkpoint4"],
            ["sound/parkour/checkpoint5.mp3", "parkour.checkpoint5"],
            ["sound/parkour/goal.mp3", "parkour.goal"],
            ["sound/parkour/gerudo.mp3", "parkour.gerudo"],
            ["sound/parkour/roundEnd.mp3", "parkour.roundEnd"],
        ];
    
        data.soundsList.push(...additionalSounds);

        devlog("parkour plugin loaded sounds list:", data.soundsList);
    },

    roundEndSFX(data) {
        playSoundIndependent2D("parkour.roundEnd");
        plugins.cancel = true;
    },

    resetGamePlayer(data) {
        var player = data.player;

        player.highestCheckpoint = 0;
        player.reachedGoal = false;
        player.respawnCheckpoint = null;

        devlog("parkour plugin reset player", player.name);
    },

    addCheckpointText(player, number) {
        var str = '<span style="color: ' + teamColors.text[player.team] + '">' + player.name + '</span> reached <span style="color: yellow">Checkpoint ' + number + '</span>';
        4 < (killEl.innerHTML.match(/<br>/g) || []).length && (killEl.innerHTML = killEl.innerHTML.substr(killEl.innerHTML.search("<br>") + 4)), killEl.innerHTML += str + "<br>"
    },

    addGoalText(player) {
        var str = '<span style="color: ' + teamColors.text[player.team] + '">' + player.name + '</span> reached <span style="color: yellow">the Goal!</span>';
        4 < (killEl.innerHTML.match(/<br>/g) || []).length && (killEl.innerHTML = killEl.innerHTML.substr(killEl.innerHTML.search("<br>") + 4)), killEl.innerHTML += str + "<br>"
    },

    requestRespawn(data) {
        var player = data.player;
        var spawnPoint = data.spawnPoint;
        
        devlog(spawnPoint, player.respawnCheckpoint);

        if (player.respawnCheckpoint) {
            spawnPoint.x = player.respawnCheckpoint.x;
            spawnPoint.y = player.respawnCheckpoint.y;
            spawnPoint.z = player.respawnCheckpoint.z;
        };
    },

    setCheckpoint(player, number, mesh = {}) {
        if (number > player.highestCheckpoint) {
            player.highestCheckpoint = number;
            
            // player.respawnCheckpoint = {
            //     x: Math.floor(player.x) + .5,
            //     y: Math.floor(player.y),
            //     z: Math.floor(player.z) + .5,
            // };
            
            player.respawnCheckpoint = JSON.parse(JSON.stringify(player.checkpointPositions[number][0]));
            player.respawnCheckpoint.x += 0.5;
            player.respawnCheckpoint.z += 0.5;

            player.scoreKill();
            devlog(player.name, "got checkpoint", mesh?.name, player.respawnCheckpoint);

            if (player.actor) {
                let soundName = "parkour.checkpoint"+number;
                var pos = new BABYLON.Vector3(player.x, player.y + (0.32 * player.modifiers.scale), player.z); //repeated code. bad. bad!

                if (player.id == meId) {
                    playSoundIndependent2D(soundName);
                    notify("Reached Checkpoint "+number+"!", 1e3);
                } else {
                    playSoundIndependent(soundName, {pos});
                };
                
                rebuildPlayerList();
                this.addCheckpointText(player, number);
            } else {
                this.sendParkourScore(player, number);
                if (!player.gameOptions.cheatsEnabled) player.client.addEggsViaServices(5);
            };
        };
    },

    setGoal(player) {
        if (!player.reachedGoal) {
            player.reachedGoal = true;

            player.scoreKill();
            player.scoreKill();
            player.scoreKill();

            if (player.actor) {
                if (player.id == meId) {
                    playSoundIndependent2D("parkour.goal");
                    notify("Reached the end! Teleporting to beginning...", 2e3);
                };
                rebuildPlayerList();
                this.addGoalText(player);
            } else {
                this.sendParkourScore(player, 255);
                player.client.addEggsViaServices(10);
            };
            setTimeout(() => {
                player.highestCheckpoint = 0;
                player.respawnCheckpoint = null;

                if (!player.actor) {
                    let pos = player.room.getBestSpawn(player);
                    player.x = pos.x;
                    player.y = pos.y;
                    player.z = pos.z;
                };
            }, 2e3);
            setTimeout(() => { //cos reasons
                player.reachedGoal = false;
            }, 4e3);
        };
    },

    onStandOnTile(data) {
        var mesh = data.mesh;
        var player = data.this;

        if (player.highestCheckpoint == undefined) player.highestCheckpoint = 0;

        //i forgot halfway thru making this... why am i making this??
        if (player.checkpointPositions == undefined) {
            let data = player.minMap.data;
            player.checkpointPositions = {};
            let blocks = Object.keys(data);
            for (let blockType of blocks) {
                if (blockType.includes("checkpoint")) {
                    let number = blockType.split(".")[1].replace("checkpoint", "");
                    let positions = data[blockType];
                    console.log(number, positions);
                    player.checkpointPositions[number] = positions;
                };
            };
        };

        if (player.canJump() && player.playing && (isClient ? (player.id == meId && !betweenRounds) : true)) { //is on the floor and not like boogieing or something
            // console.log(mesh.name);
            switch (mesh.name) {
                case "checkpoint1":
                    this.setCheckpoint(player, 1, mesh);
                    break;
                case "checkpoint2":
                    this.setCheckpoint(player, 2, mesh);
                    break;
                case "checkpoint3":
                    this.setCheckpoint(player, 3, mesh);
                    break;
                case "checkpoint4":
                    this.setCheckpoint(player, 4, mesh);
                    break;
                case "checkpoint5":
                    this.setCheckpoint(player, 5, mesh);
                    break;
                case "goal":
                    this.setGoal(player);
                    break;
            };
        };
    },
};

if (isClient) ParkourModePlugin.registerListeners(plugins);