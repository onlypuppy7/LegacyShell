//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: basic
import log from '#coloured-logging';
//legacyshell: config reqs
import WebSocket, { WebSocketServer } from 'ws';
//

let ss; //trollage. access it later.

const misc = {
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
            versionEnum: Number(fs.readFileSync(path.join(path.resolve(import.meta.dirname), '..', '..', '..', 'versionEnum.txt'), 'utf8')),
            versionHash: fs.readFileSync(path.join(path.resolve(import.meta.dirname), '..', '..', '..', 'versionHash.txt'), 'utf8').slice(0,7),
            log,
        };

        // console.log(path.resolve(dirname), path.resolve(import.meta.dirname), ss);

        ss.log.green(`Created ss Object! Commit hash: ${ss.versionHash} (${ss.versionEnum})`);
        ss.config.verbose && ss.log.bgGray("VERBOSE LOGGING ENABLED!!!!!!");

        return ss;
    },
    hashtagToPath: function (hashtag) {
        try {
            if (!hashtag.startsWith("#")) hashtag = `#${hashtag}`;
            let fromJson = ss.packageJson.imports[hashtag];
            if (fromJson.startsWith(".")) fromJson = fromJson.replace(".", "");
            return [path.join(ss.rootDir, fromJson), fromJson];
        } catch (error) {
            return null;
        };
    },
    hashtagToString: function (hashtag) {
        try {
            const path = misc.hashtagToPath(hashtag);
            let file = fs.readFileSync(path[0], 'utf8');
            file = file.replaceAll("\nimport ", "\n//(ignore) import ");
            file = file.replaceAll("\nexport default ", "\n//(ignore) export default ");
            file = file.replaceAll("\nexport ", "\n/*(ignore) export*/ ");
            file = file.replaceAll("\n//(server-only-start)", "\n/*(server-only-start)");
            file = file.replaceAll("\n//(server-only-end)", "\n(server-only-end)*/");
            file = `// [LS] ${hashtag} imported from .${path[1]}\n${file}`;
            return file;
        } catch (error) {
            return "//fucking failed! "+hashtag;
        };
    },
};

export default misc;