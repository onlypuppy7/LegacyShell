//legacyshell: items
import { isClient, isServer } from "#constants";
//legacyshell: plugins
import { plugins } from '#plugins';
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
        poolSize: 100,
        collect: function (player, applyToWeaponIdx) {
            const ammoCollected = player.weapons[applyToWeaponIdx].collectAmmo();
            if (!ammoCollected) return false;

            if (player.actor) {
                playSoundIndependent2D("ammo");
                //Sounds.ammo.play();
                updateAmmoUi();
            };
            return true;
        }
    },
    {
        codeName: "GRENADE",
        mesh: "grenadeItem",
        name: "Grenade",
        actor: ItemActor,
        poolSize: 20,
        collect: function (player, applyToWeaponIdx) {
            if (player.grenadeCount >= player.grenadeCapacity) return false;

            player.grenadeCount++;
            if (player.actor) {
                playSoundIndependent2D("ammo");
                //Sounds.ammo.play();
                updateAmmoUi();
            };
            return true;
        }
    },
];

export const ItemTypes = {};

// export const ItemConstructors = [];

// AllItems/itemsLoaded are extension points, but firing them here (at module-evaluation time)
// is unreliable server-side: whichever code first imports '#items' - directly or transitively,
// possibly during the plugin *preload* phase before any plugin has registered a listener - decides
// when this runs, and ES modules only evaluate once. initItems() makes this an explicit step
// instead, called once plugins are actually guaranteed to be loaded (see run-game.js, worker.js).
let itemsInitialized = false;
export async function initItems() {
    if (itemsInitialized) return;
    itemsInitialized = true;

    await plugins.emit('AllItems', { AllItems, ItemActor, dummyItem });

    AllItems.forEach((item, index) => {
        ItemTypes[item.codeName] = index;
        if (isServer) item.actor = dummyItem;
        // ItemConstructors.push([item.actor, item.poolSize, item]);
        item.id = index;
    });

    await plugins.emit('itemsLoaded', { AllItems, ItemTypes, ItemActor, dummyItem });
};

if (isClient) initItems(); // the browser bundle has no preload/instantiate split - safe to run immediately, as before