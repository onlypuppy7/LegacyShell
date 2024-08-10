const fs = require('fs');
const path = require('path');
const terser = require('terser');
const crypto = require('crypto');

const rootDir = path.resolve(__dirname);

const sourceJsPath = path.join(rootDir, 'src', 'client-static', 'src', 'shellshock.min.js');
const destinationJsPath = path.join(rootDir, 'store', 'client-modified', 'src', 'shellshock.min.js');

const sourceHtmlPath = path.join(rootDir, 'src', 'client-static', 'index.html');
const destinationHtmlPath = path.join(rootDir, 'store', 'client-modified', 'index.html');

const hashes = {};

const destinationJsDir = path.dirname(destinationJsPath);
if (!fs.existsSync(destinationJsDir)) {
    fs.mkdirSync(destinationJsDir, { recursive: true });
};

(async () => {
    try {
        const sourceCode = fs.readFileSync(sourceJsPath, 'utf8');
        console.log("Minifying/obfuscating shellshock.min.js...");

        const result = await terser.minify(sourceCode);

        if (result.error) {
            console.error('Minification failed:', result.error);
            return;
        };

        fs.writeFileSync(destinationJsPath, result.code, 'utf8');
        console.log(`Minified file saved to ${destinationJsPath}`);

        const fileBuffer = fs.readFileSync(destinationJsPath);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        hashes.SHELLSHOCKMINJSHASH = hashSum.digest('hex');
        console.log(`SHA-256 hash of the minified SHELLSHOCKMINJS: ${hashes.SHELLSHOCKMINJSHASH}`);

        let htmlContent = fs.readFileSync(sourceHtmlPath, 'utf8');

        htmlContent = htmlContent.replace(/SHELLSHOCKMINJSHASH/g, hashes.SHELLSHOCKMINJSHASH);

        fs.writeFileSync(destinationHtmlPath, htmlContent, 'utf8');
        console.log(`index.html copied and modified to ${destinationHtmlPath}`);

    } catch (error) {
        console.error('An error occurred during the file processing:', error);
    };
})();
