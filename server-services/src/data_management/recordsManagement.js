//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: recs
import { pathToFileURL } from 'url';
import { itemIdOffsetsByName } from '#constants';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc'
import { convertMetaIdToAbsoluteId, convertOldItemIdToMetaId } from '#catalog';
//

var usersTable = `
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
        ownedItemIds TEXT DEFAULT '[50001,50002,50003,50004,50005,50006,100001,100002,100003,100004,100005,100006,200000,300000,250000,350000,150000]',  -- Will store as JSON string
        loadout TEXT DEFAULT '{"primaryId":[200000,300000,250000,350000],"secondaryId":[150000,150000,150000,150000],"classIdx":0,"colorIdx":0,"hatId":null,"stampId":null}',       -- Will store as JSON string
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
`;

const exported = {
    initDB: async (db) => {
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                exported.initTables(db)
                    .then(resolve)
                    .catch(reject);
            });
        });
    },
    initTables: async (db) => {
        //USERS
        await ss.runQuery(usersTable);
    
        await ss.runQuery(`
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        `);
    
        await ss.runQuery(`
            CREATE INDEX IF NOT EXISTS idx_users_authToken ON users(authToken);
        `);
        
        await ss.runQuery(`
            CREATE TRIGGER IF NOT EXISTS update_dateModified
            AFTER UPDATE ON users
            FOR EACH ROW
            BEGIN
                UPDATE users SET dateModified = strftime('%s', 'now') WHERE account_id = OLD.account_id;
            END;
        `);
    
        //RATELIMITING
        await ss.runQuery(`
            CREATE TABLE IF NOT EXISTS ip_requests (
                ip TEXT PRIMARY KEY,
                sensitive_count INTEGER DEFAULT 0,
                regular_count INTEGER DEFAULT 0,
                last_sensitive_reset INTEGER DEFAULT (strftime('%s', 'now')),
                last_regular_reset INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
    
        //SESSIONS
        await ss.runQuery(`
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            user_id INTEGER UNIQUE,
            ip_address TEXT,
            dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
            expires_at INTEGER
        )
        `);
    
        //ITEMS
        await ss.runQuery(`
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            meta_id INTEGER,
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
        
        await ss.runQuery(`
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
        await ss.runQuery(`
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
        
        await ss.runQuery(`
            CREATE TRIGGER IF NOT EXISTS update_dateModified_codes
            AFTER UPDATE ON codes
            FOR EACH ROW
            BEGIN
                UPDATE codes SET dateModified = strftime('%s', 'now') WHERE key = OLD.key;
            END;
        `);
    
        await ss.runQuery(`
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
        
        await ss.runQuery(`
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
        await ss.runQuery(`
        CREATE TABLE IF NOT EXISTS game_servers (
            auth_key TEXT PRIMARY KEY DEFAULT (substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1) || substr('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*()-_=+[]{}|:,.<>?', abs(random()) % 77 + 1, 1)),
            name TEXT DEFAULT 'Unnamed server',
            address TEXT DEFAULT 'localhost:13372',
            dateCreated INTEGER DEFAULT (strftime('%s', 'now')),
            dateModified INTEGER DEFAULT (strftime('%s', 'now'))
        )
        `);
        
        await ss.runQuery(`
            CREATE TRIGGER IF NOT EXISTS update_dateModified_game_servers
            AFTER UPDATE ON game_servers
            FOR EACH ROW
            BEGIN
                UPDATE game_servers SET dateModified = strftime('%s', 'now') WHERE name = OLD.name;
            END;
        `);

        //FLAGS
        await ss.runQuery(`
        CREATE TABLE IF NOT EXISTS flags (
            name TEXT PRIMARY KEY DEFAULT 'flag',
            value TEXT DEFAULT 'value'
        )
        `);

        log.beige('Initialised tables if needed');
    },
    performConversionCheck: async () => {
        //code to check if items table has meta_id column
        const columns = await ss.getAll(`PRAGMA table_info(items)`);
        const hasMetaIdColumn = columns.some(column => column.name === 'meta_id');

        if (!hasMetaIdColumn) {
            log.info('');
            log.info('########################################################');
            log.info('########################################################');
            log.info('###### IMPORTANT: Performing old items conversion ######');
            log.info('########################################################');
            log.info('########################################################');
            log.info('');

            async function convertOldItemsInList(item_ids) {
                for (let i = 0; i < item_ids.length; i++) {
                    const item_id = item_ids[i];

                    if (!item_id) continue;

                    //get item from old table
                    const item = await ss.getOne(`SELECT * FROM items WHERE id = ?`, [item_id]);

                    console.log(item_id);

                    item_ids[i] = convertOldItemIdToMetaId(item_id, item.item_class);

                    if (item_id === 1254) {
                        log.cyan("Duct tape: converting LS Beta Hat to new item");
                        item_ids[i] = 10e3;
                    };

                    item_ids[i] = convertMetaIdToAbsoluteId(item_ids[i], item.item_class);
                };
                return item_ids;
            };

            //convert all old codes
            const codes = await ss.getAll('SELECT * FROM codes');
            for (const code of codes) {
                var item_ids = JSON.parse(code.item_ids);

                item_ids = await convertOldItemsInList(item_ids);

                log.info(`Converting code: ${code.key}`);
                await ss.runQuery(`
                    UPDATE codes
                    SET item_ids = ?
                    WHERE key = ?
                `, [JSON.stringify(item_ids), code.key]);
            };

            //convert old users
            const users = await ss.getAll('SELECT * FROM users');
            for (const user of users) {
                //convert ownedItemIds
                var ownedItemIds = JSON.parse(user.ownedItemIds);

                ownedItemIds = await convertOldItemsInList(ownedItemIds);

                //convert loadout
                var loadout = JSON.parse(user.loadout);

                loadout.primaryId = await convertOldItemsInList(loadout.primaryId);
                loadout.secondaryId = await convertOldItemsInList(loadout.secondaryId);
                loadout.hatId = await convertOldItemsInList([loadout.hatId])[0];
                loadout.stampId = await convertOldItemsInList([loadout.stampId])[0];

                log.info(`Converting user: ${user.username} ownedItemIds and loadout`);
                await ss.runQuery(`
                    UPDATE users
                    SET ownedItemIds = ?,
                        loadout = ?
                    WHERE account_id = ?
                `, [JSON.stringify(ownedItemIds), JSON.stringify(loadout), user.account_id]);
            };

            //delete the old table (will force reinseration of items)
            await ss.runQuery('DROP TABLE items');
            await exported.initTables(ss.db);
        };
    },
    updateUserDefaults: async () => { //i hate sqlite this is so stupid
        var hasFlag = await ss.getOne(`SELECT * FROM flags WHERE name = 'user_defaults_updated'`);

        if (hasFlag) return;

        log.info('');
        log.info('########################################################');
        log.info('########################################################');
        log.info('###### IMPORTANT: Updating user defaults ###############');
        log.info('########################################################');
        log.info('########################################################');
        log.info('');

        try {
            await ss.runQuery('BEGIN TRANSACTION');
            await ss.runQuery("ALTER TABLE users RENAME TO old_users;")
            await ss.runQuery(usersTable);
            await ss.runQuery(`INSERT INTO users (
                    account_id, username, password, authToken, kills, deaths, streak, currentBalance,
                    eggsSpent, ownedItemIds, loadout, version, upgradeProductId, upgradeMultiplier,
                    upgradeAdFree, upgradeExpiryDate, maybeSchoolEmail, adminRoles, dateCreated, dateModified
                )
                    SELECT
                    account_id, username, password, authToken, kills, deaths, streak, currentBalance,
                    eggsSpent, ownedItemIds, loadout, version, upgradeProductId, upgradeMultiplier,
                    upgradeAdFree, upgradeExpiryDate, maybeSchoolEmail, adminRoles, dateCreated, dateModified
                FROM old_users;`)
            await ss.runQuery('DROP TABLE old_users;');
            await ss.runQuery('COMMIT');
            //add flag for user defaults update
            await ss.runQuery(`
                INSERT OR REPLACE INTO flags (name, value)
                VALUES ('user_defaults_updated', '1')
            `);
        } catch (error) {
            await ss.runQuery('ROLLBACK');
            log.error('Error updating user defaults:', error);
        };
    },
    insertItems: async (jsDir = path.join(ss.currentDir, 'src', 'items')) => {
        const files = fs.readdirSync(jsDir);

        for (const file of files) {
            if (path.extname(file) === '.js') {
                log.beige(`[Items] Inserting: ${file}`);
                const filePath = path.join(jsDir, file);
                const fileURL = pathToFileURL(filePath);

                const jsData = (await import(fileURL)).default;

                // console.log(jsData);

                for (let itemType in jsData) {
                    const items = jsData[itemType];

                    log.beige(`[Items] Inserting ${items.length} items of type: ${itemType} from ${filePath}`);

                    for (const item of items) {
                        var offset = itemIdOffsetsByName[itemType];

                        if (!offset) {
                            log.warning(`[Items] No offset found for item type: ${itemType}`);
                            offset = 0;
                        };

                        while (item.name.endsWith(" ")) item.name=item.name.substr(0,item.name.length-1); //stupid Lyerpald stamp

                        item.id = item.meta_id + offset;

                        await ss.runQuery(`
                            INSERT OR REPLACE INTO items (id, meta_id, name, is_available, price, item_class, item_type_id, item_type_name, exclusive_for_class, item_data)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [item.id, item.meta_id, item.name, item.is_available, item.price, path.parse(itemType).name, item.item_type_id, item.item_type_name, item.exclusive_for_class, JSON.stringify(item.item_data)]);
                    };
                };
            };
        };
    },
    insertMaps: async (jsonDir = path.join(ss.currentDir, 'src', 'maps')) => {
        const files = fs.readdirSync(jsonDir);
        const maps = [];
        for (const file of files) {
            if (path.extname(file) === '.json') {
                log.beige(`[Maps] Reading: ${file}`);
                const filePath = path.join(jsonDir, file);
                const fileContent = fs.readFileSync(filePath, 'utf8');
                maps.push(JSON.parse(fileContent));
            };
        };

        for (const map of maps) {
            log.beige(`[Maps] Inserting: ${map.name}`);
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
                ],
            );
        };

        //alphabetical order (cringe)
        try {
            await ss.runQuery('BEGIN TRANSACTION');
            await ss.runQuery('CREATE TABLE maps_temp AS SELECT * FROM maps ORDER BY name');
            await ss.runQuery('DROP TABLE maps');
            await ss.runQuery('ALTER TABLE maps_temp RENAME TO maps');
            await ss.runQuery('COMMIT');
        } catch (error) {
            await ss.runQuery('ROLLBACK');
            console.error('Error reordering maps table:', error);
        };

        log.beige(`[Maps] Inserted ${maps.length} maps`);
    },
    getCodeData: async (code_key, retainSensitive) => {
        try {
            ss.config.verbose && log.bgCyan(`services: Reading from DB: get code ${code_key}`);
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
            ss.config.verbose && log.bgCyan(`services: Reading from DB: get item ${item_id}`);
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
            ss.config.verbose && log.bgCyan("services: Reading from DB: get all items");
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
            ss.config.verbose && log.bgCyan("services: Reading from DB: get all maps");
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
            ss.config.verbose && log.bgCyan(`services: Reading from DB: get all game servers`);
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