const fs = require('fs');
const path = require('path');
const terser = require('terser');
const crypto = require('crypto');
const rootDir = path.resolve(__dirname);
const packageJson = require(path.join(rootDir, '..', 'package.json'));

const sourceShellJsPath = path.join(rootDir, 'src', 'client-static', 'src', 'shellshock.min.js');
const destinationShellJsPath = path.join(rootDir, 'store', 'client-modified', 'src', 'shellshock.min.js');

const sourceServersJsPath = path.join(rootDir, 'src', 'client-static', 'src', 'servers.js');
const destinationServersJsPath = path.join(rootDir, 'store', 'client-modified', 'src', 'servers.js');

const sourceHtmlPath = path.join(rootDir, 'src', 'client-static', 'index.html');
const destinationHtmlPath = path.join(rootDir, 'store', 'client-modified', 'index.html');

const hashes = {};

const destinationJsDir = path.dirname(destinationShellJsPath);
if (!fs.existsSync(destinationJsDir)) {
    fs.mkdirSync(destinationJsDir, { recursive: true });
};

(async () => {
    try {
        const sourceCode = fs.readFileSync(sourceShellJsPath, 'utf8');
        console.log("Minifying/obfuscating shellshock.min.js...");

        const result = await terser.minify(sourceCode);

        if (result.error) {
            console.error('Minification failed:', result.error);
            return;
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
        htmlContent = htmlContent.replace(/LEGACYSHELLVERSION/g, packageJson.version);

        fs.writeFileSync(destinationHtmlPath, htmlContent, 'utf8');
        console.log(`index.html copied and modified to ${destinationHtmlPath}`);

    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    };
})();
