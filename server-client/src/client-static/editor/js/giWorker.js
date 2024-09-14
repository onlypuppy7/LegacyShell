importScripts('babylon.4.1.max.js');

BABYLON.Vector3.prototype.fromArray = function (array, idx) {
	idx = idx || 0;

	this.x = array[idx];
	this.y = array[idx + 1];
	this.z = array[idx + 2];
}

BABYLON.Vector3.prototype.toArray = function (array, idx) {
	idx = idx || 0;

	array[idx] = this.x;
	array[idx + 1] = this.y;
	array[idx + 2] = this.z;
}

onmessage = m => {
	var d = m.data;
	go(d);
}

function getMapMaterial (pass, scene) {
	var mat = new BABYLON.StandardMaterial('', scene);

	mat.diffuseColor = BABYLON.Color3.Black();
	mat.specularColor = BABYLON.Color3.Black();

	mat.disableLighting = true;
	mat.backFaceCulling = false;
	mat.twoSidedLighting = false;

	mat.fogEnabled = true;

	return mat;
}

async function go(d) {
	var jsonMesh = d.mesh;
	var colors = d.colors;
	var pass = d.pass;
	var subPassIdx = d.subPassIdx;
	var start = d.start;
	var end = d.end;
	var sunDirection = d.sunDirection;
	var ambientColor = new BABYLON.Color3().copyFrom(d.ambientColor);
	var skyboxName = d.skyboxName;
	var pointLightIntensity = d.pointLightIntensity;

	console.log('Point light intensity:', pointLightIntensity);

	var SIZE;

	if (pass == 'light') SIZE = 128; else SIZE = 8;
	var SIZE2 = SIZE * SIZE, SIZE255 = SIZE2 * 255;

	console.log('Worker tackling indices:', start, end);

	var canvas = new OffscreenCanvas(SIZE, SIZE);
	canvas.width = SIZE;
	canvas.height = SIZE;

	var engine = new BABYLON.Engine(canvas.getContext('webgl2'));
	engine.renderEvenInBackground = true;

	var scene = new BABYLON.Scene(engine);
	scene.ambientColor = ambientColor;

	var content = JSON.stringify(jsonMesh);
	var mesh;

	BABYLON.SceneLoader.ImportMesh('', '', 'data:' + content, scene, function (meshes, particleSystems, skeletons) {
		mesh = meshes[0];
	}, e => { console.log(e) } );

	var flipMesh = mesh.clone();
	var mat = new BABYLON.StandardMaterial('', scene);
	mat.disableLighting = true;
	mat.backFaceCulling = false;
	mat.diffuseColor = BABYLON.Color3.Black();
	mat.specularColor = BABYLON.Color3.Black();
	flipMesh.sideOrientation = BABYLON.Mesh.BACKSIDE;

	var camera = new BABYLON.FreeCamera('', BABYLON.Vector3.Zero(), scene);
	camera.minZ = 0;
	camera.maxZ = 400;

	var skybox = null;

	switch (pass) {
		case 'direct':
			camera.fov = 0.25;
			scene.clearColor = BABYLON.Color3.White();
			break;

		case 'reflect':
			camera.fov = 2;
			scene.clearColor = BABYLON.Color3.Black();
			skybox = await setupSkybox(skyboxName, scene);
			break;

		case 'indirect':
			camera.fov = 1.5;
			skybox = await setupSkybox(skyboxName, scene);
			break;

		case 'ao':
			camera.fov = 1.5;
			scene.clearColor = BABYLON.Color3.Black();
			scene.fogEnabled = true;
			scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
			scene.fogColor = BABYLON.Color3.Black();
			scene.fogStart = 0;
			scene.fogEnd = 0.5;
			break;

		case 'light':
			camera.fov = 2;
			scene.clearColor = BABYLON.Color3.Black();
			scene.fogEnabled = false;
			scene.fogMode = BABYLON.Scene.FOGMODE_LINEAR;
			scene.fogColor = BABYLON.Color3.Black();
			scene.fogStart = 0;
			scene.fogEnd = 6;
			break;
	}

	var mat = getMapMaterial(pass, scene);
	mesh.material = mat;
	mesh.freezeWorldMatrix();

	var rt = new BABYLON.RenderTargetTexture('', SIZE, scene, false)
	rt.renderList = [mesh, flipMesh, skybox];
	rt.activeCamera = camera;

	scene.customRenderTargets.push(rt);

	var position = new BABYLON.Vector3()
	var normal = new BABYLON.Vector3()

	var color = new Float32Array( 4 )
	var buffer = new Uint8Array( SIZE2 * 4 )

	var indices = mesh.getIndices();

	var positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
	var normals = mesh.getVerticesData(BABYLON.VertexBuffer.NormalKind);

	var processedVerts = [];

	for (var currentIdx = start; currentIdx < end; currentIdx++) {
		if (currentIdx > 0 && currentIdx % 500 == 0) {
			postMessage({ progress: 500 });
		}

		var currentVertex = indices[currentIdx];

		if (processedVerts[currentVertex]) continue;
		processedVerts[currentVertex] = true;

		position.fromArray( positions, currentVertex * 3 )
		normal.fromArray( normals, currentVertex * 3 )

		camera.position.copyFrom( position )

		switch (pass) {

			case 'direct':
				camera.setTarget( position.addInPlace( sunDirection ) )
				break;

			default:
				camera.setTarget( position.addInPlace( normal ) )
				break;
		}

		scene.render();
		rt.readPixels(1, 0, buffer);

		color[ 0 ] = 0
		color[ 1 ] = 0
		color[ 2 ] = 0

		for ( var k = 0, kl = buffer.length; k < kl; k += 4 ) {
			color[ 0 ] += buffer[ k + 0 ]
			color[ 1 ] += buffer[ k + 1 ]
			color[ 2 ] += buffer[ k + 2 ]
		}

		color[ 0 ] /= SIZE255
		color[ 1 ] /= SIZE255
		color[ 2 ] /= SIZE255

		var cv = currentVertex * 4;

		switch (pass) {
			case 'indirect':
				colors[cv] = color[ 0 ];
				colors[cv + 1] = color[ 1 ];
				colors[cv + 2] = color[ 2 ];
				break;

			case 'direct':
				var dot = Math.max(0, BABYLON.Vector3.Dot(sunDirection, normal));
				dot = Math.pow(dot, 0.5);
				//var dot = 1;
				var c = Math.min(color[0] * dot, 1);

				colors[cv] = c;
				colors[cv + 1] = c;
				colors[cv + 2] = c;
				break;

			case 'reflect':
				var p = 1 / (subPassIdx + 1);

				colors[cv] = Math.pow(color[0], p);
				cv++;
				colors[cv] = Math.pow(color[1], p);
				cv++;
				colors[cv] = Math.pow(color[2], p);
				break;

			case 'ao':
				var c = color[0];

				colors[cv] = c;
				colors[cv + 1] = c;
				colors[cv + 2] = c;

				break;

			case 'light':
				colors[cv] = Math.min(color[0] * pointLightIntensity, 1);
				colors[cv + 1] = Math.min(color[1] * pointLightIntensity, 1);
				colors[cv + 2] = Math.min(color[2] * pointLightIntensity, 1);
				break;
		}
	}

	postMessage(colors);
}

function setupSkybox (name, scene) {
	return new Promise((resolve, reject) => {
		name = name || 'default';
		skyboxName = name;

		console.log(name);

		var existing = scene.getMeshByName('skyBox');
		if (existing) existing.dispose();

		var skybox = BABYLON.MeshBuilder.CreateBox('skyBox', { size: 100 }, scene);
		skybox.infiniteDistance = true;
		var skyboxMaterial = new BABYLON.StandardMaterial('skyBox', scene);
		skyboxMaterial.backFaceCulling = false;
		skyboxMaterial.fogEnabled = false;

		var tex = new BABYLON.CubeTexture('../img/skyboxes/' + name + '/skybox', scene,
			["_px.jpg", "_py.jpg", "_pz.jpg", "_nx.jpg", "_ny.jpg", "_nz.jpg"], false, null,
			e => {
				console.log('TEXTURE LOADED');
				resolve(skybox);
			},
			null, BABYLON.Engine.TEXTUREFORMAT_RGBA, false, '.jpg'
		);

		skyboxMaterial.reflectionTexture = tex;
		skyboxMaterial.reflectionTexture.coordinatesMode = BABYLON.Texture.SKYBOX_MODE;

		skyboxMaterial.diffuseColor = new BABYLON.Color3(0, 0, 0);
		skyboxMaterial.specularColor = new BABYLON.Color3(0, 0, 0);
		skyboxMaterial.disableLighting = true;

		skybox.material = skyboxMaterial;
	});
}