//legacyshell: gametypes
//

export const ItemTypes = {
    AMMO: 0,
    GRENADE: 1
};

export var defaultOptions = {
    teamsEnabled: false,
    itemsEnabled: [ //itemType enum, spawn per how much surface area, minimum
        [ItemTypes.AMMO, 25, 4],
        [ItemTypes.GRENADE, 65, 5]
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
};

export var GameTypes = [
    {
        shortName: "FFA",
        longName: "Free For All",
        codeName: "ffa",
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
        }
    }
];

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

export var getMapPool = function (maps, mapPool) {
    return maps.filter(map => (!map.modes) || map.modes[mapPool]);
};