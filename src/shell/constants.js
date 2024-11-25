//legacyshell: constants
import BABYLON from "babylonjs";
import { Eggk47, DozenGauge, CSG1, RPEGG, Cluck9mm } from "#guns";
//cba to change the imports for everything that uses constants
import { isClient, isServer, devlog, clientlog, serverlog, getTimestamp } from "#isClientServer";
//legacyshell: ss
import { ss } from '#misc';
//

export { isClient, isServer, devlog, clientlog, serverlog, getTimestamp };

//(server-only-start)
//(server-only-end)

//these are pretty damn important:

export const fps = 60; //currently i havent worked out how exactly this can be unhooked

export const renderLoopStep = 1e3 / fps;

/**
* do not change! this is basically how many updates per second. change this and you will change the speed of the game!
 */
export const ticksPerSecond = fps;

export const gameDelta = fps / ticksPerSecond;

/**
* you can change this, it will affect the next variable (which is actually used)
*
* (fyi: never directly used)
 */
export const syncsPerSecond = 10;

/**
* how many statebuffers to pack at once. in theory, it will be less smoother the higher it is, but demands better latency.
 */
export var FramesBetweenSyncs = Math.ceil(ticksPerSecond / syncsPerSecond);

/**
* the interval at which the game should process it's logic. don't change this value (unless u like things being screwed up, i guess)
 */
export var TickStep = 1000 / ticksPerSecond;

/**
 * how many states should be stored. to calc how long it will last for: TickStep * stateBufferSize.
 * 
 * with defaults, it is ~4.3 seconds
 * 
 * that is sufficient realistically, and arguably quite big. but im sure the ram usage wont skyrocket that much.
 */
export var stateBufferSize = 256;

/**
 * how far xyz values should be before snapping them.
 * 
 * make this too large, and when the desync is big enough the snap will be greater (probably)
 * 
 * but it fakes-ish smoothness.
 */
export var minimumForCorrection = 0.05;





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

export var itemIdOffsetsByNameOLD = {
    Hat:        1000,
    Stamp:      2000,

    base:       3000,

    Cluck9mm:   3000,
    
    Eggk47:     3100,
    CSG1:       3400,
    DozenGauge: 3600,
    RPEGG:      3800,
};

Object.assign(itemIdOffsetsByNameOLD, { //alt names in case its needed (its not my fault shell uses like 4 fucking names for the same exact thing)
    Hats: itemIdOffsetsByNameOLD.Hat,
    Stamps: itemIdOffsetsByNameOLD.Stamp,

    Primary: itemIdOffsetsByNameOLD.base,

    Soldier: itemIdOffsetsByNameOLD.Eggk47,
    Scrambler: itemIdOffsetsByNameOLD.DozenGauge,
    Ranger: itemIdOffsetsByNameOLD.CSG1,
    Eggsploder: itemIdOffsetsByNameOLD.RPEGG,

    Secondary: itemIdOffsetsByNameOLD.Cluck9mm
});

/**
 * legacyshell added
 * 
 * just for converting old item ids to new ones
 * 
 * @enum {number}
 */
export var itemIdOffsetsOLD = {
    [ItemType.Hat]: itemIdOffsetsByNameOLD.Hat - 1,
    [ItemType.Stamp]: itemIdOffsetsByNameOLD.Stamp - 1,
    [ItemType.Primary]: {
        base: itemIdOffsetsByNameOLD.base,
        [CharClass.Soldier]: itemIdOffsetsByNameOLD.Eggk47 - itemIdOffsetsByNameOLD.base,
        [CharClass.Scrambler]: itemIdOffsetsByNameOLD.DozenGauge - itemIdOffsetsByNameOLD.base,
        [CharClass.Ranger]: itemIdOffsetsByNameOLD.CSG1 - itemIdOffsetsByNameOLD.base,
        [CharClass.Eggsploder]: itemIdOffsetsByNameOLD.RPEGG - itemIdOffsetsByNameOLD.base
    },
    [ItemType.Secondary]: itemIdOffsetsByNameOLD.Cluck9mm
};



export var itemIdOffsetsByName = {
    Hat:         50e3,
    Stamp:      100e3,

    base:       150e3,

    Cluck9mm:   150e3,
    
    Eggk47:     200e3,
    CSG1:       250e3,
    DozenGauge: 300e3,
    RPEGG:      350e3,
};

Object.assign(itemIdOffsetsByName, { //alt names in case its needed (its not my fault shell uses like 4 fucking names for the same exact thing)
    Hats: itemIdOffsetsByName.Hat,
    Stamps: itemIdOffsetsByName.Stamp,

    Primary: itemIdOffsetsByName.base,

    Soldier: itemIdOffsetsByName.Eggk47,
    Scrambler: itemIdOffsetsByName.DozenGauge,
    Ranger: itemIdOffsetsByName.CSG1,
    Eggsploder: itemIdOffsetsByName.RPEGG,

    Secondary: itemIdOffsetsByName.Cluck9mm
});

/**
 * legacyshell added
 * 
 * (these constants shouldve been like this to begin with)
 * 
 * @enum {number}
 */
export var itemIdOffsets = {
    [ItemType.Hat]: itemIdOffsetsByName.Hat - 1,
    [ItemType.Stamp]: itemIdOffsetsByName.Stamp - 1,
    [ItemType.Primary]: {
        base: itemIdOffsetsByName.base,
        [CharClass.Soldier]: itemIdOffsetsByName.Eggk47 - itemIdOffsetsByName.base,
        [CharClass.Scrambler]: itemIdOffsetsByName.DozenGauge - itemIdOffsetsByName.base,
        [CharClass.Ranger]: itemIdOffsetsByName.CSG1 - itemIdOffsetsByName.base,
        [CharClass.Eggsploder]: itemIdOffsetsByName.RPEGG - itemIdOffsetsByName.base
    },
    [ItemType.Secondary]: itemIdOffsetsByName.Cluck9mm
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

export var CONTROL = {
    up: 1,
    down: 2,
    left: 4,
    right: 8,
    jump: 16,
    fire: 32
};

export const MAP = {
    blank: 0,
    ground: 1,
    block: 2,
    column: 3,
    halfBlock: 4,
    ramp: 5,
    ladder: 6,
    tank: 7,
    lowWall: 8,
    todo3: 9,
    barrier: 10
};

export var NextRoundTimeout = 20; //seconds

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

export const stampSize = 128;

export const maxChatWidth = 280;
export var maxChatCount = 6; //max amount of messages to be displayed at once (default 6)

export const maxServerSlots = 50; //not the default, just the highest you think you can manage

export const chatCooldown = 120;

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

export const PingIndicators = [
    {
        int: 0,
        minimumPing: 0,
        color: "#0f0", //green
        icon: "ping1.png"
    },
    {
        int: 1,
        minimumPing: 100,
        color: "#ff0", //yellow
        icon: "ping2.png"
    },
    {
        int: 2,
        minimumPing: 150,
        color: "#f90", //orange
        icon: "ping3.png"
    },
    {
        int: 3,
        minimumPing: 200,
        color: "#f00", //red
        icon: "ping4.png"
    },
];

export function getPingLevel(pingValue) {
    for (let i = PingIndicators.length - 1; i >= 0; i--) {
        if (pingValue >= PingIndicators[i].minimumPing) {
            return PingIndicators[i];
        };
    };
    return PingIndicators[0];
};

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

const thingForTheThing = isClient ? window : null;

export class IntervalManagerConstructor {
    constructor () {
        this.intervals = {};
    };
    set (func, delay) {
        var newInterval = setInterval.apply(thingForTheThing, [func, delay].concat([].slice.call(arguments, 2)));
        return this.intervals[newInterval] = true, newInterval
    };
    clear (handle) {
        return delete this.intervals[handle], clearInterval(handle)
    };
    clearAll () {
        for (var all = Object.keys(this.intervals), len = all.length; 0 < len--;) clearInterval(all.shift());
        this.intervals = {}
    };
};

export class TimeoutManagerConstructor {
    constructor () {
        this.timeouts = {};
    };
    set (func, delay) {
        var newTimeout = setTimeout.apply(thingForTheThing, [func, delay].concat([].slice.call(arguments, 2)));
        return this.timeouts[newTimeout] = true, newTimeout
    };
    clear (handle) {
        delete this.timeouts[handle];
        return clearTimeout(handle)
    };
    clearAll () {
        for (var all = Object.keys(this.timeouts), len = all.length; 0 < len--;) clearTimeout(all.shift());
        this.timeouts = {}
    };
};

export function isObject (val) { return val && typeof val === 'object' && !Array.isArray(val) };

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