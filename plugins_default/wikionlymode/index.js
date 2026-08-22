import fs from 'node:fs';
import path from 'node:path';
import Config from 'puppyconfig';
import { REASONS, DEFAULT_REASON } from './reasons.js';
import { renderUnavailablePage } from './unavailablePage.js';

export const PluginMeta = {
    identifier: "wikionlymode",
    name: 'Wiki Only Mode',
    author: 'onlypuppy7 (+Claude)',
    version: '1.0.0',
    descriptionShort: 'Takes the client offline while keeping the wiki and services reachable',
    descriptionLong: 'Swaps the site\'s index page for a "currently unavailable" notice (with a selectable reason) while /wiki and the services connection stay up. Toggled via store/config.jsonc - see the admin plugin, which surfaces this file automatically.',
    legacyShellVersion: 600,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        const configPath = path.join(thisDir, 'store', 'config.jsonc');

        // puppyconfig only preserves comments that were ALREADY in the file when it's parsed
        // (comment-json attaches them to the parsed result, then re-emits them on save) - it has
        // no way to attach a comment to a plain `defaultConfig` object, so the listing of valid
        // `reason` values has to be written into the file directly, once, before Config ever
        // touches it. After that, puppyconfig loads/re-saves this file (comment included) exactly
        // like any other .jsonc it manages.
        if (!fs.existsSync(configPath)) {
            fs.mkdirSync(path.dirname(configPath), { recursive: true });
            const reasonList = Object.keys(REASONS).join(', ');
            fs.writeFileSync(configPath, [
                '{',
                '    // enabled: whether wiki-only mode is currently active (swaps "/" for the unavailable page)',
                `    // reason: which message to show - one of: ${reasonList} (see reasons.js)`,
                '    "enabled": false,',
                `    "reason": "${DEFAULT_REASON}"`,
                '}',
                '',
            ].join('\n'), 'utf8');
        };

        this.config = new Config({
            configPath,
            logLoad: false,
            logSave: false,
            defaultConfig: {
                enabled: false,
                reason: DEFAULT_REASON,
            },
        });

        this.plugins.on('client:onStartServer', this.onStartServer.bind(this));
    };

    onStartServer(data) {
        const app = data.app;

        // Registered here specifically because this event fires before the closed-mode gate and
        // before the normal static mounts (see start-client.js) - so this middleware gets first
        // look at every request, the same way legacythemes/legacyshellcore's onStartServer static
        // mounts do. Only intercepts `/` and `/index.html` (literally replacing index.html, per
        // the original request) - everything else, including /wiki and the shared /img assets
        // this page itself needs, falls through to next() untouched.
        app.use((req, res, next) => {
            if (!this.config.enabled) return next();
            if (req.path !== '/' && req.path !== '/index.html') return next();

            const reason = REASONS[this.config.reason] || REASONS[DEFAULT_REASON];
            res.status(503).send(renderUnavailablePage(reason));
        });
    };
};
