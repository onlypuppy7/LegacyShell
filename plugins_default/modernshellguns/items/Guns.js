/*
    Cluck9mm default weapons

    Edit meta ids in the range 0-50,000

    Up to 10k is intended to be used for the items from the original game
    10k-20k is intended to be used for custom items in the LegacyShellCore plugin
    Past that is fair game for custom items in other plugins
*/

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
        "name": "Dozen Gauge",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge"
        },
        "is_available": true
    }, {
        "meta_id": 1,
        "id": 3601,
        "name": "Dozen Gauge GOLD",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Gold"
        },
        "is_available": true
    }, {
        "meta_id": 2,
        "id": 3602,
        "name": "Happy Gun Bear Dozen Gauge",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Bear"
        },
        "is_available": true
    }, {
        "meta_id": 3,
        "id": 3603,
        "name": "Dozen Gauge Halloween",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Halloween",
            "tags": ["Halloween"]
        },
        "is_available": false
    }, {
        "meta_id": 4,
        "id": 3604,
        "name": "Dozen Gauge Thanksgiving",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Turkey",
            "tags": ["Thanksgiving"]
        },
        "is_available": false
    }, {
        "meta_id": 5,
        "id": 3605,
        "name": "Dozen Gauge Christmas",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Present",
            "tags": ["Christmas"]
        },
        "is_available": false
    }, {
        "meta_id": 6,
        "id": 3606,
        "name": "Dozen Gauge New Years",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_NewYear",
            "tags": ["NewYears2019"]
        },
        "is_available": false
    }, {
        "meta_id": 7,
        "id": 3607,
        "name": "Dozen Gauge Groundhog",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Groundhog",
            "tags": ["GroundhogDay"]
        },
        "is_available": true
    }, {
        "meta_id": 8,
        "id": 3608,
        "name": "Dozen Gauge Buck Rogers",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Scrambler Primary Weapons",
        "exclusive_for_class": 1,
        "item_data": {
            "class": "DozenGauge",
            "meshName": "gun_dozenGauge_Buck",
            "tags": ["Promotional"]
        },
        "is_available": false
    }],
    "CSG1": [{
        "meta_id": 0,
        "id": 3400,
        "name": "CSG1",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1"
        },
        "is_available": true
    }, {
        "meta_id": 1,
        "id": 3401,
        "name": "CSG1 GOLD",
        "price": 2000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Gold"
        },
        "is_available": true
    }, {
        "meta_id": 2,
        "id": 3402,
        "name": "Happy Gun Bear CSG1",
        "price": 5000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Bear"
        },
        "is_available": true
    }, {
        "meta_id": 3,
        "id": 3403,
        "name": "CSG1 Halloween",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Halloween",
            "tags": ["Halloween"]
        },
        "is_available": false
    }, {
        "meta_id": 4,
        "id": 3404,
        "name": "CSG1 Thanksgiving",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Turkey",
            "tags": ["Thanksgiving"]
        },
        "is_available": false
    }, {
        "meta_id": 5,
        "id": 3405,
        "name": "CSG1 Christmas",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Present",
            "tags": ["Christmas"]
        },
        "is_available": false
    }, {
        "meta_id": 6,
        "id": 3406,
        "name": "CSG1 New Years",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_NewYear",
            "tags": ["NewYears2019"]
        },
        "is_available": false
    }, {
        "meta_id": 7,
        "id": 3407,
        "name": "CSG1 Groundhog",
        "price": 3000,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Groundhog",
            "tags": ["GroundhogDay"]
        },
        "is_available": true
    }, {
        "meta_id": 8,
        "id": 3408,
        "name": "CSG1 Buck Rogers",
        "price": 0,
        "item_type_id": 3,
        "item_type_name": "Primary",
        "category_name": "Ranger Primary Weapons",
        "exclusive_for_class": 2,
        "item_data": {
            "class": "CSG1",
            "meshName": "gun_csg1_Buck",
            "tags": ["Promotional"]
        },
        "is_available": false
    }],
    "Cluck9mm": [{
        "meta_id": 0,
        "id": 3000,
        "name": "Cluck 9mm",
        "price": 0,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm"
        },
        "is_available": true
    }, {
        "meta_id": 1,
        "id": 3001,
        "name": "Cluck 9mm GOLD",
        "price": 1500,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Gold"
        },
        "is_available": true
    }, {
        "meta_id": 2,
        "id": 3002,
        "name": "Happy Gun Bear Cluck 9mm",
        "price": 5000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Bear"
        },
        "is_available": true
    }, {
        "meta_id": 3,
        "id": 3003,
        "name": "Cluck 9mm Halloween",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Halloween",
            "tags": ["Halloween"]
        },
        "is_available": false
    }, {
        "meta_id": 4,
        "id": 3004,
        "name": "Cluck 9mm Thanksgiving",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Turkey",
            "tags": ["Thanksgiving"]
        },
        "is_available": false
    }, {
        "meta_id": 5,
        "id": 3005,
        "name": "Cluck 9mm Christmas",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Present",
            "tags": ["Christmas"]
        },
        "is_available": false
    }, {
        "meta_id": 6,
        "id": 3006,
        "name": "Cluck 9mm New Years",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_NewYear",
            "tags": ["NewYears2019"]
        },
        "is_available": false
    }, {
        "meta_id": 7,
        "id": 3007,
        "name": "Cluck 9mm Groundhog",
        "price": 3000,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Groundhog",
            "tags": ["GroundhogDay"]
        },
        "is_available": true
    }, {
        "meta_id": 8,
        "id": 3008,
        "name": "Cluck 9mm Buck Rogers",
        "price": 0,
        "item_type_id": 4,
        "item_type_name": "Secondary",
        "category_name": "Shared Secondary Weapons",
        "exclusive_for_class": null,
        "item_data": {
            "class": "Cluck9mm",
            "meshName": "gun_cluck9mm_Buck",
            "tags": ["Promotional"]
        },
        "is_available": false
    }],
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
            "meshName": "gun_rpegg"
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
        "is_available": true
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
    }],
};

Object.keys(items).forEach(itemclass => {
    for (var i in items[itemclass]) {
        const gun = items[itemclass][i];
        if (gun.unlock !== 'purchase') {
            gun.is_available = false;
        };
    };
});

export default items;