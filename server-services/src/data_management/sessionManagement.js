//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: database
import crypto from 'node:crypto'; //sessions
//

let ss; //trollage. access it later.

const exported = {
    setSS: function (newSS) {
        ss = newSS;
    },
    createSession: async (user_id, ip_address) => {
        ss.config.verbose && ss.log.info("reason for session deletion: new created "+user_id);
        exported.deleteAllSessionsForUser(user_id);
    
        const session_id = crypto.randomBytes(32).toString('hex');
        const expires_at = Math.floor(Date.now() / 1000) + (60 * (ss.config.services.session_expiry_time || 180));
    
        try {
            ss.config.verbose && ss.log.bgBlue("services: Writing to DB: create new session "+user_id+", "+session_id);
            await ss.runQuery(`
                INSERT INTO sessions (session_id, user_id, ip_address, expires_at)
                VALUES (?, ?, ?, ?)
            `, [session_id, user_id, ip_address, expires_at]);
            return session_id;
        } catch (error) {
            console.error('Error creating session:', error);
            return null;
        };
    },
    retrieveSession: async (session_id, ip_address, readOnly) => {
        try {
            ss.config.verbose && ss.log.bgCyan("services: Reading from DB: get session for session_id " + session_id);
    
            const session = await ss.getOne(`
                SELECT * FROM sessions WHERE session_id = ? AND expires_at > strftime('%s', 'now')
            `, [session_id]);
    
            if (!session) {
                ss.log.yellow(`No valid session found for session_id: ${session_id}`);
                return null;
            };
    
            ss.config.verbose && console.log(session, ip_address);
    
            if (session.ip_address !== ip_address && !readOnly) {
                ss.config.verbose && ss.log.info("reason for session deletion: ip mismatch "+user_id+", "+session_id);
                await exported.deleteAllSessionsForUser(session.user_id);
                return null;
            };
    
            ss.log.green(`Session retrieved for session_id: ${session_id}`);
            return session;
        } catch (error) {
            console.error('Error retrieving session:', error);
            return null;
        };
    },
    deleteAllSessionsForUser: async (user_id) => {
        try {
            ss.config.verbose && ss.log.bgPurple(`services: Deleting from DB: all sessions for user_id: ${user_id}`);
            await ss.runQuery(`DELETE FROM sessions WHERE user_id = ?`, [user_id]);
        } catch (error) {
            console.error('Error deleting sessions:', error);
        };
    },
    cleanupExpiredSessions: async () => {
        try {
            ss.config.verbose && ss.log.bgPurple(`services: Deleting from DB: Cleaning up expired sessions`);
            await ss.runQuery(`DELETE FROM sessions WHERE expires_at < strftime('%s', 'now')`);
            ss.log.green('Expired sessions cleaned up');
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error);
        }
    },
};

export default exported;