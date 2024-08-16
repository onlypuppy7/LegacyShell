import fs from 'node:fs';
import path from 'node:path';

const configPath = path.join(import.meta.dirname, 'store', 'config.yaml');
const defaultConfigPath = path.join(import.meta.dirname, 'src', 'defaultconfig.yaml');

if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, copying from defaultconfig.yaml...');
    fs.mkdirSync(path.join(import.meta.dirname, 'store'), { recursive: true });
    fs.copyFileSync(defaultConfigPath, configPath);
    console.log('local config.yaml created successfully.');
} else console.log('start script already ran once. it [currently] has no further function.')