# LegacyWeather

Weather and time of day: three independent weather layers (`rain`, `storm`, `snow`), wind, and a time-of-day preset, all synced per room and blended smoothly on the client. Commands: `/weather set|clear|get` and `/time set|get`. See the root [CLAUDE.md](/CLAUDE.md) / [AGENTS.md](/AGENTS.md) for the general "could this be a plugin?" philosophy this follows.

## State

Everything lives under `gameOptions.plugins.weather` and `gameOptions.plugins.time`, the same "arbitrary flags for plugins" bucket every room already syncs through `updateRoomParams`.

```js
gameOptions.plugins.weather = { rain, storm, snow, wind, transitionSecs }
gameOptions.plugins.time    = "day" | "dusk" | "night" | { preset, sun, fogColor, fogMult, sky, transitionSecs }
```

Each layer can be written as a **number** (intensity 0-1; everything scales together) or as an **object** (`intensity` plus any of that layer's parts, which override what the intensity would have produced). Anything may write either form - a gametype's options, another plugin, a command - and `WeatherState.sanitizeWeather()` / `sanitizeTime()` in `weatherState.js` normalise it to the full resolved shape. Re-resolving an already-resolved object changes nothing.

```js
plugins.weather.rain = 0.6;                                  // a moderate rain
plugins.weather.storm = { intensity: 0.5, thunder: 0.1 };    // half-strength, nearly silent thunder
```

A layer with a part list omitted follows its intensity; an object with no `intensity` defaults to 0.7. Unknown part names are rejected (commands report the valid ones; direct writes fall back to off).

### Layers and their parts

| Layer | Part | Range | Does |
|---|---|---|---|
| `rain` | `drops` | 0-1 | how many drops are visible |
| | `streak` | 0-1 | length of each drop |
| | `sound` | 0-1 | rain loop volume |
| | `wetness` | 0-1 | how wet surfaces look |
| | `puddles` | 0-1 | puddles and ripples on flat surfaces |
| | `splashes` | 0-1 | splash particles where drops land |
| `storm` | `clouds` | 0-1 | cloud cover (dims the map's own sky) |
| | `skyTint` | 0-1 | grey-blue tint over the map's own sky |
| | `darkness` | 0-1 | how much sunlight is dimmed |
| | `fog` | 0-1 | extra fog thickness and greying |
| | `lightning` | 0-1 | how often lightning strikes |
| | `flash` | 0-1 | brightness of the lightning flash |
| | `thunder` | 0-1 | thunder volume |
| | `distance` | 10-150 | typical strike distance in blocks (thunder delay and loudness follow) |
| `snow` | `flakes` | 0-1 | how many flakes are visible |
| | `size` | 0-1 | flake size |
| | `fall` | 0-1 | fall speed |
| `wind` | `strength` | 0-1 | slants rain, drifts snow |
| | `direction` | 0-360 | degrees |

The table in `weatherState.js` (`WeatherState.layers`) is the single source of truth for defaults, ranges and validation; this page mirrors it.

Rain and storm are separate on purpose: a thunderstorm is `rain` + `storm`, a dry thunderstorm is `storm` alone, and rain without lightning is `rain` alone. Snow is only falling flakes - snow on blocks is the `christmasevent` plugin's job.

### Time presets

| Preset | `sun` (multiplied into sunlight) | `fogColor` | `fogMult` | `sky` (skybox brightness) |
|---|---|---|---|---|
| `day` | 1, 1, 1 | the map's own | 1 | 1 |
| `dusk` | 1, 0.65, 0.45 | 0.45, 0.3, 0.3 | 1.1 | 0.6 |
| `night` | 0.3, 0.35, 0.55 | 0.03, 0.04, 0.09 | 1.3 | 0.12 |

Any of those parts can be overridden in the object form.

## Commands

All are in-room slash commands; `set`/`clear` need moderator (or game owner in a private room), `get` is open to everyone. None are cheats.

```
/weather set rain 0.6
/weather set storm 0.5 thunder=0.1 distance=80 seconds=20
/weather set wind 0.4 90            # strength, then direction in degrees
/weather clear                      # every layer and wind
/weather clear rain
/weather get
/time set night
/time set dusk sky=0.4 seconds=15
/time get
```

`seconds=N` is how long the change takes to blend (default 8, `0` is instant). Setting one layer never touches the others.

## How it renders (client)

`render.js` (`WeatherRender`) keeps a current and target value per channel, eases each toward its target (so a change mid-transition continues from where it is - no jumps), and a single `apply()` step combines every channel into the scene: sun colour, fog colour and density, and skybox brightness and tint. Nothing else writes those, which is what stops transitions fighting each other. The first sync after joining is applied instantly instead of fading in from nothing.

The map's own fog (`minMap.fog`) is the baseline; time of day and weather push it from there. The map's own skybox is never swapped.

### Lightning

A strike builds a bolt from its seed: a jagged path made by repeatedly splitting segments and nudging the midpoint sideways, plus two or three shorter branches. It's two additive ribbons (a thin bright core and a soft wide glow) that are re-billboarded toward the camera every frame while it's showing, with a constant angular width so far bolts stay thin. Bolts beyond the camera's draw distance are drawn nearer along the same line, and dimmer.

The flash is a quick double pulse. Instead of whitening the whole scene, it's lit from the bolt's direction: the shared shader adds light to surfaces in proportion to how much they face the bolt (plus a small ambient lift), so walls toward the strike light up and the far sides stay dark. Cloud brightness around the bolt's direction rises with it. Thunder arrives after `distance / 120` seconds, quieter and lower-pitched the farther away it was.

### Clouds

The map's own skybox is always kept. Over it, a cloud dome (a sphere that follows the camera) draws procedural clouds that scroll with the wind, thicken with `storm.clouds`, are tinted by time of day, and fade into the horizon. `storm.skyTint` separately washes the skybox grey-blue.

### Wet surfaces and puddles

Wetness is GLSL inserted into the game's shared map/player/item shader, not a material swap, so skins, tints and shadows are untouched. `weatherShader.js` is applied at build time through the `client:shaderSources` event (see [the build pipeline](/wiki/docs/05-Codebase%20Reference/build-pipeline.md)): core's `standardVertexShader.glsl` / `standardPixelShader.glsl` have named anchor comments (`//@vertexDeclarations`, `//@vertexEnd`, `//@pixelDeclarations`, `//@pixelPreFog`) and any plugin can insert at them. `WeatherRender.hookMaterials` adds the plugin's uniforms and height sampler to every material using that shader before it first compiles.

When wet, a surface gets darker, reflects the sky colour at glancing angles, and catches a tight highlight. Flat map ground additionally gets puddles - a noise mask whose coverage follows `rain.puddles` - with an expanding ring ripple per cell while it's wet. Everything is dried by the same roof height map as the rain: the map is sampled slightly out from the surface along its normal, so a floor under a roof is dry but the outside of a tall wall isn't.

The world wets in about 20 seconds of rain and takes about 60 seconds to dry (its own slow state, separate from the 8-second weather blend). Puddles are High quality only.

### Rain and snow

Both are one fixed mesh of pre-randomised quads (5000 for rain, 3000 for snow) animated entirely in the vertex shader - nothing is updated on the CPU per drop. Each drop's position comes from time plus its own random numbers, wrapped around the camera so the field is endless in every direction. The `rain.drops`/`snow.flakes` part just sets what fraction of the quads is visible, so fading in and out costs nothing. Wind slants the streaks (and tilts their direction), and snow also sways.

Roofs keep the rain off: on each map load a **height map** is built (the top of every x,z column, taken from the map's cell data so invisible barriers, ladders and decoration-only blocks don't count), uploaded as a tiny RGBA texture, and the fragment shader discards any drop below its column's top. `WeatherRender.heightAt(x, z)` reads the same table on the CPU - the rain loop gets quieter under a roof, and splashes are placed on it. (It's an RGBA texture on purpose: single-channel/luminance textures sample as zero on some GPUs.)

**Splashes** are a pool of 80 ring sprites spawned near the camera on whatever surface the rain actually lands on, High quality only.

**Quality** is its own setting (Graphics tab, "Rain & Snow": High / Low / Off), no longer tied to the shadows checkbox. Low shows 40% of the drops and no splashes; Off removes rain and snow entirely. When the auto-detail optimiser turns shadows off, High drops to Low for as long as shadows stay off.

## Server logic

Lightning is scheduled in this plugin's `metaLoop` listener (every ~2s): the chance of a strike is `1 - exp(-lightning * 0.2 * 2)`. A strike is the `doThunderStrike` opcode (added with `Comm.Add`) carrying three values, so every client draws the same bolt:

| Field | Size | Meaning |
|---|---|---|
| seed | 16-bit | shapes the bolt (its jagged path and branches) |
| angle | 8-bit | direction around each player, 0-255 around the full circle |
| distance | 8-bit | blocks away (the storm's `distance` part, varied by +/-40%) |

Each client places the bolt relative to its own player, so two players see it in different spots but with the same shape and timing.

## Other plugins

- `christmasevent` sets `gameOptions.plugins.weather.snow` for its seasonal snow.
- `legacyshellcore`'s Apocalypse mode sets `plugins: { weather: { rain: 0.8, storm: 0.8 }, time: "night" }` in its gametype options (`gametypes.js` merges `plugins` one level deep, so this doesn't wipe other plugins' defaults).

## Still to come

An optional automatic weather cycle (a random walk run from the server's `metaLoop`).
