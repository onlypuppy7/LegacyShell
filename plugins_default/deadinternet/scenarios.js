// Debug "field" scenarios for `/botsdebug field`: ready-made mixes of bots, so a room can be filled
// with a varied population in one command to look at how the combat layer behaves - against a
// human, against each other, as a team, at scale.
//
// A scenario is a list of GROUPS; the total number of bots asked for is shared out between the
// groups by weight. Each group is just a combat options object (see combat.js's COMBAT_OPTIONS)
// plus a team, so a scenario is nothing more than "these option sets, in these proportions".
// Pure and engine-free: planField() only returns what to spawn, index.js/shared.js spawn it.
//
// Teams: the game only has team 0 (free for all) and teams 1 and 2.
//   0        - free for all
//   1, 2     - that team
//   'split'  - alternate between teams 1 and 2 across the group's members
//   'ally'   - the invoking player's own side (their team if they're on 1 or 2, else team 1)
//   'enemy'  - the opposite side to 'ally'
// A group can also give each team its own egg colour: `teamColors: { 1: 'blue', 2: 'red' }` (the game's
// own team colours - team 1 is blue, team 2 is red), so the sides can be told apart at a glance.
// A `color` given on the command line applies to every bot instead.
// A bot is only ever hostile to bots/players that aren't on its (non-zero) team, so `targets`
// decides who it will actually pick fights with: 'humans', 'bots' or 'all'.

import { resolveCombatOptions, resolveClassIndex, listClasses } from './combat.js';

export const FIELD_MAX_TOTAL = 40;

// Every key here is a normal combat option; `class` may be a list of candidates (first one that
// exists wins - so 'crackshot' is used when that plugin is loaded and quietly skipped when not).
export const FIELD_SCENARIOS = {
    mixed: {
        description: 'PvE variety: easy to nightmare enemies with assorted classes, all hunting the humans.',
        defaultTotal: 12,
        groups: [
            { weight: 3, label: 'easy', team: 0, config: { difficulty: 'easy', class: 'random' } },
            { weight: 4, label: 'normal', team: 0, config: { difficulty: 'normal', class: 'random' } },
            { weight: 2, label: 'hard', team: 0, config: { difficulty: 'hard', class: 'random' } },
            { weight: 1, label: 'nightmare', team: 0, config: { difficulty: 'nightmare', class: 'random' } },
        ],
    },
    rookies: {
        description: 'Beginners: very low skill, slow, miss a lot, no grenades. Good for learning the ropes.',
        defaultTotal: 8,
        groups: [
            { weight: 1, label: 'clueless', team: 0, config: { skill: 0.05, grenades: 0 } },
            { weight: 2, label: 'easy', team: 0, config: { difficulty: 'easy', grenades: 0, class: 'random' } },
        ],
    },
    gauntlet: {
        description: 'A hard fight: skilled, aggressive bots hunting the humans from every angle.',
        defaultTotal: 10,
        groups: [
            { weight: 2, label: 'hard rushers', team: 0, config: { difficulty: 'hard', aggression: 0.9, class: 'scrambler' } },
            { weight: 2, label: 'hard', team: 0, config: { difficulty: 'hard', class: 'random' } },
            { weight: 1, label: 'nightmare', team: 0, config: { difficulty: 'nightmare', aggression: 0.7, class: 'random' } },
        ],
    },
    ffa: {
        description: 'Free for all: everyone is team 0 and fights everyone, bots and humans alike.',
        defaultTotal: 12,
        groups: [
            { weight: 1, label: 'normal', team: 0, config: { difficulty: 'normal', targets: 'all', class: 'random' } },
            { weight: 1, label: 'hard', team: 0, config: { difficulty: 'hard', targets: 'all', class: 'random' } },
        ],
    },
    teams: {
        description: 'Team deathmatch: bots split across teams 1 and 2, fighting each other AND any human (team 0).',
        defaultTotal: 12,
        groups: [
            { weight: 1, label: 'team bots', team: 'split', config: { difficulty: 'normal', targets: 'all', class: 'random' } },
        ],
    },
    botwar: {
        description: 'Bots only: a blue team vs a red team fight each other and ignore humans, so you can watch.',
        defaultTotal: 12,
        groups: [
            { weight: 1, label: 'team bots', team: 'split', teamColors: { 1: 'blue', 2: 'red' }, config: { difficulty: 'hard', targets: 'bots', class: 'random', huntRange: 200 } },
        ],
    },
    squad: {
        description: 'You and your allies (defend you, hard) vs enemy bots that hunt everyone. 40% allies.',
        defaultTotal: 12,
        groups: [
            { weight: 4, label: 'allies', team: 'ally', ally: true, config: { difficulty: 'hard', role: 'ally', targets: 'all', class: 'random' } },
            { weight: 3, label: 'enemy normal', team: 'enemy', config: { difficulty: 'normal', targets: 'all', class: 'random' } },
            { weight: 3, label: 'enemy hard', team: 'enemy', config: { difficulty: 'hard', targets: 'all', class: 'random' } },
        ],
    },
    classes: {
        description: 'One group per weapon class that exists right now (incl. plugin classes like Crackshot), all free for all.',
        defaultTotal: 10,
        perClass: true,
        groups: [
            { weight: 1, label: 'class', team: 0, config: { skill: 0.6, targets: 'all' } },
        ],
    },
    snipers: {
        description: 'Long range campers: Free Ranger / Crackshot bots that hold position, use cover and listen for shots.',
        defaultTotal: 6,
        groups: [
            { weight: 1, label: 'sniper', team: 0, config: { difficulty: 'hard', class: ['crackshot', 'freeranger'], engageMovement: 'static', huntRange: 1, useCover: 1, aggression: 0.1, hearingRange: 70, sightRange: 100, grenades: 0 } },
        ],
    },
    rushers: {
        description: 'Close-range brawlers: Scramblers at full aggression and speed, short sight, lots of jumping.',
        defaultTotal: 8,
        groups: [
            { weight: 1, label: 'rusher', team: 0, config: { skill: 0.6, class: 'scrambler', aggression: 1, speed: 1, jumpChance: 0.5, sightRange: 25, useCover: 0, grenades: 0.8 } },
        ],
    },
    dummies: {
        description: 'Target dummies: never shoot, stand still. For aim and damage practice.',
        defaultTotal: 6,
        groups: [
            { weight: 1, label: 'dummy', team: 0, config: { difficulty: 'dummy', huntRange: 1, class: 'random' } },
        ],
    },
    stealth: {
        description: 'Sight and sound only: bots never hunt, they react to what they see and hear. Half deaf, half keen-eared.',
        defaultTotal: 10,
        groups: [
            { weight: 1, label: 'deaf', team: 0, config: { difficulty: 'normal', huntRange: 1, hearingRange: 0, class: 'random' } },
            { weight: 1, label: 'keen ears', team: 0, config: { difficulty: 'normal', huntRange: 1, hearingRange: 90, class: 'random' } },
        ],
    },
    stress: {
        description: 'Load test: many bots in a free for all, all with varied personalities. Watch the server tick rate.',
        defaultTotal: 30,
        groups: [
            { weight: 1, label: 'stress', team: 0, config: { difficulty: 'normal', targets: 'all', variance: 0.6, aggression: 0.5, class: 'random' } },
        ],
    },
};

export function listScenarios() {
    return Object.keys(FIELD_SCENARIOS);
}

// Splits `total` between weights, exactly, by largest remainder. When there's room, every group
// gets at least one member so a small field still shows each kind.
export function allocate(total, weights) {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum || total <= 0) return weights.map(() => 0);
    const exact = weights.map((w) => (w / sum) * total);
    const counts = exact.map(Math.floor);
    let left = total - counts.reduce((a, b) => a + b, 0);
    const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) counts[order[k].i]++;
    if (total >= weights.length) {
        for (let i = 0; i < counts.length; i++) {
            if (counts[i] > 0) continue;
            const donor = counts.indexOf(Math.max(...counts));
            counts[donor]--; counts[i]++;
        };
    };
    return counts;
}

// The first class candidate that actually exists in this game (a plugin class is only there while
// its plugin is loaded). Falls back to 'default' so a scenario never fails over a missing class.
function pickClass(candidate, rng) {
    const list = Array.isArray(candidate) ? candidate : [candidate];
    for (const c of list) {
        if (c === undefined || c === null) continue;
        if (c === 'random' || c === 'default' || resolveClassIndex(c, rng) >= 0) return c;
    };
    return 'default';
}

// Turns a scenario into a concrete spawn list.
//   name       - a key of FIELD_SCENARIOS
//   total      - how many bots (1..FIELD_MAX_TOTAL)
//   overrides  - { key: value } combat options applied on top of EVERY bot (e.g. { skill: 0.9 })
//   invokerTeam- the team of the player running the command (decides 'ally' / 'enemy')
// Returns { plan: [{ label, team, ally, config }], errors, warnings }; each config is ready to hand to
// `new DeadInternetBot(room, { combat: config })` (and has `team` already resolved).
export function planField(name, total, { overrides = {}, invokerTeam = 0, rng = Math.random } = {}) {
    const errors = [];
    const warnings = [];
    const scenario = FIELD_SCENARIOS[String(name).toLowerCase()];
    if (!scenario) return { plan: [], errors: [`unknown scenario "${name}" (have: ${listScenarios().join(', ')})`], warnings };

    total = Math.round(total ?? scenario.defaultTotal);
    if (!(total >= 1)) return { plan: [], errors: ['total must be at least 1'], warnings };
    if (total > FIELD_MAX_TOTAL) { warnings.push(`total capped at ${FIELD_MAX_TOTAL}`); total = FIELD_MAX_TOTAL; };

    let groups = scenario.groups;
    if (scenario.perClass) {
        const classes = listClasses();
        groups = (classes.length ? classes : [{ key: 'default', name: 'default' }]).map((c) => ({
            weight: 1, label: c.name.toLowerCase(), team: groups[0].team,
            config: { ...groups[0].config, class: c.key },
        }));
    };

    const allyTeam = invokerTeam === 1 || invokerTeam === 2 ? invokerTeam : 1;
    const enemyTeam = allyTeam === 1 ? 2 : 1;
    const counts = allocate(total, groups.map((g) => g.weight));

    const plan = [];
    groups.forEach((g, gi) => {
        for (let n = 0; n < counts[gi]; n++) {
            const team = g.team === 'ally' ? allyTeam : g.team === 'enemy' ? enemyTeam : g.team === 'split' ? (n % 2 === 0 ? 1 : 2) : g.team;
            const config = { ...g.config, ...overrides, team };
            if ('class' in g.config && !('class' in overrides)) config.class = pickClass(g.config.class, rng);
            if (g.teamColors && g.teamColors[team] && !('color' in overrides) && !('color' in g.config)) config.color = g.teamColors[team];
            plan.push({ label: g.label, team, ally: !!g.ally, config });
        };
    });

    // Validate every distinct config once, up front, so a typo'd override reports one clear error
    // instead of spawning a field of half-broken bots.
    const seen = new Set();
    for (const entry of plan) {
        const key = JSON.stringify(entry.config);
        if (seen.has(key)) continue;
        seen.add(key);
        const { errors: errs } = resolveCombatOptions(entry.config);
        for (const e of errs) if (!errors.includes(e)) errors.push(e);
    };
    return { plan, errors, warnings };
}

// "4x allies, 3x enemy normal, ..." for the command's reply.
export function summarisePlan(plan) {
    const counts = new Map();
    for (const e of plan) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
    return [...counts].map(([label, n]) => `${n}x ${label}`).join(', ');
}
