//plugin: dynamicmapblocks, editor only
import BABYLON from 'babylonjs';
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformMotion } from './motion.js';
import { PlatformTeleporters } from './teleporters.js';

export class TeleporterEditorState { //the pads, on the editor's own coordinates: the same shift as platforms on the way in and out, and a pad goes when its block does
    constructor() { this.pads = []; };
    shift(def, offset, sign) {
        var move = point => Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, point[axis] + sign * offset[axis]]));
        var copy = { ...def, block: { ...def.block, ...move(def.block) } };
        if (def.to?.type === 'point') copy.to = { ...def.to, ...move(def.to) };
        return copy;
    };
    load(saved) {
        var offset = { x: saved?.extents?.x?.min ?? 25 - Math.floor((saved?.width || 50) / 2), y: 0, z: saved?.extents?.z?.min ?? 25 - Math.floor((saved?.depth || 50) / 2) };
        this.pads = PlatformTeleporters.read(saved).map(def => this.shift(def, offset, 1));
    };
    save(origin) { return this.pads.map(def => this.shift(def, origin, -1)); };
    sync(map, sources) {
        if (!map.data) return;
        this.pads = this.pads.filter(def => {
            var cell = map.data[def.block.x]?.[def.block.y]?.[def.block.z];
            return cell?.idx && sources[cell.idx]?.name === def.block.mesh;
        });
    };
    forBlock(block) { return this.pads.find(def => def.block.x === block.x && def.block.y === block.y && def.block.z === block.z); };
    find(id) { return this.pads.find(def => def.id === id); };
    draft(block) {
        var existing = this.forBlock(block);
        if (existing) return JSON.parse(JSON.stringify(existing));
        return { id: this.freeId(), block: { mesh: block.mesh, x: block.x, y: block.y, z: block.z }, send: true, to: { type: 'link' } };
    };
    freeId(taken = []) { //the first tp-1, tp-2, ... nothing on the map, or about to be, is called
        var names = new Set([...this.pads.map(def => def.id), ...taken]), n = 1;
        while (names.has('tp-' + n)) n++;
        return 'tp-' + n;
    };
    check(def, map) { //the same checks the map gets when it is read back
        var valid = PlatformTeleporters.read({ width: map.width, height: map.height, depth: map.depth, extents: { teleporters: [def] } });
        if (!valid.length) throw new Error('Check the settings. Sizes: .25 to 64. Speed: up to 30. Charge: up to 10 seconds.');
        return valid[0];
    };
    remove(id) { this.pads = this.pads.filter(def => def.id !== id); };
    apply(defs, map) { //a pad and the one it is paired with go in together, so each can point at the other
        var valid = defs.map(def => this.check(def, map)), names = new Set([...this.pads, ...valid].map(def => def.id));
        if (valid.some(def => def.to?.type === 'link' && def.to.id && !names.has(def.to.id))) throw new Error('Sends to a missing teleporter. Pick another.');
        if (names.size > PlatformTeleporters.limit) throw new Error('This map already has ' + PlatformTeleporters.limit + ' teleporters.');
        for (var def of valid) {
            var index = this.pads.findIndex(item => item.id === def.id);
            if (index >= 0) this.pads[index] = def; else this.pads.push(def);
        };
        return valid;
    };
    translate(offset) { this.pads = this.pads.map(def => this.shift(def, offset, 1)); };
    copySettings(def) {
        var { id, block, to, ...rest } = JSON.parse(JSON.stringify(def));
        return { ...rest, to: to.type === 'link' ? { type: 'link' } : to };
    };
    pasteSettings(def, settings) { return { ...JSON.parse(JSON.stringify(settings)), id: def.id, block: def.block }; };
};

export class PlatformEditorState {
    constructor() { this.bodies = []; };
    load(saved) {
        var offset = { x: saved?.extents?.x?.min ?? 25 - Math.floor((saved?.width || 50) / 2), y: 0,
            z: saved?.extents?.z?.min ?? 25 - Math.floor((saved?.depth || 50) / 2) };
        this.bodies = PlatformMap.read(saved).map(body => ({ ...body,
            position: Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, body.position[axis] + offset[axis]])),
            blocks: body.blocks.map(block => ({ ...block, x: block.x + offset.x, z: block.z + offset.z })),
        }));
    };
    save(origin) {
        return this.bodies.map(body => ({ ...body,
            position: Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, body.position[axis] - origin[axis]])),
            blocks: body.blocks.map(block => ({ ...block, ...Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, block[axis] - origin[axis]])) })),
        }));
    };
    sync(map, sources) {
        if (!map.data) return;
        this.bodies = this.bodies.filter(body => {
            body.blocks = body.blocks.filter(block => {
                var cell = map.data[block.x]?.[block.y]?.[block.z];
                if (!cell?.idx || sources[cell.idx]?.name !== block.mesh) return false;
                for (var axis of ['x', 'y', 'z']) block['r' + axis] = cell['r' + axis] || 0;
                return true;
            });
            return body.blocks.length || body.shapes?.length;
        });
    };
    forBlock(block) {
        return this.bodies.find(body => body.blocks.some(cell => cell.x === block.x && cell.y === block.y && cell.z === block.z));
    };
    draft(block) {
        var existing = this.forBlock(block);
        if (existing) return JSON.parse(JSON.stringify(existing));
        if (typeof block.mesh !== 'string' || block.mesh.split('.').length < 3) throw new Error('Pick a map block.');
        var id = 'block-' + block.x + '-' + block.y + '-' + block.z, suffix = 1;
        while (this.bodies.some(body => body.id === id)) id = 'block-' + block.x + '-' + block.y + '-' + block.z + '-' + suffix++;
        return { id, position: { x: block.x + .5, y: block.y + .5, z: block.z + .5 },
            blocks: [{ ...block }], shapes: [], motion: { type: 'none' } };
    };
    toggle(body, block) { //puts a block in with the others so they move as one, or takes it out again; every platform keeps at least one
        var same = cell => cell.x === block.x && cell.y === block.y && cell.z === block.z;
        var copy = JSON.parse(JSON.stringify(body)), index = copy.blocks.findIndex(same);
        if (index >= 0) {
            if (copy.blocks.length + (copy.shapes?.length || 0) < 2) throw new Error('A moving block needs at least one block.');
            copy.blocks.splice(index, 1); return copy;
        };
        var owner = this.forBlock(block);
        if (owner && owner.id !== body.id) throw new Error('That block already moves with another platform.');
        if (copy.blocks.length + (copy.shapes?.length || 0) >= 128) throw new Error('A platform holds up to 128 blocks.');
        copy.blocks.push({ ...block });
        return copy;
    };
    apply(body, map) {
        var valid = PlatformMap.read({ ...map, extents: { platforms: [body] } });
        if (!valid.length) throw new Error('Check the settings. Spin: up to 90°/s. Path: up to 16 blocks/s.');
        var index = this.bodies.findIndex(item => item.id === body.id);
        if (body.motion.type === 'none' && !valid[0].shapes.length && !['x', 'y', 'z'].some(axis => body.rotation?.[axis])) {
            if (index >= 0) this.bodies.splice(index, 1);
        } else if (index >= 0) this.bodies[index] = valid[0];
        else {
            if (this.bodies.length >= 32) throw new Error('This map already has 32 moving platforms.');
            this.bodies.push(valid[0]);
        };
    };
    copyMovement(body, pivotMode = 'custom', corner) {
        return JSON.parse(JSON.stringify({ motion: body.motion, pivotMode, corner }));
    };
    pasteMovement(body, config, sources) {
        if (!config?.motion || !PlatformMotion.types.has(config.motion.type)) throw new Error('Copy a movement first.');
        var copy = JSON.parse(JSON.stringify(body)), motion = JSON.parse(JSON.stringify(config.motion));
        if ((motion.type === 'spin' || motion.pivot) && ['centre', 'side', 'corner'].includes(config.pivotMode)) //somewhere on the block itself: follows the block it lands on
            motion.pivot = this.pivot(copy, sources, config.pivotMode === 'centre' ? null : config.corner, motion.centre);
        copy.motion = motion;
        return copy;
    };
    translate(offset) {
        for (var body of this.bodies) {
            for (var axis of ['x', 'y', 'z']) body.position[axis] += offset[axis];
            for (var block of body.blocks) for (var axis of ['x', 'y', 'z']) block[axis] += offset[axis];
        };
    };
    cells(body) { //the box of cells the blocks fill, from the body's own position
        var low = ['x', 'y', 'z'].map(axis => Math.min(...body.blocks.map(block => block[axis])) - body.position[axis]);
        var high = ['x', 'y', 'z'].map(axis => Math.max(...body.blocks.map(block => block[axis])) + 1 - body.position[axis]);
        return { min: new BABYLON.Vector3(...low), max: new BABYLON.Vector3(...high) };
    };
    bounds(body, sources) {
        var world = new PlatformWorld([{ ...body, rotation: {}, motion: { type: 'none' }, position: { x: 0, y: 0, z: 0 },
            blocks: body.blocks.map(block => ({ ...block, x: block.x - body.position.x, y: block.y - body.position.y, z: block.z - body.position.z })) }], sources);
        return world.pose(world.bodies[0], 0).bounds;
    };
    pivot(body, sources, where, centre = body.motion?.centre) { //about the cell, or the mesh inside it if centre says so. where is a sign for each of x, y, z: - low, + high, 0 the middle
        var bounds = body.blocks.length && centre !== 'mesh' ? this.cells(body) : this.bounds(body, sources); //so '000' is the centre, '+00' the middle of a side, '+++' a corner
        return Object.fromEntries(['x', 'y', 'z'].map((axis, index) => [axis, where?.[index] === '-' ? bounds.min[axis] : where?.[index] === '+' ? bounds.max[axis] : (bounds.min[axis] + bounds.max[axis]) / 2]));
    };
};
