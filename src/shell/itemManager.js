//legacyshell: item manager
import { Pool } from "#pool";
import { isClient, ItemTypes } from '#constants';

export const MAP = {
    blank: 0,
    ground: 1,
    block: 2,
    column: 3,
    halfBlock: 4,
    ramp: 5,
    ladder: 6,
    tank: 7,
    lowWall: 8,
    todo3: 9,
    barrier: 10
}

export class ItemManagerConstructor {
    items = [];
    ids = [];

    currentId = 1;

    constructor() {
        if (isClient) this.Constructors = [AmmoActor, GrenadeItemActor];
        else this.Constructors = [function () { }, function () { }];

        this.pools = [
            new Pool(() => { return new this.Constructors[ItemTypes.AMMO] }, 100),
            new Pool(() => { return new this.Constructors[ItemTypes.GRENADE] }, 20)
        ];
    };

    update(delta) {
        for (var k = 0; k < this.pools.length; k++) this.pools[k].forEachActive(function (item) {
            item.update(delta), item.mesh.isVisible = isMeshVisible(item.mesh)
        });
    };

    spawnItem(id, kind, x, y, z) {
        var item = this.pools[kind].retrieve(id);
        item.mesh.setEnabled(true);
        item.mesh.position.x = x;
        item.mesh.position.y = y;
        item.mesh.position.z = z;
        testing && item.mesh.freezeWorldMatrix()
    };

    collectItem(kind, id) {
        this.pools[kind].recycle(this.pools[kind].objects[id]);
        this.pools[kind].objects[id].remove();
    };

    recycleAllItems() {
        for (var that = this, k = 0; k < this.pools.length; k++) {
            this.pools[k].forEachActive(function (item) {
                that.pools[k].recycle(item);
                item.remove();
            });
        };
    };

    // tysm rtw <33
    checkPosition(x, y, z, compileData) {
        let raw = this.getRawPosData(compileData, x, y, z);
        if (raw == {} || raw == undefined) return MAP.blank;
        if (raw.mesh == undefined) return MAP.blank;
        if (raw.mesh.id.includes("barrier")) return MAP.barrier;
        if (raw.mesh.id.includes("full")) return MAP.block;
    }

    getRawPosData(mapData, x, y, z) {
        if (
            mapData.data[x] != undefined &&
            mapData.data[y] == undefined &&
            mapData.data[z] == undefined
        ) return mapData.data[x];
        else if (
            mapData.data[x] != undefined &&
            mapData.data[y] != undefined &&
            mapData.data[z] == undefined
        ) return mapData.data[x][y];
        else if (
            mapData.data[x] != undefined &&
            mapData.data[y] != undefined &&
            mapData.data[z] != undefined
        ) return mapData.data[x][y][z];
    }

    checkBelow(x, y, z, compileData) {
        return this.checkPosition(x, y - 1, z, compileData);
    }

    allocateId() {
        if (this.ids.length > 0) this.ids.shift();
        else this.currentId++;
    }

    releaseId(id) {
        this.ids.push(id);
    }
};