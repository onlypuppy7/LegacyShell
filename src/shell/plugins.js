//legacyshell: basic
import fs from 'fs';
import path from 'path';
//legacyshell: plugins
import { fileURLToPath, pathToFileURL } from 'url';
import { isServer } from '#constants';
import { exec, execSync } from 'child_process';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: logging
import log from '#coloured-logging';
//

export class PluginManager {
    constructor(type) {
        this.plugins = {};
        this.listeners = {};
        this.type = type || 'game';
    };

    async loadPluginsFromDir(pluginsDir, type, newSS) {
        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        const pluginFolders = fs.readdirSync(pluginsDir);
        for (const pluginFolder of pluginFolders) {
            try {
                const pluginPath = path.join(pluginsDir, pluginFolder, 'index.js');
                if (fs.existsSync(pluginPath) && !pluginFolder.startsWith("_")) {
                    (async () => {
                        const gitPath = path.join(pluginsDir, pluginFolder, '.git');
                        const currentHash = execSync(`cd ${path.join(pluginsDir, pluginFolder)} && git rev-parse HEAD`, { encoding: 'utf-8' }).trim();

                        try {
                            if (fs.existsSync(gitPath)) {
                                log.info(`Plugin ${pluginFolder} has a git repository. Attempting to update... (current hash: ${currentHash})`);
                                exec(`cd ${path.join(pluginsDir, pluginFolder)} && git pull`, (error, stdout, stderr) => {
                                    if (error) {
                                        log.warning(`Failed to update plugin ${pluginFolder} via git:`, error);
                                        return;
                                    };

                                    const newHash = execSync(`cd ${path.join(pluginsDir, pluginFolder)} && git rev-parse HEAD`, { encoding: 'utf-8' }).trim();
                                    if (currentHash !== newHash) {
                                        log.bgGreen(`Plugin ${pluginFolder} updated successfully. (new hash: ${newHash})`);
                                    } else {
                                        log.dim(`[stdout] ${stdout}${(stderr && stderr !=="") ? "[ERROR!] "+stderr+"\n" : ''}Plugin ${pluginFolder} is already up to date.`);
                                    };
                                });
                            };
                        } catch (error) {
                            log.warning(`Failed to update plugin ${pluginFolder} via git:`, error);
                        };
                    })();

                    const dependenciesPath = path.join(pluginsDir, pluginFolder, 'dependencies.js');

                    if (fs.existsSync(dependenciesPath)) {
                        const { dependencies } = await import(pathToFileURL(dependenciesPath).href);
                        for (const [dependency, version] of Object.entries(dependencies)) {
                            try {
                                const modulePath = path.join(ss.rootDir, 'node_modules', dependency);
                                if (!fs.existsSync(modulePath)) {
                                    await import(dependency);
                                };
                                // log.dim(`${dependency} is already installed.`);
                            } catch (error) {
                                log.warning(`${dependency} is not installed. Attempting to install (${version})...`);
                                execSync(`npm install ${dependency}@${version} --no-save`, (error, stdout, stderr) => {
                                    if (error) {
                                        console.error(`exec error: ${error}`);
                                        return;
                                    };
                                    console.log(`stdout: ${stdout}`);
                                    console.error(`stderr: ${stderr}`);
                                });
                            };
                        };
                    };

                    const pluginURL = pathToFileURL(pluginPath).href;
                    
                    const { PluginMeta, Plugin } = await import(pluginURL);

                    // console.log(PluginMeta);

                    const pluginInstance = new Plugin(this, path.join(pluginsDir, pluginFolder));
                    this.plugins[PluginMeta.identifier || pluginFolder] = pluginInstance;
                    log.success(`Loaded plugin -> ${PluginMeta.name} v${PluginMeta.version} by ${PluginMeta.author}: ${PluginMeta.descriptionShort}`);
                };
            } catch (error) {
                log.error(`Failed to load plugin ${pluginFolder}:`, error);
            };
        };
    };

    async loadPlugins(type) {
        this.type = type;

        log.info(`####################\nLoading plugins for ${type}...`);

        await this.loadPluginsFromDir(ss.pluginsDir, type, ss);
        await this.loadPluginsFromDir(ss.pluginsDirDefault, type, ss);

        log.info('Finished loading plugins.\n####################');
    };

    on(event, listener) { //when a plugin registers a listener
        if (isServer) log.purple("registering emitter", event);
        else console.log("registering emitter", event);

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