//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: autoshopnotifications
import Table from 'easy-table';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const PluginMeta = {
    identifier: "autoshopnotifications",
    name: 'Auto Shop Notifications',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Sends messages to a webhook displaying this week\'s shop', //displayed when loading
    descriptionLong: 'Sends messages to a webhook displaying this week\'s shop',
    legacyShellVersion: 383, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

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

        this.plugins.on('services:setUpShopAvailableBeforeApply', this.setUpShopAvailableBeforeApply.bind(this));
    };

    setUpShopAvailableBeforeApply(data) {
        var shop = data.shop;
        var mondayStart = data.mondayStart;
        var eventsMonday = data.eventsMonday;

        var msgs = [
`#  LegacyShell Shop Update
## Week beginning <t:${mondayStart/1000}:F>
> Current running events:`
        ];
        eventsMonday.currentArray.forEach(event => {
            msgs.push(`> - ${event}`);
        });
        msgs.push('\nHere are the items available this week in the shop:');

        console.log('shop', shop);

        if (shop.temp && shop.temp.length > 0) {
            log.italic('[autoshopnotifications] Temp Event Items');
            msgs.push('### Temp Event Items');
            msgs.push(...this.createTable(shop.temp));
        };

        if (shop.tier3pool && shop.tier3pool.length > 0) {
            log.italic('[autoshopnotifications] Tier 3 Items');
            msgs.push("### This Week's Tier 3's");
            msgs.push(...this.createTable(shop.tier3pool));
        };

        if (shop.tier2pool && shop.tier2pool.length > 0) {
            log.italic('[autoshopnotifications] Tier 2 Items');
            msgs.push("### This Week's Tier 2's");
            msgs.push(...this.createTable(shop.tier2pool));
        };

        msgs.push(`### This Week's Tier 1 Chance\n||\`${shop.tier1chance}%\`||\n${this.config.ping}`);

        msgs = this.compress2kChars(msgs);

        console.log('msgs', msgs);

        this.sendWebhook(msgs);
    };

    async sendWebhook(msgs) { //sends messages via webhook. waits for each message to be sent before sending the next. retries if failed
        if (!this.config.webhook) {
            log.warning('[autoshopnotifications] No webhook set. Please set a webhook in the config file.');
            return;
        };

        const webhook = this.config.webhook;
        for (var i = 0; i < msgs.length; i++) {
            console.log("Sending msg:", i, "of", msgs.length);
            try {
                await fetch(webhook, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        content: msgs[i],
                    }),
                });
                log.green('[autoshopnotifications] Sent message', i, 'to webhook', webhook);
            } catch (error) {
                log.warning('[autoshopnotifications] Failed to send message', msgs[i], 'to webhook', webhook, error);
            };
        };
    };

    getConfig() {
        const configPath = path.join(this.storeFolder, 'autoshopnotifications.json');
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({
                last: 0,
                webhook: '',
                ping: '@ping',
            }, null, 4));
            log.beige('[autoshopnotifications] Config file created at', configPath);
        };
        return JSON.parse(fs.readFileSync(configPath));
    };

    saveConfig(config) {
        const configPath = path.join(this.storeFolder, 'config', 'autoshopnotifications.json');
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
        
    createTable(data) {
        var t = new Table
        
        data.forEach(function(item) {
            t.cell('Item ID', item.id)
            t.cell('Name', item.name)
            t.cell('Type', item.item_class || 'N/A')
            t.cell('Price', item.price)
            t.cell('Event', item.event || 'N/A')
            t.cell('Tag', item.sourceTag || 'N/A')
            t.newRow()
        });

        t.sort(['Item ID|asc']);
        t.sort(['Type|asc']);

        return this.splitBy2kChars(t.toString(), '```');
    };
};