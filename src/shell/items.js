//legacyshell: items
import { isServer } from "#constants";
//

// [LS] ItemActor CONSTRUCTOR
export class ItemActor {
    constructor(item) {
        this.kind = item.id;
        this.scene = gameScene;

        this.mesh = this.scene.getMeshByName(item.mesh).createInstance("");
        this.mesh.setEnabled(false);
        shadowGen && shadowGen.getShadowMap().renderList.push(this.mesh)
    };
    update(delta) {
        this.mesh.rotation.y += .03 * delta;
    };
    remove() {
        this.mesh.setEnabled(false);
    };
};

//example code below for different anims

// export class altItemActor extends ItemActor {
//     constructor(item) {
//         super(item);
//     };

//     update(delta) {
//         this.mesh.rotation.x += .03 * delta;
//         this.mesh.rotation.y += .01 * delta;
//         this.mesh.rotation.z += .05 * delta;
//     };
// };

export class dummyItem {
    constructor() {
    };
    remove () {
        console.log("definitely removed ;)");
    };
};

export const AllItems = [
    {
        codeName: "AMMO",
        mesh: "ammo",
        name: "Ammo",
        actor: ItemActor,
        poolSize: 100
    },
    {
        codeName: "GRENADE",
        mesh: "grenadeItem",
        name: "Grenade",
        actor: ItemActor,
        poolSize: 20
    }
];

export const ItemTypes = {};

// export const ItemConstructors = [];

AllItems.forEach((item, index) => {
    ItemTypes[item.codeName] = index;
    if (isServer) item.actor = dummyItem;
    // ItemConstructors.push([item.actor, item.poolSize, item]);
    item.id = index;
});

