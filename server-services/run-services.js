//ss object
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');
const log = require('../src/coloured-logging.js');
//libraries
const WebSocket = require('ws');
//other scripts

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


let port = ss.config.services.port || 13371;
const wss = new WebSocket.Server({ port: port });

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.send('Welcome to the WebSocket server!');

    ws.on('message', (message) => {
        console.log(`Received:`, message);
        
        const jsonString = message.toString('utf8');
        
        const jsonObject = JSON.parse(jsonString);
        
        console.log(jsonObject);

        ws.send(`Server received: ${message}`);
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });
});

console.log('WebSocket server is running on ws://localhost:'+port);
