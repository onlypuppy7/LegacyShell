/// <reference path="../../../dist/preview release/babylon.d.ts"/>
var __extends = (this && this.__extends) || (function () {
	var extendStatics = Object.setPrototypeOf ||
		({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
		function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
	return function (d, b) {
		extendStatics(d, b);
		function __() { this.constructor = d; }
		d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	};
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
	var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
	if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
	else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
	return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BABYLON;
(function (BABYLON) {
	var SkyMaterialDefines = (function (_super) {
		__extends(SkyMaterialDefines, _super);
		function SkyMaterialDefines() {
			var _this = _super.call(this) || this;
			_this.CLIPPLANE = false;
			_this.POINTSIZE = false;
			_this.FOG = false;
			_this.VERTEXCOLOR = false;
			_this.VERTEXALPHA = false;
			_this.USERIGHTHANDEDSYSTEM = false;
			_this.rebuild();
			return _this;
		}
		return SkyMaterialDefines;
	}(BABYLON.MaterialDefines));
	var SkyMaterial = (function (_super) {
		__extends(SkyMaterial, _super);
		function SkyMaterial(name, scene) {
			var _this = _super.call(this, name, scene) || this;
			// Public members
			_this.luminance = 1.0;
			_this.turbidity = 10.0;
			_this.rayleigh = 2.0;
			_this.mieCoefficient = 0.005;
			_this.mieDirectionalG = 0.8;
			_this.distance = 500;
			_this.inclination = 0.49;
			_this.azimuth = 0.25;
			_this.sunPosition = new BABYLON.Vector3(0, 100, 0);
			_this.useSunPosition = false;
			// Private members
			_this._cameraPosition = BABYLON.Vector3.Zero();
			return _this;
		}
		SkyMaterial.prototype.needAlphaBlending = function () {
			return (this.alpha < 1.0);
		};
		SkyMaterial.prototype.needAlphaTesting = function () {
			return false;
		};
		SkyMaterial.prototype.getAlphaTestTexture = function () {
			return null;
		};
		// Methods   
		SkyMaterial.prototype.isReadyForSubMesh = function (mesh, subMesh, useInstances) {
			if (this.isFrozen) {
				if (this._wasPreviouslyReady && subMesh.effect) {
					return true;
				}
			}
			if (!subMesh._materialDefines) {
				subMesh._materialDefines = new SkyMaterialDefines();
			}
			var defines = subMesh._materialDefines;
			var scene = this.getScene();
			if (!this.checkReadyOnEveryCall && subMesh.effect) {
				if (this._renderId === scene.getRenderId()) {
					return true;
				}
			}
			var engine = scene.getEngine();
			// devlog(mesh, scene, false, this.pointsCloud, this.fogEnabled, defines);
			// devlog(defines._areMiscDirty);
			// defines._areMiscDirty = true;
			BABYLON.MaterialHelper.PrepareDefinesForMisc(mesh, scene, false, this.pointsCloud, this.fogEnabled, true, defines);
			// Attribs
			BABYLON.MaterialHelper.PrepareDefinesForAttributes(mesh, defines, true, false);
			// Get correct effect      
			if (defines.isDirty) {
				defines.markAsProcessed();
				scene.resetCachedMaterial();
				// Fallbacks
				var fallbacks = new BABYLON.EffectFallbacks();
				if (defines.FOG) {
					fallbacks.addFallback(1, "FOG");
				}
				//Attributes
				var attribs = [BABYLON.VertexBuffer.PositionKind];
				if (defines.VERTEXCOLOR) {
					attribs.push(BABYLON.VertexBuffer.ColorKind);
				}
				var shaderName = "sky";
				var join = defines.toString();
				subMesh.setEffect(scene.getEngine().createEffect(shaderName, attribs, ["world", "viewProjection", "view",
					"vFogInfos", "vFogColor", "pointSize", "vClipPlane",
					"luminance", "turbidity", "rayleigh", "mieCoefficient", "mieDirectionalG", "sunPosition",
					"cameraPosition"
				], [], join, fallbacks, this.onCompiled, this.onError), defines);
			}
			if (!subMesh.effect.isReady()) {
				return false;
			}
			this._renderId = scene.getRenderId();
			this._wasPreviouslyReady = true;
			return true;
		};
		SkyMaterial.prototype.bindForSubMesh = function (world, mesh, subMesh) {
			var scene = this.getScene();
			var defines = subMesh._materialDefines;
			if (!defines) {
				return;
			}
			var effect = subMesh.effect;
			this._activeEffect = effect;
			// Matrices        
			this.bindOnlyWorldMatrix(world);
			this._activeEffect.setMatrix("viewProjection", scene.getTransformMatrix());
			if (this._mustRebind(scene, effect)) {
				// Clip plane
				if (scene.clipPlane) {
					var clipPlane = scene.clipPlane;
					this._activeEffect.setFloat4("vClipPlane", clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.d);
				}
				// Point size
				if (this.pointsCloud) {
					this._activeEffect.setFloat("pointSize", this.pointSize);
				}
			}
			// View
			if (scene.fogEnabled && mesh.applyFog && scene.fogMode !== BABYLON.Scene.FOGMODE_NONE) {
				this._activeEffect.setMatrix("view", scene.getViewMatrix());
			}
			// Fog
			BABYLON.MaterialHelper.BindFogParameters(scene, mesh, this._activeEffect);
			// Sky
			var camera = scene.activeCamera;
			if (camera) {
				var cameraWorldMatrix = camera.getWorldMatrix();
				this._cameraPosition.x = cameraWorldMatrix.m[12];
				this._cameraPosition.y = cameraWorldMatrix.m[13];
				this._cameraPosition.z = cameraWorldMatrix.m[14];
				this._activeEffect.setVector3("cameraPosition", this._cameraPosition);
			}
			if (this.luminance > 0) {
				this._activeEffect.setFloat("luminance", this.luminance);
			}
			this._activeEffect.setFloat("turbidity", this.turbidity);
			this._activeEffect.setFloat("rayleigh", this.rayleigh);
			this._activeEffect.setFloat("mieCoefficient", this.mieCoefficient);
			this._activeEffect.setFloat("mieDirectionalG", this.mieDirectionalG);
			if (!this.useSunPosition) {
				var theta = Math.PI * (this.inclination - 0.5);
				var phi = 2 * Math.PI * (this.azimuth - 0.5);
				this.sunPosition.x = this.distance * Math.cos(phi);
				this.sunPosition.y = this.distance * Math.sin(phi) * Math.sin(theta);
				this.sunPosition.z = this.distance * Math.sin(phi) * Math.cos(theta);
			}
			this._activeEffect.setVector3("sunPosition", this.sunPosition);
			this._afterBind(mesh, this._activeEffect);
		};
		SkyMaterial.prototype.getAnimatables = function () {
			return [];
		};
		SkyMaterial.prototype.dispose = function (forceDisposeEffect) {
			_super.prototype.dispose.call(this, forceDisposeEffect);
		};
		SkyMaterial.prototype.clone = function (name) {
			var _this = this;
			return BABYLON.SerializationHelper.Clone(function () { return new SkyMaterial(name, _this.getScene()); }, this);
		};
		SkyMaterial.prototype.serialize = function () {
			var serializationObject = BABYLON.SerializationHelper.Serialize(this);
			serializationObject.customType = "BABYLON.SkyMaterial";
			return serializationObject;
		};
		// Statics
		SkyMaterial.Parse = function (source, scene, rootUrl) {
			return BABYLON.SerializationHelper.Parse(function () { return new SkyMaterial(source.name, scene); }, source, scene, rootUrl);
		};
		return SkyMaterial;
	}(BABYLON.PushMaterial));
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "luminance", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "turbidity", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "rayleigh", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "mieCoefficient", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "mieDirectionalG", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "distance", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "inclination", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "azimuth", void 0);
	__decorate([
		BABYLON.serializeAsVector3()
	], SkyMaterial.prototype, "sunPosition", void 0);
	__decorate([
		BABYLON.serialize()
	], SkyMaterial.prototype, "useSunPosition", void 0);
	BABYLON.SkyMaterial = SkyMaterial;
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.skyMaterial.js.map

BABYLON.Effect.ShadersStore['skyVertexShader'] = "precision highp float;\n\nattribute vec3 position;\n#ifdef VERTEXCOLOR\nattribute vec4 color;\n#endif\n\nuniform mat4 world;\nuniform mat4 view;\nuniform mat4 viewProjection;\n#ifdef POINTSIZE\nuniform float pointSize;\n#endif\n\nvarying vec3 vPositionW;\n#ifdef VERTEXCOLOR\nvarying vec4 vColor;\n#endif\n#include<clipPlaneVertexDeclaration>\n#include<fogVertexDeclaration>\nvoid main(void) {\ngl_Position=viewProjection*world*vec4(position,1.0);\nvec4 worldPos=world*vec4(position,1.0);\nvPositionW=vec3(worldPos);\n\n#include<clipPlaneVertex>\n\n#include<fogVertex>\n\n#ifdef VERTEXCOLOR\nvColor=color;\n#endif\n\n#ifdef POINTSIZE\ngl_PointSize=pointSize;\n#endif\n}\n";
BABYLON.Effect.ShadersStore['skyPixelShader'] = "precision highp float;\n\nvarying vec3 vPositionW;\n#ifdef VERTEXCOLOR\nvarying vec4 vColor;\n#endif\n#include<clipPlaneFragmentDeclaration>\n\nuniform vec3 cameraPosition;\nuniform float luminance;\nuniform float turbidity;\nuniform float rayleigh;\nuniform float mieCoefficient;\nuniform float mieDirectionalG;\nuniform vec3 sunPosition;\n\n#include<fogFragmentDeclaration>\n\nconst float e=2.71828182845904523536028747135266249775724709369995957;\nconst float pi=3.141592653589793238462643383279502884197169;\nconst float n=1.0003;\nconst float N=2.545E25;\nconst float pn=0.035;\nconst vec3 lambda=vec3(680E-9,550E-9,450E-9);\nconst vec3 K=vec3(0.686,0.678,0.666);\nconst float v=4.0;\nconst float rayleighZenithLength=8.4E3;\nconst float mieZenithLength=1.25E3;\nconst vec3 up=vec3(0.0,1.0,0.0);\nconst float EE=1000.0;\nconst float sunAngularDiameterCos=0.999956676946448443553574619906976478926848692873900859324;\nconst float cutoffAngle=pi/1.95;\nconst float steepness=1.5;\nvec3 totalRayleigh(vec3 lambda)\n{\nreturn (8.0*pow(pi,3.0)*pow(pow(n,2.0)-1.0,2.0)*(6.0+3.0*pn))/(3.0*N*pow(lambda,vec3(4.0))*(6.0-7.0*pn));\n}\nvec3 simplifiedRayleigh()\n{\nreturn 0.0005/vec3(94,40,18);\n}\nfloat rayleighPhase(float cosTheta)\n{ \nreturn (3.0/(16.0*pi))*(1.0+pow(cosTheta,2.0));\n}\nvec3 totalMie(vec3 lambda,vec3 K,float T)\n{\nfloat c=(0.2*T )*10E-18;\nreturn 0.434*c*pi*pow((2.0*pi)/lambda,vec3(v-2.0))*K;\n}\nfloat hgPhase(float cosTheta,float g)\n{\nreturn (1.0/(4.0*pi))*((1.0-pow(g,2.0))/pow(1.0-2.0*g*cosTheta+pow(g,2.0),1.5));\n}\nfloat sunIntensity(float zenithAngleCos)\n{\nreturn EE*max(0.0,1.0-exp(-((cutoffAngle-acos(zenithAngleCos))/steepness)));\n}\nfloat A=0.15;\nfloat B=0.50;\nfloat C=0.10;\nfloat D=0.20;\nfloat EEE=0.02;\nfloat F=0.30;\nfloat W=1000.0;\nvec3 Uncharted2Tonemap(vec3 x)\n{\nreturn ((x*(A*x+C*B)+D*EEE)/(x*(A*x+B)+D*F))-EEE/F;\n}\nvoid main(void) {\n\n#include<clipPlaneFragment>\n\nfloat sunfade=1.0-clamp(1.0-exp((sunPosition.y/450000.0)),0.0,1.0);\nfloat rayleighCoefficient=rayleigh-(1.0*(1.0-sunfade));\nvec3 sunDirection=normalize(sunPosition);\nfloat sunE=sunIntensity(dot(sunDirection,up));\nvec3 betaR=simplifiedRayleigh()*rayleighCoefficient;\nvec3 betaM=totalMie(lambda,K,turbidity)*mieCoefficient;\nfloat zenithAngle=acos(max(0.0,dot(up,normalize(vPositionW-cameraPosition))));\nfloat sR=rayleighZenithLength/(cos(zenithAngle)+0.15*pow(93.885-((zenithAngle*180.0)/pi),-1.253));\nfloat sM=mieZenithLength/(cos(zenithAngle)+0.15*pow(93.885-((zenithAngle*180.0)/pi),-1.253));\nvec3 Fex=exp(-(betaR*sR+betaM*sM));\nfloat cosTheta=dot(normalize(vPositionW-cameraPosition),sunDirection);\nfloat rPhase=rayleighPhase(cosTheta*0.5+0.5);\nvec3 betaRTheta=betaR*rPhase;\nfloat mPhase=hgPhase(cosTheta,mieDirectionalG);\nvec3 betaMTheta=betaM*mPhase;\nvec3 Lin=pow(sunE*((betaRTheta+betaMTheta)/(betaR+betaM))*(1.0-Fex),vec3(1.5));\nLin*=mix(vec3(1.0),pow(sunE*((betaRTheta+betaMTheta)/(betaR+betaM))*Fex,vec3(1.0/2.0)),clamp(pow(1.0-dot(up,sunDirection),5.0),0.0,1.0));\nvec3 direction=normalize(vPositionW-cameraPosition);\nfloat theta=acos(direction.y);\nfloat phi=atan(direction.z,direction.x);\nvec2 uv=vec2(phi,theta)/vec2(2.0*pi,pi)+vec2(0.5,0.0);\nvec3 L0=vec3(0.1)*Fex;\nfloat sundisk=smoothstep(sunAngularDiameterCos,sunAngularDiameterCos+0.00002,cosTheta);\nL0+=(sunE*19000.0*Fex)*sundisk;\nvec3 whiteScale=1.0/Uncharted2Tonemap(vec3(W));\nvec3 texColor=(Lin+L0); \ntexColor*=0.04 ;\ntexColor+=vec3(0.0,0.001,0.0025)*0.3;\nfloat g_fMaxLuminance=1.0;\nfloat fLumScaled=0.1/luminance; \nfloat fLumCompressed=(fLumScaled*(1.0+(fLumScaled/(g_fMaxLuminance*g_fMaxLuminance))))/(1.0+fLumScaled); \nfloat ExposureBias=fLumCompressed;\nvec3 curr=Uncharted2Tonemap((log2(2.0/pow(luminance,4.0)))*texColor);\n\n\n\nvec3 retColor=curr*whiteScale;\n\n\nfloat alpha=1.0;\n#ifdef VERTEXCOLOR\nretColor.rgb*=vColor.rgb;\n#endif\n#ifdef VERTEXALPHA\nalpha*=vColor.a;\n#endif\n\nvec4 color=clamp(vec4(retColor.rgb,alpha),0.0,1.0);\n\n#include<fogFragment>\ngl_FragColor=color;\n}";


/// <reference path="../../../dist/preview release/babylon.d.ts"/>
var __extends = (this && this.__extends) || (function () {
	var extendStatics = Object.setPrototypeOf ||
		({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
		function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
	return function (d, b) {
		extendStatics(d, b);
		function __() { this.constructor = d; }
		d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	};
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
	var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
	if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
	else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
	return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BABYLON;
(function (BABYLON) {
	var WaterMaterialDefines = (function (_super) {
		__extends(WaterMaterialDefines, _super);
		function WaterMaterialDefines() {
			var _this = _super.call(this) || this;
			_this.BUMP = false;
			_this.REFLECTION = false;
			_this.CLIPPLANE = false;
			_this.ALPHATEST = false;
			_this.POINTSIZE = false;
			_this.FOG = false;
			_this.NORMAL = false;
			_this.UV1 = false;
			_this.UV2 = false;
			_this.VERTEXCOLOR = false;
			_this.VERTEXALPHA = false;
			_this.NUM_BONE_INFLUENCERS = 0;
			_this.BonesPerMesh = 0;
			_this.INSTANCES = false;
			_this.SPECULARTERM = false;
			_this.LOGARITHMICDEPTH = false;
			_this.FRESNELSEPARATE = false;
			_this.BUMPSUPERIMPOSE = false;
			_this.BUMPAFFECTSREFLECTION = false;
			_this.USERIGHTHANDEDSYSTEM = false;
			_this.rebuild();
			return _this;
		}
		return WaterMaterialDefines;
	}(BABYLON.MaterialDefines));
	var WaterMaterial = (function (_super) {
		__extends(WaterMaterial, _super);
		/**
		* Constructor
		*/
		function WaterMaterial(name, scene, renderTargetSize) {
			if (renderTargetSize === void 0) { renderTargetSize = new BABYLON.Vector2(512, 512); }
			var _this = _super.call(this, name, scene) || this;
			_this.renderTargetSize = renderTargetSize;
			_this.diffuseColor = new BABYLON.Color3(1, 1, 1);
			_this.specularColor = new BABYLON.Color3(0, 0, 0);
			_this.specularPower = 64;
			_this._disableLighting = false;
			_this._maxSimultaneousLights = 4;
			/**
			* @param {number}: Represents the wind force
			*/
			_this.windForce = 6;
			/**
			* @param {Vector2}: The direction of the wind in the plane (X, Z)
			*/
			_this.windDirection = new BABYLON.Vector2(0, 1);
			/**
			* @param {number}: Wave height, represents the height of the waves
			*/
			_this.waveHeight = 0.4;
			/**
			* @param {number}: Bump height, represents the bump height related to the bump map
			*/
			_this.bumpHeight = 0.4;
			/**
			 * @param {boolean}: Add a smaller moving bump to less steady waves.
			 */
			_this._bumpSuperimpose = false;
			/**
			 * @param {boolean}: Color refraction and reflection differently with .waterColor2 and .colorBlendFactor2. Non-linear (physically correct) fresnel.
			 */
			_this._fresnelSeparate = false;
			/**
			 * @param {boolean}: bump Waves modify the reflection.
			 */
			_this._bumpAffectsReflection = false;
			/**
			* @param {number}: The water color blended with the refraction (near)
			*/
			_this.waterColor = new BABYLON.Color3(0.1, 0.1, 0.6);
			/**
			* @param {number}: The blend factor related to the water color
			*/
			_this.colorBlendFactor = 0.2;
			/**
			 * @param {number}: The water color blended with the reflection (far)
			 */
			_this.waterColor2 = new BABYLON.Color3(0.1, 0.1, 0.6);
			/**
			 * @param {number}: The blend factor related to the water color (reflection, far)
			 */
			_this.colorBlendFactor2 = 0.2;
			/**
			* @param {number}: Represents the maximum length of a wave
			*/
			_this.waveLength = 0.1;
			/**
			* @param {number}: Defines the waves speed
			*/
			_this.waveSpeed = 1.0;
			/*
			* Private members
			*/
			_this._mesh = null;
			_this._reflectionTransform = BABYLON.Matrix.Zero();
			_this._lastTime = 0;
			// Create render targets
			_this._createRenderTargets(scene, renderTargetSize);
			return _this;
		}
		Object.defineProperty(WaterMaterial.prototype, "useLogarithmicDepth", {
			get: function () {
				return this._useLogarithmicDepth;
			},
			set: function (value) {
				this._useLogarithmicDepth = value && this.getScene().getEngine().getCaps().fragmentDepthSupported;
				this._markAllSubMeshesAsMiscDirty();
			},
			enumerable: true,
			configurable: true
		});
		Object.defineProperty(WaterMaterial.prototype, "refractionTexture", {
			// Get / Set
			get: function () {
				return this._refractionRTT;
			},
			enumerable: true,
			configurable: true
		});
		Object.defineProperty(WaterMaterial.prototype, "reflectionTexture", {
			get: function () {
				return this._reflectionRTT;
			},
			enumerable: true,
			configurable: true
		});
		// Methods
		WaterMaterial.prototype.addToRenderList = function (node) {
			this._refractionRTT.renderList.push(node);
			this._reflectionRTT.renderList.push(node);
		};
		WaterMaterial.prototype.enableRenderTargets = function (enable) {
			var refreshRate = enable ? 1 : 0;
			this._refractionRTT.refreshRate = refreshRate;
			this._reflectionRTT.refreshRate = refreshRate;
		};
		WaterMaterial.prototype.getRenderList = function () {
			return this._refractionRTT.renderList;
		};
		Object.defineProperty(WaterMaterial.prototype, "renderTargetsEnabled", {
			get: function () {
				return !(this._refractionRTT.refreshRate === 0);
			},
			enumerable: true,
			configurable: true
		});
		WaterMaterial.prototype.needAlphaBlending = function () {
			return (this.alpha < 1.0);
		};
		WaterMaterial.prototype.needAlphaTesting = function () {
			return false;
		};
		WaterMaterial.prototype.getAlphaTestTexture = function () {
			return null;
		};
		WaterMaterial.prototype.isReadyForSubMesh = function (mesh, subMesh, useInstances) {
			if (this.isFrozen) {
				if (this._wasPreviouslyReady && subMesh.effect) {
					return true;
				}
			}
			if (!subMesh._materialDefines) {
				subMesh._materialDefines = new WaterMaterialDefines();
			}
			var defines = subMesh._materialDefines;
			var scene = this.getScene();
			if (!this.checkReadyOnEveryCall && subMesh.effect) {
				if (this._renderId === scene.getRenderId()) {
					return true;
				}
			}
			var engine = scene.getEngine();
			// Textures
			if (defines._areTexturesDirty) {
				defines._needUVs = false;
				if (scene.texturesEnabled) {
					if (this.bumpTexture && BABYLON.StandardMaterial.BumpTextureEnabled) {
						if (!this.bumpTexture.isReady()) {
							return false;
						}
						else {
							defines._needUVs = true;
							defines.BUMP = true;
						}
					}
					if (BABYLON.StandardMaterial.ReflectionTextureEnabled) {
						defines.REFLECTION = true;
					}
				}
			}
			BABYLON.MaterialHelper.PrepareDefinesForFrameBoundValues(scene, engine, defines, useInstances);
			BABYLON.MaterialHelper.PrepareDefinesForMisc(mesh, scene, this._useLogarithmicDepth, this.pointsCloud, this.fogEnabled, defines);
			if (defines._areMiscDirty) {
				if (this._fresnelSeparate) {
					defines.FRESNELSEPARATE = true;
				}
				if (this._bumpSuperimpose) {
					defines.BUMPSUPERIMPOSE = true;
				}
				if (this._bumpAffectsReflection) {
					defines.BUMPAFFECTSREFLECTION = true;
				}
			}
			// Lights
			defines._needNormals = BABYLON.MaterialHelper.PrepareDefinesForLights(scene, mesh, defines, true, this._maxSimultaneousLights, this._disableLighting);
			// Attribs
			BABYLON.MaterialHelper.PrepareDefinesForAttributes(mesh, defines, true, true);
			this._mesh = mesh;
			// Get correct effect      
			if (defines.isDirty) {
				defines.markAsProcessed();
				scene.resetCachedMaterial();
				// Fallbacks
				var fallbacks = new BABYLON.EffectFallbacks();
				if (defines.FOG) {
					fallbacks.addFallback(1, "FOG");
				}
				if (defines.LOGARITHMICDEPTH) {
					fallbacks.addFallback(0, "LOGARITHMICDEPTH");
				}
				BABYLON.MaterialHelper.HandleFallbacksForShadows(defines, fallbacks, this.maxSimultaneousLights);
				if (defines.NUM_BONE_INFLUENCERS > 0) {
					fallbacks.addCPUSkinningFallback(0, mesh);
				}
				//Attributes
				var attribs = [BABYLON.VertexBuffer.PositionKind];
				if (defines.NORMAL) {
					attribs.push(BABYLON.VertexBuffer.NormalKind);
				}
				if (defines.UV1) {
					attribs.push(BABYLON.VertexBuffer.UVKind);
				}
				if (defines.UV2) {
					attribs.push(BABYLON.VertexBuffer.UV2Kind);
				}
				if (defines.VERTEXCOLOR) {
					attribs.push(BABYLON.VertexBuffer.ColorKind);
				}
				BABYLON.MaterialHelper.PrepareAttributesForBones(attribs, mesh, defines, fallbacks);
				BABYLON.MaterialHelper.PrepareAttributesForInstances(attribs, defines);
				// Legacy browser patch
				var shaderName = "water";
				var join = defines.toString();
				var uniforms = ["world", "view", "viewProjection", "vEyePosition", "vLightsType", "vDiffuseColor", "vSpecularColor",
					"vFogInfos", "vFogColor", "pointSize",
					"vNormalInfos",
					"mBones",
					"vClipPlane", "normalMatrix",
					"logarithmicDepthConstant",
					// Water
					"worldReflectionViewProjection", "windDirection", "waveLength", "time", "windForce",
					"cameraPosition", "bumpHeight", "waveHeight", "waterColor", "waterColor2", "colorBlendFactor", "colorBlendFactor2", "waveSpeed"
				];
				var samplers = ["normalSampler",
					// Water
					"refractionSampler", "reflectionSampler"
				];
				var uniformBuffers = [];
				BABYLON.MaterialHelper.PrepareUniformsAndSamplersList({
					uniformsNames: uniforms,
					uniformBuffersNames: uniformBuffers,
					samplers: samplers,
					defines: defines,
					maxSimultaneousLights: this.maxSimultaneousLights
				});
				subMesh.setEffect(scene.getEngine().createEffect(shaderName, {
					attributes: attribs,
					uniformsNames: uniforms,
					uniformBuffersNames: uniformBuffers,
					samplers: samplers,
					defines: join,
					fallbacks: fallbacks,
					onCompiled: this.onCompiled,
					onError: this.onError,
					indexParameters: { maxSimultaneousLights: this._maxSimultaneousLights }
				}, engine), defines);
			}
			if (!subMesh.effect.isReady()) {
				return false;
			}
			this._renderId = scene.getRenderId();
			this._wasPreviouslyReady = true;
			return true;
		};
		WaterMaterial.prototype.bindForSubMesh = function (world, mesh, subMesh) {
			var scene = this.getScene();
			var defines = subMesh._materialDefines;
			if (!defines) {
				return;
			}
			var effect = subMesh.effect;
			this._activeEffect = effect;
			// Matrices        
			this.bindOnlyWorldMatrix(world);
			this._activeEffect.setMatrix("viewProjection", scene.getTransformMatrix());
			// Bones
			BABYLON.MaterialHelper.BindBonesParameters(mesh, this._activeEffect);
			if (this._mustRebind(scene, effect)) {
				// Textures        
				if (this.bumpTexture && BABYLON.StandardMaterial.BumpTextureEnabled) {
					this._activeEffect.setTexture("normalSampler", this.bumpTexture);
					this._activeEffect.setFloat2("vNormalInfos", this.bumpTexture.coordinatesIndex, this.bumpTexture.level);
					this._activeEffect.setMatrix("normalMatrix", this.bumpTexture.getTextureMatrix());
				}
				// Clip plane
				BABYLON.MaterialHelper.BindClipPlane(this._activeEffect, scene);
				// Point size
				if (this.pointsCloud) {
					this._activeEffect.setFloat("pointSize", this.pointSize);
				}
				this._activeEffect.setVector3("vEyePosition", scene._mirroredCameraPosition ? scene._mirroredCameraPosition : scene.activeCamera.position);
			}
			this._activeEffect.setColor4("vDiffuseColor", this.diffuseColor, this.alpha * mesh.visibility);
			if (defines.SPECULARTERM) {
				this._activeEffect.setColor4("vSpecularColor", this.specularColor, this.specularPower);
			}
			if (scene.lightsEnabled && !this.disableLighting) {
				BABYLON.MaterialHelper.BindLights(scene, mesh, this._activeEffect, defines, this.maxSimultaneousLights);
			}
			// View
			if (scene.fogEnabled && mesh.applyFog && scene.fogMode !== BABYLON.Scene.FOGMODE_NONE) {
				this._activeEffect.setMatrix("view", scene.getViewMatrix());
			}
			// Fog
			BABYLON.MaterialHelper.BindFogParameters(scene, mesh, this._activeEffect);
			// Log. depth
			BABYLON.MaterialHelper.BindLogDepth(defines, this._activeEffect, scene);
			// Water
			if (BABYLON.StandardMaterial.ReflectionTextureEnabled) {
				this._activeEffect.setTexture("refractionSampler", this._refractionRTT);
				this._activeEffect.setTexture("reflectionSampler", this._reflectionRTT);
			}
			var wrvp = this._mesh.getWorldMatrix().multiply(this._reflectionTransform).multiply(scene.getProjectionMatrix());
			this._lastTime += scene.getEngine().getDeltaTime();
			this._activeEffect.setMatrix("worldReflectionViewProjection", wrvp);
			this._activeEffect.setVector2("windDirection", this.windDirection);
			this._activeEffect.setFloat("waveLength", this.waveLength);
			this._activeEffect.setFloat("time", this._lastTime / 100000);
			this._activeEffect.setFloat("windForce", this.windForce);
			this._activeEffect.setFloat("waveHeight", this.waveHeight);
			this._activeEffect.setFloat("bumpHeight", this.bumpHeight);
			this._activeEffect.setColor4("waterColor", this.waterColor, 1.0);
			this._activeEffect.setFloat("colorBlendFactor", this.colorBlendFactor);
			this._activeEffect.setColor4("waterColor2", this.waterColor2, 1.0);
			this._activeEffect.setFloat("colorBlendFactor2", this.colorBlendFactor2);
			this._activeEffect.setFloat("waveSpeed", this.waveSpeed);
			this._afterBind(mesh, this._activeEffect);
		};
		WaterMaterial.prototype._createRenderTargets = function (scene, renderTargetSize) {
			var _this = this;
			// Render targets
			this._refractionRTT = new BABYLON.RenderTargetTexture(name + "_refraction", { width: renderTargetSize.x, height: renderTargetSize.y }, scene, false, true);
			this._refractionRTT.wrapU = BABYLON.Texture.MIRROR_ADDRESSMODE;
			this._refractionRTT.wrapV = BABYLON.Texture.MIRROR_ADDRESSMODE;
			this._reflectionRTT = new BABYLON.RenderTargetTexture(name + "_reflection", { width: renderTargetSize.x, height: renderTargetSize.y }, scene, false, true);
			this._reflectionRTT.wrapU = BABYLON.Texture.MIRROR_ADDRESSMODE;
			this._reflectionRTT.wrapV = BABYLON.Texture.MIRROR_ADDRESSMODE;
			scene.customRenderTargets.push(this._refractionRTT);
			scene.customRenderTargets.push(this._reflectionRTT);
			var isVisible;
			var clipPlane = null;
			var savedViewMatrix;
			var mirrorMatrix = BABYLON.Matrix.Zero();
			this._refractionRTT.onBeforeRender = function () {
				if (_this._mesh) {
					isVisible = _this._mesh.isVisible;
					_this._mesh.isVisible = false;
				}
				// Clip plane
				clipPlane = scene.clipPlane;
				var positiony = _this._mesh ? _this._mesh.position.y : 0.0;
				scene.clipPlane = BABYLON.Plane.FromPositionAndNormal(new BABYLON.Vector3(0, positiony + 0.05, 0), new BABYLON.Vector3(0, 1, 0));
			};
			this._refractionRTT.onAfterRender = function () {
				if (_this._mesh) {
					_this._mesh.isVisible = isVisible;
				}
				// Clip plane
				scene.clipPlane = clipPlane;
			};
			this._reflectionRTT.onBeforeRender = function () {
				if (_this._mesh) {
					isVisible = _this._mesh.isVisible;
					_this._mesh.isVisible = false;
				}
				// Clip plane
				clipPlane = scene.clipPlane;
				var positiony = _this._mesh ? _this._mesh.position.y : 0.0;
				scene.clipPlane = BABYLON.Plane.FromPositionAndNormal(new BABYLON.Vector3(0, positiony - 0.05, 0), new BABYLON.Vector3(0, -1, 0));
				// Transform
				BABYLON.Matrix.ReflectionToRef(scene.clipPlane, mirrorMatrix);
				savedViewMatrix = scene.getViewMatrix();
				mirrorMatrix.multiplyToRef(savedViewMatrix, _this._reflectionTransform);
				scene.setTransformMatrix(_this._reflectionTransform, scene.getProjectionMatrix());
				scene.getEngine().cullBackFaces = false;
				scene._mirroredCameraPosition = BABYLON.Vector3.TransformCoordinates(scene.activeCamera.position, mirrorMatrix);
			};
			this._reflectionRTT.onAfterRender = function () {
				if (_this._mesh) {
					_this._mesh.isVisible = isVisible;
				}
				// Clip plane
				scene.clipPlane = clipPlane;
				// Transform
				scene.setTransformMatrix(savedViewMatrix, scene.getProjectionMatrix());
				scene.getEngine().cullBackFaces = true;
				scene._mirroredCameraPosition = null;
			};
		};
		WaterMaterial.prototype.getAnimatables = function () {
			var results = [];
			if (this.bumpTexture && this.bumpTexture.animations && this.bumpTexture.animations.length > 0) {
				results.push(this.bumpTexture);
			}
			if (this._reflectionRTT && this._reflectionRTT.animations && this._reflectionRTT.animations.length > 0) {
				results.push(this._reflectionRTT);
			}
			if (this._refractionRTT && this._refractionRTT.animations && this._refractionRTT.animations.length > 0) {
				results.push(this._refractionRTT);
			}
			return results;
		};
		WaterMaterial.prototype.getActiveTextures = function () {
			var activeTextures = _super.prototype.getActiveTextures.call(this);
			if (this._bumpTexture) {
				activeTextures.push(this._bumpTexture);
			}
			return activeTextures;
		};
		WaterMaterial.prototype.hasTexture = function (texture) {
			if (_super.prototype.hasTexture.call(this, texture)) {
				return true;
			}
			if (this._bumpTexture === texture) {
				return true;
			}
			return false;
		};
		WaterMaterial.prototype.dispose = function (forceDisposeEffect) {
			if (this.bumpTexture) {
				this.bumpTexture.dispose();
			}
			var index = this.getScene().customRenderTargets.indexOf(this._refractionRTT);
			if (index != -1) {
				this.getScene().customRenderTargets.splice(index, 1);
			}
			index = -1;
			index = this.getScene().customRenderTargets.indexOf(this._reflectionRTT);
			if (index != -1) {
				this.getScene().customRenderTargets.splice(index, 1);
			}
			if (this._reflectionRTT) {
				this._reflectionRTT.dispose();
			}
			if (this._refractionRTT) {
				this._refractionRTT.dispose();
			}
			_super.prototype.dispose.call(this, forceDisposeEffect);
		};
		WaterMaterial.prototype.clone = function (name) {
			var _this = this;
			return BABYLON.SerializationHelper.Clone(function () { return new WaterMaterial(name, _this.getScene()); }, this);
		};
		WaterMaterial.prototype.serialize = function () {
			var serializationObject = BABYLON.SerializationHelper.Serialize(this);
			serializationObject.customType = "BABYLON.WaterMaterial";
			serializationObject.reflectionTexture.isRenderTarget = true;
			serializationObject.refractionTexture.isRenderTarget = true;
			return serializationObject;
		};
		// Statics
		WaterMaterial.Parse = function (source, scene, rootUrl) {
			return BABYLON.SerializationHelper.Parse(function () { return new WaterMaterial(source.name, scene); }, source, scene, rootUrl);
		};
		WaterMaterial.CreateDefaultMesh = function (name, scene) {
			var mesh = BABYLON.Mesh.CreateGround(name, 512, 512, 32, scene, false);
			return mesh;
		};
		return WaterMaterial;
	}(BABYLON.PushMaterial));
	__decorate([
		BABYLON.serializeAsTexture("bumpTexture")
	], WaterMaterial.prototype, "_bumpTexture", void 0);
	__decorate([
		BABYLON.expandToProperty("_markAllSubMeshesAsTexturesDirty")
	], WaterMaterial.prototype, "bumpTexture", void 0);
	__decorate([
		BABYLON.serializeAsColor3()
	], WaterMaterial.prototype, "diffuseColor", void 0);
	__decorate([
		BABYLON.serializeAsColor3()
	], WaterMaterial.prototype, "specularColor", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "specularPower", void 0);
	__decorate([
		BABYLON.serialize("disableLighting")
	], WaterMaterial.prototype, "_disableLighting", void 0);
	__decorate([
		BABYLON.expandToProperty("_markAllSubMeshesAsLightsDirty")
	], WaterMaterial.prototype, "disableLighting", void 0);
	__decorate([
		BABYLON.serialize("maxSimultaneousLights")
	], WaterMaterial.prototype, "_maxSimultaneousLights", void 0);
	__decorate([
		BABYLON.expandToProperty("_markAllSubMeshesAsLightsDirty")
	], WaterMaterial.prototype, "maxSimultaneousLights", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "windForce", void 0);
	__decorate([
		BABYLON.serializeAsVector2()
	], WaterMaterial.prototype, "windDirection", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "waveHeight", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "bumpHeight", void 0);
	__decorate([
		BABYLON.serialize("bumpSuperimpose")
	], WaterMaterial.prototype, "_bumpSuperimpose", void 0);
	__decorate([
		BABYLON.expandToProperty("_markAllSubMeshesAsMiscDirty")
	], WaterMaterial.prototype, "bumpSuperimpose", void 0);
	__decorate([
		BABYLON.serialize("fresnelSeparate")
	], WaterMaterial.prototype, "_fresnelSeparate", void 0);
	__decorate([
		BABYLON.expandToProperty("_markAllSubMeshesAsMiscDirty")
	], WaterMaterial.prototype, "fresnelSeparate", void 0);
	__decorate([
		BABYLON.serialize("bumpAffectsReflection")
	], WaterMaterial.prototype, "_bumpAffectsReflection", void 0);
	__decorate([
		BABYLON.expandToProperty("_markAllSubMeshesAsMiscDirty")
	], WaterMaterial.prototype, "bumpAffectsReflection", void 0);
	__decorate([
		BABYLON.serializeAsColor3()
	], WaterMaterial.prototype, "waterColor", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "colorBlendFactor", void 0);
	__decorate([
		BABYLON.serializeAsColor3()
	], WaterMaterial.prototype, "waterColor2", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "colorBlendFactor2", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "waveLength", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "waveSpeed", void 0);
	__decorate([
		BABYLON.serialize()
	], WaterMaterial.prototype, "useLogarithmicDepth", null);
	BABYLON.WaterMaterial = WaterMaterial;
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.waterMaterial.js.map

BABYLON.Effect.ShadersStore['waterVertexShader'] = "precision highp float;\n\nattribute vec3 position;\n#ifdef NORMAL\nattribute vec3 normal;\n#endif\n#ifdef UV1\nattribute vec2 uv;\n#endif\n#ifdef UV2\nattribute vec2 uv2;\n#endif\n#ifdef VERTEXCOLOR\nattribute vec4 color;\n#endif\n#include<bonesDeclaration>\n\n#include<instancesDeclaration>\nuniform mat4 view;\nuniform mat4 viewProjection;\n#ifdef BUMP\nvarying vec2 vNormalUV;\n#ifdef BUMPSUPERIMPOSE\nvarying vec2 vNormalUV2;\n#endif\nuniform mat4 normalMatrix;\nuniform vec2 vNormalInfos;\n#endif\n#ifdef POINTSIZE\nuniform float pointSize;\n#endif\n\nvarying vec3 vPositionW;\n#ifdef NORMAL\nvarying vec3 vNormalW;\n#endif\n#ifdef VERTEXCOLOR\nvarying vec4 vColor;\n#endif\n#include<clipPlaneVertexDeclaration>\n#include<fogVertexDeclaration>\n#include<__decl__lightFragment>[0..maxSimultaneousLights]\n#include<logDepthDeclaration>\n\nuniform mat4 worldReflectionViewProjection;\nuniform vec2 windDirection;\nuniform float waveLength;\nuniform float time;\nuniform float windForce;\nuniform float waveHeight;\nuniform float waveSpeed;\n\nvarying vec3 vPosition;\nvarying vec3 vRefractionMapTexCoord;\nvarying vec3 vReflectionMapTexCoord;\nvoid main(void) {\n#include<instancesVertex>\n#include<bonesVertex>\nvec4 worldPos=finalWorld*vec4(position,1.0);\nvPositionW=vec3(worldPos);\n#ifdef NORMAL\nvNormalW=normalize(vec3(finalWorld*vec4(normal,0.0)));\n#endif\n\n#ifndef UV1\nvec2 uv=vec2(0.,0.);\n#endif\n#ifndef UV2\nvec2 uv2=vec2(0.,0.);\n#endif\n#ifdef BUMP\nif (vNormalInfos.x == 0.)\n{\nvNormalUV=vec2(normalMatrix*vec4((uv*1.0)/waveLength+time*windForce*windDirection,1.0,0.0));\n#ifdef BUMPSUPERIMPOSE\nvNormalUV2=vec2(normalMatrix*vec4((uv*0.721)/waveLength+time*1.2*windForce*windDirection,1.0,0.0));\n#endif\n}\nelse\n{\nvNormalUV=vec2(normalMatrix*vec4((uv2*1.0)/waveLength+time*windForce*windDirection ,1.0,0.0));\n#ifdef BUMPSUPERIMPOSE\nvNormalUV2=vec2(normalMatrix*vec4((uv2*0.721)/waveLength+time*1.2*windForce*windDirection ,1.0,0.0));\n#endif\n}\n#endif\n\n#include<clipPlaneVertex>\n\n#include<fogVertex>\n\n#include<shadowsVertex>[0..maxSimultaneousLights]\n\n#ifdef VERTEXCOLOR\nvColor=color;\n#endif\n\n#ifdef POINTSIZE\ngl_PointSize=pointSize;\n#endif\nvec3 p=position;\nfloat newY=(sin(((p.x/0.05)+time*waveSpeed))*waveHeight*windDirection.x*5.0)\n+(cos(((p.z/0.05)+time*waveSpeed))*waveHeight*windDirection.y*5.0);\np.y+=abs(newY);\ngl_Position=viewProjection*finalWorld*vec4(p,1.0);\n#ifdef REFLECTION\nworldPos=viewProjection*finalWorld*vec4(p,1.0);\n\nvPosition=position;\nvRefractionMapTexCoord.x=0.5*(worldPos.w+worldPos.x);\nvRefractionMapTexCoord.y=0.5*(worldPos.w+worldPos.y);\nvRefractionMapTexCoord.z=worldPos.w;\nworldPos=worldReflectionViewProjection*vec4(position,1.0);\nvReflectionMapTexCoord.x=0.5*(worldPos.w+worldPos.x);\nvReflectionMapTexCoord.y=0.5*(worldPos.w+worldPos.y);\nvReflectionMapTexCoord.z=worldPos.w;\n#endif\n#include<logDepthVertex>\n}\n";
BABYLON.Effect.ShadersStore['waterPixelShader'] = "#ifdef LOGARITHMICDEPTH\n#extension GL_EXT_frag_depth : enable\n#endif\nprecision highp float;\n\nuniform vec3 vEyePosition;\nuniform vec4 vDiffuseColor;\n#ifdef SPECULARTERM\nuniform vec4 vSpecularColor;\n#endif\n\nvarying vec3 vPositionW;\n#ifdef NORMAL\nvarying vec3 vNormalW;\n#endif\n#ifdef VERTEXCOLOR\nvarying vec4 vColor;\n#endif\n\n#include<__decl__lightFragment>[0..maxSimultaneousLights]\n#include<lightsFragmentFunctions>\n#include<shadowsFragmentFunctions>\n\n#ifdef BUMP\nvarying vec2 vNormalUV;\nvarying vec2 vNormalUV2;\nuniform sampler2D normalSampler;\nuniform vec2 vNormalInfos;\n#endif\nuniform sampler2D refractionSampler;\nuniform sampler2D reflectionSampler;\n\nconst float LOG2=1.442695;\nuniform vec3 cameraPosition;\nuniform vec4 waterColor;\nuniform float colorBlendFactor;\nuniform vec4 waterColor2;\nuniform float colorBlendFactor2;\nuniform float bumpHeight;\nuniform float time;\n\nvarying vec3 vRefractionMapTexCoord;\nvarying vec3 vReflectionMapTexCoord;\nvarying vec3 vPosition;\n#include<clipPlaneFragmentDeclaration>\n#include<logDepthDeclaration>\n\n#include<fogFragmentDeclaration>\nvoid main(void) {\n\n#include<clipPlaneFragment>\nvec3 viewDirectionW=normalize(vEyePosition-vPositionW);\n\nvec4 baseColor=vec4(1.,1.,1.,1.);\nvec3 diffuseColor=vDiffuseColor.rgb;\n\nfloat alpha=vDiffuseColor.a;\n#ifdef BUMP\n#ifdef BUMPSUPERIMPOSE\nbaseColor=0.6*texture2D(normalSampler,vNormalUV)+0.4*texture2D(normalSampler,vec2(vNormalUV2.x,vNormalUV2.y));\n#else\nbaseColor=texture2D(normalSampler,vNormalUV);\n#endif\nvec3 bumpColor=baseColor.rgb;\n#ifdef ALPHATEST\nif (baseColor.a<0.4)\ndiscard;\n#endif\nbaseColor.rgb*=vNormalInfos.y;\n#else\nvec3 bumpColor=vec3(1.0);\n#endif\n#ifdef VERTEXCOLOR\nbaseColor.rgb*=vColor.rgb;\n#endif\n\n#ifdef NORMAL\nvec2 perturbation=bumpHeight*(baseColor.rg-0.5);\n#ifdef BUMPAFFECTSREFLECTION\nvec3 normalW=normalize(vNormalW+vec3(perturbation.x*8.0,0.0,perturbation.y*8.0));\nif (normalW.y<0.0) {\nnormalW.y=-normalW.y;\n}\n#else\nvec3 normalW=normalize(vNormalW);\n#endif\n#else\nvec3 normalW=vec3(1.0,1.0,1.0);\nvec2 perturbation=bumpHeight*(vec2(1.0,1.0)-0.5);\n#endif\n#ifdef FRESNELSEPARATE\n#ifdef REFLECTION\n\nvec3 eyeVector=normalize(vEyePosition-vPosition);\nvec2 projectedRefractionTexCoords=clamp(vRefractionMapTexCoord.xy/vRefractionMapTexCoord.z+perturbation*0.5,0.0,1.0);\nvec4 refractiveColor=texture2D(refractionSampler,projectedRefractionTexCoords);\nvec2 projectedReflectionTexCoords=clamp(vec2(\nvReflectionMapTexCoord.x/vReflectionMapTexCoord.z+perturbation.x*0.3,\nvReflectionMapTexCoord.y/vReflectionMapTexCoord.z+perturbation.y\n),0.0,1.0);\nvec4 reflectiveColor=texture2D(reflectionSampler,projectedReflectionTexCoords);\nvec3 upVector=vec3(0.0,1.0,0.0);\nfloat fresnelTerm=clamp(abs(pow(dot(eyeVector,upVector),3.0)),0.05,0.65);\nfloat IfresnelTerm=1.0-fresnelTerm;\nrefractiveColor=colorBlendFactor*waterColor+(1.0-colorBlendFactor)*refractiveColor;\nreflectiveColor=IfresnelTerm*colorBlendFactor2*waterColor+(1.0-colorBlendFactor2*IfresnelTerm)*reflectiveColor;\nvec4 combinedColor=refractiveColor*fresnelTerm+reflectiveColor*IfresnelTerm;\nbaseColor=combinedColor;\n#endif\n\nvec3 diffuseBase=vec3(0.,0.,0.);\nlightingInfo info;\nfloat shadow=1.;\n#ifdef SPECULARTERM\nfloat glossiness=vSpecularColor.a;\nvec3 specularBase=vec3(0.,0.,0.);\nvec3 specularColor=vSpecularColor.rgb;\n#else\nfloat glossiness=0.;\n#endif\n#include<lightFragment>[0..maxSimultaneousLights]\nvec3 finalDiffuse=clamp(baseColor.rgb,0.0,1.0);\n#ifdef VERTEXALPHA\nalpha*=vColor.a;\n#endif\n#ifdef SPECULARTERM\nvec3 finalSpecular=specularBase*specularColor;\n#else\nvec3 finalSpecular=vec3(0.0);\n#endif\n#else \n#ifdef REFLECTION\n\nvec3 eyeVector=normalize(vEyePosition-vPosition);\nvec2 projectedRefractionTexCoords=clamp(vRefractionMapTexCoord.xy/vRefractionMapTexCoord.z+perturbation,0.0,1.0);\nvec4 refractiveColor=texture2D(refractionSampler,projectedRefractionTexCoords);\nvec2 projectedReflectionTexCoords=clamp(vReflectionMapTexCoord.xy/vReflectionMapTexCoord.z+perturbation,0.0,1.0);\nvec4 reflectiveColor=texture2D(reflectionSampler,projectedReflectionTexCoords);\nvec3 upVector=vec3(0.0,1.0,0.0);\nfloat fresnelTerm=max(dot(eyeVector,upVector),0.0);\nvec4 combinedColor=refractiveColor*fresnelTerm+reflectiveColor*(1.0-fresnelTerm);\nbaseColor=colorBlendFactor*waterColor+(1.0-colorBlendFactor)*combinedColor;\n#endif\n\nvec3 diffuseBase=vec3(0.,0.,0.);\nlightingInfo info;\nfloat shadow=1.;\n#ifdef SPECULARTERM\nfloat glossiness=vSpecularColor.a;\nvec3 specularBase=vec3(0.,0.,0.);\nvec3 specularColor=vSpecularColor.rgb;\n#else\nfloat glossiness=0.;\n#endif\n#include<lightFragment>[0..maxSimultaneousLights]\nvec3 finalDiffuse=clamp(baseColor.rgb,0.0,1.0);\n#ifdef VERTEXALPHA\nalpha*=vColor.a;\n#endif\n#ifdef SPECULARTERM\nvec3 finalSpecular=specularBase*specularColor;\n#else\nvec3 finalSpecular=vec3(0.0);\n#endif\n#endif\n\nvec4 color=vec4(finalDiffuse+finalSpecular,alpha);\n#include<logDepthFragment>\n#include<fogFragment>\ngl_FragColor=color;\n}\n";


/// <reference path="../../../dist/preview release/babylon.d.ts"/>
var __extends = (this && this.__extends) || (function () {
	var extendStatics = Object.setPrototypeOf ||
		({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
		function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
	return function (d, b) {
		extendStatics(d, b);
		function __() { this.constructor = d; }
		d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
	};
})();
var BABYLON;
(function (BABYLON) {
	var CloudProceduralTexture = (function (_super) {
		__extends(CloudProceduralTexture, _super);
		function CloudProceduralTexture(name, size, scene, fallbackTexture, generateMipMaps) {
			var _this = _super.call(this, name, size, "cloudProceduralTexture", scene, fallbackTexture, generateMipMaps) || this;
			_this._skyColor = new BABYLON.Color4(0.15, 0.68, 1.0, 1.0);
			_this._cloudColor = new BABYLON.Color4(1, 1, 1, 1.0);
			_this.updateShaderUniforms();
			return _this;
		}
		CloudProceduralTexture.prototype.updateShaderUniforms = function () {
			this.setColor4("skyColor", this._skyColor);
			this.setColor4("cloudColor", this._cloudColor);
		};
		Object.defineProperty(CloudProceduralTexture.prototype, "skyColor", {
			get: function () {
				return this._skyColor;
			},
			set: function (value) {
				this._skyColor = value;
				this.updateShaderUniforms();
			},
			enumerable: true,
			configurable: true
		});
		Object.defineProperty(CloudProceduralTexture.prototype, "cloudColor", {
			get: function () {
				return this._cloudColor;
			},
			set: function (value) {
				this._cloudColor = value;
				this.updateShaderUniforms();
			},
			enumerable: true,
			configurable: true
		});
		return CloudProceduralTexture;
	}(BABYLON.ProceduralTexture));
	BABYLON.CloudProceduralTexture = CloudProceduralTexture;
})(BABYLON || (BABYLON = {}));

//# sourceMappingURL=babylon.cloudProceduralTexture.js.map

BABYLON.Effect.ShadersStore['cloudProceduralTexturePixelShader'] = "precision highp float;\nvarying vec2 vUV;\nuniform vec4 skyColor;\nuniform vec4 cloudColor;\nfloat rand(vec2 n) {\nreturn fract(cos(dot(n,vec2(12.9898,4.1414)))*43758.5453);\n}\nfloat noise(vec2 n) {\nconst vec2 d=vec2(0.0,1.0);\nvec2 b=floor(n),f=smoothstep(vec2(0.0),vec2(1.0),fract(n));\nreturn mix(mix(rand(b),rand(b+d.yx),f.x),mix(rand(b+d.xy),rand(b+d.yy),f.x),f.y);\n}\nfloat fbm(vec2 n) {\nfloat total=0.0,amplitude=1.0;\nfor (int i=0; i<4; i++) {\ntotal+=noise(n)*amplitude;\nn+=n;\namplitude*=0.5;\n}\nreturn total;\n}\nvoid main() {\nvec2 p=vUV*12.0;\nvec4 c=mix(skyColor,cloudColor,fbm(p));\ngl_FragColor=c;\n}\n";