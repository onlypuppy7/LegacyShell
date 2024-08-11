const fs = require('fs');
const path = require('path');
const UglifyJS = require('uglify-js');
const crypto = require('crypto');

function prepareModified(ss) {
    console.log("ss");
    console.log(ss);

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
        const sourceCode = fs.readFileSync(sourceShellJsPath, 'utf8');
        console.log("Minifying/obfuscating shellshock.min.js...");

        const result = UglifyJS.minify(sourceCode);

        if (result.error) {
            throw new Error(`Minification failed: ${result.error}`);
        };

        if (result.code === undefined) {
            throw new Error("Minification resulted in undefined code.");
        };

        fs.writeFileSync(destinationShellJsPath, result.code, 'utf8');
        console.log(`Minified file saved to ${destinationShellJsPath}`);

        let fileBuffer = fs.readFileSync(destinationShellJsPath);
        let hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SHELLSHOCKMINJSHASH = hashSum.digest('hex');
        console.log(`SHA-256 hash of the minified SHELLSHOCKMINJS: ${hashes.SHELLSHOCKMINJSHASH}`);

        let serversJs = fs.readFileSync(sourceServersJsPath, 'utf8');
        serversJs = serversJs.replace(/LEGACYSHELLSERVICESPORT/g, "13371");
        serversJs = serversJs.replace(/LEGACYSHELLWEBSOCKETPORT/g, "13372");

        fs.writeFileSync(destinationServersJsPath, serversJs, 'utf8');
        console.log(`servers.js copied and modified to ${destinationServersJsPath}`);

        fileBuffer = fs.readFileSync(destinationServersJsPath);
        hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SERVERJSHASH = hashSum.digest('hex');
        console.log(`SHA-256 hash of the modified SERVERJS: ${hashes.SERVERJSHASH}`);

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