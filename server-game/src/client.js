//legacyshell: client
import ran from '#scrambled';
import Comm from '#comm';
import { ItemType } from '#constants';
import Player from '#player';
import CatalogConstructor from '#catalog';
//

let ss, catalog;

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

        this.setEquippedItem()

        //wip
        this.player = new Player({
            id: info.id,
            uniqueId: info.account_id,
            nickname: info.nickname,
            classIdx: info.classIdx, // weapon class
            team: 0, //info.team,
            primaryWeaponItem: catalog.findItemBy8BitItemId(ItemType.Primary, classIdx, input.unPackInt8U()),
            secondaryWeaponItem: catalog.findItemBy8BitItemId(ItemType.Secondary, classIdx, input.unPackInt8U()),
            shellColor: input.unPackInt8U(),
            hatItem: catalog.findItemBy8BitItemId(ItemType.Hat, classIdx, input.unPackInt8U()),
            stampItem: catalog.findItemBy8BitItemId(ItemType.Stamp, classIdx, input.unPackInt8U()),
            x: input.unPackFloat(),
            y: input.unPackFloat(),
            z: input.unPackFloat(),
            dx: input.unPackFloat(),
            dy: input.unPackFloat(),
            dz: input.unPackFloat(),
            yaw: input.unPackRadU(),
            pitch: input.unPackRad(),
            score: input.unPackInt32U(),
            kills: input.unPackInt16U(),
            deaths: input.unPackInt16U(),
            streak: input.unPackInt16U(),
            totalKills: input.unPackInt32U(),
            totalDeaths: input.unPackInt32U(),
            bestGameStreak: input.unPackInt16U(),
            bestOverallStreak: input.unPackInt16U(),
            shield: input.unPackInt8U(),
            hp: input.unPackInt8U(),
            playing: input.unPackInt8U(),
            weaponIdx: input.unPackInt8U(),
            controlKeys: input.unPackInt8U(),
            randomSeed: input.unPackInt16U(),
            upgradeProductId: input.unPackInt8U()
        }, this.room.scene);
        // console.log("kek", info, room);
    };

    setEquippedItem() {

    };
};

export default {
    setSS,
    newClient,
};