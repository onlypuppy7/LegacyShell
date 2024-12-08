//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: preparing modified
import crypto from 'node:crypto';
import UglifyJS from 'uglify-js';
import extendMath from '#math';
import { prepareBabylons } from '#prepare-babylons';
import { cacheModified } from '#stampsGenerator';
import { devlog } from '#isClientServer';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss, misc } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

async function prepareModified() {
    let startTimestamp = Date.now();

    try {
        await Promise.all([
            prepareBabylons(path.join(ss.rootDir, 'server-client', 'store', 'client-modified', 'models')),
            modifyFiles(),
        ]);
        log.success('All prepareModified promises resolved in ' + (Date.now() - startTimestamp) + 'ms');
    } catch (error) {
        log.error('One of the prepareModified promises rejected:', error);
    };
};

async function modifyFiles() {
    log.info('\nGenerating modified files (eg minifying shellshock.min.js)...');

    const sourceShellJsPath = path.join(ss.currentDir, 'src', 'client-static', 'src', 'shellshock.min.js');
    const destinationShellJsPath = path.join(ss.currentDir, 'store', 'client-modified', 'src', 'shellshock.min.js');

    const sourceServersJsPath = path.join(ss.currentDir, 'src', 'client-static', 'src', 'servers.js');
    const destinationServersJsPath = path.join(ss.currentDir, 'store', 'client-modified', 'src', 'servers.js');

    const sourceHtmlPath = path.join(ss.currentDir, 'src', 'client-static', 'index.html');
    const destinationHtmlPath = path.join(ss.currentDir, 'store', 'client-modified', 'index.html');

    const sourceEditorJsPath = path.join(ss.currentDir, 'src', 'client-static', 'editor', 'js', 'mapEdit.js');
    const destinationEditorJsPath = path.join(ss.currentDir, 'store', 'client-modified', 'editor', 'js', 'mapEdit.js');

    const skyboxesPath = path.join(ss.currentDir, 'src', 'client-imgs', 'img', 'skyboxes');

    const hashes = {};

    function checkAndCreateDir (dir) {
        const dirPath = path.dirname(dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        };
    };

    checkAndCreateDir(destinationShellJsPath);
    checkAndCreateDir(destinationEditorJsPath);

    try {
        let code = {};

        code.serversJs = fs.readFileSync(sourceServersJsPath, 'utf8');
        code.serversJs = code.serversJs.replace(/LEGACYSHELLSERVICESPORT/g, ss.config.services.port || "13371");
        code.serversJs = code.serversJs.replace(/LEGACYSHELLWEBSOCKETPORT/g, ss.config.game.port || "13372");
        code.serversJs = code.serversJs.replace(/LEGACYSHELLSERVICESSERVER/g, ss.config.client.servicesURL || "wss://services.legacy.onlypuppy7.online:443");
        code.serversJs = code.serversJs.replace(/LEGACYSHELLSERVERS/g, ss.cache.servers || "[{ name: 'LegacyShell', address: 'matchmaker.legacy.onlypuppy7.online:443' }]");

        await plugins.emit('serversJs', { ss, code });

        fs.writeFileSync(destinationServersJsPath, code.serversJs, 'utf8');
        console.log(`servers.js copied and modified to ${destinationServersJsPath}`);

        var fileBuffer = fs.readFileSync(destinationServersJsPath);
        var hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SERVERJSHASH = hashSum.digest('hex');

        await plugins.emit('hashes', { ss, hashes });
        log.italic(`SHA-256 hash of the modified SERVERJS: ${hashes.SERVERJSHASH}`);

        var pluginInsertion = {};
        pluginInsertion.stringBefore = "";
        pluginInsertion.stringAfter = "";
        pluginInsertion.files = [];
    
        await plugins.emit('pluginSourceInsertion', { this: this, ss, pluginInsertion });
    
        pluginInsertion.files.forEach((file)=>{
            if (file.insertBefore) {
                if (file.position === "before") {
                    pluginInsertion.stringBefore += `${file.insertBefore}`;
                } else {
                    pluginInsertion.stringAfter += `${file.insertBefore}`;
                };
            };
            if (file.filepath) {
                var fileContent = fs.readFileSync(path.join(file.filepath), 'utf8');
                fileContent = misc.prepareForClient(fileContent);
                console.log(`[PLUGIN] Inserting ${file.filepath} into shellshock.min.js...`);
                if (file.position === "before") pluginInsertion.stringBefore += `\n${fileContent}\n\n`;
                else pluginInsertion.stringAfter += `\n${fileContent}\n\n`;
            };
            if (file.insertAfter) {
                if (file.position === "before") {
                    pluginInsertion.stringBefore += `${file.insertAfter}`;
                } else {
                    pluginInsertion.stringAfter += `${file.insertAfter}`;
                };
            };
        });

        code.sourceJs = fs.readFileSync(sourceShellJsPath, 'utf8');
        code.mapEditorJs = fs.readFileSync(sourceEditorJsPath, 'utf8');

        async function doReplacements(replacements) {
            await plugins.emit('doReplacements', { this: this, ss, replacements, code });

            await replacements.forEach(async (replacement) => {
                var insertion = replacement.file ? misc.hashtagToString(replacement.file) : replacement.insertion;
                var name = replacement.file ? replacement.file.replace("#", "") + ".js" : replacement.name || replacement.pattern.toString();
    
                await plugins.emit('doReplacementsLoop', { this: this, ss, replacement, code, insertion, name });

                if (replacement.pattern.test(code.sourceJs)) {
                    log.italic(`Inserting ${name} into shellshock.min.js...`);
                    code.sourceJs = code.sourceJs.replace(replacement.pattern, insertion);
                };
                if (replacement.pattern.test(code.mapEditorJs)) {
                    log.italic(`Inserting ${name} into mapEdit.js...`);
                    code.mapEditorJs = code.mapEditorJs.replace(replacement.pattern, insertion);
                };
            });
        };

        const skyboxes = [
            // "classic",
            // "classic+mountains",
            ...fs.readdirSync(skyboxesPath),
        ];

        skyboxes.sort();

        const replacementsBefore = [
            { pattern: /LEGACYSHELLPLUGINSBEFORE/g, insertion: pluginInsertion.stringBefore },
            { pattern: /LEGACYSHELLPLUGINSAFTER/g, insertion: pluginInsertion.stringAfter },

            { pattern: /LEGACYSHELLVERSION/g, insertion: `'${ss.packageJson.version}'` },
            { pattern: /LEGACYSHELLDEVMODE/g, insertion: ss.config.devlogs ? "true" : "false" },
            { pattern: /LEGACYSHELLPERMSCONFIG/g, insertion: JSON.stringify(ss.permissions) },

            { pattern: /LEGACYSHELLSKYBOXES/g, insertion: JSON.stringify(skyboxes) },

            { pattern: /LEGACYSHELLCOMM/g, file: "#comm" },
            { pattern: /LEGACYSHELLPLAYERCONSTRUCTOR/g, file: "#player" },
            { pattern: /LEGACYSHELLCATALOG/g, file: "#catalog" },
            { pattern: /LEGACYSHELLCONSTANTS/g, file: "#constants" },
            { pattern: /LEGACYSHELLGAMETYPES/g, file: "#gametypes" },
            { pattern: /LEGACYSHELLCOLLIDER/g, file: "#collider" },
            { pattern: /LEGACYSHELLMATHEXTENSIONS/g, file: "#math" },
            { pattern: /LEGACYSHELLBULLETS/g, file: "#bullets" },
            { pattern: /LEGACYSHELLGUNS/g, file: "#guns" },
            { pattern: /LEGACYSHELLLOADING/g, file: "#loading" },
            { pattern: /LEGACYSHELLSTRINGWIDTH/g, file: "#stringWidth" },
            { pattern: /LEGACYSHELLCENSOR/g, file: "#censor" },
            { pattern: /LEGACYSHELLPOOL/g, file: "#pool" },
            { pattern: /LEGACYSHELLMUNITIONSMANAGER/g, file: "#munitionsManager" },
            { pattern: /LEGACYSHELLITEMMANAGER/g, file: "#itemManager" },
            { pattern: /LEGACYSHELLPERMISSIONS/g, file: "#permissions" },
            { pattern: /LEGACYSHELLAPOLLO/g, file: "#apollo" },
            { pattern: /LEGACYSHELLPICKUPS/g, file: "#items" },
            { pattern: /LEGACYSHELLPLUGINMANAGER/g, file: "#plugins" },
            { pattern: /LEGACYSHELLISCLIENTSERVER/g, file: "#isClientServer" },
            { pattern: /LEGACYSHELLEVENTS/g, insertion: JSON.stringify(ss.events) },

            { pattern: /LEGACYSHELLZIPTIMES/g, insertion: (String(misc.getLastSavedTimestamp(path.join(ss.currentDir, 'store', 'client-modified', 'models', 'models.zip')))+String(misc.getLastSavedTimestamp(path.join(ss.currentDir, 'store', 'client-modified', 'models', 'map.zip')))) },
            { pattern: /LEGACYSHELLMAPZIPTIMESTAMP/g, insertion: misc.getLastSavedTimestamp(path.join(ss.currentDir, 'store', 'client-modified', 'models', 'map.zip')) },
            { pattern: /LEGACYSHELLSTAMPSPNG/g, insertion: misc.getLastSavedTimestamp(path.join(ss.currentDir, 'store', 'client-modified', 'img', 'stamps.png')) },
        ];

        await plugins.emit('replacementsBefore', { this: this, ss, code, replacementsBefore });

        await doReplacements(replacementsBefore);

        if (ss.config.client.iif) { // unexposes variables to the client. see: console cracker
            log.bold('Wrapping shellshock.min.js in an IIFE...');
            code.sourceJs = `(()=>{\n${code.sourceJs}\n})();`
        };

        extendMath(Math);

        if (ss.config.client.minify) {
            log.italic("Minifying/obfuscating shellshock.min.js...");

            await plugins.emit('minificationBefore', { this: this, ss, code, UglifyJS });

            var result = {};

            if (!plugins.cancel) {
                result = UglifyJS.minify(code.sourceJs);

                await plugins.emit('minificationAfter', { this: this, ss, code, result });

                if (result.error) {
                    throw new Error(`Minification failed: ${result.error}`);
                };

                if (result.code === undefined) {
                    throw new Error("Minification resulted in undefined code.");
                };

                code.sourceJs = result.code;
                log.bold(`Minified shellshock.min.js`);
            };
        } else {
            log.bold(`Skipped minification (config set).`);
            await plugins.emit('minificationSkipped', { this: this, ss, code });
        };

        if (plugins.type === "client") {
            await new Promise(resolve => {
                const check = () => cacheModified ? resolve() : setTimeout(check, 100);
                check(); devlog("cacheModified", cacheModified);
            });
        };

        const replacementAfter = [
            { pattern: /LEGACYSHELLITEMS/g, insertion: ss.cache.items },
            { pattern: /LEGACYSHELLMINMAPS/g, insertion: ss.cache.maps },

            { pattern: /LEGACYSHELLSTANDARDVERTEXSHADER/g, insertion: `\n\`${fs.readFileSync(path.join(ss.rootDir, 'src', 'shaders', 'standardVertexShader.glsl'), 'utf8')}\n\`` },
            { pattern: /LEGACYSHELLSTANDARDPIXELSHADER/g, insertion: `\n\`${fs.readFileSync(path.join(ss.rootDir, 'src', 'shaders', 'standardPixelShader.glsl'), 'utf8')}\n\`` },

            { pattern: /LEGACYSHELLBABYLON/g, insertion: `\n${fs.readFileSync(path.join(ss.currentDir, 'src', 'data', 'babylon.js'))}\n` },
        ];

        await plugins.emit('replacementsAfter', { ss, replacementAfter, code });

        await doReplacements(replacementAfter);

        fs.writeFileSync(destinationShellJsPath, code.sourceJs, 'utf8');
        log.bold(`shellshock.min.js copied and modified to ${destinationShellJsPath}`);

        fs.writeFileSync(destinationEditorJsPath, code.mapEditorJs, 'utf8');
        log.bold(`mapEdit.js copied and modified to ${destinationEditorJsPath}`);

        fileBuffer = fs.readFileSync(destinationShellJsPath);
        hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SHELLSHOCKMINJSHASH = hashSum.digest('hex');
        log.italic(`SHA-256 hash of the minified SHELLSHOCKMINJS: ${hashes.SHELLSHOCKMINJSHASH}`);
        await plugins.emit('hashes', { ss, hashes });

        code.htmlContent = fs.readFileSync(sourceHtmlPath, 'utf8');
        code.htmlContent = code.htmlContent.replace(/SERVERJSHASH/g, hashes.SERVERJSHASH);
        code.htmlContent = code.htmlContent.replace(/SHELLSHOCKMINJSHASH/g, hashes.SHELLSHOCKMINJSHASH);
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLVERSION/g, ss.packageJson.version);
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLEXTVERSION/g, `${ss.packageJson.version} (${ss.versionHash}, ${ss.versionEnum})`);
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLDISCORDSERVER/g, ss.config.client.discordServer); //outdated method
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLGITHUB/g, ss.config.client.githubURL);
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLSYNCURL/g, ss.config.client.sync_server);
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLCLIENTURL/g, ss.config.client.this_url);
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLCONFIG/g, ss.distributed_config.replace(/\n/g, '<br>'));
        code.htmlContent = code.htmlContent.replace(/LEGACYSHELLFAQ/g, fs.readFileSync(path.join(ss.currentDir, 'src', 'client-static', 'faq.html'), 'utf8'));

        await plugins.emit('htmlContent', { ss, code });

        fs.writeFileSync(destinationHtmlPath, code.htmlContent, 'utf8');
        log.bold(`index.html copied and modified to ${destinationHtmlPath}`);
    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    };
};

export default prepareModified;
