const fs = require('fs');
const path = require('path');
const terser = require('terser');

async function getProjectRoot() { //stupid
    const { findUp } = await import('find-up');
    return findUp('package.json', { cwd: __dirname });
}

(async () => {
    try {
        const projectRoot = await getProjectRoot();

        if (!projectRoot) {
            console.error('Could not find the root of the project.');
            process.exit(1);
        };

        const rootDir = path.dirname(projectRoot);

        const sourcePath = path.join(rootDir, 'client', 'src', 'shellshock.min.js');
        const destinationPath = path.join(rootDir, 'store', 'modified', 'src', 'shellshock.min.js');

        const destinationDir = path.dirname(destinationPath);
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        };

        const sourceCode = fs.readFileSync(sourcePath, 'utf8');

        const result = await terser.minify(sourceCode);

        if (result.error) {
            console.error('Minification failed:', result.error);
        } else {
            fs.writeFileSync(destinationPath, result.code, 'utf8');
            console.log(`Minified file saved to ${destinationPath}`);
        };
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();
