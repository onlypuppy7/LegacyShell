# LegacyWeather

Weather and time of day: three independent weather layers (`rain`, `storm`, `snow`), wind, and a time-of-day preset, all synced per room and blended smoothly on the client. Commands: `/weather set|clear|get` and `/time set|get`. See the root [CLAUDE.md](/CLAUDE.md) / [AGENTS.md](/AGENTS.md) for the general "could this be a plugin?" philosophy this follows.

## State

Everything lives under `gameOptions.plugins.weather` and `gameOptions.plugins.time`, the same "arbitrary flags for plugins" bucket every room already syncs through `updateRoomParams`.

```js
gameOptions.plugins.weather = { rain, storm, snow, wind, transitionSecs }
gameOptions.plugins.time    = "day" | "dusk" | "night" | { preset, sun, fogColor, fogMult, sky, transitionSecs }
gameOptions.plugins.weatherCycle = { enabled, snow }   // automatic weather, see below
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
| | `streak` | 0-5 | length of each drop |
| | `sound` | 0-1 | rain loop volume |
| | `wetness` | 0-1 | how wet surfaces look |
| | `puddles` | 0-1 | puddles and ripples on flat surfaces |
| | `splashes` | 0-5 | splash particles where drops land |
| `storm` | `clouds` | 0-1 | cloud cover (dims the map's own sky) |
| | `skyTint` | 0-1 | grey-blue tint over the map's own sky |
| | `darkness` | 0-1 | how much sunlight is dimmed |
| | `fog` | 0-10 | extra fog thickness and greying |
| | `lightning` | 0-20 | how often lightning strikes |
| | `flash` | 0-5 | brightness of the lightning flash |
| | `thunder` | 0-1 | thunder volume |
| | `distance` | 0-255 | typical strike distance in blocks (thunder delay and loudness follow) |
| | `front` | 0-1 | how often a strike is placed in the half-circle in front of you rather than anywhere around you (1 is always) |
| `snow` | `flakes` | 0-1 | how many flakes are visible |
| | `size` | 0-10 | flake size |
| | `fall` | 0-10 | fall speed |
| `wind` | `strength` | 0-5 | slants rain, drifts snow |
| | `direction` | 0-360 | degrees (wraps round: 370 is 10) |

The table in `weatherState.js` (`WeatherState.layers`) is the single source of truth for defaults, ranges and validation; this page mirrors it. Limits are only where they're real: `thunder`, `sound` and the like are volumes (0-1, anything above is ignored by the audio engine), `drops`/`flakes` are the visible fraction of a fixed number of particles, and `distance` is a byte on the wire. Everything else goes as high as is meaningful.

Rain and storm are separate on purpose: a thunderstorm is `rain` + `storm`, a dry thunderstorm is `storm` alone, and rain without lightning is `rain` alone. Snow is only falling flakes - snow on blocks is the `christmasevent` plugin's job.

### Time presets

| Preset | What it is | `sun` (multiplied into sunlight) | `fogColor` | `sky` (skybox brightness) | `stars` | `glow` |
|---|---|---|---|---|---|---|
| `day` | full daylight | 1, 1, 1 | the map's own | 1 | 0 | 0 |
| `golden` | the warm light after sunrise / before sunset | 1, 0.82, 0.62 | 0.8, 0.66, 0.5 | 0.9 | 0 | 0.5 |
| `sunrise` | the sun on the horizon, morning | 1, 0.72, 0.5 | 0.8, 0.58, 0.45 | 0.75 | 0.1 | 1 |
| `sunset` | the sun on the horizon, evening | 1, 0.65, 0.45 | 0.45, 0.3, 0.3 | 0.6 | 0.2 | 1 |
| `dawn` | soft pink light before the sun is up | 0.75, 0.62, 0.7 | 0.5, 0.4, 0.5 | 0.5 | 0.35 | 0.9 |
| `dusk` | the purple afterglow after the sun is down | 0.8, 0.5, 0.55 | 0.4, 0.25, 0.35 | 0.4 | 0.3 | 0.9 |
| `twilight` | blue hour, before dawn and after dusk | 0.5, 0.52, 0.75 | 0.15, 0.17, 0.3 | 0.3 | 0.6 | 0.5 |
| `night` | | 0.3, 0.35, 0.55 | 0.03, 0.04, 0.09 | 0.12 | 1 | 0 |

`stars` is how many stars show, `glow` is how strongly the sky is coloured (from `glowColor` at the horizon up into `glowTop`). Sunrise is clean and light, peach over cool blue; sunset is deeper, hazier and more saturated, red-orange under magenta. Any of these (and `glowColor`, `fogMult`, ...) can be overridden in the object form, and `at=` places the sun in the sky (a number 0-1 or `midnight`/`dawn`/`sunrise`/`morning`/`noon`/`afternoon`/`sunset`/`dusk`/`night`).

### Automatic time

`/time set auto [minutes]` makes the day run by itself: sunrise, day, sunset, night, looping. `minutes` is how long a whole day lasts (default 20; `at=` picks where it starts). Each client runs its own clock between syncs, so it costs the network nothing, and joiners start at the right point. `/time set <preset>` turns it off.

The sky's look is chosen by **how high the sun is, in degrees**, not by where a moment sits on a clock, so how long each look lasts comes from the sun's real path:

| Sun | Look | Share of the day (equinox) |
|---|---|---|
| more than 18 degrees below | `night` | 40% |
| 18 to 6 below | `twilight` then `dawn` / `dusk` | about 5% each side, together |
| 6 below to the horizon | `dawn` / `dusk`, then `sunrise` / `sunset` | |
| 0 to 10 above | `golden` | about 2.8% each side |
| 10 to 30 above | golden fading into `day` | |
| above 30 | `day` | a third of the day |

Morning and evening have their own looks (dawn is not dusk). Two parts tune it:
- `daylight=-1..1` is the season: 0 is an equinox (12 hours of daylight), positive lifts the sun's path so days are longer and nights shorter, negative the opposite.
- `linger=N` stretches the sunrise/sunset/twilight looks (1 is their real length, which is short: about a minute of a 20-minute day; 2-3 makes them linger).

What's drawn in the sky is one sphere (`weatherSky` in `render.js`): stars that twinkle, a faint band of distant stars, and the colour of the sky at dawn, sunrise, sunset and dusk. That colour is a gradient from `glowColor` (low on the horizon) up into `glowTop` (high in the sky), all the way round, a little stronger and warmer on the sun's side so it never looks like a patch on one side. The map's own skybox is always kept underneath. There is deliberately no sun or moon disc (some maps draw their own sun).

## Commands

All are in-room slash commands; `set`/`clear` need moderator (or game owner in a private room), `get` is open to everyone. None are cheats.

```
/weather set rain 0.6
/weather set storm 0.5 thunder=0.1 distance=80 seconds=20
/weather set wind 0.4 90            # strength, then direction in degrees
/weather clear                      # everything: every layer and wind (same as `clear all`)
/weather clear all seconds=0        # ...and dry the ground instantly
/weather clear rain
/weather auto on            # weather that changes by itself (add `snow` to allow snow)
/weather auto off
/weather get
/time set night
/time set sunset sky=0.4 seconds=15
/time set auto 20 at=sunrise      # a day that runs by itself, 20 minutes long
/time set auto 30 daylight=0.4   # a long summer day
/time get
```

`seconds=N` is how long the change takes to blend (default 8, `0` is instant). Setting one layer never touches the others. Clearing rain (or everything) also dries the ground over that same time, so `seconds=0` leaves no puddles; when rain just ends by itself, or turns off in the automatic cycle, the ground dries slowly over about a minute (`dryingSecs` in the state).

In chat, autocomplete offers the choices for each command's first argument (`rain`/`storm`/`snow`/`wind`, `day`/`dusk`/`night`, `on`/`off`), and the info panel beside it lists every part each layer understands.

## How it renders (client)

`render.js` (`WeatherRender`) keeps a current and target value per channel, eases each toward its target (so a change mid-transition continues from where it is - no jumps), and a single `apply()` step combines every channel into the scene: sun colour, fog colour and density, and skybox brightness and tint. Nothing else writes those, which is what stops transitions fighting each other. The first sync after joining is applied instantly instead of fading in from nothing.

The map's own fog (`minMap.fog`) is the baseline; time of day and weather push it from there. The map's own skybox is never swapped.

### Lightning

A strike builds a bolt from its seed: a jagged path made by repeatedly splitting segments and nudging the midpoint sideways, plus two or three shorter branches. It's two additive ribbons (a thin bright core and a soft wide glow) that are re-billboarded toward the camera every frame while it's showing, with a constant angular width so far bolts stay thin. Bolts beyond the camera's draw distance are drawn nearer along the same line, and dimmer. Strikes are placed in the half-circle in front of each player (within 90 degrees of where they're facing, picked by the angle the server sends), so they're usually in view and sometimes off to one side, but never behind. `front` (default 1) is how often this happens; `front=0` puts every strike at a random angle all the way around the player.

The flash is a quick double pulse. Instead of whitening the whole scene, it's lit from the bolt's direction: the shared shader adds light to surfaces in proportion to how much they face the bolt (plus a small ambient lift), so walls toward the strike light up and the far sides stay dark. Cloud brightness around the bolt's direction rises with it. Thunder arrives after `distance / 120` seconds, quieter and lower-pitched the farther away it was. Thunder (and the rain loop) stop when the weather is cleared or muted - what's already sounding fades out over a moment - and when you leave the game for the main menu (core's `leaveGame` event).

### Players, hats and egg deaths

Eggs, hats, hands and guns all use the shared `standard` shader, so they get the time-of-day sunlight, fog, lightning flash and wetness automatically. The egg-death shell fragments and yolk are unlit sprites, so they would stay full-bright at night; `tintRecentSprites` multiplies each one by the current sunlight as it spawns (via the core `shellFragBurstAfter` and `yolkBurstAfter` events). Explosion and rocket-trail smoke and fire and bullet-impact puffs are tinted the same way (`explosionSpriteAfter`, `bulletHitSpriteAfter`), but because the game recolours those every tick from a colour table, each sprite is given a sunlight-tinted copy of the table instead. Not affected by design: bullet tracers and muzzle flashes (emissive, they glow in the dark) and the name tags and UI.

### Clouds

The map's own skybox is always kept. Over it, a cloud dome (a sphere that follows the camera) draws procedural clouds that drift with the wind (their position is accumulated frame by frame, so a change of wind only changes their speed, never makes them jump), thicken with `storm.clouds`, are tinted by time of day, and fade into the horizon. `storm.skyTint` separately washes the skybox grey-blue.

### Wet surfaces and puddles

Wetness is GLSL inserted into the game's shared map/player/item shader, not a material swap, so skins, tints and shadows are untouched. `weatherShader.js` is applied at build time through the `client:shaderSources` event (see [the build pipeline](/wiki/docs/05-Codebase%20Reference/build-pipeline.md)): core's `standardVertexShader.glsl` / `standardPixelShader.glsl` have named anchor comments (`//@vertexDeclarations`, `//@vertexEnd`, `//@pixelDeclarations`, `//@pixelPreFog`) and any plugin can insert at them. `WeatherRender.hookMaterials` adds the plugin's uniforms and height sampler to every material using that shader before it first compiles.

When wet, a surface gets darker, reflects the sky colour at glancing angles, and catches a tight highlight. Flat map ground additionally gets puddles - a noise mask whose coverage follows `rain.puddles` - with an expanding ring ripple per cell while it's wet. Puddles shrink away over the rain's transition time (`seconds`, so they're gone when the rain has finished fading), while the ground itself stays damp for the longer drying time. Everything is dried by the same roof height map as the rain: the map is sampled slightly out from the surface along its normal, so a floor under a roof is dry but the outside of a tall wall isn't.

The world wets in about 20 seconds of rain and, when the rain just ends, takes about 60 seconds to dry (its own slow state, separate from the 8-second weather blend). Clearing the weather by hand dries it over the clear's own time instead. Puddles are High quality only.

### Rain and snow

Both are one fixed mesh of pre-randomised quads (5000 for rain, 3000 for snow) animated entirely in the vertex shader - nothing is updated on the CPU per drop. Each drop's position comes from time plus its own random numbers, wrapped around the camera so the field is endless in every direction. The `rain.drops`/`snow.flakes` part just sets what fraction of the quads is visible, so fading in and out costs nothing. Wind slants the streaks (and tilts their direction), and snow also sways.

Roofs keep the rain off: on each map load a **height map** is built (the top of every x,z column, taken from the map's cell data so invisible barriers, ladders and decoration-only blocks don't count), uploaded as a tiny RGBA texture, and the fragment shader discards any drop below its column's top. `WeatherRender.heightAt(x, z)` reads the same table on the CPU - the rain loop gets quieter under a roof, and splashes are placed on it. (It's an RGBA texture on purpose: single-channel/luminance textures sample as zero on some GPUs.)

**Splashes** are a pool of 80 ring sprites spawned near the camera on whatever surface the rain actually lands on, High quality only.

**Quality** is its own setting (Graphics tab, "Rain & Snow": High / Low / Off), no longer tied to the shadows checkbox. Low shows 40% of the drops and no splashes; Off removes rain and snow entirely. When the auto-detail optimiser turns shadows off, High drops to Low for as long as shadows stay off.

## Automatic weather

`/weather auto on` makes the room's weather drift by itself: the server picks a stretch of clear, overcast, rain or thunderstorm weather (snow too if you ran `/weather auto on snow`), blends to it over 20-45 seconds, holds it for 1-5 minutes, then picks again. Only thunderstorms have lightning; overcast and rain spells are quiet. Clients just see ordinary weather changes - the timing lives server-side only, per room.

Setting or clearing weather by hand turns it off (and says so), so it never fights an admin. A gametype can start with it on by setting `plugins: { weatherCycle: { enabled: true } }` in its options. The picking logic is `WeatherState.cycleStep` in `weatherState.js`, kept pure with the random source injected so it can be tested.

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

## Tests

There's no test runner in this repo, so `test-state.js` is a plain script of assertions over the pure state logic (layer and time resolution, validation, command parsing, the automatic cycle). Run it with:

```
node plugins_default/legacyweather/test-state.js
```

It exits non-zero if anything fails. Rendering (`render.js`, the shaders) has no automated test; it was checked in a browser.
