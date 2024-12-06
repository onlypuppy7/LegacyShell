//legacyshell: catalog
import { isClient, ItemType, CharClass, Slot, item_classes, itemIdOffsets, itemIdOffsetsOLD, itemIdOffsetsByName, itemIdOffsetsByNameOLD, devlog } from '#constants';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import events from '#events';
import extendMath from '#math';
//

//(server-only-start)
//(server-only-end)

// [LS] Catalog CONSTRUCTOR
export class CatalogConstructor {
    constructor (importedItems) {
        if (null == importedItems) throw "Items is undefined or null, cannot create Catalog";
        this.isSetup = false;
        this.Items = importedItems;
        false === this.isSetup && this.setupCatalog();
    };

    filterItems (itemList, filterFunc) {
        var filteredItems = [];
        for (var i = 0; i < itemList.length; i++) {
            if (filterFunc(itemList[i])) {
                filteredItems.push(itemList[i]);
            };
        };
        return filteredItems;
    };
    findItemInListById (itemId, itemList) {
        return findItemInListById(itemId, itemList); //i want to use this
    };
    findItemById (itemId) {
        return this.findItemInListById(itemId, this.Items)
    };
    findItemBy8BitItemId (itemType, classIdx, itemId8Bit, itemIdOffsetsP = itemIdOffsets) {
        if (!this.isSetup) {
            this.setupCatalog();
        };
        if (classIdx === undefined || classIdx >= CharClass.length) {
            return null;
        };
        var realItemId = itemId8Bit;
        switch (itemType) {
            case ItemType.Hat:
                if (itemId8Bit === 0) return null;
                realItemId += itemIdOffsetsP[itemType];
                return this.findItemInListById(realItemId, this.hats);
            case ItemType.Stamp:
                if (itemId8Bit === 0) return null;
                realItemId += itemIdOffsetsP[itemType];
                return this.findItemInListById(realItemId, this.stamps);
            case ItemType.Primary:
                realItemId += itemIdOffsetsP[itemType].base;
                realItemId += itemIdOffsetsP[itemType][classIdx];
                console.log(realItemId, this.findItemInListById(realItemId, this.forClass[classIdx].forWeaponSlot[Slot.Primary]));
                return this.findItemInListById(realItemId, this.forClass[classIdx].forWeaponSlot[Slot.Primary]);
            case ItemType.Secondary:
                realItemId += itemIdOffsetsP[itemType];
                return this.findItemInListById(realItemId, this.forClass[classIdx].forWeaponSlot[Slot.Secondary])
        }
    };
    //its not really 8bit any more
    get8BitItemId (item, classIdx, itemIdOffsetsP = itemIdOffsets) {
        if (item === null) return 0;
        if (!this.isSetup) {
            this.setupCatalog();
        };
        
        if (classIdx === undefined || classIdx >= CharClass.length) {
            return null;
        };
        var itemId8Bit = item.id;
        switch (item.item_type_id) {
            case ItemType.Hat:
                if (itemId8Bit === 0) return null;
                itemId8Bit -= itemIdOffsetsP[ItemType.Hat];
                break;
            case ItemType.Stamp:
                if (itemId8Bit === 0) return null;
                itemId8Bit -= itemIdOffsetsP[ItemType.Stamp];
                break;
            case ItemType.Primary:
                itemId8Bit -= itemIdOffsetsP[ItemType.Primary].base;
                itemId8Bit -= itemIdOffsetsP[ItemType.Primary][classIdx];
                break;
            case ItemType.Secondary:
                itemId8Bit -= itemIdOffsetsP[ItemType.Secondary];
                break;
        };
        return itemId8Bit;
    };    
    addWeaponFunctions (weaponItem) {
        weaponItem.instantiateNew = function (avatar) {
            const ItemClass = item_classes[this.item_data.class];
            var instance = new ItemClass(avatar, this.item_data.meshName);
            return avatar.actor && avatar.actor.setWeaponSkeleton(instance.actor.skeleton), instance
        }
    };
    getTaggedItems (tag) {
        return this.filterItems(this.Items, function (item) {
            if (void 0 !== item.item_data.tags && null !== item.item_data.tags && 0 < item.item_data.tags.length)
                for (var i = 0; i < item.item_data.tags.length; i++)
                    if (item.item_data.tags[i] === tag) return true;
            return false
        })
    };
    setupCatalog () {
        this.hats = [], this.stamps = [], this.primaryWeapons = [], this.secondaryWeapons = [], this.forClass = [];
        for (var i = 0; i < this.Items.length; i++) switch (this.Items[i].item_type_id) {
            case ItemType.Hat:
                this.hats.push(this.Items[i]);
                break;
            case ItemType.Stamp:
                this.stamps.push(this.Items[i]);
                break;
            case ItemType.Primary:
                this.primaryWeapons.push(this.Items[i]), this.addWeaponFunctions(this.Items[i]);
                break;
            case ItemType.Secondary:
                this.secondaryWeapons.push(this.Items[i]), this.addWeaponFunctions(this.Items[i])
        }
        for (var cIdx = 0; cIdx < CharClass.length; cIdx++) {
            var isFreeSharedFunc = function (item) {
                return 0 === item.price && null === item.exclusive_for_class
            },
                isFreeClassExclusiveFunc = function (item) {
                    return 0 === item.price && item.exclusive_for_class === cIdx
                },
                isPaidSharedFunc = function (item) {
                    return 0 < item.price && null === item.exclusive_for_class
                },
                isPaidClassExclusiveFunc = function (item) {
                    return 0 < item.price && item.exclusive_for_class === cIdx
                },
                outer = this,
                createClassWeaponListFunc = function (itemList) {
                    return itemList = outer.filterItems(itemList, isFreeSharedFunc).concat(outer.filterItems(itemList, isFreeClassExclusiveFunc)).concat(outer.filterItems(itemList, isPaidSharedFunc)).concat(outer.filterItems(itemList, isPaidClassExclusiveFunc))
                },
                classItems = {
                    primaryWeapons: createClassWeaponListFunc(this.primaryWeapons),
                    secondaryWeapons: createClassWeaponListFunc(this.secondaryWeapons)
                };
            classItems.forWeaponSlot = [classItems.primaryWeapons, classItems.secondaryWeapons], this.forClass.push(classItems)
        }
        this.isSetup = true
    };
};

export function findItemInListById (itemId, itemList) {
    for (var i = 0; i < itemList.length; i++)
        if (itemList[i] && itemList[i].id === itemId) return itemList[i];
    return null
};

export function convertOldItemIdToMetaId(id, type, oldOffsets = itemIdOffsetsByNameOLD) {
    return id - oldOffsets[type];
};

export function convertMetaIdToAbsoluteId(id, type, offsets = itemIdOffsetsByName) {
    return id + offsets[type];
};

export function integrateItems(items, newitems) { //this is only for items js files
    Object.keys(newitems).forEach(itemclass => {
        if (!items[itemclass]) {
            items[itemclass] = [];
        };
        newitems[itemclass].forEach(newitem => {
            items[itemclass].push(newitem);
        });
    });
};

export function getItemsByTag(items, tag) {
    return items.filter(item => {
        return item?.item_data?.tags && item.item_data.tags.includes(tag);
    });
};

export function convertMixedPoolToPurePool(mixedPool, items, event) {
    let purePool = [];
    //convert any tags to ids
    for (let i = 0; i < mixedPool.length; i++) {
        if (typeof mixedPool[i] === 'string') {
            let tag = getItemsByTag(items, mixedPool[i]);
            tag.forEach(item => {
                item.sourceTag = mixedPool[i];
                if (event) {
                    item.event = event;
                };
                purePool.push(item);
            });
        } else if (typeof mixedPool[i] === 'number') {
            let item = findItemInListById(mixedPool[i], items);
            if (item) {
                if (event) {
                    item.event = event;
                };
                purePool.push(item);
            };
        } else {
            purePool.push(mixedPool[i]);
        };
    };
    //remove duplicates
    purePool = purePool.filter((item, index) => {
        return purePool.indexOf(item) === index;
    });
    return purePool;
};

export async function setUpShopAvailable(seed = ss.servicesSeed.value.split("").reduce((hash, char, idx) => hash + char.charCodeAt(0) * (idx + 1), 0)) { //seed must be a number
    let items = await ss.recs.getAllItemData(true);

    extendMath(Math);

    const mondayStart = new Date(new Date().setDate(new Date().getDate() - ((new Date().getDay() || 7) - 1))).setHours(0, 0, 0, 0);

    var eventsMonday = await events.getEventsAtTime(mondayStart);

    Math.seed = seed + mondayStart;

    devlog('seed', seed, ss.servicesSeed, Math.seed, mondayStart, eventsMonday);

    const shop = {
        items: [],
        perm: [],
        temp: [],

        tier1pool: [],
        tier1chance: (Math.seededRandomInt(0, 25) + (Math.seededRandomChance(0.2) ? Math.seededRandomInt(0, 75) : Math.seededRandomInt(0, 20)))/100,
        tier1chosen: null,

        tier2pool: [],

        tier3pool: [],
    };

    await plugins.emit('setUpShopAvailableBeforeEventLoop', { shop, Math, items, mondayStart, eventsMonday });

    eventsMonday.current.forEach(event => {
        if (event?.data?.shop) {
            const eventShop = event.data.shop;
            if (eventShop.perm) {
                shop.perm = shop.perm.concat(convertMixedPoolToPurePool(eventShop.perm, items, event.name));
            };
            if (eventShop.temp) {
                shop.temp = shop.temp.concat(convertMixedPoolToPurePool(eventShop.temp, items, event.name));
            };

            if (eventShop.tier1pool) { //highest rarity
                shop.tier1pool = shop.tier1pool.concat(convertMixedPoolToPurePool(eventShop.tier1pool, items, event.name));
            };

            if (eventShop.tier2pool) { //high rarity
                let pool = Math.seededShuffleArray(convertMixedPoolToPurePool(eventShop.tier2pool, items, event.name));
                let count = eventShop.tier2count || 1;
                count = Math.min(count, pool.length);

                //choose random count of items from pool without duplicates
                shop.tier2pool = shop.tier2pool.concat(pool.slice(0, count));

                // devlog('tier2pool', pool.slice(0, count), count, shop.tier2pool);
            };
            if (eventShop.tier3pool) { //medium rarity
                let pool = Math.seededShuffleArray(convertMixedPoolToPurePool(eventShop.tier3pool, items, event.name));
                let count = eventShop.tier3count || 1;
                count = Math.min(count, pool.length);
                
                //choose random count of items from pool without duplicates
                shop.tier3pool = shop.tier3pool.concat(pool.slice(0, count));
            };
        };
    });

    //for removing dupes, tags already handled
    shop.perm = convertMixedPoolToPurePool(shop.perm, items);
    shop.temp = convertMixedPoolToPurePool(shop.temp, items);

    shop.tier1pool = convertMixedPoolToPurePool(shop.tier1pool, items);
    // console.log(shop.tier2pool);
    shop.tier2pool = convertMixedPoolToPurePool(shop.tier2pool, items);
    // console.log(shop.tier2pool);
    shop.tier3pool = convertMixedPoolToPurePool(shop.tier3pool, items);

    shop.items = shop.items.concat(shop.perm, shop.temp, shop.tier2pool, shop.tier3pool);

    if (Math.seededRandomChance(shop.tier1chance)) {
        shop.tier1chosen = Math.seededRandomFromList(shop.tier1pool);
        shop.items.push(shop.tier1chosen);
    };

    await plugins.emit('setUpShopAvailableBeforeApply', { shop, Math, items, mondayStart, eventsMonday });

    devlog(
        'shop',
        'items',
        shop.items.map(item => item.name),
        'perm',
        shop.perm.map(item => item.name),
        'temp',
        shop.temp.map(item => item.name),
        'tier1pool',
        shop.tier1pool.map(item => item.name),
        'tier1chosen',
        shop.tier1chosen?.name,
        'tier1chance',
        shop.tier1chance,
        'tier2pool',
        shop.tier2pool.map(item => item.name),
        'tier3pool',
        shop.tier3pool.map(item => item.name),
    );

    log.info("[Shop] Available retrieval complete, applying to database");

    //begin transaction
    ss.runQuery("BEGIN TRANSACTION");

    try {
        shop.items.forEach(item => {
            ss.runQuery("UPDATE items SET is_available = 1 WHERE id = ?", item.id);
        });
    
        //commit transaction
        ss.runQuery("COMMIT");
        log.success("[Shop] Available items applied to database");
    } catch (error) {
        //rollback transaction
        ss.runQuery("ROLLBACK");
        log.error("[Shop] Error applying available items to database", error);
    };
};

export default CatalogConstructor;