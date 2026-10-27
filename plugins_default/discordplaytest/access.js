import fs from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function parseDuration(input) {
    const match = /^(\d+)(m|h|d)$/i.exec(input || '');
    if (!match) return null;
    const duration = Number(match[1]) * { m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
    return Number.isSafeInteger(duration) && duration >= 60000 && duration <= 7 * 86400000 ? duration : null;
};

function hash(password) {
    return createHash('sha256').update(password).digest();
};

export class PlaytestAccess {
    constructor(filepath) {
        this.filepath = filepath;
        this.state = fs.existsSync(filepath) ? JSON.parse(fs.readFileSync(filepath, 'utf8')) : { approved: [], passes: {} };
        if (!Array.isArray(this.state.approved) || !this.state.approved.every(id => /^\d+$/.test(id)) ||
            !this.state.passes || typeof this.state.passes !== 'object' || Array.isArray(this.state.passes) ||
            !Object.entries(this.state.passes).every(([id, pass]) => /^\d+$/.test(id) &&
                /^[a-f0-9]{64}$/.test(pass?.hash) && Number.isSafeInteger(pass.expiresAt))) {
            throw new Error('Invalid discordplaytest state.json');
        };
    };

    save(state) {
        state.passes = Object.fromEntries(Object.entries(state.passes).filter(([, pass]) => pass.expiresAt > Date.now()));
        const temporary = this.filepath + '.tmp';
        fs.writeFileSync(temporary, JSON.stringify(state, null, 4), { mode: 0o600 });
        fs.renameSync(temporary, this.filepath);
        this.state = state;
    };

    approved(id) {
        return this.state.approved.includes(id);
    };

    approve(id, approved) {
        const state = structuredClone(this.state);
        state.approved = state.approved.filter(user => user !== id);
        if (approved) state.approved.push(id);
        else delete state.passes[id];
        this.save(state);
    };

    issue(id, duration) {
        if (!Number.isSafeInteger(duration) || duration < 60000 || duration > 7 * 86400000) throw new Error('Invalid duration');
        const password = randomBytes(18).toString('hex');
        const expiresAt = Date.now() + duration;
        const state = structuredClone(this.state);
        state.passes[id] = { hash: hash(password).toString('hex'), expiresAt };
        this.save(state);
        return { password, expiresAt };
    };

    clear(id) {
        const state = structuredClone(this.state);
        if (id) delete state.passes[id];
        else state.passes = {};
        this.save(state);
    };

    check(login, password) {
        if (login !== 'playtest' || typeof password !== 'string' || !password) return false;
        const received = hash(password);
        return Object.values(this.state.passes).some(pass => pass.expiresAt > Date.now() &&
            timingSafeEqual(received, Buffer.from(pass.hash, 'hex')));
    };
};
