//legacyshell: basic
import { isClient } from '#constants';
//

// FYI: This file is designed to be imported into the shell JS too. What does this mean? IDK. I cba to explain.

//(server-only-start)
//(server-only-end)

const Comm = {
    /**
     * Class for managing communication output (packing data).
     */
    Out: class {
        /**
         * @param {number} [size] - Fixed buffer size. If not provided, the buffer will dynamically resize.
         * @throws {Error} - Throws an error if buffer overflow occurs when fixed size is set.
         */
        constructor(size) {
            this.fixedSize = size !== undefined;
            this.buffer = this.fixedSize ? new Uint8Array(size) : [];
            this.idx = 0;
        };

        /**
         * Resize buffer if dynamically allocated.
         * @param {number} newSize - The new size for the buffer. Must be greater than the current size.
         */
        _resizeBuffer(newSize) {
            if (!this.fixedSize) {
                const newBuffer = new Uint8Array(newSize);
                newBuffer.set(this.buffer); // Copy existing data into the new buffer
                this.buffer = newBuffer;
            };
        };

        /** 
         * Ensure buffer has enough space for additional bytes.
         * @param {number} neededBytes - Number of additional bytes needed.
         * @throws {Error} - Throws an error if attempting to exceed fixed buffer size.
         */
        _ensureCapacity(neededBytes) {
            const requiredSize = this.idx + neededBytes;
            if (this.fixedSize && requiredSize > this.buffer.length) {
                throw new Error('Buffer overflow: Cannot write beyond fixed size');
            } else if (!this.fixedSize && requiredSize > this.buffer.length) {
                this._resizeBuffer(requiredSize);
            }
        }

        /** 
         * Pack an 8-bit integer (1 byte).
         * @param {number} val - The integer to pack. Range: -128 to 127.
         */
        packInt8(val) {
            this._ensureCapacity(1);
            this.buffer[this.idx] = 255 & val;
            this.idx++;
        }

        /** 
         * Pack an unsigned 8-bit integer (1 byte).
         * @param {number} val - The unsigned integer to pack. Range: 0 to 255.
         */
        packInt8U(val) {
            this.packInt8(val);
        }

        /** 
         * Pack a 16-bit integer (2 bytes).
         * @param {number} val - The integer to pack. Range: -32768 to 32767.
         */
        packInt16(val) {
            this._ensureCapacity(2);
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.idx += 2;
        }

        /** 
         * Pack an unsigned 16-bit integer (2 bytes).
         * @param {number} val - The unsigned integer to pack. Range: 0 to 65535.
         */
        packInt16U(val) {
            this.packInt16(val);
        }

        /** 
         * Pack a 32-bit integer (4 bytes).
         * @param {number} val - The integer to pack. Range: -2147483648 to 2147483647.
         */
        packInt32(val) {
            this._ensureCapacity(4);
            this.buffer[this.idx] = 255 & val;
            this.buffer[this.idx + 1] = val >> 8 & 255;
            this.buffer[this.idx + 2] = val >> 16 & 255;
            this.buffer[this.idx + 3] = val >> 24 & 255;
            this.idx += 4;
        }

        /** 
         * Pack an unsigned 32-bit integer (4 bytes).
         * @param {number} val - The unsigned integer to pack. Range: 0 to 4294967295.
         */
        packInt32U(val) {
            this.packInt32(val);
        }

        /** 
         * Pack a radian (as unsigned, 2 bytes).
         * @param {number} val - The radian to pack. Range: 0 to 6.28319 (0 to 2π).
         */
        packRadU(val) {
            this.packInt16U(1e4 * val);
        }

        /** 
         * Pack a radian (as signed, 2 bytes).
         * @param {number} val - The radian to pack. Range: -3.14159 to 3.14159 (-π to π).
         */
        packRad(val) {
            this.packInt16(1e4 * (val + Math.PI));
        }

        /** 
         * Pack a float (2 bytes).
         * @param {number} val - The float to pack. Range: -Infinity to Infinity.
         */
        packFloat(val) {
            this.packInt16(300 * val);
        }

        /** 
         * Pack a double (4 bytes).
         * @param {number} val - The double to pack. Range: -Infinity to Infinity.
         */
        packDouble(val) {
            this.packInt32(1e6 * val);
        }

        /** 
         * Pack a string (variable length).
         * @param {string} str - The string to pack. Length: up to 255 characters.
         */
        packString(str) {
            if (str.length > 255) {
                throw new Error('String length exceeds 255 characters');
            }
            this.packInt8(str.length);
            for (let i = 0; i < str.length; i++) {
                this.packInt16(str.charCodeAt(i));
            }
        }
    },

    /**
     * Class for managing communication input (unpacking data).
     */
    In: class {
        constructor(buf) {
            this.buffer = new Uint8Array(buf);
            this.idx = 0;
        }

        /** 
         * Check if more data is available.
         * @returns {boolean} - True if more data is available.
         */
        isMoreDataAvailable() {
            return this.idx < this.buffer.length;
        }

        /** 
         * Unpack an unsigned 8-bit integer (1 byte).
         * @returns {number} - The unpacked value. Range: 0 to 255.
         */
        unPackInt8U() {
            return this.buffer[this.idx++];
        }

        /** 
         * Unpack a signed 8-bit integer (1 byte).
         * @returns {number} - The unpacked value. Range: -128 to 127.
         */
        unPackInt8() {
            return (this.unPackInt8U() + 128) % 256 - 128;
        }

        /** 
         * Unpack an unsigned 16-bit integer (2 bytes).
         * @returns {number} - The unpacked value. Range: 0 to 65535.
         */
        unPackInt16U() {
            const i = this.idx;
            this.idx += 2;
            return this.buffer[i] + (this.buffer[i + 1] << 8);
        }

        /** 
         * Unpack a signed 16-bit integer (2 bytes).
         * @returns {number} - The unpacked value. Range: -32768 to 32767.
         */
        unPackInt16() {
            return (this.unPackInt16U() + 32768) % 65536 - 32768;
        }

        /** 
         * Unpack an unsigned 32-bit integer (4 bytes).
         * @returns {number} - The unpacked value. Range: 0 to 4294967295.
         */
        unPackInt32U() {
            const i = this.idx;
            this.idx += 4;
            return this.buffer[i] + (this.buffer[i + 1] << 8) + (this.buffer[i + 2] << 16) + (this.buffer[i + 3] << 24);
        }

        /** 
         * Unpack a signed 32-bit integer (4 bytes).
         * @returns {number} - The unpacked value. Range: -2147483648 to 2147483647.
         */
        unPackInt32() {
            return (this.unPackInt32U() + 2147483648) % 4294967296 - 2147483648;
        }

        /** 
         * Unpack a radian (unsigned, 2 bytes).
         * @returns {number} - The unpacked value in radians. Range: 0 to 6.28319 (0 to 2π).
         */
        unPackRadU() {
            return this.unPackInt16U() / 1e4;
        }

        /** 
         * Unpack a radian (signed, 2 bytes).
         * @returns {number} - The unpacked value in radians. Range: -3.14159 to 3.14159 (-π to π).
         */
        unPackRad() {
            return this.unPackRadU() - Math.PI;
        }

        /** 
         * Unpack a float (2 bytes).
         * @returns {number} - The unpacked float. Range: -Infinity to Infinity.
         */
        unPackFloat() {
            return this.unPackInt16() / 300;
        }

        /** 
         * Unpack a double (4 bytes).
         * @returns {number} - The unpacked double. Range: -Infinity to Infinity.
         */
        unPackDouble() {
            return this.unPackInt32() / 1e6;
        }

        /** 
         * Unpack a string (variable length).
         * @param {number} [maxLen=1000] - The maximum length of the string.
         * @returns {string} - The unpacked string.
         */
        unPackString(maxLen = 1000) {
            let str = '';
            const len = Math.min(this.unPackInt8U(), maxLen);
            for (let i = 0; i < len; i++) {
                const c = this.unPackInt16U();
                if (c > 0) str += String.fromCharCode(c);
            }
            return str;
        }
    },

    /**
     * Close codes for communication errors or states.
     * @enum {number}
     */ 
    Close: {
        gameNotFound: 4000,
        gameFull: 4001,
        badName: 4002,
        mainMenu: 4003,
        masterServerBusy: 4004,
        masterServerOffline: 4005
    },

    /**
     * Communication codes for game actions and events.
     * @enum {number}
     */
    Code: {
        /** #SERVER: in response to one of the three join/create types
        * @constant {number}
        */
        gameJoined: 0,

        /** #SERVER: sends all the details of a player
        * @constant {number}
        */
        addPlayer: 1,

        /** #SERVER: delete a player
        * @constant {number}
        */
        removePlayer: 2,

        /** #CLIENT: sends the player's chat
        * 
        * #SERVER: distributes the chat, assuming it completed all checks
        * @constant {number}
        */
        chat: 3,

        /** -???: no known functionality 
        * @constant {number}
        */
        controlKeys: 4,

        /** -???: no known functionality 
        * @constant {number}
        */
        keyUp: 5,

        /** #CLIENT: sends stateIdx, shotsQueued, FramesBetweenSyncs lots of statebuffer (yaw, pitch, controlKeys)
        * 
        * #SERVER: directly sets stateIdx, xyz, climbing, and other stuff i dont understand yet
        * @constant {number}
        */
        sync: 6,

        /** NOTE: this is depracated in LegacyShell, this information is instead sent in controlKeys in sync
        * 
        * -CLIENT: attempt to make me player jump
        * 
        * -SERVER: attempt to make another player jump
        * @constant {number}
        */
        jump: 7,

        /** #SERVER: tells the clients that someone died
        * @constant {number}
        */
        die: 8,

        /** #SERVER: tells the players who didnt get hit that it happened. idk why they need two functions.
        * @constant {number}
        */
        hitThem: 9,

        /** #SERVER: tells the player who got hit that it happened. idk why they need two functions.
        * @constant {number}
        */
        hitMe: 10,

        /** SERVER: tells the client they picked up an item
        * @constant {number}
        */
        collectItem: 11,

        /** SERVER: tells the client there's a new item (usually right after one has been collected)
        * @constant {number}
        */
        spawnItem: 12,

        /** #SERVER: informs that ANY player has respawned
        * @constant {number}
        */
        respawn: 13,

        /** #CLIENT: attempt to swap weapons
        * 
        * #SERVER: informs that someone's weapon has changed
        * @constant {number}
        */
        swapWeapon: 14,

        /** #CLIENT: request for a game search
        * @constant {number}
        */
        joinGame: 15,

        /** #CLIENT: used for both getting ping on home screen and also ensuring connection to the server during a game. 
        * 
        * #SERVER: returned message to calc client ping
        * 
        * @constant {number}
        */
        ping: 16,

        /** -SERVER: you cant actually return this. the game does not recognise this and its useless.
        * @constant {number}
        */
        pong: 17,

        /** #SERVER: sent after all players have been initially added.
        * 
        * if wanted, it also can send the time and stuff for the unused rounds feature. 
        * @constant {number}
        */
        clientReady: 18,

        /** #CLIENT: try to respawn. if rejected for some reason ur screwed (i think)
        * @constant {number}
        */
        requestRespawn: 19,

        /** #CLIENT: sends a signal that a grenade was thrown, and its power
        * 
        * #SERVER: reports that a player threw a grenade and its power, dir, etc
        * @constant {number}
        */
        throwGrenade: 20,

        joinPublicGame: 21,

        /** #CLIENT: identify specific room and join it 
        * @constant {number}
        */
        joinPrivateGame: 22,

        /** #CLIENT: create a room 
        * @constant {number}
        */
        createPrivateGame: 23,

        /** SERVER: for the unused rounds feature. 
        * @constant {number}
        */
        roundStart: 24,

        switchTeam: 25,

        /** SERVER: display a notification on the person's game for any reason. 
        * @constant {number}
        */
        notification: 26,

        /** CLIENT: attempt to change skins and stuff
        * 
        * SERVER: informs that someone's skins and stuff has changed
        * @constant {number}
        */
        changeCharacter: 27,

        /** SERVER: unused/unknown
        * @constant {number}
        */
        playerCount: 28,

        /** SERVER: for the unused rounds feature. 
        * @constant {number}
        */
        roundEnd: 29,

        pause: 30,
        
        /** SERVER: no logic associated with this. 
        * @constant {number}
        */
        announcement: 31,

        updateBalance: 32,

        reload: 33,

        refreshGameState: 34,

        switchTeamFail: 35,

        expireUpgrade: 36,

        /** CLIENT: send a req to boot someone (requires gameOwner) 
        * @constant {number}
        */
        bootPlayer: 37,

        /** SERVER: unused/unknown
        * @constant {number}
        */
        loginRequired: 38,

        /** SERVER: have been booted from a game. 
        * @constant {number}
        */
        banned: 39,

        /** SERVER: room has been locked from the public. doesnt seem to have kicked them. 
        * @constant {number}
        */
        gameLocked: 40,

        startReload: 48,

        fire: 49,

        /** CLIENT: used by bwd admins to look at ips and stuff (scary). 
        * @constant {number}
        */
        info: 255
    },

    /** 
     * Convert a code to its corresponding name.
     * @param {number} code - The code to convert.
     * @returns {string} - The corresponding name, or 'unknownCode' if not found.
     */
    Convert: function(code) {
        const commCodeEntries = Object.entries(Comm.Code);
        const foundEntry = commCodeEntries.find(([key, value]) => value === code);
        return foundEntry ? foundEntry[0] : 'unknownCode';
    },
}

export default Comm;