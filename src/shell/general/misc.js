//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: config reqs
import log from '#coloured-logging';
import WebSocket, { WebSocketServer } from 'ws';
//legacyshell: dirname resolving
import { fileURLToPath } from 'url';
import { dirname } from 'path';
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
    instantiateSS: function (meta, argv, noStorage, noConfig) {
        let ogDirname = meta.dirname;
        let miscDirname = import.meta.dirname;

        if (!ogDirname) {
            const __filename = fileURLToPath(meta.url);
            ogDirname = dirname(__filename);
            console.log("(Using fallback mechanism for ogDirname)");
        };
        if (!miscDirname) {
            const __filename = fileURLToPath(import.meta.url);
            miscDirname = dirname(__filename);
            console.log("(Using fallback mechanism for miscDirname)");
        };

        //storage
        if (!noStorage) fs.mkdirSync(path.join(ogDirname, 'store'), { recursive: true });

        ss = {
            currentDir: path.resolve(ogDirname),
            rootDir: path.join(path.resolve(miscDirname), '..', '..', '..'),
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
            isPerpetual: argv[2] === "--perpetual",
            startTime: Date.now(),
        };

        ss.isPerpetual && ss.config.verbose && ss.log.gray("is perpetual");

        // console.log(path.resolve(ogDirname), path.resolve(miscDirname), ss);

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