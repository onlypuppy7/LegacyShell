//basic
import fs from 'node:fs';
import path from 'node:path';
//plugin: autorestartnotifications
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import events, { defaultEvents } from '#events';
//

export const PluginMeta = {
    identifier: "autorestartnotifications",
    name: 'Auto Restart Notifications',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Sends notifications to everyone ingame warning of imminent auto restarts', //displayed when loading
    descriptionLong: 'Sends notifications to everyone ingame warning of imminent auto restarts',
    legacyShellVersion: 383, //legacy shell version, can be found in /versionEnum.txt, or just on the homescreen
};

export var pluginInstance = null;

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        pluginInstance = this;

        this.initNotifies();

        this.plugins.on('game:metaLoop', this.metaLoop.bind(this));
    };
    
    metaLoop(data) {
        let restartTime = ss.config.restartTime;
        let now = Date.now();
        let timeLeft = restartTime - now;

        let ctx = data.this;

        console.log('Time left: ' + timeLeft);

        this.notifies.forEach((notify) => {
            if (notify.time >= timeLeft && !notify.executed) {
                console.log('Sending notify: ' + notify.message);
                notify.executed = true;
                ctx.notify(notify.message); //dont worry about it sending multiple times, since there arent any players loaded in it all goes down the toilet anyway
            };
        });
    };

    initNotifies() {
        this.notifies = [
            {
                time: 30 * 60 * 1000,
                message: 'Notice: Daily restart of server in 30 minutes',
                executed: false
            },
            {
                time: 15 * 60 * 1000,
                message: 'Notice: Daily restart of server in 15 minutes',
                executed: false
            },
            {
                time: 10 * 60 * 1000,
                message: 'Notice: Daily restart of server in 10 minutes',
                executed: false
            },
            {
                time: 5 * 60 * 1000,
                message: 'Notice: Daily restart of server in 5 minutes',
                executed: false
            },
            {
                time: 1 * 60 * 1000,
                message: 'Notice: Daily restart of server in 1 minute',
                executed: false
            },
            {
                time: 30 * 1000,
                message: 'Notice: Daily restart of server in 30 seconds',
                executed: false
            },
            {
                time: 10 * 1000,
                message: 'Notice: Daily restart of server in 10 seconds',
                executed: false
            },
            {
                time: 5 * 1000,
                message: 'Notice: Daily restart of server in 5 seconds',
                executed: false
            },
            {
                time: 0,
                message: 'Server is restarting now',
                executed: false
            }
        ];
    };
};