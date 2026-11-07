export const FranciumMap = {
    scenes: new WeakMap(),
    patched: false,

    settings() {
        if (this.option || typeof LegacySettings === 'undefined') return;
        LegacySettings.addTab('Graphics', [1, 1]);
        this.option = LegacySettings.addOption('Graphics', { type: 'select', key: 'franciumMapDetail', label: 'Simple Map', default: this.detail(),
            options: [{ value: 'off', label: 'Off' }, { value: 'simple', label: 'Simple' }, { value: 'ultra', label: 'Ultra' }],
            tooltip: 'Simple uses cubes, ramps and collision boxes. Ultra also boxes detailed props, ladders and decorations. Applies from the next game.' }, 1, 'Detail');
    },

    detail() {
        if (typeof LegacySettings === 'undefined') return 'simple';
        const value = LegacySettings.get('franciumMapDetail');
        return ['off', 'simple', 'ultra'].includes(value) ? value : LegacySettings.get('franciumSimpleMap', true) ? 'simple' : 'off';
    },

    patch() {
        if (this.patched || typeof addMeshToMapHelper !== 'function') return;
        this.patched = true;
        const plugin = this, add = addMeshToMapHelper;
        addMeshToMapHelper = function (mesh, cells) {
            const state = mesh && plugin.scenes.get(mesh.getScene());
            const visual = state?.enabled ? plugin.visual(mesh, state) : mesh;
            return add.call(this, visual, cells);
        };
    },

    begin(scene) {
        if (!scene || scene.isDisposed) return;
        this.settings(); this.patch();
        const previous = this.scenes.get(scene);
        if (previous) previous.meshes.forEach(mesh => { if (mesh && !mesh.isDisposed()) mesh.dispose(); });
        const detail = this.detail(), state = { enabled: detail !== 'off', detail, meshes: new Map() };
        this.scenes.set(scene, state);
        if (!previous) scene.onDisposeObservable.add(() => {
            this.scenes.get(scene)?.meshes.clear(); this.scenes.delete(scene);
        });
    },

    visual(source, state) {
        if (state.meshes.has(source)) return state.meshes.get(source) || source;
        const type = source.colliderType || source.name.split('.')[2];
        const ultra = state.detail === 'ultra';
        if ((!ultra && !['full', 'wedge', 'iwedge', 'aabb'].includes(type)) || !source.getTotalVertices() || !source.getTotalIndices()) {
            state.meshes.set(source, null); return source;
        };
        let min = new BABYLON.Vector3(-.5, -.5, -.5), max = new BABYLON.Vector3(.5, .5, .5), transform;
        if (type === 'aabb' || ultra && !['full', 'wedge', 'iwedge'].includes(type)) {
            const collider = source.colliderMesh;
            if (collider) {
                source.computeWorldMatrix(true); collider.computeWorldMatrix(true);
                const relative = collider.getWorldMatrix().multiply(BABYLON.Matrix.Invert(source.getWorldMatrix()));
                const bounds = collider.getBoundingInfo().boundingBox;
                if (type === 'aabb') {
                    min = new BABYLON.Vector3(Infinity, Infinity, Infinity); max = min.negate();
                    for (const corner of bounds.vectors) {
                        const point = BABYLON.Vector3.TransformCoordinates(corner, relative);
                        min.minimizeInPlace(point); max.maximizeInPlace(point);
                    };
                } else {
                    min = bounds.minimum.clone(); max = bounds.maximum.clone(); transform = relative;
                };
            } else if (ultra) {
                const bounds = source.getBoundingInfo().boundingBox;
                min = bounds.minimum.clone(); max = bounds.maximum.clone();
            } else { state.meshes.set(source, null); return source; };
            if (ultra) for (const axis of ['x', 'y', 'z']) {
                if (max[axis] - min[axis] < .001) {
                    const center = (min[axis] + max[axis]) / 2;
                    min[axis] = center - .0005; max[axis] = center + .0005;
                };
            };
        };
        if (![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) ||
            Math.min(max.x - min.x, max.y - min.y, max.z - min.z) < 1e-6) {
            state.meshes.set(source, null); return source;
        };
        const data = type === 'wedge' || type === 'iwedge' ? this.wedge(type === 'iwedge') :
            BABYLON.VertexData.CreateBox({ width: max.x - min.x, height: max.y - min.y, depth: max.z - min.z });
        if (type !== 'wedge' && type !== 'iwedge') for (let i = 0; i < data.positions.length; i += 3) {
            data.positions[i] += (min.x + max.x) / 2;
            data.positions[i + 1] += (min.y + max.y) / 2;
            data.positions[i + 2] += (min.z + max.z) / 2;
        };
        if (transform) {
            const normalMatrix = BABYLON.Matrix.Transpose(BABYLON.Matrix.Invert(transform));
            for (let i = 0; i < data.positions.length; i += 3) {
                BABYLON.Vector3.TransformCoordinates(BABYLON.Vector3.FromArray(data.positions, i), transform).toArray(data.positions, i);
                BABYLON.Vector3.TransformNormal(BABYLON.Vector3.FromArray(data.normals, i), normalMatrix).normalize().toArray(data.normals, i);
            };
            if (transform.determinant() < 0) for (let i = 0; i < data.indices.length; i += 3) {
                [data.indices[i + 1], data.indices[i + 2]] = [data.indices[i + 2], data.indices[i + 1]];
            };
        };
        this.texture(source, data);
        const mesh = new BABYLON.Mesh('francium-simple-' + source.uniqueId, source.getScene());
        data.applyToMesh(mesh);
        mesh.material = source.material; mesh.isPickable = false; mesh.setEnabled(false); mesh.freezeWorldMatrix();
        state.meshes.set(source, mesh);
        return mesh;
    },

    wedge(inverse) {
        const data = new BABYLON.VertexData();
        data.positions = []; data.indices = []; data.normals = []; data.uvs = [];
        const a = [-.5, -.5, -.5], b = [.5, -.5, -.5], c = [-.5, -.5, .5], d = [.5, -.5, .5], e = [-.5, .5, .5], f = [.5, .5, .5];
        const faces = [[a, b, d, c], [c, d, f, e], [a, c, e], [b, f, d], [a, e, f, b]];
        const normals = [[0, -1, 0], [0, 0, 1], [-1, 0, 0], [1, 0, 0], [0, Math.SQRT1_2, -Math.SQRT1_2]];
        faces.forEach((face, index) => {
            const start = data.positions.length / 3, firstIndex = data.indices.length;
            const normal = normals[index].map(value => inverse ? -value : value);
            face.forEach(point => {
                data.positions.push(...point.map(value => inverse ? -value : value));
                data.normals.push(...normal); data.uvs.push(0, 0);
            });
            for (let i = 1; i < face.length - 1; i++) data.indices.push(start, start + i, start + i + 1);
            const calculated = [];
            BABYLON.VertexData.ComputeNormals(data.positions, data.indices.slice(firstIndex), calculated);
            if (normal[0] * calculated[start * 3] + normal[1] * calculated[start * 3 + 1] + normal[2] * calculated[start * 3 + 2] < 0) {
                for (let i = firstIndex; i < data.indices.length; i += 3) [data.indices[i + 1], data.indices[i + 2]] = [data.indices[i + 2], data.indices[i + 1]];
            };
        });
        return data;
    },

    closest(point, a, b, c, out) {
        const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
        const acx = c[0] - a[0], acy = c[1] - a[1], acz = c[2] - a[2];
        const apx = point[0] - a[0], apy = point[1] - a[1], apz = point[2] - a[2];
        const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
        const bpx = point[0] - b[0], bpy = point[1] - b[1], bpz = point[2] - b[2];
        const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
        const cpx = point[0] - c[0], cpy = point[1] - c[1], cpz = point[2] - c[2];
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        const vc = d1 * d4 - d3 * d2, vb = d5 * d2 - d1 * d6, va = d3 * d6 - d5 * d4;
        let v = 0, w = 0;
        if (d1 <= 0 && d2 <= 0) { /*a*/ }
        else if (d3 >= 0 && d4 <= d3) v = 1;
        else if (vc <= 0 && d1 >= 0 && d3 <= 0) v = d1 / (d1 - d3);
        else if (d6 >= 0 && d5 <= d6) w = 1;
        else if (vb <= 0 && d2 >= 0 && d6 <= 0) w = d2 / (d2 - d6);
        else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { w = (d4 - d3) / (d4 - d3 + d5 - d6); v = 1 - w; }
        else { const sum = va + vb + vc; if (Math.abs(sum) > 1e-20) { v = vb / sum; w = vc / sum; }; };
        const u = 1 - v - w;
        out[0] = u; out[1] = v; out[2] = w;
        out[3] = (a[0] * u + b[0] * v + c[0] * w - point[0]) ** 2 +
            (a[1] * u + b[1] * v + c[1] * w - point[1]) ** 2 + (a[2] * u + b[2] * v + c[2] * w - point[2]) ** 2;
    },

    texture(source, data) {
        const positions = source.getVerticesData(BABYLON.VertexBuffer.PositionKind), indices = source.getIndices();
        const uv = source.getVerticesData(BABYLON.VertexBuffer.UVKind);
        let colors = source.getVerticesData(BABYLON.VertexBuffer.ColorKind);
        const normals = source.getVerticesData(BABYLON.VertexBuffer.NormalKind);
        if (!positions || !indices) return;
        const hasUV = uv?.length >= positions.length / 3 * 2, defaultUV = data.uvs || [];
        if (colors && colors.length < positions.length / 3 * 4) colors = null;
        const triangles = [], out = [], chosen = [];
        for (let i = 0; i < indices.length; i += 3) {
            const ids = [indices[i], indices[i + 1], indices[i + 2]];
            const vertices = ids.map(id => [positions[id * 3], positions[id * 3 + 1], positions[id * 3 + 2]]);
            const cross = BABYLON.Vector3.Cross(BABYLON.Vector3.FromArray(vertices[1]).subtract(BABYLON.Vector3.FromArray(vertices[0])),
                BABYLON.Vector3.FromArray(vertices[2]).subtract(BABYLON.Vector3.FromArray(vertices[0])));
            if (cross.lengthSquared() < 1e-16) continue;
            const normal = new BABYLON.Vector3();
            if (normals?.length >= positions.length) ids.forEach(id => normal.addInPlace(new BABYLON.Vector3(normals[id * 3], normals[id * 3 + 1], normals[id * 3 + 2])));
            else normal.copyFrom(cross);
            if (normal.lengthSquared() < 1e-16) continue;
            normal.normalize(); triangles.push({ ids, vertices, normal });
        };
        data.uvs = []; data.colors = [];
        for (let i = 0; i < data.positions.length; i += 3) {
            const point = data.positions.slice(i, i + 3), normal = data.normals.slice(i, i + 3);
            let best = Infinity, selected = null;
            for (const triangle of triangles) {
                this.closest(point, ...triangle.vertices, out);
                const dot = normal[0] * triangle.normal.x + normal[1] * triangle.normal.y + normal[2] * triangle.normal.z;
                const score = out[3] + (1 - dot) * .05;
                if (score < best) { best = score; selected = triangle; chosen[0] = out[0]; chosen[1] = out[1]; chosen[2] = out[2]; };
            };
            if (!selected) { data.uvs.push(0, 0); data.colors.push(1, 1, 1, 1); continue; };
            for (let axis = 0; axis < 2; axis++) data.uvs.push(hasUV ?
                selected.ids.reduce((sum, id, j) => sum + uv[id * 2 + axis] * chosen[j], 0) : defaultUV[i / 3 * 2 + axis] || 0);
            for (let axis = 0; axis < 4; axis++) data.colors.push(colors ?
                selected.ids.reduce((sum, id, j) => sum + colors[id * 4 + axis] * chosen[j], 0) : 1);
        };
    },
};
