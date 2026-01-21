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
        "kneegro",
        "卐",
        "卍",
        "kike",
        "killblacks",
        "murderblacks",
        "hitler",
        "heil",
        "reich",
        "adolf",
        "fag",
        "rapewom",
        "rapegir",
        "spic",
        "chink",
        "nigga",
        "nigge",
        "nibbe",
        "nigga",
        "nibba",
    ],
    eighteen_words: [
        "african",
        "schoolshoot",
        "terrorist",
        "queer",
        "dick",
        "wank",
        "piss",
        "testic",
        "testes",
        "balls",
        "nuts",
        "nutz",
        "nazi",
        "jew",
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
        "butthole",
        "anal",
        "anus",
        "wetback",
        "agina",
        "gay",
        "asshole",
        "suck",
        "jew",
        "shit",
        "bitch",
        "fuck",
        "cunt",
        "kkk",
        "whore",
        "twat",
        "peni",
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
        "her",
        "suspic"
    ],
    init: function () {
        this.banned_words = this.banned_words.map(word => this.parse(word));
        this.eighteen_words = this.eighteen_words.map(word => this.parse(word));
        this.allowed_words = this.allowed_words.map(word => this.parse(word));
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
    check_banned: function (str, allow18) {
        let result = false;
        this.banned_words.forEach(word => {
            if (str.includes(word)) result = true;
        });
        if (!allow18) {
            this.eighteen_words.forEach(word => {
                if (str.includes(word)) result = true;
            });
        };
        return result;
    },
    detect: function (word, allow18) {
        var str = (" " + word + " ").toLowerCase().replace(/[^a-zA-Z0-9|!\|@|$|;|¡]/g, "");
    
        str = this.parse(str, true);

        this.allowed_words.forEach(word => {
            str = str.replaceAll(word, "")
        });
    
        var i1 = str.search(/( 94y | cum| 455 )/);

        str = str.replace(/ /g, "");
        var i2 = this.check_banned(str, allow18);
        
        str = str.replace(/(.)(?=\1)/g, ""); //remove duplicate chars eg fuuuck -> fuck
        var i3 = this.check_banned(str, allow18);
    
        return i1 > -1 || i2 || i3;
    },
};
censor.init();