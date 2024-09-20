//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: basic
import log from '#coloured-logging';
//legacyshell: basic
import WebSocket, { WebSocketServer } from 'ws';
//

let ss; //trollage. access it later.

const exported = {
    getLastSavedTimestamp: function (filePath) {
        try {
            const stats = fs.statSync(filePath);
            return stats.mtimeMs;
        } catch (error) {
            log.yellow('Error getting file timestamp. It probably doesn\'t exist... yet!'); //it just doesnt exist. who cares LMAO
            return 0;
        }
    },
    instanciateSS: function (dirname, noStorage) {
        //storage
        if (!noStorage) fs.mkdirSync(path.join(dirname, 'store'), { recursive: true });

        const configPath = path.join(import.meta.dirname, '..', '..', '..', 'store', 'config.yaml');
        if (!fs.existsSync(configPath)) {
            console.log('config.yaml not found, make sure you have run the init script first... npm run init');
            process.exit(1);
        };

        ss = {
            currentDir: path.resolve(dirname),
            rootDir: path.join(path.resolve(import.meta.dirname), '..', '..', '..'),
            config: yaml.load(fs.readFileSync(configPath, 'utf8')),
            packageJson: JSON.parse(fs.readFileSync(path.join(path.resolve(import.meta.dirname), '..', '..', '..', 'package.json'), 'utf8')),
            log,
        };

        // console.log(path.resolve(dirname), path.resolve(import.meta.dirname), ss);

        ss.log.green("Created ss object!");
        ss.config.verbose && ss.log.bgGray("VERBOSE LOGGING ENABLED!!!!!!");

        return ss;
    },
    clamp: (value, min, max) => { return Math.min(Math.max(value, min), max) },
};

export default exported;