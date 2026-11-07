//plugin: dynamicmapblocks
export const MapSigns = {
    limit: 128,
    categories: new Set(['SIGNWALL', 'SIGNSTAND', 'SIGNBUBBLE']),
    kind(name) { return this.categories.has(name?.split('.')[0]) ? name.split('.')[0] : null; },
    helper(mesh) { return /TEXT/i.test(mesh.name); },
    key(block) { return [block.x, block.y, block.z].join(','); },
    read(map) {
        var result = [], used = new Set();
        for (var def of Object.values(map?.extents?.signs || {}).slice(0, this.limit)) {
            var b = def?.block;
            if (!b || !this.kind(b.mesh) || !['x', 'y', 'z'].every(axis => Number.isInteger(b[axis]) && b[axis] >= 0 && b[axis] < (map[{ x: 'width', y: 'height', z: 'depth' }[axis]] || 256))) continue;
            var key = this.key(b);
            if (used.has(key) || typeof def.text !== 'string' || def.text.length > 512 || def.text.split(/\r\n?|\n/).length > 12) continue;
            if (def.range !== undefined && (!Number.isFinite(def.range) || def.range < 1 || def.range > 12)) continue;
            if (def.color !== undefined && !/^#[0-9a-f]{6}$/i.test(def.color)) continue;
            if (def.align !== undefined && !['left', 'center', 'right'].includes(def.align)) continue;
            used.add(key);
            result.push({ block: { mesh: b.mesh, x: b.x, y: b.y, z: b.z }, text: def.text.replace(/\r\n?/g, '\n').replace(/[\x00-\x08\x0b-\x1f\x7f]/g, ''),
                color: def.color || '#302315', align: def.align || 'center', range: def.range ?? 5 });
        };
        return result;
    },
    placed(map) {
        var blocks = new Map();
        for (var [mesh, cells] of Object.entries(map?.data || {})) if (this.kind(mesh)) for (var cell of Object.values(cells)) blocks.set(this.key(cell), { ...cell, mesh });
        for (var body of map?.extents?.platforms || []) for (var block of body.blocks || []) if (this.kind(block.mesh)) blocks.set(this.key(block), block);
        return blocks;
    },
    entries(map) {
        var blocks = this.placed(map);
        return this.read(map).filter(def => blocks.get(this.key(def.block))?.mesh === def.block.mesh).map(def => ({ ...def, block: blocks.get(this.key(def.block)) }));
    },
    wrap(context, text, width) {
        var lines = [];
        for (var paragraph of text.split('\n')) {
            var line = '';
            for (var word of paragraph.split(/\s+/)) {
                if (line && context.measureText(line + ' ' + word).width > width) { lines.push(line); line = ''; };
                for (var char of Array.from(word)) {
                    if (context.measureText(line + char).width > width && line) { lines.push(line); line = ''; };
                    line += char;
                };
                line += ' ';
            };
            lines.push(line.trimEnd());
        };
        return lines;
    },
};

export class SignEditorState {
    constructor() { this.signs = []; };
    load(map) {
        var offset = { x: map?.extents?.x?.min ?? 25 - Math.floor((map?.width || 50) / 2), y: 0, z: map?.extents?.z?.min ?? 25 - Math.floor((map?.depth || 50) / 2) };
        this.signs = MapSigns.entries(map).map(def => this.shift(def, offset, 1));
    };
    shift(def, offset, sign) { return { ...def, block: { ...def.block, ...Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, def.block[axis] + sign * (offset[axis] || 0)])) } }; };
    save(origin) { return this.signs.map(def => this.shift(def, origin, -1)); };
    translate(offset) { this.signs = this.signs.map(def => this.shift(def, offset, 1)); };
    forBlock(block) { return this.signs.find(def => MapSigns.key(def.block) === MapSigns.key(block)); };
    sync(map, sources) { this.signs = this.signs.filter(def => sources[map.data?.[def.block.x]?.[def.block.y]?.[def.block.z]?.idx]?.name === def.block.mesh); };
    apply(def, map) {
        var valid = MapSigns.read({ ...map, extents: { signs: [def] } })[0];
        if (!valid) throw new Error('Up to 512 letters and 12 lines. Distance: 1 to 12 blocks.');
        var old = this.forBlock(def.block);
        if (!old && this.signs.length >= MapSigns.limit) throw new Error('This map already has 128 signs.');
        if (old) this.signs[this.signs.indexOf(old)] = valid; else this.signs.push(valid);
        return valid;
    };
};
