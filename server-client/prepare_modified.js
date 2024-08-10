const fs = require('fs');
const path = require('path');
const terser = require('terser');

const rootDir = path.resolve(__dirname);

const destinationPath = path.join(rootDir, 'store', 'client-modified', 'src', 'shellshock.min.js');
const destinationDir = path.dirname(destinationPath);
if (!fs.existsSync(destinationDir)) {
    fs.mkdirSync(destinationDir, { recursive: true });
};

const sourceCode = fs.readFileSync(path.join(rootDir, 'src', 'client-static', 'src', 'shellshock.min.js'), 'utf8'); //server-client\src\client-static\src\shellshock.min.js

console.log("Minifying/obfuscating shellshock.min.js...");
terser.minify(sourceCode).then(result => {
    if (result.error) {
        console.error('Minification failed:', result.error);
    } else {
        fs.writeFileSync(destinationPath, result.code, 'utf8');
        console.log(`Minified file saved to ${destinationPath}`);
    }
}).catch(error => {
    console.error('An error occurred during minification:', error);
});