//a separate scene, so looking at someone never redresses your own egg
export class LegacyProfilePreview {
    constructor(canvas, profile, onReady, onError) {
        this.canvas = canvas;
        this.dead = false;
        try {
            this.engine = new BABYLON.Engine(canvas, true, { alpha: true }, false);
            //new actors still use Babylon's default scene, keep that pointing at the game
            const engines = BABYLON.Engine.Instances;
            if (engines.length > 1) engines.unshift(engines.splice(engines.indexOf(this.engine), 1)[0]);
            this.engine.setHardwareScalingLevel(Math.max(1, (window.devicePixelRatio || 1) / 1.5));
            this.scene = new BABYLON.Scene(this.engine);
            this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
            this.scene.sunLight = { direction: new BABYLON.Vector3(.2, 1, .1), diffuse: BABYLON.Color3.White() };
            this.camera = new BABYLON.ArcRotateCamera('profileCamera', 1.2, 1.3, 2.7, new BABYLON.Vector3(0, .42, 0), this.scene);
            this.camera.fov = .5;
            this.camera.minZ = .1;
            this.camera.lowerRadiusLimit = 2;
            this.camera.upperRadiusLimit = 6;
            this.camera.lowerBetaLimit = .5;
            this.camera.upperBetaLimit = 2;
            this.camera.panningSensibility = 0;
            this.scene.attachControl(); //the game's Babylon does not attach scene inputs automatically
            this.camera.attachControl(canvas, true);
            this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput');
            this.materials();
            this.resize = new ResizeObserver(() => { if (!this.dead) this.engine.resize(); });
            this.resize.observe(canvas.parentElement);
            this.visible = true;
            this.visibility = new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; });
            this.visibility.observe(canvas);
            this.ready = this.load(profile);
            this.ready.then(() => {
                if (this.dead) return;
                this.engine.resize();
                this.engine.runRenderLoop(() => {
                    const now = performance.now();
                    if (document.hidden || !this.visible || now - (this.lastFrame || 0) < 32) return;
                    this.lastFrame = now;
                    if (this.actor?.skeleton) PlayerActor.prototype.handsToWeaponSkeleton.call(this.actor);
                    this.scene.render();
                });
                onReady();
            }).catch(error => { if (!this.dead) { this.dispose(); onError(error); }; });
        } catch (error) {
            this.dispose();
            onError(error);
        };
    };

    materials() {
        const scene = this.scene;
        const standard = new BABYLON.ShaderMaterial('standard', scene, 'standard', {
            attributes: ['position', 'normal', 'color', 'uv', 'matricesIndices', 'matricesWeights'],
            uniforms: ['world', 'view', 'viewProjection', 'vFogInfos', 'vFogColor', 'colorMult', 'sunColor'],
            defines: ['#define COLORMULT'],
        });
        standard.onBind = mesh => {
            const effect = standard.getEffect();
            effect.setFloat4('vFogInfos', 0, 0, 100, 0);
            effect.setColor3('vFogColor', BABYLON.Color3.Black());
            effect.setColor3('colorMult', mesh.colorMult || BABYLON.Color3.White());
            effect.setFloat3('sunColor', 1, 1, 1);
            if (mesh.skeleton) effect.setMatrices('mBones', mesh.skeleton.getTransformMatrices(mesh));
        };
        this.standard = standard;
        this.eggMaterial = new BABYLON.ShaderMaterial('profileEgg', scene, 'standard', {
            attributes: ['position', 'normal', 'color', 'uv'],
            uniforms: ['world', 'view', 'viewProjection', 'vFogInfos', 'vFogColor', 'hp', 'cameraPosition', 'outlineColor', 'colorMult', 'stampOffset', 'uvLowerBound', 'uvUpperBound', 'sunColor'],
            defines: ['#define EGGSHELL'],
        });
        const blank = BABYLON.RawTexture.CreateRGBATexture(new Uint8Array(4), 1, 1, scene, false, false);
        this.eggMaterial.setTexture('textureSampler', blank);
        this.eggMaterial.onBind = mesh => {
            const effect = this.eggMaterial.getEffect();
            effect.setFloat4('vFogInfos', 0, 0, 100, 0);
            effect.setColor3('vFogColor', BABYLON.Color3.Black());
            effect.setFloat('hp', 1);
            effect.setColor3('colorMult', mesh.colorMult);
            const pos = this.camera.globalPosition;
            effect.setFloat3('cameraPosition', pos.x, pos.y, pos.z);
            effect.setFloat4('outlineColor', 0, 0, 0, 0);
            effect.setFloat2('stampOffset', this.stampU || 0, this.stampV ?? 1);
            effect.setFloat2('uvLowerBound', 0, 1 - (this.stampCell || 1));
            effect.setFloat2('uvUpperBound', this.stampCell || 1, 1);
            effect.setFloat3('sunColor', 1, 1, 1);
        };
    };

    importFile(name) {
        this.modelLoads = this.modelLoads || new Map();
        if (this.modelLoads.has(name)) return this.modelLoads.get(name);
        const pending = new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Preview timed out')), 15000);
            this.timers = this.timers || [];
            this.timers.push(timer);
            BABYLON.SceneLoader.ImportMesh('', 'models/', name + '.babylon', this.scene, meshes => {
                clearTimeout(timer);
                if (this.dead) return resolve();
                for (const mesh of meshes) { mesh.setEnabled(false); mesh.isPickable = false; };
                resolve();
            }, null, (scene, message) => { clearTimeout(timer); reject(new Error(message)); });
        });
        this.modelLoads.set(name, pending);
        pending.catch(() => this.modelLoads.delete(name));
        return pending;
    };

    clone(name, parent) {
        const source = this.scene.getMeshByName(name);
        if (!source) throw new Error('Preview mesh not found: ' + name);
        const mesh = source.clone('profile.' + name, parent);
        for (const part of [mesh, ...mesh.getChildMeshes()]) {
            part.setEnabled(true);
            part.isPickable = false;
            part.material = this.standard;
        };
        return mesh;
    };

    async load(profile) {
        const loadout = profile.loadout;
        const weapon = catalog.findItemById(loadout.primaryId[loadout.classIdx]);
        const files = ['egg'];
        if (weapon?.item_data?.meshName) files.push(gunFile(weapon.item_data.meshName));
        await Promise.all([...new Set(files)].map(name => this.importFile(name)));
        if (this.dead) return;

        const scene = this.scene;
        this.root = new BABYLON.TransformNode('profileAvatar', scene);
        const body = this.clone('egg', this.root);
        body.position.y = .32;
        body.material = this.eggMaterial;
        const color = BABYLON.Color3.FromHexString(shellColors[loadout.colorIdx] || shellColors[0]);
        this.shellColor = color;
        body.colorMult = color;
        const hat = catalog.findItemById(loadout.hatId);
        if (hat?.item_data?.meshName && scene.getMeshByName(hat.item_data.meshName)) {
            const mesh = this.clone(hat.item_data.meshName, body);
            mesh.position.y = -.02;
        };
        const stamp = catalog.findItemById(loadout.stampId);
        if (stamp) {
            const sheet = new BABYLON.Texture('img/stamps.png?v=LEGACYSHELLSTAMPSPNG', scene, false, false, BABYLON.Texture.NEAREST_SAMPLINGMODE, () => {
                if (this.dead) return;
                const width = sheet.getSize().width / stampSize;
                this.stampCell = 1 / width;
                this.stampU = stamp.item_data.x / width;
                this.stampV = 1 - stamp.item_data.y / width;
                this.eggMaterial.setTexture('textureSampler', sheet);
            });
        };
        this.head = new BABYLON.TransformNode('profileHead', scene);
        this.head.parent = this.root;
        this.head.position.y = .3;
        if (weapon) await this.setWeapon(weapon);
    };

    async setWeapon(weapon) {
        if (this.dead || !weapon) return;
        const generation = this.weaponGeneration = (this.weaponGeneration || 0) + 1;
        await this.importFile(gunFile(weapon.item_data.meshName));
        if (this.dead || generation !== this.weaponGeneration) return;
        const scene = this.scene;
        const handsBase = scene.getSkeletonByName('hands_skeleton');
        const gunBase = scene.getSkeletonByName('gun_' + item_classes[weapon.item_data.class]?.standardMeshName + '_skeleton');
        if (!handsBase || !gunBase) throw new Error('Weapon skeleton not found');
        if (this.actor) {
            scene.stopAnimation(this.actor.skeleton);
            this.actor.skeleton.dispose();
            this.actor.hands.skeleton.dispose();
            this.actor = null;
        };
        this.gunContainer?.dispose();
        const gunContainer = this.gunContainer = new BABYLON.TransformNode('profileGun', scene);
        gunContainer.parent = this.head;
        gunContainer.rotation.set(-.035, -.14, 0);
        const hands = this.clone('hands', gunContainer);
        hands.colorMult = this.shellColor;
        hands.skeleton = handsBase.clone('profileHands');
        const gun = this.clone(weapon.item_data.meshName, gunContainer);
        gun.skeleton = gunBase.clone('profileWeapon');
        this.actor = {
            hands,
            gripBone: hands.skeleton.bones[hands.skeleton.getBoneIndexByName('gripHand')],
            foreBone: hands.skeleton.bones[hands.skeleton.getBoneIndexByName('foreHand')],
        };
        PlayerActor.prototype.setWeaponSkeleton.call(this.actor, gun.skeleton);
        const range = gun.skeleton.getAnimationRange('idle');
        if (range) scene.beginAnimation(gun.skeleton, range.from, range.to, true);
    };

    dispose() {
        if (this.dead) return;
        this.dead = true;
        (this.timers || []).forEach(clearTimeout);
        this.resize?.disconnect();
        this.visibility?.disconnect();
        this.engine?.stopRenderLoop();
        this.scene?.dispose();
        this.engine?.dispose();
    };
};
