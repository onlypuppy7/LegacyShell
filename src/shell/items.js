//legacyshell: items
//

import { isServer } from "#constants";

// [LS] ItemActor CONSTRUCTOR
function ItemActor(kind) {
    this.kind = kind;
    this.scene = gameScene;
};
ItemActor.prototype.update = function (delta) {
    this.mesh.rotation.y += .03 * delta
};
ItemActor.prototype.remove = function () {
    this.mesh.setEnabled(false)
};

// [LS] AmmoActor CONSTRUCTOR
function AmmoActor() {
    ItemActor.call(this, ItemTypes.AMMO);
    this.mesh = this.scene.getMeshByName("ammo").createInstance("");
    this.mesh.setEnabled(false);
    shadowGen && shadowGen.getShadowMap().renderList.push(this.mesh)
};
AmmoActor.prototype = Object.create(ItemActor.prototype);
AmmoActor.prototype.constructor = ItemActor;

// [LS] GrenadeItemActor CONSTRUCTOR
function GrenadeItemActor() {
    ItemActor.call(this, ItemTypes.GRENADE);
    this.mesh = this.scene.getMeshByName("grenadeItem").createInstance("");
    this.mesh.setEnabled(false);
    shadowGen && shadowGen.getShadowMap().renderList.push(this.mesh)
};
GrenadeItemActor.prototype = Object.create(ItemActor.prototype);
GrenadeItemActor.constructor = ItemActor;

export class dummyItem {
    constructor() {
        // this.mesh = {};
        // this.mesh.position = {};
    };
    remove () {
        console.log("definitely removed ;)");
    };
};

export const AllItems = [
    {
        name: "Ammo",
        codeName: "AMMO",
        actor: AmmoActor,
        poolSize: 100
    },
    {
        name: "Grenade",
        codeName: "GRENADE",
        actor: GrenadeItemActor,
        poolSize: 20
    }
];

export const ItemTypes = {};

export const ItemConstructors = [];

AllItems.forEach((item, index) => {
    ItemTypes[item.codeName] = index;
    if (isServer) item.actor = dummyItem;
    ItemConstructors.push([item.actor, item.poolSize]);
    item.id = index;
});

