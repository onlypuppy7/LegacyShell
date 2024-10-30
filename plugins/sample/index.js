export const PluginMeta = {
    name: 'Glitchy Room',
    version: '1.0.0',
    descriptionShort: 'A sample plugin',
    descriptionLong: 'A sample plugin',
    legacyShellVersion: 264,
};

export class Plugin {
    constructor(pluginManager) {
        this.pluginManager = pluginManager;

        // console.log('Loading sample plugin...');

        pluginManager.on('servicesOnLoad', this.handleEvent.bind(this));
    };

    handleEvent(data) {
        // console.log('Plugin received event data:', data);
    };

    onUnload() {
        console.log('Unloading Plugin');
    };
};