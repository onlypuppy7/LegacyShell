const fs = require('fs');
const path = require('path');
const UglifyJS = require('uglify-js');
const crypto = require('crypto');

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

        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSHATIDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-hats.json'), 'utf8'));
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSSTAMPIDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-stamps.json'), 'utf8'));
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSEGGK47IDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-eggk47.json'), 'utf8'));
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSDOZENGAUGEIDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-dozengauge.json'), 'utf8'));
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSCSG1IDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-csg1.json'), 'utf8'));
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSRPEGGIDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-rpegg.json'), 'utf8'));
        sourceCode = sourceCode.replace(/LEGACYSHELLITEMSCLUCK9MMIDS/g, fs.readFileSync(path.join(ss.rootDir, 'src', 'items', 'items-cluck9mm.json'), 'utf8'));

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
        serversJs = serversJs.replace(/LEGACYSHELLWEBSOCKETPORT/g, ss.config.websocket.port || "13372");

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

        fs.writeFileSync(destinationHtmlPath, htmlContent, 'utf8');
        console.log(`index.html copied and modified to ${destinationHtmlPath}`);

    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    }
}

module.exports = { prepareModified };