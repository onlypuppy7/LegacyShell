//ss object
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const log = require('../src/coloured-logging.js');
//libraries
const express = require('express');
//other scripts
const { prepareModified } = require('./prepare-modified.js');

//storage
fs.mkdirSync(path.join(__dirname, 'store'), { recursive: true });
//##### START CREATE SS OBJECT
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
//ss.log
ss.log = log;
ss.log.green("Created ss object!");
//##### END CREATE SS OBJECT

try {
    ss.log.blue('Generating modified files (eg minifying shellshock.min.js)...');
    prepareModified(ss);
} catch (error) {
    console.error('Modification failed:', error);
    process.exit(1);
};

const app = express();
const port = ss.config.client.port || 13370;

app.use(express.static(path.join(__dirname, 'store', 'client-modified'))); //server-client\store\client-modified
app.use(express.static(path.join(__dirname, 'src', 'client-static'))); //server-client\src\client-static

app.listen(port, () => {
    ss.log.success(`Server is running on http://localhost:${port}`);
});