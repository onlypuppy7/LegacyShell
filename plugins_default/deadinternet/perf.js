// A small profiler for the bot AI, driven by `/botsdebug perf`. Off by default, and when off every
// call below is a single boolean check, so leaving the hooks in costs essentially nothing.
//
// It answers "where does the AI time go?": named sections (think, update, scan, engage, pathTo,
// followPath, ...) each get a call count, total, average and worst single call, plus a few plain
// counters (line-of-sight rays cast, A* searches, searches that found nothing, ...). `think` is
// the whole per-bot-per-tick AI step; everything else nests inside it (or inside `update`, which
// is the decision half), so percentages are of `think`.
//
// It also keeps 100ms windows of total `think` time, because averages hide spikes: a window over
// 100ms means the AI alone used the entire window (6 ticks) and the game is falling behind.
//
// Each room is its own worker thread with its own copy of this module, so a profile covers the
// room the command was run in - which is exactly what you want.

const clock = () => globalThis.performance.now();

const WINDOW_MS = 100;

// Display order and labels. Indentation shows nesting; names not listed here still get reported
// (after these) so nothing recorded is ever hidden.
const SECTION_ORDER = [
    ['think', 'think (whole AI step)'],
    ['update', '  decide (controller.update)'],
    ['scan', '    scan (perception, targets)'],
    ['sounds', '    hearing poll'],
    ['nearestHostile', '    nearest hostile (hunting)'],
    ['ownerAim', '    owner aim (ally focus)'],
    ['cover.enter', '    cover decision'],
    ['cover.tick', '    cover movement'],
    ['grenade.try', '    grenade decision'],
    ['engage', '    engage (aim, fire, strafe)'],
    ['apply', '  apply (set controls/path)'],
    ['pathTo', '    pathTo (incl. throttled no-ops)'],
    ['findPath', '      findPath (A* searches)'],
    ['followPath', '    followPath (steering/physics checks)'],
];

const COUNTER_LABELS = {
    'los': 'line-of-sight rays cast',
    'findCover': 'cover searches',
    'grenade.solve': 'grenade solves',
    'findPath.none': 'A* searches that found no path',
    'bots': 'bots seen thinking (max per window)',
};

export class Perf {
    constructor() {
        this.enabled = false;
        this.reset();
    }

    reset() {
        this.sections = new Map();
        this.counters = new Map();
        this.startedAt = clock();
        this.stoppedAt = null;
        this.windows = [];
        this.window = { start: this.startedAt, ms: 0, calls: 0 };
    }

    start() { this.reset(); this.enabled = true; }

    stop() {
        if (!this.enabled) return;
        this.enabled = false;
        this.stoppedAt = clock();
        this.closeWindow();
    }

    // Timestamp to hand to add(); 0 (and no clock read) while profiling is off.
    now() { return this.enabled ? clock() : 0; }

    add(name, t0) {
        if (!this.enabled) return;
        const now = clock();
        const dt = now - t0;
        let s = this.sections.get(name);
        if (!s) { s = { calls: 0, total: 0, max: 0 }; this.sections.set(name, s); };
        s.calls++;
        s.total += dt;
        if (dt > s.max) s.max = dt;
        if (name === 'findPath' && dt > (this.tickMaxSearch ?? 0)) this.tickMaxSearch = dt; // read and reset per tick by bench-lag.js
        if (name === 'think') {
            if (now - this.window.start >= WINDOW_MS) { this.closeWindow(); this.window = { start: now, ms: 0, calls: 0 }; };
            this.window.ms += dt;
            this.window.calls++;
        };
    }

    count(name, n = 1) {
        if (!this.enabled) return;
        this.counters.set(name, (this.counters.get(name) ?? 0) + n);
    }

    closeWindow() {
        if (this.window.calls > 0) this.windows.push(this.window);
        if (this.windows.length > 20000) this.windows.shift();
    }

    elapsedSeconds() {
        return ((this.stoppedAt ?? clock()) - this.startedAt) / 1000;
    }

    // Plain-text report, one short line each (chat-sized).
    report() {
        const secs = Math.max(0.001, this.elapsedSeconds());
        const think = this.sections.get('think');
        if (!think) {
            return [`perf: nothing recorded yet${this.enabled ? ` (profiling for ${secs.toFixed(1)}s - spawn some bots)` : ' - run /botsdebug perf start [seconds]'}`];
        };

        const lines = [];
        const ticksPerSec = think.calls / secs;
        lines.push(`perf: ${secs.toFixed(1)}s, ${think.calls} AI steps (~${ticksPerSec.toFixed(0)}/s, ~${(ticksPerSec / 60).toFixed(1)} bots), AI used ${(think.total / (secs * 10)).toFixed(1)}% of wall time`);

        // Include the window still being filled, so a report taken mid-run (or of a short run) has numbers.
        const all = this.window.calls > 0 && !this.windows.includes(this.window) ? [...this.windows, this.window] : this.windows;
        const ms = all.map((w) => w.ms).sort((a, b) => a - b);
        if (ms.length) {
            const pick = (q) => ms[Math.min(ms.length - 1, Math.floor(ms.length * q))];
            const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
            lines.push(`per 100ms window (6 ticks) AI ms: avg ${avg.toFixed(1)}  p50 ${pick(0.5).toFixed(1)}  p95 ${pick(0.95).toFixed(1)}  p99 ${pick(0.99).toFixed(1)}  worst ${ms[ms.length - 1].toFixed(1)}  (100 = saturated)`);
        };
        lines.push(`worst single bot step: ${think.max.toFixed(1)}ms  avg ${(think.total / think.calls).toFixed(3)}ms`);

        const known = new Set(SECTION_ORDER.map(([k]) => k));
        const rows = [...SECTION_ORDER.filter(([k]) => this.sections.has(k)), ...[...this.sections.keys()].filter((k) => !known.has(k)).map((k) => [k, `    ${k}`])];
        lines.push('section: total ms | % of think | calls | avg ms | max ms');
        for (const [key, label] of rows) {
            const s = this.sections.get(key);
            lines.push(`${label}: ${s.total.toFixed(0)} | ${(100 * s.total / think.total).toFixed(0)}% | ${s.calls} | ${(s.total / s.calls).toFixed(3)} | ${s.max.toFixed(1)}`);
        };

        const counters = [...this.counters].filter(([k]) => k !== 'bots');
        if (counters.length) {
            lines.push('counts: ' + counters.map(([k, v]) => `${COUNTER_LABELS[k] ?? k} ${v} (${(v / secs).toFixed(0)}/s)`).join(', '));
        };
        return lines;
    }
}

export const perf = new Perf();
