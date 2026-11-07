//this plugin is vibecoded
//node plugins_default/legacyprofiles/badges/build-badges.js
//reads badges-master.svg (the inkscape project) and writes every badge LegacyAchievements has an icon for into legacyachievements/client/img/
//which ones, their icon and their hexagon (tier, or grade for a single challenge) come from legacyachievements/definitions.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import sharp from 'sharp';
import { AchievementDefinitions } from '../../legacyachievements/definitions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const master = path.join(here, 'badges-master.svg');
const outDir = path.join(here, '..', '..', 'legacyachievements', 'client', 'img');

//the egg/lightning outline filter is thicker here so it holds up at profile pin size
const src = fs.readFileSync(master, 'utf8')
    .replace(/stdDeviation="[^"]*"/, 'stdDeviation="1.9"').replace(/slope="[^"]*"/, 'slope="60"').replace(/intercept="[^"]*"/, 'intercept="-4.2"')
    .replace('flood-color="#3a1d08" flood-opacity="0.8"', 'flood-color="#2a1305" flood-opacity="1"');

const H = 'm 128,24 84.9,49 v 98 L 128,220 43.1,171 V 73 Z';
const V = [[128, 24], [212.9, 73], [212.9, 171], [128, 220], [43.1, 171], [43.1, 73]];
const C = [128, 122];
const sc = (p, s) => [C[0] + (p[0] - C[0]) * s, C[1] + (p[1] - C[1]) * s];
const f2 = n => +n.toFixed(2);
const poly = pts => pts.map(p => p.map(f2).join(',')).join(' ');
const hexAt = s => 'M ' + V.map(v => sc(v, s).map(f2).join(',')).join(' L ') + ' Z';
const STAR = '160,239.6 152.4,244.5 154.7,235.7 147.6,230 156.7,229.5 160,221 163.3,229.5 172.4,230 165.3,235.7 167.6,244.5';
const CX = 126.725788, CY = 221.42122;

const starAt = (cx, cy, s, fill, stroke) => `<g transform="matrix(${s},0,0,${s},${(cx - s * CX).toFixed(3)},${(cy - s * CY).toFixed(3)})"><polygon points="${STAR}" fill="${fill}" transform="translate(-33.274212,-12.57878)" style="stroke:${stroke};stroke-width:${(3.4 / s).toFixed(2)};stroke-linejoin:round" /></g>`;
//studs set into the lower rim, evenly along both bottom edges
function rimStars(n, fill, stroke) {
    const s = n >= 7 ? 0.68 : n >= 5 ? 0.76 : 0.86;
    const P = [[43.1, 177], [128, 226], [212.9, 177]], seg = Math.hypot(84.9, 49), L = seg * 2;
    let out = '';
    for (let i = 0; i < n; i++) {
        const d = L * (i + 1) / (n + 1), k = d <= seg ? 0 : 1, t = (d - k * seg) / seg;
        out += starAt(P[k][0] + (P[k + 1][0] - P[k][0]) * t, P[k][1] + (P[k + 1][1] - P[k][1]) * t, s, fill, stroke);
    };
    return out;
};

//sparkles hop between spots, each one popping on its own phase of the 0.8s beat
let seed = 11;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const inBadge = (x, y) => { const dx = Math.abs(x - 128); return dx <= 86 && y >= 30 + 0.577 * dx && y <= 204 - 0.577 * dx; };
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const N = 12, WIN = 0.8, CYC = N * WIN, JUMP = 85;
const cand = () => { for (;;) { const p = [Math.round(30 + rnd() * 196), Math.round(30 + rnd() * 176)]; if (inBadge(...p)) return p; }; };
function sparkleSets(k) {
    for (let tries = 0; tries < 1200; tries++) {
        const JMP = Math.max(65, JUMP - Math.floor(tries / 80) * 3), PAIR = Math.max(k >= 5 ? 42 : 50, 68 - Math.floor(tries / 80) * 2);
        const sets = [], shifts = Array.from({ length: k }, (_, j) => Math.floor((j * N) / k) + j / k);
        let ok = true;
        for (let j = 0; j < k && ok; j++) {
            const spots = [];
            for (let i = 0; i < N && ok; i++) {
                let best = null, bs = -1;
                for (let c = 0; c < 500; c++) {
                    const p = cand();
                    if (i && dist(p, spots[i - 1]) < JMP) continue;
                    if (i === N - 1 && dist(p, spots[0]) < JMP) continue;
                    //keep clear of whatever the earlier sparkles are showing while this slot is on
                    const t0 = i - shifts[j];
                    let bad = false;
                    for (let q = 0; q < j && !bad; q++) {
                        for (const tt of [t0, t0 + 0.999]) {
                            const idx = ((Math.floor(tt + shifts[q]) % N) + N) % N;
                            if (dist(p, sets[q][idx]) < PAIR) bad = true;
                        };
                    };
                    if (bad) continue;
                    const all = sets.flat().concat(spots);
                    const score = all.length ? Math.min(...all.map(q => dist(p, q))) : 999;
                    if (score > bs) { bs = score; best = p; };
                };
                if (!best) ok = false; else spots.push(best);
            };
            sets.push(spots);
        };
        if (ok) return { sets, shifts };
    };
    throw new Error('no sparkle layout for ' + k);
};
const r2 = n => +n.toFixed(2);
const POP = 'cubic-bezier(.3,1.6,.5,1)';
const FROM = [37, 98];
function frames(name, spots) {
    const w = 100 / spots.length;
    let k = '';
    spots.forEach(([x, y], i) => {
        const t = `translate(${r2(x - FROM[0])}px,${r2(y - FROM[1])}px)`, a = i * w;
        k += `${r2(a)}%{opacity:0;transform:${t} scale(0);animation-timing-function:linear}`;
        k += `${r2(a + w * 0.02)}%{opacity:1;transform:${t} scale(0);animation-timing-function:${POP}}`;
        k += `${r2(a + w * 0.25)}%{opacity:1;transform:${t} scale(1);animation-timing-function:linear}`;
        k += `${r2(a + w * 0.45)}%{opacity:1;transform:${t} scale(1);animation-timing-function:ease-in}`;
        k += `${r2(a + w * 0.9)}%{opacity:0;transform:${t} scale(1);animation-timing-function:linear}`;
    });
    return `@keyframes ${name}{${k}100%{opacity:0;transform:translate(0px,0px) scale(0)}}`;
};
const SPARK = 'm 37,81.2 4.2,12.6 12.6,4.2 -12.6,4.2 -4.2,12.6 -4.2,-12.6 -12.6,-4.2 12.6,-4.2 z';
let css = '.ls-pulse{animation:ls-pu 4s ease-in-out infinite}.ls-sweep{animation:ls-sw 6s ease-in-out infinite}.ls-sweep.d{animation-delay:-3s}.ls-hue{animation:ls-hu 8s linear infinite}@keyframes ls-pu{0%,100%{opacity:.15}50%{opacity:.34}}@keyframes ls-sw{0%{transform:translateX(-80px);opacity:0}12%{opacity:.5}45%{transform:translateX(160px);opacity:0}100%{transform:translateX(160px);opacity:0}}@keyframes ls-hu{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}.ls-sp{transform-box:fill-box;transform-origin:center}.ls-rgb{animation:ls-rgbk 6s linear infinite}@keyframes ls-rgbk{from{filter:hue-rotate(0deg)}to{filter:hue-rotate(360deg)}}';
function sparkles(tier, k, fill, stroke) {
    const { sets, shifts } = sparkleSets(k);
    let out = '';
    sets.forEach((spots, j) => {
        const id = `t${tier}s${j}`;
        css += `.${id}{animation:${id}k ${CYC}s -${r2(shifts[j] * WIN)}s infinite}` + frames(id + 'k', spots);
        //static position is where it sits at t=0, for anything that does not play css
        const p = spots[((Math.floor(shifts[j]) % N) + N) % N];
        out += `<path class="ls-sp ${id}" d="${SPARK}" fill="${fill}" stroke="${stroke}" stroke-width="3.2" stroke-linejoin="round" transform="translate(${r2(p[0] - FROM[0])},${r2(p[1] - FROM[1])})"/>`;
    });
    return out;
};

//facet colours rotate around the gem
const PAL = {
    diamond: { c: ['#8ad8ff', '#ff8ad8', '#9dffb8', '#ffe98a', '#b9a0ff'], t: 7 },
    ruby: { c: ['#ffa3b0', '#ff4d6a', '#7a0f24', '#e0314b', '#ffd0d8'], t: 6 },
    emerald: { c: ['#d6ffe9', '#3fe08c', '#0a5a35', '#1fb36b', '#a6ffd0'], t: 6.5 },
};
css += Object.entries(PAL).map(([k, p]) => `.ls-fx-${k}{animation:ls-fx-${k}k ${p.t}s linear infinite}@keyframes ls-fx-${k}k{${[...p.c, p.c[0]].map((c, i, arr) => `${+(i * 100 / (arr.length - 1)).toFixed(2)}%{fill:${c}}`).join('')}}`).join('');
function facets(s, tints, op, anim) {
    let o = '';
    for (let i = 0; i < 6; i++) o += `<polygon points="${poly([C, sc(V[i], s), sc(V[(i + 1) % 6], s)])}" fill="${tints[i % tints.length]}" opacity="${op}"${anim ? ` class="ls-fx-${anim}" style="animation-delay:-${(i * PAL[anim].t / 6).toFixed(2)}s"` : ''}/>`;
    return o;
};
const sweep = cls => `<g clip-path="url(#t4c)"><polygon class="ls-sweep${cls}" points="40,30 74,30 140,222 106,222" fill="#ffffff" opacity="0"/></g>`;
const engraved = (dark, light) => `<path d="${hexAt(0.87)}" fill="none" stroke="${dark}" stroke-width="1.6" opacity="0.55"/><path d="${hexAt(0.845)}" fill="none" stroke="${light}" stroke-width="1.6" opacity="0.7"/>`;
const base = (rim, fill, ring, ringOp, inner = '', extra = '') => `<g transform="translate(0,6)" stroke-linejoin="round">
<path d="${H}" fill="${rim}" stroke="${rim}" stroke-width="29"/>
<path d="${H}" fill="${fill}" stroke="${fill}" stroke-width="14"/>
<path d="m 128,32 77.9,45 v 90 L 128,212 50.1,167 V 77 Z" fill="none" stroke="${ring}" stroke-width="6" opacity="${ringOp}"/>${inner}${extra}</g>`;
const dotted = colour => `<path d="m 128,46 65.8,38 v 76 L 128,198 62.2,160 V 84 Z" fill="none" stroke="${colour}" stroke-width="2.5" stroke-dasharray="2, 8" stroke-linecap="round"/>`;
const grad = (id, a, b, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="0.5" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
const defs = `
${grad('t1g', '#e9a766', '#cd7f32', '#a1591a')}${grad('t2g', '#b4b6b8', '#9b9ea1', '#7f8286')}${grad('t3g', '#ffe780', '#ffc928', '#dc9a0c')}
${grad('t4g', '#f4f9fd', '#cfe0ee', '#9fbbd2')}${grad('t5g', '#ff5a73', '#d4203f', '#b3112f')}${grad('t6g', '#3fe08c', '#1fb36b', '#0e8a52')}
<linearGradient id="t7g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#eaf6ff"/><stop offset="1" stop-color="#d9e6ff"/></linearGradient>
<linearGradient id="t7r" gradientUnits="userSpaceOnUse" x1="43" y1="30" x2="213" y2="220"><stop offset="0" stop-color="#ff8ad8"/><stop offset="0.33" stop-color="#8ad8ff"/><stop offset="0.66" stop-color="#9dffb8"/><stop offset="1" stop-color="#ffe98a"/></linearGradient>
<linearGradient id="t8rgb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff2d4a"/><stop offset="0.2" stop-color="#ffb000"/><stop offset="0.4" stop-color="#2dff6a"/><stop offset="0.6" stop-color="#1ad8ff"/><stop offset="0.8" stop-color="#5a4aff"/><stop offset="1" stop-color="#e02dff"/></linearGradient>
<clipPath id="t4c"><path d="${hexAt(0.93)}"/></clipPath>`;

//tiers: 1 bronze, 2 silver, 3 gold, 4 platinum, 5 ruby, 6 emerald, 7 diamond, 8 rgb
//sparkle counts are 0, 0, 1, 2, 3, 3, 4, 5 and are made in this order so the layouts stay the same
const tiers = {
    1: { name: 'Bronze', g: base('#5e3210', 'url(#t1g)', '#f0b27a', 0.85, engraved('#5e3210', '#f6c99a')), st: rimStars(1, '#ffc928', '#5e3210') },
    2: { name: 'Silver', g: base('#3b4650', 'url(#t2g)', '#c9cdd1', 0.55, engraved('#3b4650', '#c3c7cb')), st: rimStars(2, '#ffc928', '#3b4650') },
    3: { name: 'Gold', g: base('#7a4300', 'url(#t3g)', '#fff08a', 0.9, engraved('#7a4300', '#fff6c0'), dotted('#7a4300')), sp: sparkles(3, 1, '#fff6c8', '#7a4300'), st: rimStars(3, '#fff6c8', '#7a4300') },
    4: { name: 'Platinum', g: base('#2f4a63', 'url(#t4g)', '#ffffff', 0.95,
        `<g clip-path="url(#t4c)"><polygon points="60,40 100,40 175,206 135,206" fill="#ffffff" opacity="0.4"/><polygon points="108,40 122,40 197,206 183,206" fill="#ffffff" opacity="0.28"/></g>` + sweep('')),
        st: rimStars(4, '#eefaff', '#2f4a63'), sp: sparkles(4, 2, '#ffffff', '#2f4a63') },
    5: { name: 'Ruby', g: base('#4a0d1a', 'url(#t5g)', '#ff9aa8', 0.9, facets(0.9, PAL.ruby.c, 0.5, 'ruby') + `<path d="${hexAt(0.9)}" fill="none" stroke="#ffb3be" stroke-width="1.5" opacity="0.6"/>`),
        st: rimStars(5, '#ffd9df', '#4a0d1a'), sp: sparkles(5, 3, '#ffe3e8', '#4a0d1a') },
    6: { name: 'Emerald', g: base('#0b4a2c', 'url(#t6g)', '#a6ffd0', 0.9,
        `<path class="ls-pulse" d="${hexAt(0.62)}" fill="#a6ffd0" opacity="0.2"/><path d="${hexAt(0.62)}" fill="none" stroke="#d6ffe9" stroke-width="2" opacity="0.7"/>` + facets(0.62, PAL.emerald.c, 0.45, 'emerald') + sweep(' d'), dotted('#0b4a2c')),
        st: rimStars(6, '#ffd23a', '#0b4a2c'), sp: sparkles(6, 3, '#e0fff0', '#0b4a2c') },
    7: { name: 'Diamond', g: base('#4b5b82', 'url(#t7g)', 'url(#t7r)', 1,
        facets(0.92, PAL.diamond.c, 0.42, 'diamond') + `<path class="ls-hue" d="${hexAt(0.92)}" fill="none" stroke="url(#t7r)" stroke-width="2.5" opacity="0.9"/>` + sweep(' d')),
        st: rimStars(7, '#ffd23a', '#4b5b82'), sp: sparkles(7, 4, '#ffffff', '#4b5b82') },
    8: { name: 'RGB', g: `<g class="ls-rgb"><g transform="translate(0,6)" stroke-linejoin="round">
<path d="${H}" fill="#1b1230" stroke="#1b1230" stroke-width="29"/>
<path d="${H}" fill="url(#t8rgb)" stroke="url(#t8rgb)" stroke-width="14"/>
<polygon points="${poly([[128, 32], [205.9, 77], [128, 122]])}" fill="#ffffff" opacity="0.2"/>
<path d="m 128,32 77.9,45 v 90 L 128,212 50.1,167 V 77 Z" fill="none" stroke="#ffffff" stroke-width="4" opacity="0.9"/>
<path d="m 128,46 65.8,38 v 76 L 128,198 62.2,160 V 84 Z" fill="none" stroke="#1b1230" stroke-width="2.5" stroke-dasharray="2, 8" stroke-linecap="round" opacity="0.6"/></g></g>`,
        st: rimStars(8, '#ffffff', '#1b1230'), sp: sparkles(8, 5, '#ffffff', '#1b1230') },
};

//put every tier into the master as a hidden group, plus a stars group that sits above the icon
let combined = src.replace('id="defs4">', `id="defs4"><style id="ls-tier-sparkles">${css}</style>` + defs);
let layers = '', starsTop = '';
for (const [n, t] of Object.entries(tiers)) {
    layers += `<g id="tier${n}" inkscape:label="${n} ${t.name}" style="display:none">${t.g}</g>`;
    starsTop += `<g id="tier${n}_stars" inkscape:label="${n} ${t.name} stars" style="display:none">${t.st || ''}${t.sp || ''}</g>`;
};
combined = combined.replace(/<g\s+id="zombie_outline"/, layers + '<g id="zombie_outline"').replace('<image', starsTop + '<image');

function setDisp(s, id, v) {
    const re = new RegExp('<g(?=\\s)[^>]*?\\sid="' + id + '"[^>]*>');
    if (!re.test(s)) throw new Error('no group ' + id);
    return s.replace(re, tag => /\sstyle="/.test(tag) ? tag.replace(/\sstyle="[^"]*"/, ' style="display:' + v + '"') : tag.replace(/>$/, ' style="display:' + v + '">'));
};
//icon key from a definition -> the layers of the master it is made of
const icons = {
    kills: ['killsshot_layer'], deaths: ['deaths_layer'], 'sidearm-survivor': ['zombie_outline', 'g129'], zombies: ['zombie_outline', 'g129'],
    eggk47: ['eggk47_layer'], dozen: ['scrambler_layer'], csg1: ['freeranger_layer'], rpegg: ['rpegg_layer'], cluck: ['cluck9mm_layer'], grenade: ['grenade_layer'],
};
//the weapon icons come as the website draws them, flat teal with a yellow ring round it that sits on top of the body, the overlap is what defines their details. so it keeps its shape and its place, it just gets the gradient and the dark rim like the hand finished ones
const plain = new Set(['eggk47', 'dozen', 'csg1', 'rpegg', 'cluck', 'grenade']);
function restyle($, layerId) {
    const layer = $('#' + layerId);
    //drawn for a star and a lot bigger than the hexagon, so they come in a little
    layer.attr('transform', 'translate(128 122) scale(0.82) translate(-128 -122)' + (layer.attr('transform') ? ' ' + layer.attr('transform') : ''));
    layer.find('[style*="fill:#0c576f"]').each((_, e) => { $(e).attr('style', $(e).attr('style').replace('fill:#0c576f', 'fill:#0e7697')); });
    const yellow = layer.find('path[style*="fill:#fff100"]').toArray();
    const outline = yellow.sort((a, b) => b.attribs.d.length - a.attribs.d.length)[0]; //the biggest yellow shape is the outline, the rest is detail
    layer.find('[style*="#fff100"]').each((_, e) => { if (e !== outline) $(e).attr('style', $(e).attr('style').split('#fff100').join('#ffd335')); });
    if (!outline) return;
    $(outline).attr('style', 'fill:url(#linearGradient142);stroke:none;filter:url(#lsOutline)');
}

//the master's own bronze/silver/gold groups and stars are older art, always hidden
const older = ['g130', 'g131', 'g142', 'g143', 'g145', 'g146'];
//blocks of a stylesheet, so unused rules can be dropped per badge
function blocks(text) {
    const out = []; let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}' && --depth === 0) { out.push(text.slice(start, i + 1)); start = i + 1; };
    };
    return out;
};

fs.mkdirSync(outDir, { recursive: true });
const built = []; //written once every badge of a line is known, so they can share a crop
//show only the tier and icon a badge needs, drop whatever is left unused, write it out
function build(file, tier, withStars, icon) {
    let s = combined;
    for (const id of older) s = setDisp(s, id, 'none');
    for (let n = 1; n <= 8; n++) { s = setDisp(s, 'tier' + n, tier === n ? 'inline' : 'none'); s = setDisp(s, 'tier' + n + '_stars', withStars && tier === n ? 'inline' : 'none'); };
    for (const [key, layers] of Object.entries(icons)) for (const id of layers) s = setDisp(s, id, key === icon ? 'inline' : 'none');
    //the master has gold sparkles of its own, gold gets one from its tier instead
    for (const id of ['path17-8', 'path18-4']) s = s.replace(new RegExp('<path(?=\\s)[^>]*?\\sid="' + id + '"[^>]*>'), tag => tag.replace('display:inline', 'display:none'));
    const $ = load(s, { xmlMode: true });
    if (plain.has(icon)) restyle($, icons[icon][0]);
    if (icon === 'zombies') $('#cluck9mm_layer-9').remove(); //the sidearm's art without the sidearm
    $('image, sodipodi\\:namedview').remove();
    $('[style*="display:none"]').each((_, e) => { $(e).remove(); });
    $('*').each((_, e) => { for (const a of Object.keys(e.attribs || {})) if (/^(inkscape|sodipodi):|^data-name$|^xml:space$/.test(a)) delete e.attribs[a]; });
    $('svg').removeAttr('xmlns:inkscape').removeAttr('xmlns:sodipodi').removeAttr('sodipodi:docname').removeAttr('inkscape:version');
    //keep only the defs something still points at
    const used = new Set();
    const scan = text => { for (const m of text.matchAll(/url\(#([^)\s]+)\)|href="#([^"]+)"/g)) used.add(m[1] || m[2]); };
    scan($.xml().replace(/<defs[\s\S]*?<\/defs>/g, ''));
    for (let pass = 0; pass < 6; pass++) {
        const before = used.size;
        $('defs > *').each((_, e) => { if (used.has(e.attribs.id)) scan($.xml(e)); });
        if (used.size === before) break;
    };
    $('defs > *').each((_, e) => { if (e.name !== 'style' && !used.has(e.attribs.id)) $(e).remove(); });
    //and only the css for the classes left
    const classes = new Set(); $('[class]').each((_, e) => e.attribs.class.split(/\s+/).forEach(c => classes.add(c)));
    $('style').each((_, e) => {
        const all = blocks($(e).text());
        const rules = all.filter(b => !b.startsWith('@') && [...classes].some(c => { const sel = b.split('{')[0]; return sel.includes('.' + c + '{') || sel.includes('.' + c + ' ') || sel.includes('.' + c + ',') || sel.endsWith('.' + c); }));
        const names = new Set(rules.join('').match(/animation:[^;}]*/g)?.map(a => a.replace('animation:', '').trim().split(/\s+/)[0]));
        $(e).text(rules.concat(all.filter(b => b.startsWith('@keyframes') && names.has(b.slice(11, b.indexOf('{'))))).join(''));
        if (!rules.length) $(e).remove();
    });
    const xml = $.xml().replace(/<\?xml[^>]*\?>\s*/, '').replace(/>\s+</g, '><').trim();
    built.push({ file, icon, xml });
};
//one badge per definition with an icon. a tier line has stars, a single challenge only gets the hexagon of its grade
for (const definition of AchievementDefinitions) {
    if (!definition.icon || !definition.image?.startsWith('/legacyachievements/img/') || !icons[definition.icon]) continue;
    build(path.basename(definition.image, '.svg'), definition.tier || definition.grade, !!definition.tier, definition.icon);
};

//the art only fills part of the 256 square, so every badge gets the same viewBox, cropped to what the biggest of them draws. one shared crop keeps the hexagons the same size and in the same place next to each other
const pad = 2, scale = 4;
async function bounds(xml) {
    const { data, info } = await sharp(Buffer.from(xml), { density: 72 * scale }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
    return { x0: x0 / scale, y0: y0 / scale, x1: (x1 + 1) / scale, y1: (y1 + 1) / scale };
};
const crops = new Map();
for (const { xml } of built) {
    const b = await bounds(xml), c = crops.get('all') || b;
    crops.set('all', { x0: Math.min(c.x0, b.x0), y0: Math.min(c.y0, b.y0), x1: Math.max(c.x1, b.x1), y1: Math.max(c.y1, b.y1) });
};
for (const { file, xml } of built) {
    const c = crops.get('all'), size = Math.max(c.x1 - c.x0, c.y1 - c.y0) + pad * 2; //stays square, centred on what is drawn
    const x = (c.x0 + c.x1) / 2 - size / 2, y = (c.y0 + c.y1) / 2 - size / 2;
    if (!xml.includes('viewBox="0 0 256 256"')) throw new Error('unexpected viewBox in ' + file);
    fs.writeFileSync(path.join(outDir, file + '.svg'), xml.replace('viewBox="0 0 256 256"', 'viewBox="' + [x, y, size, size].map(n => +n.toFixed(1)).join(' ') + '"') + '\n');
    console.log(file + '.svg', (xml.length / 1024).toFixed(1) + 'KB', 'viewBox', [x, y, size, size].map(n => +n.toFixed(1)).join(' '));
};
