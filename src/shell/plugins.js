//(server-only-start)
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
//(server-only-end)

export class PluginManager {
    constructor(type) {
        this.plugins = {};
        this.listeners = {};
        this.type = type || 'game';
        this.installQueue = Promise.resolve();
    };

    // A real plugin folder per the plugin contract: a directory, not disabled (leading "_"), with
    // an index.js. Excludes incidental directories that could end up alongside plugins (e.g. an
    // errant node_modules) from being treated as plugins themselves.
    isPluginFolder(dirPath, name) {
        return fs.statSync(dirPath).isDirectory() && !name.startsWith("_") && fs.existsSync(path.join(dirPath, 'index.js'));
    };

    // Deliberately a plain filesystem check, not require.resolve(dependency). Node's CJS resolver
    // caches a *negative* lookup for a bare specifier for the rest of the process — confirmed by
    // direct testing: probing with require.resolve, installing the package via a child npm process,
    // then probing again in the same process still reports "not found" even though a brand new
    // process resolves it fine. Since installMissingDependencies has to probe before it knows what's
    // missing, that resolve call itself poisons the cache for exactly the packages it's about to
    // install, so every later check in the same boot (including this one, if it used resolve) would
    // keep reporting "missing" post-install and re-trigger single-package fallback installs — which
    // is what actually re-introduces the prune-each-other bug this whole rework exists to avoid.
    isDependencyInstalled(dependency) {
        return fs.existsSync(path.join(ss.rootDir, 'node_modules', dependency));
    };

    async retrieveDependenciesCreatePluginObject(pluginFolder) {
        const pluginObject = {pluginFolder};
        const timeBeforeLoadFiles = Date.now();

        const dependenciesPath = path.join(pluginFolder, 'dependencies.js');
        if (fs.existsSync(dependenciesPath)) {
            pluginObject.dependencies = await import(pathToFileURL(dependenciesPath).href);
        };

        pluginObject.currentHash = execSync(`cd ${path.join(pluginFolder)} && git rev-parse HEAD`, { encoding: 'utf-8' }).trim();

        pluginObject.timeToLoadFiles = Date.now() - timeBeforeLoadFiles;

        return pluginObject;
    };

    async preloadPlugin(dirPath, pluginFolder) {
        try {
            log.boldGray("preloading plugin folder", pluginFolder);
            const pluginObject = await this.retrieveDependenciesCreatePluginObject(dirPath);
            if (!pluginObject) return;

            const { currentHash } = pluginObject.currentHash;
            const { dependencies } = pluginObject?.dependencies || {};
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

            console.log(pluginFolder, "dependencies", dependencies, !!dependencies);

            if (dependencies) {
                for (const [dependency, version] of Object.entries(dependencies)) {
                    // console.log(`Checking dependency for plugin ${dirPath}:`, dependency, version);
                    if (version === "plugin") {
                        if (this.pluginsList.includes(dependency)) {
                            log.green(`Plugin dependency ${dependency} found`);
                        } else {
                            failed = `This plugin requires another plugin to work: ${dependency}.\nInstall it and move it to the plugins folder.\nAlready installed? Ensure the folder name matches exactly.`;
                            log.red(`Plugin dependency ${dependency} not found`);
                        };
                    } else {
                        if (this.isDependencyInstalled(dependency)) {
                            // log.dim(`${dependency} is already installed.`);
                        } else {
                            log.warning(`${dependency} is not installed. Attempting to install (${version})...`);
                            // Fallback only — loadPlugins() batch-installs everything up front so this
                            // shouldn't normally fire. Serialized (installQueue) so that if it ever does
                            // fire more than once in the same boot, calls don't race each other; still
                            // just a single package per call though, so unlike installMissingDependencies
                            // this fallback path can still prune an unrelated undeclared package if two
                            // different missing dependencies both hit this path in the same boot.
                            const installPromise = this.installQueue.catch(() => {}).then(() => {
                                const result = execSync(`npm install ${dependency}@${version} --no-save`).toString();
                                console.log(`Install result:\n`, result);
                            });
                            this.installQueue = installPromise.catch(() => {});
                            await installPromise;
                        };
                    };
                };
            };

            if (failed) {
                log.error(`Plugin ${dirPath} couldn't be loaded:\n${failed}`);
                return null;
            };
        
            const pluginPath = path.join(dirPath, 'index.js');
            pluginObject.Plugin = await import(pathToFileURL(pluginPath).href);

            pluginObject.timeToDoDeps = Date.now() - timeBeforeDeps;

            return pluginObject;
        } catch (error) {
            log.error(`Failed to preload plugin ${dirPath}:`, error);
            return null;
        };
    };

    // Giving plugins_default/ or plugins/ their own package.json (to scope npm installs away from
    // the tracked root one) was tried and reverted: Node resolves the project's #hashtag `imports`
    // map (#comm, #misc, #constants, ...) against the *nearest* package.json, so any package.json
    // placed between the root and a plugin file cuts that plugin off from the root's imports map
    // entirely — breaking virtually every plugin's imports. Dependencies have to keep landing in
    // the shared root node_modules.
    //
    // npm's "extraneous package" pruning runs on every `npm install` call, against whatever's
    // declared in the adjacent package.json. With --no-save (so the tracked root package.json is
    // never touched), any package not explicitly part of *that* install call is "extraneous" and
    // gets pruned — including one a previous, separate call had just installed. The fix: whenever
    // anything is missing, request the full set of currently-required plugin dependencies in one
    // call, not just the missing ones, so nothing already-present-but-undeclared gets left out and
    // pruned. If nothing is missing, skip npm entirely — no call means nothing to prune, which is
    // how already-installed dependencies keep working across restarts without ever being declared.
    async installMissingDependencies(pluginFolders) {
        const required = new Map();
        let anyMissing = false;

        for (const baseDir of pluginFolders) {
            if (!fs.existsSync(baseDir)) continue;

            for (const dir of fs.readdirSync(baseDir)) {
                const dirPath = path.join(baseDir, dir);
                if (!this.isPluginFolder(dirPath, dir)) continue;

                const dependenciesPath = path.join(dirPath, 'dependencies.js');
                if (!fs.existsSync(dependenciesPath)) continue;

                const { dependencies } = await import(pathToFileURL(dependenciesPath).href);
                if (!dependencies) continue;

                for (const [dependency, version] of Object.entries(dependencies)) {
                    if (version === "plugin") continue;
                    required.set(dependency, version);
                    if (!this.isDependencyInstalled(dependency)) anyMissing = true;
                };
            };
        };

        if (!anyMissing || required.size === 0) return;

        const specs = [...required.entries()].map(([dependency, version]) => `${dependency}@${version}`);
        log.warning(`Installing plugin dependencies in one batch (some were missing): ${specs.join(', ')}...`);
        const result = execSync(`npm install ${specs.join(' ')} --no-save`).toString();
        console.log(`Batch install result:\n`, result);
    };

    async preloadPluginsFromDir(pluginsDir, type, newSS) {
        try {
            if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

            const promises = [];
            const pluginsPreloadStart = Date.now();

            const pluginFolders = fs.readdirSync(pluginsDir);

            for (const pluginFolder of pluginFolders) {
                const dirPath = path.join(pluginsDir, pluginFolder);
                if (this.isPluginFolder(dirPath, pluginFolder)) {
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
                // Deliberately doesn't exclude "_"-disabled plugins here (unlike isPluginFolder) —
                // 'plugin' dependency checks below match against this list by folder name regardless
                // of whether the dependency itself is currently enabled. Does exclude incidental
                // directories like the scoped node_modules installMissingDependencies creates.
                if (fs.statSync(dirPath).isDirectory() && fs.existsSync(path.join(dirPath, 'index.js'))) {
                    this.pluginsList.push(dir);
                };
            };
        };
        
        console.log("pluginsList", this.pluginsList);

        await this.installMissingDependencies(pluginFolders);

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