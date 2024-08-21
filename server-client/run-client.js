import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import express from 'express';

import log from '../src/coloured-logging.js';
import prepareModified from './prepare-modified.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//storage
fs.mkdirSync(path.join(__dirname, 'store'), { recursive: true });

const configPath = path.join(__dirname, '..', 'store', 'config.yaml');
if (!fs.existsSync(configPath)) {
    console.log('config.yaml not found, make sure you have run the main js first...');
    process.exit(1);
};

const ss = {
    rootDir: path.resolve(__dirname),
    config: yaml.load(fs.readFileSync(configPath, 'utf8')),
    packageJson: JSON.parse(fs.readFileSync(path.join(path.resolve(__dirname), '..', 'package.json'), 'utf8')),
    log
};

ss.log.green("Created ss object!");

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
