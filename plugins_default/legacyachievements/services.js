import { ss } from '#misc';
import sess from '#sessionManagement';
import { AchievementStore } from './storage.js';

const maxWatchers = 3; //subscribed sockets kept per account, the oldest go first

export class AchievementService {
    constructor(plugins, context = () => ss, sessions = sess) {
        this.context = context;
        this.sessions = sessions;
        this.watchers = new Map();
        plugins.on('services:initTables', () => this.store);
        for (const event of ['addKill', 'validateRegisterSuccess', 'validateLoginSuccess', 'validateLoginViaAuthTokenSuccess']) {
            plugins.on('services:' + event, async ({ userData }) => {
                if (!userData?.account_id) return;
                const earned = this.store.evaluate(userData.account_id);
                if (earned.length || event === 'addKill') await this.broadcast(userData.account_id);
            });
        };
        plugins.on('services:unhandledCommand', async data => {
            if (!['achievementsGet', 'achievementsWatch', 'achievementsClaim', 'achievementsSeen', 'achievementsFeature', 'achievementsZombiesWin'].includes(data.msg.cmd)) return;
            plugins.cancel = true;
            try { await this.handle(data); }
            catch (error) {
                console.warn('LegacyAchievements:', error.message);
                this.send(data.ws, { type: 'error', message: error.code ? 'Could not save that reward. Try again.' : error.message || 'Could not load achievements.' }, data.msg.requestId);
            };
        });
        this.timer = setInterval(() => this.validateWatchers().catch(error => console.warn('LegacyAchievements:', error.message)), 60000);
        this.timer.unref?.();
    };

    get store() {
        const db = this.context().db;
        if (!this.storage || this.storage.db !== db) this.storage = new AchievementStore(db);
        return this.storage;
    };

    send(ws, payload, requestId) {
        if (ws.readyState !== 1) return;
        ws.send(JSON.stringify({ legacyachievements: payload, requestId: typeof requestId === 'string' ? requestId.slice(0, 64) : undefined }));
    };

    async owner(sessionToken, ip) {
        if (typeof sessionToken !== 'string' || !sessionToken) throw new Error('Sign in to redeem achievement rewards.');
        const session = await this.sessions.retrieveSession(sessionToken, ip, false);
        if (!session || !this.store.user(session.user_id)) throw new Error('Your session expired. Please sign in again.');
        return session.user_id;
    };

    async handle({ msg, ws, ip, accs }) {
        if (msg.cmd === 'achievementsZombiesWin') {
            if (typeof msg.auth_key !== 'string' || !msg.auth_key || !accs || !await accs.getAuthKeyData(msg.auth_key)) throw new Error('Game server authentication required.');
            const list = this.store.publicList(msg.username);
            if (!list) throw new Error('Player not found.');
            const { account_id: id } = this.store.db.prepare('SELECT account_id FROM users WHERE username = ?').get(list.username);
            this.store.unlock(id, 'zombies_no_primary');
            this.send(ws, { type: 'recorded' }, msg.requestId);
            await this.broadcast(id);
            return;
        };
        if (msg.cmd === 'achievementsGet') {
            const list = this.store.publicList(msg.username);
            if (!list) throw new Error('Player not found.');
            this.send(ws, { type: 'list', ...list }, msg.requestId);
            return;
        };
        const id = await this.owner(msg.session, ip);
        this.store.evaluate(id);
        if (msg.cmd === 'achievementsWatch') {
            if (!this.watchers.has(ws)) ws.once('close', () => this.watchers.delete(ws));
            this.watchers.set(ws, { id, session: msg.session, ip });
            const others = [...this.watchers].filter(([socket, watcher]) => socket !== ws && watcher.id === id);
            while (others.length >= maxWatchers) { const [socket] = others.shift(); this.watchers.delete(socket); socket.close(); };
            this.send(ws, { type: 'snapshot', ...this.store.snapshot(id) }, msg.requestId);
        } else if (msg.cmd === 'achievementsClaim') {
            if (typeof msg.achievement !== 'string') throw new Error('Choose an achievement first.');
            const receipt = this.store.claim(id, msg.achievement);
            this.send(ws, { type: 'claimed', achievement: msg.achievement, ...receipt }, msg.requestId);
            await this.broadcast(id);
        } else if (msg.cmd === 'achievementsFeature') {
            this.store.feature(id, msg.pins);
            this.send(ws, { type: 'snapshot', ...this.store.snapshot(id) }, msg.requestId);
            await this.broadcast(id);
        } else if (msg.cmd === 'achievementsSeen') {
            if (typeof msg.achievement === 'string') this.store.seen(id, msg.achievement);
        };
    };

    async broadcast(id) {
        for (const [ws, watcher] of this.watchers) {
            if (watcher.id !== id) continue;
            try {
                if (await this.owner(watcher.session, watcher.ip) !== id) throw new Error('Session changed.');
                this.send(ws, { type: 'snapshot', ...this.store.snapshot(id) });
            } catch { this.watchers.delete(ws); ws.close(); };
        };
    };

    async validateWatchers() {
        for (const [ws, watcher] of this.watchers) {
            try { await this.owner(watcher.session, watcher.ip); }
            catch { this.watchers.delete(ws); ws.close(); };
        };
    };

    dispose() { clearInterval(this.timer); for (const ws of this.watchers.keys()) ws.close(); this.watchers.clear(); };
};
