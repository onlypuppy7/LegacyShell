//ss object
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
//libraries
const express = require('express');
//other scripts
const { prepareModified } = require('./prepare-modified.js');

//START CREATE SS OBJECT
const ss = {};
//ss.config
const configPath = path.join(__dirname, '..', 'store', 'config.yaml');
if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, make sure you have run the main js first...');
    process.exit(1);
};
ss.config = yaml.load(fs.readFileSync(configPath, 'utf8'));
//ss.rootDir
ss.rootDir = path.resolve(ss.rootDir || __dirname);
//ss.packageJson
const packageJsonPath = path.join(ss.rootDir, '..', 'package.json');
ss.packageJson = require(packageJsonPath);
//END CREATE SS OBJECT

try {
    console.log('Generating modified files (eg minifying shellshock.min.js)...');
    // console.log(ss);
    prepareModified(ss);
    // execSync('node server-client/prepare-modified.js', { stdio: 'inherit' });
} catch (error) {
    console.error('Modification failed:', error);
};

const app = express();
const port = ss.config.client.port || 13370;

app.use(express.static(path.join(__dirname, 'store', 'client-modified'))); //server-client\store\client-modified
app.use(express.static(path.join(__dirname, 'src', 'client-static'))); //server-client\src\client-static

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
