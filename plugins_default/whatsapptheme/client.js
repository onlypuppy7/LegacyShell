const WhatsAppThemePlugin = {
    registerListeners: function (pluginManager) {
        this.plugins = pluginManager;
    },
};

WhatsAppThemePlugin.registerListeners(plugins);

LegacyThemesPlugin.stylePacks.push({
    name: "WhatsApp Theme",
    identifier: "whatsapptheme",
    description: "A theme that makes LegacyShell look like WhatsApp.\nAn example theme made by onlypuppy7",
    cssFile: "/themes/whatsapptheme/whatsapptheme.css",
    author: "onlypuppy7",
    images: [
        '/themes/whatsapptheme/img/logo.png',
        '/themes/whatsapptheme/img/anim_chicken.gif',
        '/themes/whatsapptheme/img/egg_icon.png',
        '/themes/whatsapptheme/img/whatsapp.png',
        '/themes/whatsapptheme/img/whatsappcar.png',
        '/themes/whatsapptheme/img/whatsappgame.png',
        '/themes/whatsapptheme/img/whatsapphorse.png',
        '/themes/whatsapptheme/img/whatsappdog.png',
        '/themes/whatsapptheme/img/whatsappchicken.jpg',
        '/themes/whatsapptheme/img/whatsapp2.png',
        '/themes/whatsapptheme/img/whatsappdrink.png',
        '/themes/whatsapptheme/img/whatsappversions.png',
    ]
});