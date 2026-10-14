// GLSL for wet surfaces and lightning flash lighting, inserted into the shared map/player/item shader
// at build time via the client:shaderSources event (see index.js). Node-side only - never spliced
// into the browser bundle.
//
// Lightning: flashAmount (0..1) and flashDir (unit vector from the player toward the bolt) light
// surfaces that face the bolt and give everything a small ambient lift.
//
// Driven by uniforms WeatherRender sets every frame (render.js, WET_UNIFORMS):
//   wetness     0..1  how wet everything exposed to the sky looks
//   wetPuddles  0..1  puddle coverage + ripples (map ground only: the DIRT define is map-only)
//   wetTime, wetSky (reflected colour), wetCam, and the roof height map (wetMap/wetHS/heightSampler)
// Surfaces under a roof stay dry: the height map is sampled slightly out from the surface along its
// normal, so a floor under a roof is sheltered but the outside of a tall wall isn't.

const vertexDeclarations = `varying vec3 vWeatherWorld;`;

const vertexEnd = `vWeatherWorld = worldPosition.xyz;`;

const pixelDeclarations = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
    #define WP highp
#else
    #define WP mediump
#endif
uniform float wetness;
uniform float wetPuddles;
uniform float wetTime;
uniform vec3 wetSky;
uniform vec3 wetCam;
uniform vec4 wetMap;      // map width, map depth, height texture width, height texture depth (blocks)
uniform float wetHS;      // height texture byte -> blocks divisor
uniform sampler2D heightSampler;
uniform vec3 flashDir;
uniform float flashAmount;
varying vec3 vWeatherWorld;

WP float wHash(WP vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

WP float wNoise(WP vec2 p) {
    WP vec2 i = floor(p);
    WP vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// 1 = open to the sky, 0 = under a roof
float wExposure() {
    WP vec2 q = vWeatherWorld.xz + vNormal.xz * 0.3;
    if (q.x < 0.0 || q.y < 0.0 || q.x > wetMap.x || q.y > wetMap.y) return 1.0;
    float h = texture2D(heightSampler, q / wetMap.zw).r * 255.0 / wetHS;
    return 1.0 - smoothstep(vWeatherWorld.y + 0.1, vWeatherWorld.y + 0.6, h);
}
`;

const pixelPreFog = `
    if (flashAmount > 0.001) {
        float facing = max(dot(vNormal, flashDir), 0.0);
        color.rgb += vec3(0.7, 0.78, 1.0) * flashAmount * (0.15 + 0.85 * facing);
    }

    if (wetness > 0.001) {
        float wet = wetness * wExposure();
        if (wet > 0.001) {
            vec3 V = normalize(wetCam - vWeatherWorld);
            float up = max(vNormal.y, 0.0);
            float fres = pow(1.0 - max(dot(vNormal, V), 0.0), 3.0);

            // wet things are darker, reflect the sky at glancing angles, and catch a tight highlight
            color.rgb *= 1.0 - 0.4 * wet;
            color.rgb += wetSky * (0.03 + 0.6 * fres) * wet * (0.4 + 0.6 * up);
            vec3 Hh = normalize(normalize(vec3(.2, 1., .1)) + V);
            color.rgb += vec3(pow(max(dot(vNormal, Hh), 0.0), 64.0)) * 0.22 * wet * up * sunColor;

            #ifdef DIRT
            if (wetPuddles > 0.001 && vNormal.y > 0.9) {
                WP vec2 pp = vWeatherWorld.xz;
                float n = wNoise(pp * 0.7) * 0.65 + wNoise(pp * 2.1) * 0.35;
                float cover = 0.62 - 0.25 * wetPuddles;
                float pud = smoothstep(cover, cover + 0.1, n) * wet;

                // a ring per cell that expands and fades, restarting at a per-cell phase
                WP vec2 cell = floor(pp * 3.0);
                WP vec2 cf = fract(pp * 3.0) - 0.5;
                float phase = fract(wetTime * 0.9 + wHash(cell));
                float d = length(cf - (vec2(wHash(cell + 7.1), wHash(cell + 3.7)) - 0.5) * 0.5);
                float ring = smoothstep(0.06, 0.0, abs(d - phase * 0.45)) * (1.0 - phase);

                vec3 refl = wetSky * (0.55 + 0.45 * fres);
                color.rgb = mix(color.rgb, refl * 0.7, pud * 0.65);
                color.rgb += wetSky * ring * pud * 0.9;
            }
            #endif
        }
    }
`;

export function patchStandardShader(shaders) {
    //insert on the line after the anchor comment, leaving the anchor itself in place for other plugins
    var add = (src, anchor, text) => {
        var at = src.indexOf(anchor);
        if (at === -1) throw new Error(`legacyweather: shader anchor ${anchor} not found`);
        var eol = src.indexOf("\n", at);
        if (eol === -1) eol = src.length;
        return src.slice(0, eol + 1) + text + "\n" + src.slice(eol + 1);
    };
    shaders.vertex = add(shaders.vertex, "//@vertexDeclarations", vertexDeclarations);
    shaders.vertex = add(shaders.vertex, "//@vertexEnd", vertexEnd);
    shaders.pixel = add(shaders.pixel, "//@pixelDeclarations", pixelDeclarations);
    shaders.pixel = add(shaders.pixel, "//@pixelPreFog", pixelPreFog);
};
