import WebSocket from 'ws';
import { ss } from '#misc';
import Player from '#player';
import { iteratePlayers } from '#constants';

export class AchievementGame {
    constructor(plugins, report = username => this.report(username), PlayerClass = Player, eachPlayer = iteratePlayers) {
        this.rounds = new WeakMap();
        const rounds = this.rounds;
        const fire = PlayerClass.prototype.fire;
        PlayerClass.prototype.fire = function () {
            const weapon = this.weapon, primary = this.weaponIdx === 0;
            const before = weapon?.ammo?.rounds;
            const result = fire.apply(this, arguments);
            if (primary && weapon?.ammo?.rounds < before) rounds.get(this.room)?.players.delete(this);
            return result;
        };
        plugins.on('game:zombiesRoundStarted', ({ room }) => {
            if (room.useCustomMap || room.minMap?.name !== 'Blue') { rounds.delete(room); return; };
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
            const round = rounds.get(room);
            rounds.delete(room);
            if (!round || round.cheated || room.gameOptions.cheatsEnabled || room.useCustomMap || room.minMap?.name !== 'Blue' || winner !== 'humans') return;
            await Promise.allSettled(survivors.map(async player => {
                const entry = round.players.get(player);
                if (entry?.kills >= 50 && player.client?.loggedIn && player.client.username === entry.username && !player.gameOptions.cheatsEnabled) await report(entry.username);
            }));
        });
        plugins.on('game:roomDestroy', ({ this: room }) => rounds.delete(room));
    };

    report(username) {
        return new Promise((resolve, reject) => {
            const socket = new WebSocket(ss.config.game.services_server);
            let settled = false;
            const finish = error => { if (settled) return; settled = true; clearTimeout(timer); socket.close(); error ? reject(error) : resolve(); };
            const timer = setTimeout(() => { socket.terminate(); finish(new Error('Achievement report timed out.')); }, 10000);
            socket.on('open', () => socket.send(JSON.stringify({ cmd: 'achievementsZombiesWin', auth_key: ss.config.game.auth_key, username })));
            socket.on('message', data => {
                try { const result = JSON.parse(data).legacyachievements; finish(result?.type === 'recorded' ? null : new Error(result?.message || 'Achievement report failed.')); }
                catch (error) { finish(error); };
            });
            socket.on('error', finish);
            socket.on('close', () => finish(new Error('Achievement report disconnected.')));
        }).catch(error => console.warn('LegacyAchievements:', error.message));
    };
};
