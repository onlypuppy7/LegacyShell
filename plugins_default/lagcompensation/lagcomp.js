import Comm from '#comm';
import { TickStep, FramesBetweenSyncs, stateBufferSize } from '#constants';
import { Bullet, Rocket } from '#bullets';

export const Defaults = {
    enabled: true,
    maxRttMs: 100, //pings beyond this are treated as this
    maxRewindMs: 150, //hard cap on how far back anyone can reach
    extraMs: 0, //added on top of the rtt
    rockets: false, //rocket direct hits too
    pingSamples: 5,
    minSamples: 4, //no rewind until this many pings have been measured
    teleportDist: 2, //a jump this big between two ticks is a teleport, not movement
    minRewindTicks: 0.5, //less than this and the old test is used
};

const N = 64; //slots per player, ~1s
const states = new WeakMap(); //room -> state
const rtts = new WeakMap(); //client -> pings

export const settings = room => ({ ...Defaults, ...room?.gameOptions?.plugins?.lagcomp });

export class History {
    constructor() {
        this.x = new Float32Array(N);
        this.y = new Float32Array(N);
        this.z = new Float32Array(N);
        this.t = new Int32Array(N).fill(-1);
        this.playing = new Uint8Array(N);
        this.lives = new Int32Array(N);
        this.segs = new Int32Array(N);
        this.life = 0;
        this.seg = 0;
        this.was = false;
        this.out = { x: 0, y: 0, z: 0 };
    };

    record(tick, player, teleportDist) {
        var playing = !!player.playing, i = tick & (N - 1);
        if (playing && !this.was) { this.life++; this.seg++; }
        else if (playing && this.t[(tick - 1) & (N - 1)] === tick - 1 && this.playing[(tick - 1) & (N - 1)]) {
            var p = (tick - 1) & (N - 1);
            if (Math.hypot(player.x - this.x[p], player.y - this.y[p], player.z - this.z[p]) > teleportDist) this.seg++;
        };
        this.was = playing;
        this.x[i] = player.x; this.y[i] = player.y; this.z[i] = player.z;
        this.t[i] = tick; this.playing[i] = playing ? 1 : 0;
        this.lives[i] = this.life; this.segs[i] = this.seg;
    };

    //null: no history, use the old test. false: wasnt there to hit. otherwise the position
    sample(latest, rewind) {
        var tau = latest - rewind, i0 = Math.floor(tau), f = tau - i0;
        var a = i0 & (N - 1), b = (i0 + 1) & (N - 1);
        if (this.t[a] !== i0) return null;
        var hasB = f > 0;
        if (hasB && this.t[b] !== i0 + 1) return null;
        var pick = a;
        if (hasB && this.playing[a] && this.playing[b] && this.segs[a] === this.segs[b]) {
            var o = this.out;
            o.x = this.x[a] + (this.x[b] - this.x[a]) * f;
            o.y = this.y[a] + (this.y[b] - this.y[a]) * f;
            o.z = this.z[a] + (this.z[b] - this.z[a]) * f;
            return this.lives[a] === this.life ? o : false;
        };
        if (hasB && f >= .5) pick = b;
        if (!this.playing[pick] && hasB) pick = pick === a ? b : a;
        if (!this.playing[pick] || this.lives[pick] !== this.life) return false;
        this.out.x = this.x[pick]; this.out.y = this.y[pick]; this.out.z = this.z[pick];
        return this.out;
    };
};

//rtt = gap between two pings arriving - the 1000ms the client waits before sending the next. lateness only ever adds, so the smallest recent one is the honest one
export function onPing(client, now, room) {
    var r = rtts.get(client);
    if (!r) rtts.set(client, r = { last: null, ring: [], rtt: null });
    var last = r.last;
    r.last = now;
    if (last === null) return;
    var sample = now - last - 1000;
    if (sample < -30 || sample > 1000) return; //a throttled tab, or nonsense
    r.ring.push(Math.max(0, sample));
    var cap = settings(room).pingSamples;
    while (r.ring.length > cap) r.ring.shift();
    r.rtt = r.ring.length >= settings(room).minSamples ? Math.min(...r.ring) : null;
};

export const rttOf = client => rtts.get(client)?.rtt ?? null;

export function rewindFor(room, player, rocket) {
    var cfg = settings(room), st = states.get(room);
    if (!st || !cfg.enabled || (rocket && !cfg.rockets)) return 0;
    var client = player?.client;
    if (!client?.isHuman) return 0;
    var rtt = rttOf(client);
    if (rtt === null) return 0;
    var batch = Math.min(Math.max(Math.mod(player.syncStateIdx - player.stateIdx, stateBufferSize), 0), FramesBetweenSyncs); //the shot was fired this many ticks before the client sent it
    var rewind = (Math.min(rtt, cfg.maxRttMs) + cfg.extraMs) / TickStep + batch;
    rewind = Math.min(rewind, cfg.maxRewindMs / TickStep);
    return rewind < cfg.minRewindTicks ? 0 : rewind;
};

export function install(room) {
    var C = room.Collider, M = room.munitionsManager;
    if (states.has(room)) return states.get(room);
    var st = { room, tick: 0, hist: new WeakMap(), proj: null };
    states.set(room, st);
    C.lagcomp = st;

    var update = M.update;
    M.update = function (...args) { //state here is the end of the last tick, which is what this tick's shots test against
        var teleportDist = settings(room).teleportDist;
        for (var player of room.players_by_id) {
            if (!player) continue;
            var h = st.hist.get(player);
            if (!h) st.hist.set(player, h = new History());
            h.record(st.tick, player, teleportDist);
        };
        st.tick++;
        return update.apply(this, args);
    };

    var ray = C.rayCollidesWithPlayer, helper = C.rayCollidesWithPlayerHelper;
    C.rayCollidesWithPlayer = function (o, d, proj) {
        st.proj = proj?.lcRewind > 0 ? proj : null;
        try { return ray.call(this, o, d, proj); } finally { st.proj = null; };
    };
    C.rayCollidesWithPlayerHelper = function (r, player) {
        var proj = st.proj;
        if (!proj) return helper.call(this, r, player);
        var h = st.hist.get(player), pos = h ? h.sample(st.tick - 1, proj.lcRewind) : null;
        if (pos === null) return helper.call(this, r, player);
        if (pos === false) return false;
        var real = player.predicted;
        player.predicted = pos;
        try { var point = helper.call(this, r, player); } finally { player.predicted = real; };
        if (point) { point.x += player.x - pos.x; point.y += player.y - pos.y; point.z += player.z - pos.z; } //damage works out the angle from player.x, so the point comes along
        return point;
    };
    return st;
};

export function wrapShots() {
    [Bullet, Rocket].forEach(shot => {
        var fire = shot.prototype.fireThis;
        if (fire.lcWrapped) return;
        shot.prototype.fireThis = function (player, ...rest) {
            var out = fire.call(this, player, ...rest);
            var st = player?.Collider?.lagcomp;
            this.lcRewind = st ? rewindFor(st.room, player, shot === Rocket) : 0; //pooled, so always overwritten
            return out;
        };
        shot.prototype.fireThis.lcWrapped = true;
    });
};

export function listen(plugins) {
    plugins.on('game:roomInitEnd', ({ this: room }) => install(room));
    plugins.on('game:roomWsMessage', ({ this: room, client, type, content }) => {
        if (type !== 'wsMessage' || !client?.isHuman || !states.has(room)) return;
        try { if (new Comm.In(content).unPackInt8U() === Comm.Code.ping) onPing(client, Date.now(), room); } catch (e) { };
    });
};
