import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const storeFolder = path.join(__dirname, '..', 'store');
const configPath = path.join(storeFolder, 'config.yaml');
const defaultConfigPath = path.join(__dirname, 'defaultconfig.yaml');

if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, copying from defaultconfig.yaml...');
    fs.mkdirSync(storeFolder, { recursive: true });
    fs.copyFileSync(defaultConfigPath, configPath);
    console.log('local config.yaml created successfully.');
} else {
    console.log('Your LegacyShell server environment has already been initialized. You do not need to run this script.');
}
