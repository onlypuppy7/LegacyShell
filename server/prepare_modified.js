const fs = require('fs');
const path = require('path');
const terser = require('terser');

// Function to dynamically import find-up
async function getProjectRoot() {
    const { findUp } = await import('find-up');
    return findUp('package.json', { cwd: __dirname });
}

(async () => {
    try {
        // Find the root directory of the project
        const projectRoot = await getProjectRoot();

        if (!projectRoot) {
            console.error('Could not find the root of the project.');
            process.exit(1);
        }

        // Get the directory of the found package.json (which is the root of the project)
        const rootDir = path.dirname(projectRoot);

        // Define the source and destination paths relative to the project root
        const sourcePath = path.join(rootDir, 'client', 'src', 'shellshock.min.js');
        const destinationPath = path.join(rootDir, 'store', 'modified', 'src', 'shellshock.min.js');

        // Ensure the destination directory exists
        const destinationDir = path.dirname(destinationPath);
        if (!fs.existsSync(destinationDir)) {
            fs.mkdirSync(destinationDir, { recursive: true });
        }

        // Read the source file
        const sourceCode = fs.readFileSync(sourcePath, 'utf8');

        // Minify the source code
        const result = await terser.minify(sourceCode);

        if (result.error) {
            console.error('Minification failed:', result.error);
        } else {
            // Write the minified code to the destination
            fs.writeFileSync(destinationPath, result.code, 'utf8');
            console.log(`Minified file saved to ${destinationPath}`);
        }
    } catch (error) {
        console.error('An error occurred:', error);
    }
})();
