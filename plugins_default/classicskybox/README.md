# Classic Skybox

Readds the skyboxes from Shell Shockers' earliest versions, built in code from the original game's own source: `classic` (0.1.0 - sky, clouds, dark ocean and hazy mountains) and `classic-alpha` (0.0.4 - the same sky without the mountains, over a bright blue ocean that fades pale toward the horizon). Client-only in practice; the server side just merges its two models.

## Using it

A map picks one by setting its `skybox` to `classic` or `classic-alpha` (see [Maps](/wiki/docs/03-Content%20Creation/maps.md#fields-set-outside-the-editor)) - both names are added to the map editor's skybox dropdown. [TimeMachine](/plugins_default/timemachine/README.md)'s "Map Skybox" setting can also put either one on every map for that player, by setting `ClassicSkyboxPlugin.override`.

## What it actually does

- Ships `sky.babylon` and `mountains.babylon` (`models/`), merged into the build like any content pack (`prepareBabylonBefore`/`prepareBabylon` - see [Content Packs](/wiki/docs/04-Plugin%20Development/content-packs.md#models)), and adds both to the game scene's model list on `game:afterBullshit`.
- Splices Babylon's old `SkyMaterial`, `WaterMaterial` and `CloudProceduralTexture` (`src/babylonExtensions.js`, from the 2017 `babylon.custom.js` - see `src/references.txt`) into the browser bundle at `after`, since the bundled Babylon doesn't have them.
- On `game:onMapComplete`, if the map's skybox (or the override) is one of its variants, it hides the map's cubemap skybox, raises the camera's far plane to 2000 and builds the scene: a `SkyMaterial` box, a procedural cloud dome on the `sky` mesh, the ocean plane and, for `classic`, three rings of `mountains` drawn with the map shader so the map's fog hazes them the way it did when they were part of the map. Everything it made is disposed on the next map load.
- On `client:doReplacements`, adds every variant name to the editor's `LEGACYSHELLSKYBOXES` list.

`test.js` is the original 0.1.0 code this was rebuilt from, kept for reference - it isn't loaded.

## Adding a variant

Add a function to `ClassicSkyboxPlugin.variants` in `shared.js`, keyed by the skybox name. It gets `(gameScene, centreX, centreZ)`, should pass every mesh it makes through `this.add(mesh)` so it's cleaned up on the next map, and the name shows up in the editor automatically.
