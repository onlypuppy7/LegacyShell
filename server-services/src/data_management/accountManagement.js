//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: database
import bcrypt from 'bcrypt';
import crypto from 'node:crypto'; //passwds
//

let ss; //trollage. access it later.

const exported = {
    setSS: function (newSS) {
        ss = newSS;
    },
    hashPassword: (data) => {
        return bcrypt.hashSync(data, ss.config.services.password_cost_factor || 10);
    },
    comparePassword: async (userData, receivedPassword) => {
        try {
            console.log(receivedPassword, userData.password);
            return bcrypt.compareSync(receivedPassword, userData.password);
        } catch (error) {
            console.error(error); return "Database error.";
        };
    },
    compareAuthToken: async (userData, receivedAuthToken) => {
        try {
            let success = (receivedAuthToken == userData.authToken);
            return success ? true : "Validation failed.";
        } catch (error) {
            console.error(error); return "Database error.";
        };
    },
    generateToken: async (username) => {
        const newToken = crypto.randomBytes(32).toString('hex');
        ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new token "+username);
        await ss.runQuery(`UPDATE users SET authToken = ? WHERE username = ?`, [newToken, username]);
        return newToken;
    },
    getAuthKeyData: async (auth_key) => {
        try {
            ss.config.verbose && ss.log.bgCyan(`services: Reading from DB: get code ${auth_key}`);
            const data = await ss.getOne(`SELECT * FROM game_servers WHERE auth_key = ?`, [auth_key]);
            if (data) return data;
            else {
                console.log('Data not found');
                return null;
            };
        } catch (error) {
            console.error('Error retrieving data:', error);
            return null;
        };
    },
    createAccount: async (username, password) => {
        password = exported.hashPassword(password);
        try {
            ss.config.verbose && ss.log.bgBlue("services: Writing to DB: create new user "+username);
            await ss.runQuery(`
                INSERT INTO users (username, password)
                VALUES (?, ?)
            `, [username, password]);
    
            return true;
        } catch (error) {
            console.error('Error creating account:', error.code);
            return error.code;
        };
    },
    getUserData: async (identifier, convertJson, retainSensitive) => {
        try {
            let user;
    
            if (typeof identifier === 'string') {
                ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get user via username "+identifier);
                user = await ss.getOne(`SELECT * FROM users WHERE username = ?`, [identifier]);
            } else if (Number.isInteger(identifier)) {
                ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get user via ID "+identifier);
                user = await ss.getOne(`SELECT * FROM users WHERE account_id = ?`, [identifier]);
            } else {
                ss.log.red('Invalid identifier type '+identifier);
                return null;
            };
    
            if (user) {
                if (convertJson) {
                    user.ownedItemIds = JSON.parse(user.ownedItemIds);
                    user.loadout = JSON.parse(user.loadout);
                };
                if (!retainSensitive) {
                    delete user.password;
                };
    
                user.upgradeAdFree = !!user.upgradeAdFree;
                user.upgradeExpiryDate = user.upgradeExpiryDate || 0;
                user.upgradeIsExpired = Math.floor(Date.now() / 1000) > user.upgradeExpiryDate;
                if (user.upgradeIsExpired) user.upgradeMultiplier = null, user.upgradeProductId = null;
    
                // console.log('User data retrieved:', user);
                console.log('User data retrieved');
                return user;
            } else {
                console.log('User not found');
                return null;
            }
        } catch (error) {
            console.error('Error retrieving user data:', error);
            return null;
        };
    },
    addItemToPlayer: async (item_id, userData, isBuying, force) => { //force is for item codes and stuff
        try {
            if (userData.ownedItemIds.includes(item_id)) return "ALREADY_OWNED";
    
            const item = await ss.recs.getItemData(item_id);
    
            if ((!item) || (!(force || item.is_available))) return "ITEM_NOT_FOUND";
            if (isBuying) {
                if (userData.currentBalance >= item.price) {
                    userData.currentBalance -= item.price;
                    userData.eggsSpent += item.price;
                } else {
                    return "INSUFFICIENT_FUNDS";
                };
            };
            userData.ownedItemIds = [...userData.ownedItemIds, item_id];

            ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new balance + ownedItemIds "+userData.username);
            await ss.runQuery(`
                UPDATE users 
                SET currentBalance = ?, eggsSpent = ?, ownedItemIds = ?
                WHERE account_id = ?
            `, [userData.currentBalance, userData.eggsSpent, JSON.stringify(userData.ownedItemIds), userData.account_id]);
            return "SUCCESS"; //god, i hope
        } catch (error) {
            console.error('Error retrieving item data:', error);
            return "ITEM_NOT_FOUND";
        };
    },
    doesPlayerOwnItem: async (userData, item_id, item_class) => {
        try {
            if (["Hats", "Stamps"].includes(item_class) && item_id === null) return true;
            const item = await ss.recs.getItemData(item_id, true);
            console.log(userData.ownedItemIds, item_id, item_class, userData.ownedItemIds.includes(item_id), item.item_class == item_class, userData.ownedItemIds.includes(item_id) && item.item_class == item_class);
            if (userData.ownedItemIds.includes(item_id) && item.item_class == item_class) return true;
            return false;
        } catch (error) {
            console.error('Error retrieving item data:', item_id, item_class, error);
            return "ITEM_NOT_FOUND";
        };
    },
    addCodeToPlayer: async (code_key, userData) => {
        try {
            const code = (await ss.recs.getCodeData(code_key, true)) || [];
            code.result = "ERROR"; //default if it fails, i guess
    
            if (code.used_by) { //exists
                if ((code.uses >= 1) && (!code.used_by.includes(userData.account_id))) {
                    for (const item_id of code.item_ids) {
                        await exported.addItemToPlayer(item_id, userData, false, true);
                    };
                    userData.currentBalance += code.eggs_given;
    
                    ss.config.verbose && ss.log.bgBlue("services: Writing to DB: set new balance + ownedItemIds "+userData.username);
                    await ss.runQuery(`
                        UPDATE users 
                        SET currentBalance = ?, ownedItemIds = ?
                        WHERE account_id = ?
                    `, [userData.currentBalance, JSON.stringify(userData.ownedItemIds), userData.account_id]);
    
                    code.uses -= 1;
                    code.used_by = [...code.used_by, userData.account_id];
    
                    ss.config.verbose && ss.log.bgBlue("services: Writing to DB: update code "+code_key);
                    await ss.runQuery(`
                        UPDATE codes 
                        SET uses = ?, used_by = ?
                        WHERE key = ?
                    `, [code.uses, JSON.stringify(code.used_by), code_key]);
    
                    code.result = "SUCCESS";
                } else {
                    code.result = "CODE_PREV_REDEEMED";
                };
            } else {
                console.log('Code not found');
                code.result = "CODE_NOT_FOUND";
            };
    
            return code;
        } catch (error) {
            console.error('Error retrieving code data:', error);
            return null;
        };
    },
};

export default exported;