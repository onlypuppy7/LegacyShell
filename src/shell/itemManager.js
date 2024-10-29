//legacyshell: item manager
import { Pool } from "#pool";
import { isClient, isServer, MAP } from '#constants';
import { ItemTypes, ItemConstructors } from '#items';
//

export class ItemManagerConstructor {
    constructor() {
        this.pools = [];
        ItemConstructors.forEach((itemConstructor) => {
            this.pools.push(new Pool(() => { return new itemConstructor[0]() }, itemConstructor[1]));
        });
    };

    update(delta) {
        for (var k = 0; k < this.pools.length; k++) this.pools[k].forEachActive(function (item) {
            item.update(delta), item.mesh.isVisible = isMeshVisible(item.mesh)
        });
    };

    spawnItem(id, kind, x, y, z) {
        var pool = this.pools[kind]
        id = typeof(id) === "number" ? id : pool.getFreeId();
        var item = pool.retrieve(id);
        
        if (isServer) {
            item.x = x;
            item.y = y;
            item.z = z;
        } else {
            item.mesh.setEnabled(true);
            item.mesh.position.x = x;
            item.mesh.position.y = y;
            item.mesh.position.z = z;
            testing && item.mesh.freezeWorldMatrix();
        };
        return item;
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
    };

    checkBelow(x, y, z, compileData) {
        return this.checkPosition(x, y - 1, z, compileData);
    };
};