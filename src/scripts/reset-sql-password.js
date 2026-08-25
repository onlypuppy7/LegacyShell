//basic
import fs from 'node:fs';
import path from 'node:path';
//legacyshell: basic
import log from 'puppylog';
import misc from '#misc';
//legacyshell: database
import Database from 'better-sqlite3';
import { wrapDatabase } from '#sqliteWrap';
//legacyshell: ss
import { ss } from '#misc';
//

// noStorage: true - this script's own directory (src/scripts/) isn't a real server role dir,
// so skip the "mkdir a store/ folder next to me" step; the real services store folder is found
// via ss.rootDir below instead. Config IS needed (unlike init.js's noConfig:true, which is
// special-cased for bootstrapping before config exists at all) for password_cost_factor.
misc.instantiateSS(import.meta, process.argv, true, false);

const dbPath = path.join(ss.rootDir, 'server-services', 'store', 'LegacyShellData.db');
if (!fs.existsSync(dbPath)) {
    log.error(`No database found at ${dbPath} - run 'npm run init' first.`);
    process.exit(1);
};

const db = new Database(dbPath);
Object.assign(ss, wrapDatabase(db));

(async () => {
    // The only thing that actually needs to happen: drop the existing row so
    // misc.getSQLPassword() (the exact function services calls at boot) thinks none exists
    // yet and generates + logs a fresh one, same as a brand-new install would see.
    await ss.runQuery(`DELETE FROM flags WHERE name = 'sqlPassword'`);
    await misc.getSQLPassword();

    log.warning('Restart services for it to pick up the new password (this script only touched the DB, not the running process).');
    db.close();
})();
