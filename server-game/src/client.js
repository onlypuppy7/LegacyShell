//legacyshell: client
import ran from '#scrambled';
import Comm from '#comm';
import { ItemType, itemIdOffsets } from '#constants';
import Player from '#player';
import CatalogConstructor from '#catalog';
import extendMath from '#math';
//

let ss, catalog;
extendMath(Math);

function setSS(newSS) {
    ss = newSS;
    catalog = new CatalogConstructor(ss.items);
};

class newClient {
    constructor(room, info, ws) {
        this.room = room;
        this.ws = ws;
        this.userData = info.userData;
        this.sessionData = info.sessionData;

        this.loadout = {};
        //gun skins
        this.setEquippedItem(ItemType.Primary, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Primary, info.classIdx, info.primary_item_id));
        this.setEquippedItem(ItemType.Secondary, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Secondary, info.classIdx, info.secondary_item_id));
        //cosmetics
        this.setEquippedItem(ItemType.Hat, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Hat, info.classIdx, info.hatId));
        this.setEquippedItem(ItemType.Stamp, info.classIdx, catalog.findItemBy8BitItemId(ItemType.Stamp, info.classIdx, info.stampId));

        //wip
        this.player = new Player({
            id: info.id,
            uniqueId: info.account_id,
            nickname: info.nickname,
            classIdx: info.classIdx, // weapon class
            team: 0, //info.team,

            primaryWeaponItem: this.loadout[ItemType.Primary],
            secondaryWeaponItem: this.loadout[ItemType.Secondary],
            shellColor: Math.clamp(Math.floor(info.colorIdx), 0, 7),
            hatItem: this.loadout[ItemType.Hat],
            stampItem: this.loadout[ItemType.Stamp],

            x: 15,
            y: 5,
            z: 5,
            dx: 0,
            dy: 0,
            dz: 0,
            yaw: 0,
            pitch: 0,

            score: 0,
            kills: 0,
            deaths: 0,
            streak: 0,
            totalKills: 0,
            totalDeaths: 0,
            bestGameStreak: 0,
            bestOverallStreak: 0,

            shield: 0,
            hp: 100,

            playing: 0,
            weaponIdx: 0, // prim/sec: 0/1 (it's Slot in #constants)

            controlKeys: 0,
            randomSeed: 0,

            upgradeProductId: this.userData.upgradeProductId
        }, this.room.scene);
        // console.log("kek", info, room);
    };

    setEquippedItem(itemType, classIdx, item) { //itemType: stamp/hat/prim/sec, classIdx: eggk/shotgun etc
        console.log(itemType, classIdx, item);
        let itemId = 0;
        if (
            this.userData // player has an account
            && (item.exclusive_for_class === classIdx) && (item.item_type_id === itemType) // item is valid
            && this.userData.ownedItemIds.includes(item.id) // item is owned
        ) { 
            console.log("custom");
            itemId = item.id;
        } else { // no account, no skins! go screw yourself.
            console.log("default");
            switch (itemType) {
                case ItemType.Hat:
                    itemId = null;
                    break;
                case ItemType.Stamp:
                    itemId = null;
                    break;
                case ItemType.Primary:
                    itemId += itemIdOffsets[ItemType.Primary].base;
                    itemId += itemIdOffsets[ItemType.Primary][classIdx];
                    break;
                case ItemType.Secondary:
                    itemId += itemIdOffsets[ItemType.Secondary];
                    break;
            };
        };
        this.loadout[itemType] = itemId;
        console.log(this.loadout[itemType])
    };
};

export default {
    setSS,
    newClient,
};