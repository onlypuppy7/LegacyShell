import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import UglifyJS from 'uglify-js';

function prepareModified(ss) {
    const sourceShellJsPath = path.join(ss.rootDir, 'src', 'client-static', 'src', 'shellshock.min.js');
    const destinationShellJsPath = path.join(ss.rootDir, 'store', 'client-modified', 'src', 'shellshock.min.js');

    const sourceServersJsPath = path.join(ss.rootDir, 'src', 'client-static', 'src', 'servers.js');
    const destinationServersJsPath = path.join(ss.rootDir, 'store', 'client-modified', 'src', 'servers.js');

    const sourceHtmlPath = path.join(ss.rootDir, 'src', 'client-static', 'index.html');
    const destinationHtmlPath = path.join(ss.rootDir, 'store', 'client-modified', 'index.html');

    const hashes = {};

    const destinationJsDir = path.dirname(destinationShellJsPath);
    if (!fs.existsSync(destinationJsDir)) {
        fs.mkdirSync(destinationJsDir, { recursive: true });
    };

    try {
        let sourceCode = fs.readFileSync(sourceShellJsPath, 'utf8');

        ss.log.italic("Inserting item jsons into shellshock.min.js...");
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMS/g, ss.items); //akshually
        delete ss.items; //MEMORY LEAK FUCKING MI-Mi-mi-MITIGATED!!!

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
        htmlContent = htmlContent.replace(/DISCORDSERVER/g, ss.config.discordServer);
        htmlContent = htmlContent.replace(/LEGACYSHELLSYNCURL/g, ss.config.client.sync_server);
        htmlContent = htmlContent.replace(/LEGACYSHELLCONFIG/g, ss.distributed_config.replace(/\n/g, '<br>'));

        fs.writeFileSync(destinationHtmlPath, htmlContent, 'utf8');
        console.log(`index.html copied and modified to ${destinationHtmlPath}`);

    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    }
}

export default prepareModified;