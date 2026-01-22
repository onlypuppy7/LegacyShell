const WhatsAppThemePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;
    },
};

WhatsAppThemePlugin.registerListeners(plugins);

LegacyThemesPlugin.stylePacks.push({
    name: "WhatsApp Theme",
    identifier: "whatsapptheme",
    description: "A theme that makes LegacyShell look like WhatsApp.",
    cssFile: "/themes/whatsapptheme/whatsapptheme.css",
    images: [
        '/themes/whatsapptheme/img/logo.png',
        '/themes/whatsapptheme/img/egg_icon.png',
        '/themes/whatsapptheme/img/egg_icon_alt.png',
    ]
});