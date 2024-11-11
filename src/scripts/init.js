console.log("##################################################################");
console.log("# Note: make sure you have run 'npm install' before this script! #");
console.log("##################################################################\n");

//basic
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
//legacyshell: basic
import log from '#coloured-logging';
import misc from '#misc';
//legacyshell: database
import sqlite3 from 'sqlite3'; //db
import util from 'node:util';
import recs from '#recordsManagement';
//legacyshell: ss
import { ss } from '#misc';
//

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const storeFolder = path.join(import.meta.dirname, '..', '..', 'store');
const configFolderPath = path.join(storeFolder, 'config');
const defaultConfigFolderPath = path.join(import.meta.dirname, '..', 'defaultconfig');

function copyYamlFiles(callback) {
    if (!fs.existsSync(configFolderPath)) {
        fs.mkdirSync(configFolderPath, { recursive: true });
    };

    fs.readdir(defaultConfigFolderPath, (err, files) => {
        if (err) {
            log.red('Error reading default config folder:', err);
            return;
        };

        const yamlFiles = files.filter(file => path.extname(file) === '.yaml');
        
        if (yamlFiles.length === 0) {
            callback();
            return;
        };

        let pending = yamlFiles.length;

        yamlFiles.forEach(file => {
            const srcPath = path.join(defaultConfigFolderPath, file);
            const destPath = path.join(configFolderPath, file);

            if (fs.existsSync(destPath)) {
                log.dim(`Skipping ${file}, it already exists.`);
                pending--;
                if (pending === 0) callback();
                return;
            }

            fs.copyFile(srcPath, destPath, err => {
                if (err) {
                    log.red(`Error copying file ${file}:`, err);
                } else {
                    log.green(`Copied ${file} to config folder.`);
                };

                pending--;
                if (pending === 0) {
                    callback();
                };
            });
        });
    });
};

const allYamlPath = path.join(configFolderPath, 'all.yaml');

function askVerboseLogging(callback) {
    log.bold('\nEnable verbose logging?');
    rl.question('(y/n): ', answer => {
        const verbose = answer.trim().toLowerCase() === 'y';
        
        fs.readFile(allYamlPath, 'utf8', (err, data) => {
            if (err) {
                log.red('Error reading all.yaml:', err);
                return callback();
            };

            const updatedData = data.replace(/verbose:\s*(true|false)/, `verbose: ${verbose}`);

            fs.writeFile(allYamlPath, updatedData, 'utf8', (err) => {
                if (err) {
                    log.red('Error writing to all.yaml:', err);
                } else {
                    log.green(`Verbose logging ${verbose ? 'enabled' : 'disabled'}.`);
                };

                callback();
            });
        });
    });
};

function askDevLogging(callback) {
    log.bold('\nEnable dev logging (appears in browser logs)?');
    rl.question('(y/n): ', answer => {
        const devlogs = answer.trim().toLowerCase() === 'y';
        
        fs.readFile(allYamlPath, 'utf8', (err, data) => {
            if (err) {
                log.red('Error reading all.yaml:', err);
                return callback();
            };

            const updatedData = data.replace(/devlogs:\s*(true|false)/, `devlogs: ${devlogs}`);

            fs.writeFile(allYamlPath, updatedData, 'utf8', (err) => {
                if (err) {
                    log.red('Error writing to all.yaml:', err);
                } else {
                    log.green(`Devlogs ${devlogs ? 'enabled' : 'disabled'}.`);
                };

                callback();
            });
        });
    });
};

function askAuthServer(callback) {
    misc.instantiateSS(import.meta, process.argv, undefined, true);

    // Initialize the database
    const servicesStoreFolder = path.join(ss.rootDir, 'server-services', 'store');

    fs.mkdirSync(servicesStoreFolder, { recursive: true });

    const db = new sqlite3.Database(path.join(servicesStoreFolder, 'LegacyShellData.db'));
    
    recs.initDB(db);
    
    log.green('Account DB set up!\n');

    Object.assign(ss, {
        // Database promise wrappers
        runQuery: util.promisify(db.run.bind(db)),
        getOne: util.promisify(db.get.bind(db)),
        getAll: util.promisify(db.all.bind(db)),
    });

    log.info('\nIf just you wish to run LegacyShell on your one machine, select yes. If you otherwise want to act as a mirror/extra region/other standalone component, select no.');
    log.bold('\n\nAdd the game server as an authed server?');
    
    rl.question('(y/n): ', async (answer) => {
        const addAuthServer = answer.trim().toLowerCase() === 'y';

        if (addAuthServer) {
            try {
                await ss.runQuery(`
                    INSERT INTO game_servers (name)
                    VALUES ('local')
                `);

                log.green('Game server added as an authed server.');
    
                const server = await ss.getOne(`SELECT auth_key FROM game_servers WHERE name = 'local'`);
                const authKey = server.auth_key;

                const gameYamlPath = path.join(configFolderPath, 'game.yaml');
            
                fs.readFile(gameYamlPath, 'utf8', (err, data) => {
                    if (err) {
                        log.red('Error reading game.yaml:', err);
                        return;
                    };
            
                    if (data.includes("AUTH_KEY")) {
                        const updatedData = data.replace("AUTH_KEY", authKey);
                
                        fs.writeFile(gameYamlPath, updatedData, 'utf8', (err) => {
                            if (err) {
                                log.red('Error writing to game.yaml:', err);
                            } else {
                                console.log("authKey", authKey)
                                log.green('Updated game.yaml with auth_key: '+authKey);
                            };
                        });
                    } else {
                        log.warning("Can't set auth key as is already set in game.yaml - open the file and do this manually");
                    };
                });
            } catch (error) {
                log.red('Error adding game server to the database:', error);
            };
        } else {
            log.muted("Auth servers not modified.");
        };

        callback();
    });
};

copyYamlFiles(() => {
    askVerboseLogging(() => {
        askDevLogging(() => {
            askAuthServer(() => {
                log.success("\nLegacyShell has been set up for use!");

                rl.close();
            });
        });
    });
});