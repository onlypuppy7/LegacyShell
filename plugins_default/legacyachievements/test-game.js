import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AchievementGame } from './game.js';
import { RPEGG } from '#guns';

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
    new AchievementGame({ on: (event, listener) => events[event] = listener }, (name, id) => id || reports.push(name), Player, callback => players.forEach(callback)); //(Hard Boiled reports name their achievement, they have their own test)
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

test('kill challenges read the streak, hp, distance, jump, death and blast off the kill, and report each one once', () => {
    const reports = [], events = {};
    let clock = 1000;
    class Player {
        constructor(room, username, id) {
            Object.assign(this, { id, room, gameOptions: room.gameOptions, client: { isHuman: true, loggedIn: !!username, username }, hp: 100, streak: 0, x: 0, y: 0, z: 0, playing: true, jumping: false, climbing: false });
        };
        isDead() { return this.hp <= 0; };
        die() { this.streak = 0; this.hp = 0; this.playing = false; };
        scoreKill() { this.streak++; };
        hit(damage, firedPlayer) {
            if (this.hp <= 0) return;
            if (damage > this.hp) { this.die(firedPlayer.id); firedPlayer.scoreKill(this); } else this.hp -= damage;
        };
        revive() { this.hp = 100; this.playing = true; };
    };
    class Bullet {
        constructor(player, weaponName) { this.player = player; this.weaponClass = { weaponName }; };
        collidesWithPlayer(victim) { victim.hit(1000, this.player, 0.1, 0.2, undefined, 230); };
    };
    new AchievementGame({ on: (event, listener) => events[event] = listener }, (name, id) => reports.push(name + ':' + id), Player, () => {}, Bullet, () => clock);
    const room = { gameOptions: { cheatsEnabled: false } };
    let next = 0;
    const egg = name => new Player(room, name, ++next);
    const shoot = (killer, victim, weapon = 'EggK47') => new Bullet(killer, weapon).collidesWithPlayer(victim);
    const blast = (killer, victim, x = 5, y = 6) => victim.hit(1000, killer, x, y, undefined, 120);
    const took = () => reports.splice(0);

    //shutdown, the streak has to be read before dying wipes it
    let a = egg('shut_a'), v = egg('shut_v'); v.streak = 12; shoot(a, v);
    assert.deepEqual(took(), ['shut_a:shutdown']);
    a = egg('shut_b'); v = egg('shut_w'); v.streak = 9; shoot(a, v);
    assert.deepEqual(took(), []);

    //revenge, only against whoever killed you last
    a = egg('rev_a'); v = egg('rev_b'); shoot(a, v);
    assert.deepEqual(took(), []);
    v.revive(); shoot(v, a);
    assert.deepEqual(took(), ['rev_b:revenge_fried']);
    const other = egg('rev_c'); a.revive(); shoot(other, a); shoot(a, v);
    assert.deepEqual(took(), []);

    //long shot, a CSG-1 kill from 40 units or more
    for (const [distance, weapon, expected] of [[39, 'CSG-1', []], [41, 'EggK47', []], [41, 'CSG-1', ['long_a:long_shot']]]) {
        a = egg('long_a'); v = egg('long_v'); v.x = distance; shoot(a, v, weapon);
        assert.deepEqual(took(), expected);
    };

    //last gasp, alive on 10 hp or less
    for (const [hp, expected] of [[11, []], [0, []], [10, ['gasp_a:last_gasp']]]) {
        a = egg('gasp_a'); a.hp = hp; v = egg('gasp_v'); shoot(a, v);
        assert.deepEqual(took().filter(entry => entry.endsWith('last_gasp')), expected);
    };

    //from beyond the shell, a kill that lands after the killer has died
    a = egg('dead_a'); v = egg('dead_v'); a.die(); clock += 100; shoot(a, v);
    assert.deepEqual(took(), []);
    a = egg('dead_b'); v = egg('dead_w'); a.die(); clock += 300; shoot(a, v);
    assert.deepEqual(took(), ['dead_b:from_beyond']);

    //air mail, mid-jump but not on a ladder
    a = egg('air_a'); a.jumping = true; a.climbing = true; v = egg('air_v'); shoot(a, v);
    assert.deepEqual(took(), []);
    a = egg('air_b'); a.jumping = true; v = egg('air_w'); shoot(a, v);
    assert.deepEqual(took(), ['air_b:air_mail']);

    //omelette, three kills from one blast. a bullet or a different blast does not add to the count
    a = egg('omelette_a');
    blast(a, egg('o1')); blast(a, egg('o2'));
    assert.deepEqual(took(), []);
    blast(a, egg('o3'), 9, 9); blast(a, egg('o4'), 9, 9); shoot(a, egg('o5'));
    assert.deepEqual(took(), []);
    blast(a, egg('o6'), 5, 6);
    assert.deepEqual(took(), ['omelette_a:omelette']);
    clock += 500; a = egg('omelette_b');
    blast(a, egg('o7')); clock += 500; blast(a, egg('o8')); clock += 500; blast(a, egg('o9'));
    assert.deepEqual(took(), []);

    //each one is reported once per account, and guests and cheats earn nothing
    a = egg('once_a'); v = egg('once_v'); v.streak = 10; shoot(a, v); v = egg('once_w'); v.streak = 10; shoot(a, v);
    assert.deepEqual(took(), ['once_a:shutdown']);
    a = egg(''); v = egg('guest_v'); v.streak = 10; shoot(a, v);
    assert.deepEqual(took(), []);
    room.gameOptions.cheatsEnabled = true;
    a = egg('cheat_a'); v = egg('cheat_v'); v.streak = 10; shoot(a, v);
    assert.deepEqual(took(), []);
    room.gameOptions.cheatsEnabled = false;
    a = egg('self_a'); a.streak = 10; a.hit(1000, a); //nobody gets credit for a suicide
    assert.deepEqual(took(), []);
});

test('weapon kills are counted per weapon, batched, and put back when the batch cannot be sent', async () => {
    const batches = [], events = {};
    let failing = false;
    class Player {
        constructor(room, username, id) { Object.assign(this, { id, room, gameOptions: room.gameOptions, client: { isHuman: true, loggedIn: !!username, username }, hp: 100, streak: 0, x: 0, y: 0, z: 0, playing: true }); };
        isDead() { return this.hp <= 0; };
        die() { this.hp = 0; this.playing = false; };
        scoreKill() { this.streak++; };
        hit(damage, firedPlayer) { if (this.hp <= 0) return; if (damage > this.hp) { this.die(firedPlayer.id); firedPlayer.scoreKill(this); } else this.hp -= damage; };
    };
    class Bullet {
        constructor(player, weaponName) { this.player = player; this.weaponClass = { weaponName }; };
        collidesWithPlayer(victim) { victim.hit(1000, this.player, 0.1, 0.2, undefined, 40); };
    };
    const game = new AchievementGame({ on: (event, listener) => events[event] = listener }, () => {}, Player, () => {}, Bullet, () => 1000, async batch => { if (failing) throw new Error('services down'); batches.push(batch); });
    const room = { gameOptions: { cheatsEnabled: false } };
    let next = 0;
    const egg = name => new Player(room, name, ++next);
    const shoot = (killer, weapon) => new Bullet(killer, weapon).collidesWithPlayer(egg('victim'));
    const blast = (killer, damage) => egg('victim').hit(1000, killer, 5, 6, undefined, damage);
    try {
        const ann = egg('ann'), bob = egg('bob');
        for (const weapon of ['EggK-47', 'EggK-47', 'Dozen Gauge', 'CSG-1', 'Cluck 9mm', 'Whipper']) shoot(ann, weapon);
        blast(ann, RPEGG.damage); blast(ann, 130); blast(ann, 77); //a blast of any other size is not a weapon
        shoot(bob, 'CSG-1');
        shoot(egg(''), 'EggK-47'); //guests are not counted
        room.gameOptions.cheatsEnabled = true; shoot(ann, 'EggK-47'); room.gameOptions.cheatsEnabled = false;
        await game.flush();
        assert.deepEqual(batches.splice(0)[0], [
            { cmd: 'achievementsWeaponKills', username: 'ann', kills: { eggk47: 2, dozen: 1, csg1: 1, cluck: 1, rpegg: 1, grenade: 1 } },
            { cmd: 'achievementsWeaponKills', username: 'bob', kills: { csg1: 1 } },
        ]);
        await game.flush();
        assert.deepEqual(batches, []); //nothing waiting, nothing sent
        failing = true; shoot(ann, 'EggK-47'); await game.flush(); assert.deepEqual(batches, []);
        failing = false; shoot(ann, 'EggK-47'); await game.flush();
        assert.deepEqual(batches.splice(0)[0], [{ cmd: 'achievementsWeaponKills', username: 'ann', kills: { eggk47: 2 } }]);
    } finally { game.dispose(); };
});

test('zombie kills are their own count, never a weapon kill, and only when the killer is logged in without cheats', async () => {
    const batches = [];
    class Player {
        constructor(room, username, id, team) { Object.assign(this, { id, room, team, gameOptions: room.gameOptions, client: { isHuman: true, loggedIn: !!username, username }, hp: 100, streak: 0, x: 0, y: 0, z: 0, playing: true }); };
        isDead() { return this.hp <= 0; };
        die() { this.hp = 0; this.playing = false; };
        scoreKill() { this.streak++; };
        hit(damage, firedPlayer) { if (this.hp <= 0) return; if (damage > this.hp) { this.die(firedPlayer.id); firedPlayer.scoreKill(this); } else this.hp -= damage; };
    };
    class Bullet {
        constructor(player, weaponName) { this.player = player; this.weaponClass = { weaponName }; };
        collidesWithPlayer(victim) { victim.hit(1000, this.player, 0.1, 0.2, undefined, 40); };
    };
    const game = new AchievementGame({ on() {} }, () => {}, Player, () => {}, Bullet, () => 1000, async batch => { batches.push(batch); });
    const room = { gameOptions: { cheatsEnabled: false, plugins: { zombies: {} } } };
    let next = 0;
    try {
        const ann = new Player(room, 'ann', ++next, 1);
        for (let i = 0; i < 3; i++) new Bullet(ann, 'EggK-47').collidesWithPlayer(new Player(room, '', ++next, 2));
        new Bullet(new Player(room, '', ++next, 1), 'EggK-47').collidesWithPlayer(new Player(room, '', ++next, 2)); //a guest
        room.gameOptions.cheatsEnabled = true; new Bullet(ann, 'EggK-47').collidesWithPlayer(new Player(room, '', ++next, 2)); room.gameOptions.cheatsEnabled = false;
        await game.flush();
        assert.deepEqual(batches.splice(0)[0], [{ cmd: 'achievementsWeaponKills', username: 'ann', kills: { zombies: 3 } }]);
        delete room.gameOptions.plugins.zombies; //in any other mode a kill is a weapon's again
        new Bullet(ann, 'EggK-47').collidesWithPlayer(new Player(room, '', ++next, 2));
        await game.flush();
        assert.deepEqual(batches.splice(0)[0], [{ cmd: 'achievementsWeaponKills', username: 'ann', kills: { eggk47: 1 } }]);
    } finally { game.dispose(); };
});

test('a kill in mid-jump is also counted for the weapon it was made with, for Air Mail II', async () => {
    const batches = [];
    class Player {
        constructor(room, username, id) { Object.assign(this, { id, room, gameOptions: room.gameOptions, client: { isHuman: true, loggedIn: !!username, username }, hp: 100, streak: 0, x: 0, y: 0, z: 0, playing: true }); };
        isDead() { return this.hp <= 0; };
        die() { this.hp = 0; this.playing = false; };
        scoreKill() { this.streak++; };
        hit(damage, firedPlayer) { if (this.hp <= 0) return; if (damage > this.hp) { this.die(firedPlayer.id); firedPlayer.scoreKill(this); } else this.hp -= damage; };
    };
    class Bullet {
        constructor(player, weaponName) { this.player = player; this.weaponClass = { weaponName }; };
        collidesWithPlayer(victim) { victim.hit(1000, this.player, 0.1, 0.2, undefined, 40); };
    };
    const game = new AchievementGame({ on() {} }, () => {}, Player, () => {}, Bullet, () => 1000, async batch => { batches.push(batch); });
    const room = { gameOptions: { cheatsEnabled: false } };
    let next = 0;
    const egg = name => new Player(room, name, ++next);
    const flush = async () => { await game.flush(); return batches.splice(0)[0]; };
    try {
        const ann = egg('ann');
        ann.jumping = true;
        new Bullet(ann, 'EggK-47').collidesWithPlayer(egg('v'));
        new Bullet(ann, 'CSG-1').collidesWithPlayer(egg('v'));
        egg('v').hit(1000, ann, 5, 6, undefined, RPEGG.damage);
        egg('v').hit(1000, ann, 7, 8, undefined, 130);
        assert.deepEqual(await flush(), [{ cmd: 'achievementsWeaponKills', username: 'ann', kills: { eggk47: 1, air_eggk47: 1, csg1: 1, air_csg1: 1, rpegg: 1, air_rpegg: 1, grenade: 1, air_grenade: 1 } }]);

        ann.jumping = false; //on the ground, or on a ladder, it is only the weapon's kill
        new Bullet(ann, 'EggK-47').collidesWithPlayer(egg('v'));
        ann.jumping = true; ann.climbing = true;
        new Bullet(ann, 'Dozen Gauge').collidesWithPlayer(egg('v'));
        ann.climbing = false;
        assert.deepEqual(await flush(), [{ cmd: 'achievementsWeaponKills', username: 'ann', kills: { eggk47: 1, dozen: 1 } }]);

        room.gameOptions.plugins = { zombies: {} }; //zombies are their own count, but the weapon still counts for the mid-jump one
        const zombie = egg('z'); zombie.team = 2; ann.team = 1;
        new Bullet(ann, 'Cluck 9mm').collidesWithPlayer(zombie);
        assert.deepEqual(await flush(), [{ cmd: 'achievementsWeaponKills', username: 'ann', kills: { zombies: 1, air_cluck: 1 } }]);
        delete room.gameOptions.plugins;

        const guest = egg(''); guest.jumping = true; //guests are not counted
        new Bullet(guest, 'EggK-47').collidesWithPlayer(egg('v'));
        assert.equal(await flush(), undefined);
    } finally { game.dispose(); };
});

test('Hard Boiled is reported when a run of survived rounds gets to 1, 3, 5 and 10, and anything but surviving breaks the run', async () => {
    const events = {}, reports = [], players = [];
    const room = { gameOptions: {} };
    const make = (username, extra = {}) => { const player = { id: username, room, gameOptions: room.gameOptions, client: { isHuman: true, loggedIn: true, username }, ...extra }; players.push(player); return player; };
    new AchievementGame({ on: (event, listener) => events[event] = listener }, (name, id) => reports.push(name + ':' + id), class {}, callback => players.forEach(callback));
    const steady = make('steady'), unlucky = make('unlucky'), guest = make('guest', { client: { isHuman: true, loggedIn: false } }), cheater = make('cheater', { gameOptions: { cheatsEnabled: true } });
    const round = (winner, survivors) => events['game:zombiesRoundFinished']({ room, winner, survivors });
    await round('humans', [steady, unlucky, guest, cheater]);
    assert.deepEqual(reports, ['steady:zombie_rounds_1', 'unlucky:zombie_rounds_1']);
    reports.length = 0;
    await round('humans', [steady]); //unlucky was bitten
    await round('humans', [steady, unlucky]);
    assert.deepEqual(reports, ['steady:zombie_rounds_3', 'unlucky:zombie_rounds_1']); //unlucky starts again at one (the services only unlock it once)
    reports.length = 0;
    await round('humans', [steady]);
    await round('humans', [steady]);
    assert.deepEqual(reports, ['steady:zombie_rounds_5']);
    reports.length = 0;
    await round('zombies', [steady]); //the horde won, so nobody survived and the run starts over
    for (let i = 0; i < 5; i++) await round('humans', [steady]);
    assert.deepEqual(reports, ['steady:zombie_rounds_1', 'steady:zombie_rounds_3', 'steady:zombie_rounds_5']);
    reports.length = 0;
    for (let i = 0; i < 4; i++) await round('humans', [steady]);
    assert.deepEqual(reports, []);
    await round('humans', [steady]);
    assert.deepEqual(reports, ['steady:zombie_rounds_10']);
});
