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
    ws.on('message', (message) => {
        const jsonString = message.toString('utf8');
        const msg = JSON.parse(jsonString);
        
        console.log(msg);

        //client cmds
        switch (msg.cmd) {
            case "validateLogin":
                ws.send(JSON.stringify({
                    kills: 20,
                    deaths: 10,
                    streak: 100,
                    currentBalance: 1337,
                    ownedItemIds: [
                        1001, 1002, 1003, //hats
                        2001, 2002, 2003, 2039, //stamps
                        3100, 3101, //eggk47 / soldier (0)
                        3600, 3601, //dozengauge / scrambler (1)
                        3400, 3401, //csg1 / freeranger (2)
                        3800, 3801, //eggsploder / rpegg (3)
                        3000, 3001, //cluck9mm / pistol
                    ],
                    loadout: {
                        primaryId: [3100, 3601, 3400, 3800], //each corresponds to the classIdx
                        secondaryId: [3000, 3001, 3000, 3000], //each gun gets their own pistol combo
                        classIdx: 1, //selected gun
                        colorIdx: 2, //selected egg colour
                        hatId: 1001,
                        stampId: 2002,
                    },
                    session: "lmao",
                    version: 20, //idk what this does
                    upgradeProductId: null,
                    upgradeMultiplier: null,
                    upgradeAdFree: null,
                    upgradeExpiryDate: null,
                    upgradeIsExpired: null,
                    maybeSchoolEmail: false,
                }));
                break;
            default:
                break;
        };

        //server cmds (priveleged)

    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error: ${error}`);
    });
});

console.log('WebSocket server is running on ws://localhost:'+port);
