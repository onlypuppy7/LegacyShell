//legacyshell: constants
import BABYLON from "babylonjs";
import { Eggk47, DozenGauge, CSG1, RPEGG, Cluck9mm } from "#guns";
//

//(server-only-start)
//(server-only-end)

export const isClient = typeof (window) !== 'undefined'; //best to define once, or something
export const isServer = typeof (window) === 'undefined'; //clearer in code

//all of these cryptic classes are hell.

/**
 * legacyshell added
 * 
 * to make the items json-able (couldve just used classIdx tbh but thats actually more work because cluck9mm isnt a primary weapon)
 */
export var item_classes = {
    "Cluck9mm": Cluck9mm,
    "CSG1": CSG1,
    "DozenGauge": DozenGauge,
    "RPEGG": RPEGG,
    "Eggk47": Eggk47,
};

/**
 * this is used for when you need to use classIdx as a param (because its an int)
 */
export var classes = [
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

/**
 * used in-game, e.g., `me.weaponIdx`.
 * this may as well be a boolean.
 * 
 * @enum {number}
 */
export var Slot = {
    Primary: 0,
    Secondary: 1
};

/**
 * used for items, idk how to describe this
 * 
 * @enum {number}
 */
export var ItemType = {
    Hat: 1,
    Stamp: 2,
    Primary: 3,
    Secondary: 4
};

/**
 * used for items but also for classIdx (its really confusing and inconsistent)
 * 
 * @enum {number}
 */
export var CharClass = {
    Soldier: 0,
    Scrambler: 1,
    Ranger: 2,
    Eggsploder: 3
};

CharClass.length = Object.keys(CharClass).length;

/**
 * legacyshell added
 * 
 * (these constants shouldve been like this to begin with)
 * 
 * @enum {number}
 */
export var itemIdOffsets = {
    [ItemType.Hat]: 999,
    [ItemType.Stamp]: 1999,
    [ItemType.Primary]: {
        base: 3000,
        [CharClass.Soldier]: 100,
        [CharClass.Scrambler]: 600,
        [CharClass.Ranger]: 400,
        [CharClass.Eggsploder]: 800
    },
    [ItemType.Secondary]: 3000
};

export var Team = {
    blue: 1,
    red: 2
};

export var teamColors = {
    text: ["rgba(255, 255, 255, 1)", "rgba(64, 224, 255, 1)", "rgba(255, 192, 160, 1)"],
    meBackground: ["rgba(255, 192, 64, 0.75)", "rgba(0, 192, 255, 0.8)", "rgba(192, 64, 32, 0.8)"],
    themBackground: ["rgba(0, 0, 0, 0.25)", "rgba(0, 64, 192, 0.3)", "rgba(192, 64, 32, 0.3)"],
    summaryBackground: ["rgba(64, 64, 64, 0.75)", "rgba(0, 64, 192, 0.75)", "rgba(192, 64, 32, 0.75)"],
    outline: [new BABYLON.Color4(1, 1, 1, 1), new BABYLON.Color4(0, .75, 1, 1), new BABYLON.Color4(1, .25, .25, 1)]
};

export var GameType = {
    ffa: 0,
    teams: 1
};

export var GameTypes = [
    {
        shortName: "FFA",
        longName: "Free For All"
    }, {
        shortName: "Teams",
        longName: "Teams"
    }
];

export var CONTROL = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    jump: 16,
    fire: 32
};

export var FramesBetweenSyncs = Math.ceil(6);

export var stateBufferSize = 256;

export var weaponStats = {
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

export var shellColors = ["#ffffff", "#c4e3e8", "#e2bc8b", "#d48e52", "#cb6d4b", "#8d3213", "#5e260f", "#e70a0a", "#aa24ce", "#f17ff9", "#FFD700", "#33a4ea", "#3e7753", "#66dd33"];

export var flashColors = [new BABYLON.Color3(1, 1, 0), new BABYLON.Color3(0, .5, 1), new BABYLON.Color3(1, 0, 0)];

export var fireColors = [
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

export var smokeColors = [
    {
        pos: 0,
        color: new BABYLON.Color4(.3, .3, .3, 1)
    }, {
        pos: 1,
        color: new BABYLON.Color4(.7, .7, .7, 0)
    }
];

export var bulletHitColors = [
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

export var color4White = new BABYLON.Color4(1, 1, 1, 1);

export var inputToControlMap = {
    W: "up",
    S: "down",
    A: "left",
    D: "right",
    SPACE: "jump",
    "MOUSE 0": "fire",
    SHIFT: "scope",
    R: "reload",
    E: "weapon",
    Q: "grenade"
};

export var name1stHalf = ["Captain", "Lord", "Supreme", "Master", "Pro", "Noob"];
export var name2ndHalf = ["Egg", "Yolk", "Shell", "Cluck", "Chick", "Bird"];

export var Ease = {
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

// export default { //why is this like this? because we need to define all these as vars in the client. kek. putting it all in one object kinda ugh ngl.
//     item_classes,
//     Slot,
//     ItemType,
//     CharClass,
//     Team,
//     teamColors,
//     GameType,
//     GameTypes,
//     CONTROL,
//     classes,
//     FramesBetweenSyncs,
//     stateBufferSize,
//     weaponStats,
//     shellColors,
//     flashColors,
//     fireColors,
//     smokeColors,
//     bulletHitColors,
//     color4White,
//     Ease
// };

//(server-only-end)