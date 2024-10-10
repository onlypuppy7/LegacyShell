//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: config reqs
import log from '#coloured-logging';
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
    instantiateSS: function (dirname, noStorage, noConfig) {
        //storage
        if (!noStorage) fs.mkdirSync(path.join(dirname, 'store'), { recursive: true });

        ss = {
            currentDir: path.resolve(dirname),
            rootDir: path.join(path.resolve(import.meta.dirname), '..', '..', '..'),
        };

        if (!noConfig) {
            const configFolderPath = path.join(ss.rootDir, 'store', 'config');
            if (!fs.existsSync(configFolderPath)) {
                console.log("Config folder not found, make sure you have run the init script first... 'npm run init'");
                process.exit(1);
            };

            let files;
            try {
                files = fs.readdirSync(configFolderPath);
            } catch (err) {
                console.error('Error reading config folder:', err);
                process.exit(1);
            };

            var config = {};
        
            const yamlFiles = files.filter(file => path.extname(file) === '.yaml');

            yamlFiles.forEach(file => {
                const filePath = path.join(configFolderPath, file);

                const name = file.replace(".yaml", "");

                console.log(name, filePath)
    
                try {
                    const data = fs.readFileSync(filePath, 'utf8');
                    try {
                        const yamlData = yaml.load(data);
                        config[name] = yamlData;
                    } catch (parseError) {
                        console.error(`Error parsing YAML in ${file}:`, parseError);
                        process.exit(1);
                    };
                } catch (error) {
                    console.error(`Error reading ${file}:`, err);
                    process.exit(1);
                };
            });

            config = {
                ...config,
                ...config.all
            };

            delete config.all;

            ss = {
                ...ss,
                config
            };

            // console.log(ss)
        };

        ss = {
            ...ss,
            packageJson: JSON.parse(fs.readFileSync(path.join(ss.rootDir, 'package.json'), 'utf8')),
            versionEnum: Number(fs.readFileSync(path.join(ss.rootDir, 'versionEnum.txt'), 'utf8')),
            versionHash: fs.readFileSync(path.join(ss.rootDir, 'versionHash.txt'), 'utf8').slice(0,7),
            log,
        };

        // console.log(path.resolve(dirname), path.resolve(import.meta.dirname), ss);

        ss.log.green(`Created ss Object! Commit hash: ${ss.versionHash} (${ss.versionEnum})`);
        (!noConfig) && ss.config.verbose && ss.log.bgGray("VERBOSE LOGGING ENABLED!!!!!!");

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