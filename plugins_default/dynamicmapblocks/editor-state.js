//plugin: dynamicmapblocks, editor only
import { PlatformMap, PlatformWorld } from './platforms.js';
import { PlatformMotion } from './motion.js';

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
    apply(body, map) {
        var valid = PlatformMap.read({ ...map, extents: { platforms: [body] } });
        if (!valid.length) throw new Error('Check the settings. Spin: up to 90°/s. Path: at least 1 second, up to 16 blocks/s.');
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
        if (motion.type === 'spin' && ['centre', 'corner'].includes(config.pivotMode))
            motion.pivot = this.pivot(copy, sources, config.pivotMode === 'corner' ? config.corner : null);
        copy.motion = motion;
        return copy;
    };
    translate(offset) {
        for (var body of this.bodies) {
            for (var axis of ['x', 'y', 'z']) body.position[axis] += offset[axis];
            for (var block of body.blocks) for (var axis of ['x', 'y', 'z']) block[axis] += offset[axis];
        };
    };
    bounds(body, sources) {
        var world = new PlatformWorld([{ ...body, rotation: {}, motion: { type: 'none' }, position: { x: 0, y: 0, z: 0 },
            blocks: body.blocks.map(block => ({ ...block, x: block.x - body.position.x, y: block.y - body.position.y, z: block.z - body.position.z })) }], sources);
        return world.pose(world.bodies[0], 0).bounds;
    };
    pivot(body, sources, corner) {
        var bounds = this.bounds(body, sources);
        return Object.fromEntries(['x', 'y', 'z'].map((axis, index) => [axis, corner ?
            bounds[corner[index] === '-' ? 'min' : 'max'][axis] : (bounds.min[axis] + bounds.max[axis]) / 2]));
    };
};
