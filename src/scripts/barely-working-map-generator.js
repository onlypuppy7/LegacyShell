Math.randomInt = function (low, high) {
    return Math.floor(Math.random() * (high - low) + low)
};
Math.seededRandom = function (min, max) {
    return min = min || 0, max = max || 1, Math.seed = (9301 * Math.seed + 49297) % 233280, min + Math.seed / 233280 * (max - min)
};
Math.seededRandomInt = function (min, max) {
    return Math.floor(Math.seededRandom(min, max))
};

let x, h, c, z, u, o, p;

MAP = {
    blank: 0,
    ground: 1,
    block: 2,
    column: 3,
    halfBlock: 4,
    ramp: 5,
    ladder: 6,
    tank: 7,
    lowWall: 8,
    todo3: 9
};

GameMap = {
    makeMinMap: function (i) {
        i.min = {}, i.min.width = i.width, i.min.depth = i.depth, i.min.height = i.height, i.min.data = {};
        for (var r = 0; r < i.width; r++)
            for (var e = 0; e < i.height; e++)
                for (var d = 0; d < i.depth; d++) {
                    var t = i.data[r][e][d];
                    t.cat && (i.min.data[t.cat] || (i.min.data[t.cat] = {}), i.min.data[t.cat][t.dec] || (i.min.data[t.cat][t.dec] = []), i.min.data[t.cat][t.dec].push({
                        x: r,
                        y: e,
                        z: d,
                        dir: t.dir
                    }))
                }
    },
    generateMap: function (i, r, e, d) {
        Math.seed = d;
        var t = {};
        t.width = i;
        t.depth = r;
        t.height = e;
        t.seed = d;
        t.data = Array(t.width);

        for (x = 0; x < t.width; x++) {
            t.data[x] = Array(t.height);
            for (h = 0; h < t.height; h++) t.data[x][h] = Array(t.depth).fill({})
        }

        c = 0;

        console.log(c, t.width * t.depth * t.height * .2);


        for (c; c < t.width * t.depth * t.height * .2;) {
            console.log(1, c);

            var y = Math.seededRandomInt(4, 8);
            var n = Math.seededRandomInt(4, 8);
            var a = Math.seededRandomInt(2, c % t.height);
            var x = Math.seededRandomInt(1, t.width - 1 - y);
            var z = Math.seededRandomInt(1, t.depth - 1 - n);
            var o = (Math.seededRandomInt(1, 4), x);

            // console.log(2);
            // console.log(2, o, x + y);

            for (o; o < x + y; o++)
                for (p = z; p < z + n; p++)
                    for (var s = 0; s < a; s++) {
                        var l = o == x || p == z || o == x + y - 1 || p == z + n - 1;
                        // console.log(o,s,p);
                        t.data[o][s][p].cat || c++;
                        // console.log(3, t.data[o][s][p].cat);
                        t.data[o][s][p] = l ? {
                            cat: 1,
                            dec: 4,
                            dir: Math.seededRandomInt(0, 4)
                        } : s % 2 == 0 ? {
                            cat: 1,
                            dec: 0,
                            dir: Math.seededRandomInt(0, 4)
                        } : {
                            cat: 1,
                            dec: 4,
                            dir: Math.seededRandomInt(0, 4)
                        };
                    };
        };

        console.log("beat first loop")

        for (x = 0; x < t.width; x++)
            for (h = 0; h < t.height; h++)
                for (z = 0; z < t.depth; z++) 0 == t.data[x][h][z].dec && (t.data[x][h][z] = {});
        console.log("beat 2nd loop")
        for (u = 0; u < t.width * t.depth * t.height / 2; u++) {
            var x = Math.seededRandomInt(0, t.width),
                h = 2 * Math.seededRandomInt(0, Math.floor(t.height / 2)),
                z = Math.seededRandomInt(0, t.depth);
            1 == t.data[x][h][z].cat && t.data[x][h][z].dec > 0 && 4 == GameMap.numNeighbors6(t, x, h, z) && (t.data[x][h][z] = {})
        }
        console.log("beat 3rd loop")
        for (var c = 0; c < t.width * t.depth * t.height / 60;) {
            var x = Math.seededRandomInt(1, t.width - 1);
            var h = Math.seededRandomInt(0, t.height - 1);
            var z = Math.seededRandomInt(1, t.depth - 1);

            // console.log("4th", c, t.width * t.depth * t.height / 60, x, h, z);
                
            if (!(t.data[x][h][z].cat || 0 != h && 1 != t.data[x][h - 1][z].cat)) {
                if (1 != t.data[x][h][z + 1].cat || t.data[x][h + 1][z + 1].cat || t.data[x][h][z - 1].cat || 0 != h && 1 != t.data[x][h - 1][z - 1].cat) {
                    if (1 != t.data[x + 1][h][z].cat || t.data[x + 1][h + 1][z].cat || t.data[x - 1][h][z].cat || 0 != h && 1 != t.data[x - 1][h - 1][z].cat) {
                        if (1 != t.data[x][h][z - 1].cat || t.data[x][h + 1][z - 1].cat || t.data[x][h][z + 1].cat || 0 != h && 1 != t.data[x][h - 1][z + 1].cat) {
                            1 != t.data[x - 1][h][z].cat || t.data[x - 1][h + 1][z].cat || t.data[x + 1][h][z].cat || 0 != h && 1 != t.data[x + 1][h - 1][z].cat || (t.data[x][h][z] = {
                                cat: 2,
                                dec: 0,
                                dir: 3
                            }, t.data[x][h + 1][z] = {}, t.data[x + 1][h + 1][z] = {}, c++);
                        } else {
                            t.data[x][h][z] = {
                                cat: 2,
                                dec: 0,
                                dir: 2
                            }, t.data[x][h + 1][z] = {}, t.data[x][h + 1][z + 1] = {}, c++
                        };
                    } else {
                        t.data[x][h][z] = {
                            cat: 2,
                            dec: 0,
                            dir: 1
                        }, t.data[x][h + 1][z] = {}, t.data[x - 1][h + 1][z] = {}, c++;
                    };
                } else {
                    t.data[x][h][z] = {
                        cat: 2,
                        dec: 0,
                        dir: 0
                    };
                    t.data[x][h + 1][z] = {};
                    t.data[x][h + 1][z - 1] = {};
                    c++;
                };
            };
        };
        console.log("beat 4th loop")
        for (u = 0; u < t.width * t.depth * t.height / 10; u++) {
            var x = Math.seededRandomInt(1, t.width - 1),
                h = Math.seededRandomInt(0, t.height - 1),
                z = Math.seededRandomInt(1, t.depth - 1);
            !t.data[x][h][z].cat && (0 == h || 1 == t.data[x][h - 1][z].cat) && GameMap.numNeighbors26(t, x, h, z) < 11 && (t.data[x][h][z] = {
                cat: 4,
                dec: 0,
                dir: 0
            })
        }
        console.log("beat 5th loop")
        for (var u = 0; u < t.width * t.depth * t.height / 10; u++) {
            var x = Math.seededRandomInt(1, t.width - 1),
                h = Math.seededRandomInt(0, t.height - 1),
                z = Math.seededRandomInt(1, t.depth - 1);
            if (!t.data[x][h][z].cat && (0 == h || 1 == t.data[x][h - 1][z].cat && 4 == t.data[x][h - 1][z].dec) && GameMap.numNeighbors26(t, x, h, z) < 11) {
                t.data[x][h][z] = {
                    cat: 1,
                    dec: Math.seededRandomInt(1, 4),
                    dir: Math.seededRandomInt(0, 4)
                };
                for (var m = 0; m < 20; m++) {
                    var o = x + Math.seededRandomInt(-1, 2),
                        p = z + Math.seededRandomInt(-1, 2);
                    if (4 == t.data[p][h][p].cat) break;
                    if (!t.data[p][h][p].cat && (0 == h || 1 == t.data[o][h - 1][p].cat && 4 == t.data[o][h - 1][p].dec)) {
                        t.data[o][h][p] = {
                            cat: 4,
                            dec: 0,
                            dir: 0
                        };
                        break
                    }
                }
            }
        }
        console.log("beat 6th loop")
        for (x = 0; x < t.width; x++)
            for (z = 0; z < t.depth; z++)
                for (h = 0; h < t.height - 1; h++) !t.data[x][h][z].cat && this.numNeighbors6(t, x, h, z) >= 4 && !t.data[x][h + 1][z].cat && (t.data[x][h][z] = {
                    cat: 1,
                    dec: this.firstNeighborDec(t, x, h, z),
                    dir: Math.seededRandomInt(0, 4)
                });
        console.log("beat 7th loop")
        for (x = 0; x < t.width; x++)
            for (h = 0; h < t.height; h++)
                for (z = 0; z < t.depth; z++) t.data[x][h][z].cat && 6 == GameMap.numNeighbors6(t, x, h, z) && (t.data[x][h][z].cat = 1, t.data[x][h][z].dec = 0);
        console.log("beat 8th loop")
        return GameMap.makeMinMap(t), t
    },
    firstNeighborDec: function (i, r, e, d) {
        for (var t = Math.max(1, r - 1); t <= Math.min(i.width - 2, r + 1); t++)
            for (var y = Math.max(0, e - 1); y <= Math.min(i.height - 1, e + 1); y++)
                for (var n = Math.max(1, d - 1); n <= Math.min(i.depth - 2, d + 1); n++)
                    if ((r != t || e != y || d != n) && 1 == i.data[t][y][n].cat) return i.data[t][y][n].dec;
        return 0
    },
    numNeighbors6: function (i, r, e, d) {
        for (var t = 0, y = Math.max(1, r - 1); y <= Math.min(i.width - 2, r + 1); y++)
            for (var n = Math.max(0, e - 1); n <= Math.min(i.height - 1, e + 1); n++)
                for (var a = Math.max(1, d - 1); a <= Math.min(i.depth - 2, d + 1); a++) Math.abs(y - r) + Math.abs(n - e) + Math.abs(a - d) == 1 && 1 == i.data[y][n][a].cat && t++;
        return 0 == e && t++, t
    },
    numNeighbors26: function (i, r, e, d) {
        for (var t = 0, y = Math.max(1, r - 1); y <= Math.min(i.width - 2, r + 1); y++)
            for (var n = Math.max(0, e - 1); n <= Math.min(i.height - 1, e + 1); n++)
                for (var a = Math.max(1, d - 1); a <= Math.min(i.depth - 2, d + 1); a++) r == y && e == n && d == a || 1 == i.data[y][n][a].cat && t++;
        return 0 == e && (t += 9), t
    }
};