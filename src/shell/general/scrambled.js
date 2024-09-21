//modified from statefarm bot toolkit :trollage:

const scrambled = {

    getRandomInt: function (min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    getRandomChance: function (chance) {
        return (Math.random() <= chance);
    },
    
    getRandomChar: function () {
        const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return (characters)[getRandomInt(0, characters.length - 1)];
    },
    
    getRandomCode: function (long) {
        long = long || 7;
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return Array.from({ length: long }, () => (characters)[getRandomInt(0, characters.length - 1)]).join('');
    },
    
    getScrambled: function (min, max) {
        min = min || 6;
        max = max || 12;
        return Array.from({ length: getRandomInt(min, max) }, () => getRandomChar()).join('');
    },
    
    getRandomBool: function () {
        return getRandomInt(1, 2) == 1;
    },
    
    getRandomName: function (moreRandom) {
        var name, num;
        var n1 = ["Captain", "Lord", "Supreme", "Master", "Pro", "Noob"];
        var n2 = ["Egg", "Yolk", "Shell", "Cluck", "Chick", "Bird"];
        do {
            num = getRandomInt(1, 99);
        } while (num == 69);
        if (getRandomInt(0, 2) == 0) {
            name = n1[getRandomInt(0, n1.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + n2[getRandomInt(0, n2.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + (getRandomBool() && moreRandom ? " " : num);
        } else {
            name = n2[getRandomInt(0, n2.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + n1[getRandomInt(0, n1.length - 1)] + (getRandomBool() && moreRandom ? " " : "") + (getRandomBool() && moreRandom ? " " : num);
        };
        if (getRandomBool() && moreRandom) name = name.toLowerCase();
        return name;
    },

    getRandomFromList: function (list) {
        return list[scrambled.getRandomInt(0, list.length - 1)];
    },
};

export default scrambled;