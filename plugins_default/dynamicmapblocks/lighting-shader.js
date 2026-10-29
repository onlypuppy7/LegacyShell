//plugin: dynamicmapblocks, build only
export function patchPlatformShader(shaders) {
    var add = (source, anchor, code) => {
        var at = source.indexOf(anchor);
        if (at < 0) throw new Error('dynamicmapblocks: missing shader anchor ' + anchor);
        var end = source.indexOf('\n', at);
        if (end < 0) end = source.length;
        return source.slice(0, end + 1) + code + '\n' + source.slice(end + 1);
    };
    shaders.vertex = add(shaders.vertex, '//@vertexDeclarations', `
#ifdef DMB_SURFACE
uniform mat4 dmbRestWorld;
#endif
#ifdef DMB_ENVIRONMENT
uniform highp sampler2D dmbLightSampler;
uniform highp vec4 dmbGrid;
uniform highp vec2 dmbAtlasSize;
highp vec2 dmbUV(highp vec3 p, highp float z) {
    return (vec2(mod(z, dmbGrid.w) * dmbGrid.x, floor(z / dmbGrid.w) * dmbGrid.y) + p.xy + 0.5) / dmbAtlasSize;
}
float dmbRead(highp vec2 uv) {
#ifdef WEBGL2
    return texture(dmbLightSampler, uv).r;
#else
    return texture2D(dmbLightSampler, uv).r;
#endif
}
float dmbLight(highp vec3 position) {
    if (any(lessThan(position, vec3(0.0))) || any(greaterThan(position, dmbGrid.xyz - 1.0))) return 1.0;
    highp vec3 p = clamp(position, vec3(0.0), dmbGrid.xyz - 1.0);
    highp float z = floor(p.z);
    float a = dmbRead(dmbUV(p, z));
    float b = dmbRead(dmbUV(p, min(z + 1.0, dmbGrid.z - 1.0)));
    return clamp(mix(a, b, fract(p.z)) * 1.5, 0.5, 1.0);
}
#endif
#ifdef DMB_ENVIRONMENT_UNIFORM
uniform float dmbShade;
#endif
`);
    shaders.vertex = add(shaders.vertex, '//@vertexEnd', `
#ifdef DMB_SURFACE
    vColor.rgb *= random(floor((dmbRestWorld * vec4(position, 1.0)).xyz + vec3(0.5))) * 0.2 + 0.7;
#endif
#ifdef DMB_ENVIRONMENT
    vColor.rgb *= dmbLight(worldPosition.xyz);
#endif
#ifdef DMB_ENVIRONMENT_UNIFORM
    vColor.rgb *= dmbShade;
#endif
`);
};
