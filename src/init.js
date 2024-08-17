import fs from 'node:fs';
import path from 'node:path';

const storeFolder = path.join(import.meta.dirname, '..', 'store');
const configPath = path.join(storeFolder, 'config.yaml');
const defaultConfigPath = path.join(import.meta.dirname, 'defaultconfig.yaml');

if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, copying from defaultconfig.yaml...');
    fs.mkdirSync(storeFolder, { recursive: true });
    fs.copyFileSync(defaultConfigPath, configPath);
    console.log('local config.yaml created successfully.');
} else console.log('your legacyshell client has already been initialized. you do not need to run this script.');