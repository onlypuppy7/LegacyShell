//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: backups

//

let ss; //trollage. access it later.

const exported = {
    setSS: function (newSS) {
        ss = newSS;
    },
    createBackup: async (dbPath = ss.dbPath, backupPath = ss.backupPath) => {
        try {
            if (ss.config.services.backups.filepath) backupPath = ss.config.services.backups.filepath;

            if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
            const currentBackups = fs.readdirSync(backupPath);

            if (currentBackups.length > 0) {
                const lastBackup = currentBackups.reduce((a, b) => fs.statSync(path.join(backupPath, a)).mtime > fs.statSync(path.join(backupPath, b)).mtime ? a : b);
                const lastBackupDate = fs.statSync(path.join(backupPath, lastBackup)).mtime;
                const timeSinceLastBackup = Math.abs(new Date() - lastBackupDate) / (1e3 * 60 * 60);

                if (timeSinceLastBackup < ss.config.services.backups.interval) {
                    ss.log.muted('Backup already exists for this time.');
                    return false;
                };
            };

            const db = fs.readFileSync(dbPath);
            const date = new Date().toISOString().split('T')[0];
            const time = new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '-');
            const filename = path.join(backupPath, 'LegacyShellDataBackup-' + date + "_" + time + '.db');
            fs.writeFileSync(filename, db);

            ss.log.success('Backup created: ' + filename, path.basename(backupPath));

            if (currentBackups.length > ss.config.services.backups.keep) {
                var toDelete = currentBackups.length - ss.config.services.backups.keep;
                currentBackups.sort((a, b) => fs.statSync(path.join(backupPath, a)).mtime - fs.statSync(path.join(backupPath, b)).mtime);
                for (var i = 0; i < toDelete; i++) {
                    fs.unlinkSync(path.join(backupPath, currentBackups[i]));
                };
                ss.log.muted('Deleted ' + toDelete + ' old backups.');  
            };

            return true;
        } catch (error) {
            console.error('Error creating backup:', error);
            return false;
        };
    },
};

export default exported;