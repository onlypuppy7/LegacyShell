//legacyshell: gametypes
import { ItemTypes } from '#items';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export var defaultOptions = {
    teamsEnabled: false,
    itemsEnabled: [ //itemType enum, spawn per how much surface area, minimum
        [ItemTypes.AMMO, 25, 4],
        [ItemTypes.GRENADE, 65, 5],
        // [ItemTypes.HEALTH, 45, 5],
    ],
    teamSwitchMaximumDifference: 0,
    scale: [
        1, //ffa
        1, //team1
        1, //team2
    ],
    speedModifier: [
        1, //ffa
        1, //team1
        1, //team2
    ],
    gravityModifier: [
        1, //ffa
        1, //team1
        1, //team2
    ],
    regenModifier: [
        1, //ffa
        1, //team1
        1, //team2
    ],
    damageModifier: [
        1, //ffa
        1, //team1
        1, //team2
    ],
    resistanceModifier: [
        1, //ffa
        1, //team1
        1, //team2
    ],
    jumpBoostModifier: [
        1, //ffa
        1, //team1
        1, //team2
    ],
};

export var GameTypes = [
    {
        shortName: "FFA",
        longName: "Free For All",
        codeName: "ffa", //used for creation of GameType enum
        mapPool: "FFA", //the pool of maps to use. helps with avoiding having to assign game types to maps retroactively when making a new game mode
        options: {
        }
    }, {
        shortName: "Teams",
        longName: "Teams",
        codeName: "teams",
        mapPool: "Teams",
        options: {
            teamsEnabled: true,
        }
    }, {
        shortName: "Scale",
        longName: "Scale Shift",
        codeName: "scale",
        mapPool: "Scale",
        options: {
            teamsEnabled: true,
            scale: [
                1, //ffa
                0.4, //team1
                2, //team2
            ],
            gravityModifier: [
                1, //ffa
                1, //team1
                0.5, //team2
            ],
            regenModifier: [
                1, //ffa
                2, //team1
                0.25, //team2
            ],
            teamSwitchMaximumDifference: 1,
        }
    }
];

console.log("############################### 300");
plugins.emit('GameTypesInit', { GameTypes, ItemTypes, defaultOptions });

export var AllMapPools = [];

//fill in defaults where not present (makes the thing above cleaner)
(function () {
    var i = 0;

    GameTypes.forEach(gameType => {
        gameType.options = {
            ...defaultOptions,
            ...gameType.options,
        };
        gameType.value = i++;
        if (gameType.mapPool && !AllMapPools.includes(gameType.mapPool)) {
            AllMapPools.push(gameType.mapPool);
        };
    });
})();

//LS: dynamically create from GameTypes (compatability and also lazy xdd)
export var GameType = GameTypes.reduce((acc, gameType, index) => {
    acc[gameType.codeName] = index;
    return acc;
}, {});

export var getMapPool = function (mapsList, mapPool, maps) {
    let generatedMapPool = [];
    mapsList.forEach(map => {
        var thisMap = map;
        if (typeof map === "number") {
            thisMap = maps[map];
        };
        if (thisMap?.modes && thisMap.modes[mapPool]) {
            generatedMapPool.push(map);
        };
    });
    return generatedMapPool;
};
        
export function getMapsByAvailability(maps, availability) {
    let mapAvailability = {
        public: [],
        private: [],
        both: []
    };

    for (let i = 0; i < maps.length; i++) {
        let map = maps[i];
        switch (map.availability) {
            case "public":
                mapAvailability.public.push(map);
                break;
            case "private":
                mapAvailability.private.push(map);
                break;
            case "both":
                mapAvailability.public.push(map);
                mapAvailability.private.push(map);
                mapAvailability.both.push(map);
                break;
        };
    };

    if (availability) {
        mapAvailability = mapAvailability[availability];
    };

    return mapAvailability;
};

export function convertMapListToIds(maps) { //support for both object and array
    if (Array.isArray(maps)) {
        return maps.map(map => map.id);
    } else if (typeof maps === "object") {
        Object.keys(maps).forEach(key => {
            maps[key] = maps[key].map(map => map.id);
        });
        return maps;
    };
};

export function getMapsByAvailabilityAsInts(maps, availability) { //great name btw not too long at all
    return convertMapListToIds(getMapsByAvailability(maps, availability));
};