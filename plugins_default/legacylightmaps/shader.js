//plugin: legacylightmaps, leave the other plugins' shader anchors in place
export function patchLightmapShader(shaders) {
    var replace = (source, anchor, text) => {
        if (source.split(anchor).length !== 2) throw new Error('legacylightmaps: shader anchor changed: ' + anchor);
        return source.replace(anchor, () => text);
    };
    var add = (source, anchor, text) => {
        var at = source.indexOf(anchor), eol = source.indexOf('\n', at);
        if (at === -1 || eol === -1) throw new Error('legacylightmaps: shader anchor changed: ' + anchor);
        return source.slice(0, eol + 1) + text + '\n' + source.slice(eol + 1);
    };
    shaders.vertex = add(shaders.vertex, '//@vertexDeclarations', 'varying float vLegacyBaked;');
    shaders.vertex = replace(shaders.vertex, 'vColor = color;', `vColor = color;
    vLegacyBaked = 0.0;
    #ifdef DIRT
        vLegacyBaked = clamp(-color.a, 0.0, 1.0);
        vColor.a = abs(color.a);
    #endif`);
    var dirt = 'vColor.rgb *= random(floor(worldPosition.xyz + vec3(0.5, 0.5, 0.5))) * 0.2 + 0.7;';
    shaders.vertex = replace(shaders.vertex, dirt, 'vColor.rgb *= mix(random(floor(worldPosition.xyz + vec3(0.5, 0.5, 0.5))) * 0.2 + 0.7, 1.0, vLegacyBaked);');
    shaders.pixel = add(shaders.pixel, '//@pixelDeclarations', 'varying float vLegacyBaked;\nuniform vec3 legacyBakedSun;');
    var shade = 'color.rgb *= max(max(0., -vNormal.y * 0.4), dot(vNormal, normalize(vec3(.2, 1., .1)) * 1.) + 0.4);';
    shaders.pixel = replace(shaders.pixel, shade, 'color.rgb *= mix(max(max(0., -vNormal.y * 0.4), dot(vNormal, normalize(vec3(.2, 1., .1)) * 1.) + 0.4), 1.0, vLegacyBaked);');
    shaders.pixel = replace(shaders.pixel, 'color.rgb *= sunColor;', 'color.rgb *= mix(sunColor, sunColor / max(legacyBakedSun, vec3(0.001)), vLegacyBaked);');
};
