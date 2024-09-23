//legacyshell: colours
import BABYLON from "babylonjs";
//

var item_classes;
var classes;

if (isClient) {
    item_classes = { //to make the items json-able
        "Cluck9mm": Cluck9mm,
        "CSG1": CSG1,
        "DozenGauge": DozenGauge,
        "RPEGG": RPEGG,
        "Eggk47": Eggk47,
    };

    classes = [
        {
            name: "Soldier",
            weapon: Eggk47
        }, {
            name: "Scrambler",
            weapon: DozenGauge
        }, {
            name: "Free Ranger",
            weapon: CSG1
        }, {
            name: "Eggsploder",
            weapon: RPEGG
        }
    ];
};

var Slot = {
    Primary: 0,
    Secondary: 1
};

var ItemType = {
    Hat: 1,
    Stamp: 2,
    Primary: 3,
    Secondary: 4
};

var CharClass = {
    Soldier: 0,
    Scrambler: 1,
    Ranger: 2,
    Eggsploder: 3
};

CharClass.length = Object.keys(CharClass).length;

var Team = {
    blue: 1,
    red: 2
};

var teamColors = {
    text: ["rgba(255, 255, 255, 1)", "rgba(64, 224, 255, 1)", "rgba(255, 192, 160, 1)"],
    meBackground: ["rgba(255, 192, 64, 0.75)", "rgba(0, 192, 255, 0.8)", "rgba(192, 64, 32, 0.8)"],
    themBackground: ["rgba(0, 0, 0, 0.25)", "rgba(0, 64, 192, 0.3)", "rgba(192, 64, 32, 0.3)"],
    summaryBackground: ["rgba(64, 64, 64, 0.75)", "rgba(0, 64, 192, 0.75)", "rgba(192, 64, 32, 0.75)"],
    outline: [new BABYLON.Color4(1, 1, 1, 1), new BABYLON.Color4(0, .75, 1, 1), new BABYLON.Color4(1, .25, .25, 1)]
};

var GameType = {
    ffa: 0,
    teams: 1
};

var GameTypes = [
    {
        shortName: "FFA",
        longName: "Free For All"
    }, {
        shortName: "Teams",
        longName: "Teams"
    }
];

var CONTROL = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    jump: 16,
    fire: 32
};

var FramesBetweenSyncs = Math.ceil(6);

var stateBufferSize = 256;

var weaponStats = {
    totalDamage: {
        name: "damage",
        max: -1e3,
        min: 1e3,
        flip: false
    },
    accuracy: {
        name: "accuracy",
        max: -1e3,
        min: 1e3,
        flip: true
    },
    rof: {
        name: "fireRate",
        max: -1e3,
        min: 1e3,
        flip: true
    },
    range: {
        name: "range",
        max: -1e3,
        min: 1e3,
        flip: false
    }
};

var shellColors = ["#ffffff", "#c4e3e8", "#e2bc8b", "#d48e52", "#cb6d4b", "#8d3213", "#5e260f", "#e70a0a", "#aa24ce", "#f17ff9", "#FFD700", "#33a4ea", "#3e7753", "#66dd33"];

var flashColors = [new BABYLON.Color3(1, 1, 0), new BABYLON.Color3(0, .5, 1), new BABYLON.Color3(1, 0, 0)];

var fireColors = [
    {
        pos: 0,
        color: new BABYLON.Color4(1, .9, .8, 1)
    }, {
        pos: .2,
        color: new BABYLON.Color4(1, .5, .1, 1)
    }, {
        pos: .4,
        color: new BABYLON.Color4(.6, .2, 0, 1)
    }, {
        pos: .7,
        color: new BABYLON.Color4(0, 0, 0, 0)
    }, {
        pos: 1,
        color: new BABYLON.Color4(0, 0, 0, 0)
    }
];

var smokeColors = [
    {
        pos: 0,
        color: new BABYLON.Color4(.3, .3, .3, 1)
    }, {
        pos: 1,
        color: new BABYLON.Color4(.7, .7, .7, 0)
    }
];

var bulletHitColors = [
    {
        pos: 0,
        color: new BABYLON.Color4(1, 1, 1, 1)
    }, {
        pos: .2,
        color: new BABYLON.Color4(.7, .7, .7, .7)
    }, {
        pos: 1,
        color: new BABYLON.Color4(.7, .7, .7, 0)
    }
];

var color4White = new BABYLON.Color4(1, 1, 1, 1);

var Ease = {
    linear: function (t) {
        return t
    },
    inQuad: function (t) {
        return t * t
    },
    outQuad: function (t) {
        return t * (2 - t)
    },
    inOutQuad: function (t) {
        return t < .5 ? 2 * t * t : (4 - 2 * t) * t - 1
    },
    inCubic: function (t) {
        return t * t * t
    },
    outCubic: function (t) {
        return --t * t * t + 1
    },
    inOutCubic: function (t) {
        return t < .5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
    },
    inQuart: function (t) {
        return t * t * t * t
    },
    outQuart: function (t) {
        return 1 - --t * t * t * t
    },
    inOutQuart: function (t) {
        return t < .5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t
    },
    inQuint: function (t) {
        return t * t * t * t * t
    },
    outQuint: function (t) {
        return 1 + --t * t * t * t * t
    },
    inOutQuint: function (t) {
        return t < .5 ? 16 * t * t * t * t * t : 1 + 16 * --t * t * t * t * t
    }
};

//(server-only-start)

export default {
    item_classes,
    Slot,
    ItemType,
    CharClass,
    Team,
    teamColors,
    GameType,
    GameTypes,
    CONTROL,
    classes,
    FramesBetweenSyncs,
    stateBufferSize,
    weaponStats,
    shellColors,
    flashColors,
    fireColors,
    smokeColors,
    bulletHitColors,
    color4White,
    Ease
};

//(server-only-end)