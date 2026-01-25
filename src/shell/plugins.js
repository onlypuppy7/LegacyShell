//legacyshell: basic
import fs from 'fs';
import path from 'path';
//legacyshell: plugins
import { fileURLToPath, pathToFileURL } from 'url';
import { devlog, isServer } from '#constants';
import { exec, execSync } from 'child_process';
import { isObject } from '#constants';
//legacyshell: ss
import misc, { ss } from '#misc';
//legacyshell: logging
import log from 'puppylog';
//

export class PluginManager {
    constructor(type) {
        this.plugins = {};
        this.listeners = {};
        this.type = type || 'game';
    };

    async retrievePluginAndDependencies(pluginFolder) {
        const out = {pluginFolder};
        const timeBeforeLoadFiles = Date.now();

        const pluginPath = path.join(pluginFolder, 'index.js');
        if (fs.existsSync(pluginPath)) {
            const dependenciesPath = path.join(pluginFolder, 'dependencies.js');
            if (fs.existsSync(dependenciesPath)) {
                out.dependencies = await import(pathToFileURL(dependenciesPath).href);
            };

            out.currentHash = execSync(`cd ${path.join(pluginFolder)} && git rev-parse HEAD`, { encoding: 'utf-8' }).trim();
            out.Plugin = await import(pathToFileURL(pluginPath).href);

            out.timeToLoadFiles = Date.now() - timeBeforeLoadFiles;

            return out;
        } else return null;
    };

    async preloadPlugin(dirPath, pluginFolder) {
        try {
            log.boldGray("preloading plugin folder", pluginFolder);
            const pluginObject = await this.retrievePluginAndDependencies(dirPath);
            if (!pluginObject) return;

            const { currentHash, dependencies } = pluginObject.Plugin;
            const timeBeforeDeps = Date.now();

            if (currentHash) {
                try {
                    log.info(`Plugin ${dirPath} has a git repository. Attempting to update... (current hash: ${currentHash})`);
                    exec(`cd ${path.join(dirPath)} && git pull`, (error, stdout, stderr) => {
                        if (error) {
                            log.warning(`Failed to update plugin ${dirPath} via git:`, error);
                            return;
                        };

                        const newHash = execSync(`cd ${path.join(dirPath)} && git rev-parse HEAD`, { encoding: 'utf-8' }).trim();
                        if (currentHash !== newHash) {
                            log.bgGreen(`Plugin ${dirPath} updated successfully. (new hash: ${newHash})`);
                        } else {
                            log.dim(`[stdout] ${stdout}${(stderr && stderr !=="") ? "[ERROR!] "+stderr+"\n" : ''}Plugin ${dirPath} is already up to date.`);
                        };
                    });
                } catch (error) {
                    log.warning(`Failed to update plugin ${dirPath} via git:`, error);
                };
            };

            let failed = false;

            if (dependencies) {
                for (const [dependency, version] of Object.entries(dependencies)) {
                    if (version === "plugin") {
                        if (this.pluginsList.includes(dependency)) {
                            log.green(`Plugin dependency ${dependency} found`);
                        } else {
                            failed = `This plugin requires another plugin to work: ${dependency}.\nInstall it and move it to the plugins folder.\nAlready installed? Ensure the folder name matches exactly.`;
                            log.red(`Plugin dependency ${dependency} not found`);
                        };
                    } else {
                        try {
                            const modulePath = path.join(ss.rootDir, 'node_modules', dependency);
                            if (!fs.existsSync(modulePath)) {
                                await import(dependency);
                            };
                            // log.dim(`${dependency} is already installed.`);
                        } catch (error) {
                            log.warning(`${dependency} is not installed. Attempting to install (${version})...`);
                            console.log(`Install result:\n`, execSync(`npm install ${dependency}@${version} --no-save`, (error, stdout, stderr) => {
                                console.log(`.\n.\n.\n.\n.\n.\n.\n.\n`);
                                if (error) {
                                    console.error(`exec error: ${error}`);
                                    return;
                                };
                                console.log(`stdout: ${stdout}`);
                                console.error(`stderr: ${stderr}`);
                            }).toString());
                        };
                    };
                };
            };

            if (failed) {
                log.error(`Plugin ${dirPath} couldn't be loaded:\n${failed}`);
                return null;
            };

            pluginObject.timeToDoDeps = Date.now() - timeBeforeDeps;

            return pluginObject;
        } catch (error) {
            log.error(`Failed to preload plugin ${dirPath}:`, error);
            return null;
        };
    };

    async preloadPluginsFromDir(pluginsDir, type, newSS) {
        try {
            if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

            const promises = [];
            const pluginsPreloadStart = Date.now();

            const pluginFolders = fs.readdirSync(pluginsDir);

            for (const pluginFolder of pluginFolders) {
                const dirPath = path.join(pluginsDir, pluginFolder);
                if (fs.statSync(dirPath).isDirectory() && !pluginFolder.startsWith("_")) {
                    promises.push(this.preloadPlugin(dirPath, pluginFolder));
                }
            };

            //rearrange to only valid plugins and alphabetical order
            let pluginObjects = (await Promise.all(promises)).filter(p => p !== null);
            pluginObjects = pluginObjects.sort((a, b) => {
                const nameA = a.Plugin.PluginMeta.identifier.toUpperCase();
                const nameB = b.Plugin.PluginMeta.identifier.toUpperCase();
                return nameA.localeCompare(nameB);
            });

            log.bgGreen(`Finished preloading plugins from ${pluginsDir} in`, Date.now() - pluginsPreloadStart, "ms");

            return pluginObjects;
        } catch (error) {
            log.error("Failed to preload plugins from dir:", error);
            return [];
        };
    };

    async loadPlugins(type) {
        let pluginLoadStart = Date.now();

        this.type = type;

        log.info(`####################\nLoading plugins for ${type}...`);

        var pluginFolders = [
            ss.pluginsDirDefault,
            ss.pluginsDir,
        ];

        this.pluginsList = [];

        for (const pluginFolder of pluginFolders) {
            const dirs = fs.readdirSync(pluginFolder);
            for (const dir of dirs) {
                const dirPath = path.join(pluginFolder, dir);
                if (fs.statSync(dirPath).isDirectory()) {
                    this.pluginsList.push(dir);
                };
            };
        };
        
        console.log("pluginsList", this.pluginsList);

        const allPluginObjectsDirArrays = await Promise.all(
            pluginFolders.map(pluginsDir => this.preloadPluginsFromDir(pluginsDir, type, ss))
        );

        const allPluginObjects = allPluginObjectsDirArrays.flat();

        const pluginBeforeStart = Date.now();

        for (const pluginObject of allPluginObjects) {
            if (!pluginObject) continue;
            try {
                const timeToStartPlugin = Date.now();
                const { PluginMeta, Plugin } = pluginObject.Plugin;
                log.info(`Starting plugin -> ${PluginMeta.identifier}`);

                const pluginInstance = new Plugin(this, pluginObject.pluginFolder);
                this.plugins[PluginMeta.identifier || pluginObject.pluginFolder] = pluginInstance;
                log.success(`Loaded plugin -> ${PluginMeta.name} v${PluginMeta.version} by ${PluginMeta.author}: ${PluginMeta.descriptionShort} (load: ${pluginObject.timeToLoadFiles}ms | preload: ${pluginObject.timeToDoDeps}ms | start: ${Date.now() - timeToStartPlugin}ms)`);
            } catch (error) {
                log.error(`Failed to initialize plugin from folder ${pluginObject?.pluginFolder}:`, error);  
            };
        };

        log.bgGreen(`Finished starting plugins in`, Date.now() - pluginBeforeStart, "ms");

        log.info(`Finished loading plugins in ${Date.now() - pluginLoadStart}ms.\n####################`);
    };

    onConstructor (pluginMeta) {
        return (event, listener) => {
            this.on(event, listener, pluginMeta.identifier);
        };
    }

    on (event, listener, by = "<anonymous>") { //when a plugin registers a listener
        if (isServer) log.purple(by, "registering emitter", event);
        else console.log(by, "registering emitter", event);

        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
    };

    async emit(event, ...args) { //when the main program emits an event
        this.cancel = false;

        event = `${this.type}:${event}`;

        // console.log("emitting event", event);

        if (this.listeners[event]) {
            for (const listener of this.listeners[event]) {
                try {
                    if (isObject(args[0])) {
                        args[0].EVENT = event;
                    };
                    await listener(...args, this);
                } catch (error) {
                    console.error(`Error in listener for event ${event}:`, error);
                };
            };
        };
    };

    // unloadPlugins() {
    //     this.plugins.forEach((plugin, name) => {
    //         if (typeof plugin.onUnload === 'function') plugin.onUnload();
    //         this.plugins.delete(name);
    //         console.log(`Unloaded plugin: ${name}`);
    //     });
    //     this.listeners = {};
    // };
};

export const plugins = new PluginManager();