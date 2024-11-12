//legacyshell: catalog
import { isClient, ItemType, CharClass, Slot, itemIdOffsets, item_classes } from '#constants';
//

//(server-only-start)
//(server-only-end)

// [LS] Catalog CONSTRUCTOR
const CatalogConstructor = function (importedItems) {
    if (null == importedItems) throw "Items is undefined or null, cannot create Catalog";
    this.isSetup = false;
    this.Items = importedItems;
    this.filterItems = function (itemList, filterFunc) {
        var filteredItems = [];
        for (var i = 0; i < itemList.length; i++) {
            if (filterFunc(itemList[i])) {
                filteredItems.push(itemList[i]);
            };
        };
        return filteredItems;
    };
    this.findItemInListById = function (itemId, itemList) {
        for (var i = 0; i < itemList.length; i++)
            if (itemList[i] && itemList[i].id === itemId) return itemList[i];
        return null
    };
    this.findItemById = function (itemId) {
        return this.findItemInListById(itemId, this.Items)
    };
    this.findItemBy8BitItemId = function (itemType, classIdx, itemId8Bit, itemIdOffsetsP = itemIdOffsets) {
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
                return this.findItemInListById(realItemId, this.forClass[classIdx].forWeaponSlot[Slot.Primary]);
            case ItemType.Secondary:
                realItemId += itemIdOffsetsP[itemType];
                return this.findItemInListById(realItemId, this.forClass[classIdx].forWeaponSlot[Slot.Secondary])
        }
    };
    this.get8BitItemId = function (item, classIdx, itemIdOffsetsP = itemIdOffsets) {
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
    this.addWeaponFunctions = function (weaponItem) {
        weaponItem.instantiateNew = function (avatar) {
            const ItemClass = item_classes[this.item_data.class];
            var instance = new ItemClass(avatar, this.item_data.meshName);
            return avatar.actor && avatar.actor.setWeaponSkeleton(instance.actor.skeleton), instance
        }
    };
    this.getTaggedItems = function (tag) {
        return this.filterItems(this.Items, function (item) {
            if (void 0 !== item.item_data.tags && null !== item.item_data.tags && 0 < item.item_data.tags.length)
                for (var i = 0; i < item.item_data.tags.length; i++)
                    if (item.item_data.tags[i] === tag) return true;
            return false
        })
    };
    this.setupCatalog = function () {
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
    false === this.isSetup && this.setupCatalog();
};

export default CatalogConstructor;