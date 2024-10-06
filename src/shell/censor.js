//

export const censor = { //old isBadWord function
    homoglyphs: [
        [["6", "g"], "9"],
        [["b"], "6"],
        [["|", "l", "i", "1", ";", "¡"], "!"],
        [["e"], "3"],
        [["a", "@"], "4"],
        [["o"], "0"],
        [["s", "$"], "5"],
        [["t"], "7"],
        [["z"], "2"],
    ],
    banned_words: [
        "african",
        "kneegro",
        "school shoot",
        "terrorist",
        "卐",
        "卍",
        "queer",
        "dick",
        "wank",
        "piss",
        "testic",
        "testes",
        "balls",
        "nuts",
        "nutz",
        "jew",
        "kike",
        "retar",
        "autis",
        "downss",
        "boob",
        "8d",
        "porn",
        "swallow",
        "eatme",
        "eatmy",
        "dik",
        "oral",
        "spooge",
        "fuk",
        "jiz",
        "suicid",
        "masterb",
        "spoobe",
        "sperm",
        "penus",
        "pussy",
        "buttsex",
        "fux",
        "butthoie",
        "anal",
        "anus",
        "killblacks",
        "murderblacks",
        "hitler",
        "wetback",
        "agina",
        "gay",
        "asshole",
        "suck",
        "jew",
        "spic",
        "chink",
        "nigga",
        "nigge",
        "nibbe",
        "nigga",
        "nibba",
        "shit",
        "bitch",
        "fuck",
        "cunt",
        "kkk",
        "whore",
        "fag",
        "twat",
        "peni",
        "rapewom",
        "rapegir",
        "rapist",
        "raper",
        "rapin",
        "cock",
        "tits",
        "gook",
        "dickhead"
    ],
    allowed_words: [
        "the",
        "my",
        "your",
        "their",
        "his",
        "her"
    ],
    init: function () {
        let new_banned = [];
        this.banned_words.forEach(word => {
            new_banned.push(this.parse(word));
        });
        this.banned_words = new_banned;

        let new_allowed = [];
        this.allowed_words.forEach(word => {
            new_allowed.push(this.parse(word));
        });
        this.allowed_words = new_allowed;
    },
    parse: function (str, retainSpaces) {
        if (!retainSpaces) str = str.replace(/ /g, "");
        this.homoglyphs.forEach(([chars, replacement]) => {
            chars.forEach(char => {
                str = str.replaceAll(char, replacement);
            });
        });
        return str;
    },
    check_banned: function (str) {
        let result = false;
        this.banned_words.forEach(word => {
            if (str.includes(word)) result = true;
        });
        return result;
    },
    detect: function (word) {
        var str = (" " + word + " ").toLowerCase().replace(/[^a-zA-Z0-9|!\|@|$|;|¡]/g, "");
    
        str = this.parse(str, true);

        this.allowed_words.forEach(word => {
            str = str.replaceAll(word, "")
        });
    
        var i1 = str.search(/( 94y | cum| 455 )/);

        str = str.replace(/ /g, "");
        var i2 = this.check_banned(str);
        
        str = str.replace(/(.)(?=\1)/g, ""); //remove duplicate chars eg fuuuck -> fuck
        var i3 = this.check_banned(str);
    
        return i1 > -1 || i2 || i3;
    },
};
censor.init();