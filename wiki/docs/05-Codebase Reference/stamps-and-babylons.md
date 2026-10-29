# Stamps and Babylons

> **Audience:** Core contributors, AI agents · **Prereqs:** [Build Pipeline](./build-pipeline.md)
>
> **Canonical source:** `src/shell/general/prepare-babylons.js`, `server-client/src/stampsGenerator.js`

Two build steps that run in parallel on every client server boot, with one real dependency between them. For the content-creator-facing view of these systems, see [Dealing with Babylon Models](../03-Content%20Creation/dealing-with-models.md) and [Hats and Stamps](../03-Content%20Creation/hats-and-stamps.md) - this page is the engineering-level detail underneath both.

## `prepareBabylons` - merging base and plugin models

`prepareBabylons(endBabylonsDir, baseBabylonsDir)` (defaults: `store/export-static/models` and `src/base-babylons`) processes every `.babylon` file in the base directory:

1. Emits `prepareBabylonBefore` with the list of base filenames - plugins can add their own filenames here.
2. Per base file, emits `prepareBabylon` - plugins push `{ filepath, overwrite, attemptFixSkeleton, ... }` descriptors onto `extraBabylons` for anything they want merged into *this* base file.
3. For each extra babylon, emits `prepareBabylonExtra`, then:
   - If `attemptFixSkeleton` and the extra file has skeletons, runs a real bone-reconciliation routine - reordering the extra skeleton's bones to match the base skeleton's bone order (matched by name), remapping `matricesIndices` on affected meshes, and reordering `inverseBindMatrices`/`bindPose` to match. This exists because two independently-exported `.babylon` files with a skeleton (rigged models - hats/accessories that need to follow player bone animation) won't have matching bone *indices* even if they have matching bone *names*, and the renderer needs matching indices.
   - Merges `meshes`/`materials`/`multiMaterials` arrays, either appending the extra data after the base (`overwrite: false`, extra data takes priority when both define something with the same effect) or the reverse (`overwrite: true`).
4. **Deduplicates** materials, multiMaterials, and meshes that ended up with more than one instance of the same `name` after merging - keeps first, drops the rest.
5. **Auto-corrects PBR materials to `StandardMaterial`** - if any merged-in material has `customType` set to anything other than `"BABYLON.StandardMaterial"`, it's forcibly rewritten, with a loud warning. This is a real content constraint from [Dealing with Babylon Models](../03-Content%20Creation/dealing-with-models.md)'s export instructions ("turn off PBR materials") enforced in code, not just documentation.
6. Writes the merged result plus a `.manifest` file (containing a version number derived from a SHA-256 hash of the merged content, used for cache-busting).
7. **Change detection**: compares the newly-built file's content against whatever was already on disk at that path - if nothing actually changed, the whole thing is a no-op past the comparison (no zip regeneration, no further work). Note: the zip-packaging step this comment refers to (`saveZip`) is currently **commented out entirely** in source (`// saveZip(modelsZip, 'models.zip')` - the author's own comment above it reads "why was i still doing this pointless bullshit?") - despite older documentation describing automatic model zipping, it does not currently happen. See [Known Quirks](./known-quirks.md).

## `egg.babylon`'s classic guns get their bones renamed

`egg.babylon` carries the classic gun models (`old.*` meshes), skinned to the hands skeleton - but in game they're given the matching *modern* gun's skeleton, whose bones are named differently. So when `egg` is built, `remapClassicGunBones` reads each `src/base-babylons/gun_<name>.babylon`'s skeleton and rewrites every classic gun vertex's `matricesIndices` to the equivalent modern bone (`gunBody` → `body`, `magazine` → `clip`, `foreStock` → `forestock`, others by name). Without it the classic guns' reload animations bend the wrong parts. The gun files' signatures are part of `egg`'s build cache key, so changing a gun rebuilds `egg` too.

On the browser side, `cloneMesh` takes a skeleton name, so a gun mesh whose name exists twice (once in its own file, once as a hands-skinned copy) clones the one with the right skeleton.

## The model manifests are baked into the bundle

Every merged `<file>.babylon` gets a `<file>.babylon.manifest` next to it. Babylon would normally fetch each one before loading the model just to read its version; instead `prepare-modified.js` waits for `prepareBabylons` to finish and inlines all of them into the bundle (`LEGACYSHELLMANIFESTS`), and a patched `BABYLON.Database.prototype._checkManifestFile` answers from that, so a dozen requests drop out of startup.

## The one cross-dependency: the egg mesh's UVs come from the stamp system

While merging, if a mesh named exactly `"egg"` is encountered, its UV coordinates get overwritten by `createStampsUV()` - **imported directly from `stampsGenerator.js`**. This is how stamps end up positioned correctly on the egg model at specific body locations - the stamp spritesheet's layout and the egg mesh's UV mapping have to agree with each other, and this is the code that keeps them in sync rather than requiring the artist to hand-align UVs to a spritesheet that changes shape every time a stamp is added or removed.

## `stampsGenerator.js` - the spritesheet build

See [Hats and Stamps](../03-Content%20Creation/hats-and-stamps.md) for the content-creator-facing view (filename matching rules, adding a stamp). Engineering-relevant details:

- Reads image directories (`src/stamps/` plus anything a plugin registers via `client:stampImageDirs`), filters to `.png` files (explicitly skipping macOS `._`-prefixed resource-fork artifacts).
- Composites all matched images into one square spritesheet sized `ceil(sqrt(count))` cells per side, via `sharp`.
- **Skip logic**: hashes every matched input file plus the existing output file; if the combined hash matches what's recorded in `store/stamps_image_hashes.json` from last time, the entire compositing pass is skipped.
- Writes each stamp's grid `x`/`y` position back into the in-memory item data, and exports `createStampsUV()` - the function `prepare-babylons.js` calls to align the egg mesh's UVs to whatever grid layout was just computed.
- After compositing (or after deciding to skip it), `makeWebp` writes a lossless `stamps.webp` next to `stamps.png` (always after a fresh composite; after a skipped one, only if the WebP is missing or older than the PNG), which `server-client/src/stampsWebp.js` sends to browsers that accept WebP under the same `img/stamps.png` URL.
- `cacheModified` (also exported) is a flag `prepare-modified.js`'s second replacement pass waits on before inlining `ss.cache.items` into the bundle - see [Build Pipeline](./build-pipeline.md#the-two-pass-token-replacement) - since the stamp coordinates need to already be baked into the item data before that JSON gets embedded.

## Why these two things run in parallel but aren't fully independent

`prepareBabylons` and `stampsGenerator`'s work both happen concurrently with the main `modifyFiles()` JS/HTML build (see [Build Pipeline](./build-pipeline.md)), but there's a real ordering constraint underneath: babylon merging needs `createStampsUV()`'s *output*, so if stamp compositing hasn't produced stable coordinates yet when a babylon merge tries to read them, the egg model's stamp UVs could be built against stale data. In practice this works because `createStampsUV` is an `async` function `prepare-babylons.js` `await`s directly - it's not relying on run order between the two top-level parallel tasks, just on this one specific function call being awaited at the point it's actually needed.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
