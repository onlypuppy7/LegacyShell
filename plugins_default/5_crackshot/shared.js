//
import { Bullet } from "#bullets";
import { CharClass, classes, isClient, item_classes, item_classes_strings, itemIdOffsets, itemIdOffsetsByName, itemIdOffsetsByNameOLD, itemIdOffsetsOLD, ItemType } from "#constants";
import { Gun, CSG1 } from "#guns";
//

export const CrackshotPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (CrackshotPlugin)");

        this.plugins = pluginManager;

        this.codeName = "m24";
        this.className = "M24";
        this.classClass = M24;
        this.displayName = "Crackshot";
        this.itemIdName = "Crackshot";
        this.weirdName = "Crackshot Primary Weapons";

        this.primarySaveLoadoutName = `${this.displayName.toLowerCase()}_primary_item_id`;
        this.secondarySaveLoadoutName = `${this.displayName.toLowerCase()}_secondary_item_id`;
        this.modelName = "gun_"+this.codeName;

        this.oldItemOffset = 4200;
        this.itemOffset = 450e3;

        this.plugins.on('game:afterBullshit', this.afterBullshit.bind(this));
        this.plugins.on('game:syncToServer', this.syncToServer.bind(this));
        this.plugins.on('game:loadSounds', this.loadSounds.bind(this));
        this.plugins.on('game:reachedEnd', this.reachedEnd.bind(this));

        this.plugins.on('client:constantsFinished', this.constantsFinished.bind(this));
        this.plugins.on('game:constantsFinished', this.constantsFinished.bind(this));
        this.plugins.on('game:constantsFinished', this.constantsFinished.bind(this));
    },

    reachedEnd(data) {
        //rebalance free ranger against cs
        CSG1.rof = 30;
        CSG1.damage = 105;
        CSG1.totalDamage = CSG1.damage;
    },

    async syncToServer(data) {
        var loadout = data.loadout;

        Object.assign(loadout, {
            [this.primarySaveLoadoutName]: playerAccount.pickedWeapons[this.weaponNumber][Slot.Primary].id,
            [this.secondarySaveLoadoutName]: playerAccount.pickedWeapons[this.weaponNumber][Slot.Secondary].id,
        });

        console.log("assigned", loadout)
    },

    async saveEquipBeforeWrite(data) {
        var accs = data.accs;
        var msg = data.msg;
        var userData = data.userData;

        // primary_item_id
        if (accs.doesPlayerOwnItem(userData, msg[this.primarySaveLoadoutName], this.itemIdName)) 
            userData.loadout.primaryId[this.weaponNumber] = msg[this.primarySaveLoadoutName];
        // secondary_item_id
        if (accs.doesPlayerOwnItem(userData, msg[this.secondarySaveLoadoutName], "Cluck9mm")) 
            userData.loadout.secondaryId[this.weaponNumber] = msg[this.secondarySaveLoadoutName];
    },

    afterBullshit(data) {
        //this is real BS.
        itemRendererBabylons.push(this.modelName);
        loadObjectMeshesBabylons.push(this.modelName);
    },

    constantsFinished(data) {
        if (this.didConstanting) return;

        this.didConstanting = true;

        console.log(this.displayName, "do constanting things");

        this.weaponNumber = CharClass.length++;
        CharClass[this.itemIdName] = this.weaponNumber;

        //its so inconsistent its infuriating
        Object.assign(item_classes, {
            [this.className]: this.classClass,
            [this.weirdName]: this.classClass,
            [this.itemIdName]: this.classClass,
        });

        Object.assign(item_classes_strings, {
            [this.className]: this.className,
            [this.weirdName]: this.className,
            [this.itemIdName]: this.className,
        });

        classes.push({
            name: this.displayName,
            weapon: this.classClass
        });

        itemIdOffsetsByNameOLD[this.className] = this.oldItemOffset;
        itemIdOffsetsByNameOLD[this.itemIdName] = this.oldItemOffset;

        itemIdOffsetsOLD[ItemType.Primary][this.weaponNumber] = this.oldItemOffset - itemIdOffsetsByNameOLD.base;

        itemIdOffsetsByName[this.className] = this.itemOffset;
        itemIdOffsetsByName[this.itemIdName] = this.itemOffset;

        itemIdOffsets[ItemType.Primary][this.weaponNumber] = this.itemOffset - itemIdOffsetsByName.base;
    },
    
    loadSounds (data) {
        const additionalSounds = [
            ["sound/m24/boltClose.mp3", "m24.boltClose"],
            ["sound/m24/boltOpen.mp3", "m24.boltOpen"],
            ["sound/m24/fire.mp3", "m24.fire"]
        ];
    
        data.soundsList.push(...additionalSounds);

        devlog(this.displayName, "plugin loaded sounds list:", data.soundsList);
    },
};

var M24;

if (typeof Gun !== "undefined" && Gun) {
    // M24
    
    //to coincide with the cs/whipper, the bloom mechanics were redone
    //meaning that the new values no longer go into the old system
    //thus this is only a recreation
    
    M24 = function (player, meshName) {
        Gun.call(this, player, M24);
    
        this.ammo = {
            rounds: 1,
            capacity: 1,
            reload: 1,
            store: 20,
            storeMax: 20,
            pickup: 4
        };
    
        this.hasScope = true;
    
        // Animation times
        this.longReloadTime = 120;  // Full reload cycle
        this.shortReloadTime = 120;  // Short cycle when one is in the chamber
    
        if (isClient) this.actor = new M24Actor(this, meshName);
    };
    
    M24.prototype = Object.create(Gun.prototype);
    M24.prototype.constructor = Gun;
    
    M24.weaponName = 'M2DZ';
    M24.standardMeshName = 'm24';
    M24.rof = 15;
    M24.recoil = 10; // Frames that must elapse before swapping or reloading can happen
    M24.automatic = false;
    M24.accuracy = 0; // Base inaccuracy of weapon (0-1)
    // M24.stability = 0.1; // Controls accuracy loss per shot and rate of recovery (0-1)
    M24.shotSpreadIncrement = 250;
    M24.accuracySettleFactor = 0.98; // Controls accuracy loss per shot and rate of recovery (0-1) (previously stability: 0.1)
    M24.stillSettleSpeed = 55;
    M24.damage = 200;
    M24.totalDamage = 15; // For main menu stats (because shotgun)
    M24.range = 60;
    M24.velocity = 0.6;
    M24.tracer = 0;
    
    // Overrides from weapon analyzer (????????????????)
    
    M24.accuracy = 1;
    // M24.stability = 0.15;
    M24.damage = 400;
    M24.totalDamage = M24.damage;
    
    M24.prototype.fireMunitions = function (pos, dir) {
        Bullet.fire(this.player, pos, dir, M24);
    };
    
    //actor
    
    var M24Actor;
    
    if (isClient) {
        M24Actor = function (gun, meshName) {
            GunActor.call(this, gun, meshName);
            this.scopeFov = 0.4;
            this.scopeY = 0.1 - 0.03507;
        
            this.setup(0.6);
        
            this.fireSound = "m24.fire";
            this.dryFireSound = "eggk47.dryFire";
        
            this.addSoundEvent('reload', 10, "m24.boltOpen");
            this.addSoundEvent('reload', 75, "eggk47.insertMag");
            this.addSoundEvent('reload', 94, "m24.boltClose");
        };
        
        M24Actor.prototype = Object.create(GunActor.prototype);
        M24Actor.prototype.constructor = GunActor;
    
        CrackshotPlugin.registerListeners(plugins);
    };
} else {
    console.log("Crackshot plugin not loading, Gun class not present!");
};