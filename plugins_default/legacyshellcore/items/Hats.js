/*
    LegacyShellCore hats

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins

    Note that 0 is reserved for no hat
*/

var items = {
    "Hats": [{
        "meta_id": 10000,
        "name": "LegacyShell Beta",
        "is_available": false,
        "price": 1,
        "item_type_id": 1,
        "item_type_name": "Hat",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "hat_legacyBeta",
            "tags": ["LegacyShell"]
        }
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