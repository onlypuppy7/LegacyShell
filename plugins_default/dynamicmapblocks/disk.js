//plugin: dynamicmapblocks, legacy map/editor adapter
import { PlatformMap } from './platforms.js';

export const SpinDisk = {
    thickness: .25,
    read(minMap) {
        if (!minMap) return [];
        return PlatformMap.read({ ...minMap, extents: { spinningDisks: minMap.extents?.spinningDisks } }).map(body => ({
            x: body.position.x, y: body.position.y, z: body.position.z,
            radius: body.shapes[0].radius, speed: body.motion.speed,
        }));
    },
};
