# Block Viewer

Adds **Block viewer** below the map editor's top toolbar. Runs on the **client server only**, using the existing editor hooks.

## Taking a look

- Browse every loaded editor block, filter by theme, or search its full name. Each block in the list has a small preview, drawn as it scrolls into view.
- Drag to orbit, scroll to zoom, and right drag to pan. Switching editor blocks keeps your orbit, zoom and pan; use Fit or Reset to frame the new block.
- Toggle **Model** off to inspect collision alone. Toggle **Collision**, **Wireframe**, or **Auto turn**. **Fit** frames the model; **Reset** restores the view and rotation. **Y +90°** turns the preview without touching your palette or map.
- The stats panel shows mesh, vertex, triangle and material counts, dimensions, rotation, collision type, shape count and softness.
- Expand **Type definition** or **Softness definition** for the selected block's behavior. Hover the stat labels or values for the same definitions.
- **Esc** or the close button returns to the editor. Typing and rotating in the viewer do not trigger map editor shortcuts.

Collision follows the game's rules: full cells; tilted wedge/iwedge boxes; axis-aligned or oriented bounds from collision children; player-only ladder bounds; and no collision for `none`. Wedge boxes extend beyond a cell: gameplay checks only the part in that cell. For `aabb` and `obb`, the orange shapes show collision bounds; `mesh` shows the collider triangles.

`mesh` collision shows the actual triangles of the collision child and its descendants. Unlike `aabb` and `obb`, it preserves holes and concave gaps. Open surfaces collide from both sides. The viewport includes a ground grid with darker center lines, centered beneath the preview for both editor blocks and imported files.

## Local files

Click **Import model**, or drop a **.babylon** or **.glb** onto the dialog. View the whole model or select blocks from its hierarchy, and use the source dropdown to return to editor blocks. Collision children stay grouped under their block. **Clear import** releases the imported scene.

**Export .babylon** saves either the **Whole file** or the **Selected block** with its collider children and ancestor transforms. Export uses the original imported data, so preview rotation, model visibility and wireframe do not change the file. Embedded texture images stay embedded. Transform-only parents are saved as empty meshes for compatibility with the editor's Babylon 3.3 loader.

Imports are read-only local previews, never uploaded or added to the editor. Block names with a recognized collision type use the same collision rules as editor blocks, including parented collider children. Other models have no inferred gameplay collision. Use self-contained models under 64 MB. Babylon files with separate texture images show geometry and material colors; embedded textures are supported. GLB uses the editor's Babylon 3.3 loader and supports the formats/extensions implemented by that version; newer extensions may require exporting a simpler GLB. Replacing an import releases the previous scene, and rendering stops while the dialog is closed or the page is hidden.

## Installation

Included as a default plugin. Restart the client server after installing/enabling it, then reload the editor. Prefix this folder with `_` to disable it.

`client/vendor/babylonjs.loaders.min.js` is the unmodified **babylonjs-loaders 3.3.0** UMD distribution, pinned to match the editor's Babylon engine. It loads locally on the first GLB import. Source: [npm distribution](https://unpkg.com/babylonjs-loaders@3.3.0/babylonjs.loaders.min.js), [Babylon.js](https://github.com/BabylonJS/Babylon.js). Apache 2.0 license in `client/vendor/LICENSE.md`.

## Checks

Run `node plugins_default/blockviewer/test-viewer.mjs` from the repository root. Checks cover client-only hooks, collision bounds, preview isolation, framing and repeated resource disposal. Browser verification covers both local import formats and the responsive dialog.

Author: onlypuppy7 (+Codex). This plugin is vibecoded.
