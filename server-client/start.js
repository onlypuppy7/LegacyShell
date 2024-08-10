const express = require('express');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const configPath = path.join(__dirname, 'config.yaml');
const defaultConfigPath = path.join(__dirname, 'server', 'defaultconfig.yaml');

if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, copying from defaultconfig.yaml...');
    fs.copyFileSync(defaultConfigPath, configPath);
    console.log('config.yaml created successfully.');
};

const config = yaml.load(fs.readFileSync(configPath, 'utf8'));

try {
    console.log('Minifying shellshock.min.js...');
    execSync('node server/prepare_modified.js', { stdio: 'inherit' });
} catch (error) {
    console.error('Minification failed:', error);
};

const app = express();
const port = config.server.port || 13370;

app.use(express.static(path.join(__dirname, 'store', 'modified')));
app.use(express.static(path.join(__dirname, 'client')));

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
