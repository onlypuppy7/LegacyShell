//legacyshell: item manager
import { Pool } from "#pool";
import { isClient, isServer, ItemTypes } from '#constants';
//

export class ItemManagerConstructor {
    constructor (){
        if (isClient) {
            this.Constructors = [AmmoActor, GrenadeItemActor];
        } else {
            this.Constructors = [function (){}, function (){}];
        };

        this.pools = [
            new Pool(() => { return new this.Constructors[ItemTypes.AMMO] }, 100),
            new Pool(() => { return new this.Constructors[ItemTypes.GRENADE] }, 20)
        ];
    };

    update (delta) {
        for (var k = 0; k < this.pools.length; k++) this.pools[k].forEachActive(function (item) {
            item.update(delta), item.mesh.isVisible = isMeshVisible(item.mesh)
        });
    };
    spawnItem (id, kind, x, y, z) {
        var item = this.pools[kind].retrieve(id);
        item.mesh.setEnabled(true);
        item.mesh.position.x = x;
        item.mesh.position.y = y;
        item.mesh.position.z = z;
        testing && item.mesh.freezeWorldMatrix()
    };
    collectItem (kind, id) {
        this.pools[kind].recycle(this.pools[kind].objects[id]), this.pools[kind].objects[id].remove()
    };
    recycleAllItems () {
        for (var that = this, k = 0; k < this.pools.length; k++) this.pools[k].forEachActive(function (item) {
            that.pools[k].recycle(item), item.remove()
        })
    };
};