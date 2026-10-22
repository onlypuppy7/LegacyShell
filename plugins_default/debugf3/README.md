# Debug F3

Press **F3** in game to toggle a Minecraft style debug screen: the same layout, with the same translucent grey highlight behind every line.

## What it shows

- Left: version/gamemode/map, fps, server and ping, rendered meshes and triangles, entity/bullet/rocket/grenade counts, player count, room code, `XYZ`, `Block`, velocity, `Facing` (with Minecraft-style yaw/pitch, so yaw turns the other way), ground/climbing state, map, gamemode and team, health, and the block you're looking at.
- Right: browser, JS heap memory (Chromium only), CPU thread count, display size, GPU vendor/renderer/GL version, and the targeted block's coordinates and mesh name.

The toggle is remembered in `localStorage`. Only drawn while in a game. Settings > General > Debug has a checkbox that hides identifying info (browser, CPU, display, GPU, room code) for streaming and screenshots (needs LegacySettings).

## Notes

Purely client-side (only registers `client:pluginSourceInsertion`, splicing `client.js` into the bundle). It runs its own `requestAnimationFrame` loop and refreshes the text at 10Hz. "Targeted block" raycasts 8 units from the camera with `Collider.rayCollidesWithMap`, the same way bullets do.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
