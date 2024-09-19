//modified from statefarm bot toolkit :trollage:

const getRandomInt = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

const getRandomChance = function (chance) {
    return (Math.random() <= chance);
};

const getRandomChar = function () {
    const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return (characters)[getRandomInt(0, characters.length - 1)];
};

const getRandomCode = function (long) {
    long = long || 7;
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: long }, () => (characters)[getRandomInt(0, characters.length - 1)]).join('');
};

const getScrambled = function (min, max) {
    min = min || 6;
    max = max || 12;
    return Array.from({ length: getRandomInt(min, max) }, () => getRandomChar()).join('')
};

const getRandomBool = function () {
    return getRandomInt(1, 2) == 1;
};

const getRandomName = function (moreRandom) {
    var name, num;
    var n1 = ["Captain", "Lord", "Supreme", "Master", "Pro", "Noob"];
    var n2 = ["Egg", "Yolk", "Shell", "Cluck", "Chick", "Bird"];
    do {
        num = getRandomInt(1, 99);
    } while (num == 69);
    if (getRandomInt(0, 2) == 0) {
        name = n1[getRandomInt(0, n1.length - 1)] + (getRandomBool() && moreRandom ? "" : " ") + n2[getRandomInt(0, n2.length - 1)] + (getRandomBool() && moreRandom ? "" : " ") + (getRandomBool() && moreRandom ? "" : num);
    } else {
        name = n2[getRandomInt(0, n2.length - 1)] + (getRandomBool() && moreRandom ? "" : " ") + n1[getRandomInt(0, n1.length - 1)] + (getRandomBool() && moreRandom ? "" : " ") + (getRandomBool() && moreRandom ? "" : num);
    };
    if (getRandomBool() && moreRandom) name = name.toLowerCase();
    return name;
};

export default {
    getRandomInt,
    getRandomChance,
    getRandomChar,
    getScrambled,
    getRandomCode,
    getRandomName,
    getRandomBool,
};