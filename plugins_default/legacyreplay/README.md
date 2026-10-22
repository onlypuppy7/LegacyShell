# LegacyReplay

Records every room on the game server so any moment can be saved as a replay, watched back inside the real game, and filmed from camera angles you couldn't get while playing.

See [DESIGN.md](DESIGN.md) for where it is going.

## Saving a clip, or a whole game

In a game, press **F8** (rebindable in settings, Replay tab) or type `/replay clip [seconds]` to keep the last 30 seconds (or that many, up to your limit). Public rooms need a signed in account to clip, private rooms don't. One clip every 20 seconds.

`/replay record` records the whole game from that moment, with a red **REC** in the corner, and `/replay stop` saves it. It stops by itself at your limit and saves what it has. Only whoever started it can stop it, and one recording at a time per room.

What a signed in account can do depends on its rank. Moderators get more, admins a lot more (replays kept, storage, how long a clip or a recording can be). The library shows your own numbers and nothing else, they live in `tiers.js`.

Clips are kept on your device (the browser's storage) and, signed in, on your account, see below. Download one from the library to keep the file.

## Watching

**Settings -> Replay -> Open replays** (the settings are in the corner of the main menu and in game). Or drop a `.lsreplay` file on the page.

| | |
|---|---|
| Camera views | first person, their view (the whole game hud as them: health, ammo, grenades, reticle, kill streak), chase, over the shoulder, side on, low angle, top down, orbit, security camera (fixed spot that only turns), free camera (C cycles, F is free) |
| Players | pick from the list, or the left and right arrow keys |
| Speed | 0.1x to 4x, [ and ] |
| Timeline | drag to seek, red ticks are kills |
| Highlights | builds a reel from the best moments (see below) |
| Space | play / pause |
| J / L | back / forward 5 seconds |
| H | hide the controls, G shows the game hud |
| Pop out | moves the control bar into a window of its own, so the game window can be filmed clean. Closing it puts the bar back |

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

It records live, so it takes as long as the reel plays for (slow motion included) and the tab has to stay in front, a hidden tab stops drawing and the video freezes. The game's hud isn't in the video (the camera views that show it, like Their view, will look bare). Nothing leaves the browser.

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

`format.js` is the file format, the reader (every file is treated as untrusted input) and signature checking. `recorder.js` runs in each room's worker. `tiers.js` has the limits by rank. `storage.js`, `signing.js` and `adminStorage.js` run on services, `cast.js` on the game's main thread. `session.js`, `cameras.js`, `viewer.js`, `editor.js`, `export.js` and `live.js` are the browser side.

```
node plugins_default/legacyreplay/test-format.js
node plugins_default/legacyreplay/test-fuzz.js
node plugins_default/legacyreplay/test-recorder.js
node plugins_default/legacyreplay/test-session.js
node plugins_default/legacyreplay/test-signing.js
node plugins_default/legacyreplay/test-cast.js
node plugins_default/legacyreplay/bench-recorder.js
```
