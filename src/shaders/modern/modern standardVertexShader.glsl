
#include<instancesDeclaration>
#include<bonesDeclaration>

precision lowp float;

// Attributes
attribute vec3 position;
attribute vec3 normal;
attribute vec4 color;
attribute vec2 uv;

// Uniforms
uniform mat4 view;
uniform mat4 viewProjection;
uniform mat4 shadowLightMat;
uniform vec3 cameraPosition;
uniform vec3 colorMult;

// Varying
varying vec4 vPositionFromLight;
varying vec3 vPositionFromCamera;
varying vec3 vNormal;
varying vec4 vColor;
varying vec4 vEmissiveColor;
varying float fFogDistance;

#ifdef EGGSHELL
	varying vec2 vUV;
#endif

/*
vec4 distort(vec4 p)
{
    vec2 v = p.xy / p.w;

    // Convert to polar coords:
    float theta  = atan(v.y,v.x);
    float radius = length(v);

    // Distort:
    radius = pow(radius, 0.9);

    // Convert back to Cartesian:
    v.x = radius * cos(theta);
    v.y = radius * sin(theta);
    p.xy = v.xy * p.w;
    return p;
}
*/

// MAIN
void main(void) {
	#include<instancesVertex>
	#include<bonesVertex>
	vec4 worldPosition = finalWorld * vec4(position, 1.);

	#ifdef RECEIVESHADOWS
		vPositionFromLight = shadowLightMat * worldPosition;
	#endif

	vNormal = normalize(vec3(finalWorld * vec4(normal, 0.0)));
	vColor = color;
	
	#ifdef COLORMULT
		vColor.rgb *= colorMult;
	#endif

	#ifdef COLORIZE
		vColor.rgb = colorMult;
	#endif

	fFogDistance = (view * worldPosition).z;
	gl_Position = viewProjection * worldPosition;

	#ifdef EGGSHELL
		vUV = uv;
		vPositionFromCamera = normalize(cameraPosition - worldPosition.xyz);
	#endif
}
