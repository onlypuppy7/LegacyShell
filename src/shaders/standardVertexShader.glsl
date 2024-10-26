
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

float random(vec3 p)
{
    vec3 K1 = vec3(23.14069263277926, 2.665144142690225, 8.2318798443);
    return fract(cos(dot(p, K1)) * 12345.6789);
}

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

    #ifdef DIRT
        vColor.rgb *= random(floor(worldPosition.xyz + vec3(0.5, 0.5, 0.5))) * 0.2 + 0.7;
    #endif

    fFogDistance = (view * worldPosition).z;
    gl_Position = viewProjection * worldPosition;

    #ifdef EGGSHELL
        vUV = uv;
        vPositionFromCamera = normalize(cameraPosition - worldPosition.xyz);
    #endif
}
