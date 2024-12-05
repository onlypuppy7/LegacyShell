/*
    CSG1 LegacyShellCore weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

var items = {
    "CSG1": [{
        "meta_id": 10000,
        "name": "Classic CSG1",
        "price": 20000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "old.csg1"
        },
        "is_available": false
    }]
};

Object.keys(items).forEach(itemclass => {
    for (var i in items[itemclass]) {
        const item = items[itemclass][i];
        // if (item.unlock !== 'purchase' && item.unlock !== 'default') {
            item.is_available = false;
        // };
    };
});

export default items;