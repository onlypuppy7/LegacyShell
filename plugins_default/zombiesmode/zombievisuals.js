// What a zombie looks like (browser only; spliced into the client bundle next to shared.js, and loaded by a model viewer page while
// working on it, so it is plain script with no imports): no gun, both hands the open hand from the model held out in front, and a
// stumble instead of the egg's even wobble. It works on a PlayerActor from outside, by hooks that shared.js puts on it.
//
// The model's `hands` mesh is two hands in one skinned mesh: gripHand (the right hand, closed round a gun's grip) and foreHand (the left
// hand, open under the foregrip). A zombie's hands mesh is made once from that data: the left hand, plus a mirrored copy of it standing
// in for the right hand (skinned to gripHand), and the bones are posed rather than following a gun.

const ZombieVisuals = {
    // The pose of the left hand. The hand itself is turned square (see poseBones: fingers straight forward, palm down, thumb in), then
    // yaw turns it a little further in (radians), droop tips it down at the wrist, and x/y/z is where its centre goes, in the space the
    // gun is held in (x is to the player's right, y up, z forward).
    pose: { yaw: 0.08, droop: 0.25, x: -0.16, y: 0.03, z: 0.42 },

    // ---- the hands mesh --------------------------------------------------------------------------------------------------------

    // Vertex data for the zombie hands, from the model's own `hands` mesh (cached): the left hand (bone foreHand) as it is, and a
    // mirror of it across x = 0 skinned to the other hand's bone, with the winding turned round so it still faces out.
    template(scene) {
        if (this.cached) return this.cached;
        var source = scene.getMeshByName("hands");
        if (!source) return null;
        var kind = BABYLON.VertexBuffer;
        var pos = source.getVerticesData(kind.PositionKind), nor = source.getVerticesData(kind.NormalKind), col = source.getVerticesData(kind.ColorKind);
        var bones = source.getVerticesData(kind.MatricesIndicesKind), index = source.getIndices();
        var foreBone = source.skeleton.getBoneIndexByName("foreHand"), gripBone = source.skeleton.getBoneIndexByName("gripHand");
        var total = pos.length / 3;

        var left = []; //the vertices of the left hand, and where each went in the new list
        var where = new Array(total).fill(-1);
        for (var v = 0; v < total; v++) if (Math.round(bones[v * 4]) === foreBone) { where[v] = left.length; left.push(v); };
        var n = left.length;

        var positions = [], normals = [], colors = [], matrices = [], weights = [], triangles = [];
        for (var side = 0; side < 2; side++) {
            for (var i = 0; i < n; i++) {
                var from = left[i], flip = side ? -1 : 1;
                positions.push(pos[from * 3] * flip, pos[from * 3 + 1], pos[from * 3 + 2]);
                normals.push(nor[from * 3] * flip, nor[from * 3 + 1], nor[from * 3 + 2]);
                colors.push(col ? col[from * 4] : 1, col ? col[from * 4 + 1] : 1, col ? col[from * 4 + 2] : 1, col ? col[from * 4 + 3] : 1);
                matrices.push(side ? gripBone : foreBone, 0, 0, 0);
                weights.push(1, 0, 0, 0);
            };
        };
        for (var t = 0; t < index.length; t += 3) {
            var a = where[index[t]], b = where[index[t + 1]], c = where[index[t + 2]];
            if (a < 0 || b < 0 || c < 0) continue;
            triangles.push(a, b, c, a + n, c + n, b + n);
        };

        return this.cached = { positions: positions, normals: normals, colors: colors, matrices: matrices, weights: weights, triangles: triangles, foreBone: foreBone, gripBone: gripBone };
    },

    // A hands mesh for this actor, sharing the actor's own skeleton, standing in for actor.hands.
    makeHands(actor) {
        var data = this.template(actor.scene);
        if (!data) return null;
        var mesh = new BABYLON.Mesh("zombieHands", actor.scene);
        var kind = BABYLON.VertexBuffer;
        mesh.setVerticesData(kind.PositionKind, data.positions, false);
        mesh.setVerticesData(kind.NormalKind, data.normals, false);
        mesh.setVerticesData(kind.ColorKind, data.colors, false);
        mesh.setVerticesData(kind.MatricesIndicesKind, data.matrices, false);
        mesh.setVerticesData(kind.MatricesWeightsKind, data.weights, false);
        mesh.setIndices(data.triangles);
        mesh.numBoneInfluencers = 1;
        mesh.skeleton = actor.hands.skeleton;
        mesh.material = actor.hands.material;
        mesh.parent = actor.hands.parent;
        mesh.alwaysSelectAsActiveMesh = true; //skinned: the bounds of the bind pose say nothing about where it is now
        return mesh;
    },

    // ---- the pose --------------------------------------------------------------------------------------------------------------

    // The left hand's bone is set so the hand is rotated about its own centre by pose.r* and moved to pose.x/y/z; the right hand's bone so
    // the mirror copy follows it exactly mirrored. (A vertex v of bone b is drawn at v * inverse(bind b) * current b, so with `G` the move we
    // want for the left hand, the left bone is bind * G and the right one, whose vertices are the left's mirrored by S, is bind * S * G * S.)
    poseBones(skeleton, data, pose) {
        pose = pose || this.pose;
        var fore = skeleton.bones[data.foreBone], grip = skeleton.bones[data.gripBone];
        if (!this.bind) { //each bone's bind pose and the centre of the left hand, as they are before anything poses them
            var m = (bone) => bone.getBaseMatrix().clone();
            this.bind = { fore: m(fore), grip: m(grip) };
            var c = [0, 0, 0];
            for (var i = 0; i < data.positions.length / 6; i++) { c[0] += data.positions[i * 3]; c[1] += data.positions[i * 3 + 1]; c[2] += data.positions[i * 3 + 2]; };
            var n = data.positions.length / 6;
            this.centre = new BABYLON.Vector3(c[0] / n, c[1] / n, c[2] / n);
        };
        var M = BABYLON.Matrix;
        if (!this.square) {
            // The hand square on. The left hand's bone is the model's own frame for it: its rows (in gun space) are the hand's local x, y and z
            // axes, and at bind the fingers point along local +z and the thumb along local +y (read off the bind pose: the fingers point
            // back along the gun, the thumb across it). The bone is a mirror (determinant -1: the left hand is the right one flipped), so the
            // only proper rotation that puts the fingers forward (+z) and the thumb inward (+x, for a left hand) is local x -> up, y -> +x,
            // z -> +z, and as it is a left hand that has to be the palm down. (Rows of a matrix are where the basis vectors go.)
            var r = this.bind.fore.m;
            var frame = M.FromValues(r[0], r[1], r[2], 0, r[4], r[5], r[6], 0, r[8], r[9], r[10], 0, 0, 0, 0, 1);
            var target = M.FromValues(0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
            this.square = frame.transpose().multiply(target);
        };
        var turn = this.square.multiply(M.RotationY(pose.yaw || 0)).multiply(M.RotationX(pose.droop || 0));
        var size = pose.size || 1;
        var G = M.Translation(-this.centre.x, -this.centre.y, -this.centre.z).multiply(M.Scaling(size, size, size)).multiply(turn).multiply(M.Translation(pose.x, pose.y, pose.z));
        var S = M.Scaling(-1, 1, 1);
        var left = this.bind.fore.multiply(G);
        var right = this.bind.grip.multiply(S).multiply(G).multiply(S);
        fore.getLocalMatrix().copyFrom(left); fore.markAsDirty();
        grip.getLocalMatrix().copyFrom(right); grip.markAsDirty();
    },

    // ---- hooked onto the actors ------------------------------------------------------------------------------------------------

    // The horde: everyone on team 2 in a zombies room (the bots, and the humans who have been infected).
    isZombie(actor) {
        return typeof gameOptions !== "undefined" && !!(gameOptions.plugins && gameOptions.plugins.zombies) && actor.player.team === 2;
    },

    // Ghosts are the horde's players with noclip (the server sets it on them and nothing else in the gamemode: the modifier is synced to everyone).
    isGhost(actor) {
        return !!actor.player.modifiers.noclip;
    },

    // The brutish have the resistance to show it (nothing else on the horde has more than 1, and it is synced like the scale), the small are small.
    isBrutish(actor) {
        return actor.player.modifiers.resistanceModifier > 1.05 && !this.isGhost(actor);
    },

    // Called after each of the actor's updates for a zombie: the open mirrored hands in place of the model's, no gun, the stumble.
    apply(actor, delta) {
        if (!actor.zombieHands) {
            var made = this.makeHands(actor);
            if (!made) return; //the model has no hands mesh (not expected)
            actor.zombieHands = made;
        };
        var hands = actor.hands, mine = actor.zombieHands;
        hands.setEnabled(false);
        mine.setEnabled(true);
        mine.renderingGroupId = hands.renderingGroupId; //(the player's own are drawn over the world)
        mine.colorMult = hands.colorMult; //the egg's colour, read by the material
        mine.renderOverlay = hands.renderOverlay; mine.overlayAlpha = hands.overlayAlpha; mine.overlayColor = hands.overlayColor; //the spawn shield

        var weapons = actor.player.weapons || [];
        for (var i = 0; i < weapons.length; i++) if (weapons[i].actor && weapons[i].actor.gunMesh) weapons[i].actor.gunMesh.setEnabled(false); //the game shows the one in hand again whenever it is equipped

        this.ghostly(actor, this.isGhost(actor));
        if (this.isGhost(actor)) return this.float(actor); //(no stumble: it does not walk)

        //How far through the stumble it is. The game's own walk cycle (player.bobble) is no use for this: it wraps at a full turn, and anything
        //that is not a whole number of beats per turn jumps there (which is what made the first stumble lean one way). This keeps counting, at
        //about the pace of the walking, and only moves when the zombie does.
        actor.zPhase = (actor.zPhase || 0) + (delta || 1) * 7 * actor.bobbleIntensity * 0.7;

        this.stumble(actor);
    },

    // A ghost is see-through: its body, hands and hat get a copy of their material with the GHOSTALPHA define (the pixel shader gives that
    // part of its alpha: see shaderSources in index.js) and alpha blending. Back to the originals when it is not one (the same actor can be a
    // zombie next round).
    ghostly(actor, on) {
        var meshes = [[actor.bodyMesh, 0.65], [actor.zombieHands, 0.65]]; //(and how opaque each is: the hat reads as more solid than the egg at the same alpha, so it gets less)
        if (actor.hat) {
            meshes.push([actor.hat, 0.55]);
            var parts = actor.hat.getChildMeshes ? actor.hat.getChildMeshes() : [];
            for (var p = 0; p < parts.length; p++) meshes.push([parts[p], 0.55]);
        };
        for (var i = 0; i < meshes.length; i++) {
            var mesh = meshes[i][0], alpha = meshes[i][1];
            if (!mesh) continue;
            if (on) {
                var original = mesh.zOriginalMaterial || mesh.material;
                if (!original || !original._options || mesh.material !== original) continue; //(already done, or not a shader material)
                mesh.zOriginalMaterial = original;
                mesh.material = this.ghostMaterial(original, alpha);
            } else if (mesh.zOriginalMaterial) {
                mesh.material = mesh.zOriginalMaterial;
                mesh.zOriginalMaterial = null;
            };
        };
    },

    ghostMaterial(original, alpha) {
        this.ghostMaterials = this.ghostMaterials || new Map();
        var key = original.uniqueId !== undefined ? original.uniqueId + "@" + alpha : original.name + "@" + alpha;
        var made = this.ghostMaterials.get(key);
        if (made) return made;
        var options = Object.assign({}, original._options, { needAlphaBlending: true, defines: (original._options.defines || []).concat(["#define GHOSTALPHA " + alpha]) });
        made = new BABYLON.ShaderMaterial(original.name + "Ghost", original.getScene(), original._shaderPath, options);
        made.onBind = original.onBind;
        made.backFaceCulling = original.backFaceCulling;
        this.ghostMaterials.set(key, made);
        return made;
    },

    // How far into a walk: 0 standing still, 1 at a full walk (the egg's own bobbling scales by the same number, about 0.02 at a walk).
    gait(actor) {
        return Math.min(1, actor.bobbleIntensity / 0.015);
    },

    // The egg's even side-to-side wobble and bounce replaced by a lurch. One turn of the phase is a left step and a right: the egg rolls over
    // one way then the other (some steps worse than others, with a harsher second beat), hunches forward and nods, twists against the roll,
    // and drops hard on the heavy side, as if that foot were being dragged. Everything but the hunch averages out to nothing, so it goes both
    // ways. Standing, a zombie only sways a little. (Called after the actor's own update has set the wobble, so this overwrites it.)
    stumble(actor) {
        var body = actor.bodyMesh, ph = actor.zPhase || 0, k = this.gait(actor), id = actor.player.id;
        var lurch = 1 + 0.35 * Math.sin(ph * 0.31 + id);
        var roll = Math.sin(ph) + 0.25 * Math.sin(3 * ph + 0.8);
        var heavy = 0.5 - 0.5 * Math.sin(ph);
        body.rotation.z = k * 0.3 * lurch * roll + (1 - k) * 0.04 * Math.sin(Date.now() / 800 + id);
        body.rotation.x += k * (0.18 + 0.1 * Math.sin(2 * ph + 0.5));
        body.rotation.y = -k * 0.2 * Math.sin(ph + 0.4);
        body.position.y = 0.32 + k * (0.01 - 0.05 * heavy * heavy);
    },

    // A ghost does not walk, it floats along: leaning forward a little, a little off the ground, bobbing and swaying slowly.
    float(actor) {
        var body = actor.bodyMesh, t = Date.now() / 1000, id = actor.player.id;
        body.rotation.x += 0.22;
        body.rotation.z = 0.05 * Math.sin(t * 1.7 + id);
        body.rotation.y = 0.08 * Math.sin(t * 1.1 + id * 2);
        body.position.y = 0.36 + 0.035 * Math.sin(t * 2.2 + id);
    },

    // Instead of following the gun: the arms out in front, swaying and drooping a little with the steps (a ghost's, with the bobbing).
    poseArms(actor) {
        var ph = actor.zPhase || 0, k = this.gait(actor);
        var pose = Object.assign({}, this.pose);
        if (this.isBrutish(actor)) pose.size = 1.6;
        if (this.isGhost(actor)) {
            pose.y += 0.02 * Math.sin(Date.now() / 1000 * 2.2 + actor.player.id + 0.5);
            return this.poseBones(actor.hands.skeleton, this.template(actor.scene), pose);
        };
        pose.y += k * 0.025 * Math.sin(ph + 0.5);
        pose.z += k * 0.02 * Math.sin(2 * ph);
        pose.droop += k * 0.12 * Math.sin(ph + 1);
        this.poseBones(actor.hands.skeleton, this.template(actor.scene), pose);
    },

    // No longer on the horde (cured at the start of a round): the model's own hands and the gun back, and the egg upright.
    revert(actor) {
        this.ghostly(actor, false);
        actor.zombieHands.setEnabled(false);
        actor.hands.setEnabled(true);
        actor.bodyMesh.rotation.y = 0;
        var weapon = actor.player.weapon;
        if (weapon && weapon.actor && weapon.actor.gunMesh) weapon.actor.gunMesh.setEnabled(true);
        actor.zombieHands.dispose();
        actor.zombieHands = null;
    },
};
