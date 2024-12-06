/*
    RPEGG default weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

export default {
    "RPEGG": [{
        "meta_id": 0,
        "id": 3800,
        "name": "RPEGG",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "class": "RPEGG",
            "meshName": "gun_rpegg",
            "tags": ["DefaultUnlocks"]
        },
        "is_available": true
    }, {
        "meta_id": 4,
        "id": 3804,
        "name": "RPEGG Thanksgiving",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "class": "RPEGG",
            "meshName": "gun_rpegg_Turkey",
            "tags": ["Thanksgiving"]
        },
        "is_available": false
    }, {
        "meta_id": 5,
        "id": 3805,
        "name": "RPEGG Christmas",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "class": "RPEGG",
            "meshName": "gun_rpegg_Present",
            "tags": ["Christmas"]
        },
        "is_available": false
    }, {
        "meta_id": 6,
        "id": 3806,
        "name": "RPEGG New Years",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "class": "RPEGG",
            "meshName": "gun_rpegg_NewYear",
            "tags": ["NewYears2019"]
        },
        "is_available": false
    }, {
        "meta_id": 7,
        "id": 3807,
        "name": "RPEGG Groundhog",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "class": "RPEGG",
            "meshName": "gun_rpegg_Groundhog",
            "tags": ["GroundhogDay"]
        },
        "is_available": false
    }, {
        "meta_id": 8,
        "id": 3808,
        "name": "RPEGG Buck Rogers",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "class": "RPEGG",
            "meshName": "gun_rpegg_Buck",
            "tags": ["Promotional"]
        },
        "is_available": false
    }]
};