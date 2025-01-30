//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: playercountnotifications
//legacyshell: logging
import log from '#coloured-logging';
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

export var pluginInstance = null;

var servicesInfo = {};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.storeFolder = path.join(this.thisDir, 'store');
        if (!fs.existsSync(this.storeFolder)) {
            fs.mkdirSync(this.storeFolder, { recursive: true });
        };

        this.config = this.getConfig();

        this.plugins.on('services:sendServicesInfo', this.sendServicesInfo.bind(this));
    };

    async sendServicesInfo(data) {
        servicesInfo = data.servicesInfo;
    };

    async getInfo(shop, mondayStart, eventsMonday, dev = false) {
        var msgs = [
        ];

        return this.compress2kChars(msgs);
    };

    async setUpShopAvailableBeforeApply(data) {
        var shop = data.shop;
        var mondayStart = data.mondayStart;
        var eventsMonday = data.eventsMonday;

        if (this.config.last < mondayStart) {
            (async () => {
                console.log('Sending shop update');
        
                var msgsPub = await this.getInfo(shop, mondayStart, eventsMonday);
                var msgsDev = await this.getInfo(shop, mondayStart, eventsMonday, true);
    
                console.log(msgsDev);
    
                if (
                    await this.sendWebhook(msgsPub, this.config.webhook) &&
                    await this.sendWebhook(msgsDev, this.config.webhookdev, true)
                ) {
                    this.config.last = Date.now();

                    this.saveConfig(this.config);
                };
            })();
        };

    };

    async sendWebhook(msgs, webhook,  dev = false) { //sends messages via webhook. waits for each message to be sent before sending the next. retries if failed
        if (webhook == '' || !webhook) {
            log.warning('[playercountnotifications] No webhook set. Please set a webhook in the config file.');
            return false;
        };

        for (var i = 0; i < msgs.length; i++) {
            console.log(dev, "Sending msg:", i, "of", msgs.length);
            try {
                await fetch(webhook, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        username: `LegacyShell Shop Notifications${dev ? " [dev]" : ""}` ,
                        avatar_url: "https://cdn.onlypuppy7.online/legacyshell/shop.png?v=2",
                        content: msgs[i],
                    }),
                });
                log.green('[playercountnotifications] Sent message', i, 'to webhook', webhook);
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                log.warning('[playercountnotifications] Failed to send message', msgs[i], 'to webhook', webhook, error);
            };
        };

        log.green('[playercountnotifications] Sent all messages to webhook', webhook);
        return true;
    };

    getConfig() {
        const configPath = path.join(this.storeFolder, 'playercountnotifications.json');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({
                last: 0,
                webhooks: [''],
                ping: '@ping',
            }, null, 4));
            log.beige('[playercountnotifications] Config file created at', configPath);
        };
        return JSON.parse(fs.readFileSync(configPath));
    };

    saveConfig(config) {
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