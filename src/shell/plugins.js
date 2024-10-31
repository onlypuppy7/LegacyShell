//legacyshell: basic
import fs from 'fs';
import path from 'path';
//legacyshell: plugins
import { fileURLToPath, pathToFileURL } from 'url';
import { isServer } from '#constants';
//

//(server-only-start)
var ss; //trollage. access it later.
//(server-only-end)

class PluginManager {
    constructor(newSS, type) {
        this.plugins = new Map();
        this.listeners = {};
        if (isServer) {
            ss = newSS;
        };
        if (type) this.type = type;
    };

    async loadPlugins(type, pluginsDir) {
        this.type = type;

        if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });

        ss.log.info(`####################\nLoading plugins for ${type}...`);

        const pluginFolders = fs.readdirSync(pluginsDir);
        for (const pluginFolder of pluginFolders) {
            try {
                const pluginPath = path.join(pluginsDir, pluginFolder, 'index.js');
                if (fs.existsSync(pluginPath)) {
                    const pluginURL = pathToFileURL(pluginPath).href;
                    
                    const { PluginMeta, Plugin } = await import(pluginURL);

                    // console.log(PluginMeta);

                    const pluginInstance = new Plugin(this, path.join(pluginsDir, pluginFolder));
                    this.plugins.set(pluginFolder, pluginInstance);
                    ss.log.success(`Loaded plugin -> ${PluginMeta.name} v${PluginMeta.version}: ${PluginMeta.descriptionShort}`);
                };
            } catch (error) {
                ss.log.error(`Failed to load plugin ${pluginFolder}:`, error);
            };
        };

        ss.log.info('Finished loading plugins.\n####################');
    };

    on(event, listener) { //when a plugin registers a listener
        console.log("registering emitter", event);

        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(listener);
    };

    emit(event, ...args) { //when the main program emits an event
        event = `${this.type}:${event}`;

        // console.log("emitting event", event);

        if (this.listeners[event]) {
            for (const listener of this.listeners[event]) {
                listener(...args);
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

export default PluginManager;