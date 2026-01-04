/*
    M24 default weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

import { CharClass } from "#constants";

var weaponNumber = CharClass.Crackshot;

var items = {
    "M24": [{
        "meta_id": 1,
        "name": "M2DZ Zaxonius",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Crackshot Primary Weapons",
        "exclusive_for_class": weaponNumber,
        "item_data": {
            "meshName": "gun_m24_Zaxonius"
        },
        "is_available": true,
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