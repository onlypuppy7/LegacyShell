# Sounds

> **Audience:** Content creators, semi-technical · **Prereqs:** None
>
> **Canonical source:** `server-client/src/client-static/src/apollon/Apollo.js`

LegacyShell replaced the original game's audio with its own Howler.js-based wrapper, **Apollo** - see [Sound and Apollo](../04-Plugin%20Development/sound-and-apollo.md) for the API a plugin uses to register and play sounds in code; this page covers adding/replacing sound files as a content creator.

## Where sound files live

`server-client/src/client-static/sound/` - organized into subfolders per weapon/category (`eggk47/`, `csg1/`, `dozenGauge/`, `cluck9mm/`, `ambiance/`) plus flat top-level files (`ammo.mp3`, `death.mp3`, etc.).

## Format and fallback

Apollo loads sounds by filename + logical name, and if an `.mp3` fails to load, automatically retries the same path with the extension swapped to `.ogg` - shipping both formats side by side is the existing convention (`ammo.mp3` and `ammo.ogg` both present) for broader browser codec compatibility, though `.mp3` alone works in effectively every modern browser today.

If a sound fails to load entirely (neither format works, or the file is missing), Apollo plays a built-in fallback tone (`fallBack.mp3`/`fallBack.ogg`) instead of silently failing - so a broken sound reference is usually audible as "the same fallback sound plays for everything," not silence, which is a useful signal when something's misconfigured.

## Replacing an existing sound

Overwrite the file in place, keeping the same filename and format(s) - the game references sounds by their existing path/name, so no code or config change is needed to swap the audio content itself.

## Adding a new sound

Adding a genuinely new sound effect (not replacing an existing one) means it also needs to be referenced somewhere in the game logic that decides *when* to play it - which is a code change, not just a file drop. If you're doing this as part of a plugin (e.g. a new gamemode with its own sound cues), see [Sound and Apollo](../04-Plugin%20Development/sound-and-apollo.md) for the `loadSounds` hook and the functions that actually trigger playback.

## Common Issues

**I replaced a sound file and it still plays the old audio.** Browsers aggressively cache audio assets - a hard refresh (bypassing cache) on the client, or a cache-busting change on the server side, is usually needed to see a replaced sound take effect for players who already loaded the page once.

**A sound plays as the generic fallback tone instead of my audio.** The file failed to load in both formats - check the file actually exists at the expected path and isn't corrupted; a 0-byte or malformed audio file triggers the same fallback behavior as a missing one.

Next: [Gamemodes](./gamemodes.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
