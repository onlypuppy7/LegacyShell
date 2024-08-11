const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'store', 'config.yaml');
const defaultConfigPath = path.join(__dirname, 'src', 'defaultconfig.yaml');

if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, copying from defaultconfig.yaml...');
    fs.copyFileSync(defaultConfigPath, configPath);
    console.log('config.yaml created successfully.');
};

const config = yaml.load(fs.readFileSync(configPath, 'utf8'));