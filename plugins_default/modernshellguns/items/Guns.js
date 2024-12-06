/*
    Cluck9mm default weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

import {
    integrateItems
} from "#catalog";

/*
    in the base game, we separate the classes into separate files
    helps with organisation but here its better to keep them all in one file
    since we need to do some manipulation on the items
*/

var items = {
    "Eggk47": [{
        "meta_id": 0,
        "id": 3100,
        "name": "The Eggk-47",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47",
            "tags": ["default", "Blue", "Purple"]
        },
        "is_available": true,
        "unlock": "default"
    }, {
        "meta_id": 1,
        "id": 3101,
        "name": "GOLD Eggk-47",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Gold",
            "tags": ["Brown", "Gold", "Grey", "Gray", "Silver"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 2,
        "id": 3102,
        "name": "Happy Bear Eggk-47",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Bear",
            "tags": ["White", "Pink", "Cute", "Heart"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 3,
        "id": 3103,
        "name": "Halloween Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Halloween",
            "tags": ["Halloween", "Oct23", "Purple", "Green", "Bat", "Wings", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 4,
        "id": 3104,
        "name": "Thanksgiving Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Turkey",
            "tags": ["NovM23", "Thanksgiving", "Brown", "Red", "Purple", "Eye", "NovM24"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 5,
        "id": 3105,
        "name": "Christmas Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Present",
            "tags": ["Christmas", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 6,
        "id": 3106,
        "name": "New Year 2019 Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NewYear",
            "tags": ["NewYears", "2019", "Blue", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 7,
        "id": 3107,
        "name": "Groundhog Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Groundhog",
            "tags": ["Groundhog", "Feb23", "Brown", "Feb24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 8,
        "id": 3108,
        "name": "Buck Rogers Eggk-47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Buck",
            "tags": ["Promotional", "Black", "Grey", "Gray"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 9,
        "id": 3109,
        "name": "Valentines Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Valentines",
            "tags": ["ValentinesDay", "Heart", "Brown", "Leopard", "Red"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 10,
        "id": 3110,
        "name": "St Patricks Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_SaintPaddy",
            "tags": ["StPatricksDay", "MarM23", "Green", "Black", "Yellow", "Mar24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 11,
        "id": 3111,
        "name": "Easter Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Easter",
            "tags": ["Easter", "Red", "Eggs", "MarM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 12,
        "id": 3112,
        "name": "Flame Eggk-47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Flames",
            "tags": ["Promotional", "Red", "Brown"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 13,
        "id": 3113,
        "name": "Rainbow Eggk-47",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Rainbow",
            "tags": ["Rainbow", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Black"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 14,
        "id": 3114,
        "name": "Steampunk Eggk-47",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Steampunk",
            "tags": ["Steampunk", "Brown", "Gears"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 15,
        "id": 3115,
        "name": "Memphis Eggk-47",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Memphis",
            "tags": ["Memphis", "Blue", "Orange", "Purple"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 16,
        "id": 3116,
        "name": "Eggwalker Eggk-47",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_spaceEgg",
            "tags": ["Eggwalker", "July23", "Black", "Red", "Grey", "Gray", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 17,
        "id": 3117,
        "name": "Nuke Zone Eggk-47",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NukeZone",
            "tags": ["NukeZone", "Black", "Neon", "Pink"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 18,
        "id": 3118,
        "name": "New Year 2020 Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NewYear2020",
            "tags": ["NewYears", "2020", "Purple", "Pink"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 19,
        "id": 3119,
        "name": "Country Singer Eggk-47",
        "price": 100000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Snake",
            "tags": ["EggyCash", "Brown", "Snek"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 20,
        "id": 3120,
        "name": "Albino Eggk-47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_SnakeAlbino",
            "tags": ["EggyCashAlbino", "White", "ABHS", "Snek", "Red", "Black", "Gray", "Grey"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 21,
        "id": 3121,
        "name": "Raid Land Eggk-47",
        "price": 6500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_RaidLand",
            "tags": ["RaidLand", "Blue", "Black"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 22,
        "id": 3122,
        "name": "Toxic Eggk-47",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Toxic",
            "tags": ["Rotten", "Black", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 23,
        "id": 3123,
        "name": "Music Eggk-47",
        "price": 8000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Music",
            "tags": ["Rockstar", "JanM23", "Black", "SepM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 24,
        "id": 3124,
        "name": "Galeggsy Eggk-47",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Galaxy",
            "tags": ["Galeggsy", "AprM23", "Blue", "Purple", "Blurple", "Stars", "Aug24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 25,
        "id": 3125,
        "name": "Chicken Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Chicken",
            "tags": ["Chicken", "Red", "White", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 26,
        "id": 3126,
        "name": "Techno Eggk-47",
        "price": 10,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Techno",
            "tags": ["Dec23", "Blue", "Yellow", "Black", "Pog"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["gun_eggk47_techno"]
    }, {
        "meta_id": 27,
        "id": 3127,
        "name": "New Year 2021 Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NewYear2021",
            "tags": ["NewYears", "2021", "Pink", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 28,
        "id": 3128,
        "name": "Car Eggk-47",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_car",
            "tags": ["Cars", "Trains", "Blue"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 29,
        "id": 3129,
        "name": "Merc Zone Eggk-47",
        "price": 7000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Merc",
            "tags": ["Merc", "Suit", "Black", "Tie", "Blue"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 30,
        "id": 3130,
        "name": "Summer Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Watergun",
            "tags": ["Summer", "JunM23", "Blue", "Orange", "Yellow", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 31,
        "id": 3131,
        "name": "Pencil Eggk-47",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Pencil",
            "tags": ["Pencil", "Sep23", "Yellow", "Sep24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 32,
        "id": 3132,
        "name": "New Year 2022 Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NewYear2022",
            "tags": ["NewYears", "2022", "Blue", "Red", "Gold"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 33,
        "id": 3133,
        "name": "Cards Eggk-47",
        "price": 1520,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Cards",
            "tags": ["EGGORG", "Apr23", "Blue", "Black", "Heart"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 34,
        "id": 3134,
        "name": "Retro Eggk-47",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Retro",
            "tags": ["Retro", "Pixel", "FebM23", "Blue", "Purple", "Wings", "DecM23"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_ak_retro"]
    }, {
        "meta_id": 35,
        "id": 3135,
        "name": "Dino Eggk-47",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Dino",
            "tags": ["Dino", "May23", "Red", "Brown", "AugM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 36,
        "id": 3136,
        "name": "Valkyrie Eggk-47",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Valkyrie",
            "tags": ["Premium", "Valkyrie", "Gold", "Yellow", "Blue"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_ak_valkyrie"]
    }, {
        "meta_id": 37,
        "id": 3137,
        "name": "Eggwalker Alt Eggk-47",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_spaceEggAlt",
            "tags": ["Eggwalker2", "Black", "Grey", "Gray"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 38,
        "id": 3138,
        "name": "SPORTS Eggk-47",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Sports",
            "tags": ["Sports", "JulyM23", "Brown", "Orange", "Cricket", "Bat", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 39,
        "id": 3139,
        "name": "Breakfast Eggk-47",
        "price": 1500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Breakfast",
            "tags": ["Breakfast", "Food", "Brown", "Syrup", "Waffles", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 40,
        "id": 3140,
        "name": "New Year 2023 Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NewYear2023",
            "tags": ["NewYears", "2023", "Red", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 41,
        "id": 3141,
        "name": "Farm Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Farm",
            "tags": ["Farm", "FebM23", "Food", "Orange", "Green", "Carrot", "May24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 42,
        "id": 3142,
        "name": "Fusion Eggk-47",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Fusion",
            "tags": ["Premium", "fusion", "FebM23", "White", "Blue", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_ak47_fusion"]
    }, {
        "meta_id": 43,
        "id": 3143,
        "name": "Hero Eggk-47",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Fantasy",
            "tags": ["Heroes", "Apr23", "Sword", "Silver"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 44,
        "id": 3144,
        "name": "Monster Eggk-47",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_FantasyEvil",
            "tags": ["Monsters", "Apr23", "Purple", "Sword"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 45,
        "id": 3145,
        "name": "Equinox Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Equinox",
            "tags": ["Equinox", "July23", "Blue", "Yellow", "Sun", "Moon"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 46,
        "id": 3146,
        "name": "Paintball Eggk-47",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Paintball",
            "tags": ["Sports2", "JulyM23", "Grey", "Gray", "Yellow", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 47,
        "id": 3147,
        "name": "Kart Eggk-47",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Kart",
            "tags": ["Kart", "Aug23", "Blue", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 48,
        "id": 3148,
        "name": "BWD Eggk-47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Wizard",
            "tags": ["Drops5", "AugM23", "Blue", "Brown", "Crystal"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 49,
        "id": 3149,
        "name": "Infernal Eggk-47",
        "price": 4,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Infernal",
            "tags": ["OctM23", "Infernal", "Black", "Orange", "Red", "Grey", "Gray", "Burn"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_ak_infernal"]
    }, {
        "meta_id": 50,
        "id": 3150,
        "name": "Ancient Eggk-47",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Ruins",
            "tags": ["Nov23", "Mayan", "Gray", "Grey", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 51,
        "id": 3151,
        "name": "Holideggs Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_PresentRed",
            "tags": ["Dec23", "Christmas3", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 52,
        "id": 3152,
        "name": "2024 Eggk-47",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_NewYear2024",
            "tags": ["DecM23", "NewYears", "2024", "Blue", "White"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 53,
        "id": 3153,
        "name": "Racer Eggk-47",
        "price": 25000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_RaceCar",
            "tags": ["JanM24", "Racer", "White", "Orange", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 54,
        "id": 3154,
        "name": "Chocolate Eggk-47",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Chocolate",
            "tags": ["MarM24", "Brown", "Gold"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": false,
        "sku": ["item_ak_choc"]
    }, {
        "meta_id": 55,
        "id": 3155,
        "name": "Mecha-Eggk-47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Steambot",
            "tags": ["Apr24", "Brown", "Gold", "Premium"]
        },
        "is_available": false,
        "unlock": "premium"
    }, {
        "meta_id": 56,
        "id": 3156,
        "name": "MenoXD Eggk-47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Meno",
            "tags": ["AprM24", "Drops6"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 57,
        "id": 3157,
        "name": "Alien Eggk47",
        "price": 500000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Alien",
            "tags": ["Aug24", "Perm", "Premium", "eggyp"]
        },
        "is_available": true,
        "unlock": "purchase",
        "activeProduct": false,
        "sku": ["item_ak_alien"]
    }, {
        "meta_id": 58,
        "id": 3158,
        "name": "Spore Eggk47",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_Mushroom",
            "tags": ["NovM24", "Giveaway", "Funghi", "Green"]
        },
        "is_available": false,
        "unlock": "manual"
    }],
    "DozenGauge": [{
        "meta_id": 0,
        "id": 3600,
        "name": "The Scrambler",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge",
            "tags": ["default", "Orange", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "default"
    }, {
        "meta_id": 1,
        "id": 3601,
        "name": "GOLD Scrambler",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Gold",
            "tags": ["Brown", "Gold", "Grey", "Gray", "Silver"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 2,
        "id": 3602,
        "name": "Happy Bear Scrambler ",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Bear",
            "tags": ["White", "Pink", "Cute", "Heart"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 3,
        "id": 3603,
        "name": "Halloween Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Halloween",
            "tags": ["Halloween", "Oct23", "Purple", "Green", "Bat", "Wings", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 4,
        "id": 3604,
        "name": "Thanksgiving Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Turkey",
            "tags": ["NovM23", "Thanksgiving", "Brown", "Red", "Purple", "Eye", "NovM24"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 5,
        "id": 3605,
        "name": "Christmas Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Present",
            "tags": ["Christmas", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 6,
        "id": 3606,
        "name": "New Year 2019 Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NewYear",
            "tags": ["NewYears", "2019", "Blue", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 7,
        "id": 3607,
        "name": "Groundhog Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Groundhog",
            "tags": ["Groundhog", "Feb23", "Brown", "Feb24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 8,
        "id": 3608,
        "name": "Buck Rogers Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Buck",
            "tags": ["Promotional", "Black", "Grey", "Gray"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 9,
        "id": 3609,
        "name": "Valentines Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Valentines",
            "tags": ["ValentinesDay", "Heart", "Brown", "Leopard", "Red"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 10,
        "id": 3610,
        "name": "St Patricks Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_SaintPaddy",
            "tags": ["StPatricksDay", "MarM23", "Green", "Black", "Yellow", "Mar24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 11,
        "id": 3611,
        "name": "Easter Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Easter",
            "tags": ["Easter", "Yellow", "Green", "Eggs", "MarM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 12,
        "id": 3612,
        "name": "Flame Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Flames",
            "tags": ["Promotional", "Red", "Brown"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 13,
        "id": 3613,
        "name": "Rainbow Scrambler",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Rainbow",
            "tags": ["Rainbow", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Black"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 14,
        "id": 3614,
        "name": "Steampunk Scrambler",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Steampunk",
            "tags": ["Steampunk", "Brown", "Gears"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 15,
        "id": 3615,
        "name": "Memphis Scrambler",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Memphis",
            "tags": ["Memphis", "Yellow", "Green", "Black", "White"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 16,
        "id": 3616,
        "name": "Eggwalker Scrambler",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_spaceEgg",
            "tags": ["Eggwalker", "July23", "Black", "Red", "Grey", "Gray", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 17,
        "id": 3617,
        "name": "Nuke Zone Scrambler",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NukeZone",
            "tags": ["NukeZone", "Black", "Blue", "Neon"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 18,
        "id": 3618,
        "name": "New Year 2020 Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NewYear2020",
            "tags": ["NewYears", "2020", "Purple", "Pink"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 19,
        "id": 3619,
        "name": "Country Singer Scrambler",
        "price": 100000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Snake",
            "tags": ["EggyCash", "Brown", "Snek"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 20,
        "id": 3620,
        "name": "Albino Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_SnakeAlbino",
            "tags": ["EggyCashAlbino", "White", "ABHS", "Snek", "Red", "Black", "Gray", "Grey"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 21,
        "id": 3621,
        "name": "Raid Land Scrambler",
        "price": 6500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_RaidLand",
            "tags": ["RaidLand", "Brown", "White"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 22,
        "id": 3622,
        "name": "Toxic Scrambler",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Toxic",
            "tags": ["Rotten", "Black", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 23,
        "id": 3623,
        "name": "Music Scrambler",
        "price": 8000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Music",
            "tags": ["Rockstar", "JanM23", "Red", "Gold", "Guitar", "SepM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 24,
        "id": 3624,
        "name": "Galeggsy Scrambler",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Galaxy",
            "tags": ["Galeggsy", "AprM23", "Blue", "Purple", "Blurple", "Stars", "Aug24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 25,
        "id": 3625,
        "name": "Killstreak Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Killstreak",
            "tags": ["Killstreak", "Smile", "Yellow", "Brown", "Blue"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 26,
        "id": 3626,
        "name": "Chicken Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Chicken",
            "tags": ["Chicken", "Red", "White", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 27,
        "id": 3627,
        "name": "Techno Scrambler",
        "price": 10,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Techno",
            "tags": ["Techno", "premium", "SepM23", "Badoosh", "Red", "Purple", "Black"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["gun_gauge_techno"]
    }, {
        "meta_id": 28,
        "id": 3628,
        "name": "New Year 2021 Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NewYear2021",
            "tags": ["NewYears", "2021", "Pink", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 29,
        "id": 3629,
        "name": "Car Scrambler",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_car",
            "tags": ["Cars", "Trains", "Yellow"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 30,
        "id": 3630,
        "name": "Merc Zone Scrambler",
        "price": 7000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Merc",
            "tags": ["Merc", "Suit", "Black", "Tie", "Orange"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 31,
        "id": 3631,
        "name": "Summer Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Watergun",
            "tags": ["Summer", "JunM23", "Blue", "Orange", "Yellow", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 32,
        "id": 3632,
        "name": "Pencil Scrambler",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Pencil",
            "tags": ["Pencil", "Sep23", "Highlighter", "Sep24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 33,
        "id": 3633,
        "name": "BWD Fan-art Scrambler",
        "price": 15000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_BWD",
            "tags": ["Kids", "Wizard", "Blue", "Rainbow"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 34,
        "id": 3634,
        "name": "Retro Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Retro",
            "tags": ["Retro", "Premium", "Pixel", "Grey", "Gray", "Orange", "Wings", "Mar24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_crack_retro"]
    }, {
        "meta_id": 35,
        "id": 3635,
        "name": "New Year 2022 Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NewYear2022",
            "tags": ["NewYears", "2022", "Blue", "Red", "Gold"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 36,
        "id": 3636,
        "name": "Thee_Owl Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_TheeOwl",
            "tags": ["Relic", "Drops2", "Twitch", "Green", "Fingers"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 37,
        "id": 3637,
        "name": "Basket Bros Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Basketball",
            "tags": ["BBros", "JulyM23", "Orange", "Hoops", "FebM24", "JunM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_bros"]
    }, {
        "meta_id": 38,
        "id": 3638,
        "name": "Cards Scrambler",
        "price": 1520,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Cards",
            "tags": ["EGGORG", "Apr23", "Blue", "Black", "Heart"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 39,
        "id": 3639,
        "name": "JWBerry3D Scrambler",
        "price": 75000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_JWBerry",
            "tags": ["Relic", "Black", "Red", "Glasses"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 40,
        "id": 3640,
        "name": "Dino Scrambler",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Dino",
            "tags": ["Dino", "May23", "Blue", "AugM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 41,
        "id": 3641,
        "name": "Eggpire Scrambler",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_spaceEggAlt",
            "tags": ["Eggwalker2", "Black", "Grey", "Gray", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 42,
        "id": 3642,
        "name": "Valkyrie Scrambler",
        "price": 3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Valkyrie",
            "tags": ["Eggwalker2", "Premium", "Valkyrie", "Gold", "Yellow", "Blue"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gauge_valk"]
    }, {
        "meta_id": 43,
        "id": 3643,
        "name": "SPORTS Scrambler",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Sports",
            "tags": ["Sports", "JulyM23", "Black", "White", "Green", "Soccer", "Football", "FebM24", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 44,
        "id": 3644,
        "name": "Breakfast Scrambler",
        "price": 1500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Breakfast",
            "tags": ["Breakfast", "Food", "Red", "Ketchup", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 45,
        "id": 3645,
        "name": "Sharkbucks Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Sharkbucks",
            "tags": ["Sep22", "Drops3", "Blue", "Smile"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 46,
        "id": 3646,
        "name": "Kilzomatic Scrambler",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Kilzomatic",
            "tags": ["Sep22", "Blue", "Yellow"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 47,
        "id": 3647,
        "name": "Badegg Scrambler",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Badegg",
            "tags": ["Badegg", "Red", "Yellow", "DecM23"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 48,
        "id": 3648,
        "name": "New Year 2023 Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NewYear2023",
            "tags": ["NewYears", "2023", "Red", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 49,
        "id": 3649,
        "name": "Sleigh Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Christmas",
            "tags": ["Christmas2", "Newsletter", "Red", "White", "Gold", "Sleigh"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 50,
        "id": 3650,
        "name": "Octopus Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Octopus",
            "tags": ["JanM23", "Oct23", "Blue", "Pink"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gauge_octopus"]
    }, {
        "meta_id": 51,
        "id": 3651,
        "name": "Farm Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Farm",
            "tags": ["Farm", "FebM23", "Yellow", "Gold", "Wheat", "May24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 52,
        "id": 3652,
        "name": "BWD Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Wizard",
            "tags": ["Drops4", "Mar23", "Blue", "Brown", "Crystal"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 53,
        "id": 3653,
        "name": "Green Snake Scrambler",
        "price": 150000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_SnakePatrick",
            "tags": ["Mar23", "StPatricksDay", "Snek", "Mar24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 54,
        "id": 3654,
        "name": "Beholder Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Fantasy",
            "tags": ["Monsters", "Apr23", "Purple", "Yellow", "Eyes", "Apr24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gauge_monster"]
    }, {
        "meta_id": 55,
        "id": 3655,
        "name": "Fusion Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Fusion",
            "tags": ["Premium", "MidM23", "Fusion", "White", "Blue", "Grey", "Gray", "bun_zorg"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gauge_fusion"]
    }, {
        "meta_id": 56,
        "id": 3656,
        "name": "Equinox Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Equinox",
            "tags": ["Equinox", "July23", "Blue", "Yellow", "Sun", "Moon"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 57,
        "id": 3657,
        "name": "Kart Scrambler",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Kart",
            "tags": ["Aug23", "Kart", "Blue", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 58,
        "id": 3658,
        "name": "Ancient Scrambler",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Ruins",
            "tags": ["Nov23", "Mayan", "Gray", "Grey", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 59,
        "id": 3659,
        "name": "Holideggs Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_PresentRed",
            "tags": ["Dec23", "Christmas3", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 60,
        "id": 3660,
        "name": "2024 Scrambler",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_NewYear2024",
            "tags": ["DecM23", "2024", "NewYears", "White", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 61,
        "id": 3661,
        "name": "Racer Scrambler",
        "price": 25000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_RaceCar",
            "tags": ["JanM24", "Racer", "White", "Orange", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 62,
        "id": 3662,
        "name": "Cloudkicker Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Clouds",
            "tags": ["Feb24", "Clouds", "White", "Rainbow"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": false,
        "sku": ["item_gauge_cloud"]
    }, {
        "meta_id": 63,
        "id": 3663,
        "name": "Irish Scrambler",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Irish",
            "tags": ["Mar24", "StPatricksDay", "Green", "Gold", "Mar24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": false,
        "sku": ["item_gauge_irish"]
    }, {
        "meta_id": 64,
        "id": 3664,
        "name": "Mecha-Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Steambot",
            "tags": ["Apr24", "RotR", "Premium"]
        },
        "is_available": false,
        "unlock": "premium"
    }, {
        "meta_id": 65,
        "id": 3665,
        "name": "Infernal Scrambler",
        "price": 4,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Infernal",
            "tags": ["JulyM24", "Infernal", "Premium", "Red", "Orange", "Black"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gauge_infernal"]
    }, {
        "meta_id": 66,
        "id": 3666,
        "name": "Bone Scrambler",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Bones",
            "tags": ["OctM24", "Halloween5"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 67,
        "id": 3667,
        "name": "Spore Scrambler",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_Mushroom",
            "tags": ["NovM24", "Giveaway", "Funghi", "Green"]
        },
        "is_available": false,
        "unlock": "manual"
    }],
    "CSG1": [{
        "meta_id": 0,
        "id": 3400,
        "name": "The Free Ranger",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1",
            "tags": ["default", "Orange", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "default"
    }, {
        "meta_id": 1,
        "id": 3401,
        "name": "GOLD Free Ranger",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Gold",
            "tags": ["Brown", "Gold", "Grey", "Gray", "Silver"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 2,
        "id": 3402,
        "name": "Happy Bear Free Ranger",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Bear",
            "tags": ["White", "Pink", "Cute", "Heart"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 3,
        "id": 3403,
        "name": "Halloween Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Halloween",
            "tags": ["Halloween", "Oct23", "Purple", "Green", "Bat", "Wings", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 4,
        "id": 3404,
        "name": "Thanksgiving Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Turkey",
            "tags": ["NovM23", "Thanksgiving", "Brown", "Red", "Purple", "Eye", "NovM24"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 5,
        "id": 3405,
        "name": "Christmas Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Present",
            "tags": ["Christmas", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 6,
        "id": 3406,
        "name": "New Year 2019 Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NewYear",
            "tags": ["NewYears", "2019", "Blue", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 7,
        "id": 3407,
        "name": "Groundhog Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Groundhog",
            "tags": ["Groundhog", "Feb23", "Brown", "Feb24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 8,
        "id": 3408,
        "name": "Buck Rogers Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Buck",
            "tags": ["Promotional", "Black", "Grey", "Gray"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 9,
        "id": 3409,
        "name": "Valentines Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Valentines",
            "tags": ["ValentinesDay", "Heart", "Brown", "Leopard", "Red"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 10,
        "id": 3410,
        "name": "St Patricks Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_SaintPaddy",
            "tags": ["StPatricksDay", "MarM23", "Green", "Black", "Yellow", "Mar24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 11,
        "id": 3411,
        "name": "Easter Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Easter",
            "tags": ["Easter", "Blue", "Eggs", "MarM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 12,
        "id": 3412,
        "name": "Flame Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Flames",
            "tags": ["Promotional", "Red", "Brown"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 13,
        "id": 3413,
        "name": "Rainbow Free Ranger",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Rainbow",
            "tags": ["Rainbow", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Black"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 14,
        "id": 3414,
        "name": "Steampunk Free Ranger",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Steampunk",
            "tags": ["Steampunk", "Brown", "Gears"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 15,
        "id": 3415,
        "name": "Memphis Free Ranger",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Memphis",
            "tags": ["Memphis", "Blue", "Orange", "Purple"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 16,
        "id": 3416,
        "name": "Eggwalker Free Ranger",
        "price": 3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_spaceEgg",
            "tags": ["sale", "Eggwalker", "July23", "Black", "Grey", "Gray", "Yellow", "MarM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_csg1_space"]
    }, {
        "meta_id": 17,
        "id": 3417,
        "name": "Nuke Zone Free Ranger",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NukeZone",
            "tags": ["NukeZone", "Yellow", "Black", "Neon"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 18,
        "id": 3418,
        "name": "New Year 2020 Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NewYear2020",
            "tags": ["NewYears", "2020", "Purple", "Pink"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 19,
        "id": 3419,
        "name": "Country Singer Free Ranger",
        "price": 100000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Snake",
            "tags": ["EggyCash", "Brown", "Snek"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 20,
        "id": 3420,
        "name": "Albino Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_SnakeAlbino",
            "tags": ["EggyCashAlbino", "White", "ABHS", "Snek", "Red", "Black", "Gray", "Grey"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 21,
        "id": 3421,
        "name": "Raid Land Free Ranger",
        "price": 6500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_RaidLand",
            "tags": ["RaidLand", "Blue", "Yellow", "Brown", "Wings"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 22,
        "id": 3422,
        "name": "Toxic Free Ranger",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Toxic",
            "tags": ["Rotten", "Black", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 23,
        "id": 3423,
        "name": "Music Free Ranger",
        "price": 8000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Music",
            "tags": ["Rockstar", "JanM23", "Black", "Guitar", "SepM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 24,
        "id": 3424,
        "name": "Galeggsy Free Ranger",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Galaxy",
            "tags": ["Galeggsy", "AprM23", "Blue", "Purple", "Blurple", "Stars", "Aug24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 25,
        "id": 3425,
        "name": "Chicken Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Chicken",
            "tags": ["Chicken", "Red", "White", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 26,
        "id": 3426,
        "name": "Techno Free Ranger",
        "price": 10,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Techno",
            "tags": ["Premium", "Techno", "Cats", "Catz", "Purple", "Yellow", "Black", "AprM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_csg1_techno"]
    }, {
        "meta_id": 27,
        "id": 3427,
        "name": "New Year 2021 Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NewYear2021",
            "tags": ["NewYears", "2021", "Pink", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 28,
        "id": 3428,
        "name": "Car Free Ranger",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_car",
            "tags": ["Cars", "Trains", "Red", "Firetruck"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 29,
        "id": 3429,
        "name": "Merc Zone Free Ranger",
        "price": 7000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Merc",
            "tags": ["Merc", "Suit", "Black", "Tie", "Yellow"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 30,
        "id": 3430,
        "name": "Summer Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Watergun",
            "tags": ["Summer", "JunM23", "Blue", "Orange", "Yellow", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 31,
        "id": 3431,
        "name": "Retro Free Ranger",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Retro",
            "tags": ["Retro", "Premium", "Pixel", "Green", "Wings", "JanM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_csg1_retro"]
    }, {
        "meta_id": 32,
        "id": 3432,
        "name": "Pencil Free Ranger",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Pencil",
            "tags": ["Pencil", "Sep23", "Yellow", "Paintbrush", "Sep24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 33,
        "id": 3433,
        "name": "New Year 2022 Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NewYear2022",
            "tags": ["NewYears", "2022", "Blue", "Red", "Gold"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 34,
        "id": 3434,
        "name": "BWD Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Wizard",
            "tags": ["Drops", "Blue", "Brown", "Crystal"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 35,
        "id": 3435,
        "name": "Cards Free Ranger",
        "price": 1520,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Cards",
            "tags": ["EGGORG", "Apr23", "Blue", "Black", "Heart"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 36,
        "id": 3436,
        "name": "Dino Free Ranger",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Dino",
            "tags": ["Dino", "May23", "Green", "Orange", "AugM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 37,
        "id": 3437,
        "name": "Eggpire Free Ranger",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_spaceEggAlt",
            "tags": ["Eggwalker2", "Black", "Grey", "Gray", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 38,
        "id": 3438,
        "name": "SPORTS Free Ranger",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Sports",
            "tags": ["Sports", "JulyM23", "Brown", "White", "Baseball", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 39,
        "id": 3439,
        "name": "Rubber Chicken Free Ranger",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_RubberChicken",
            "tags": ["Aug23", "Yellow", "MayM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_csg1_rubchick"]
    }, {
        "meta_id": 40,
        "id": 3440,
        "name": "Breakfast Free Ranger",
        "price": 1500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Breakfast",
            "tags": ["Breakfast", "Food", "Toast", "Brown", "Eggs", "Bread", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 41,
        "id": 3441,
        "name": "Valkyrie Free Ranger",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Valkyrie",
            "tags": ["Valkyrie", "Premium", "Gold", "Yellow", "Blue"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_range_valk"]
    }, {
        "meta_id": 42,
        "id": 3442,
        "name": "New Year 2023 Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NewYear2023",
            "tags": ["NewYears", "2023", "Red", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 43,
        "id": 3443,
        "name": "Fusion Free Ranger",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Fusion",
            "tags": ["Premium", "JanM23", "White", "Blue", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_csg1_fusion"]
    }, {
        "meta_id": 44,
        "id": 3444,
        "name": "Farm Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Farm",
            "tags": ["Farm", "FebM23", "Food", "Yellow", "Green", "Corn", "May24", "premFeatTwo"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 45,
        "id": 3445,
        "name": "Shellpreme Free Ranger",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Shellpreme",
            "tags": ["MayM23", "Eggflation", "Premium", "Red", "Sep24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_csg1_shellpreme"]
    }, {
        "meta_id": 46,
        "id": 3446,
        "name": "Equinox Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Equinox",
            "tags": ["Equinox", "July23", "Blue", "Yellow", "Sun", "Moon"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 47,
        "id": 3447,
        "name": "Kart Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Kart",
            "tags": ["Aug23", "Kart", "Red", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 48,
        "id": 3448,
        "name": "lifeofnurse Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Nurse",
            "tags": ["AugM23", "Drops5", "Blue", "Purple", "Heart"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 49,
        "id": 3449,
        "name": "Bone Free Ranger",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Bones",
            "tags": ["OctM23", "Halloween4", "Bone", "White", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 50,
        "id": 3450,
        "name": "Ancient Free Ranger",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Ruins",
            "tags": ["Nov23", "Mayan", "Gray", "Grey", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 51,
        "id": 3451,
        "name": "Holideggs Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_PresentRed",
            "tags": ["Dec23", "Christmas3", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 52,
        "id": 3452,
        "name": "2024 Free Ranger",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_NewYear2024",
            "tags": ["DecM23", "2024", "NewYears", "Blue", "White"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 53,
        "id": 3453,
        "name": "Sleigh Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Christmas",
            "tags": ["DecM23", "Newsletter", "Gold", "Green", "Red"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 54,
        "id": 3454,
        "name": "Racer Free Ranger",
        "price": 25000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_RaceCar",
            "tags": ["JanM24", "Racer", "White", "Orange", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 55,
        "id": 3455,
        "name": "Infernal Free Ranger",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Infernal",
            "tags": ["JanM24", "Infernal", "Black", "Orange", "Red", "Grey", "Gray", "Burn"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_csg1_infernal"]
    }, {
        "meta_id": 56,
        "id": 3456,
        "name": "Mecha-Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Steambot",
            "tags": ["JanM24", "RotR", "Orange", "Apr24", "Premium"]
        },
        "is_available": false,
        "unlock": "premium"
    }, {
        "meta_id": 57,
        "id": 3457,
        "name": "Grasshopper Free Ranger",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Bugs",
            "tags": ["Jun24", "Bugs", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 58,
        "id": 3458,
        "name": "Spore Free Ranger",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_Mushroom",
            "tags": ["NovM24", "Giveaway", "Funghi", "Green"]
        },
        "is_available": false,
        "unlock": "manual"
    }],
    "RPEGG": [{
        "meta_id": 0,
        "id": 3800,
        "name": "The RPEGG",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg",
            "tags": ["default", "Yellow", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "default"
    }, {
        "meta_id": 1,
        "id": 3801,
        "name": "GOLD RPEGG",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Gold",
            "tags": ["Brown", "Gold", "Grey", "Gray", "Silver"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 2,
        "id": 3802,
        "name": "Happy Bear RPEGG",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Bear",
            "tags": ["White", "Pink", "Cute", "Heart"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 4,
        "id": 3804,
        "name": "Thanksgiving RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Turkey",
            "tags": ["NovM23", "Thanksgiving", "Brown", "Red", "Purple", "Eye", "NovM24"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 5,
        "id": 3805,
        "name": "Christmas RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Present",
            "tags": ["Christmas", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 6,
        "id": 3806,
        "name": "New Year 2019 RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NewYear",
            "tags": ["NewYears", "2019", "Blue", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 7,
        "id": 3807,
        "name": "Groundhog RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Groundhog",
            "tags": ["Groundhog", "Feb23", "Brown", "Feb24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 8,
        "id": 3808,
        "name": "Buck Rogers RPEGG",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Buck",
            "tags": ["Promotional", "Black", "Grey", "Gray"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 9,
        "id": 3809,
        "name": "Valentines RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Valentines",
            "tags": ["ValentinesDay", "Heart", "Brown", "Leopard", "Red"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 10,
        "id": 3810,
        "name": "St Patricks RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_SaintPaddy",
            "tags": ["StPatricksDay", "MarM23", "Green", "Black", "Yellow", "Mar24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 11,
        "id": 3811,
        "name": "Easter RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Easter",
            "tags": ["Easter", "Orange", "Eggs", "MarM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 12,
        "id": 3812,
        "name": "Flame RPEGG",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Flames",
            "tags": ["Promotional", "Red", "Brown"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 13,
        "id": 3813,
        "name": "Rainbow RPEGG",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Rainbow",
            "tags": ["Rainbow", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Black"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 14,
        "id": 3814,
        "name": "Steampunk RPEGG",
        "price": 10000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Steampunk",
            "tags": ["Steampunk", "Brown", "Gears"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 15,
        "id": 3815,
        "name": "Memphis RPEGG",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Memphis",
            "tags": ["Memphis", "Black", "White"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 16,
        "id": 3816,
        "name": "Halloween Skin RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Halloween",
            "tags": ["Halloween", "Oct23", "Purple", "Green", "Bat", "Wings", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 17,
        "id": 3817,
        "name": "Eggwalker RPEGG",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_spaceEgg",
            "tags": ["Eggwalker", "July23", "Black", "Red", "Grey", "Gray", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 18,
        "id": 3818,
        "name": "Nuke Zone RPEGG",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NukeZone",
            "tags": ["NukeZone", "Black", "Green", "Neon"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 19,
        "id": 3819,
        "name": "New Year 2020 RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NewYear2020",
            "tags": ["NewYears", "2020", "Purple", "Pink"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 20,
        "id": 3820,
        "name": "Country Singer RPEGG",
        "price": 100000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Snake",
            "tags": ["EggyCash", "Brown", "Snek"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 21,
        "id": 3821,
        "name": "Albino RPEGG",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_SnakeAlbino",
            "tags": ["EggyCashAlbino", "White", "ABHS", "Snek", "Red", "Black", "Gray", "Grey"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 22,
        "id": 3822,
        "name": "Raid Lands RPEGG",
        "price": 6500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_RaidLand",
            "tags": ["RaidLand", "Silver", "Grey", "Gray", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 23,
        "id": 3823,
        "name": "Toxic RPEGG",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Toxic",
            "tags": ["Rotten", "Black", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 24,
        "id": 3824,
        "name": "Music RPEGG",
        "price": 8000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Music",
            "tags": ["Rockstar", "JanM23", "Yellow", "Gold", "Tuba", "SepM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 25,
        "id": 3825,
        "name": "Galeggsy RPEGG",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Galaxy",
            "tags": ["Galeggsy", "AprM23", "Blue", "Purple", "Blurple", "Stars", "Aug24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 26,
        "id": 3826,
        "name": "Chicken RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Chicken",
            "tags": ["Chicken", "Red", "White", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 27,
        "id": 3827,
        "name": "New Year 2021 RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NewYear2021",
            "tags": ["NewYears", "2021", "Pink", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 28,
        "id": 3828,
        "name": "Techno RPEGG",
        "price": 10,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Techno",
            "tags": ["Techno", "Premium", "JunM23", "Yeet", "Rainbow", "Red", "Yellow", "Green", "Blue", "Purple"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_rpeggTechno"]
    }, {
        "meta_id": 29,
        "id": 3829,
        "name": "Car RPEGG",
        "price": 7500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_car",
            "tags": ["Cars", "Trains", "Silver"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 30,
        "id": 3830,
        "name": "Merc Zone RPEGG",
        "price": 7000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Merc",
            "tags": ["Merc", "Suit", "Black", "Tie", "Green"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 31,
        "id": 3831,
        "name": "Summer RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Watergun",
            "tags": ["Summer", "JunM23", "Blue", "Orange", "Yellow", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 32,
        "id": 3832,
        "name": "Pencil RPEGG",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Pencil",
            "tags": ["Pencil", "Sep23", "Yellow", "Tape", "Sep24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 33,
        "id": 3833,
        "name": "Bone RPEGG",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Bones",
            "tags": ["Halloween2", "Oct23", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 34,
        "id": 3834,
        "name": "New Year 2022 RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NewYear2022",
            "tags": ["NewYears", "2022", "Blue", "Red", "Gold"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 35,
        "id": 3835,
        "name": "Retro RPEGG",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Retro",
            "tags": ["Retro", "Premium", "Pixel", "Mar23", "Green", "Wings", "July24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_rpegg_retro"]
    }, {
        "meta_id": 36,
        "id": 3836,
        "name": "Cards RPEGG",
        "price": 1520,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Cards",
            "tags": ["EGGORG", "Apr23", "Blue", "Black", "Heart"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 37,
        "id": 3837,
        "name": "Dino RPEGG",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Dino",
            "tags": ["Dino", "May23", "Orange", "AugM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 38,
        "id": 3838,
        "name": "Eggpire RPEGG",
        "price": 12500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_spaceEggAlt",
            "tags": ["Eggwalker2", "Black", "Grey", "Gray", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 39,
        "id": 3839,
        "name": "SPORTS RPEGG",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Sports",
            "tags": ["Sports", "JulyM23", "Brown", "Football", "JunM24", "Fbros", "SepM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 40,
        "id": 3840,
        "name": "Breakfast RPEGG",
        "price": 1500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Breakfast",
            "tags": ["Breakfast", "Food", "Sausage", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 41,
        "id": 3841,
        "name": "Scavenger RPEGG",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Scavenger",
            "tags": ["Scavenger", "Black", "Grey", "Gray"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 42,
        "id": 3842,
        "name": "Egg Carton RPEGG",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Eggs",
            "tags": ["Sep22", "Drops3", "Purple", "Grey", "Gray", "Food"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 43,
        "id": 3843,
        "name": "Valkyrie RPEGG",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Valkyrie",
            "tags": ["Valkyrie", "Premium", "Valkyrie", "Gold", "Yellow", "Blue"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_rpegg_valk"]
    }, {
        "meta_id": 44,
        "id": 3844,
        "name": "Missile Toe RPEGG",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Christmas",
            "tags": ["Christmas2", "Premium", "Red", "White", "Hohoho", "bun_mistle"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": false,
        "sku": ["item_rpegg_christ"]
    }, {
        "meta_id": 45,
        "id": 3845,
        "name": "New Year 2023 RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NewYear2023",
            "tags": ["NewYears", "2023", "Red", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 46,
        "id": 3846,
        "name": "Farm RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Farm",
            "tags": ["Farm", "FebM23", "Barn", "Red", "May24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 147,
        "id": 3947,
        "name": "Equinox RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Equinox",
            "tags": ["Equinox", "July23", "Blue", "Yellow", "Sun", "Moon"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 148,
        "id": 3948,
        "name": "MenoXD RPEGG",
        "price": 75000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Meno",
            "tags": ["JulyM23", "Red", "Black", "xd"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 149,
        "id": 3949,
        "name": "Kart RPEGG",
        "price": 2500,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Kart",
            "tags": ["Kart", "Aug23", "Blue", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 150,
        "id": 3950,
        "name": "Thee_Owl RPEGG",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_TheeOwl",
            "tags": ["Drops5", "AugM23", "Twitch", "Green", "Fingers"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 151,
        "id": 3951,
        "name": "Fusion RPEGG",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Fusion",
            "tags": ["Oct23", "Premium", "Blue", "White", "Gray", "Grey", "bun_borg"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_rpegg_fusion"]
    }, {
        "meta_id": 152,
        "id": 3952,
        "name": "Skellington RPEGG",
        "price": 5,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Skeleton",
            "tags": ["OctM23", "Premium", "Black", "White", "Oct24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_rpegg_skele"]
    }, {
        "meta_id": 153,
        "id": 3953,
        "name": "Ancient RPEGG",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Ruins",
            "tags": ["Nov23", "Mayan", "Gray", "Grey", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 154,
        "id": 3954,
        "name": "Holideggs RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_PresentRed",
            "tags": ["Dec23", "Christmas3", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 155,
        "id": 3955,
        "name": "2024 RPEGG",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_NewYear2024",
            "tags": ["DecM23", "2024", "NewYears", "Blue", "White"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 156,
        "id": 3956,
        "name": "Racer RPEGG",
        "price": 25000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_RaceCar",
            "tags": ["JanM24", "Racer", "White", "Orange", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": -113,
        "id": 3687,
        "name": "Broken item - do not use",
        "price": 50000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Pickles",
            "tags": ["JunM24", "Food", "Green", "Nobby"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 157,
        "id": 3957,
        "name": "Chubby Pickle RPEGG",
        "price": 50000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Pickles",
            "tags": ["JunM24", "Food", "Green", "Nobby"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 158,
        "id": 3958,
        "name": "Infernal RPEGG",
        "price": 3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Infernal",
            "tags": ["AugM24", "Infernal", "Black", "Red", "Orange"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_rpegg_infernal"]
    }, {
        "meta_id": 159,
        "id": 3959,
        "name": "Spore RPEGG",
        "price": 2147483647,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_Mushroom",
            "tags": ["NovM24", "Giveaway", "Funghi", "Green"]
        },
        "is_available": false,
        "unlock": "manual"
    }],
    "Cluck9mm": [{
        "meta_id": 0,
        "id": 3000,
        "name": "The Cluck 9mm",
        "price": 0,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm",
            "tags": ["Red", "Grey", "Gray", "Silver"]
        },
        "is_available": true,
        "unlock": "default"
    }, {
        "meta_id": 1,
        "id": 3001,
        "name": "GOLD Cluck 9mm",
        "price": 1500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Gold",
            "tags": ["Brown", "Gold", "Grey", "Gray", "Silver"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 2,
        "id": 3002,
        "name": "Happy Bear Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Bear",
            "tags": ["White", "Pink", "Cute", "Heart"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 3,
        "id": 3003,
        "name": "Halloween Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Halloween",
            "tags": ["Halloween", "Oct23", "Purple", "Green", "Bat", "Wings", "Oct24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 4,
        "id": 3004,
        "name": "Thanksgiving Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Turkey",
            "tags": ["NovM23", "Thanksgiving", "Brown", "Red", "Purple", "Eye", "NovM24"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 5,
        "id": 3005,
        "name": "Christmas Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Present",
            "tags": ["Christmas", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 6,
        "id": 3006,
        "name": "New Year 2019 Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NewYear",
            "tags": ["NewYears", "2019", "Blue", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 7,
        "id": 3007,
        "name": "Groundhog Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Groundhog",
            "tags": ["Groundhog", "Feb23", "Brown", "Feb24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 8,
        "id": 3008,
        "name": "Buck Rogers Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Buck",
            "tags": ["Promotional", "Gray", "Grey", "Silver"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 9,
        "id": 3009,
        "name": "Valentines Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Valentines",
            "tags": ["ValentinesDay", "Heart", "Brown", "Leopard", "Red"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 10,
        "id": 3010,
        "name": "St Patricks Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_SaintPaddy",
            "tags": ["StPatricksDay", "MarM23", "Green", "Black", "Yellow", "Mar24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 11,
        "id": 3011,
        "name": "Easter Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Easter",
            "tags": ["Easter", "Pink", "Blue", "Eggs", "MarM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 12,
        "id": 3012,
        "name": "Flame Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Flames",
            "tags": ["Promotional", "Red", "Brown"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 13,
        "id": 3013,
        "name": "Rainbow Cluck 9mm",
        "price": 10000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Rainbow",
            "tags": ["Rainbow", "White", "Red", "Orange", "Yellow", "Green", "Blue", "Purple", "Black"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 14,
        "id": 3014,
        "name": "Steampunk Cluck 9mm",
        "price": 10000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Steampunk",
            "tags": ["Steampunk", "Brown", "Gears"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 15,
        "id": 3015,
        "name": "Memphis Cluck 9mm",
        "price": 7500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Memphis",
            "tags": ["Memphis", "White", "Black", "Pink"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 16,
        "id": 3016,
        "name": "Eggwalker Cluck 9mm",
        "price": 4,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_spaceEgg",
            "tags": ["Eggwalker", "July23", "Black", "Red", "Grey", "Gray", "Yellow"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_9mm_space"]
    }, {
        "meta_id": 17,
        "id": 3017,
        "name": "Nuke Zone Skin Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NukeZone",
            "tags": ["NukeZone", "Yellow", "Black", "Neon"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 18,
        "id": 3018,
        "name": "New Year 2020 Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NewYear2020",
            "tags": ["NewYears", "2020", "Purple", "Pink"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 19,
        "id": 3019,
        "name": "Country Singer Cluck 9mm",
        "price": 100000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Snake",
            "tags": ["EggyCash", "Brown", "Snek"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 20,
        "id": 3020,
        "name": "Albino Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_SnakeAlbino",
            "tags": ["EggyCashAlbino", "Snek", "White", "Gray", "Grey", "Red", "ABHS"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 21,
        "id": 3021,
        "name": "Raid Land Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_RaidLand",
            "tags": ["RaidLand", "Newsletter", "Rabbit", "Wabbit", "Heart", "Green", "Brown", "bun_badbunny"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 22,
        "id": 3022,
        "name": "Toxic Cluck 9mm",
        "price": 7500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Toxic",
            "tags": ["Rotten", "Black", "Green", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 23,
        "id": 3023,
        "name": "Music Cluck 9mm",
        "price": 8000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Music",
            "tags": ["Rockstar", "JanM23", "Grey", "Gray", "Harmonica", "SepM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 24,
        "id": 3024,
        "name": "Galeggsy Cluck 9mm",
        "price": 7500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Galaxy",
            "tags": ["Galeggsy", "AprM23", "Blue", "Purple", "Blurple", "Stars", "Aug24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 25,
        "id": 3025,
        "name": "Techno Cluck 9mm",
        "price": 10,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Techno",
            "tags": ["AprM23", "Red", "Orange", "Yellow", "Pop", "Black", "SepM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_9mm_techno"]
    }, {
        "meta_id": 26,
        "id": 3026,
        "name": "Cubic Castles Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_CubicCastles",
            "tags": ["CubicCastles", "White", "Black", "Red", "Skull"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 27,
        "id": 3027,
        "name": "Chicken Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Chicken",
            "tags": ["Chicken", "Red", "White", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 28,
        "id": 3028,
        "name": "New Year 2021 Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NewYear2021",
            "tags": ["NewYears", "2021", "Pink", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 29,
        "id": 3029,
        "name": "Retro Cluck 9mm",
        "price": 5,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Retro",
            "tags": ["Retro", "Premium", "Pixel", "Red", "Gray", "Grey", "Silver", "Wings", "OctM23", "bun_gamer"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_retro_9mm"]
    }, {
        "meta_id": 30,
        "id": 3030,
        "name": "Car Cluck 9mm",
        "price": 7500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_car",
            "tags": ["Cars", "Trains", "Red"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 31,
        "id": 3031,
        "name": "Merc Zone Cluck 9mm",
        "price": 7000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Merc",
            "tags": ["Merc", "Suit", "Black", "Tie", "Red"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 32,
        "id": 3032,
        "name": "Summer Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Watergun",
            "tags": ["Summer", "JunM23", "Blue", "Orange", "Yellow", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 33,
        "id": 3033,
        "name": "Lyerpald Cluck 9mm",
        "price": 25000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_lyerpald",
            "tags": ["Dog", "Grey", "Gray", "Purple"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 34,
        "id": 3034,
        "name": "Pencil Cluck 9mm",
        "price": 1500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Pencil",
            "tags": ["Pencil", "Sep23", "Orange", "Yellow", "Sep24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 35,
        "id": 3035,
        "name": "Devilish Cluck 9mm",
        "price": 15000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Devilish",
            "tags": ["Kids", "Red", "Black", "Purple", "Fork", "bun_demon"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 36,
        "id": 3036,
        "name": "Bone Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Bones",
            "tags": ["Halloween2", "Oct23", "Oct24", "bun_dove"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 37,
        "id": 3037,
        "name": "New Year 2022 Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NewYear2022",
            "tags": ["NewYears", "2022", "Blue", "Red", "Gold"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 38,
        "id": 3038,
        "name": "Sleigh Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Christmas",
            "tags": ["Christmas2", "Newsletter", "Red", "Yellow", "Green", "Gold", "Sleigh"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 39,
        "id": 3039,
        "name": "Cards Cluck 9mm",
        "price": 1520,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Cards",
            "tags": ["EGGORG", "Apr23", "Aug24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 40,
        "id": 3040,
        "name": "BWD Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Wizard",
            "tags": ["Relic", "Drops2", "Blue", "Brown", "Crystal"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 41,
        "id": 3041,
        "name": "Dino Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Dino",
            "tags": ["Dino", "May23", "Brown", "Yellow", "AugM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 42,
        "id": 3042,
        "name": "Eggpire Cluck 9mm",
        "price": 12500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_spaceEggAlt",
            "tags": ["Eggwalker2", "Black", "Grey", "Gray", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 43,
        "id": 3043,
        "name": "SPORTS Cluck 9mm",
        "price": 2000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Sports",
            "tags": ["Sports", "JulyM23", "White", "Bowling", "Pin", "JunM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 44,
        "id": 3044,
        "name": "Breakfast Cluck 9mm",
        "price": 1500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Breakfast",
            "tags": ["Breakfast", "Food", "Apple", "Juice", "Red", "MayM24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 45,
        "id": 3045,
        "name": "Valkyrie Cluck 9mm",
        "price": 5,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Valkyrie",
            "tags": ["Scavenger", "Premium", "Valkyrie", "Gold", "Yellow", "Blue"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_gun_9mm_valk"]
    }, {
        "meta_id": 46,
        "id": 3046,
        "name": "Protractor Cluck 9mm",
        "price": 1500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Protractor",
            "tags": ["Pencil2", "Sep23", "Grey", "Gray", "Black"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 47,
        "id": 3047,
        "name": "Badegg Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Badegg",
            "tags": ["Badegg", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 48,
        "id": 3048,
        "name": "New Year 2023 Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NewYear2023",
            "tags": ["NewYears", "2023", "Red", "Yellow"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 49,
        "id": 3049,
        "name": "Aquarius Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Aquarius",
            "tags": ["Groundhog", "Feb23", "Blue", "Stars"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 50,
        "id": 3050,
        "name": "Cloudkicker Cluck 9mm",
        "price": 5,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Clouds",
            "tags": ["Premium", "Feb23", "Clouds", "Rainbow", "White", "Feb24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_9mm_cloud"]
    }, {
        "meta_id": 51,
        "id": 3051,
        "name": "Farm Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Farm",
            "tags": ["Farm", "FebM23", "Food", "Red", "Tomato", "May24"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 52,
        "id": 3052,
        "name": "Thee_Owl Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_TheeOwl",
            "tags": ["Drops4", "Mar23", "Twitch", "Green", "Fingers"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 53,
        "id": 3053,
        "name": "Merc Zone Final Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_MercF",
            "tags": ["Merc", "Suit", "Black", "Tie"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 54,
        "id": 3054,
        "name": "Fusion Cluck 9mm",
        "price": 5,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Fusion",
            "tags": ["Premium", "AprM23", "White", "Blue", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_9mm_fusion"]
    }, {
        "meta_id": 55,
        "id": 3055,
        "name": "Caught in 4k Cluck 9mm",
        "price": 5,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Camera",
            "tags": ["Jun23", "Photo", "Smile", "Meme", "FebM24"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_9mm_camera"]
    }, {
        "meta_id": 56,
        "id": 3056,
        "name": "Equinox Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Equinox",
            "tags": ["Equinox", "July23", "Blue", "Yellow", "Sun", "Moon"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 57,
        "id": 3057,
        "name": "Kart Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Kart",
            "tags": ["Aug23", "Kart", "Red", "Blue"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 58,
        "id": 3058,
        "name": "Infernal Cluck 9mm",
        "price": 4,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Infernal",
            "tags": ["MarM24", "Infernal", "Black", "Orange", "Red", "Grey", "Gray", "Burn"]
        },
        "is_available": true,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_9mm_infernal"]
    }, {
        "meta_id": 59,
        "id": 3059,
        "name": "Megaphone Cluck 9mm",
        "price": 5,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Megaphone",
            "tags": ["Sep23", "Red", "White", "FebM24", "bun_tactic"]
        },
        "is_available": false,
        "unlock": "premium",
        "activeProduct": true,
        "sku": ["item_9mm_mega"]
    }, {
        "meta_id": 60,
        "id": 3060,
        "name": "Mouse Cluck 9mm",
        "price": 10000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Mouse",
            "tags": ["Sep23", "Grey", "Gray", "Yellow", "Cheese", "bun_cat"]
        },
        "is_available": false,
        "unlock": "manual"
    }, {
        "meta_id": 61,
        "id": 3061,
        "name": "Ancient Cluck 9mm",
        "price": 2000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Ruins",
            "tags": ["Nov23", "Mayan", "Gray", "Grey", "Green"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 62,
        "id": 3062,
        "name": "Holideggs Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_PresentRed",
            "tags": ["Dec23", "Christmas3", "Gold", "Gray", "Grey", "Silver", "Black", "Yellow", "Bow", "Present"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 63,
        "id": 3063,
        "name": "2024 Cluck 9mm",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_NewYear2024",
            "tags": ["DecM23", "2024", "NewYears", "Blue", "White"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 64,
        "id": 3064,
        "name": "Racer Cluck 9mm",
        "price": 25000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_RaceCar",
            "tags": ["JanM24", "Racer", "White", "Orange", "Grey", "Gray"]
        },
        "is_available": true,
        "unlock": "purchase"
    }, {
        "meta_id": 65,
        "id": 3065,
        "name": "Soccer Bros Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Soccer",
            "tags": ["FebM24", "Sbros", "Sports", "Ball", "Black", "White"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 66,
        "id": 3066,
        "name": "Mecha-Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Steambot",
            "tags": ["Apr24", "RotR", "Robots", "Premium"]
        },
        "is_available": false,
        "unlock": "premium"
    }, {
        "meta_id": 67,
        "id": 3067,
        "name": "Stinkbug Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Bugs",
            "tags": ["Jun24", "Bugs", "Brown"]
        },
        "is_available": false,
        "unlock": "purchase"
    }, {
        "meta_id": 68,
        "id": 3068,
        "name": "Spore Cluck 9mm",
        "price": 2147483647,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_Mushroom",
            "tags": ["NovM24", "Giveaway", "Funghi", "Green"]
        },
        "is_available": false,
        "unlock": "manual"
    }],
};

integrateItems(items, {
    "Eggk47": [{
        "meta_id": 20e3 - 1,
        "name": "Eggk-47 Modern",
        "price": 10e3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Soldier Primary Weapons",
        "exclusive_for_class": 0,
        "item_data": {
            "meshName": "gun_eggk47_modern",
            "tags": ["default", "Blue", "Purple", "ModernShellGuns"]
        },
        "is_available": true,
        "unlock": "purchase"
    }],
    "DozenGauge": [{
        "meta_id": 20e3 - 1,
        "name": "Dozen Gauge Modern",
        "price": 10e3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "meshName": "gun_dozenGauge_modern",
            "tags": ["default", "Blue", "Purple", "ModernShellGuns"]
        },
        "is_available": true,
        "unlock": "purchase"
    }],
    "CSG1": [{
        "meta_id": 20e3 - 1,
        "name": "CSG1 Modern",
        "price": 10e3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "meshName": "gun_csg1_modern",
            "tags": ["default", "Blue", "Purple", "ModernShellGuns"]
        },
        "is_available": true,
        "unlock": "purchase"
    }],
    "RPEGG": [{
        "meta_id": 20e3 - 1,
        "name": "RPEGG Modern",
        "price": 10e3,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Eggsploder Primary Weapons",
        "exclusive_for_class": 3,
        "item_data": {
            "meshName": "gun_rpegg_modern",
            "tags": ["default", "Blue", "Purple", "ModernShellGuns"]
        },
        "is_available": true,
        "unlock": "purchase"
    }],
    "Cluck9mm": [{
        "meta_id": 20e3 - 1,
        "name": "Cluck 9mm Modern",
        "price": 10e3,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "meshName": "gun_cluck9mm_modern",
            "tags": ["default", "Blue", "Purple", "ModernShellGuns"]
        },
        "is_available": true,
        "unlock": "purchase"
    }],
});

Object.keys(items).forEach(itemclass => {
    for (var i in items[itemclass]) {
        const item = items[itemclass][i];
        // if (item.unlock !== 'purchase' && item.unlock !== 'default') {
            item.is_available = false;
        // };

        if (item.price === 0) {
            item.price = 2e3;
        } else if (item.price < 50) {
            item.price *= 1e3;
        } else if (item.price > 1e8) {
            item.price = 5e3;
        };
    };
});

export default items;