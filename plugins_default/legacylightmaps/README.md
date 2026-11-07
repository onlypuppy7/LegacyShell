# LegacyLightmaps

Makes the game use the map editor's existing lightmap exports. Vibecoded. The editor, its UI and its export format are unchanged.

Render a map in the editor, then use its normal Save/Export. Install the exported `.json` as usual and put the `.lightmap` in `server-client/src/client-static/maps/` (or a plugin's static `maps/` folder), served at `/maps/<map name>.lightmap`. Use the map's **name**, which can differ from its export filename. Both the editor's raw RGB bytes and older JSON RGB arrays are supported. Requests are asynchronous and revalidate the browser cache.

The editor's **Test** button already puts the rendered RGB array in `localStorage`. Offline tests read that existing value. Minerva's Test ONLINE does not transfer a lightmap; online games use the hosted sidecar.

The game rebuilds the editor's original vertex order from its x/y/z block scan, then matches baked colors by position, surface normal and original paint color. This keeps coincident vertices on banner emblems and painted edges separate. Baked maps retain their original geometry when Francium is installed, without changing the Simple Map preference. Missing files, invalid data and incorrect vertex counts fall back to normal lighting. The existing format has no map fingerprint: after editing a map, render/export both files again; an old bake with the same vertex count cannot be identified reliably.

Baked vertices skip the game's extra dirt and directional shading. Player shadows, fog and LegacyWeather's effects still apply. Time-of-day tint is relative to the baked sun color. Moving blocks keep their own lighting.

Included as a default plugin. Restart the client server and reload the game. Prefix the folder with `_` to disable it. No services/game changes or database migration needed.

Run `node plugins_default/legacylightmaps/test.js` from the repo root.
