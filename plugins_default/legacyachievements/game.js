import WebSocket from 'ws';
import { ss } from '#misc';
import Player from '#player';
import { Bullet } from '#bullets';
import * as Guns from '#guns';
import { RPEGG } from '#guns';
import { iteratePlayers } from '#constants';
import { MidairWeapons, ZombieRoundGoals } from './definitions.js';

const challengeMap = 'Blue', challengeKills = 50; //Sidearm Survivor
//weapon tiers, a bullet names its weapon and an explosion only has its damage (the grenade throws 130 in bullets.js)
//every gun in #guns is matched to the tier line its name starts with (the Dozen Gauge to dozen), so a new gun with a tier line is counted without touching this
const weaponNames = Object.fromEntries(Object.values(Guns).filter(gun => gun?.weaponName).map(gun => [gun.weaponName, MidairWeapons.find(id => gun.weaponName.toLowerCase().replace(/[^a-z0-9]/g, '').startsWith(id))]).filter(([, id]) => id)), grenadeDamage = 130, flushMs = 10000;
const longShotUnits = 40, shutdownStreak = 10, lastGaspHp = 10, omeletteKills = 3, explosionMs = 100, afterlifeMs = 250; //kill challenges

export class AchievementGame {
    constructor(plugins, report = (username, achievement) => this.report(username, achievement), PlayerClass = Player, eachPlayer = iteratePlayers, BulletClass = Bullet, now = () => Date.now(), send = messages => this.post(messages)) {
        this.rounds = new WeakMap();
        this.runs = new WeakMap(); //rounds survived in a row, by player
        this.pending = new Map(); //weapon kills waiting to go to the services, by username
        this.send = send;
        this.timer = setInterval(() => this.flush(), flushMs);
        this.timer.unref?.();
        const rounds = this.rounds;
        this.watchKills(PlayerClass, BulletClass, report, now);
        const fire = PlayerClass.prototype.fire;
        PlayerClass.prototype.fire = function () {
            const weapon = this.weapon, primary = this.weaponIdx === 0;
            const before = weapon?.ammo?.rounds;
            const result = fire.apply(this, arguments);
            if (primary && weapon?.ammo?.rounds < before) rounds.get(this.room)?.players.delete(this);
            return result;
        };
        plugins.on('game:zombiesRoundStarted', ({ room }) => {
            if (room.useCustomMap || room.minMap?.name !== challengeMap) { rounds.delete(room); return; };
            const players = new Map();
            eachPlayer(player => {
                if (player.room === room && player.client?.isHuman && player.client.loggedIn && player.client.username) players.set(player, { username: player.client.username, kills: 0 });
            });
            rounds.set(room, { players, cheated: !!room.gameOptions.cheatsEnabled });
        });
        plugins.on('game:scoreKillEggs', ({ this: player, killedPlayer }) => {
            const entry = rounds.get(player.room)?.players.get(player);
            if (entry && killedPlayer && player.id !== killedPlayer.id) entry.kills++;
        });
        plugins.on('game:playerUpdate', ({ this: room, player }) => {
            const round = rounds.get(room);
            if (round && (room.gameOptions.cheatsEnabled || player.gameOptions?.cheatsEnabled)) round.cheated = true;
        });
        plugins.on('game:zombiesRoundFinished', async ({ room, winner, survivors }) => {
            eachPlayer(player => { //Hard Boiled: a run of rounds survived, anything but surviving one breaks it
                const client = player.client;
                if (player.room !== room || !(client?.isHuman && client.loggedIn && client.username)) return;
                const cheated = room.gameOptions.cheatsEnabled || player.gameOptions?.cheatsEnabled;
                const run = winner === 'humans' && !cheated && survivors.includes(player) ? (this.runs.get(player) || 0) + 1 : 0;
                this.runs.set(player, run);
                if (ZombieRoundGoals.includes(run)) Promise.resolve(report(client.username, 'zombie_rounds_' + run)).catch(() => {});
            });
            const round = rounds.get(room);
            rounds.delete(room);
            if (!round || round.cheated || room.gameOptions.cheatsEnabled || room.useCustomMap || room.minMap?.name !== challengeMap || winner !== 'humans') return;
            await Promise.allSettled(survivors.map(async player => {
                const entry = round.players.get(player);
                if (entry?.kills >= challengeKills && player.client?.loggedIn && player.client.username === entry.username && !player.gameOptions.cheatsEnabled) await report(entry.username);
            }));
        });
        plugins.on('game:roomDestroy', ({ this: room }) => rounds.delete(room));
    };

    //kill challenges are read off the shared Player/Bullet code by wrapping it, core stays as it is
    watchKills(PlayerClass, BulletClass, report, now) {
        const states = new WeakMap(), killedBy = new WeakMap(), explosions = new Map(), reported = new Set();
        const stateOf = player => states.get(player) || states.set(player, {}).get(player);
        let bullet = null, hit = null; //what is dealing damage right now, die and scoreKill both run inside that call
        const wrap = (proto, name, make) => { const original = proto?.[name]; if (typeof original === 'function') proto[name] = make(original); };
        wrap(PlayerClass.prototype, 'die', die => function () {
            const state = stateOf(this);
            state.streak = this.streak; state.diedAt = now(); //die() zeroes the streak before anyone can read it
            return die.apply(this, arguments);
        });
        wrap(PlayerClass.prototype, 'hit', takeHit => function (damage, firedPlayer, dx, dz, noHeal, originalDamage) {
            const before = hit;
            hit = { dx, dz, originalDamage };
            try { return takeHit.apply(this, arguments); } finally { hit = before; };
        });
        wrap(BulletClass.prototype, 'collidesWithPlayer', collide => function () {
            const before = bullet;
            bullet = this;
            try { return collide.apply(this, arguments); } finally { bullet = before; };
        });
        wrap(PlayerClass.prototype, 'scoreKill', scoreKill => function (victim) {
            const result = scoreKill.apply(this, arguments);
            try { award(this, victim, bullet, hit); }
            catch (error) { console.warn('LegacyAchievements:', error.message); };
            return result;
        });
        const award = (killer, victim, bullet, hit) => {
            if (!victim || victim === killer || victim.id === killer.id) return;
            const earned = [], time = now(), self = stateOf(killer);
            if (killedBy.get(killer) === victim) { earned.push('revenge_fried'); killedBy.delete(killer); };
            killedBy.set(victim, killer);
            if (stateOf(victim).streak >= shutdownStreak) earned.push('shutdown');
            if (bullet?.weaponClass?.weaponName === 'CSG-1' && Math.hypot(killer.x - victim.x, killer.y - victim.y, killer.z - victim.z) >= longShotUnits) earned.push('long_shot');
            if (killer.hp > 0 && killer.hp <= lastGaspHp) earned.push('last_gasp');
            if (killer.isDead?.() && self.diedAt && time - self.diedAt >= afterlifeMs) earned.push('from_beyond');
            if (killer.hp > 0 && killer.jumping && !killer.climbing) earned.push('air_mail');
            if (hit && !bullet && typeof hit.originalDamage === 'number') { //an explosion, every player it hits shares the shooter and the blast position
                const key = killer.id + ':' + hit.dx + ':' + hit.dz;
                const blast = explosions.get(key)?.at > time - explosionMs ? explosions.get(key) : { kills: 0 };
                blast.kills++; blast.at = time;
                explosions.set(key, blast);
                for (const [other, entry] of explosions) if (entry.at < time - explosionMs) explosions.delete(other);
                if (blast.kills === omeletteKills) earned.push('omelette');
            };
            const client = killer.client;
            if (!(client?.isHuman && client.loggedIn && client.username) || killer.room?.gameOptions?.cheatsEnabled || killer.gameOptions?.cheatsEnabled) return;
            const zombie = !!killer.room?.gameOptions?.plugins?.zombies && victim.team !== killer.team; //the horde is not kills, or a weapon's kills
            const gun = bullet ? weaponNames[bullet.weaponClass?.weaponName] : hit?.originalDamage === RPEGG.damage ? 'rpegg' : hit?.originalDamage === grenadeDamage ? 'grenade' : null;
            const airborne = killer.hp > 0 && killer.jumping && !killer.climbing; //(Air Mail II: a kill like that with every weapon, zombies or not)
            if (zombie || gun) this.queue(client.username, { [zombie ? 'zombies' : gun]: 1, ...(airborne && gun && { ['air_' + gun]: 1 }) });
            for (const id of earned) {
                const key = client.username + ':' + id;
                if (reported.has(key)) continue;
                if (reported.size > 5000) reported.clear();
                reported.add(key);
                Promise.resolve(report(client.username, id)).catch(() => reported.delete(key));
            };
        };
    };

    queue(username, kills) {
        const counts = this.pending.get(username) || this.pending.set(username, {}).get(username);
        for (const [weapon, count] of Object.entries(kills)) counts[weapon] = Math.min((counts[weapon] || 0) + count, 100000);
    };

    //weapon kills go in one batch every few seconds, a kill a connection would be far too many. a failed batch is put back
    flush() {
        const batch = [...this.pending].map(([username, kills]) => ({ cmd: 'achievementsWeaponKills', username, kills }));
        this.pending.clear();
        if (!batch.length) return Promise.resolve();
        return Promise.resolve(this.send(batch)).catch(error => {
            console.warn('LegacyAchievements:', error.message);
            for (const { username, kills } of batch) this.queue(username, kills);
        });
    };

    dispose() { clearInterval(this.timer); };

    report(username, achievement = 'zombies_no_primary') {
        return this.post([{ cmd: 'achievementsChallenge', username, achievement }]).catch(error => console.warn('LegacyAchievements:', error.message));
    };

    post(messages) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(ss.config.game.services_server);
            let settled = false;
            const finish = error => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); error ? reject(error) : resolve(); };
            const timer = setTimeout(() => { socket.terminate(); finish(new Error('Achievement report timed out.')); }, 10000);
            let answered = 0; //the services answer every message once
            socket.on('open', () => { for (const message of messages) socket.send(JSON.stringify({ ...message, auth_key: ss.config.game.auth_key })); });
            socket.on('message', data => {
                try {
                    const result = JSON.parse(data).legacyachievements;
                    if (result?.type !== 'recorded') finish(new Error(result?.message || 'Achievement report failed.'));
                    else if (++answered >= messages.length) finish(null);
                } catch (error) { finish(error); };
            });
            socket.on('error', finish);
            socket.on('close', () => finish(new Error('Achievement report disconnected.')));
        });
    };
};
