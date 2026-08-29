# LegacyWeather

The day/night time-of-day system and the rain/storm/snowstorm weather effects, plus the
`/time day|night` and `/weather rain|storm|snowstorm` admin commands - moved out of core into
this plugin. Pure relocation for now: nothing about what any of this does has changed, only where
it lives. See the root [CLAUDE.md](/CLAUDE.md) / [AGENTS.md](/AGENTS.md) for the general "could
this be a plugin?" philosophy this follows.

## What moved here

- **Commands**: `day`, `night`, `rain`, `storm`, `snowstorm` (registered via `permissionsAfterSetup`,
  same identifiers/categories/permission levels as before).
- **gameOptions**: what used to be top-level `gameOptions.weather`/`gameOptions.time` now lives at
  `gameOptions.plugins.weather`/`gameOptions.plugins.time` - the same "arbitrary flags for plugins"
  bucket every room's `gameOptions` already carries and that `packUpdateRoomParams` already syncs,
  so no new sync-payload plumbing was needed for this, just relocating within it. Defaults are
  injected via `GameTypesInit` rather than hardcoded in `gametypes.js`'s `defaultOptions`.
- **Protocol**: the `doThunderStrike` opcode used to be a core-reserved `Comm.Code` entry; it's now
  registered via `Comm.Add("doThunderStrike")` from `permissionsAfterSetup`, same pattern
  `parkourmode` uses for `parkourScore`.
- **Sound**: `sound/ambiance/rain.mp3` (+ `.ogg`) and the `thunder1-4.mp3`/`.ogg` cue, previously
  loaded by core's `loadSounds`, now pushed/registered from this plugin's own `loadSounds` listener.
- **Assets**: `img/rain.png`, `img/flare.png` (snow particle texture), and the `thunderstorm`
  skybox texture set - physically moved into `client/`, re-served at the exact same URLs
  (`/img/rain.png`, `/img/flare.png`, `/img/skyboxes/thunderstorm/*`) via this plugin's own
  `client:onStartServer` static mount, so `setSkybox("thunderstorm")` and the particle texture
  paths needed no changes.
- **Client rendering**: `doThunderStrike()` (the lightning flash/fog/skybox interval sequence),
  `setParticleSystems()`, the rain/snow `BABYLON.ParticleSystem` setup (now created from this
  plugin's `onMapComplete` listener instead of inline in core's), and `wetMaterial` (now created
  from a new `loadMaterials` hook - core's `loadMaterials` didn't emit anything before this).
- **Server logic**: the 1-in-4-chance-every-~2s thunder strike broadcast, moved out of
  `rooms.js`'s `metaLoop` into this plugin's own `metaLoop` listener (that function already
  emitted unconditionally, so no core change was needed there).

## What's still shared (deliberately not moved)

`setFog()` and `setSkybox()` are generic map-rendering primitives used by ordinary (non-weather)
map loading too - this plugin just calls them, same as core did before.

## Known coupling worth cleaning up later

The per-tick camera-follow code that re-centers `rainParticleSystem.emitter`/
`snowParticleSystem.emitter` on the player's position each frame is still in core
(`shellshock.min.js`'s main render loop) and references these two plugin-owned globals by bare
name. It still works correctly (both remain real globals once this plugin's `shared.js` is
spliced into the bundle, same as any other plugin global), but it's a hidden coupling rather than
a proper hook - a good candidate for a future `weatherParticlesTick`-style event if this plugin's
functionality gets touched again.

## Dependency note

`christmasevent` (server-side, on `game:roomInitEnd`) sets
`gameOptions.plugins.weather.snowStormEnabled = true` to turn on seasonal snow - it relies on this
plugin's `GameTypesInit` listener having already populated `gameOptions.plugins.weather` by the
time any room is created, which holds regardless of plugin load order since `GameTypesInit` fires
once at module-load time, long before the first room exists.
