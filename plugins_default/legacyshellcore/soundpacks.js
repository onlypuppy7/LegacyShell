if (typeof LegacyThemesPlugin !== 'undefined') {
    LegacyThemesPlugin.soundPacks.push({
        name: "Minecraft",
        identifier: "minecraft",
        description: "Minecraft sounds for your eggs and guns.",
        sounds: {
            "death.scream": Array.from({ length: 10 }, (_, i) => `/sounds/minecraft/death/scream${i + 1}.mp3`),
            "eggk47.fire": "/sounds/minecraft/eggk47/fire.mp3",
            "eggk47.dryFire": "/sounds/minecraft/eggk47/dry fire.mp3",
            "eggk47.cycle": "/sounds/minecraft/eggk47/full cycle.mp3",
            "eggk47.insertMag": "/sounds/minecraft/eggk47/insert mag.mp3",
            "eggk47.removeMag": "/sounds/minecraft/eggk47/remove mag.mp3",
            "dozenGauge.fire": "/sounds/minecraft/dozenGauge/fire.mp3",
            "dozenGauge.open": "/sounds/minecraft/dozenGauge/open.mp3",
            "dozenGauge.close": "/sounds/minecraft/dozenGauge/close.mp3",
            "csg1.fire": "/sounds/minecraft/csg1/fire.mp3",
            "csg1.releaseAction": "/sounds/minecraft/csg1/release action.mp3",
            "cluck9mm.fire": "/sounds/minecraft/cluck9mm/fire.mp3",
            "cluck9mm.removeMag": "/sounds/minecraft/cluck9mm/remove mag.mp3",
            "cluck9mm.insertMag": "/sounds/minecraft/cluck9mm/insert mag.mp3",
            "rpegg.fire": "/sounds/minecraft/rpegg/rocketfire.mp3",
            "rpegg.fly": "/sounds/minecraft/rpegg/rocketfly.mp3",
            "rpegg.explode": "/sounds/minecraft/rpegg/rockethit.mp3",
            "rpegg.load": "/sounds/minecraft/rpegg/rocketload.mp3",
            "rpegg.poof": "/sounds/minecraft/rpegg/rocketpoof.mp3",
            "m24.boltClose": "/sounds/minecraft/m24/boltClose.mp3",
            "m24.boltOpen": "/sounds/minecraft/m24/boltOpen.mp3",
            "m24.fire": "/sounds/minecraft/m24/fire.mp3",
            "grenade.explode": "/sounds/minecraft/grenade.mp3",
            "grenade.beep": "/sounds/minecraft/grenadeBeep.mp3",
            "grenade.pin": "/sounds/minecraft/grenadePin.mp3",
            "ammo": "/sounds/minecraft/ammo.mp3",
            "shellBurst": "/sounds/minecraft/shellBurst.mp3",
            "hit": "/sounds/minecraft/hit.mp3"
        },
        images: [
            '/sounds/minecraft/cover.png'
        ]
    });
};
