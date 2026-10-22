//legacyshell: replay signing (services only). services holds an ed25519 key pair and signs what game servers hand it, so anyone can check a replay is a real recording from this deployment
//the private key never leaves services. the public keys (every one that has been used, so old replays still check) are handed out to anyone who asks
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ss } from '#misc';
import accs from '#accountManagement';
//

export const ReplaySigning = {
    keys: null, //{ current, list: [{ keyId, publicKey (raw, base64), privateKey (pkcs8 der, base64, only here), created }] }

    registerListeners: function (plugins) {
        plugins.on('services:unhandledCommand', async ({ msg, ws }) => {
            if (msg.cmd !== 'replaySign' && msg.cmd !== 'replayPublicKeys') return;
            plugins.cancel = true;
            try {
                if (msg.cmd === 'replayPublicKeys') {
                    var keys = this.load();
                    return ws.send(JSON.stringify({ replayPublicKeys: { current: keys.current, keys: keys.list.map(({ keyId, publicKey, created }) => ({ keyId, publicKey, created })) } }));
                };
                //only a game server this deployment knows may have something signed
                var server = msg.auth_key ? await accs.getAuthKeyData(msg.auth_key) : null;
                if (!server) return ws.send(JSON.stringify({ error: 'Invalid auth key' }));
                if (typeof msg.digest !== 'string' || !/^[a-f0-9]{64}$/.test(msg.digest)) return ws.send(JSON.stringify({ error: 'Bad digest' }));
                ws.send(JSON.stringify({ replaySign: this.sign(msg.digest, String(server.name || 'game').slice(0, 64)) }));
            } catch (e) {
                console.log('[legacyreplay] signing failed:', e);
                ws.send(JSON.stringify({ error: 'Internal server error' }));
            };
        });
    },

    file: function () {
        return path.join(path.dirname(ss.dbPath), 'replay_signing.json');
    },

    //read, or made the first time it is needed
    load: function () {
        if (this.keys) return this.keys;
        var file = this.file();
        try {
            this.keys = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (e) {
            this.keys = null;
        };
        if (!this.keys || !this.keys.list?.length) this.keys = this.rotate(null);
        return this.keys;
    },

    //a new key becomes the current one, the old ones stay in the list so what they signed still checks
    rotate: function (existing) {
        var pair = crypto.generateKeyPairSync('ed25519');
        var publicKey = pair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32); //the raw 32 bytes, which is what webcrypto imports
        var keyId = crypto.createHash('sha256').update(publicKey).digest('hex').slice(0, 16);
        var keys = existing || { current: null, list: [] };
        keys.list.push({ keyId, publicKey: publicKey.toString('base64'), privateKey: pair.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'), created: Date.now() });
        keys.current = keyId;
        fs.writeFileSync(this.file(), JSON.stringify(keys, null, 1), { mode: 0o600 });
        this.keys = keys;
        return keys;
    },

    //signs sha-256 (hex) of a file's signed bytes, together with who signed it and when (see ReplayFormat.signedMessage)
    sign: function (digestHex, serverName) {
        var keys = this.load(), key = keys.list.find((k) => k.keyId === keys.current);
        var signature = { keyId: key.keyId, signedAt: Date.now(), serverName };
        var message = Buffer.concat([Buffer.from(digestHex, 'hex'), Buffer.from(key.keyId + '|' + signature.signedAt + '|' + serverName)]);
        var privateKey = crypto.createPrivateKey({ key: Buffer.from(key.privateKey, 'base64'), format: 'der', type: 'pkcs8' });
        signature.signature = crypto.sign(null, message, privateKey).toString('base64');
        return signature;
    },
};
