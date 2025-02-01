/*
    M24 default weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

import { CrackshotPlugin } from "../shared.js";

var weaponNumber = CrackshotPlugin.weaponNumber;

var items = {
    "M24": [{
        "meta_id": 0,
        "id": 4200,
        "name": "M2D",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24"
        },
        "is_available": true,
        "unlock": "default"
    }, {
        "meta_id": 1,
        "id": 4201,
        "name": "M2DZ GOLD",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Gold"
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 2,
        "id": 4202,
        "name": "Happy Gun Bear M2DZ",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Bear"
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 3,
        "id": 4203,
        "name": "M2DZ Halloween",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Halloween",
            "tags": ["Halloween"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 4,
        "id": 4204,
        "name": "M2DZ Thanksgiving",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Turkey",
            "tags": ["Thanksgiving"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 5,
        "id": 4205,
        "name": "M2DZ Christmas",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Present",
            "tags": ["Christmas"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 6,
        "id": 4206,
        "name": "M2DZ New Years",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_NewYear",
            "tags": ["NewYears2019"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 7,
        "id": 4207,
        "name": "M2DZ Groundhog",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Groundhog",
            "tags": ["GroundhogDay"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 8,
        "id": 4208,
        "name": "M2DZ Buck Rogers",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Buck",
            "tags": ["Promotional"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 9,
        "id": 4209,
        "name": "M2DZ Valentines",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Valentines",
            "tags": ["ValentinesDay"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 10,
        "id": 4210,
        "name": "M2DZ St Patricks",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_SaintPaddy",
            "tags": ["StPatricksDay"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 11,
        "id": 4211,
        "name": "M2DZ Easter",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Easter",
            "tags": ["Easter"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 12,
        "id": 4212,
        "name": "M2DZ Flames",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Flames",
            "tags": ["Promotional"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 13,
        "id": 4213,
        "name": "M2DZ Rainbow",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Rainbow",
            "tags": ["Rainbow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }]
};

// Object.keys(items).forEach(itemclass => {
//     for (var i in items[itemclass]) {
//         const item = items[itemclass][i];
//         // if (item.unlock !== 'purchase' && item.unlock !== 'default') {
//             item.is_available = false;
//         // };
//     };
// });

export default items;