import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AchievementGame } from './game.js';

test('zombies challenge requires 50 scored kills on Blue, no primary shots, a full round and no cheats', async () => {
    const events = {}, reports = [], players = [];
    class Player {
        constructor(room, username) {
            this.id = username;
            this.room = room; this.gameOptions = room.gameOptions;
            this.client = { isHuman: true, loggedIn: true, username };
            this.weaponIdx = 0; this.weapon = { ammo: { rounds: 10 } };
            players.push(this);
        };
        fire() { if (!this.blocked && this.weapon.ammo.rounds) this.weapon.ammo.rounds--; return 'fired'; };
    };
    new AchievementGame({ on: (event, listener) => events[event] = listener }, name => reports.push(name), Player, callback => players.forEach(callback));
    const room = { minMap: { name: 'Blue' }, gameOptions: { cheatsEnabled: false } }, otherRoom = { gameOptions: {} };
    const kills = (player, count = 50) => { for (let i = 0; i < count; i++) events['game:scoreKillEggs']({ this: player, killedPlayer: { id: 'zombie' } }); };
    const sidearm = new Player(room, 'sidearm'), primary = new Player(room, 'primary');
    const dryFire = new Player(room, 'dry_fire'), blocked = new Player(room, 'shielded');
    const dead = new Player(room, 'dead'), outsider = new Player(otherRoom, 'outsider');
    events['game:zombiesRoundStarted']({ room });
    const late = new Player(room, 'late_join');
    for (const player of players) kills(player);
    sidearm.weaponIdx = 1; sidearm.fire();
    assert.equal(primary.fire(), 'fired');
    primary.weaponIdx = 1; primary.fire();
    dryFire.weapon.ammo.rounds = 0; dryFire.fire();
    blocked.blocked = true; blocked.fire();
    await events['game:zombiesRoundFinished']({ room, winner: 'humans', survivors: [sidearm, primary, dryFire, blocked, late, outsider] });
    assert.deepEqual(reports, ['sidearm', 'dry_fire', 'shielded']);
    reports.length = 0;
    events['game:zombiesRoundStarted']({ room });
    kills(dead);
    await events['game:zombiesRoundFinished']({ room, winner: 'zombies', survivors: [dead] });
    assert.deepEqual(reports, []);
    events['game:zombiesRoundStarted']({ room });
    kills(sidearm);
    room.gameOptions.cheatsEnabled = true;
    events['game:playerUpdate']({ this: room, player: sidearm });
    room.gameOptions.cheatsEnabled = false;
    await events['game:zombiesRoundFinished']({ room, winner: 'humans', survivors: [sidearm] });
    assert.deepEqual(reports, []);
    events['game:zombiesRoundStarted']({ room });
    const reconnect = new Player(room, 'sidearm');
    kills(reconnect);
    await events['game:zombiesRoundFinished']({ room, winner: 'humans', survivors: [reconnect] });
    assert.deepEqual(reports, []);
    events['game:zombiesRoundStarted']({ room });
    kills(sidearm);
    events['game:roomDestroy']({ this: room });
    await events['game:zombiesRoundFinished']({ room, winner: 'humans', survivors: [sidearm] });
    assert.deepEqual(reports, []);

    for (const count of [49, 50, 51]) {
        reports.length = 0;
        sidearm.kills = 10000; //lifetime or previous-round totals cannot satisfy this challenge
        events['game:zombiesRoundStarted']({ room });
        kills(sidearm, count);
        events['game:scoreKillEggs']({ this: sidearm, killedPlayer: sidearm });
        events['game:scoreKillEggs']({ this: sidearm, killedPlayer: null });
        await events['game:zombiesRoundFinished']({ room, winner: 'humans', survivors: [sidearm] });
        assert.deepEqual(reports, count >= 50 ? ['sidearm'] : []);
    };
    reports.length = 0;
    for (const [name, useCustomMap] of [['Two Towers', false], ['Blue', true]]) {
        room.minMap.name = name; room.useCustomMap = useCustomMap;
        events['game:zombiesRoundStarted']({ room });
        kills(sidearm);
        await events['game:zombiesRoundFinished']({ room, winner: 'humans', survivors: [sidearm] });
        assert.deepEqual(reports, []);
    };
});
