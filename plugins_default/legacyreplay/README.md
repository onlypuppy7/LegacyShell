# LegacyReplay

Records every room on the game server so any moment can be saved as a replay, watched back inside the real game, and filmed from camera angles you couldn't get while playing.

See [DESIGN.md](DESIGN.md) for where it is going.

## Saving a clip, or a whole game

In a game, press **F8** (rebindable in settings, Replay tab) or type `/replay clip [seconds]` to keep the last 30 seconds (the Replay tab has a clip length dropdown, 10 to 180 seconds, up to your limit). Public rooms need a signed in account to clip, private rooms don't. One clip every 20 seconds.

`/replay record` records the whole game from that moment, with a red **REC** in the corner, and `/replay stop` saves it. It stops by itself at your limit and saves what it has. Only whoever started it can stop it, and one recording at a time per room.

What a signed in account can do depends on its rank. Moderators get more, admins a lot more (replays kept, storage, how long a clip or a recording can be). The library shows your own numbers and nothing else, they live in `tiers.js`.

Clips are kept on your device (the browser's storage) and, signed in, on your account, see below. Download one from the library to keep the file.

## Watching

**Settings -> Replay -> Open replays** (the settings are in the corner of the main menu and in game). Or drop a `.lsreplay` file on the page.

| | |
|---|---|
| Camera views | 36 of them, grouped in the picker (C cycles the ones that sit on a player, F is the free camera), see below |
| Players | pick from the list, or the left and right arrow keys |
| Speed | 0.1x to 4x, [ and ] |
| Timeline | drag to seek, red ticks are kills |
| Highlights | builds a reel from the best moments (see below) |
| Space | play / pause |
| J / L | back / forward 5 seconds |
| H | hide the controls, G shows the game hud |
| Pop out | moves all of the replay ui (control bar, highlights editor, dialogs, notes) into a window of its own, so the game window is only the game and its hud. Closing it puts everything back |

### Camera views

- **On the player:** first person, their view (the whole game hud as them), chase, over the shoulder (right and left), over the head, out in front (looking back at them), low angle, ground skim (low and wide, speed), helmet cam (on top of the head, very wide, a little shake), muzzle cam (at the gun), tilted chase.
- **Alongside:** side on, telephoto side (far off with a narrow lens, it sits still and pans), orbit, drone (high, loose, drifting), crane (rises and draws back and comes down over 14 seconds), dolly zoom (pulls away while the lens tightens), fly-by (waits ahead, turns as they pass, then cuts to a new spot).
- **Fixed:** top down (close, normal, telephoto), security camera (close, normal, high in the nearest corner of the map), CCTV (a security camera with the retro look, scanlines, a camera number and the replay's date and time on it), tilt-shift (high and angled with the top and bottom blurred so it looks like a model), arena overview (circles the whole map from above, needs no player).
- **Places** (not a player, in replays and when spectating): focus on a place, picked from a second list that takes the player list's place (the whole map, its four corners, every spawn, every pickup lying around), and a fly tour that goes through a few of them, seven seconds each. The camera sets off from the bearing it is already on and glides from place to place, so nothing jumps. A pickup that is picked up is stood in for by where it was. A reel shot can be a place (it remembers which).
- **Fights:** duel two-shot (both in the frame from the side, pulls back as they part), group (the middle of whoever is near them), killcam (through the eyes of whoever is about to die, the last second and a bit before a kill), kill chain (a chase that swings to the next person they are about to kill), auto (always on the closest fight, or the kill that is happening).
- **Projectiles:** grenade cam and rocket cam ride the watched player's own grenade or rocket and circle where it went off. Until one is thrown they are a chase.
- **Bullets** (from a reel shot that has one, or the editor): bullet cam (behind it), from the front, side on, and incoming (the victim's eyes, watching it come).

In a replay everyone is drawn from the recorded syncs as paths through time (a smooth curve through the points, the aim from the six ticks after each), not from the game's guess between syncs, so first person is as smooth as it was. A live game being spectated goes by the ticks. The sun and the weather go by the replay's time, so skipping ahead or slowing down moves them, and a seek puts them where they were. The egg colours plugins set are in every keyframe.

Orbit: hold the orbit button (middle mouse by default, bindable in the Replay tab) and move the mouse to swing the camera round whatever it is looking at, or use W A S D (A and D round, W and S up and down), the wheel for in and out, V to put it back. In first person it looks round from their eyes.

A replay opens on their view (hud) of whoever got the most kills, and waits for them if they haven't spawned. Everything is drawn between the game's ticks, so a screen faster than 60Hz is not a row of 60Hz steps; first person is the game's own eye, recoil and all. What the game only does for me is done for them: picking up ammo and grenades (and the sound, if they are who you're watching), and the grenade throw animation. Ammo pickups aren't counted when spectating a live game.

A view with nothing to show yet (a duel with nobody near, a killcam with no kill coming) is a chase meanwhile. Every one is smoothed and stays out of walls, and any can be a shot in a reel.

Free camera: click the view to look around (Esc lets go, or hold a mouse button and drag), W A S D to move, E and Q for up and down, Shift is fast, the wheel changes speed, Alt and the wheel zooms, Z and X roll, V puts the roll and zoom back. Every move is smoothed. **Feel** in the Replay settings picks raw, smooth, cinematic or drone (the drone leans into turns), or custom to use the sliders.

Slow motion is drawn smoothly (things are interpolated between the game's ticks), and slows the gun and hand animations and the sounds too. Sounds stop getting slower at half speed and get quieter instead.

## Highlights

**Highlights** in the viewer opens a side panel (the replay stays in view, so you can scrub while you work). Choose who (everyone, or one player), how long, a style (chill is mostly normal speed, hype is lots of slow motion) and a look, then **Generate**. Moments are scored from the kills (long range, in the air, low health, streaks, revenge, multikills, and a shooter who was already dead when the bullet landed), the best ones that fit are picked, and each becomes shots: **follow the bullet** (a camera riding the bullet that did it, ending on the victim), a chase on the shooter into an orbit around where it landed, or one long chase for a multikill, ending on the bullet if the last kill was a long shot. **Play reel** runs it. Any key you press takes over.

### Editing a reel

Every shot is a row: preview it, move it up or down, duplicate it, remove it, change its start and end, its camera (any of the views above, a fixed free camera, or the bullet), who it follows, how fast it plays (normal, slow, crawl, ramp, fast) and its own look. **Add shot here** makes a shot from the current camera and time. Neighbouring shots that join up blend, anything else is a cut.

**Save** keeps the reel on this device, against the replay it was made for (it comes back whenever that replay is opened, even if it was imported again). **Export** writes it to a `.lsreel.json` file and **Import file** reads one back. A reel from a file is checked like everything else: the wrong shape is refused and numbers are clamped.

### Looks and sound

The **Look** picker in the bar (and per reel, and per shot) is clean, cinematic (letterbox bars, teal and orange grading, vignette, film grain, sharpening, a little colour fringing, bloom, soft background), hype (punchier contrast and colour, strong bloom and fringing) or retro (washed out and sepia, heavy grain and vignette). Looks ease in and out, nothing pops, and a bullet landing adds a white flash and a quick punch of fringing and contrast.

The colour work is one small shader pass of our own, which costs next to nothing. **Bloom** and **Soft background** (depth of field) are babylon's and are the expensive ones, so each has its own setting, and there is a quality setting for the two. If a look is slow, turn those two off and keep the rest.

Sound: the game's sound goes dull while time is slowed (Settings -> Replay -> Muffle slow motion), a whoosh plays as a bullet leaves and a thump as it lands (Reel sound effects), and you can pick a music file from your device in the panel. Music plays while a reel plays, loops, and dips under kills and impacts. The file never leaves your browser.

### Making a video

**Video** in the Highlights panel records the reel into an mp4 (a webm on a browser that can't make mp4). Pick the shape (window, 16:9, 9:16 vertical, 1:1, 4:3, 21:9), the size (480p to 1440p, by the short side), the frame rate (24, 30 or 60), the quality (low to max, which sets the bitrate, the dialog shows the size it works out to) and whether to include sound. It plays the reel through once and records what is on screen: the game's picture with the look effects, the letterbox and the flashes, and the sound as mixed (the game, the muffle in slow motion, the music, the whoosh and thud). The game is drawn at the video's resolution while it records, so a 1080p video is sharp even in a small window.

When it is done the video plays in a dialog in the game, and nothing is saved until you press **Download**. The dialog also offers **YouTube**, **TikTok** and **X** (each opens that site's upload or post page, drag the file in), **Share** (the system share sheet, only where the browser can share files, such as a phone or Chrome and Edge on Windows) and **Save again**. Nothing is uploaded from the game, and nothing is sent without a click.

**Smooth** (on by default) makes the video so that nothing about how the game happened to run can get into it. The game's clock is made the video's, so every frame it draws is exactly one frame of the video later however long drawing it took, and each frame goes straight into the browser's own video encoder with the time it is for; the sound is recorded once, live, and encoded the same way; and `mux.js` puts both into an mp4. Frame times in the file are exact (checked: every gap in a 60 fps file was 16.67 ms), nothing is played back in real time to make it, and a slow encoder holds the game's clock still instead of being outrun. It needs a browser with the video encoder (Chrome and Edge, on `localhost` or https) and AAC; where it isn't there the same three goes are done by recording a playback of the pictures, which can lose frames on a slow machine. Without Smooth the reel is filmed live as it plays, which takes as long as the reel plays for (slow motion included) and carries every hitch of the machine into the file. The video is drawn with your graphics settings, so the costly ones (Fancy Shadows draws a 5120 px shadow map every frame, it took a test from 13 ms to about 70 ms a frame) make it slower; the progress shows about how long is left, and the browser console says how long frames took and what it was drawing at (lines starting [legacyreplay]). The export keeps going when the window isn't the one in use or the tab isn't showing (it is driven by a worker's clock, not the page's frames, which a hidden tab doesn't get). The game's hud isn't in the video (the camera views that show it, like Their view, will look bare). Nothing leaves the browser.

## Keeping replays on your account

Signed in, replays and reels can also live on the services server, so they follow you to other devices. **Settings -> Replay -> Keep new clips on my account** (on by default) uploads every clip you take. In the Replays list, **Upload** keeps an older one, **Pin** stops one expiring, and each row says where it is kept. Reels saved for a replay that is on your account are kept there too, under the same name (saving a name again replaces it), and show up wherever you open that replay.

The limits (how many replays, how much space, how long unpinned ones last, how many pins and reels) come from the account's rank, `tiers.js`. Only you can see yours. Nothing is trusted from the client: a replay is read back through the strict reader before it is kept, a reel goes through the same cleaner an imported one does, and what is listed (map, length, key, signature) comes from the file itself. Signed out, everything stays on the device. The tables (`replays`, `replay_reels`) are created by the plugin on services.

The commands are `replayList`, `replaySave`, `replayGet`, `replayDelete`, `replayPin`, `replayReels`, `replayReelSave`, `replayReelGet` and `replayReelDelete`, handled in `storage.js` through `services:unhandledCommand`. They count against the services' normal per-IP request limit (10 a minute), so the library asks once and keeps the answer for two minutes.

## Signatures

Services signs every clip and recording a game server makes (`signing.js`, an ed25519 key kept in `store/replay_signing.json` next to the database, which never leaves services). The signature is the last record of the file and covers everything before it, plus who signed and when, so changing one byte anywhere breaks it. The viewer shows **Verified (server)**, **Not verified** (changed, or not made here), **Other server** (a key it doesn't have) or **Unsigned** (services couldn't be reached when it was made). Verified is checked against the public keys services hands out (`replayPublicKeys`), kept in the browser so a file can be checked offline. Old keys stay in the list when the key is rotated, so old replays keep verifying.

A valid signature says where a file came from, not that it is harmless: every file still goes through the strict reader.

## Watching live (moderators)

**Settings -> Replay -> Watch live**, then the game's code. The room sends its recording as it is made to a connection that doesn't take a player slot, and the viewer plays it a moment behind (the **LIVE** button goes back to the edge). Every camera, the timeline and the highlight tools work on what has arrived so far. Moderator and above, checked against the account services says the session is.

This needed two small hooks in the game server (`joinGameFound`, and `userLookup` and `handled` on `beforeJoinRoom`), see `cast.js`.

## Spectating (in a game you are in)

The respawn menu has a **Spectate** button between CHANGE EQUIPMENT and PLAY. It hides the menu and puts the replay cameras on the live players, in the same scene, with the game still running (`spectate.js`). A bar at the bottom has the view and player pickers, **Pop out** (the bar goes to a window of its own, like the replay one), **Menu** (back to the menu, still out) and **PLAY** (back in at once). C, F and the arrow keys work as in a replay. The views that need a recording (the kills so far) and the tilt-shift look aren't offered. First person with their hud works: their ammo is counted from their shots and reloads, and your own hud is put back when you leave. (Kill banners aren't shown, there is no record of the kills.) If the game spawns you (a new round) you are taken back out of spectating.

Whoever was picked in the player list stays wanted: when they die, haven't spawned yet, or the timeline is scrubbed to before they were there, the camera moves to someone else, and goes back to them as soon as they are playing again, unless somebody else (or the free camera) was picked in the meantime.

## Admin panel

With legacyadmin, a **Replays** tab lists everyone's replays on the server (owner, map, size, signature, expiry), with who is using the most space. Moderators can download a copy, admins can delete. It is added through legacyadmin's `adminTabs` event.

## Names and items

**Hide player names** in the settings shows every player as Player 1, Player 2... in replays and videos (the file itself is not changed). Replays also carry the definitions of the items players had equipped, so one still opens if an item has since been removed from the game.

## Commands

| Command | Who | |
|---|---|---|
| `/replay clip [seconds]` | signed in (public rooms), anyone (private rooms) | save a clip |
| `/replay record` | signed in (public rooms), anyone (private rooms) | record the whole game |
| `/replay stop` | whoever started it | save the recording |

## For other plugins

- `game:replayRecorderCreated` `{ this: room, recorder }` fires once per room. `recorder.claim(type, pack)` takes over recording a record type: `pack(room)` runs every sync cycle and returns the bytes.
- `game:replayRecord` (client) `{ type, data, header }` fires for every record before playback uses it, and a plugin can replace `data`.
- A record is `{ type, tMs, data }`, see `format.js` for the types and the file layout.
- `client:adminTabs` (legacyadmin) takes tabs for the admin panel, this plugin adds its Replays tab that way.

## Files and tests

`format.js` is the file format, the reader (every file is treated as untrusted input) and signature checking. `recorder.js` runs in each room's worker. `tiers.js` has the limits by rank. `storage.js`, `signing.js` and `adminStorage.js` run on services, `cast.js` on the game's main thread. `session.js`, `cameras.js`, `views.js` (what each camera view does, plain numbers so it is tested without a game), `viewer.js`, `editor.js`, `mux.js` (the mp4 writer, also tested in node), `export.js`, `live.js` and `spectate.js` are the browser side.

```
node plugins_default/legacyreplay/test-format.js
node plugins_default/legacyreplay/test-fuzz.js
node plugins_default/legacyreplay/test-recorder.js
node plugins_default/legacyreplay/test-session.js
node plugins_default/legacyreplay/test-views.js
node plugins_default/legacyreplay/test-signing.js
node plugins_default/legacyreplay/test-cast.js
node plugins_default/legacyreplay/bench-recorder.js
```
