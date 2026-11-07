//plugin: legacylightmaps, reading the editor's existing exports
export const LightmapData = {
    limit: 1000000,

    decode(input, vertices) {
        if (!Number.isInteger(vertices) || vertices < 1 || vertices > this.limit) return null;
        var length = vertices * 3;
        try {
            if (typeof input !== 'string') {
                var bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
                if (bytes.length === length) return bytes;
                if (bytes.length > length * 5 + 1024) return null;
                input = new TextDecoder().decode(bytes);
            };
            var rgb = JSON.parse(input);
            if (!Array.isArray(rgb) || rgb.length !== length || !rgb.every(value => Number.isInteger(value) && value >= 0 && value <= 255)) return null;
            return Uint8Array.from(rgb);
        } catch { return null; };
    },

    cells(map) { //the game may already have lifted moving blocks out of the static map. put them back for the editor's vertex order
        var data = Object.fromEntries(Object.entries(map.data).map(([name, cells]) => [name, Object.values(cells).map(cell => ({ ...cell }))]));
        for (var body of map.extents?.platforms || []) for (var block of body.blocks || []) {
            var cells = data[block.mesh] ||= [];
            if (cells.some(cell => cell.x === block.x && cell.y === block.y && cell.z === block.z)) continue;
            var { mesh, ...cell } = block;
            cells.push(cell);
        };
        var order = (a, b) => a.x - b.x || a.y - b.y || a.z - b.z;
        for (var cells of Object.values(data)) cells.sort(order);
        //generateExtents scans x, y, z; a mesh name first appears when that scan reaches its first block
        return Object.fromEntries(Object.entries(data).sort((a, b) => a[1].length && b[1].length ? order(a[1][0], b[1][0]) : b[1].length - a[1].length));
    },

    reference(B, scene, data, sources) {
        var index = new Map();
        for (var mesh of sources) if (mesh) {
            index.set(mesh.name, mesh);
            index.set([mesh.theme, mesh.name, mesh.colliderType, mesh.softness].filter(Boolean).join('.'), mesh);
        };
        var sps = new B.SolidParticleSystem('legacylightmaps-reference', scene, { updatable: true }), count = 0;
        sps.computeParticleColor = false; sps.computeParticleTexture = false; sps.computeParticleRotation = false; sps.recomputeNormals = false;
        try {
            for (var [name, cells] of Object.entries(data)) {
                var theme = name.split('.')[0];
                if (theme === 'SPECIAL' || theme === 'DYNAMIC' || !cells.length) continue;
                var source = index.get(name);
                if (!source) return null;
                count += source.getTotalVertices() * cells.length;
                if (count > this.limit) return null;
                var at = 0;
                sps.addShape(source, cells.length, { positionFunction(particle) {
                    var cell = cells[at++];
                    for (var axis of ['x', 'y', 'z']) {
                        particle.position[axis] = cell[axis] + .5;
                        particle.rotation[axis] = (cell['r' + axis] || 0) * Math.PI / 2;
                    };
                } });
            };
            if (!count) return null;
            var mesh = sps.buildMesh();
            return { positions: mesh.getVerticesData('position').slice(), normals: mesh.getVerticesData('normal').slice(), colors: mesh.getVerticesData('color').slice() };
        } finally { if (sps.mesh) sps.dispose(); };
    },

    key(positions, normals, i, offset = [0, 0, 0]) {
        return [0, 1, 2].map(axis => Math.round((positions[i + axis] + offset[axis]) * 10000))
            .concat([0, 1, 2].map(axis => Math.round(normals[i + axis] * 1000))).join(',');
    },

    paint(colors, c) {
        return [0, 1, 2].map(axis => Math.round(colors[c + axis] * 65535)).join(',');
    },

    samples(reference, rgb) {
        if (!reference || !rgb || reference.positions.length !== rgb.length) return null;
        var samples = new Map();
        for (var i = 0; i < rgb.length; i += 3) {
            var key = this.key(reference.positions, reference.normals, i) + ',' + this.paint(reference.colors, i / 3 * 4);
            if (!samples.has(key)) samples.set(key, [rgb[i] / 255, rgb[i + 1] / 255, rgb[i + 2] / 255]);
        };
        return samples;
    },

    sample(samples, positions, normals, i, colors, c) {
        var paint = ',' + this.paint(colors, c);
        var key = this.key(positions, normals, i) + paint, rgb = samples.get(key);
        if (rgb) return rgb;
        //SPS stores float32s: translating an editor vertex can put it just across a rounding boundary
        var values = [0, 1, 2].map(axis => positions[i + axis] * 10000).concat([0, 1, 2].map(axis => normals[i + axis] * 1000));
        var keys = [''];
        for (var value of values) {
            var rounded = Math.round(value), choices = [rounded];
            if (Math.abs(value - rounded) > .4) choices.push(rounded + Math.sign(value - rounded));
            keys = keys.flatMap(prefix => choices.map(choice => prefix ? prefix + ',' + choice : String(choice)));
        };
        for (var candidate of keys) if (samples.has(candidate + paint)) return samples.get(candidate + paint);
        return null;
    },

    apply(mesh, samples, fallback) {
        var positions = mesh.getVerticesData('position'), normals = mesh.getVerticesData('normal'), colors = mesh.getVerticesData('color');
        if (!samples || !positions || normals?.length !== positions.length || colors?.length !== positions.length / 3 * 4) return 0;
        var result = (fallback || colors).slice(), matched = 0;
        for (var i = 0, c = 0; i < positions.length; i += 3, c += 4) {
            var rgb = this.sample(samples, positions, normals, i, colors, c);
            if (!rgb) continue;
            result[c] = rgb[0]; result[c + 1] = rgb[1]; result[c + 2] = rgb[2];
            result[c + 3] = -1; //the map shader restores alpha and skips the second coat of dirt/sun shading
            matched++;
        };
        if (matched) mesh.updateVerticesData('color', result);
        return matched;
    },
};
