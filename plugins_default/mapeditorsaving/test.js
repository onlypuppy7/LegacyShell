//run with node from the repo root: node plugins_default/mapeditorsaving/test.js
import assert from 'node:assert';
import Database from 'better-sqlite3';
import misc, { ss } from '#misc';
import { Plugin } from './index.js';

misc.instantiateSS(import.meta, [], true, true);
ss.db = new Database(':memory:');
ss.db.exec(`CREATE TABLE users (account_id INTEGER PRIMARY KEY, username TEXT, authToken TEXT, adminRoles INTEGER DEFAULT 0)`);
ss.db.exec(`CREATE TABLE maps (name TEXT, sun TEXT, fog TEXT, data TEXT, palette TEXT, render TEXT, extents TEXT, modes TEXT, width INT, height INT, depth INT, numPlayers INT, availability TEXT, dateCreated INT, dateModified INT)`);
ss.db.prepare(`INSERT INTO maps VALUES ('Pub','{}','{}','{"a":[]}','[]','{}','{"x":{"max":0,"min":10000}}','{}',20,2,6,18,'both',0,0), ('Priv','{}','{}','{}','[]','{}','{}','{}',1,2,3,18,'private',0,0)`).run();
ss.db.exec(`INSERT INTO users VALUES (1, 'a', 'tokena', 0), (2, 'b', 'tokenb', 10)`);

const plugin = new Plugin({ type: 'services', on() {}, cancel: false }, '.');
plugin.initTables();
const run = async (msg) => { let out; await plugin.unhandledCommand({ msg, ws: { send: s => out = JSON.parse(s).mapeditorsaving }, ip: '' }); return out; };

assert.deepEqual((await run({ cmd: 'mapeditorsavingPublicList' })).maps.map(m => m.name), ['Pub']);
assert.equal((await run({ cmd: 'mapeditorsavingPublicGet', name: 'Pub' })).map.data.a.length, 0);
const filled = (await run({ cmd: 'mapeditorsavingPublicGet', name: 'Pub' })).map.extents;
assert.deepEqual([filled.x.min, filled.z.min, filled.width], [15, 22, 20], 'placeholder extents get centred');
assert.ok((await run({ cmd: 'mapeditorsavingPublicGet', name: 'Priv' })).error);
assert.ok((await run({ cmd: 'mapeditorsavingList', username: 'a', authToken: 'wrong' })).error);
assert.ok((await run({ cmd: 'mapeditorsavingList', username: 'a', authToken: '' })).error);
assert.ok((await run({ cmd: 'mapeditorsavingList' })).error);
const map = JSON.stringify({ data: {}, pad: 'x'.repeat(6 * 1024 * 1024) });
assert.equal((await run({ cmd: 'mapeditorsavingSave', username: 'a', authToken: 'tokena', name: 'one', data: map })).saves.length, 1);
assert.ok((await run({ cmd: 'mapeditorsavingSave', username: 'a', authToken: 'tokena', name: 'two', data: map })).error, 'user quota');
assert.equal((await run({ cmd: 'mapeditorsavingSave', username: 'a', authToken: 'tokena', name: 'one', data: map })).saves.length, 1, 'overwrite fits');
assert.equal((await run({ cmd: 'mapeditorsavingSave', username: 'b', authToken: 'tokenb', name: 'two', data: map })).quota, 1024 ** 3);
assert.equal((await run({ cmd: 'mapeditorsavingGet', username: 'a', authToken: 'tokena', name: 'one' })).data, map);
assert.ok((await run({ cmd: 'mapeditorsavingGet', username: 'b', authToken: 'tokenb', name: 'one' })).error, 'isolated per account');
assert.equal((await run({ cmd: 'mapeditorsavingDelete', username: 'a', authToken: 'tokena', name: 'one' })).saves.length, 0);
console.log('mapeditorsaving: all good');
process.exit(0);
