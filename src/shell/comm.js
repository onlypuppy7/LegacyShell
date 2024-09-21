/**
 * A class for packing and unpacking data in a binary format.
 */
export class Comm {
    /**
     * Creates a new Comm instance with a specified buffer size.
     * @param {number} size - The size of the buffer in bytes.
     * @returns {Comm} The instance of the Comm class.
     */
    static output(size) {
        const instance = new Comm();
        instance.buffer = new Uint8Array(size);
        instance.idx = 0;

        /**
         * Packs an unsigned 8-bit integer into the buffer.
         * @param {number} val - The 8-bit unsigned integer value to pack.
         * Size: 1 byte.
         */
        instance.packInt8U = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.idx++;
        };

        /**
         * Packs a signed 8-bit integer into the buffer.
         * @param {number} val - The 8-bit integer value to pack.
         * Size: 1 byte.
         */
        instance.packInt8 = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.idx++;
        };

        /**
         * Packs an unsigned 16-bit integer into the buffer.
         * @param {number} val - The 16-bit unsigned integer value to pack.
         * Size: 2 bytes.
         */
        instance.packInt16U = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.idx += 2;
        };

        /**
         * Packs a signed 16-bit integer into the buffer.
         * @param {number} val - The 16-bit integer value to pack.
         * Size: 2 bytes.
         */
        instance.packInt16 = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.idx += 2;
        };

        /**
         * Packs an unsigned 32-bit integer into the buffer.
         * @param {number} val - The 32-bit unsigned integer value to pack.
         * Size: 4 bytes.
         */
        instance.packInt32U = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.buffer[this.idx + 2] = val >> 16 & 255;
            this.buffer[this.idx + 3] = val >> 24 & 255;
            this.idx += 4;
        };

        /**
         * Packs a signed 32-bit integer into the buffer.
         * @param {number} val - The 32-bit integer value to pack.
         * Size: 4 bytes.
         */
        instance.packInt32 = function (val) {
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.buffer[this.idx + 2] = val >> 16 & 255;
            this.buffer[this.idx + 3] = val >> 24 & 255;
            this.idx += 4;
        };

        /**
         * Packs a radial value (unsigned) into the buffer.
         * @param {number} val - The radial value to pack.
         * Size: 2 bytes (as a 16-bit integer).
         */
        instance.packRadU = function (val) {
            this.packInt16(1e4 * val);
        };

        /**
         * Packs a radial value into the buffer.
         * @param {number} val - The radial value to pack.
         * Size: 2 bytes (as a 16-bit integer).
         */
        instance.packRad = function (val) {
            this.packInt16(1e4 * (val + Math.PI));
        };

        /**
         * Packs a float value into the buffer.
         * @param {number} val - The float value to pack.
         * Size: 2 bytes (as a 16-bit integer).
         */
        instance.packFloat = function (val) {
            this.packInt16(300 * val);
        };

        /**
         * Packs a double value into the buffer.
         * @param {number} val - The double value to pack.
         * Size: 4 bytes (as a 32-bit integer).
         */
        instance.packDouble = function (val) {
            this.packInt32(1e6 * val);
        };

        /**
         * Packs a string into the buffer.
         * @param {string} str - The string to pack.
         * Size: 1 byte for length + 2 bytes per character (16-bit).
         */
        instance.packString = function (str) {
            this.packInt8(str.length);
            for (let i = 0; i < str.length; i++) {
                this.packInt16(str.charCodeAt(i));
            }
        };

        return instance;
    }

    /**
     * Creates a new Comm instance from a provided buffer.
     * @param {Uint8Array} buf - The buffer to read from.
     * @returns {Comm} The instance of the Comm class.
     */
    static input(buf) {
        const instance = new Comm();
        instance.buffer = new Uint8Array(buf);
        instance.idx = 0;

        /**
         * Checks if more data is available to read from the buffer.
         * @returns {number} The number of bytes remaining.
         */
        instance.isMoreDataAvailable = function () {
            return Math.max(0, this.buffer.length - this.idx);
        };

        /**
         * Unpacks an unsigned 8-bit integer from the buffer.
         * @returns {number} The unpacked 8-bit unsigned integer.
         * Size: 1 byte.
         */
        instance.unPackInt8U = function () {
            const i = this.idx;
            this.idx++;
            return this.buffer[i];
        };

        /**
         * Unpacks a signed 8-bit integer from the buffer.
         * @returns {number} The unpacked 8-bit signed integer.
         * Size: 1 byte.
         */
        instance.unPackInt8 = function () {
            return (this.unPackInt8U() + 128) % 256 - 128;
        };

        /**
         * Unpacks an unsigned 16-bit integer from the buffer.
         * @returns {number} The unpacked 16-bit unsigned integer.
         * Size: 2 bytes.
         */
        instance.unPackInt16U = function () {
            const i = this.idx;
            this.idx += 2;
            return this.buffer[i] + (this.buffer[i + 1] << 8);
        };

        /**
         * Unpacks a signed 16-bit integer from the buffer.
         * @returns {number} The unpacked 16-bit signed integer.
         * Size: 2 bytes.
         */
        instance.unPackInt16 = function () {
            return (this.unPackInt16U() + 32768) % 65536 - 32768;
        };

        /**
         * Unpacks an unsigned 32-bit integer from the buffer.
         * @returns {number} The unpacked 32-bit unsigned integer.
         * Size: 4 bytes.
         */
        instance.unPackInt32U = function () {
            const i = this.idx;
            this.idx += 4;
            return this.buffer[i] + 256 * this.buffer[i + 1] + 65536 * this.buffer[i + 2] + 16777216 * this.buffer[i + 3];
        };

        /**
         * Unpacks a signed 32-bit integer from the buffer.
         * @returns {number} The unpacked 32-bit signed integer.
         * Size: 4 bytes.
         */
        instance.unPackInt32 = function () {
            return (this.unPackInt32U() + 2147483648) % 4294967296 - 2147483648;
        };

        /**
         * Unpacks an unsigned radial value from the buffer.
         * @returns {number} The unpacked radial value.
         * Size: 2 bytes (as a 16-bit integer).
         */
        instance.unPackRadU = function () {
            return this.unPackInt16U() / 1e4;
        };

        /**
         * Unpacks a radial value from the buffer.
         * @returns {number} The unpacked radial value.
         * Size: 2 bytes (as a 16-bit integer).
         */
        instance.unPackRad = function () {
            return this.unPackRadU() - Math.PI;
        };

        /**
         * Unpacks a float value from the buffer.
         * @returns {number} The unpacked float value.
         * Size: 2 bytes (as a 16-bit integer).
         */
        instance.unPackFloat = function () {
            return this.unPackInt16() / 300;
        };

        /**
         * Unpacks a double value from the buffer.
         * @returns {number} The unpacked double value.
         * Size: 4 bytes (as a 32-bit integer).
         */
        instance.unPackDouble = function () {
            return this.unPackInt32() / 1e6;
        };

        /**
         * Unpacks a string from the buffer.
         * @param {number} [maxLen=1000] - The maximum length of the string.
         * @returns {string} The unpacked string.
         * Size: 1 byte for length + 2 bytes per character (16-bit).
         */
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

    /**
     * Converts a code to its corresponding name.
     * @param {number} code - The code to convert.
     * @returns {string} The name of the code or 'unknownCode' if not found.
     */
    static convertCode(code) {
        const commCodeEntries = Object.entries(CommCode);
        const foundEntry = commCodeEntries.find(([key, value]) => value === code);
        return foundEntry ? foundEntry[0] : 'unknownCode';
    }
}

export class DynamicComm {
    static output(size) {
        const instance = new Comm();
        instance.buffer = new Uint8Array(size);
        instance.idx = 0;

        instance.ensureBufferSize = function (additionalSize) {
            if (this.idx + additionalSize > this.buffer.length) {
                const newSize = Math.max(this.buffer.length * 2, this.idx + additionalSize);
                const newBuffer = new Uint8Array(newSize);
                newBuffer.set(this.buffer);
                this.buffer = newBuffer;
            }
        };

        instance.packInt8 = function (val) {
            this.ensureBufferSize(1); // space for 1 byte
            this.buffer[this.idx] = 255 & val;
            this.idx++;
        };

        instance.packInt16 = function (val) {
            this.ensureBufferSize(2); // space for 2 bytes
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.idx += 2;
        };

        instance.packInt32 = function (val) {
            this.ensureBufferSize(4); // space for 4 bytes
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