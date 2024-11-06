// Create a particle system for rain
var rainParticleSystem = new BABYLON.ParticleSystem("rain", 2000, gameScene);

// Use the custom rain texture
rainParticleSystem.particleTexture = new BABYLON.Texture("/img/rain.png", gameScene);

// Set the emitter position and shape (surrounding the camera)
rainParticleSystem.emitter = me.actor.mesh.position.clone(); // Emitter follows the camera
rainParticleSystem.minEmitBox = new BABYLON.Vector3(-10, 20, -10); // Rain area size (X, Y, Z)
rainParticleSystem.maxEmitBox = new BABYLON.Vector3(10, 20, 10);   // Larger area means more rain

// Set particle behavior
rainParticleSystem.minSize = 0.05; // Small raindrops
rainParticleSystem.maxSize = 0.1;
rainParticleSystem.minLifeTime = 1.0; // Short lifetime to simulate falling
rainParticleSystem.maxLifeTime = 1.5;
rainParticleSystem.emitRate = 2000; // Number of particles per second

// Set speed and direction
rainParticleSystem.direction1 = new BABYLON.Vector3(0, -1, 0); // Particles fall down
rainParticleSystem.direction2 = new BABYLON.Vector3(0, -1, 0);
rainParticleSystem.minEmitPower = 3; // How fast raindrops fall
rainParticleSystem.maxEmitPower = 5;
rainParticleSystem.updateSpeed = 0.01;

rainParticleSystem.minScaleX = 0.25;
rainParticleSystem.maxScaleY = 0.5; 
rainParticleSystem.minScaleY = 10;
rainParticleSystem.maxScaleY = 15;
rainParticleSystem.gravity = new BABYLON.Vector3(0, -30.81, 0);
rainParticleSystem.isLocal = false;

// Disable lighting effects on the particles (makes brightness uniform)
// rainParticleSystem.disableLighting = true; // Prevent particles from being affected by lights

// Start the particle system
rainParticleSystem.start();

// Make the emitter follow the camera as it moves
gameScene.registerBeforeRender(function() {
    rainParticleSystem.emitter = me.actor.mesh.position.clone(); // Update emitter position
});

// Create a shiny material
var wetMaterial = new BABYLON.StandardMaterial("wetMaterial", gameScene);
wetMaterial.diffuseColor = new BABYLON.Color3(0.7, 0.7, 0.7); // Darker to simulate wetness
wetMaterial.specularColor = new BABYLON.Color3(1, 1, 1); // White specular for highlights
wetMaterial.specularPower = 64; // Higher power for sharper reflections
wetMaterial.reflectionTexture = new BABYLON.MirrorTexture("mirror", 1024 * 1, gameScene, true);
wetMaterial.reflectionTexture.mirrorPlane = new BABYLON.Plane(0, -1, 0, 0); // Reflect the ground
wetMaterial.reflectionTexture.level = .5; // Adjust reflection intensity

// Apply the material to the mapMesh
mapMesh.material = wetMaterial;

setSkybox("thunderstorm");

gameScene.texturesEnabled = false;
gameScene.fogColor = new BABYLON.Color4(0, 0, 0, 1);
gameScene.fogDensity = .5;

mapMesh.overlayAlpha = 0.1;
mapMesh.overlayColor = {r: 1, g: 1, b: 1};
mapMesh.renderOverlay = false;

Sounds.rain.play();

window.addEventListener('keydown', function(event) {
    if (event.key === '[') {
        gameScene.fogDensity = .1;
        skybox.rotation.y = Math.PI2 * 2 * Math.random();
        gameScene.texturesEnabled = true;
        mapMesh.renderOverlay = true;
        setTimeout(() => {
            playSoundIndependent2D("thunder");
        }, 250);
        setTimeout(() => {
            gameScene.fogDensity = .5;
            mapMesh.renderOverlay = false;
            gameScene.texturesEnabled = false;
        }, 100);
        setTimeout(() => {
            gameScene.fogDensity = .1;
            skybox.rotation.y = Math.PI2 * 2 * Math.random();
            mapMesh.renderOverlay = true;
            gameScene.texturesEnabled = true;
        }, 200);
        setTimeout(() => {
            gameScene.fogDensity = .5;
            mapMesh.renderOverlay = false;
            gameScene.texturesEnabled = false;
        }, 400);
    }
});