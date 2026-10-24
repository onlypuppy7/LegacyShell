//a separate scene, so looking at someone never redresses your own egg
export class LegacyProfilePreview {
    constructor(canvas, profile, onReady, onError) {
        this.canvas = canvas;
        this.dead = false;
        this.yaw = this.pitch = 0;
        try {
            this.engine = engine;
            this.context = canvas.getContext('2d');
            //new actors still use Babylon's default scene, keep that pointing at the game
            this.scene = new BABYLON.Scene(this.engine);
            this.engine.scenes.unshift(this.engine.scenes.pop());
            this.scene.renderTargetsEnabled = false;
            this.scene.postProcessesEnabled = false;
            this.scene.sunLight = { direction: new BABYLON.Vector3(.2, 1, .1), diffuse: BABYLON.Color3.White() };
            this.background();
            this.camera = new BABYLON.ArcRotateCamera('profileCamera', Math.PI / 2, 1.5, 2.7, new BABYLON.Vector3(0, .4, 0), this.scene);
            this.camera.fov = .5;
            this.camera.minZ = .1;
            this.camera.maxZ = 100;
            this.camera.lowerRadiusLimit = 2;
            this.camera.upperRadiusLimit = 6;
            this.camera.lowerAlphaLimit = this.camera.upperAlphaLimit = Math.PI / 2;
            this.camera.lowerBetaLimit = this.camera.upperBetaLimit = 1.5;
            this.camera.panningSensibility = 0;
            this.camera.inertia = 0;
            this.camera.angularSensibilityX = 100;
            this.camera.angularSensibilityY = 150;
            this.controls();
            this.materials();
            this.target = new BABYLON.RenderTargetTexture('profileRender', { width: 1, height: 1 }, this.scene, false);
            this.resize = new ResizeObserver(() => { if (!this.dead) this.resizeTarget(); });
            this.resize.observe(canvas.parentElement);
            this.theme();
            this.themeObserver = new MutationObserver(() => this.theme());
            this.themeObserver.observe(document.head, { childList: true });
            this.visible = true;
            this.visibility = new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; });
            this.visibility.observe(canvas);
            this.ready = this.load(profile);
            this.ready.then(() => {
                if (this.dead) return;
                this.resizeTarget();
                this.renderFrame = () => {
                    const now = performance.now();
                    if (document.hidden || !this.visible) return;
                    if (!this.dirty && now - (this.lastFrame || 0) < 32) return;
                    this.lastFrame = now;
                    this.dirty = false;
                    try {
                        if (this.actor?.skeleton) PlayerActor.prototype.handsToWeaponSkeleton.call(this.actor);
                        this.render();
                    } catch (error) { this.dispose(); onError(error); };
                };
                this.engine.runRenderLoop(this.renderFrame);
                onReady();
            }).catch(error => { if (!this.dead) { this.dispose(); onError(error); }; });
        } catch (error) {
            this.dispose();
            onError(error);
        };
    };

    background() {
        const scene = this.scene;
        scene.clearColor = scene.fogColor = Customizer.skyColor;
        scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogDensity = .06;
        const top = new BABYLON.DirectionalLight('profileTop', new BABYLON.Vector3(0, -1, 0), scene);
        top.intensity = 1;
        this.shadow = new BABYLON.ShadowGenerator(1024, top);
        this.shadow.useBlurExponentialShadowMap = true;
        this.shadow.frustumEdgeFalloff = 1;
        this.shadow.blurScale = 2;
        this.shadow.blurBoxOffset = 1;
        const sky = new BABYLON.HemisphericLight('profileSky', new BABYLON.Vector3(.25, 1, -.5), scene);
        sky.intensity = .8;
        const bounce = new BABYLON.HemisphericLight('profileBounce', new BABYLON.Vector3(0, -1, 0), scene);
        bounce.intensity = .5;
        bounce.diffuse = new BABYLON.Color3(.6, .8, 1);
        const material = new BABYLON.StandardMaterial('profileGround', scene);
        material.diffuseColor = Customizer.diffuseColor;
        material.specularColor = BABYLON.Color3.Black();
        const ground = this.ground = BABYLON.Mesh.CreatePlane('profileGround', 100, scene);
        ground.rotation.x = Math.PI / 2;
        ground.material = material;
        ground.receiveShadows = true;
        ground.isPickable = false;
    };

    theme() {
        this.blueBackdrop = getComputedStyle(this.canvas).getPropertyValue('--lp-preview-backdrop').trim() === 'blue';
        this.ground.setEnabled(!this.blueBackdrop);
        this.scene.clearColor = this.blueBackdrop ? new BABYLON.Color4(0, 0, 0, 0) : Customizer.skyColor;
        this.dirty = true;
    };

    controls() {
        const canvas = this.canvas;
        const camera = this.camera;
        this.listeners = [];
        const listen = (name, callback, options) => {
            canvas.addEventListener(name, callback, options);
            this.listeners.push([name, callback, options]);
        };
        listen('pointerdown', event => {
            if (event.button !== 0 || this.pointer) return;
            event.preventDefault();
            canvas.setPointerCapture(event.pointerId);
            this.pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
        });
        listen('pointermove', event => {
            const pointer = this.pointer;
            if (!pointer || pointer.id !== event.pointerId || !this.root) return;
            this.yaw -= (event.clientX - pointer.x) / camera.angularSensibilityX;
            this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch + (event.clientY - pointer.y) / camera.angularSensibilityY));
            this.root.rotationQuaternion = BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Right(), this.pitch)
                .multiply(BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(), this.yaw));
            pointer.x = event.clientX;
            pointer.y = event.clientY;
            this.dirty = true;
        });
        const release = event => {
            if (this.pointer?.id !== event.pointerId) return;
            this.pointer = null;
            if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        };
        for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) listen(name, release);
        listen('wheel', event => {
            event.preventDefault();
            camera.radius = Math.max(camera.lowerRadiusLimit, Math.min(camera.upperRadiusLimit, camera.radius + Math.sign(event.deltaY) * .2));
            this.dirty = true;
        }, { passive: false });
    };

    resizeTarget() {
        const bounds = this.canvas.getBoundingClientRect();
        const scale = Math.min(window.devicePixelRatio || 1, 1.5, 512 / Math.max(bounds.width, bounds.height, 1));
        const width = Math.max(1, Math.round(bounds.width * scale));
        const height = Math.max(1, Math.round(bounds.height * scale));
        if (this.image?.width === width && this.image.height === height) return;
        this.canvas.width = width;
        this.canvas.height = height;
        this.target.resize({ width, height });
        this.image = this.context.createImageData(width, height);
        this.pixels = new Uint8Array(this.image.data.buffer);
        this.row = new Uint8Array(width * 4);
        this.dirty = true;
    };

    render() {
        const viewport = this.engine.currentViewport;
        const texture = this.target.getInternalTexture();
        try {
            if (!this.blueBackdrop) {
                this.scene.incrementRenderId();
                for (const mesh of this.shadow.getShadowMap().renderList) mesh.computeWorldMatrix(true);
                this.scene.updateTransformMatrix(true);
                this.shadow.getShadowMap().render(false);
            };
            this.engine.bindFramebuffer(texture);
            this.scene.render();
            this.target.readPixels(0, 0, this.pixels);
        } finally {
            this.engine.unBindFramebuffer(texture);
            if (viewport) this.engine.setViewport(viewport);
        };
        const stride = this.image.width * 4;
        for (let y = 0; y < Math.floor(this.image.height / 2); y++) {
            const top = y * stride;
            const bottom = (this.image.height - y - 1) * stride;
            this.row.set(this.pixels.subarray(top, top + stride));
            this.pixels.copyWithin(top, bottom, bottom + stride);
            this.pixels.set(this.row, bottom);
        };
        this.context.putImageData(this.image, 0, 0);
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
        this.root.setPivotPoint(new BABYLON.Vector3(0, .32, 0));
        const body = this.clone('egg', this.root);
        body.position.y = .32;
        body.material = this.eggMaterial;
        this.shadow.getShadowMap().renderList.push(body);
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
        this.themeObserver?.disconnect();
        this.visibility?.disconnect();
        for (const [name, callback, options] of this.listeners || []) this.canvas.removeEventListener(name, callback, options);
        if (this.pointer && this.canvas.hasPointerCapture(this.pointer.id)) this.canvas.releasePointerCapture(this.pointer.id);
        this.pointer = null;
        if (this.renderFrame) this.engine.stopRenderLoop(this.renderFrame);
        this.shadow?.dispose();
        this.scene?.dispose();
    };
};
