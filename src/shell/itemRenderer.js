//legacyshell: item tile renderer (browser-only)
// Extracted from server-client/src/client-static/src/shellshock.min.js's ItemRenderer.
import { loadMeshes } from '#loading';
import { devlog, stampSize, itemRendererBabylons } from '#constants';

export function ItemRenderer(onMeshesReady) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.canvas.style.position = "fixed";
    this.canvas.style.top = "-100em";
    this.canvas.style.left = "1em";
    document.body.appendChild(this.canvas);
    this.engine = new BABYLON.Engine(this.canvas, true, null, false);
    this.scene = new BABYLON.Scene(this.engine);
    this.scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);
    this.meshes = {
        Skeletons: {}
    };
    this.scene.sunLight = {
        direction: new BABYLON.Vector3(0.2, 1, 0.1),
        diffuse: new BABYLON.Color3.White()
    };
    loadMaterials(this.scene);
    devlog("loading meshes for item renderer");
    loadMeshes(this.scene, itemRendererBabylons, null, onMeshesReady || function () {});
    this.stampSprites = new BABYLON.SpriteManager("", "img/stamps.png?v=LEGACYSHELLSTAMPSPNG", 256000, stampSize, this.scene);
    this.camera = new BABYLON.ArcRotateCamera("", 0, 0, 0, new BABYLON.Vector3(0, 0, 0), this.scene);
    this.scene.activeCameras.push(this.camera);
    this.camera.fov = .5;
    this.camera.maxZ = 100;
    this.camera.minZ = .1;
};
ItemRenderer.prototype.renderToCanvas = function (meshName, destCanvas, cam) {
    this.engine.clear();
    this.camera.alpha = 0;
    this.camera.beta = Math.PI90;
    this.camera.radius = cam.radius || 1;
    cam.y;
    try {
        var mesh = this.scene.getMeshByName(meshName).clone();
        cam.primaryGun ? (mesh.rotation.x = -.7, mesh.position.y = -.1, mesh.position.z = -.1) : cam.secondaryGun ? (mesh.position.z = -0.32, mesh.position.y = .05) : (mesh.position.y = -.25, mesh.rotation.y = 2, mesh.rotation.x = .25), mesh.computeWorldMatrix();
        var verts = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        this.scene.updateTransformMatrix();
        for (var min = {
            x: 1e4,
            y: 1e4
        }, max = {
            x: -1e4,
            y: -1e4
        }, i = 0; i < verts.length; i += 3) {
            var sp = BABYLON.Vector3.Project(new BABYLON.Vector3(verts[i], verts[i + 1], verts[i + 2]), mesh.getWorldMatrix(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(this.engine));
            min.x = Math.min(min.x, sp.x), max.x = Math.max(max.x, sp.x), min.y = Math.min(min.y, sp.y), max.y = Math.max(max.y, sp.y)
        }
        var cx = (max.x + min.x) / 2 - 128,
            cy = (max.y + min.y) / 2 - 128;
        mesh.position.z -= cx / 512, mesh.position.y += cy / 512, this.scene.render(), mesh.dispose();
        var ctx = destCanvas.getContext("2d");
        ctx.clearRect(0, 0, 256, 256), ctx.drawImage(this.canvas, 0, 0);
    } catch (error) {
        devlog("WARNING: the following mesh wasn't found!", meshName);
    };
};
ItemRenderer.prototype.renderStampToCanvas = function (stampItem, destCanvas) {
    var s = new BABYLON.Sprite("", this.stampSprites);
    var widthheight = this.stampSprites._spriteTexture._texture.width / stampSize
    var x = stampItem.item_data.x;
    var y = stampItem.item_data.y;

    s.cellIndex = x + widthheight * y;
    s.size = 1;
    this.camera.alpha = 0;
    this.camera.beta = 0;
    this.camera.radius = 2.5;
    this.scene.render();
    s.dispose();

    var ctx = destCanvas.getContext("2d");
    ctx.clearRect(0, 0, 256, 256), ctx.drawImage(this.canvas, 0, 0)
};
