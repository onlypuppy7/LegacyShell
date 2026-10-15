// DeadInternet combat layer: target selection, line of sight, aim, fire control, hearing, cover,
// grenades and engaged movement for bots.
//
// Deliberately engine-free, like pathfinding.js: nothing in here touches a real Player/Room
// beyond reading plain properties off the objects handed in, and nothing mutates them either.
// `CombatController.update()` returns a *command* describing what the bot wants this tick
// (yaw/pitch, held controls, fire, reload, swap, grenade, where to path) and
// `DeadInternetBot.applyCombat()` (index.js) is the one place that applies it. That keeps the
// whole thing unit-testable offline (see test-combat.js) with mock players and a synthetic
// `map.data` grid.
//
// Everything about a bot's behavior is one flat options object (see COMBAT_OPTIONS). The
// difficulty presets (dummy .. nightmare) are just named SKILL values: `skill` (0..1) drives a
// whole family of options along the curves in SKILL_CURVES, and `/bots add 0.7` or `skill=0.7`
// asks for any point in between. Personality (aggression, variance) is separate from skill, and
// any option set explicitly always wins over what skill/preset would have chosen.
// Angles in the options are degrees and durations are seconds, because they're meant to be typed
// into chat; they're converted to radians once, in the controller's constructor.

import { isBlockingCell, isLadderCell, isRampCell } from './pathfinding.js';
import { TWO_PI, toRad, angleDiff, stepAngle, dirFromAngles, anglesTo, angleBetweenDirs, hasLineOfSight, hasGroundAhead, gaussian, cellAtSafe } from './combat-geometry.js';
import { SoundTracker, findCover, solveGrenadeThrow } from './combat-tactics.js';
// Re-exported so existing importers (index.js, tests) keep working from combat.js.
export { angleDiff, stepAngle, dirFromAngles, anglesTo, angleBetweenDirs, hasLineOfSight, hasGroundAhead };
export { SoundTracker, findCover, solveGrenadeThrow };

// ---------------------------------------------------------------------------------------------
// Option schema
// ---------------------------------------------------------------------------------------------

// `nullable: true` options default to null, meaning "leave the game's own value alone" (or, for
// the range options, "work it out from the weapon in hand"). Options flagged `skill: true` get
// their value from the skill curves below unless set explicitly; the `default` shown for those is
// filled in from the curve at skill 0.5 ("normal") further down.
export const COMBAT_OPTIONS = {
    // --- identity / allegiance
    role:               { type: 'enum', values: ['enemy', 'ally'], default: 'enemy', description: 'enemy hunts targets on its own; ally follows its owner and fights what threatens them.' },
    targets:            { type: 'enum', values: ['auto', 'all', 'humans', 'bots'], default: 'auto', description: 'who counts as a valid target. auto = humans for enemy, everyone hostile for ally.' },
    team:               { type: 'number', integer: true, min: -1, max: 2, default: -1, description: 'team to join (-1 = leave as joined, 0 = free for all, 1 or 2). The game only has teams 0-2.' },
    nickname:           { type: 'string', maxLength: 16, default: 'DeadInternetBot', description: 'name shown for the bot.' },
    color:              { type: 'string', colorOption: true, nullable: true, default: null, description: 'egg (shell) colour: a name (white, ice, sand, orange, clay, rust, brown, red, purple, pink, yellow, blue, green, lime), a number 0-13, random, or default.' },
    speed:              { type: 'number', min: 0.1, max: 3, default: null, nullable: true, skill: true, description: 'movement speed modifier.' },
    damage:             { type: 'number', min: 0, max: 10, default: null, nullable: true, skill: true, description: 'damage dealt modifier (unset = the game\'s own).' },
    resistance:         { type: 'number', min: 0, max: 10, default: null, nullable: true, description: 'damage resistance modifier.' },

    // --- skill & personality
    skill:              { type: 'number', min: 0, max: 1, default: 0.5, description: 'overall ability 0..1 (dummy 0, easy .25, normal .5, hard .75, nightmare 1). Drives every option marked skill.' },
    aggression:         { type: 'number', min: 0, max: 1, default: 0.5, description: 'personality: aggressive bots fight closer, retreat later, hide less and chase longer; cautious ones the opposite.' },
    variance:           { type: 'number', min: 0, max: 1, default: 0.25, description: 'how much each bot differs from the preset (reaction, aim, speed...), so a group of bots does not act identically.' },

    // --- perception
    sightRange:         { type: 'number', min: 1, max: 500, default: 45, skill: true, description: 'max distance (blocks) a target can be noticed at.' },
    fovDeg:             { type: 'number', min: 10, max: 360, default: 140, skill: true, description: 'focus field of view in degrees: targets in it are noticed at once.' },
    peripheralDeg:      { type: 'number', min: 10, max: 360, default: 260, skill: true, description: 'wider peripheral vision: targets outside the focus cone but inside this are noticed after peripheralDelay.' },
    peripheralDelay:    { type: 'number', min: 0, max: 5, default: 0.6, skill: true, description: 'seconds a target must stay in peripheral vision before it is noticed.' },
    hearingRange:       { type: 'number', min: 0, max: 300, default: 35, skill: true, description: 'how far gunshots are heard (grenade throws count at 0.6x, explosions 1.8x). Heard sounds make the bot go and investigate. 0 = deaf.' },
    memoryTime:         { type: 'number', min: 0, max: 60, default: 3, skill: true, description: 'seconds to keep hunting a target\'s last known position after losing sight of it.' },
    reactionTime:       { type: 'number', min: 0, max: 5, default: 0.45, skill: true, description: 'seconds between first seeing a target and being allowed to shoot at it.' },
    targetSwitchDelay:  { type: 'number', min: 0, max: 10, default: 1, skill: true, description: 'minimum seconds before dropping the current target for a closer one.' },
    focusFire:          { type: 'number', min: 0, max: 1, default: 0.4, skill: true, description: 'chance to go for the squad\'s focus target (enemies: what a squadmate is fighting; allies: what their owner is aiming at).' },

    // --- aim
    turnRateDeg:        { type: 'number', min: 10, max: 3600, default: 220, skill: true, description: 'max aim turn speed, degrees per second.' },
    aimErrorDeg:        { type: 'number', min: 0, max: 45, default: 4, skill: true, description: 'aim wobble (degrees) at aimErrorRefDistance.' },
    aimErrorRefDistance:{ type: 'number', min: 1, max: 200, default: 20, description: 'distance at which aimErrorDeg applies in full; error scales with distance.' },
    movePenalty:        { type: 'number', min: 0, max: 4, default: 1, skill: true, description: 'how much worse the aim gets while the bot (or its target) is moving. 0 = none.' },
    leadFactor:         { type: 'number', min: 0, max: 1.5, default: 0.5, skill: true, description: 'how much to lead moving targets (0 = aim where they are, 1 = full prediction).' },
    flinch:             { type: 'number', min: 0, max: 2, default: 0.35, skill: true, description: 'how much being hit knocks the aim off and delays the next shot (subtle). 0 = unshakeable.' },

    // --- fire control
    holdFire:           { type: 'bool', default: false, description: 'never shoot (target dummy / passive bot).' },
    fireConeDeg:        { type: 'number', min: 0.1, max: 45, default: 5, skill: true, description: 'only fire when the aim is within this many degrees of the target.' },
    burstShots:         { type: 'number', integer: true, min: 0, max: 100, default: 5, skill: true, description: 'rounds per burst before pausing (0 = hold the trigger).' },
    burstPause:         { type: 'number', min: 0, max: 10, default: 0.5, skill: true, description: 'seconds to pause between bursts.' },
    sprayControl:       { type: 'number', min: 0, max: 1, default: 0.4, skill: true, description: 'trigger discipline: skilled bots pause for the weapon\'s spread to settle instead of spraying. 0 = sprays.' },
    minFireRange:       { type: 'number', min: 0, max: 200, default: 0, description: 'won\'t fire at targets closer than this.' },
    maxFireRange:       { type: 'number', min: 1, max: 500, default: null, nullable: true, description: 'won\'t fire at targets farther than this (auto = from the weapon in hand).' },
    missChance:         { type: 'number', min: 0, max: 1, default: 0.2, skill: true, description: 'chance that any given shot is aimed deliberately wide (0 = never, 1 = always miss).' },
    missAngleDeg:       { type: 'number', min: 0, max: 45, default: 6, skill: true, description: 'how far wide a deliberate miss goes (always enough to clear the target at any range).' },
    grenades:           { type: 'number', min: 0, max: 1, default: 0.4, skill: true, description: 'how readily it throws grenades (0 = never). Thrown at visible or just-lost targets within about 3-8 blocks.' },

    // --- movement while engaged
    engageMovement:     { type: 'enum', values: ['static', 'strafe', 'advance'], default: 'strafe', skill: true, description: 'static = stand and shoot, advance = close to range only, strafe = hold range and strafe.' },
    preferredRangeMin:  { type: 'number', min: 0, max: 100, default: null, nullable: true, description: 'backs away from targets closer than this (auto = from the weapon in hand).' },
    preferredRangeMax:  { type: 'number', min: 1, max: 200, default: null, nullable: true, description: 'advances on targets farther than this (auto = from the weapon in hand).' },
    strafeInterval:     { type: 'number', min: 0.2, max: 10, default: 1.2, description: 'average seconds between strafe direction changes.' },
    strafeVariance:     { type: 'number', min: 0, max: 1, default: 0.5, skill: true, description: 'how unpredictable the strafing is: varied timing, pauses to shoot, dodging when hit. 0 = metronome.' },
    jumpChance:         { type: 'number', min: 0, max: 5, default: 0.1, skill: true, description: 'jumps per second (on average) while fighting.' },
    spacing:            { type: 'number', min: 0, max: 1, default: 0.5, skill: true, description: 'keeps bots from bunching up: spreads out around a followed player or target and avoids blocking teammates.' },
    followDistance:     { type: 'number', min: 1, max: 100, default: 6, description: 'ally: how close to stay to the owner.' },
    huntRange:          { type: 'number', min: 1, max: 500, default: 200, description: 'enemy: max distance to go looking for a target when none is in sight (set low to rely on sight and sound only).' },

    // --- survival
    useCover:           { type: 'number', min: 0, max: 1, default: 0.5, skill: true, description: 'how readily it ducks behind cover to reload or recover (0 = never). It peeks back out afterwards.' },
    retreatBelow:       { type: 'number', min: 0, max: 1, default: 0.35, skill: true, description: 'health fraction below which it retreats (to cover if it can find some, else backing away).' },
    resumeAbove:        { type: 'number', min: 0, max: 1, default: 0.7, skill: true, description: 'health fraction it recovers to before re-engaging.' },
    coverMaxTime:       { type: 'number', min: 2, max: 60, default: 12, description: 'longest it will stay in cover before peeking out regardless.' },
    healthPacks:        { type: 'bool', default: true, description: 'when hurt, go and collect a health pack if the room has any (needs the health pack item plugin).' },

    // --- weapons / lifecycle
    respawnDelay:       { type: 'number', min: 0, max: 120, default: 7.5, description: 'seconds after dying before the bot respawns.' },
    weapon:             { type: 'enum', values: ['auto', 'primary', 'secondary'], default: 'auto', description: 'preferred weapon when not forced to switch.' },
    autoReload:         { type: 'bool', default: true, description: 'reload automatically.' },
    autoSwap:           { type: 'bool', default: true, description: 'switch weapons when empty, or when the other one suits the distance better.' },
    class:              { type: 'string', classOption: true, nullable: true, default: null, description: 'weapon class (default = soldier, random, or any class name incl. plugin ones like crackshot).' },
    restock:            { type: 'bool', default: true, description: 'when every weapon is out of ammo, go and pick up an ammo crate.' },
    restockRange:       { type: 'number', min: 1, max: 500, default: 100, description: 'max distance to travel to an ammo crate or health pack.' },
    reloadBelow:        { type: 'number', min: 0, max: 1, default: 0.3, description: 'reload when not fighting and the magazine is below this fraction.' },
};

// How each skill-driven option scales with `skill`. Arrays are the value at skill
// 0, 0.25, 0.5, 0.75, 1 (dummy-ish, easy, normal, hard, nightmare) and are interpolated between
// those anchors; functions are for options that aren't a plain number.
export const SKILL_ANCHORS = [0, 0.25, 0.5, 0.75, 1];
export const SKILL_CURVES = {
    reactionTime:      [1.4, 1, 0.45, 0.25, 0.1],
    turnRateDeg:       [60, 90, 220, 360, 720],
    aimErrorDeg:       [14, 10, 4, 2, 0.7],
    fireConeDeg:       [14, 10, 5, 3, 2],
    burstShots:        [1, 2, 5, 8, 30],
    burstPause:        [1.8, 1.2, 0.5, 0.3, 0],
    sightRange:        [18, 25, 45, 60, 100],
    memoryTime:        [1, 2, 3, 5, 8],
    speed:             [0.3, 0.4, 0.6, 0.8, 1],
    jumpChance:        [0, 0, 0.1, 0.25, 0.4],
    leadFactor:        [0, 0, 0.5, 0.8, 1],
    missChance:        [0.7, 0.55, 0.2, 0.08, 0],
    missAngleDeg:      [12, 10, 6, 3, 0],
    targetSwitchDelay: [2, 1.5, 1, 0.7, 0.4],
    movePenalty:       [2.2, 1.8, 1, 0.6, 0.25],
    sprayControl:      [0, 0.1, 0.4, 0.7, 0.95],
    flinch:            [0.7, 0.6, 0.35, 0.2, 0.1],
    hearingRange:      [8, 15, 35, 50, 80],
    fovDeg:            [100, 110, 140, 180, 220],
    peripheralDeg:     [180, 200, 260, 300, 360],
    peripheralDelay:   [1.2, 1, 0.6, 0.35, 0.15],
    useCover:          [0, 0.15, 0.5, 0.8, 1],
    retreatBelow:      [0.55, 0.5, 0.35, 0.25, 0.15],
    resumeAbove:       [0.9, 0.85, 0.7, 0.6, 0.5],
    grenades:          [0, 0.1, 0.4, 0.7, 1],
    strafeVariance:    [0, 0.15, 0.5, 0.8, 1],
    focusFire:         [0, 0.1, 0.4, 0.7, 1],
    spacing:           [0, 0.2, 0.5, 0.75, 1],
    damage:            (s) => { const v = interpolate([0.4, 0.6, 1, 1, 1], s); return v >= 0.995 ? null : v; },
    engageMovement:    (s) => (s < 0.35 ? 'advance' : 'strafe'),
};

function interpolate(anchors, s) {
    const t = Math.max(0, Math.min(1, s)) * (anchors.length - 1);
    const i = Math.min(anchors.length - 2, Math.floor(t));
    return anchors[i] + (anchors[i + 1] - anchors[i]) * (t - i);
}

export function skillValue(key, s) {
    const curve = SKILL_CURVES[key];
    if (!curve) return undefined;
    if (typeof curve === 'function') return curve(s);
    const v = interpolate(curve, s);
    return COMBAT_OPTIONS[key]?.integer ? Math.round(v) : v;
}

// Keep the documented defaults honest: they ARE the curve at "normal".
for (const key of Object.keys(SKILL_CURVES)) COMBAT_OPTIONS[key].default = skillValue(key, 0.5);

// Lowercased, separator-stripped lookup so `aim_error_deg`, `aimerrordeg` and `aimErrorDeg` all
// resolve - these get typed into chat.
const normKey = (s) => String(s).toLowerCase().replace(/[_\-\s]/g, '');
const OPTION_LOOKUP = new Map(Object.keys(COMBAT_OPTIONS).map((k) => [normKey(k), k]));
// Short aliases for the options people will type most.
const ALIASES = {
    aim: 'aimErrorDeg', aimerror: 'aimErrorDeg', reaction: 'reactionTime', turn: 'turnRateDeg', fov: 'fovDeg', peripheral: 'peripheralDeg',
    cone: 'fireConeDeg', burst: 'burstShots', sight: 'sightRange', memory: 'memoryTime', lead: 'leadFactor', movement: 'engageMovement',
    move: 'engageMovement', range: 'maxFireRange', name: 'nickname', hp: 'resistance', spray: 'sprayControl', cover: 'useCover',
    retreat: 'retreatBelow', grenade: 'grenades', nades: 'grenades', hear: 'hearingRange', hearing: 'hearingRange', aggro: 'aggression',
    focus: 'focusFire', strafe: 'strafeVariance', miss: 'missChance', penalty: 'movePenalty',
};
for (const [alias, key] of Object.entries(ALIASES)) if (!OPTION_LOOKUP.has(alias)) OPTION_LOOKUP.set(alias, key);

// The game's shell colours, in the order of `shellColors` in constants.js (the palette on the character
// screen, left to right, top row then bottom row). Note the game only lets subscribers pick 7-13; bots
// are not subscribers, so index.js sets the colour on the client directly after joining.
export const SHELL_COLORS = ['white', 'ice', 'sand', 'orange', 'clay', 'rust', 'brown', 'red', 'purple', 'pink', 'yellow', 'blue', 'green', 'lime'];

// -> palette index 0-13, or null for "leave it as it joined". Accepts a name, a number, or 'random'.
export function resolveShellColor(value, rng = Math.random) {
    if (value === null || value === undefined || value === 'default') return null;
    if (value === 'random') return Math.floor(rng() * SHELL_COLORS.length);
    if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value < SHELL_COLORS.length ? value : null;
    const t = String(value).trim().toLowerCase();
    if (/^\d+$/.test(t)) { const n = parseInt(t, 10); return n < SHELL_COLORS.length ? n : null; };
    const i = SHELL_COLORS.indexOf(t);
    return i >= 0 ? i : null;
}

// Weapon classes come from the game's own `classes` list (constants.js), handed in by index.js
// via setClassProvider() so this file stays engine-free. Plugins that add a class (Crackshot adds
// one in its constructor) show up here automatically - and simply don't exist if the plugin isn't
// loaded, so nothing in this file needs to know about any particular plugin.
let classProvider = () => [];
export function setClassProvider(fn) { classProvider = typeof fn === 'function' ? fn : () => []; }
export function listClasses() { return classProvider().map((c, index) => ({ index, name: c.name, key: normKey(c.name) })); }
// -> class index, or -1 when unknown. null/'default' is class 0 (soldier); 'random' picks one.
export function resolveClassIndex(value, rng = Math.random) {
    if (value === null || value === undefined || value === 'default') return 0;
    const list = listClasses();
    if (value === 'random') return list.length ? Math.floor(rng() * list.length) : 0;
    const key = normKey(value);
    const hit = list.find((c) => c.key === key);
    return hit ? hit.index : -1;
}

export function resolveOptionKey(rawKey) {
    return OPTION_LOOKUP.get(normKey(rawKey)) ?? null;
}

// Validates one raw (string or already typed) value against its schema entry. Out-of-range
// numbers are clamped with a warning rather than rejected - a typo'd `aim=100` shouldn't throw
// away the whole command. Returns { value, warning? } or { error }.
export function coerceOption(key, raw) {
    const spec = COMBAT_OPTIONS[key];
    if (!spec) return { error: `unknown option "${key}"` };

    if (raw === null || raw === undefined) {
        return spec.nullable ? { value: null } : { error: `${key} can't be unset` };
    };
    const text = typeof raw === 'string' ? raw.trim() : raw;

    switch (spec.type) {
        case 'bool': {
            if (typeof text === 'boolean') return { value: text };
            const t = String(text).toLowerCase();
            if (['true', 'on', 'yes', 'y', '1'].includes(t)) return { value: true };
            if (['false', 'off', 'no', 'n', '0'].includes(t)) return { value: false };
            return { error: `${key} must be true/false` };
        };
        case 'enum': {
            const t = String(text).toLowerCase();
            const hit = spec.values.find((v) => v === t);
            return hit ? { value: hit } : { error: `${key} must be one of: ${spec.values.join(', ')}` };
        };
        case 'string': {
            if (spec.colorOption) {
                const t = String(text).trim().toLowerCase();
                if (t === 'default') return { value: null };
                if (t === 'random') return { value: 'random' };
                const i = resolveShellColor(t);
                if (i === null) return { error: `color must be one of: default, random, ${SHELL_COLORS.map((c, n) => `${c}(${n})`).join(', ')}` };
                return { value: SHELL_COLORS[i] };
            };
            if (spec.classOption) {
                const t = String(text).toLowerCase();
                if (t === 'default') return { value: null };
                if (t === 'random') return { value: 'random' };
                if (resolveClassIndex(t) < 0) return { error: `class must be one of: default, random, ${listClasses().map((c) => c.key).join(', ')}` };
                return { value: normKey(t) };
            };
            const s = String(text);
            if (!s.length) return { error: `${key} can't be empty` };
            return { value: s.slice(0, spec.maxLength ?? 64) };
        };
        case 'number': {
            if (spec.nullable && typeof text === 'string' && ['default', 'none', 'null', 'off', 'unset', 'auto'].includes(text.toLowerCase())) return { value: null };
            const pct = typeof text === 'string' && /^\d*\.?\d+%$/.test(text) && spec.max === 1;
            const n = typeof text === 'number' ? text : pct ? Number(text.slice(0, -1)) / 100 : Number(text);
            if (!Number.isFinite(n)) return { error: `${key} must be a number` };
            let v = spec.integer ? Math.round(n) : n;
            let warning;
            if (v < spec.min) { v = spec.min; warning = `${key} clamped to minimum ${spec.min}`; }
            else if (v > spec.max) { v = spec.max; warning = `${key} clamped to maximum ${spec.max}`; };
            return { value: v, warning };
        };
    };
    return { error: `${key} has unsupported type` };
}

// ---------------------------------------------------------------------------------------------
// Difficulty presets and skill
// ---------------------------------------------------------------------------------------------

// A preset is a skill value plus (optionally) a few explicit overrides. Stored already
// validated, via registerPreset, so a bad built-in would fail loudly at import time.
export const DIFFICULTY_PRESETS = {};

export function registerPreset(name, overrides) {
    const id = normKey(name);
    if (!id) throw new Error('preset needs a name');
    const clean = {};
    for (const [rawKey, raw] of Object.entries(overrides)) {
        const key = resolveOptionKey(rawKey);
        if (!key) throw new Error(`preset "${name}": unknown option "${rawKey}"`);
        const res = coerceOption(key, raw);
        if (res.error) throw new Error(`preset "${name}": ${res.error}`);
        clean[key] = res.value;
    };
    DIFFICULTY_PRESETS[id] = clean;
    return clean;
}

registerPreset('dummy',     { skill: 0, holdFire: true, engageMovement: 'static', jumpChance: 0, speed: 0.5, useCover: 0, grenades: 0, hearingRange: 0 });
registerPreset('easy',      { skill: 0.25 });
registerPreset('normal',    { skill: 0.5 });
registerPreset('hard',      { skill: 0.75 });
registerPreset('nightmare', { skill: 1 });

export function listPresets() {
    return Object.keys(DIFFICULTY_PRESETS);
}

// "0.7", 0.7 and "70%" are a skill; anything else (including bare integers > 1) is not.
// Returns a number in 0..1, or null if `raw` isn't a skill value.
export function parseSkill(raw) {
    if (typeof raw === 'number') return raw >= 0 && raw <= 1 ? raw : null;
    if (typeof raw !== 'string') return null;
    const t = raw.trim();
    let n = null;
    if (/^\d*\.?\d+%$/.test(t)) n = Number(t.slice(0, -1)) / 100;
    else if (/^\d*\.?\d+$/.test(t)) n = Number(t);
    return n !== null && n >= 0 && n <= 1 ? n : null;
}

export function defaultCombatOptions() {
    const out = {};
    for (const [key, spec] of Object.entries(COMBAT_OPTIONS)) out[key] = spec.default;
    return out;
}

// Final options = schema defaults, then the skill curves at the chosen skill, then the preset's
// explicit extras, then anything set explicitly. `difficulty` may be a preset name or a skill
// number; `skill` may be given separately (and wins over the preset's own). Returns
// { options, warnings, errors } - callers decide whether errors are fatal. Unknown override keys
// are errors (a typo'd option silently doing nothing is worse than a message).
export function resolveCombatOptions({ difficulty, skill, ...overrides } = {}) {
    const warnings = [];
    const errors = [];
    const options = defaultCombatOptions();

    let level = null;
    let extras = {};
    if (difficulty === undefined || difficulty === null) difficulty = 'normal';
    const asSkill = parseSkill(difficulty);
    if (asSkill !== null) level = asSkill;
    else {
        const preset = DIFFICULTY_PRESETS[normKey(difficulty)];
        if (!preset) errors.push(`unknown difficulty "${difficulty}" (a preset: ${listPresets().join(', ')}; or a skill 0-1 like 0.7)`);
        else { extras = { ...preset }; if (extras.skill !== undefined) level = extras.skill; delete extras.skill; };
    };
    if (skill !== undefined && skill !== null) {
        const s = parseSkill(skill);
        if (s === null) errors.push('skill must be a number from 0 to 1 (or a percentage like 70%)');
        else level = s;
    };
    if (level === null) level = 0.5;

    options.skill = level;
    for (const key of Object.keys(SKILL_CURVES)) options[key] = skillValue(key, level);
    Object.assign(options, extras);

    for (const [rawKey, raw] of Object.entries(overrides)) {
        const key = resolveOptionKey(rawKey);
        if (!key) { errors.push(`unknown option "${rawKey}"`); continue; };
        const res = coerceOption(key, raw);
        if (res.error) { errors.push(res.error); continue; };
        if (res.warning) warnings.push(res.warning);
        options[key] = res.value;
    };

    // A max preferred range below the min is nonsense and would make the bot oscillate.
    if (options.preferredRangeMin !== null && options.preferredRangeMax !== null && options.preferredRangeMax < options.preferredRangeMin) {
        options.preferredRangeMax = options.preferredRangeMin;
        warnings.push('preferredRangeMax raised to match preferredRangeMin');
    };
    // Resuming below the retreat threshold would have it dither in and out of cover.
    if (options.resumeAbove < options.retreatBelow) {
        options.resumeAbove = Math.min(1, options.retreatBelow + 0.1);
        warnings.push('resumeAbove raised to just above retreatBelow');
    };
    return { options, warnings, errors };
}

// Parses the free-text tail of `/bots add`: "[count] [difficulty] [key=value ...]", in any order.
// A bare integer is the count; a bare word naming a preset, or a decimal/percentage like `0.7` or
// `70%`, is the difficulty; anything with `=` is an override (`skill=0.7` and `difficulty=hard`
// work too). Returns { count, difficulty (name or number), overrides, errors }.
export function parseCombatArgs(text, { defaultCount = 1, maxCount = 18 } = {}) {
    const result = { count: defaultCount, difficulty: 'normal', overrides: {}, errors: [] };
    const tokens = String(text ?? '').split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        if (/^\d+$/.test(token)) {
            const n = parseInt(token, 10);
            if (n < 1 || n > maxCount) result.errors.push(`count must be 1-${maxCount}`);
            else result.count = n;
        } else if (token.includes('=')) {
            const eq = token.indexOf('=');
            const key = token.slice(0, eq);
            const value = token.slice(eq + 1);
            if (!key || value === '') { result.errors.push(`bad option "${token}" (use key=value)`); continue; };
            if (normKey(key) === 'difficulty') {
                const s = parseSkill(value);
                if (s !== null) result.difficulty = s;
                else if (DIFFICULTY_PRESETS[normKey(value)]) result.difficulty = normKey(value);
                else result.errors.push(`unknown difficulty "${value}"`);
            } else result.overrides[key] = value;
        } else if (DIFFICULTY_PRESETS[normKey(token)]) {
            result.difficulty = normKey(token);
        } else if (/[.%]/.test(token) && parseSkill(token) !== null) {
            result.difficulty = parseSkill(token);
        } else {
            result.errors.push(`unknown argument "${token}"`);
        };
    };
    return result;
}

// ---------------------------------------------------------------------------------------------
// Weapon profiles
// ---------------------------------------------------------------------------------------------

// Everything weapon-specific the bot needs, derived from the gun's own stats rather than a table
// of known guns - so a weapon added by any plugin (Crackshot's M24, anything else) just works.
// Stats used: range (how far a shot travels), velocity (blocks/tick; bullets are 1.5x it, see
// bullets.js), accuracy (base spread), radius (present on explosive weapons), readySpread
// (weapons that won't fire until steady), automatic.
//
// "Effective" range is the travel range shrunk by spread, so an inaccurate gun (EggK-47, pistol,
// shotgun) is fought up close even though its bullets technically fly farther.
const DEFAULT_PROFILE = { name: 'unknown', explosive: false, speed: 0.75, range: 20, effective: 13, maxFire: 18, prefMin: 3, prefMax: 8, minUseful: 0, needsSteady: false, automatic: true, spreadIncrement: 0, precise: false };
const profileCache = new WeakMap();

export function weaponProfile(sub) {
    if (!sub || typeof sub !== 'object') return DEFAULT_PROFILE;
    const cached = profileCache.get(sub);
    if (cached) return cached;

    const positive = (v, fallback) => (Number.isFinite(v) && v > 0 ? v : fallback);
    const range = positive(sub.range, 20);
    const explosive = Number(sub.radius) > 0;
    const velocity = positive(sub.velocity, 0.5);
    const accuracy = Math.max(0, Number(sub.accuracy) || 0);
    const effective = range / (1 + accuracy / 25);
    const maxFire = Math.min(range * 0.95, effective * 1.35);

    let prefMin, prefMax;
    if (explosive) {
        // Keep clear of its own blast (explosions hurt the shooter) and fight from mid range.
        prefMin = Math.min(maxFire * 0.8, Math.max(sub.radius * 2 + 2, effective * 0.3));
        prefMax = Math.max(prefMin + 1, effective * 0.7);
    } else {
        prefMin = effective * 0.2;
        prefMax = effective * 0.55;
    };

    const profile = {
        name: sub.weaponName ?? 'unknown',
        explosive,
        speed: velocity * (explosive ? 1 : 1.5),
        range, effective, maxFire, prefMin, prefMax,
        minUseful: explosive ? sub.radius + 1.5 : 0,
        needsSteady: !!sub.readySpread,
        automatic: !!sub.automatic,
        spreadIncrement: Math.max(0, Number(sub.shotSpreadIncrement) || 0),
        // Accurate single-shot guns (snipers) are best fired from a standstill.
        precise: effective >= 25 && !sub.automatic,
    };
    profileCache.set(sub, profile);
    return profile;
}

// ---------------------------------------------------------------------------------------------
// CombatController
// ---------------------------------------------------------------------------------------------

const CONTROL_BITS = { up: 1, down: 2, left: 4, right: 8, jump: 16, fire: 32 };
const BODY_OFFSET = 0.32;  // matches collider.js: hit sphere is centered at y + 0.32 * scale
const WALK_SPEED = 0.035;  // terminal horizontal velocity per tick (player.js: .007 accel against .8 drag)

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

export class CombatController {
    // `deps`:
    //   player          - the bot's own Player (read only here)
    //   map             - room.map ({ data, width, height, depth })
    //   iteratePlayers  - `iteratePlayers` from #constants, injected so tests can mock it
    //   owner           - Player this bot follows/defends when role is 'ally'
    //   getPickups      - optional (codeName) => [{x,y,z}] of ACTIVE pickups of that item kind
    //                     ('AMMO', 'HEALTH', ...). Kinds the room doesn't have just return [].
    //   sounds          - optional SoundTracker shared by every bot in the room (hearing)
    //   squad           - optional shared { focus, until } object, one per group of allied bots
    //   now             - optional () => seconds on a clock shared by every bot (squad timing)
    //   rng             - optional () => [0,1), for deterministic tests
    //   perf            - optional Perf profiler (see perf.js)
    constructor(deps, options = {}) {
        this.player = deps.player;
        this.map = deps.map;
        this.iteratePlayers = deps.iteratePlayers;
        this.owner = deps.owner ?? null;
        this.rng = deps.rng ?? Math.random;
        this.getPickups = deps.getPickups ?? (deps.getAmmoCrates ? (kind) => (kind === 'AMMO' ? deps.getAmmoCrates() : []) : null);
        this.sounds = deps.sounds ?? null;
        this.squad = deps.squad ?? null;
        this.now = deps.now ?? (() => Date.now() / 1000);
        this.perf = deps.perf ?? null; // optional profiler (perf.js); every hook below is a no-op while it is off

        const resolved = resolveCombatOptions(options);
        this.warnings = resolved.warnings;
        this.errors = resolved.errors;
        this.opts = this.applyVariance({ ...resolved.options });
        const o = this.opts;
        this.aggr = clamp01(o.aggression);
        this.turnRate = toRad(o.turnRateDeg);
        this.aimError = toRad(o.aimErrorDeg);
        this.fireCone = toRad(o.fireConeDeg);
        this.fov = toRad(o.fovDeg);
        this.peripheral = Math.max(this.fov, toRad(o.peripheralDeg));
        this.targetsFilter = o.targets === 'auto' ? (o.role === 'ally' ? 'all' : 'humans') : o.targets;

        this.time = 0;
        this.scanTimer = this.rng() * 0.15; // stagger bots' scans so a room full of them doesn't scan on the same tick
        this.slot = (((deps.player?.id ?? 0) * 2.399963) % TWO_PI + TWO_PI) % TWO_PI; // golden-angle spread, stable per bot

        // targeting
        this.target = null;
        this.targetVisible = false;
        this.targetSince = 0;
        this.seenSince = 0;       // when the current uninterrupted sight of the target began
        this.lastSeenPos = null;
        this.lastSeenAt = -Infinity;
        this.peripheralSince = new Map(); // player id -> when it entered peripheral vision
        this.attacker = null;
        this.attackerUntil = -Infinity;
        this.followFocus = false;
        this.followFocusAt = -Infinity;

        // aim
        this.errYaw = 0; this.errPitch = 0;
        this.errTargetYaw = 0; this.errTargetPitch = 0;
        this.errResampleAt = 0;
        this.flinchYaw = 0; this.flinchPitch = 0;
        this.fireHoldUntil = -Infinity;
        this.missing = false; this.missDirYaw = 1; this.missDirPitch = 0; this.missScale = 1;

        // fire control
        this.burstFired = 0;
        this.burstPauseUntil = 0;
        this.lastRounds = null;
        this.lastWeaponIdx = null;
        this.actionCooldownUntil = 0;

        // movement
        this.strafeDir = this.rng() < 0.5 ? -1 : 1;
        this.strafeMode = 'move';
        this.strafeSegEnd = 0;

        // survival
        this.hpLast = null;
        this.lastHurtAt = -Infinity;
        this.cover = null;
        this.coverCooldownUntil = 0;
        this.peekUntil = 0;
        this.retreating = false;
        this.friends = [];        // nearby friendly bots, refreshed each scan (spacing)

        // pickups
        this.crate = null;        // nearest reachable ammo crate, refreshed in scan()
        this.medkit = null;       // nearest reachable health pack, refreshed in scan()
        this.unreachable = new Map(); // pickup/cover key -> time until which it's ignored

        // hearing
        this.soundCursor = this.sounds ? this.sounds.cursor : 0;
        this.investigate = null;

        // grenades
        this.grenadeLock = null;
        this.grenadeCooldownUntil = 0;

        this.rollMiss();
    }

    // Each bot gets its own slight differences, so a group of identical presets doesn't behave
    // identically. Scales with the `variance` option; 0 leaves the options exactly as given.
    applyVariance(o) {
        const v = o.variance;
        if (!v) return o;
        const j = (spread) => 1 + v * spread * (2 * this.rng() - 1);
        o.reactionTime *= j(0.35);
        o.turnRateDeg *= j(0.3);
        o.aimErrorDeg *= j(0.4);
        o.fireConeDeg *= j(0.25);
        o.burstPause *= j(0.4);
        o.sightRange *= j(0.2);
        o.hearingRange *= j(0.25);
        o.memoryTime *= j(0.3);
        o.strafeInterval *= j(0.3);
        if (o.speed !== null) o.speed = Math.max(0.1, o.speed * j(0.2));
        o.aggression = clamp01(o.aggression + v * 0.3 * (2 * this.rng() - 1));
        return o;
    }

    reset() {
        this.target = null;
        this.targetVisible = false;
        this.lastSeenPos = null;
        this.lastSeenAt = -Infinity;
        this.burstFired = 0;
        this.burstPauseUntil = 0;
        this.lastRounds = null;
        this.crate = null;
        this.medkit = null;
        this.cover = null;
        this.investigate = null;
        this.attacker = null;
        this.grenadeLock = null;
        this.hpLast = null;
        this.flinchYaw = this.flinchPitch = 0;
        this.peripheralSince.clear();
    }

    setOwner(owner) { this.owner = owner; }

    // --- small helpers ---------------------------------------------------------------------

    hpFraction() {
        const hp = this.player.hp;
        return hp === undefined || hp === null ? 1 : clamp01(hp / 100);
    }

    // Health fraction below which the bot retreats: cautious bots retreat earlier, aggressive later.
    retreatThreshold() {
        return clamp01(this.opts.retreatBelow * (1.4 - 0.8 * this.aggr));
    }

    pickupKey(c) { return `${Math.floor(c.x)},${Math.floor(c.y)},${Math.floor(c.z)}`; }

    isUnreachable(c) {
        const until = this.unreachable.get(this.pickupKey(c));
        return until !== undefined && until > this.time;
    }

    // Called by the bot when pathfinding to a pickup or cover spot failed, so the next scan tries a
    // different one instead of standing around staring at somewhere it can't reach.
    markUnreachable(c, seconds = 10) {
        const key = this.pickupKey(c);
        if (!this.unreachable.has(key) || this.unreachable.get(key) <= this.time) this.unreachable.set(key, this.time + seconds);
        if (this.crate && this.pickupKey(this.crate) === key) this.crate = null;
        if (this.medkit && this.pickupKey(this.medkit) === key) this.medkit = null;
        if (this.cover && this.pickupKey(this.cover.spot) === key) this.cover = null;
    }

    // --- perception ------------------------------------------------------------------------

    eyePos(p = this.player) {
        const scale = p.modifiers?.scale ?? 1;
        return { x: p.x, y: p.y - 0.06 + 0.4 * scale, z: p.z };
    }

    bodyPos(p) {
        const src = p.predicted ?? p;
        const scale = p.modifiers?.scale ?? 1;
        return { x: src.x, y: src.y + BODY_OFFSET * scale, z: src.z };
    }

    isFriendly(other) {
        if (other === this.owner) return true;
        if (other.team !== 0 && other.team === this.player.team) return true;
        return false;
    }

    // Would `other` count as an enemy if it were alive and in play? (Used for sounds, whose source
    // may already be dead by the time we react.)
    isHostile(other) {
        if (!other || other === this.player || this.isFriendly(other)) return false;
        const human = other.client ? other.client.isHuman : true;
        if (this.targetsFilter === 'humans' && !human) return false;
        if (this.targetsFilter === 'bots' && human) return false;
        return true;
    }

    isValidTarget(other) {
        return !!other && !!other.playing && this.isHostile(other);
    }

    // Can the bot see `other` right now? In range and unobstructed - the field of view is judged
    // separately in awareOf(), since being able to see something and having noticed it differ.
    canSee(other) {
        const eye = this.eyePos();
        const body = this.bodyPos(other);
        const d = Math.hypot(body.x - eye.x, body.y - eye.y, body.z - eye.z);
        if (d > this.opts.sightRange) return false;
        if (this.perf) this.perf.count('los');
        return hasLineOfSight(this.map, eye, body);
    }

    // Has the bot NOTICED `other`? Things in the focus cone are noticed immediately; things in the
    // wider peripheral cone only after peripheralDelay of staying there; anything outside that (or
    // hidden) isn't noticed at all. `alreadyTracking` skips the delay for a target it's already on.
    awareOf(other, alreadyTracking = false) {
        if (!this.canSee(other)) { this.peripheralSince.delete(other.id); return false; };
        if (this.fov >= TWO_PI - 1e-6) return true;
        const a = anglesTo(this.eyePos(), this.bodyPos(other));
        const off = Math.abs(angleDiff(this.player.yaw, a.yaw));
        if (off <= this.fov / 2) { this.peripheralSince.delete(other.id); return true; };
        if (off > this.peripheral / 2) { this.peripheralSince.delete(other.id); return false; };
        if (alreadyTracking) return true;
        const since = this.peripheralSince.get(other.id) ?? this.time;
        this.peripheralSince.set(other.id, since);
        return this.time - since >= this.opts.peripheralDelay;
    }

    // What the squad is currently focused on: enemies share whatever a squadmate is fighting;
    // an ally goes for whatever their owner is aiming at.
    focusTarget() {
        if (this.opts.role === 'ally') return this.ownerAimTarget();
        const s = this.squad;
        if (!s || !s.focus || this.now() > s.until || !this.isValidTarget(s.focus)) return null;
        return s.focus;
    }

    ownerAimTarget() {
        const owner = this.owner;
        if (!owner || !owner.playing || owner.yaw === undefined) return null;
        const eye = this.eyePos(owner);
        const aim = dirFromAngles(owner.yaw, owner.pitch ?? 0);
        let best = null, bestAngle = Infinity;
        this.iteratePlayers((other) => {
            if (!this.isValidTarget(other)) return;
            const body = this.bodyPos(other);
            const v = { x: body.x - eye.x, y: body.y - eye.y, z: body.z - eye.z };
            const d = Math.hypot(v.x, v.y, v.z);
            if (d < 1 || d > 60) return;
            const angle = angleBetweenDirs(aim, { x: v.x / d, y: v.y / d, z: v.z / d });
            if (angle > 0.1 + Math.atan(0.5 / d) || angle >= bestAngle) return;
            if (this.perf) this.perf.count('los');
            if (!hasLineOfSight(this.map, eye, body)) return;
            best = other; bestAngle = angle;
        });
        return best;
    }

    needsRestock() {
        if (!this.opts.restock || !this.getPickups) return false;
        const ws = this.player.weapons;
        if (!ws || !ws.length) return false;
        return ws.every((w) => w && w.ammo && w.ammo.rounds + w.ammo.store <= 0);
    }

    wantsHealth() {
        return this.opts.healthPacks && !!this.getPickups && this.hpFraction() < Math.min(1, this.retreatThreshold() + 0.15);
    }

    // Nearest active pickup of `kind` within restockRange (height counts double: a pickup on
    // another level is a longer trip than it looks), skipping ones it already failed to reach.
    findPickup(kind) {
        const p = this.player;
        let best = null, bestScore = this.opts.restockRange;
        for (const c of this.getPickups(kind)) {
            if (this.isUnreachable(c)) continue;
            const score = Math.hypot(c.x - p.x, c.z - p.z) + Math.abs(c.y - p.y) * 2;
            if (score < bestScore) { best = c; bestScore = score; };
        };
        return best;
    }

    scan() {
        const p = this.player, o = this.opts;
        this.crate = this.needsRestock() ? this.findPickup('AMMO') : null;
        this.medkit = this.wantsHealth() ? this.findPickup('HEALTH') : null;

        // Friendly bots nearby, for spacing.
        this.friends.length = 0;
        if (o.spacing > 0) {
            this.iteratePlayers((other) => {
                if (other === p || !other.playing || !this.isFriendly(other) || (other.client && other.client.isHuman)) return;
                if (Math.hypot(other.x - p.x, other.z - p.z) < 6) this.friends.push(other);
            });
        };

        if (this.time - this.followFocusAt > 3) {
            this.followFocus = this.rng() < o.focusFire;
            this.followFocusAt = this.time;
        };

        const eye = this.eyePos();
        const dist = (q) => { const b = this.bodyPos(q); return Math.hypot(b.x - eye.x, b.y - eye.y, b.z - eye.z); };
        const focus = this.followFocus ? this.focusTarget() : null;
        const attackerLive = this.attacker && this.time < this.attackerUntil && this.isValidTarget(this.attacker) ? this.attacker : null;
        // Lower score = more attractive. Whoever just hurt us, and the squad's focus, pull harder than raw distance.
        const score = (q) => dist(q) * (q === attackerLive ? 0.4 : q === focus ? 0.6 : 1);

        if (this.target && !this.isValidTarget(this.target)) { this.target = null; this.targetVisible = false; };
        const currentVisible = this.target ? this.awareOf(this.target, true) : false;

        let best = null, bestScore = Infinity;
        const considerSwitch = !this.target || !currentVisible || (this.time - this.targetSince) >= o.targetSwitchDelay;
        if (considerSwitch) {
            this.iteratePlayers((other) => {
                if (!this.isValidTarget(other) || other === this.target) return;
                const sc = score(other);
                if (sc >= bestScore || dist(other) > o.sightRange) return;
                if (!this.awareOf(other)) return;
                best = other; bestScore = sc;
            });
        };

        if (best && (!this.target || !currentVisible || bestScore < score(this.target) * 0.6)) {
            this.target = best;
            this.targetSince = this.time;
            this.targetVisible = true;
            this.seenSince = this.time;
            this.burstFired = 0;
            this.rollMiss();
        } else if (this.target) {
            if (currentVisible && !this.targetVisible) this.seenSince = this.time;
            this.targetVisible = currentVisible;
        };

        if (this.target && this.targetVisible) {
            const src = this.target.predicted ?? this.target;
            this.lastSeenPos = { x: src.x, y: src.y, z: src.z };
            this.lastSeenAt = this.time;
            this.investigate = null; // seeing it beats hearing it
            this.postSquadFocus();
        } else if (this.target && this.time - this.lastSeenAt > o.memoryTime * lerp(0.7, 1.5, this.aggr)) {
            this.target = null;
            this.targetVisible = false;
        };
    }

    postSquadFocus() {
        const s = this.squad;
        if (!s || this.opts.role === 'ally') return;
        if (this.time - this.seenSince < 0.5) return;
        const now = this.now();
        if (!s.focus || now > s.until || !this.isValidTarget(s.focus) || s.focus === this.target) {
            s.focus = this.target;
            s.until = now + 5;
        };
    }

    // --- hearing ---------------------------------------------------------------------------

    // Gunshots, grenade throws and explosions from anyone hostile, within hearingRange (scaled by
    // how loud each is), make an idle bot go and look - at the sound's position, off by a margin
    // that grows with distance, since you can't pinpoint a far-off bang. They never reveal where
    // anyone actually is, and a bot already fighting something it can see ignores them.
    pollSounds() {
        const o = this.opts;
        if (!this.sounds || o.hearingRange <= 0) return;
        this.sounds.poll();
        const events = this.sounds.since(this.soundCursor);
        this.soundCursor = this.sounds.cursor;
        if (!events.length) return;

        const p = this.player;
        let best = null, bestRatio = Infinity;
        for (const ev of events) {
            if (ev.source === p || (ev.source && !this.isHostile(ev.source))) continue;
            const d = Math.hypot(ev.x - p.x, ev.y - p.y, ev.z - p.z);
            const range = o.hearingRange * ev.loud;
            if (d > range) continue;
            const ratio = d / range;
            if (ratio < bestRatio) { best = ev; bestRatio = ratio; best.dist = d; };
        };
        if (!best || (this.target && this.targetVisible) || this.cover) return;

        const err = Math.min(6, best.dist * 0.12);
        this.investigate = {
            x: best.x + gaussian(this.rng) * err * 0.5,
            y: best.y,
            z: best.z + gaussian(this.rng) * err * 0.5,
            until: this.time + Math.max(3, Math.min(12, o.memoryTime * 2)),
        };
    }

    // --- being hit -------------------------------------------------------------------------

    // Notices health dropping and reacts a little: the aim is knocked off by `flinch`, the next
    // shot is delayed a touch, whoever did it becomes a priority (and is investigated if unseen),
    // and a strafing bot may dodge the other way. Kept subtle on purpose.
    trackHealth(dt) {
        const o = this.opts, p = this.player;
        const k = Math.exp(-dt / 0.18);
        this.flinchYaw *= k; this.flinchPitch *= k;

        const hp = p.hp;
        if (hp === undefined || hp === null) return;
        const drop = this.hpLast === null ? 0 : this.hpLast - hp;
        this.hpLast = hp;
        if (drop <= 1.2) return;

        this.lastHurtAt = this.time;
        if (o.flinch > 0) {
            const mag = toRad(3.5) * o.flinch * Math.min(1.2, 0.4 + drop / 30);
            const ang = this.rng() * TWO_PI;
            this.flinchYaw += Math.cos(ang) * mag;
            this.flinchPitch += Math.sin(ang) * mag * 0.7;
            this.fireHoldUntil = Math.max(this.fireHoldUntil, this.time + 0.1 * o.flinch);
        };
        if (o.strafeVariance > 0.1 && this.strafeMode === 'move' && this.rng() < 0.4 + 0.5 * o.strafeVariance) {
            this.strafeDir = -this.strafeDir;
            this.strafeSegEnd = this.time + o.strafeInterval * 0.7;
        };

        const a = p.firedPlayer;
        if (a && a !== p && this.isHostile(a)) {
            this.attacker = a;
            this.attackerUntil = this.time + 5;
            if (!(this.target && this.targetVisible) && a.playing) {
                const src = a.predicted ?? a;
                const err = Math.min(5, Math.hypot(src.x - p.x, src.z - p.z) * 0.15);
                this.investigate = { x: src.x + gaussian(this.rng) * err * 0.5, y: src.y, z: src.z + gaussian(this.rng) * err * 0.5, until: this.time + 6 };
            };
        };
    }

    // --- decision --------------------------------------------------------------------------

    // Advances the controller by `dt` seconds and returns what the bot wants this tick:
    // {
    //   engaged,                  // true => caller should NOT run followPath this tick
    //   yaw, pitch,               // aim to set (only meaningful when engaged)
    //   controls,                 // CONTROL bitmask to set (engaged only)
    //   fire, jump,               // convenience flags, already folded into `controls`
    //   reload, swap,             // true / weapon index to swap to, or null
    //   grenade,                  // throw power (0..1) to pass to player.queueGrenade(), or null
    //   moveTo,                   // {x,y,z} the caller should path toward when not engaged, or null
    //   state,                    // 'idle' | 'engage' | 'search' | 'investigate' | 'follow' | 'hunt' |
    //                             // 'restock' | 'heal' | 'cover' | 'hold' | 'throw' (for debugging)
    // }
    update(dt) {
        const o = this.opts;
        const p = this.player;
        this.time += dt;
        this.dt = dt;

        const cmd = { engaged: false, yaw: p.yaw, pitch: p.pitch, controls: 0, fire: false, jump: false, reload: false, swap: null, grenade: null, moveTo: null, state: 'idle' };
        if (!p.playing) { this.reset(); return cmd; };

        this.trackHealth(dt);
        this.pollSounds();
        this.scanTimer -= dt;
        if (this.scanTimer <= 0) {
            this.scan();
            this.scanTimer = 0.15;
        };
        this.trackAmmo();
        this.retreating = this.hpFraction() < this.retreatThreshold();

        // Mid-throw: the real throw happens ~0.3s after queueing, using whatever yaw/pitch the
        // player has THEN, so hold the aim dead still until it's gone.
        if (this.grenadeLock) {
            const g = this.grenadeLock;
            if (this.time < g.until && (this.time < g.minUntil || (p.grenadesQueued ?? 0) > 0)) {
                cmd.engaged = true; cmd.state = 'throw'; cmd.yaw = g.yaw; cmd.pitch = g.pitch;
                return cmd;
            };
            this.grenadeLock = null;
        };

        if (this.cover) { const r = this.coverTick(cmd, dt); if (r) return r; };
        if (!this.cover && this.maybeEnterCover()) { const r = this.coverTick(cmd, dt); if (r) return r; };

        // Completely out of ammo: fetching a crate beats standing in a firefight with empty guns.
        if (this.crate && this.needsRestock()) return this.fetchMove(cmd, this.crate, 'restock');
        // Hurt and nothing in sight: grab a health pack rather than waiting to regenerate.
        if (this.medkit && this.wantsHealth() && !this.targetVisible) return this.fetchMove(cmd, this.medkit, 'heal');

        if (this.target && this.targetVisible) return this.engage(cmd, dt);

        // Not engaged: housekeeping (reload / preferred weapon) and a movement goal.
        this.housekeeping(cmd, false);

        const searching = this.target && this.lastSeenPos && this.time - this.lastSeenAt <= o.memoryTime * lerp(0.7, 1.5, this.aggr);
        if (searching && this.tryGrenade(cmd, this.lastSeenPos, false)) return cmd;

        if (searching) {
            cmd.state = 'search';
            cmd.moveTo = this.lastSeenPos;
        } else if (this.investigate && this.time < this.investigate.until) {
            const inv = this.investigate;
            if (Math.hypot(inv.x - p.x, inv.z - p.z) < 2.5) this.investigate = null;
            else { cmd.state = 'investigate'; cmd.moveTo = { x: inv.x, y: inv.y, z: inv.z }; };
        } else if (o.role === 'ally') {
            if (this.owner && this.owner.playing) {
                const d = Math.hypot(this.owner.x - p.x, this.owner.z - p.z);
                const dy = Math.abs(this.owner.y - p.y);
                if (d > o.followDistance || dy > 2.5) {
                    cmd.state = 'follow';
                    cmd.moveTo = this.spreadGoal(this.owner.predicted ?? this.owner, o.followDistance * 0.6);
                };
            };
        } else {
            const prey = this.nearestHostile(o.huntRange);
            if (prey) { cmd.state = 'hunt'; cmd.moveTo = this.spreadGoal(prey.predicted ?? prey, 2.5); };
        };
        return cmd;
    }

    nearestHostile(range) {
        let best = null, bestD = range;
        this.iteratePlayers((other) => {
            if (!this.isValidTarget(other)) return;
            const s = other.predicted ?? other;
            const d = Math.hypot(s.x - this.player.x, s.y - this.player.y, s.z - this.player.z);
            if (d < bestD) { best = other; bestD = d; };
        });
        return best;
    }

    // Is (x, y, z) a free cell with solid ground below it - somewhere a bot could actually stand?
    groundedAt(x, y, z) {
        if (!this.map || !this.map.data) return true;
        const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
        const here = cellAtSafe(this.map, fx, fy, fz), head = cellAtSafe(this.map, fx, fy + 1, fz), below = cellAtSafe(this.map, fx, fy - 1, fz);
        return !isBlockingCell(here) && !isBlockingCell(head) && isBlockingCell(below) && !isRampCell(below) && !isLadderCell(below);
    }

    // Spacing: when several bots head for the same thing, each aims for its own spot around it
    // (a stable angle per bot) instead of all piling onto one point. Only used when that spot is
    // somewhere a bot can stand; otherwise it falls back to the real position.
    spreadGoal(goal, radius) {
        const o = this.opts;
        if (o.spacing <= 0 || radius <= 0) return goal;
        const r = radius * o.spacing;
        const x = goal.x + Math.cos(this.slot) * r, z = goal.z + Math.sin(this.slot) * r;
        return this.groundedAt(x, goal.y, z) ? { x, y: goal.y, z } : goal;
    }

    // --- pickups ---------------------------------------------------------------------------

    // Heads for a pickup. Far away it hands the destination to the pathfinder; once close it walks
    // straight at it, since the server only collects an item when the player is within its
    // half-block cell (player.js: round(x*2)/2 == item.x) - tighter than the path follower's
    // arrival radius, which could otherwise stop just short and never pick it up.
    fetchMove(cmd, item, state) {
        const p = this.player;
        cmd.state = state;
        const dx = item.x - p.x, dz = item.z - p.z;
        const flat = Math.hypot(dx, dz);
        if (flat < 1.5 && Math.abs(item.y - p.y) < 1.2 && hasGroundAhead(this.map, p.x, p.y, p.z, dx, dz, { reach: Math.min(0.9, flat) })) {
            cmd.engaged = true;
            cmd.yaw = Math.atan2(dx, dz);
            cmd.pitch = 0;
            cmd.controls = CONTROL_BITS.up;
            return cmd;
        };
        cmd.moveTo = { x: item.x, y: item.y, z: item.z };
        return cmd;
    }

    // --- cover -----------------------------------------------------------------------------

    // Where the bot thinks the threat is, as an eye-height position: the target if visible, else
    // where it was last seen, else whoever just shot it.
    threatPos() {
        if (this.target && this.targetVisible) return this.eyePos(this.target.predicted ? { ...this.target.predicted, modifiers: this.target.modifiers } : this.target);
        if (this.lastSeenPos && this.time - this.lastSeenAt < 5) return { x: this.lastSeenPos.x, y: this.lastSeenPos.y + 0.34, z: this.lastSeenPos.z };
        if (this.attacker && this.time < this.attackerUntil && this.attacker.playing) return this.eyePos(this.attacker);
        return null;
    }

    weaponReady() {
        const w = this.player.weapon;
        if (!w || !w.ammo) return true;
        return w.ammo.rounds >= w.ammo.capacity * 0.8 || w.ammo.store <= 0;
    }

    // Decides whether to duck behind cover now: when badly hurt, or out of rounds with an enemy
    // around and nothing else usable to switch to. Rolled at most every few seconds, weighted by
    // useCover and aggression. Returns true if it entered cover.
    maybeEnterCover() {
        const o = this.opts, p = this.player;
        if (o.useCover <= 0 || this.time < this.coverCooldownUntil || this.time < this.peekUntil) return false;
        const threat = this.threatPos();
        if (!threat) return false;

        let reason = null;
        if (this.hpFraction() < this.retreatThreshold()) reason = 'hurt';
        else if (this.target && this.targetVisible && p.weapon?.ammo && p.weapon.ammo.rounds <= 0 && p.weapon.ammo.store > 0 && o.autoReload) {
            const other = p.weapons?.[p.weaponIdx === 0 ? 1 : 0];
            if (!(o.autoSwap && other && other.ammo && other.ammo.rounds > 0)) reason = 'reload';
        };
        if (!reason) return false;

        this.coverCooldownUntil = this.time + 3;
        if (this.rng() > clamp01(o.useCover * (1.3 - 0.8 * this.aggr))) return false;
        if (this.perf) this.perf.count('findCover');
        const spot = findCover(this.map, p, threat, { radius: 10, isExcluded: (s) => this.isUnreachable(s) });
        if (!spot) return false;

        const patience = 1.4 - 0.8 * this.aggr;
        this.cover = {
            spot, reason, since: this.time, switches: 0, recheckAt: this.time + 1.5,
            minTime: (reason === 'hurt' ? 2 : 0.8) * patience,
            maxTime: o.coverMaxTime * (1.2 - 0.4 * this.aggr),
        };
        return true;
    }

    // One tick of being in cover. Goes to the spot, holds it facing the threat while reloading or
    // recovering (collecting a health pack if there's one about), then leaves it - after which
    // the normal "search" behavior walks it back out to the last known position: the peek.
    // Returns the command, or null once it has finished with cover.
    coverTick(cmd, dt) {
        const o = this.opts, p = this.player, c = this.cover;
        const elapsed = this.time - c.since;
        const hurt = c.reason === 'hurt';
        const ready = hurt ? this.hpFraction() >= o.resumeAbove : this.weaponReady();
        if (elapsed >= c.maxTime || (ready && elapsed >= c.minTime)) {
            this.cover = null;
            this.coverCooldownUntil = this.time + 4;
            this.peekUntil = this.time + 2;
            return null;
        };

        // Spotted while hiding: the spot was no good. Look for another once or twice, then fight on.
        if (this.target && this.targetVisible && elapsed > 0.6 && this.time >= c.recheckAt) {
            c.recheckAt = this.time + 1.5;
            const threat = this.threatPos();
            if (this.perf && threat && c.switches < 2) this.perf.count('findCover');
            const alt = threat && c.switches < 2 ? findCover(this.map, p, threat, { radius: 10, isExcluded: (s) => this.isUnreachable(s) }) : null;
            if (alt) { c.spot = alt; c.switches++; }
            else if (!hurt) { this.cover = null; this.coverCooldownUntil = this.time + 4; return null; };
        };

        if (hurt && o.healthPacks && this.medkit && !this.targetVisible) {
            this.housekeeping(cmd, false);
            return this.fetchMove(cmd, this.medkit, 'heal');
        };

        const spot = c.spot;
        const flat = Math.hypot(spot.x - p.x, spot.z - p.z);
        this.housekeeping(cmd, false);
        if (flat > 0.8 || Math.abs(spot.y - p.y) > 1.2) {
            cmd.state = 'cover';
            cmd.moveTo = { x: spot.x, y: spot.y, z: spot.z };
            return cmd;
        };

        cmd.state = 'hold';
        cmd.engaged = true;
        const threat = this.threatPos();
        if (threat) {
            const a = anglesTo(this.eyePos(), threat);
            cmd.yaw = stepAngle(p.yaw, a.yaw, this.turnRate * dt);
            cmd.pitch = p.pitch;
        };
        return cmd;
    }

    // --- grenades --------------------------------------------------------------------------

    // Maybe lobs a grenade at `pos` (a visible target, or where a hidden one was last seen).
    // Only within the range a grenade can actually be thrown (about 3-8 blocks on the level - and
    // never closer than the blast radius), when it has one, isn't busy, and the arc solves
    // cleanly around the map. Returns true and fills `cmd` (aim locked, power set) if it throws.
    tryGrenade(cmd, pos, visible) {
        const o = this.opts, p = this.player;
        if (o.grenades <= 0 || !((p.grenadeCount ?? 0) > 0) || (p.grenadeCountdown ?? 0) > 0 || (p.grenadesQueued ?? 0) > 0) return false;
        if (this.time < this.grenadeCooldownUntil || p.reloadCountdown > 0 || p.swapWeaponCountdown > 0) return false;
        const d = Math.hypot(pos.x - p.x, pos.y - p.y, pos.z - p.z);
        if (d < 4 || d > 8.5) return false;
        if (this.rng() >= o.grenades * (visible ? 0.5 : 0.3) * (this.dt ?? 1 / 60)) return false;

        const mod = p.modifiers?.grenadeThrowModifier ?? 1;
        if (this.perf) this.perf.count('grenade.solve');
        const solved = solveGrenadeThrow(this.map, { x: p.x, y: p.y, z: p.z }, { x: pos.x, y: pos.y, z: pos.z }, { throwModifier: mod, scale: p.modifiers?.scale ?? 1 });
        this.grenadeCooldownUntil = this.time + (solved ? 6 + this.rng() * 4 : 1.5);
        if (!solved) return false;

        // Nobody throws perfectly: wobble the aim and the power by the bot's own accuracy.
        const wobble = Math.max(this.aimError, toRad(1)) * 1.2;
        const yaw = solved.yaw + gaussian(this.rng) * wobble;
        const pitch = solved.pitch + gaussian(this.rng) * wobble * 0.6;
        const power = Math.max(0.2, Math.min(1, solved.power * (1 + gaussian(this.rng) * 0.04 * (1.5 - o.skill))));

        this.grenadeLock = { yaw, pitch, minUntil: this.time + 0.45, until: this.time + 1.2 };
        cmd.engaged = true;
        cmd.state = 'throw';
        cmd.yaw = yaw;
        cmd.pitch = pitch;
        cmd.controls = 0;
        cmd.grenade = power;
        return true;
    }

    // --- weapons ---------------------------------------------------------------------------

    trackAmmo() {
        const w = this.player.weapon;
        if (!w || !w.ammo) return;
        const idx = this.player.weaponIdx;
        if (idx === this.lastWeaponIdx && this.lastRounds !== null && w.ammo.rounds < this.lastRounds) {
            const shots = this.lastRounds - w.ammo.rounds;
            this.burstFired += shots;
            this.rollMiss(); // every shot gets a fresh chance to be a deliberate miss
        };
        this.lastWeaponIdx = idx;
        this.lastRounds = w.ammo.rounds;
        if (this.opts.burstShots > 0 && this.burstFired >= this.opts.burstShots) {
            this.burstFired = 0;
            this.burstPauseUntil = this.time + this.opts.burstPause;
        };
    }

    // Decides whether the NEXT shot is a deliberate miss, and in which direction. The offset's
    // size is applied in engage() (it has to be at least enough to clear the target's body at
    // that distance, or a "miss" at point-blank range would still hit).
    rollMiss() {
        this.missing = this.opts.missChance > 0 && this.rng() < this.opts.missChance;
        const angle = this.rng() * TWO_PI;
        this.missDirYaw = Math.cos(angle);
        this.missDirPitch = Math.sin(angle) * 0.7;
        this.missScale = 0.6 + this.rng() * 0.8;
    }

    // Effective distances for the weapon in hand: whatever the user set explicitly, else derived
    // from the weapon itself (see weaponProfile()), then stretched or squeezed by aggression
    // (aggressive bots fight closer, cautious ones keep their distance).
    rangesFor(profile) {
        const o = this.opts;
        const scale = o.preferredRangeMin === null && o.preferredRangeMax === null ? lerp(1.35, 0.65, this.aggr) : 1;
        const prefMin = (o.preferredRangeMin ?? profile.prefMin) * scale;
        return {
            minFire: o.minFireRange,
            maxFire: o.maxFireRange ?? profile.maxFire,
            prefMin,
            prefMax: Math.max((o.preferredRangeMax ?? profile.prefMax) * scale, prefMin),
        };
    }

    // Reload / weapon-preference logic shared by engaged and idle ticks. Rate limited because the
    // underlying player.reload()/swapWeapon() silently no-op while a previous one is in flight.
    // `dist` (engaged only) lets the bot swap to whichever of its two weapons suits the range.
    housekeeping(cmd, engaged, dist) {
        const o = this.opts, p = this.player, w = p.weapon;
        if (!w || !w.ammo || this.time < this.actionCooldownUntil) return;
        if (p.reloadCountdown > 0 || p.swapWeaponCountdown > 0) return;

        const rounds = w.ammo.rounds, cap = w.ammo.capacity, store = w.ammo.store;
        const empty = rounds <= 0;
        const otherIdx = p.weaponIdx === 0 ? 1 : 0;
        const other = p.weapons?.[otherIdx];

        if (empty && o.autoSwap && engaged) {
            if (other && other.ammo && other.ammo.rounds > 0) {
                cmd.swap = otherIdx;
                this.actionCooldownUntil = this.time + 0.6;
                return;
            };
        };
        if (o.autoReload && store > 0 && rounds < cap && (empty || (!engaged && rounds / cap < o.reloadBelow))) {
            cmd.reload = true;
            this.actionCooldownUntil = this.time + 0.6;
            return;
        };

        // Use the weapon that suits the distance: a sniper or rocket launcher is no good at
        // point-blank range, a shotgun or pistol no good across the map. Hysteresis comes from the
        // "other weapon must be clearly better" rule plus a long cooldown after any such swap.
        if (engaged && dist !== undefined && o.autoSwap && o.weapon === 'auto' && other && other.ammo && other.ammo.rounds > 0) {
            const cur = weaponProfile(w.subClass), alt = weaponProfile(other.subClass);
            const gap = (prof) => dist < prof.prefMin ? prof.prefMin - dist : dist > prof.prefMax ? dist - prof.prefMax : 0;
            const usable = (prof) => dist <= prof.maxFire && dist >= prof.minUseful;
            const curGap = gap(cur), altGap = gap(alt);
            // "Badly placed": well inside the weapon's comfortable minimum, or far past its comfortable maximum.
            const curBad = dist < cur.prefMin ? curGap > cur.prefMin * 0.5 : curGap > cur.maxFire * 0.25;
            if ((!usable(cur) && usable(alt)) || (usable(alt) && curBad && altGap <= curGap * 0.6)) {
                cmd.swap = otherIdx;
                this.actionCooldownUntil = this.time + 1.5;
                return;
            };
        };

        if (!engaged && o.weapon !== 'auto') {
            const want = o.weapon === 'primary' ? 0 : 1;
            if (p.weaponIdx !== want && p.weapons?.[want]) {
                cmd.swap = want;
                this.actionCooldownUntil = this.time + 0.6;
            };
        };
    }

    // --- engaged ---------------------------------------------------------------------------

    // One tick of strafing: a plan of "move left/right" and "pause" segments. With strafeVariance 0
    // that's a plain metronome (flip every strafeInterval); higher values vary the timing, stop to
    // take shots, and sometimes keep going the same way, so it's hard to read.
    strafeStep() {
        const o = this.opts, v = o.strafeVariance;
        if (this.time >= this.strafeSegEnd) {
            if (this.strafeMode === 'move' && this.rng() < v * 0.3) {
                this.strafeMode = 'pause';
                this.strafeSegEnd = this.time + 0.15 + this.rng() * 0.3 * (0.5 + v);
            } else {
                this.strafeMode = 'move';
                if (!(this.rng() < v * 0.25)) this.strafeDir = -this.strafeDir;
                this.strafeSegEnd = this.time + o.strafeInterval * (1 + v * (2 * this.rng() - 1) * 0.7);
            };
        };
        return this.strafeMode === 'pause' ? 0 : this.strafeDir;
    }

    engage(cmd, dt) {
        const o = this.opts, p = this.player;
        cmd.engaged = true;
        cmd.state = 'engage';

        const eye = this.eyePos();
        const body = this.bodyPos(this.target);
        const truth = anglesTo(eye, body);
        const dist = truth.distance;
        const profile = weaponProfile(p.weapon?.subClass);
        const ranges = this.rangesFor(profile);
        const t = this.target;

        // A grenade, if the situation suits one.
        if (this.tryGrenade(cmd, { x: body.x, y: t.y ?? body.y, z: body.z }, true)) return cmd;

        // Lead: shift the aim point by the target's per-tick displacement over the projectile's
        // flight time (speed comes from the weapon - a rocket is far slower than a bullet; the
        // target's own speed modifier scales how far each tick of its velocity actually carries it).
        let aimPoint = { x: body.x, y: body.y, z: body.z };
        if (o.leadFactor > 0) {
            const speed = Math.max(0.05, profile.speed * (p.modifiers?.bulletSpeedModifier ?? 1));
            const ticks = Math.min(120, dist / speed);
            const tm = t.modifiers?.speedModifier ?? 1;
            aimPoint.x += (t.dx ?? 0) * tm * ticks * o.leadFactor;
            aimPoint.z += (t.dz ?? 0) * tm * ticks * o.leadFactor;
        };
        // Splash weapons are better aimed at the feet: hits the floor under them if it misses.
        if (profile.explosive) aimPoint.y -= 0.25;

        // Aim wobble: low-frequency noise that grows with distance - and with how much the bot
        // and its target are moving - so it reads as "can't hold steady" rather than per-tick
        // jitter (which would just average out in a burst).
        if (this.time >= this.errResampleAt) {
            const botSpeed = Math.hypot(p.dx ?? 0, p.dz ?? 0) / WALK_SPEED;
            const tgtSpeed = Math.hypot(t.dx ?? 0, t.dz ?? 0) / WALK_SPEED;
            const moving = 1 + o.movePenalty * Math.min(1.5, botSpeed * 0.8 + tgtSpeed * 0.35);
            const scale = this.aimError * (0.5 + 0.5 * dist / o.aimErrorRefDistance) * moving;
            this.errTargetYaw = gaussian(this.rng) * scale;
            this.errTargetPitch = gaussian(this.rng) * scale * 0.6;
            this.errResampleAt = this.time + 0.2;
        };
        const k = Math.min(1, dt / 0.1);
        this.errYaw += (this.errTargetYaw - this.errYaw) * k;
        this.errPitch += (this.errTargetPitch - this.errPitch) * k;

        // Deliberate miss: aim off the target by at least enough to clear its body at this range.
        let missYaw = 0, missPitch = 0, missMag = 0;
        if (this.missing) {
            missMag = Math.max(toRad(o.missAngleDeg) * this.missScale, Math.atan(0.7 / Math.max(dist, 0.5)));
            missYaw = this.missDirYaw * missMag;
            missPitch = this.missDirPitch * missMag;
        };

        const desired = anglesTo(eye, aimPoint);
        const wantYaw = desired.yaw + this.errYaw + missYaw + this.flinchYaw;
        const wantPitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, desired.pitch + this.errPitch + missPitch + this.flinchPitch));
        const maxStep = this.turnRate * dt;
        cmd.yaw = stepAngle(p.yaw, wantYaw, maxStep);
        cmd.pitch = stepAngle(p.pitch, wantPitch, maxStep);

        // Fire decision, judged against where the target REALLY is (not the noisy aim point) with
        // the cone widened to at least the target's apparent size, so close targets are never
        // un-shootable just because a tight cone is smaller than their body. A deliberate miss
        // widens it by the miss size - the bot still pulls the trigger, it just aimed wide.
        const aimDir = dirFromAngles(cmd.yaw, cmd.pitch);
        const trueDir = dirFromAngles(truth.yaw, truth.pitch);
        const off = angleBetweenDirs(aimDir, trueDir);
        const cone = Math.max(this.fireCone, Math.atan(0.35 / Math.max(dist, 0.5))) + missMag * 1.3;
        // A deliberate miss only fires once the aim has actually settled on its wide point - while
        // swinging over to it (e.g. from the previous shot's opposite offset) the aim sweeps right
        // across the target, and firing then would hit it.
        const onMark = !this.missing || angleBetweenDirs(aimDir, dirFromAngles(wantYaw, wantPitch)) <= Math.max(this.fireCone, 0.02);
        const w = p.weapon;
        const hasAmmo = !!(w && w.ammo && w.ammo.rounds > 0);
        const busy = p.reloadCountdown > 0 || p.swapWeaponCountdown > 0;
        // Some weapons (the RPEGG) refuse to fire while their spread is blown out by movement.
        const steady = !profile.needsSteady || typeof p.isSteady !== 'function' || p.isSteady();
        // Trigger discipline: a skilled bot lets the weapon's spread settle instead of spraying.
        const spreadOk = !(profile.spreadIncrement > 0) || p.shotSpread === undefined
            || p.shotSpread <= profile.spreadIncrement * (1 + (1 - o.sprayControl) * 12);
        const canShoot = !o.holdFire
            && this.time - this.seenSince >= o.reactionTime
            && this.time >= this.burstPauseUntil
            && this.time >= this.fireHoldUntil
            && dist >= ranges.minFire && dist <= ranges.maxFire && dist >= profile.minUseful
            && hasAmmo && !busy && steady && spreadOk && off <= cone && onMark;
        cmd.fire = canShoot;

        this.housekeeping(cmd, true, dist);

        // Movement relative to the aim yaw (forward is (sin yaw, cos yaw), right is (cos yaw, -sin yaw)).
        let controls = 0;
        if (o.engageMovement !== 'static' && !(profile.needsSteady && !steady)) {
            let fwd = 0;
            if (this.retreating) fwd = -1; // hurt: back off while still shooting
            else if (dist > ranges.prefMax) fwd = 1;
            else if (dist < ranges.prefMin && o.engageMovement === 'strafe') fwd = -1;

            let side = 0;
            if (o.engageMovement === 'strafe' && (dist <= ranges.prefMax || this.retreating)) {
                side = this.strafeStep();
                // Precise single-shot weapons stand still to take the shot.
                if (profile.precise && cmd.fire) side = 0;
            };

            const sy = Math.sin(cmd.yaw), cy = Math.cos(cmd.yaw);

            // Don't walk into a teammate: stop advancing if one is right ahead, dodge the other
            // way if one is right beside.
            if (o.spacing > 0 && this.friends.length) {
                for (const f of this.friends) {
                    const rx = f.x - p.x, rz = f.z - p.z;
                    const d = Math.hypot(rx, rz);
                    if (d > 2 || d < 1e-3) continue;
                    const ahead = (rx * sy + rz * cy) / d, right = (rx * cy - rz * sy) / d;
                    if (fwd > 0 && ahead > 0.6) fwd = 0;
                    if (side !== 0 && right * side > 0.6) { side = -side; this.strafeDir = -this.strafeDir; };
                };
            };

            const safe = (f, s) => hasGroundAhead(this.map, p.x, p.y, p.z, sy * f + cy * s, cy * f - sy * s);
            if (fwd !== 0 && !safe(fwd, 0)) fwd = 0;
            if (side !== 0 && !safe(0, side)) { this.strafeDir = -this.strafeDir; this.strafeSegEnd = this.time + o.strafeInterval * 0.5; side = 0; };

            if (fwd > 0) controls |= CONTROL_BITS.up;
            if (fwd < 0) controls |= CONTROL_BITS.down;
            if (side > 0) controls |= CONTROL_BITS.right;
            if (side < 0) controls |= CONTROL_BITS.left;
        };

        if (o.jumpChance > 0 && !p.jumping && !p.isFalling && this.rng() < o.jumpChance * dt) {
            cmd.jump = true;
            controls |= CONTROL_BITS.jump;
        };
        if (cmd.fire) controls |= CONTROL_BITS.fire;
        cmd.controls = controls;
        return cmd;
    }
}

// Profiling hooks (perf.js). Methods are wrapped from outside so their bodies stay untouched; with
// profiling off, or no profiler attached, each wrapper is one property check and a plain call.
for (const [method, label] of [
    ['scan', 'scan'], ['pollSounds', 'sounds'], ['nearestHostile', 'nearestHostile'], ['ownerAimTarget', 'ownerAim'],
    ['maybeEnterCover', 'cover.enter'], ['coverTick', 'cover.tick'], ['tryGrenade', 'grenade.try'], ['engage', 'engage'],
]) {
    const original = CombatController.prototype[method];
    CombatController.prototype[method] = function (...args) {
        const perf = this.perf;
        if (!perf || !perf.enabled) return original.apply(this, args);
        const t0 = perf.now();
        try { return original.apply(this, args); } finally { perf.add(label, t0); };
    };
};
