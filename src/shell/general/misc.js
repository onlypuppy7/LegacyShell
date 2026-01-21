//basic
import fs from 'node:fs';
import yaml from 'js-yaml';
import path from 'node:path';
//legacyshell: config reqs
import WebSocket, { WebSocketServer } from 'ws';
import { isObject } from '#constants';
import accs from '#accountManagement';
//legacyshell: logging
import log from 'puppylog';
//legacyshell: dirname resolving
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import extendMath from '#math';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export var ss; //trollage. access it later.
extendMath(Math);

export const misc = {
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
            rootDir: path.join(path.resolve(miscDirname), '..', '..', '..')
        };

        if (!noConfig) {
            const defaultConfigPath = path.join(ss.rootDir, 'src', 'defaultconfig');
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
        
            let yamlFiles = files.filter(file => path.extname(file) === '.yaml');
            //remove ._ files
            yamlFiles = yamlFiles.filter(file => !file.startsWith("._")); //i hate macos

            yamlFiles.forEach(file => {
                const filePath = path.join(configFolderPath, file);

                const name = file.replace(".yaml", "");
    
                try {
                    const data = fs.readFileSync(filePath, 'utf8');
                    const defaultData = fs.readFileSync(path.join(defaultConfigPath, file), 'utf8');
                    try {
                        const yamlData = yaml.load(data);
                        const yamlDefaultData = yaml.load(defaultData);

                        if (yamlDefaultData) {
                            config[name] = { //overwrite default with custom
                                ...yamlDefaultData,
                                ...yamlData
                            };

                            //iterate through default and notify user of anything missing in custom config
                            for (const key in yamlDefaultData) { //not the cleanest way to do this
                                if (yamlData[key] === undefined) {
                                    log.warning(`Missing key ${key} in ${file}, using default value.`);
                                } else if (isObject(yamlDefaultData[key])) {
                                    for (const subKey in yamlDefaultData[key]) {
                                        if (yamlData[key] === undefined || yamlData[key][subKey] === undefined) {
                                            log.warning(`Missing key ${key} -> ${subKey} in ${file}, using default value.`);
                                        } else if (isObject(yamlDefaultData[key][subKey])) {
                                            for (const subSubKey in yamlDefaultData[key][subKey]) {
                                                if (yamlData[key][subKey][subSubKey] === undefined) { //if there are still more levels, get fucked
                                                    log.warning(`Missing key ${key} -> ${subKey} -> ${subSubKey} in ${file}, using default value.`);
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    } catch (parseError) {
                        console.error(`Error parsing YAML in ${file}:`, parseError);
                        process.exit(1);
                    };
                } catch (error) {
                    console.error(`Error reading ${file}:`, error);
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
            // plugins: new PluginManager(ss),
            pluginsDir: path.join(ss.rootDir, 'plugins'),
            pluginsDirDefault: path.join(ss.rootDir, 'plugins_default'),
            versionEnum: Number(fs.readFileSync(path.join(ss.rootDir, 'versionEnum.txt'), 'utf8')),
            versionHash: fs.readFileSync(path.join(ss.rootDir, 'versionHash.txt'), 'utf8').slice(0,7),
            isPerpetual: argv[2] === "--perpetual",
            startTime: Date.now(),
        };

        ss.isPerpetual && ss.config.verbose && log.gray("is perpetual");

        // console.log(path.resolve(ogDirname), path.resolve(miscDirname), ss);

        log.green(`Created ss Object! Commit hash: ${ss.versionHash} (${ss.versionEnum})`);
        (!noConfig) && ss.config.verbose && log.bgGray("VERBOSE LOGGING ENABLED!!!!!!");
    },
    getServicesSeed: async function () {
        //if seed not exists in flag sqlite table, generate a new one
        let seed = await ss.getOne(`SELECT * FROM flags WHERE name = 'servicesSeed'`);

        if (!seed) {
            seed = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            ss.runQuery("INSERT INTO flags (name, value) VALUES ('servicesSeed', ?)", seed);
        } else seed = seed.value;

        ss.servicesSeed = seed;
        return seed;
    },
    getSQLPassword: async function () {
        //if seed not exists in flag sqlite table, generate a new one
        let sqlPassword = await ss.getOne(`SELECT * FROM flags WHERE name = 'sqlPassword'`);

        if (!sqlPassword) {
            //make seed extremely long and complex
            sqlPassword = Math.getRandomAsciiChars(64);
            ss.runQuery("INSERT INTO flags (name, value) VALUES ('sqlPassword', ?)", accs.hashPassword(sqlPassword));

            log.orange(`
                ############################################################
                #                                                          #
                # New SQL Password generated, please store this securely   #
                #                                                          #
                ############################################################
                `);
            log.bold(sqlPassword);
        } else sqlPassword = sqlPassword.value;

        ss.sqlPassword = sqlPassword;
        return sqlPassword;
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
            file = misc.prepareForClient(file);
            file = `// [LS] ${hashtag} imported from .${path[1]}\n${file}`;
            return file;
        } catch (error) {
            return "//fucking failed! you messed this up DEVELOPER!!! "+hashtag;
        };
    },
    prepareForClient: function (file) {
        file = `\n${file}`;
        file = file.replaceAll("\nimport ", "\n//(ignore) import ");
        file = file.replaceAll("\nexport default ", "\n//(ignore) export default ");
        file = file.replaceAll("\nexport ", "\n/*(ignore) export*/ ");
        file = file.replaceAll("\n//(server-only-start)", "\n/*(server-only-start)");
        file = file.replaceAll("\n//(server-only-end)", "\n(server-only-end)*/");
        return file;
    },
};

export default misc;