//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: preparing modified
import crypto from 'node:crypto';
import UglifyJS from 'uglify-js';
import extendMath from '#math';
//

let ss;

function setSS(newSS) {
    ss = newSS;
};

function prepareModified(ss) {
    const sourceShellJsPath = path.join(ss.currentDir, 'src', 'client-static', 'src', 'shellshock.min.js');
    const destinationShellJsPath = path.join(ss.currentDir, 'store', 'client-modified', 'src', 'shellshock.min.js');

    const sourceServersJsPath = path.join(ss.currentDir, 'src', 'client-static', 'src', 'servers.js');
    const destinationServersJsPath = path.join(ss.currentDir, 'store', 'client-modified', 'src', 'servers.js');

    const sourceHtmlPath = path.join(ss.currentDir, 'src', 'client-static', 'index.html');
    const destinationHtmlPath = path.join(ss.currentDir, 'store', 'client-modified', 'index.html');

    const sourceEditorJsPath = path.join(ss.currentDir, 'src', 'client-static', 'editor', 'js', 'mapEdit.js');
    const destinationEditorJsPath = path.join(ss.currentDir, 'store', 'client-modified', 'editor', 'js', 'mapEdit.js');

    const skyboxesPath = path.join(ss.currentDir, 'src', 'client-static', 'img', 'skyboxes');

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
        let sourceCode = fs.readFileSync(sourceShellJsPath, 'utf8');

        ss.log.italic("Inserting version into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLVERSION/g, ss.packageJson.version);
        ss.log.italic("Inserting item jsons into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMS/g, ss.cache.items); //akshually
        ss.log.italic("Inserting map jsons into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLMINMAPS/g, ss.cache.maps); //akshually
        ss.log.italic("Inserting devmode into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLDEVMODE/g, ss.config.devlogs ? "true" : "false");
        ss.log.italic("Inserting permissions into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLPERMSCONFIG/g, JSON.stringify(ss.permissions));

        const replacements = [
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
        ];

        replacements.forEach(replacement => {
            ss.log.italic(`Inserting ${replacement.file.replace("#", "")}.js into shellshock.min.js...`);
            sourceCode = sourceCode.replace(replacement.pattern, ss.misc.hashtagToString(replacement.file));
        });

        if (ss.config.client.iif) { // unexposes variables to the client. see: console cracker
            sourceCode = `(()=>{\n${sourceCode}\n})();`
        };

        var pluginInsertion = {};
        pluginInsertion.string = "";
        pluginInsertion.files = [];

        ss.plugins.emit('pluginSourceInsertion', { ss, pluginInsertion });

        pluginInsertion.files.forEach((file)=>{
            if (file.insertBefore) pluginInsertion.string += `${file.insertBefore}`;
            if (file.filepath) {
                var fileContent = fs.readFileSync(path.join(file.filepath), 'utf8');
                fileContent = ss.misc.prepareForClient(fileContent);
                pluginInsertion.string += `\n\n${fileContent}\n`;
            };
            if (file.insertAfter) pluginInsertion.string += `${file.insertAfter}`;
        });

        sourceCode = sourceCode.replace(/LEGACYSHELLPLUGINS/g, pluginInsertion.string);

        extendMath(Math);

        if (ss.config.client.minify) {
            ss.log.italic("Minifying/obfuscating shellshock.min.js...");

            const result = UglifyJS.minify(sourceCode);

            if (result.error) {
                throw new Error(`Minification failed: ${result.error}`);
            };

            if (result.code === undefined) {
                throw new Error("Minification resulted in undefined code.");
            };

            sourceCode = result.code;
            console.log(`Minified shellshock.min.js`);
        } else {
            console.log(`Skipped minification (config set).`);
        };

        ss.log.italic("Inserting standardVertexShader into shellshock.min.js...");
        const standardVertexShader = fs.readFileSync(path.join(ss.rootDir, 'src', 'shaders', 'standardVertexShader.glsl'), 'utf8');
            // .replace(/\n/g, '\\n')
            // .replace(/ {4}/g, '\\t');
        sourceCode = sourceCode.replace(/LEGACYSHELLSTANDARDVERTEXSHADER/g, `\n\`${standardVertexShader}\n\``);
        
        ss.log.italic("Inserting standardPixelShader into shellshock.min.js...");
        const standardPixelShader = fs.readFileSync(path.join(ss.rootDir, 'src', 'shaders', 'standardPixelShader.glsl'), 'utf8')
            // .replace(/\n/g, '\\n')
            // .replace(/ {4}/g, '\\t');
        sourceCode = sourceCode.replace(/LEGACYSHELLSTANDARDPIXELSHADER/g, `\n\`${standardPixelShader}\n\``);

        ss.log.italic("Inserting babylon into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLBABYLON/g, `\n${fs.readFileSync(path.join(ss.currentDir, 'src', 'data', 'babylon.js'))}\n`);
        console.log(`Saved shellshock.min.js to ${destinationShellJsPath}`);

        fs.writeFileSync(destinationShellJsPath, sourceCode, 'utf8');

        let fileBuffer = fs.readFileSync(destinationShellJsPath);
        let hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SHELLSHOCKMINJSHASH = hashSum.digest('hex');
        ss.log.italic(`SHA-256 hash of the minified SHELLSHOCKMINJS: ${hashes.SHELLSHOCKMINJSHASH}`);

        let serversJs = fs.readFileSync(sourceServersJsPath, 'utf8');
        serversJs = serversJs.replace(/LEGACYSHELLSERVICESPORT/g, ss.config.services.port || "13371");
        serversJs = serversJs.replace(/LEGACYSHELLWEBSOCKETPORT/g, ss.config.game.port || "13372");
        serversJs = serversJs.replace(/LEGACYSHELLSERVICESSERVER/g, ss.config.client.servicesURL || "wss://services.legacy.onlypuppy7.online:443");
        serversJs = serversJs.replace(/LEGACYSHELLSERVERS/g, ss.cache.servers || "[{ name: 'LegacyShell', address: 'matchmaker.legacy.onlypuppy7.online:443' }]");

        fs.writeFileSync(destinationServersJsPath, serversJs, 'utf8');
        console.log(`servers.js copied and modified to ${destinationServersJsPath}`);

        fileBuffer = fs.readFileSync(destinationServersJsPath);
        hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SERVERJSHASH = hashSum.digest('hex');
        ss.log.italic(`SHA-256 hash of the modified SERVERJS: ${hashes.SERVERJSHASH}`);

        let htmlContent = fs.readFileSync(sourceHtmlPath, 'utf8');
        htmlContent = htmlContent.replace(/SHELLSHOCKMINJSHASH/g, hashes.SHELLSHOCKMINJSHASH);
        htmlContent = htmlContent.replace(/LEGACYSHELLVERSION/g, ss.packageJson.version);
        htmlContent = htmlContent.replace(/LEGACYSHELLEXTVERSION/g, `${ss.packageJson.version} (${ss.versionHash}, ${ss.versionEnum})`);
        htmlContent = htmlContent.replace(/LEGACYSHELLDISCORDSERVER/g, ss.config.client.discordServer); //outdated method
        htmlContent = htmlContent.replace(/LEGACYSHELLGITHUB/g, ss.config.client.githubURL);
        htmlContent = htmlContent.replace(/LEGACYSHELLSYNCURL/g, ss.config.client.sync_server);
        htmlContent = htmlContent.replace(/LEGACYSHELLCLIENTURL/g, ss.config.client.this_url);
        htmlContent = htmlContent.replace(/LEGACYSHELLCONFIG/g, ss.distributed_config.replace(/\n/g, '<br>'));
        htmlContent = htmlContent.replace(/LEGACYSHELLFAQ/g, fs.readFileSync(path.join(ss.currentDir, 'src', 'client-static', 'faq.html'), 'utf8'));

        fs.writeFileSync(destinationHtmlPath, htmlContent, 'utf8');
        console.log(`index.html copied and modified to ${destinationHtmlPath}`);

        let mapEditorJs = fs.readFileSync(sourceEditorJsPath, 'utf8');
        mapEditorJs = mapEditorJs.replace(/LEGACYSHELLGAMETYPES/g, ss.misc.hashtagToString("gametypes"));
        mapEditorJs = mapEditorJs.replace(/LEGACYSHELLITEMS/g, ss.misc.hashtagToString("items"));
        mapEditorJs = mapEditorJs.replace(/LEGACYSHELLSKYBOXES/g, JSON.stringify(fs.readdirSync(skyboxesPath)));

        fs.writeFileSync(destinationEditorJsPath, mapEditorJs, 'utf8');
        console.log(`mapEdit.js copied and modified to ${destinationEditorJsPath}`);

        delete ss.cache; //MEMORY LEAK FUCKING MI-Mi-mi-MITIGATED!!!
    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    }
}

export default prepareModified;
