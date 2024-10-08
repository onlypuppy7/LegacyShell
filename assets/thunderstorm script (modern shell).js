//this was mainly just a test and doesnt actually work
//requires statefarm debug mode (scary!!)

// Create a particle system for rain
var rainParticleSystem = new globalSS.L.BABYLON.ParticleSystem("rain", 2000, globalSS.ss.SCENE);

// Use the custom rain texture
rainParticleSystem.particleTexture = new globalSS.L.BABYLON.Texture("https://playground.babylonjs.com/textures/flare.png", globalSS.ss.SCENE);

// Set the emitter position and shape (surrounding the camera)
rainParticleSystem.emitter = globalSS.ss.MYPLAYER[globalSS.H.actor][globalSS.H.mesh].position.clone(); // Emitter follows the camera
rainParticleSystem.minEmitBox = new globalSS.L.BABYLON.Vector3(-10, 20, -10); // Rain area size (X, Y, Z)
rainParticleSystem.maxEmitBox = new globalSS.L.BABYLON.Vector3(10, 20, 10);   // Larger area means more rain

// Set particle behavior
rainParticleSystem.minSize = 0.05; // Small raindrops
rainParticleSystem.maxSize = 0.1;
rainParticleSystem.minLifeTime = 1.0; // Short lifetime to simulate falling
rainParticleSystem.maxLifeTime = 1.5;
rainParticleSystem.emitRate = 2000; // Number of particles per second

// Set speed and direction
rainParticleSystem.direction1 = new globalSS.L.BABYLON.Vector3(0, -1, 0); // Particles fall down
rainParticleSystem.direction2 = new globalSS.L.BABYLON.Vector3(0, -1, 0);
rainParticleSystem.minEmitPower = 3; // How fast raindrops fall
rainParticleSystem.maxEmitPower = 5;
rainParticleSystem.updateSpeed = 0.01;

// Stretch the particles along the Y-axis (to make the rain look elongated)
rainParticleSystem.minScaleX = 0.25; // Minimum stretch factor on the Y-axis
rainParticleSystem.maxScaleY = 0.5; // Minimum stretch factor on the Y-axis
rainParticleSystem.minScaleY = 10; // Minimum stretch factor on the Y-axis
rainParticleSystem.maxScaleY = 15; // Maximum stretch factor on the Y-axis

// Optional: add some randomness to the rain direction to simulate wind
rainParticleSystem.gravity = new globalSS.L.BABYLON.Vector3(0, -30.81, 0); // Gravity for falling rain

// Enable alpha blending for the rain particles to handle transparency
// rainParticleSystem.blendMode = globalSS.L.BABYLON.ParticleSystem.BLENDMODE_STANDARD; // Alpha blending mode

// Ensure the particles are not affected by scene lighting
// rainParticleSystem.isBillboardBased = true; // Makes particles always face the camera
rainParticleSystem.isLocal = false; // Makes sure they are not affected by scene lighting

// Disable lighting effects on the particles (makes brightness uniform)
// rainParticleSystem.disableLighting = true; // Prevent particles from being affected by lights

// Start the particle system
rainParticleSystem.start();

// Make the emitter follow the camera as it moves
globalSS.ss.SCENE.registerBeforeRender(function() {
    rainParticleSystem.emitter = globalSS.ss.MYPLAYER[globalSS.H.actor][globalSS.H.mesh].position.clone(); // Update emitter position
});

// Create a shiny material
var wetMaterial = new globalSS.L.BABYLON.StandardMaterial("wetMaterial", globalSS.ss.SCENE);
wetMaterial.diffuseColor = new globalSS.L.BABYLON.Color3(0.7, 0.7, 0.7); // Darker to simulate wetness
wetMaterial.specularColor = new globalSS.L.BABYLON.Color3(1, 1, 1); // White specular for highlights
wetMaterial.specularPower = 64; // Higher power for sharper reflections
wetMaterial.reflectionTexture = new globalSS.L.BABYLON.MirrorTexture("mirror", 1024 * 1, globalSS.ss.SCENE, true);
wetMaterial.reflectionTexture.mirrorPlane = new globalSS.L.BABYLON.Plane(0, -1, 0, 0); // Reflect the ground
wetMaterial.reflectionTexture.level = .5; // Adjust reflection intensity

// Apply the material to the mapMesh
// mapMesh.material = wetMaterial;

globalSS.ss.SCENE.texturesEnabled = false;
globalSS.ss.SCENE.fogColor = new globalSS.L.BABYLON.Color4(0, 0, 0, 1);
globalSS.ss.SCENE.fogDensity = .5;

window.addEventListener('keydown', function(event) {
    if (event.key === '[') {
        globalSS.ss.SCENE.fogDensity = .1;
        globalSS.ss.SCENE.texturesEnabled = true;
        setTimeout(() => {
        }, 250);
        setTimeout(() => {
            globalSS.ss.SCENE.fogDensity = .5;
            globalSS.ss.SCENE.texturesEnabled = false;
        }, 100);
        setTimeout(() => {
            globalSS.ss.SCENE.fogDensity = .1;
            globalSS.ss.SCENE.texturesEnabled = true;
        }, 200);
        setTimeout(() => {
            globalSS.ss.SCENE.fogDensity = .5;
            globalSS.ss.SCENE.texturesEnabled = false;
        }, 400);
    }
});