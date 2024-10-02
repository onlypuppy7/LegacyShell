//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: preparing modified
import crypto from 'node:crypto';
import UglifyJS from 'uglify-js';
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

    const hashes = {};

    const destinationJsDir = path.dirname(destinationShellJsPath);
    if (!fs.existsSync(destinationJsDir)) {
        fs.mkdirSync(destinationJsDir, { recursive: true });
    };

    try {
        let sourceCode = fs.readFileSync(sourceShellJsPath, 'utf8');

        ss.log.italic("Inserting version into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLVERSION/g, ss.packageJson.version);
        ss.log.italic("Inserting item jsons into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMS/g, ss.cache.items); //akshually
        ss.log.italic("Inserting map jsons into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLMINMAPS/g, ss.cache.maps); //akshually
        ss.log.italic("Inserting babylon into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLBABYLON/g, fs.readFileSync(path.join(ss.currentDir, 'src', 'data', 'babylon.js')));
        ss.log.italic("Inserting devmode into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLDEVMODE/g, "true"); //drop in later

        const replacements = [
            { pattern: /LEGACYSHELLCOMM/g, file: "#comm" },
            { pattern: /LEGACYSHELLPLAYERCONSTRUCTOR/g, file: "#player" },
            { pattern: /LEGACYSHELLCATALOG/g, file: "#catalog" },
            { pattern: /LEGACYSHELLCONSTANTS/g, file: "#constants" },
            { pattern: /LEGACYSHELLCOLLIDER/g, file: "#collider" },
            { pattern: /LEGACYSHELLMATHEXTENSIONS/g, file: "#math" },
            { pattern: /LEGACYSHELLBULLETS/g, file: "#bullets" },
            { pattern: /LEGACYSHELLGRENADE/g, file: "#grenade" },
            { pattern: /LEGACYSHELLGUNS/g, file: "#guns" },
            { pattern: /LEGACYSHELLLOADING/g, file: "#loading" },
        ];
        
        replacements.forEach(replacement => {
            ss.log.italic(`Inserting ${replacement.file.replace("#", "")}.js into shellshock.min.js...`);
            sourceCode = sourceCode.replace(replacement.pattern, ss.misc.hashtagToString(replacement.file));
        });

        if (false) { // unexposes variables to the client. see: console cracker
            sourceCode = `(()=>{\n${sourceCode}\n})();`
        };

        if (ss.config.client.minify) {
            ss.log.italic("Minifying/obfuscating shellshock.min.js...");
            const result = UglifyJS.minify(sourceCode);

            if (result.error) {
                throw new Error(`Minification failed: ${result.error}`);
            };

            if (result.code === undefined) {
                throw new Error("Minification resulted in undefined code.");
            };

            fs.writeFileSync(destinationShellJsPath, result.code, 'utf8');
            console.log(`Minified file saved to ${destinationShellJsPath}`);
        } else {
            fs.writeFileSync(destinationShellJsPath, sourceCode, 'utf8');
            console.log(`Skipped minification (config set). Saved to ${destinationShellJsPath}`);
        };

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
        htmlContent = htmlContent.replace(/LEGACYSHELLDISCORDSERVER/g, ss.config.client.discordServer);
        htmlContent = htmlContent.replace(/LEGACYSHELLGITHUB/g, ss.config.client.githubURL);
        htmlContent = htmlContent.replace(/LEGACYSHELLSYNCURL/g, ss.config.client.sync_server);
        htmlContent = htmlContent.replace(/LEGACYSHELLCONFIG/g, ss.distributed_config.replace(/\n/g, '<br>'));

        fs.writeFileSync(destinationHtmlPath, htmlContent, 'utf8');
        console.log(`index.html copied and modified to ${destinationHtmlPath}`);

        delete ss.cache; //MEMORY LEAK FUCKING MI-Mi-mi-MITIGATED!!!
    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    }
}

export default prepareModified;