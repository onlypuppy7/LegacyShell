//legacyshell: basic
import { isClient, isServer } from "#constants";
//legacyshell: plugins
import { plugins } from '#plugins';
//

export const ClassicSkyboxPlugin = {
    registerListeners: function (pluginManager) {
        console.log("registering listeners... (ClassicSkyboxPlugin)");

        this.plugins = pluginManager;

        if (isClient) {
            this.plugins.on('game:afterBullshit', this.afterBullshit.bind(this));
            this.plugins.on('game:onMapComplete', this.onMapComplete.bind(this));
        };
    },

    afterBullshit: function (data) {
        loadObjectMeshesBabylons.push("sky", "mountains");
    },

    onMapComplete: function (data) {
        var gameScene = data.gameScene;

        if (this.meshes) this.meshes.forEach(mesh => mesh.dispose());
        this.meshes = [];

        var variant = this.variants[minMap.skybox];
        if (!variant) return;

        if (skybox) skybox.setEnabled(false); //the cubemap one

        var cameraMaxZ = gameScene.getCameraByName("camera");
        if (cameraMaxZ) cameraMaxZ.maxZ = 2000;

        variant.call(this, gameScene, map.width / 2, map.depth / 2);
    },

    add: function (mesh) {
        this.meshes.push(mesh);
        return mesh;
    },

    variants: {
        "classic-alpha": function (gameScene, cx, cz) {
            this.variants.classic.call(this, gameScene, cx, cz, true);
        },

        "classic": function (gameScene, cx, cz, alpha) {
            var water = new BABYLON.StandardMaterial("water material", gameScene);
            water.diffuseColor = new BABYLON.Color3(.05, .1, .2);
            water.specularColor = new BABYLON.Color3(0, 0, 0);
            if (alpha) { //alpha had flat bright water and no mountains
                water.diffuseColor = new BABYLON.Color3(0, 0, 0);
                water.fogEnabled = false;
            }
            var plane = this.add(BABYLON.MeshBuilder.CreatePlane("plane", { size: 1e3 }, gameScene));
            plane.rotation.x = Math.PI / 2;
            plane.position.set(cx, alpha ? -3 : -1, cz);
            plane.material = water;
            if (alpha) { //deep blue under you, hazing to pale at grazing view angles, curve fitted to a classic screenshot, so it shows from the ground and from above
                BABYLON.Effect.ShadersStore["waterClassicVertexShader"] = "precision highp float; attribute vec3 position; uniform mat4 world; uniform mat4 viewProjection; varying vec3 vWorld; void main() { vec4 w = world * vec4(position, 1.0); vWorld = w.xyz; gl_Position = viewProjection * w; }";
                BABYLON.Effect.ShadersStore["waterClassicFragmentShader"] = "precision highp float; varying vec3 vWorld; uniform vec3 camPos; void main() { float e = abs(normalize(vWorld - camPos).y) / .13; float t = exp(-e * e); vec3 deep = vec3(.17, .42, 1.0); vec3 pale = vec3(.52, .69, .88); gl_FragColor = vec4(mix(deep, pale, t), 1.0); }";
                var gradientMaterial = new BABYLON.ShaderMaterial("waterClassic", gameScene, "waterClassic", {
                    attributes: ["position"],
                    uniforms: ["world", "viewProjection", "camPos"]
                });
                gradientMaterial.backFaceCulling = false;
                gradientMaterial.onBind = function () {
                    var camera = gameScene.activeCamera;
                    if (camera) gradientMaterial.getEffect().setVector3("camPos", camera.globalPosition || camera.position);
                };
                plane.material = gradientMaterial;
            }

            var skyMaterial = new BABYLON.SkyMaterial("skyMaterial", gameScene);
            skyMaterial.backFaceCulling = false;
            skyMaterial.fogEnabled = false;
            skyMaterial.useSunPosition = true;
            skyMaterial.sunPosition = new BABYLON.Vector3(-.25, 1, -.5);
            skyMaterial.turbidity = 1.5;
            skyMaterial.luminance = .5;
            skyMaterial.rayleigh = 2;
            var box = this.add(BABYLON.Mesh.CreateBox("skyBoxClassic", 1e3, gameScene));
            box.material = skyMaterial;
            box.position.set(cx, 0, cz);

            var cloudTexture = new BABYLON.CloudProceduralTexture("cloud", 512, gameScene);
            cloudTexture.cloudColor = new BABYLON.Color3(0, 0, 0);
            cloudTexture.skyColor = new BABYLON.Color3(1, 1, 1);
            var cloudMaterial = new BABYLON.StandardMaterial("cloudMat", gameScene);
            cloudMaterial.fogEnabled = false;
            cloudMaterial.alphaMode = BABYLON.Engine.ALPHA_MAXIMIZED;
            cloudMaterial.alpha = .9999;
            cloudMaterial.emissiveTexture = cloudTexture;
            cloudMaterial.diffuseTexture = cloudTexture;
            cloudMaterial.backFaceCulling = false;
            if (alpha) cloudTexture.level = 1.5; //alpha clouds were punchier
            var clouds = this.add(gameScene.getMeshByName("sky").clone("skyClassic"));
            clouds.setEnabled(true);
            clouds.scaling.set(490, 100, 490);
            clouds.position.set(cx, 0, cz);
            clouds.material = cloudMaterial;

            if (alpha) return;

            //classic mountains were part of the map mesh, so the map shader's fog (blue, thick) hazed them
            var mountainMaterial = new BABYLON.ShaderMaterial("mountainsClassic", gameScene, "standard", {
                attributes: ["position", "normal", "color", "uv"],
                uniforms: ["world", "view", "viewProjection", "vFogInfos", "vFogColor", "sunColor"],
                defines: ["#define DIRT"]
            });
            mountainMaterial.onBind = function () {
                var effect = mountainMaterial.getEffect();
                effect.setFloat4("vFogInfos", 0, 0, 0, .02);
                effect.setColor3("vFogColor", new BABYLON.Color3(.5, .7, .9));
                effect.setFloat3("sunColor", 1, 1, 1);
            };
            this.meshes.push({ dispose: () => mountainMaterial.dispose() });

            [[80, 120, 0], [40, 50, 1.5], [30, 20, 3]].forEach(([xz, y, rotation]) => {
                var mountains = this.add(gameScene.getMeshByName("mountains").clone("mountainsClassic"));
                mountains.setEnabled(true);
                mountains.scaling.set(xz, y, xz);
                mountains.position.set(cx, 0, cz);
                mountains.rotation.y = rotation;
                mountains.material = mountainMaterial;
            });
        },
    },
};

if (isClient) ClassicSkyboxPlugin.registerListeners(plugins);