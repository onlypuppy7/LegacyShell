//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: playercountnotifications
//legacyshell: logging
import log from 'puppylog';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const PluginMeta = {
    identifier: "playercountnotifications",
    name: 'Player Count Notifications',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Sends messages to a webhook showing the current playercount', //displayed when loading
    descriptionLong: 'Sends messages to a webhook showing the current playercount',
    legacyShellVersion: 493, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

/* todo uh
make this run on game server
add thing for name (eg united eggdom)
make dev post gamecodes
k bye
*/

export var pluginInstance = null;

var gameInfo;

var msgPub;
var msgDev;

var highestPub = 0;
var highestPriv = 0;
var highestBoth = 0;

var serverName;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        if (plugins.type !== "game") {
            log.orange(`${PluginMeta.identifier} won't run on this server type (game only).`);
            return;
        };
        
        this.storeFolder = path.join(this.thisDir, 'store');
        if (!fs.existsSync(this.storeFolder)) {
            fs.mkdirSync(this.storeFolder, { recursive: true });
        };

        this.config = this.getConfig();
        // console.log(this.config)

        this.giveup = {};

        this.plugins.on('game:sendGameInfo', this.sendGameInfo.bind(this));
        this.plugins.on('game:requestConfigReceived', this.requestConfigReceived.bind(this));

        setInterval(()=>this.sendStuff(), this.config.sendInterval * 1e3);

        setTimeout(() => {
            highestPub = 0;
            highestPriv = 0;
            highestBoth = 0;
        }, 24 * 60 * 60e3); //in public instance is restarts anyway but why not.
    };

    async sendGameInfo(data) {
        gameInfo = data.gameInfo;
    };

    async getInfo(dev = false) {
        function formatUser (number) {
            return `${number} ${number === 1 ? "user" : "users"}`;
        };

        var msg = `## There ${gameInfo.playerCountTotal.both === 1 ? "is" : "are"} ${formatUser(gameInfo.playerCountTotal.both)} online (today's highest: ${highestBoth}).`;

        msg += `\n- ${formatUser(gameInfo.playerCountTotal.public)} in public lobbies (today's highest: ${highestPub}).`
        msg += `\n- ${formatUser(gameInfo.playerCountTotal.private)} in private lobbies, (today's highest: ${highestPriv}).`

        if (dev) {
            var rooms = [];

            for (let room of gameInfo.rooms) {
                if (room?.playerCount) rooms.push({
                    gameCode: room.gameCode,
                    privPublic: room.privPublic,
                    gameMode: room.gameMode,
                    playerCount: room.playerCount,
                    playerLimit: room.playerLimit,
                    mapName: room.mapName,
                    playerNames: room.playerNames,
                    usernames: room.usernames,
                });
            };

            msg += `\n## Active Games:\n\`\`\`${JSON.stringify(rooms, null, 2)}\`\`\``;
        };

        // console.log(gameInfo);

        return msg;
    };

    async sendStuff() {
        if (!gameInfo) return //log.dim("No gameInfo to make alerts.");

        if (gameInfo.playerCountTotal.both > highestBoth) highestBoth = gameInfo.playerCountTotal.both;
        if (gameInfo.playerCountTotal.public > highestPub) highestPub = gameInfo.playerCountTotal.public;
        if (gameInfo.playerCountTotal.private > highestPriv) highestPriv = gameInfo.playerCountTotal.private;

        let msgPubNew = await this.getInfo();
        let msgDevNew = await this.getInfo(true);

        // console.log(msgDev);

        if (
            (msgPub == msgPubNew || await this.sendWebhook(msgPubNew, this.config.webhooks)) &&
            (msgDev == msgDevNew || await this.sendWebhook(msgDevNew, this.config.webhooksDev, true))
        ) {
            this.config.last = Date.now();

            msgPub = msgPubNew;
            msgDev = msgDevNew;

            this.saveConfig();
        };
    };

    async sendWebhook(msgs, webhooks,  dev = false) { //sends messages via webhook. waits for each message to be sent before sending the next. retries if failed
        msgs = this.splitBy2kChars(msgs);

        for (const webhook of webhooks) {
            if (this.giveup[webhook]) return true;

            if (webhook == '' || !webhook) {
                log.warning('[playercountnotifications] No webhook set. Please set a webhook in the config file.');
                this.giveup[webhook] = true;
                return false;
            };
    
            for (var i = 0; i < msgs.length; i++) {
                // console.log(dev, "Sending msg:", i, "of", msgs.length);
                try {
                    await fetch(webhook, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            username: `LegacyShell Player Count (${serverName})${dev ? " [dev]" : ""}` ,
                            avatar_url: "https://cdn.onlypuppy7.online/legacyshell/playercount.png?v=1",
                            content: msgs[i],
                        }),
                    });
                    log.green('[playercountnotifications] Sent message', i + 1, 'of', msgs.length, 'to webhook', webhook);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                } catch (error) {
                    log.warning('[playercountnotifications] Failed to send message', msgs[i], 'to webhook', webhook, error);
                };
            };
    
            // log.green('[playercountnotifications] Sent all messages to webhook', webhook);
        };
        return true;
    };

    async requestConfigReceived (data) {
        var msg = data.msg;

        serverName = msg.yourServerName;
    };

    getConfig() {
        const configPath = path.join(this.storeFolder, 'playercountnotifications.json');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({
                last: 0,
                webhooks: [''],
                webhooksDev: [''],
                sendInterval: 15,
            }, null, 4));
            log.beige('[playercountnotifications] Config file created at', configPath);
        };
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    };

    saveConfig(config = this.config) {
        const configPath = path.join(this.storeFolder, 'playercountnotifications.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
    };

    splitBy2kChars(text, beforeAfter = '') {
        var splitText = text.split('\n');
        return this.compress2kChars(splitText, beforeAfter);
    };

    compress2kChars(texts, beforeAfter = '') { //retains order but combines those that are less than 2k chars
        var finalTexts = [];
        var currentText = beforeAfter;
        for (var i = 0; i < texts.length; i++) {
            if (currentText.length + texts[i].length > 1900) {
                finalTexts.push(currentText + beforeAfter);
                currentText = beforeAfter;
            };
            currentText += '\n' + texts[i];
        };
        finalTexts.push(currentText + beforeAfter);
        return finalTexts;
    };
};