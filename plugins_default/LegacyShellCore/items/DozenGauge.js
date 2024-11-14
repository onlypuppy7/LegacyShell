/*
    DozenGauge LegacyShellCore weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

export default {
    "DozenGauge": [{
        "meta_id": 10000,
        "name": "Classic Dozen Gauge",
        "price": 20000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "old.dozenGauge"
        },
        "is_available": false
    }]
};