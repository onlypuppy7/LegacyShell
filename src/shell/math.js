//legacyshell: basic
import { isClient } from '#constants';
//

//(server-only-start)
//(server-only-end)

function extendMath (Math) {
    Math.PI2 = 2 * Math.PI, Math.PI90 = Math.PI / 2;
    if (!Math.seed) Math.seed = 100;
    Math.mod = function (n, m) {
        var remain = n % m;
        return 0 <= remain ? remain : remain + m
    };
    Math.length2 = function (x, y) {
        return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2))
    };
    Math.length3 = function (x, y, z) {
        return Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2) + Math.pow(z, 2))
    };
    Math.capVector2 = function (vec, len) {
        var l = Math.length2(vec.x, vec.y);
        return len < l && (vec.x *= len / l, vec.y *= len / l), vec
    };
    Math.capVector3 = function (vec, len) {
        var l = Math.length3(vec.x, vec.y, vec.z);
        return len < l && (vec.x *= len / l, vec.y *= len / l, vec.z *= len / l), vec
    };
    Math.normalize2 = function (vec, len) {
        len = len || 1;
        var l = Math.length2(vec.x, vec.y);
        return vec.x *= len / l, vec.y *= len / l, vec
    };
    Math.normalize3 = function (vec, len) {
        len = len || 1;
        var l = Math.length3(vec.x, vec.y, vec.z);
        return vec.x *= len / l, vec.y *= len / l, vec.z *= len / l, vec
    };
    Math.clamp = function (v, min, max) {
        return Math.max(Math.min(v, max), min)
    };
    Math.radAdd = function (a, b) {
        return Math.mod(a + b, Math.PI2)
    };
    Math.radSub = function (a, b) {
        return Math.mod(a - b, Math.PI2)
    };
    Math.radRange = function (n) {
        return Math.mod(n, Math.PI2)
    };
    Math.radDifference = function (fromAngle, toAngle) {
        var diff = (fromAngle - toAngle + Math.PI) % Math.PI2 - Math.PI;
        return diff = diff < -Math.PI ? diff + Math.PI2 : diff
    };
    Math.cardVals = [0, Math.PI90, Math.PI, 3 * Math.PI90], Math.cardToRad = function (card) {
        return Math.cardVals[card]
    };
    Math.randomInt = function (low, high) {
        return Math.floor(Math.random() * (high - low) + low)
    };
    Math.seededRandom = function (min, max) {
        return min = min || 0, max = max || 1, Math.seed = (9301 * Math.seed + 49297) % 233280, min + Math.seed / 233280 * (max - min)
    };
    Math.seededRandomInt = function (min, max) {
        return Math.floor(Math.seededRandom(min, max))
    };
    Math.diff = function (a, b, threshold) {
        return b < a ? threshold - a + b : b - a;
    };
    Math.shuffleArray = function (array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        };
        return array;
    };
    
    //scrambled functions from sfbt
    Math.getRandomInt = function (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    };
    
    Math.getRandomChance = function (chance) {
        return (Math.random() <= chance);
    };
    
    Math.getRandomChar = function () {
        const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return (characters)[Math.getRandomInt(0, characters.length - 1)];
    };
    
    Math.getRandomCode = function (long) {
        long = long || 7;
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return Array.from({ length: long }, () => (characters)[Math.getRandomInt(0, characters.length - 1)]).join('');
    };
    
    Math.getScrambled = function (min, max) {
        min = min || 6;
        max = max || 12;
        return Array.from({ length: Math.getRandomInt(min, max) }, () => getRandomChar()).join('');
    };
    
    Math.getRandomBool = function () {
        return Math.getRandomInt(1, 2) == 1;
    };
    
    Math.getRandomName = function (moreRandom) {
        var name, num;
        var n1 = ["Captain", "Lord", "Supreme", "Master", "Pro", "Noob"];
        var n2 = ["Egg", "Yolk", "Shell", "Cluck", "Chick", "Bird"];
        do {
            num = Math.getRandomInt(1, 99);
        } while (num == 69);
        if (Math.getRandomInt(0, 2) == 0) {
            name = n1[Math.getRandomInt(0, n1.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + n2[Math.getRandomInt(0, n2.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + (getRandomBool() && moreRandom ? " " : num);
        } else {
            name = n2[Math.getRandomInt(0, n2.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + n1[Math.getRandomInt(0, n1.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + (getRandomBool() && moreRandom ? " " : num);
        };
        if (getRandomBool() && moreRandom) name = name.toLowerCase();
        return name;
    };

    Math.getRandomFromList = function (list) {
        return list[Math.getRandomInt(0, list.length - 1)];
    };
    return Math;
};

export default extendMath;