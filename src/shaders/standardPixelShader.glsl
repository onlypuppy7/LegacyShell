#define FOGMODE_NONE 0.
#define FOGMODE_EXP 1.
#define FOGMODE_EXP2 2.
#define FOGMODE_LINEAR 3.
#define E 2.71828

precision lowp float;

// Uniforms
uniform sampler2D shadowSampler;
uniform vec3 shadowParams;
uniform vec4 vFogInfos;
uniform vec3 vFogColor;
uniform vec3 emissiveColor;
uniform mat4 worldView;
uniform float hp;
uniform vec3 colorMult;
uniform vec4 outlineColor;
uniform sampler2D textureSampler;
uniform vec2 stampOffset;
uniform vec3 sunColor;

// Varying
varying vec4 vPositionFromLight;
varying vec3 vPositionFromCamera;
varying vec4 vColor;
varying vec2 vUV;
varying vec3 vNormal;
varying float fFogDistance;

const float sOff = .001;

// FUNCTIONS
float unpack(vec4 color)
{
    const vec4 bit_shift = vec4(1.0 / (255.0 * 255.0 * 255.0), 1.0 / (255.0 * 255.0), 1.0 / 255.0, 1.0);
    return dot(color, bit_shift);
}

float random(vec2 p)
{
    vec2 K1 = vec2(23.14069263277926, 2.665144142690225);
    return fract(cos(dot(p, K1)) * 12345.6789);
}

float calcFogFactor()
{
    float fogCoeff = 1.0;
    float fogStart = vFogInfos.y;
    float fogEnd = vFogInfos.z;
    float fogDensity = vFogInfos.w;

    fogCoeff = 1.0 / pow(E, fFogDistance * fFogDistance * fogDensity * fogDensity * 4.); // Exp2

    return clamp(fogCoeff, 0.0, 1.0);
}

float computeShadow(vec4 vPositionFromLight, sampler2D shadowSampler, float darkness)
{
    vec3 depth = vPositionFromLight.xyz / vPositionFromLight.w;
    depth = 0.5 * depth + vec3(0.5);
    vec2 uv = depth.xy;

    if (uv.x < 0. || uv.x > 1.0 || uv.y < 0. || uv.y > 1.0)
    {
        return 1.0;
    }

    #ifndef SHADOWFULLFLOAT
        float shadow = unpack(texture2D(shadowSampler, uv));
    #else
        float shadow = texture2D(shadowSampler, uv).x;
    #endif

    if (depth.z < shadow) return 1.;
    float s = clamp((depth.z - shadow) * 12. + 0.5, 0.5, 1.0);
    return min(1.0, max(s, length(vPositionFromLight.xy)));
}

vec3 desaturate(vec3 color, float amount)
{
    vec3 gray = vec3(dot(vec3(0.2126,0.7152,0.0722), color));
    return vec3(mix(color, gray, amount));
}

// MAIN
void main(void)
{
    vec4 color = vColor;

    #ifdef EGGSHELL // Show cracks and stamp texture!
        color.rgb = min((color.rgb - 0.5) * 4. + hp + 2., 1.);
        color.rgb *= colorMult;
        vec2 uv = clamp(vUV, vec2(0., 0.9375), vec2(.0625, 1.));
        uv += stampOffset;
        color.rgb = mix(color.rgb, texture2D(textureSampler, uv).rgb, texture2D(textureSampler, uv).a);
    #endif

    #ifdef RECEIVESHADOWS
        float s = computeShadow(vPositionFromLight, shadowSampler, shadowParams.x);
        color *= vec4(s, s, s, 1.);
    #endif

    color.rgb *= max(max(0., -vNormal.y * 0.4), dot(vNormal, normalize(vec3(.2, 1., .1)) * 1.) + 0.4);
    color.rgb *= sunColor;
    //color.rgb *= max(0., dot(vNormal, normalize(vec3(-.2, 1., -.1))) + 0.4);

    #ifdef FLASH
        color.rgb += emissiveColor;
    #endif

    float fog = calcFogFactor();
    color.rgb = fog * color.rgb + (1.0 - fog) * vFogColor;

    #ifdef EGGSHELL
        float f = step(dot(vNormal, vPositionFromCamera), 0.4);
        color.rgb = mix(color.rgb, outlineColor.rgb, f * outlineColor.a);
    #endif

    gl_FragColor = color;
}
