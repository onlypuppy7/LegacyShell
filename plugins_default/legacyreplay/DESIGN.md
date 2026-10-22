# legacyreplay - design draft

replays, camera angles, and auto highlight reels. goal is making cool promo clips without having to be good at the game or good at video editing.

status: built and working in a sandbox: recording, /replay clip + F8, local library (Settings -> Replay), playback (first person, chase, orbit, bullet cam, smoothed free camera with feels, roll and zoom), seeking, speed 0.1x-4x with interpolation and scaled animations and sound, kill markers, an auto highlight reel (indexer, scoring, who/length/style picker, shot presets with eased speed curves), a reel editor with save / load / export / import, looks (one shader pass for grading, vignette, grain, fringing and sharpening, plus babylon bloom and depth of field as separate settings, letterbox, flash), slow-motion muffle, music with ducking and synthesised reel sounds. styled with the game's own classes. server storage for signed in accounts (storage.js, quotas, pins, expiry, reels). signing (ed25519 through services, verified in the viewer), embedded items, hide names, whole game recording, rank limits, an admin tab, a pop out control bar, video export and live casting for moderators. not built yet: a frame by frame video renderer, sharing links.

---

## tldr

- **record on the game server, not the client.** each room worker keeps a rolling buffer of every broadcast packet (+ periodic keyframes). this gives a neutral "god view" of every player equally, bots included, which is what you need for "pick a player" / "everyone" highlight reels like mk8dx.
- **play back in the real client** by feeding recorded packets straight into `LegacyShellOnMessage` on a fake offline-ish session. the existing client sim (other players' extrapolation, bullets with `Math.seed`, explosions, kill effects) re-renders everything for free.
- **slow-mo is mostly free too** - `mainGameLoop` already has a "fps exceeds tickrate" lerp path. a virtual clock that ticks slower than real time just lands in that path more often.
- **cameras = drive the existing global `camera`** (unparent it, set position/target per frame) rather than swapping in new babylon cameras, because loads of stuff reads `camera` directly (fov, audio listener, `isMeshVisible`, scope).
- **the director knows the future.** since playback is from a file, highlight logic can look ahead: "a kill happens at t=41.2s, so at the fire packet before it, lock onto that bullet". this is what makes bullet-cam and slow-mo-before-the-kill actually possible.
- **no built in video export.** the plugin makes the shot look right in the game window, clean output mode strips all ui, and you record it with obs.
- **replays are signed by the server**, so anyone can check a `.lsreplay` is a real unedited recording.

---

## 1. recording (server, per room worker)

### where to hook - no core changes needed

everything a third party sees already goes through these, and they all already emit:

| event | `server-game/src/rooms.js` | notes |
|---|---|---|
| `game:sendToAll` | `sendToAll()` | syncs, fire, die, respawn, items, round stuff, etc. |
| `game:sendToOthers` | `sendToOthers()` | chat, pause, hitThem... |
| `game:sendToOne` | `sendToOne()` | per-player stuff (hitMe, reload ammo counts, collectItem, balance). a neutral viewer doesnt need these (`hitThem` covers hits), but **pov mode does** (section 3) - so record them too, tagged with the recipient id. skip balance/codes/etc, nothing visual |

`output.buffer.slice(0, output.idx)` + a timestamp is one recorded frame. the buffers can contain multiple commands back to back, so store the raw buffer and dont bother parsing at record time (parse later for indexing, see highlights).

each worker loads plugins independently, so a per-room recorder is just natural - the plugin instance in each worker only ever sees its own room. no main-thread involvement except for getting files out (below).

### keyframes

you cant start playback in the middle of a packet stream with nothing - clients would get syncs for player ids they never got an `addPlayer` for (the client literally discards them, see the `if (!player)` in `case Comm.Code.sync`).

so every ~5s (and at record start) write a keyframe:
- `room.packAllPlayers(output)` - already exists, its what a joining client gets
- current items (whatever `spawnItems` packs)
- `updateRoomParams` + `roundUpdate` (so gameOptions/weather/round timer are right)
- map idx, gameType, team stuff (whats normally in `gameJoined`)

seeking = find nearest keyframe before target, rebuild from it, fast forward packets without rendering.

### embedding the map + items

maps can be edited (theres a whole map editor) and items/skins/guns get changed or removed. if a replay only says "map 7, hat 1234", it plays on whatever map 7 / hat 1234 is *today* - wrong walls, missing hats, bullets going through blocks that didnt exist.

so the header carries what it needs to stand on its own:
- **the map** - the full map data as the room loaded it (what `roomBeforeMapBuild` / `minMap` sees) + a hash of it. measured on the current 36 maps: median ~3.8KB gzipped, biggest (Egg-Org's Castle) ~13.7KB gzipped. a 30s clip is a few hundred KB, so the map is a few % of a clip and nothing on a full match. if it ever matters, services can dedupe server side by `mapHash`
- **items in use** - the definitions (from the room's `items` seed) of every gun/hat/stamp/skin anyone had equipped during the recording, also collected from `changeCharacter`. not the whole catalog, just what appears
- playback builds the map from the embedded copy, never from `mapIdx`, and registers the embedded item definitions for the session (taking priority over the live catalog for those ids). if an item's model/texture file is gone from the server entirely, fall back to the default for that slot rather than failing
- the embedded map/items go through the same safety checks as everything else (sizes, types, ranges) - see below

### authenticity (signed replays)

so anyone can tell a real recording from an edited or made up one.

- services holds an **ed25519 signing key** (generated on first boot, `server-services/store/replay_signing.key`, never leaves services). the public key is handed out by the client server (`/replays/pubkey`) and baked into the client bundle as a fallback
- when a worker finishes a file (a `/clip` or a `/record`), it sends services the file's sha-256 + the header. services signs it and returns `{ keyId, signature, signedAt, serverName }`, which the worker appends as a final record (type 4). one round trip per file, and `/clip` waits for it before sending the file to the player
- the viewer checks the signature on load (webcrypto ed25519, or a tiny library like tweetnacl through `dependencies.js` where the browser cant) and shows a badge:
  - **verified** - recorded on *server name*, date
  - **unverified** - signature missing or doesnt match = edited or made somewhere else
  - **unknown server** - valid signature, but from a key this server doesnt know (another legacyshell instance). shows the key fingerprint
- because of this, **trims and edits never touch the file**. trimming, shot lists, reels, thumbnails all live in the sidecar `.json` next to it, so the replay itself stays signed forever
- key rotation: `keyId` in the signature, and the client server lists old public keys too, so old replays stay verified
- a valid signature is **not** a reason to skip any of the safety checks below. it says where a file came from, not that its harmless

### size

sync per player is roughly 60 bytes (header + 6 frames of controls/yaw/pitch), 10Hz. 18 players ~ 11KB/s ~ 40MB/hr raw, gzip should take a good chunk off. so:
- **rolling buffer** of the last 2-3 min per room in memory: ~1-2MB, cheap, always on
- **full match recording** opt-in via room param / command, streamed to disk in the worker

### file format (`.lsreplay`)

```
header (json, length prefixed):
  { v, versionEnum, versionHash, mapIdx, mapName, mapHash, map: {...}, items: [...], gameType, startTime, players: [...names/loadouts], plugins: [identifiers] }
chunks:
  [u8 type][u32 tMs][u32 len][bytes]
  type 0 = packet(s), 1 = keyframe, 2 = marker (manual /clip marks, round start, etc.), 3 = packet(s) for one player only ([u8 toId] first), 4 = signature (always last)
```

gzip the whole thing (`zlib` on node, `CompressionStream('gzip')` in the browser, both built in).

**why not just compressed json:** the packets are already binary (`Comm.Out`), so the "custom format" is really just a thin wrapper around them: json header + `[type][time][length][bytes]` records. json for the packets themselves would mean either:
- base64 the buffers inside json - +33% size and gzip compresses base64 noticeably worse than raw bytes, for no gain
- or parse every packet into objects - a json schema for every opcode (including plugin `Comm.Add` ones) to keep in sync forever, several times bigger, and serialising syncs at 10Hz per player inside the 60Hz room worker. the binary way is a buffer copy

so: json where its human stuff (header, and shot lists / reel edits as their own `.json` that point at a replay), binary where its packets. if full match files get big enough that seeking hurts, switch to gzipping each keyframe block separately (each block starts with a keyframe anyway) - bump `v` and keep reading the old one.

`versionEnum` + `plugins` are in the header because a replay is only valid against the same `Comm.Code` table - plugins `Comm.Add()` their own opcodes, so a replay recorded with legacyweather on wont parse right on a client without it. warn on mismatch rather than refusing.

### reading files safely

`.lsreplay` files get passed around on discord etc, so a replay file is untrusted input. playing one is basically letting a stranger act as the game server for your client, and the client trusts the server completely. so:

- **magic bytes + version first** (`LSRP` + `v`), reject anything else before touching gzip
- **gzip bomb:** decompress as a stream with a hard cap on output bytes (256MB). stop and reject the moment it goes over
- **header:** length capped (4MB, the map is in there), `JSON.parse` in a try, then check every field's type/range. unknown fields ignored. the header never picks code paths beyond "which map / which version"
- **records:** type must be a known one, length capped (256KB, a keyframe with 18 players is a few KB), length cant run past the end of the file, timestamps must never go backwards. any failure = stop, show "replay is damaged" with how far it got
- **packets:** `Comm.In` doesnt bounds check - reading past the end just gives garbage numbers, it doesnt throw. in replay mode each record is dispatched in a try/catch and checked afterwards that the reader didnt go past the record's end. counts must make sense too (player ids within `maxServerSlots`, map idx exists, etc)
- **html injection - the big one:** chat (`addChat`) and the killfeed (`addKillText`) build their html with `innerHTML`. live, names and chat have gone through the server first. a crafted replay skips the server entirely, so a name like `<img onerror=...>` would run on the viewers page. replay mode pre-parses `addPlayer`, `chat`, `changeCharacter` etc with its own reader and **escapes or rejects every string before dispatch**. same goes for names/titles in the header and in the library ui (always `textContent`)
- **opcodes from plugins the viewer doesnt have:** cant be skipped (lengths arent self describing), so refuse to play past them and say which plugin is missing (header `plugins` list)
- **server side:** services never really parses uploads - it checks magic, total size, quota, decompressed size cap, and the header. files are served as `application/octet-stream` + `Content-Disposition: attachment`, never inline
- **fuzzed** - see testing in section 9

### sync records and record sources

- the room's own sync goes out through `sendToAll` and is recorded as it does, free, as a `sync` record. theyre most of the data, so they get their own type (cheap for the seeker to skip, cheap for the indexer to read positions from)
- **record sources:** when a recorder is made (`game:roomInitEnd`) replay emits `replayRecorderCreated` `{ this: room, recorder }`. a plugin can `recorder.claim(type, pack)`: `pack(room)` then runs every sync cycle and returns the bytes for that record type (or nothing), and the default recording of that type is skipped. the layout of a sync record is the standard core one. the recorder is made at room init, not lazily, so a claim never happens in the middle of anything else. a source should pack directly, not through `client.packSync`: that awaits plugin emits (~5ms a cycle at 18 players) and `plugins.cancel` is one shared flag, so emitting alongside the room's sync could flip a cancel something else just set. keyframes save and restore the flag around their pack calls for the same reason
- **playback:** every record goes through a client event, `replayRecord` (`{ type, data, header }`), before it reaches the message handler, and plugins can replace `data`. the anonymise toggle (names -> Player 1...) is built on it

### rooms and /warp

a recording is one room. a player who `/warp`s out just leaves it (normal `removePlayer`), and their next bit of gameplay is in the new room's buffer. no stitching rooms together, at least for now.

### getting replays out

see section 8 for who can do what and where files end up. the transport is the same either way: the worker chunks the file over a custom opcode (`Comm.Add("replayChunk")`) to the client, and/or over `#wsrequest` to services.

### commands (registered via `game:permissionsAfterSetup`)

- `/replay clip [s]` - grab last N seconds (default 30). commands are always `/category name`, so every command in this plugin lives under `/replay`
- `/replay mark` - drop a marker into the recording ("that was sick, look here later")
- `/replay record start|stop` - full match recording
- `/replay enable on|off` - room owner toggle, whether the room can be recorded at all

ranks for each one are in section 8.

---

## 2. playback (client)

### replay mode

basically a third session type next to online and `playOffline`:

1. load the replay, read header, build the map from the **embedded** map data (not by `mapIdx`), register the embedded items
2. replace `ws` with a stub (`readyState` not OPEN, `send` noop) so `serverSync()` and pings never fire
3. apply first keyframe, then feed chunks into `LegacyShellOnMessage({ data: buffer })` as the virtual clock passes their timestamps. its a global const so no hook needed to call it.
4. set `meId` to something that isnt in the recording, so nothing thinks its "me" getting hit

**`me`:** lots of `mainGameLoop` assumes `me`/`viewingPlayer` exist (`viewingPlayer.hp` for the health bar, `me.stateBuffer`, etc). decided: no core null checks. use a hidden dummy `me` that never plays (like `playOffline`'s addPlayer, but `playing: false`, invisible). the client already copes fine with a `me` that isnt playing while everyone else is - thats every deadinternet bot game where the human is dead or spectating - so this is a well trodden path

hud: hide everything by default (clean shots), toggle killfeed/names/scoreboard back on per shot.

### virtual clock + slow-mo

`mainGameLoop` reads `performance.now()` directly for tick timing (`lastTimeStamp`/`TickStep`), and the round clock uses `Date.now()`. replay needs one clock that can pause, slow down, speed up and jump.

- ~~option a: wrap `performance.now` / `Date.now` in replay mode~~ - hacky, not doing it
- **option b (decided, core hook):** tiny `getGameTime()` indirection in `mainGameLoop` + a plugin event to override it. other plugins (timemachine?) might want it too. see section 10

either way, at 0.25x the loop runs a real tick every 4 frames and lerps between, which the existing `lerpTick` path already does. other things that also need scaling:
- `player.actor.update(delta)` animations - already delta based, fine
- babylon particles (explosions, yolk, shell frags) - `particleSystem.updateSpeed` / sprite manager anim speed
- sounds - see audio in section 6
- `interval`/`timeout` helpers used for killbox animations etc - hidden in replay mode anyway

scrub backwards = seek (nearest keyframe, fast-forward).

**slow-mo data:** decided to try with what the syncs already give first (per-frame inputs, 10Hz positions, client re-simulates in between). only if 0.05x looks bad in the phase 1 spike does the recorder start keeping extra per-tick positions, and then probably only around kills.

### determinism (what has to match, what doesnt)

previewing a shot and playing it again for the obs take should show the same **gameplay and camera** - same positions, same bullets, same camera path, same timing. cosmetic randomness (smoke sprite sizes, egg burst bits, particle angles - the ~44 `Math.random` calls in the client) is allowed to differ between runs, nobody can tell. so no seeded random.

what does have to match:
1. **time** - handled by the game clock hook
2. **gameplay** - comes from the packets, so its the same every run. bullet spread already uses its own seeded random (`Math.seed` / `Math.seededRandom` in `math.js`, set from the fire packet's seed)
3. **frame-dependent code** - anything that does `x += (y - x) / n` per frame instead of per tick/time would move differently at different framerates. camera code avoids this (smoothness section). game code that does it gets found by the determinism test (section 9) and fixed or worked around one at a time

**pre-roll:** effects already in the air before a seek point (smoke, particles) dont exist after a seek. so playing a shot starts ~2s before its start time and runs those 2s hidden (screen held on the first frame), so the shot opens with whatever smoke should be there.

---

## 3. cameras

all of these drive the one global `camera`: `camera.parent = null`, set `position` + `setTarget`/`lockedTarget` each frame in a `registerBeforeRender`, smoothed. restoring is just `doFirstPersonCamera(player)` / `doMapOverviewCamera()`.

beamng-ish set:

| camera | what | notes |
|---|---|---|
| **first person** | plain eye view, no hud | `doFirstPersonCamera(player)`, swap hands/gun render groups like `enterSpectatorMode` does |
| **pov** | "as if youre them" - their full game screen | see pov mode below |
| **chase** | behind + above, lags on turns | beamng chase. spring toward `player.x/y/z` minus yaw dir |
| **shoulder** | tight over-the-shoulder, follows aim | good for sniper shots |
| **head down / barrel** | low on the gun looking forward, or at the egg's feet looking up | the "look it up" angle. sells jumps |
| **orbit** | circles a target at radius r, speed w | the slow mo pan-around-a-player shot |
| **tripod / tv** | fixed point, just tracks the target | auto-place: pick spots from map geometry with line of sight (raycast, the collider already exists). beamng "external" cam |
| **flyby** | camera parked ahead of a player's path, they run past it | predict from the replay (we know where they go) |
| **bullet** | rides behind a bullet | uses its own ghost bullet, not the pooled actor. see "bullet cam" in section 4 |
| **grenade** | follows grenade arc, pulls back for the boom | `throwGrenade` + `explosionEffect` |
| **killer cam** | from victim's eye looking at killer | the existing death cam already does this (`camera.lockedTarget = byPlayer.actor.bodyMesh`) |
| **top down / tactical** | high, straight down or isometric | team fights, map showcase |
| **free** | noclip wasd + mouse, own smoothing options | see freecam below. also used to place tripod/path keyframes |

every camera takes a **target** (player id, bullet, world point) and **params** (fov, distance, height, offsets, smoothing). fov changes per shot matter a lot for feel (wide on orbit, tight on tripod).

### smoothness (rule: everything moves smooth)

every camera movement is lerped, sprung or curved. the only things allowed to snap are **static shots** (tripod that doesnt move) and **deliberate cuts** between shots. no camera ever gets its pose set straight from a raw target each frame.

- **follow cams (chase, shoulder, orbit target, tripod tracking):** critically damped springs ("smooth damp") on position, look target and fov. framerate independent - `1 - exp(-k * dt)` style, not the `x += (target - x) / 5` per frame thing the customizer does, because that runs faster at 144fps than at 60, so the same shot would move differently on different machines
- **cheat with the future:** the replay knows where everyone will be. so instead of only smoothing after the fact (which always lags), smooth the *target's path* with a window over past and future (gaussian / moving average over ~0.2-0.5s). the camera then leads moves instead of trailing them. this is the big one for chase cam looking good
- **authored paths (flyby, freecam keyframes, map flyover, shot presets):** position on a centripetal catmull-rom spline through the keyframes (passes through every point, no overshoot loops), or cubic bezier with auto tangents when the user wants to drag handles. rotation with quaternion slerp/squad, never euler lerp (gimbal flips). fov eased separately
- **time speed is curved too:** speed ramps (1x -> 0.05x -> 1x) are bezier/eased curves, never steps. same for zoom punch-ins and roll
- **between shots:** each boundary is either a **cut** (instant, on purpose) or a **blend** (old pose -> new pose over 0.3-1s, ease in/out, slerp rotation). director picks, user can change it on the shot track
- **two clocks:** the camera runs on real (output) time, the game runs on replay time. thats what lets the camera keep orbiting while game time is frozen (impact freeze), and keeps smoothing the same no matter the playback speed
- **same every take:** springs/filters step on a fixed substep (eg 240Hz), so a shot moves exactly the same in preview and in the obs take, at any framerate
- static shots: no smoothing at all, thats the point of them

### freecam

noclip, wasd + space/ctrl for up/down, mouse look, scroll for speed, shift for fast. its own block of smoothing options in the replay settings tab (legacysettings sliders):

- **movement smoothing** - acceleration/decel (drone feel at high, instant at 0)
- **look smoothing** - mouse lag on yaw/pitch (cinematic heavy at high, raw at 0)
- **fov smoothing** - scroll+modifier zooms smoothly
- **speed** + **speed smoothing**
- **roll** - lock horizon / allow manual roll (q/e) / auto bank when turning (drone style)
- **collision** - noclip or bump into the map
- **orbit lock** - hold a key to orbit around whatever youre looking at, keeps distance
- presets: raw, smooth, cinematic, drone

two ways to make shots with it:
1. **drop keyframes** (key or button) -> the path between them becomes a catmull-rom spline, like above
2. **record a move live** - fly it by hand while the replay plays, it records your pose per frame, then runs it through the same smoothing filter so hand wobble goes away. "smoothing amount" slider after recording

### pov mode - spectate as if youre them

not just the eye camera - their whole screen, like a recording from their client:

- their exact view: recorded per-frame yaw/pitch from the sync packets (6 frames per sync, so its 60Hz, not 10Hz). optional light smoothing slider since raw mouse input can look twitchy on video
- their gun viewmodel with recoil/sway (the actor does this already for whoever the camera is on, via the render group swap in `enterSpectatorMode`)
- hp bar, ammo, grenade icons, reticle, streak, "you killed x" box, hit direction indicator, death cam when they die, respawn
- the hud is all tied to `me` today (`updateAmmoUi()` reads `me.weapon.ammo`, `hitMe` drives `hitIndicator.hit`). so pov mode keeps the dummy `me` and drives those same elements itself from the pov player's state:
  - **hp** from `hitThem`/`hitMe`
  - **ammo** from the recorded `reload` packets sent to them (actual rounds/store) + counting their `fire`s in between
  - **hit indicator** from their recorded `hitMe` (dx/dz) -> `hitIndicator.hit(dx, dz)`
  - this is why the recorder also keeps per-recipient packets now (section 1)
- **scope isnt networked** - aiming down sights is client only (`SHIFT: "scope"`), nobody else ever sees it. so it gets inferred: scoped weapon + about to fire + mostly still = ease into scope ~0.3s before the shot, out after. lookahead makes this easy. its a guess, so its a toggle (infer / always hip / always scoped)

---

## 4. shots + presets

a **shot** is the unit everything is built from:

```js
{
    start, end,             // replay ms
    camera: "orbit",
    target: { player: 5 },  // or { bullet: "auto" }, { point: [x,y,z] }
    params: { radius: 2.5, height: 0.6, degPerSec: 40, fov: 1.1 },
    speed: [[0, 1], [0.4, 0.2], [0.8, 0.2], [1, 1]], // speed curve over the shot (normalised time, rate)
    hud: false,
}
```

presets are just shot templates anchored to an event:

- **matrix** - orbit the shooter at 0.15x for the second before the shot, ramp back to 1x on the kill
- **bullet follow** - chase cam on shooter until fire, hop onto the bullet at 0.05x, hold on the victim exploding, ease out
- **headshot replay** - tripod looking at the victim, then repeat from killer's first person
- **multikill** - chase cam at 1x across the whole streak, slow mo dips on each kill
- **grenade multi** - grenade cam + pull back to top down for the explosion
- **clutch** - low hp (we can track hp from hit packets) + kill: tight shoulder cam, heavy slow mo
- **map flyover** - no players, flyby path over the map. for map showcase promo

### bullet cam, in more detail

**what bullets actually are:** real projectiles, not hitscan. `Bullet.prototype.update` just adds `dx/dy/dz * delta` each tick - straight line, constant speed, no gravity. speed is `weaponClass.velocity * 1.5` per tick (times `bulletSpeedModifier`):

| gun | per tick | per second | 30 blocks takes |
|---|---|---|---|
| eggk47 | 0.75 | 45 | ~0.67s |
| dozen gauge (pellets) | 0.675 | 40 | ~0.75s |
| csg1 | 0.9 | 54 | ~0.55s |
| cluck9mm | 0.675 | 40 | ~0.75s |
| rpegg (rocket) | 0.3 | 18 | ~1.7s |

so at 1x a bullet cam is over in about half a second. it needs ~0.03-0.1x to read.

**the stutter problem and the fix:** the bullet only moves on ticks, and `BulletActor.update` snaps the mesh to that position. at 0.05x thats one tick every ~20 frames, so the bullet would visibly jump 0.75 blocks at a time. but since its a straight line, its exact position at any time is just `origin + dir * speed * t`. so the bullet cam ignores the pooled `BulletActor` and moves **its own ghost bullet mesh** using that formula. perfectly smooth at any speed, no core changes, and it doesnt care about pool recycling or `delayFrames`.

**which bullet killed them (lookahead):** the indexer knows `die(victim, killer)` at time T. walk back through the killer's `fire` packets. each one has origin + dir + seed, so spread is reproducible by rerunning `fireMunitions` with the same `Math.seed`. the fatal bullet is the one whose ray passes the victim's (synced) position at the right travel time. shotguns: pick the pellet nearest the centre of the victim, or follow the middle of the spread.

**replay hits can visually miss:** the server decides hits using `player.predicted` positions. the replay's positions are re-simulated from syncs, so they can be a little off, and a "kill" bullet might pass just beside the victim on screen. cinema fix: over the last few blocks, **ease the ghost bullet onto the victim's rendered hitbox centre**. nobody will notice a 0.1 block bend, everyone notices a miss.

**shot ideas:**
- **classic chase (sniper elite):** behind and a bit above the bullet, slow roll around its axis. 1x at the trigger pull, dips to ~0.05x as it leaves the barrel, stays slow through the flight, ~0.02x on impact, egg burst, then back to 1x
- **side dolly:** camera moves parallel to the path at a fixed offset, bullet streaks across the frame. reads distance really well
- **incoming / victim pov:** from the victim's head looking at the shooter, bullet flies at the lens, cut on impact. kind of the existing death cam (`camera.lockedTarget = byPlayer...`) but before death
- **whip pan:** tripod near the middle of the path, bullet whips past and the camera spins to follow it to the target
- **impact freeze:** freeze at impact (time 0, particles paused), orbit ~180 degrees around the frozen yolk/shell burst, then resume
- **tracer replay:** draw the whole path as a line from muzzle to impact while the camera follows. for multikills, one tracer per kill, all kept on screen at the end
- **shotgun fan:** behind the spread, watching the pellets fan out, ideally a few hitting at once
- **rocket nose cam:** rpegg is slow enough to ride at ~0.3-0.5x. camera on the nose looking forward, then pull back hard for the explosion
- **near miss:** not a kill, but the bullet passed within ~0.3 blocks of someones head. also worth indexing as a moment ("that was close")
- **posthumous kill:** the killer was already dead when the bullet landed (`die(killer)` comes before `die(victim)`). top tier moment, bullet cam it every time

**speed by distance, not time:** drive the slow-mo curve from how far the bullet has gone along its path (0 at muzzle, 1 at impact) instead of wall clock time. then a 5 block shot and a 60 block shot get the same pacing and the same impact moment.

**when not to:** under ~6-8 blocks theres nothing to follow, use orbit/impact freeze instead. also skip it if the path is mostly behind walls from every angle that would work.

**camera details:**
- if the camera offset goes inside a wall, raycast from the bullet to the camera and pull it in (collider already does map raycasts)
- narrow fov near impact for a punch-in. babylon has a motion blur post-process that might be worth it here only
- the ghost bullet probably wants a longer, brighter tracer mesh than the in-game one, it fills more of the screen
- sound: muffle/pitch down the world, add a whoosh on the bullet and a thud at impact. Apollo can pitch the existing sounds

### post effects

the cheap way to make everything look a lot more expensive. nothing in the repo uses babylon's post processing yet, so this is new ground (check it plays nice with fancygraphics/shadows).

babylon `DefaultRenderingPipeline` gives most of it in one go:
- **depth of field** - the big one. focus distance follows the shot's target (eased like everything else), so orbit and bullet shots get that blurred-background look. at 0.05x with dof the game looks like a different game
- **bloom** - muzzle flashes, explosions, emissive stuff
- **chromatic aberration** - small amounts, spiked on impacts
- **grain**, **vignette**, **sharpen**
- **color grading** - lut presets (warm, cold, desaturated, "trailer teal/orange")
- **motion blur** - babylon's `MotionBlurPostProcess`, mostly for fast whip pans and the rocket cam

plus a few custom ones that are easy as a post process or a ui layer:
- **letterbox bars** (2.39:1 look inside a 16:9 frame)
- **impact flash** (one or two frames of white/tint)
- **speed lines / radial blur** for bullet cam
- **desaturate everything except the target** for a "focus" moment

rules:
- every effect setting is part of the **shot**, and is keyframed/eased like camera params. nothing pops on/off unless the shot cuts
- presets: clean, cinematic, hype, retro (grain + lut + low saturation)
- only exists in replay mode. theres a preview quality (no dof / half res) for editing on weaker machines, and full quality for the obs take - since obs records in real time, a dropped frame ends up in the video, so the take wants the best fps the machine can do

---

## 5. highlight reel (auto director)

### step 1: index the recording

one pass over the whole file, parse packets (we have `Comm.In` and all the formats) and pull out events with timestamps:

- `die` (killer, victim) -> kills, streaks, multikills (n kills within x seconds)
- `fire` (shooter, pos, dir) -> link to the kill it caused: next `die` by that shooter within bullet travel time, victim near the ray
- `hitThem` -> damage + rough hp tracking
- `throwGrenade` / `explosionEffect` -> grenade kills, multi-victim explosions
- `sync` -> positions, so: distance of kill, airborne, falling, speed
- `chat`, round start/end, `/mark` markers

### step 2: score moments

each kill/event becomes a moment with a "coolness" score. starting point, all tunable:

```
base kill             10
multikill             +15 per extra kill within 4s
long distance         +distance bonus (sniper across the map)
airborne killer       +8     (jumping kills)
killer low hp         +10    (clutch)
grenade multi         +20
streak milestone      +5 * streak/5
revenge               +6     (kill the guy who just killed you)
victim was on streak  +victim.streak
/mark                 +25    (human said so)
same victim/killer as recent moment  -penalty (variety)
```

clump moments within a few seconds into one clip window (lead-in ~2s, tail ~1.5s).

### step 3: filter + pick (the mk8dx bit)

user picks:
- **who:** everyone / me / specific player(s) / a team
- **length:** 30s / 60s / 90s / custom
- **style:** chill (mostly 1x, few presets) vs hype (lots of slow mo, bullet cams)

greedy: sort moments by score (filtered to involving the chosen players), take until length budget runs out, then re-sort by time. mk8dx also always keeps the ending, so maybe always end on the last kill / round end.

### step 4: assign shots

for each moment pick a preset that fits (grenade multi -> grenade preset, long range -> bullet follow, etc), with randomness and a "dont use the same preset twice in a row" rule. cut between moments with a quick flash/fade.

the output is just a **shot list** (json). that means:
- the reel is editable - user can tweak/replace/reorder shots in a simple timeline ui before recording it
- shot lists can be saved/shared alongside the replay

---

## 6. audio + recording it

### audio

audio is half of how a clip feels, so its a proper system, not a footnote.

**what already works:** `mainGameLoop` calls `updateListener(camera.globalPosition, ...)` every frame, which sets howler's listener (`Apollo.js`, `Howler.pos` / `Howler.orientation`) from the global `camera`. since every replay camera drives that same camera, positional game sound is heard from wherever the camera is, for free.

**layers:**
1. **game sfx** - the replayed game's own sounds (shots, bursts, footsteps), positional from the camera
2. **cinematic sfx** - added by shots/presets: bullet whoosh, heartbeat, low impact thud, wind for flybys, rewind sound for seeks in the edit
3. **music** - a track picked in the editor (local file, or a few bundled royalty free ones), with beat markers the director can line cuts up to

**slow-mo sound:**
- game sfx pitched/slowed by the playback speed (Apollo's `rate`, used by `playSoundIndependent`), with a floor (below ~0.25x real pitching sounds like mud, so past that it fades into a low muffled version instead)
- a lowpass filter on the game sfx bus that closes as speed drops ("underwater" bullet time), opens on the way back. eased, like everything
- music is never slowed. it **ducks** (volume dips) under big moments like impacts, and comes back up

**mixing:** route howler's master output (`Howler.masterGain` on `Howler.ctx`) through our own webaudio graph: game bus (lowpass + gain) + cinematic bus + music bus -> master -> speakers. per-shot volume per bus, eased. obs captures it like any browser audio (or the tab/window audio source).

### recording it (obs, no built in export)

decided: the plugin doesnt encode video itself. it makes the game window look exactly like the shot, and you record that with obs (or anything else). what the plugin does to make that easy:

- **clean output mode** (section 8) - only the canvas, letterboxed to the chosen aspect (16:9 / 9:16 for shorts / 1:1), no ui, no cursor. the pop out control panel stays in its own window, so it never ends up in the recording
- **render resolution** - the canvas can render at a fixed size (eg 1920x1080, or 2x for supersampling via babylon's hardware scaling) instead of whatever the window is, so the take isnt limited by window size
- **take mode** - plays the shot list / reel start to finish: pre-roll hidden, a short countdown (only on the control panel, never on the canvas), then the whole thing, then holds the last frame. so you hit record in obs, hit take, and trim the ends later
- **full quality for takes** - all post effects on, preview quality off. obs records in real time, so a dropped frame is in the video. the panel shows a frame time graph during the take and flags drops, so you know to redo it
- **framing overlays** for 9:16 (safe zones, centre lines), shown in the panel or as a toggle, never in the clean output
- optional **watermark / outro card** (logo + url) drawn on the canvas as part of the reel
- **maybe later:** obs has a built in websocket api (obs-websocket), so take mode could start/stop obs recording by itself. needs the user to give it their obs address + password, so its opt in and later

note: since the video is made outside the plugin, it cant be verified. the *replay* can be (section 1, signatures), so if a clip's authenticity matters, share the `.lsreplay` alongside it

---

## 7. live caster mode

everything in sections 3-6 (cameras, smoothing, pov, post effects, audio) works on a **live** game too, not just a file. thats tournaments, streams, showmatches - maybe better promo than clips.

**the trick: caster mode is just replay mode on a file thats still growing.** the caster's client buffers what it receives from the server, and plays it back through the normal replay engine a few seconds behind live:

- the caster is in the room as a non-playing client, so they receive packets like any other client
- replay mode takes over `ws.onmessage` on the caster's client: every incoming raw message goes into a buffer with its arrival time instead of straight into `LegacyShellOnMessage`. the replay engine feeds them in after the delay. no extra server traffic, no relay
- a **delay** (default 3-5s, slider) is what gives the auto director its lookahead live. it sees a kill coming 4s before the viewers do, so it can be on the right player in slow mo when it happens. delay 0 works too, just without lookahead
- slow mo live: the director can slow down (eating into the delay buffer), then runs at ~1.2-1.5x for a bit to catch back up. like an instant replay on tv
- **instant replay:** a button/bind replays the last big moment (bullet cam etc) then cuts back to live
- pov mode works live but slightly worse: no `hitMe` for other players, so hit direction comes from `hitThem`'s dx/dz instead. close enough
- clean output mode (section 8) + obs = a stream setup

**what it needs from the server:** a client in a room that **isnt a player** - doesnt take a slot, doesnt show in the player list/scoreboard, cant spawn, but still gets the broadcasts. today the only way to be in a room is as a player. so this is a **core hook** (section 10), asked for first. until then: caster joins as a normal player and just never spawns (visible in the player list, takes a slot, but works for testing)

permission: Moderator+ in public rooms, game owner (or whoever they allow) in private. caster presence shows as a small "being casted" note for players, same as the `/record` dot.

---

## 8. access, storage, admin, ui

### who can make replays

two separate questions: can this **room** be recorded, and can this **player** trigger it.

room level:
- public rooms: server config decides (`replay.public_rooms: clip | off`). default `clip` (rolling buffer on, **logged in** players can `/clip`)
- private rooms: game owner decides with `/replays on|off`, default on. pushed to clients via `updateRoomParams` so the ui can grey out the clip button and show a small "this room is being recorded" dot while a full `/record` is running. people should know

player level, using the normal `permissionLevel: [bypassRank, privateRoomRank, requireGameOwnerInPrivate]` triple so its all configurable the usual way:

| action | public room | private room | notes |
|---|---|---|---|
| `/clip` (local) | logged in | anyone | rate limited (eg 1 per 20s), max 60s. its just the last minute you already saw, low risk |
| `/clip` + save to account | logged in | logged in | uses account quota |
| `/mark` | anyone | anyone | |
| `/record` full match | Moderator+ | game owner | |
| `/replays on/off` | n/a | game owner | |

guests can only clip in private rooms, and only keep clips locally. server storage needs an account so theres something to put a quota on.

**what a clip shows:** everything, every player, right up to the moment it was made. decided: that is not a concern, so there is no hold-back and no per-player filtering of recordings.

**opting out:** individual players cant refuse to be recorded - its room rules only (server config for public rooms, the owner's `/replays` toggle for private ones). the recording dot makes it visible, and the anonymise toggle (below) covers the promo side.

**anonymise:** a toggle in the viewer / caster mode that shows every name as "Player 1", "Player 2"... (killfeed, name tags, scoreboard, chat names, pov hud). done at playback time by rewriting names as packets are dispatched, so the file itself isnt changed and stays signed. its for what ends up on screen (and so in the obs take). it doesnt anonymise a shared file - anyone with the file can turn it off

### local vs server storage

doing both, they do different jobs:

**local (browser)**
- every clip lands here first, straight away, no round trip to services
- stored in IndexedDB (clips are 1-3MB, way past localStorage), plus "download .lsreplay" / "open .lsreplay" for moving files around and for discord etc
- no quota apart from the browser's. guests work. nothing for the server to pay for
- gone if they clear site data, so the ui should say "local only" on these

**server (account)**
- "save to account" on a local clip, or `/record` output from a full match
- **where:** services, not the game servers. there can be lots of game instances and services is already the single source of truth. files on services disk (`server-services/store/replays/<id>.lsreplay`) and metadata in a new `replays` table. dont put the blobs in sqlite
- getting there: worker or client -> services in chunks over `#wsrequest`. plugin side commands via `services:unhandledCommand`, the way legacyadmin's `services/` stuff already works, so no new port and no core change
- getting files back out: services is ws only and rate limited, so pushing MBs through it to every viewer isnt great. better: the **client server** gets an http route (`/replays/:id`, via `client:onStartServer`) that checks the session with services, fetches the file once, caches it on disk and serves it like a static file. mirrors already scale out like that
- per-account quota: **20 replays / 50MB** (config)
- **expiry: 30 days**, unless the owner **pins** it (keep forever). pinned replays still count toward the 20 / 50MB, so pinning cant be used to dodge the quota. the library shows "expires in 6 days" on unpinned ones. pruning runs like `backups.js` / legacyadmin's backups

`replays` table, roughly:
```
id, owner_account_id, created, duration_ms, size, map_id, game_type, room_code,
kind (clip|match), visibility (private|unlisted|public), title, players_json,
version_enum, plugins_json, sha256, key_id, pinned, expires
```

visibility:
- **private** - owner + admins
- **unlisted** - anyone with the link/id
- **public** - shows up in a gallery (later, and probably mod approved, see admin)

### admins

all of this as a new **replays tab in legacyadmin**, shipped from inside this plugin (`replays-tab.js`).

legacyadmin already has `registerTab({ id, label, render, moderatorOnly, adminOnly })` in `client/app.js`, but the tab modules are a hardcoded list of `import('./x-tab.js')`. so legacyadmin needs a small addition for plugin tabs:
- a `client:legacyadminTabs` event (or similar) where plugins push `{ url, filepath }`. legacyadmin serves those files under `/admin/plugins/...` and hands the urls to `app.js`, which `import()`s them after its own tabs
- plugin tab modules import `registerTab`/`AdminApp` from `/admin/app.js` like the built in tabs do
- services side, the replay plugin handles its own `adminReplay*` commands on `services:unhandledCommand` and gates them with legacyadmin's `requireModeratorOrAbove` / `checkAdminOrSql` from `services/auth.js` (declare `legacyadmin: "plugin"` in `dependencies.js`, or soft-import it and skip the admin side if its disabled)

tab contents:

- list every server replay: filter by account, map, room, date, kind, size. sort by size for cleanup
- watch any of them in the normal viewer (admin session lets you open private ones)
- delete, pin (no expiry), change visibility, approve for the public gallery
- quota/retention overview, total disk use
- signing key info: current key id + fingerprint, old keys, rotate button (full access tier only)
- (no moderation auto-recording - dropped)
- everything goes through legacyadmin's audit log (`recordAudit`)

### client ui

**in game**
- clip key (default F8, rebindable in settings) + "clip last 30s" in the pause menu. small toast: "clip saved (30s) - view / save to account"
- `/clip`, `/mark` for people who like typing
- red dot in the corner while a full `/record` is running

**main menu: replays button** -> library overlay
- tabs: **On this device** / **My account** / **Gallery** (later)
- each card: thumbnail, date, length, mode, players, size, local/cloud badge, verified badge, pinned / "expires in x days", how much quota is left
- **thumbnails:** a frame from the highest scoring moment (director's indexer), chase cam on the killer, post effects on. rendered by the client (the server has no gpu), as a small webp: stored next to the replay in indexeddb, and uploaded alongside it on "save to account" (size capped, checked like any upload). fallback before one exists: the map's overview shot. user can "set as thumbnail" on any frame in the viewer
- actions: watch, highlight reel, rename, save to account / download, pin, share link (unlisted), delete
- drag a `.lsreplay` onto the page or "open file" to import

**replay viewer** (replay mode inside the real game page, it needs the engine and bundle)
- timeline at the bottom with event ticks: kills (team coloured), multikills, markers. click to jump
- play/pause, speed (0.05x - 4x), frame step, space/arrows like a video player
- player list (killfeed style), click to follow
- camera picker, 1-9 hotkeys, C to cycle like beamng
- game hud toggle (clean / names / full game hud / pov)
- "add shot" puts the current camera+target+time onto a shot track under the timeline
- verified / unverified badge, anonymise toggle
- take button (clean output mode + take mode, see section 6) with aspect, render resolution, watermark

**settings + keybinds** all go in a **Replay** tab in legacysettings (`addTab` / `addCategory` / `addOption`, `bind` type for keys, `slider` for the smoothing stuff). no custom settings ui. default binds, all rebindable:
- hide all replay ui (the main one)
- open/close control panel window
- play/pause, frame step, speed up/down, jump to next/prev event
- cycle camera, cameras 1-9, toggle freecam
- add shot, add freecam keyframe, start/stop live freecam record
- clip (ingame)

**the controls-covering-the-game problem** - lots of controls, and you want to see the whole frame. three layers:

1. **in page overlay** (default) - timeline + compact controls, the hide ui keybind clears everything so only the game is left
2. **pop out control panel window** - a button/bind opens a second browser window (`window.open`, same origin) with the full control panel: timeline, shot track, camera settings, player list, take controls. the main window then only shows the game, full size. put it on a second monitor, or beside the game
   - same origin means the popup can just call into the main window directly (`window.opener`), or both sides talk over a `BroadcastChannel('legacyreplay')`. BroadcastChannel is cleaner - just messages, and either side can reload without breaking the other
   - write the panel once as a module that renders into whatever `document` its given, so the overlay and the popup are the same code. if the popup gets blocked (it must be opened from a click/keypress), fall back to the overlay
   - keybinds need to work in both windows - the panel forwards key presses to the main window over the channel, so you dont have to click back into the game to pause
   - the codebase already does a popup once (the old `debugWindow = window.open(...)` debug dump), so its not alien
   - catch: browsers throttle windows that are fully covered or minimized. the game window has to stay visible during a take (fine on a second monitor, or side by side), obs window capture of a throttled window just records stutter
3. **clean output mode** - main window shows only the canvas, letterboxed to the chosen aspect (16:9 / 9:16 / 1:1), no cursor, no ui at all. this is what obs records. pairs with the popped out panel

**highlight reel dialog** (mk8dx bit)
- who: everyone / me / pick players / a team
- length: 30 / 60 / 90s / custom
- style: chill / hype
- generate -> preview -> tweak shots on the track -> take (record with obs)

---

## 9. plugin layout (plan)

```
legacyreplay/
  index.js          PluginMeta + hooks (sendToAll/sendToOthers recorder, permissionsAfterSetup cmds, pluginSourceInsertion, onStartServer static + /replays route, services:unhandledCommand)
  recorder.js       game worker side - rolling buffer, keyframes, file writing
  shared.js         Comm.Add("replayChunk"), format read/write (+ all the safety checks), signature verify, packet indexer (runs both sides)
  services.js       replays table, uploads, quotas, expiry/pins, access checks, signing key + signing
  client.js         replay mode, virtual clock, playback, chunk download, indexeddb library
  caster.js         live buffer + delay, instant replay
  cameras.js        camera modes
  director.js       moment scoring, shot assignment, presets
  postfx.js         rendering pipeline + custom effects
  audio.js          buses, slow mo filtering, music + ducking
  take.js           clean output mode, render resolution, take mode, frame drop graph
  client/           static: library + viewer/editor ui
  README.md         player/admin facing docs - picked up by the wiki's pluginDocsPlugin automatically
  test-*.js         node test scripts, see below
```

### testing

theres no test suite in the repo, so like deadinternet this ships its own `test-*.js` scripts, run with plain `node`:

- **test-format.js** - write -> read round trip, version handling, keyframe lookup, embedded map/items
- **test-signing.js** - sign -> verify, one flipped byte anywhere = unverified, unknown key = unknown server, old key ids still verify
- **test-fuzz.js** - throw garbage at the reader: random bytes, truncated files, huge lengths, backwards timestamps, gzip bombs, html in names/chat, out of range ids. every one must fail cleanly (no throw out, no hang, no huge allocation, no unescaped string getting through)
- **test-recorder.js** - start a room with deadinternet bots, record a minute, check keyframes decode with the right players, packet counts look sane, per-recipient packets are tagged right
- **test-director.js** - fixed recordings -> the indexer finds the known kills/multikills/fatal bullets, and scoring/picking gives the same reel every run
- **determinism** needs a real browser, so thats a page in replay mode that plays the same 5s twice at different speeds/framerates and compares player positions, bullets and camera pose per frame (not pixels - cosmetic randomness is allowed to differ). run by hand / through the browser pane, not node

### README

`README.md` in the plugin folder, like every other plugin - the wiki builds its page straight from it. covers: what it does, commands + default ranks, keybinds, config keys (storage quotas, expiry, public room policy), privacy notes (no opt out, anonymise is on screen only), how verification works, how to record takes with obs, the file format version, and the extension points for other plugins once they exist. this DESIGN.md is for building it, the README is for using it

---

## 10. hooks to add

ok'd in principle: hooks, not features. keep each one small and generic so other plugins can use them too.

core:
1. **game clock** - `getGameTime()` in `mainGameLoop` (and the round clock's `Date.now()`), with a plugin event to override it. replaces the `performance.now` wrapping idea
2. **non-player room client** (for live caster mode, section 7) - a client that receives the room's broadcasts but isnt a player: no slot, not in player lists, cant spawn. the biggest of these, so its asked about on its own when caster mode gets built
3. **raw message event** (maybe) - `LegacyShellOnMessage` currently emits per command after reading the opcode. caster mode gets around it by taking over `ws.onmessage` itself, so leave this until something actually needs it

legacyadmin:
4. **plugin tabs** - see section 8

no hook needed:
- audio routing - howler exposes its context/master gain, and `playSoundIndependent` can be wrapped in replay mode

not doing:
- ~~`me`-less null checks~~ - dummy `me`, same as deadinternet games where the human isnt playing

anything else that turns up while building gets listed here and asked about first

---

## 11. phases

1. **record + clip:** rolling buffer, keyframes, embedded map/items, signing, `/clip` -> local indexeddb library + download, room/rank permissions. safe reader from day one (fuzz test + string escaping), since clips get shared immediately. playback at 1x with first person + free cam only. proves the whole packet-replay approach works (and whether syncs are enough for slow mo). README started
2. **time control:** game clock hook, virtual clock, pause/slow/fast, seek via keyframes + pre-roll, timeline scrubber
3. **cameras:** chase, orbit, shoulder, tripod, top down, bullet, grenade, pov
4. **shots + presets + manual timeline editor**
5. **look + sound:** post effects, audio buses, slow mo audio, music
6. **takes:** clean output mode, render resolution, take mode, pop out panel, anonymise, determinism test page
7. **auto director:** indexer, scoring, mk8dx style filters, thumbnails
8. **server storage:** services table + upload, client server `/replays/:id` route, quota, expiry + pins, `/record`, account tab in the library
9. **admin:** legacyadmin plugin tabs hook, then the replays tab
10. **live caster mode:** caster as a never-spawning player first, then the non-player client hook. delay buffer, live director, instant replay
11. **sharing:** unlisted links, public gallery

---

## open questions

- deadinternet bots in promo clips - great for staged shots honestly. scripted "director bot" scenarios could be a later thing
