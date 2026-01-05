//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: samplecommand
import { DeadInternetPlugin } from './shared.js';
import Comm from '#comm';
import { devlog, iteratePlayers } from '#constants';
//

export const PluginMeta = {
    identifier: "deadinternet",
    name: 'DeadInternet',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Adds bot players to your game', //displayed when loading
    descriptionLong: 'Adds bot players to your game',
    legacyShellVersion: 459, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        DeadInternetPlugin.registerListeners(this.plugins);
        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        
        this.plugins.on('game:metaLoop', this.metaLoopHook.bind(this));
        this.plugins.on('game:clientPackSyncLoop', this.clientPackSyncLoopHook.bind(this));
        this.plugins.on('game:clientInit', this.clientInit.bind(this));
        this.plugins.on('game:joinPlayer', this.joinPlayer.bind(this));
        this.plugins.on('game:clientInstantiatePlayer', this.clientInstantiatePlayer.bind(this));
        this.plugins.on('game:clientUpdateLoadoutEnd', this.clientUpdateLoadoutEnd.bind(this));
        this.plugins.on('game:onPlayerDeath', this.onPlayerDeath.bind(this));
        this.plugins.on('game:updateBefore', this.updateBefore.bind(this));
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: `\nconsole.log("inserting before... (${PluginMeta.name})");`,
            filepath: path.join(this.thisDir, 'shared.js'),
            insertAfter: `\nconsole.log("inserting after... (${PluginMeta.name})!");`,
            position: 'before'
        });
    };

    metaLoopHook(data) {
        var ctx = data.this;
    };

    clientPackSyncLoopHook(data) {
        var ctx = data.this;
        var state = data.state;
        var output = data.output;

    };

    clientInit(data) {
        // console.log("clientInit", PluginMeta.identifier, data.info);
    }

    joinPlayer(data) {
        // console.log("joinPlayer", PluginMeta.identifier, data.info);
    }

    clientInstantiatePlayer(data) {
        // console.log("clientInstantiatePlayer loadout", PluginMeta.identifier, data.this.loadout);
    }

    clientUpdateLoadoutEnd(data) {
        // console.log("clientUpdateLoadoutEnd loadout", PluginMeta.identifier, data.this.loadout);
    }

    async onPlayerDeath(data) {
        const player = data.player;
        for (const bot of DeadInternetBots) {
            if (bot.player === player && bot.onDeath) {
                await bot.onDeath(data);
            }
        }
    }

    async updateBefore(data) {
        const player = data.player;
        for (const bot of DeadInternetBots) {
            if (bot.player === player && bot.onUpdate) {
                await bot.onUpdate(data);
            }
        }
    }
};

export var DeadInternetBots = [];

export class DeadInternetBot {
    constructor(room, opts = {}) {
        this.room = room;
        this.opts = {
            id: null,
            nickname: "DeadInternetBot",
            wsId: null,
            // primary_item_id: 0,
            // secondary_item_id: 0,
            useOOBid: true,
        };
        Object.assign(this.opts, opts);
        DeadInternetBots.push(this);
    }

    async init() {
        this.client = await this.room.joinPlayer({
            id: null,
            nickname: "DeadInternetBot",
            wsId: null,
            primary_item_id: 0,
            secondary_item_id: 0,
            useOOBid: true,
        });

        this.client.noConnectionTimeout = true;

        await this.client.waitUntilReady();

        this.player = this.client.player;

        console.log("client.initiated", this.client.initiated);
        console.log("client.room ??", !!this.client?.room);

        await this.client.clientReady();
        await this.respawn();
    }

    async respawn() {
        await this.client.requestRespawn();
    }

    getDistanceToPlayer(otherPlayer) {
        const dx = otherPlayer.x - this.player.x;
        const dy = otherPlayer.y - this.player.y;
        const dz = otherPlayer.z - this.player.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const yaw = Math.atan2(dx, dz);
        const pitch = -Math.asin(dy / distance);

        return {
            distance,
            dx, dy, dz,
            yaw, pitch
        };
    }

    getNearestPlayer() {
        let nearestPlayer = null;
        let nearestDistance = Infinity;

        iteratePlayers((otherPlayer) => {
            if (otherPlayer === this.player) return;

            const distance = this.getDistanceToPlayer(otherPlayer).distance;
            // console.log("DeadInternetBot distance to", otherPlayer.name, distance.toFixed(2));
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestPlayer = otherPlayer;
            }
        });

        return nearestPlayer;
    }

    lookAtPlayer(targetPlayer) {
        const { yaw, pitch } = this.getDistanceToPlayer(targetPlayer);

        this.player.yaw = yaw;
        this.player.pitch = pitch;

        // console.log("DeadInternetBot looking at", targetPlayer.name, "yaw:", yaw.toFixed(2), "pitch:", pitch.toFixed(2));
    }
};