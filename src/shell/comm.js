export class Comm {
    static output(size) {
        const instance = new Comm();
        instance.buffer = new Uint8Array(size);
        instance.idx = 0;
        instance.packInt8 = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.idx++;
        };
        instance.packInt16 = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.idx += 2;
        };
        instance.packInt32 = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.buffer[this.idx + 2] = val >> 16 & 255;
            this.buffer[this.idx + 3] = val >> 24 & 255;
            this.idx += 4;
        };
        instance.packRadU = function (val) {
            this.packInt16(1e4 * val);
        };
        instance.packRad = function (val) {
            this.packInt16(1e4 * (val + Math.PI));
        };
        instance.packFloat = function (val) {
            this.packInt16(300 * val);
        };
        instance.packDouble = function (val) {
            this.packInt32(1e6 * val);
        };
        instance.packString = function (str) {
            this.packInt8(str.length);
            for (let i = 0; i < str.length; i++) {
                this.packInt16(str.charCodeAt(i));
            }
        };
        return instance;
    }

    static input(buf) {
        const instance = new Comm();
        instance.buffer = new Uint8Array(buf);
        instance.idx = 0;
        instance.isMoreDataAvailable = function () {
            return Math.max(0, this.buffer.length - this.idx);
        };
        instance.unPackInt8U = function () {
            const i = this.idx;
            this.idx++;
            return this.buffer[i];
        };
        instance.unPackInt8 = function () {
            return (this.unPackInt8U() + 128) % 256 - 128;
        };
        instance.unPackInt16U = function () {
            const i = this.idx;
            this.idx += 2;
            return this.buffer[i] + (this.buffer[i + 1] << 8);
        };
        instance.unPackInt32U = function () {
            const i = this.idx;
            this.idx += 4;
            return this.buffer[i] + 256 * this.buffer[i + 1] + 65536 * this.buffer[i + 2] + 16777216 * this.buffer[i + 3];
        };
        instance.unPackInt16 = function () {
            return (this.unPackInt16U() + 32768) % 65536 - 32768;
        };
        instance.unPackInt32 = function () {
            return (this.unPackInt32U() + 2147483648) % 4294967296 - 2147483648;
        };
        instance.unPackRadU = function () {
            return this.unPackInt16U() / 1e4;
        };
        instance.unPackRad = function () {
            return this.unPackRadU() - Math.PI;
        };
        instance.unPackFloat = function () {
            return this.unPackInt16() / 300;
        };
        instance.unPackDouble = function () {
            return this.unPackInt32() / 1e6;
        };
        instance.unPackString = function (maxLen) {
            maxLen = maxLen || 1000;
            let str = '';
            const len = Math.min(this.unPackInt8U(), maxLen);
            for (let i = 0; i < len; i++) {
                const c = this.unPackInt16U();
                if (c > 0) {
                    str += String.fromCharCode(c);
                }
            }
            return str;
        };
        return instance;
    }

    static convertCode(code) {
        const commCodeEntries = Object.entries(CommCode);
        const foundEntry = commCodeEntries.find(([key, value]) => value === code);
        return foundEntry ? foundEntry[0] : 'unknownCode';
    }
}

export const CloseCode = {
    gameNotFound: 4000,
    gameFull: 4001,
    badName: 4002,
    mainMenu: 4003,
    masterServerBusy: 4004,
    masterServerOffline: 4005
};

export const CommCode = {
    gameJoined: 0,
    addPlayer: 1,
    removePlayer: 2,
    chat: 3,
    controlKeys: 4,
    keyUp: 5,
    sync: 6,
    jump: 7,
    die: 8,
    hitThem: 9,
    hitMe: 10,
    collectItem: 11,
    spawnItem: 12,
    respawn: 13,
    swapWeapon: 14,
    joinGame: 15,
    ping: 16,
    pong: 17,
    clientReady: 18,
    requestRespawn: 19,
    throwGrenade: 20,
    joinPublicGame: 21,
    joinPrivateGame: 22,
    createPrivateGame: 23,
    roundStart: 24,
    switchTeam: 25,
    notification: 26,
    changeCharacter: 27,
    playerCount: 28,
    roundEnd: 29,
    pause: 30,
    announcement: 31,
    updateBalance: 32,
    reload: 33,
    refreshGameState: 34,
    switchTeamFail: 35,
    expireUpgrade: 36,
    bootPlayer: 37,
    loginRequired: 38,
    banned: 39,
    gameLocked: 40,
    startReload: 48,
    fire: 49,
    info: 255
};