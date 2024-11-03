//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//

let ss; //trollage. access it later.

const exported = {
    setSS: function (newSS) {
        ss = newSS;
    },
    initDB: (db) => {
        db.serialize(() => {
            //USERS
            db.run(`
                CREATE TABLE IF NOT EXISTS users (
                    account_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE,
                    password TEXT,
                    authToken TEXT,
                    kills INTEGER DEFAULT 0,
                    deaths INTEGER DEFAULT 0,
                    streak INTEGER DEFAULT 0,
                    currentBalance INTEGER DEFAULT 1000,
                    eggsSpent INTEGER DEFAULT 0,
                    ownedItemIds TEXT DEFAULT '[1001,1002,1003,1004,1005,1006,2001,2002,2003,2004,2005,2006,3100,3600,3400,3800,3000]',  -- Will store as JSON string
                    loadout TEXT DEFAULT '{"primaryId":[3100,3600,3400,3800],"secondaryId":[3000,3000,3000,3000],"classIdx":0,"colorIdx":0,"hatId":null,"stampId":null}',       -- Will store as JSON string
                    version INTEGER DEFAULT 1,
        
                    upgradeProductId INTEGER DEFAULT 0,
                    upgradeMultiplier INTEGER DEFAULT NULL,
                    upgradeAdFree BOOLEAN DEFAULT TRUE,
                    upgradeExpiryDate INTEGER DEFAULT 0,
        
                    maybeSchoolEmail INTEGER DEFAULT NULL,
                    adminRoles INTEGER DEFAULT 0,
                    dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
                    dateModified INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `);
        
            db.run(`
                CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            `);
        
            db.run(`
                CREATE INDEX IF NOT EXISTS idx_users_authToken ON users(authToken);
            `);
            
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_dateModified
                AFTER UPDATE ON users
                FOR EACH ROW
                BEGIN
                    UPDATE users SET dateModified = strftime('%s', 'now') WHERE account_id = OLD.account_id;
                END;
            `);
        
            //RATELIMITING
            db.run(`
                CREATE TABLE IF NOT EXISTS ip_requests (
                    ip TEXT PRIMARY KEY,
                    sensitive_count INTEGER DEFAULT 0,
                    regular_count INTEGER DEFAULT 0,
                    last_sensitive_reset INTEGER DEFAULT (strftime('%s', 'now')),
                    last_regular_reset INTEGER DEFAULT (strftime('%s', 'now'))
                )
            `);
        
            //SESSIONS
            db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
                session_id TEXT PRIMARY KEY,
                user_id INTEGER UNIQUE,
                ip_address TEXT,
                dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
                expires_at INTEGER
            )
            `);
        
            //ITEMS
            db.run(`
            CREATE TABLE IF NOT EXISTS items (
                id INTEGER PRIMARY KEY,
                name TEXT DEFAULT 'Unknown item',
                is_available BOOLEAN DEFAULT TRUE,
                price INTEGER DEFAULT 0,
                item_class TEXT DEFAULT 'Unknown class',
                item_type_id INTEGER DEFAULT 0,
                item_type_name TEXT DEFAULT 0,
                exclusive_for_class INTEGER,
                item_data TEXT DEFAULT '{"class":Eggk47,"meshName":"gun_eggk47"}',
                dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
                dateModified INTEGER DEFAULT (strftime('%s', 'now'))
            )
            `);
            
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_dateModified_items
                AFTER UPDATE ON items
                FOR EACH ROW
                BEGIN
                    UPDATE items SET dateModified = strftime('%s', 'now') WHERE id = OLD.id;
                END;
            `);
        
            //ITEMS (i removed some chars from ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 for ease of reading such as 0/O, 1/I)
            //i know this looks horrible, and it is. but it has to be done so that you can just insert stuff in a sql editor. please just accept this and move on w ur life.
            //remember to change the '31' value if you change the character set.
            db.run(`
            CREATE TABLE IF NOT EXISTS codes (
                key TEXT PRIMARY KEY DEFAULT (substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1) ||
                                           substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', abs(random()) % 31 + 1, 1)),
                item_ids TEXT DEFAULT '[]',
                eggs_given INTEGER DEFAULT 0,
                uses INTEGER DEFAULT 1,
                used_by TEXT DEFAULT '[]',
                dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
                dateModified INTEGER DEFAULT (strftime('%s', 'now'))
            )
            `);
            
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_dateModified_codes
                AFTER UPDATE ON codes
                FOR EACH ROW
                BEGIN
                    UPDATE codes SET dateModified = strftime('%s', 'now') WHERE key = OLD.key;
                END;
            `);
        
            //WIP! MAPS
            db.run(`
            CREATE TABLE IF NOT EXISTS maps (
                name TEXT PRIMARY KEY DEFAULT 'Unknown map',
                sun TEXT DEFAULT '{"direction":{"x":0.2,"y":1,"z":-0.3},"color":"#FFFFFF"}',
                ambient TEXT DEFAULT '#000000', --NOT USED!
                fog TEXT DEFAULT '{"density":0.1,"color":"#33334C"}', --NOT USED!
                data TEXT DEFAULT '{}',
                palette TEXT DEFAULT '[null,null,null,null,null,null,null,null,null,null]',
                render TEXT DEFAULT '{}', --NOT USED!
                width INTEGER DEFAULT -9999,
                height INTEGER DEFAULT -9999,
                depth INTEGER DEFAULT -9999,
                surfaceArea INTEGER DEFAULT 0,
                extents TEXT DEFAULT '{"x":{"max":0,"min":10000},"y":{"max":0,"min":10000},"z":{"max":0,"min":10000},"width":-9999,"height":-9999,"depth":-9999}',
                skybox TEXT DEFAULT '',
                modes TEXT DEFAULT '{"FFA":true,"Teams":true}',
                availability TEXT DEFAULT 'both',
                numPlayers INTEGER DEFAULT 18,
        
                dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
                dateModified INTEGER DEFAULT (strftime('%s', 'now'))
            )
            `);
            
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_dateModified_maps
                AFTER UPDATE ON maps
                FOR EACH ROW
                BEGIN
                    UPDATE items SET dateModified = strftime('%s', 'now') WHERE name = OLD.name;
                END;
            `);
        
            //GAME SERVERS
            //allows a server to make certain sensitive operations, such as adding eggs, retrieving user stats.
            //providing one of these auth keys also bypasses ratelimiting
            //also the cancer massive substring thing of doom yeah bitch im NOT sorry
            db.run(`
            CREATE TABLE IF NOT EXISTS game_servers (
                auth_key TEXT PRIMARY KEY DEFAULT (substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1)),
                name TEXT DEFAULT 'Unnamed server',
                address TEXT DEFAULT 'localhost:13372',
                dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
                dateModified INTEGER DEFAULT (strftime('%s', 'now'))
            )
            `);
            
            db.run(`
                CREATE TRIGGER IF NOT EXISTS update_dateModified_game_servers
                AFTER UPDATE ON game_servers
                FOR EACH ROW
                BEGIN
                    UPDATE game_servers SET dateModified = strftime('%s', 'now') WHERE name = OLD.name;
                END;
            `);
        });
    },
    insertItems: async (jsonDir = path.join(ss.currentDir, 'src', 'items')) => {
        const files = fs.readdirSync(jsonDir);

        for (const file of files) {
            if (path.extname(file) === '.json') {
                ss.log.beige(`Inserting: ${file}`);
                const filePath = path.join(jsonDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const jsonData = JSON.parse(fileContent);

                for (const item of jsonData) {
                    await ss.runQuery(`
                        INSERT OR REPLACE INTO items (id, name, is_available, price, item_class, item_type_id, item_type_name, exclusive_for_class, item_data)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [item.id, item.name, item.is_available, item.price, path.parse(file).name, item.item_type_id, item.item_type_name, item.exclusive_for_class, JSON.stringify(item.item_data)]);
                };
            };
        };
    },
    insertMaps: async (jsonDir = path.join(ss.currentDir, 'src', 'maps')) => {
        const files = fs.readdirSync(jsonDir);
        for (const file of files) {
            if (path.extname(file) === '.json') {
                ss.log.beige(`Inserting: ${file}`);
                const filePath = path.join(jsonDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const map = JSON.parse(fileContent);

                await ss.runQuery(`
                    INSERT OR REPLACE INTO maps ( name, sun, ambient, fog, data, palette, render, width, height, depth, surfaceArea, extents, skybox, modes, availability, numPlayers, dateCreated, dateModified ) 
                    VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? )
                `, [
                        map.name || 'Unknown map',
                        map.sun ? JSON.stringify(map.sun) : '{"direction":{"x":0.2,"y":1,"z":-0.3},"color":"#FFFFFF"}',
                        map.ambient || '#000000', //NOT USED! (other than map editor idfk)
                        map.fog ? JSON.stringify(map.fog) : '{"density":0.01,"color":"#FFFFFF"}',
                        map.data ? JSON.stringify(map.data) : '{}',
                        map.palette ? JSON.stringify(map.palette) : '[null,null,null,null,null,null,null,null,null,null]',
                        map.render ? JSON.stringify(map.render) : '{}',
                        map.width || -9999,
                        map.height || -9999,
                        map.depth || -9999,
                        map.surfaceArea || 0,
                        map.extents ? JSON.stringify(map.extents) : '{"x":{"max":0,"min":10000},"y":{"max":0,"min":10000},"z":{"max":0,"min":10000},"width":-9999,"height":-9999,"depth":-9999}',
                        map.skybox || '',
                        map.modes ? JSON.stringify(map.modes) : '{"FFA":true,"Teams":true}',
                        map.availability || 'both',
                        map.numPlayers || 18,
                        Math.floor(Date.now() / 1000),
                        Math.floor(Date.now() / 1000)
                    ]
                );
            };
        };
    },
    getCodeData: async (code_key, retainSensitive) => {
        try {
            ss.config.verbose && ss.log.bgCyan(`services: Reading from DB: get code ${code_key}`);
            const code = await ss.getOne(`SELECT * FROM codes WHERE key = ?`, [code_key]);
    
            if (code) {
                ss.config.verbose && console.log(code);
                code.used_by = JSON.parse(code.used_by);
                code.item_ids = JSON.parse(code.item_ids);
                if (!retainSensitive) {
                    delete code.uses;
                    delete code.used_by;
                    delete code.dateCreated;
                    delete code.dateModified;
                };
                return code;
            } else {
                console.log('Code not found');
                return null;
            };
        } catch (error) {
            console.error('Error retrieving code data:', error);
            return null;
        };
    },
    getItemData: async (item_id, retainSensitive) => {
        try {
            ss.config.verbose && ss.log.bgCyan(`services: Reading from DB: get item ${item_id}`);
            const item = await ss.getOne(`SELECT * FROM items WHERE id = ?`, [item_id]);
    
            if (item) {
                if (!retainSensitive) {
                    delete item.item_class;
                    delete item.dateCreated;
                    delete item.dateModified;
                };
                item.is_available = !!item.is_available;
                item.item_data = JSON.parse(item.item_data);
                return item;
            } else {
                console.log('Item not found', item_id);
                return null;
            };
        } catch (error) {
            console.error('Error retrieving item data:', error);
            return null;
        };
    },
    getAllItemData: async (retainSensitive) => {
        try {
            ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get all items");
            const items = await ss.getAll(`SELECT * FROM items`);
    
            if (items) {
                return items.map(item => {
                    if (!retainSensitive) {
                        delete item.item_class;
                        delete item.dateCreated;
                        delete item.dateModified;
                    };
                    item.is_available = item.is_available === 1;
                    item.item_data = JSON.parse(item.item_data);
                    return item;
                });
            } else {
                console.log('Items not found');
                return null;
            };
        } catch (error) {
            console.error('Error retrieving items data:', error);
            return null;
        };
    },
    getAllMapData: async (retainSensitive) => {
        try {
            ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get all maps");
            const maps = await ss.getAll(`SELECT * FROM maps`);
    
            if (maps) {
                var i = 0;

                return maps.map(map => { // yes, m a p
                    if (!retainSensitive) {
                        delete map.dateCreated;
                        delete map.dateModified;
                    };
                    map.sun = JSON.parse(map.sun);
                    map.fog = JSON.parse(map.fog);
                    map.data = JSON.parse(map.data);
                    map.palette = JSON.parse(map.palette);
                    map.render = JSON.parse(map.render);
                    map.extents = JSON.parse(map.extents);
                    map.modes = JSON.parse(map.modes);
                    map.id = i++;
                    return map;
                });
            } else {
                console.log('Maps not found');
                return null;
            };
        } catch (error) {
            console.error('Error retrieving maps data:', error);
            return null;
        };
    },
    getAllGameServerData: async (retainSensitive) => {
        try {
            ss.config.verbose && ss.log.bgCyan(`services: Reading from DB: get all game servers`);
            const data = await ss.getAll(`SELECT * FROM game_servers`);
            if (data) {
                return data.map(server => {
                    if (!retainSensitive) {
                        delete server.auth_key;
                        delete server.dateCreated;
                        delete server.dateModified;
                    };
                    return server;
                });
            } else {
                console.log('Data not found');
                return null;
            };
        } catch (error) {
            console.error('Error retrieving data:', error);
            return null;
        };
    },
};

export default exported;