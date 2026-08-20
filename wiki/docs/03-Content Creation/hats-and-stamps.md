# Hats and Stamps

> **Audience:** Content creators, semi-technical · **Prereqs:** [Items and Skins](./items-and-skins.md)
>
> **Canonical source:** `server-client/src/stampsGenerator.js`

Hats and stamps both use the general [item shape](./items-and-skins.md) (`item_type_id` 1 and 2 respectively) - a hat is just another 3D model like a weapon skin (see [Dealing with Babylon Models](./dealing-with-models.md)). Stamps are the one genuinely different case: instead of individual 3D models, every stamp is a flat image, and all of them get composited into a single shared spritesheet at build time. This page is specifically about that spritesheet system.

## Adding a stamp image

Drop a `.png` into `src/stamps/` (or a directory your plugin registers via the `client:stampImageDirs` hook - see [Content Packs](../04-Plugin%20Development/content-packs.md)), named to match the stamp's item `name` (see [Items and Skins](./items-and-skins.md) for the item row itself).

## Filename matching rules

The generator matches image filenames to item names with a few tolerances, so you don't have to get the filename byte-for-byte identical to the item's `name` field:

- Anything after the literal word `"Stamp"` in the filename is stripped for matching purposes (`"Smiley Stamp.png"` matches an item named `"Smiley"`).
- A small hardcoded rename table covers a few historical naming mismatches (e.g. a file called `"Pablo Smile"` matches an item named `"Smiley"`) - only relevant if you're re-adding a specific legacy stamp under its old filename; not something you need for a new stamp.
- `&` in a filename also matches against the same name with `&` replaced by `"and"`.
- You can prefix a filename with `<anything>=` to force a specific match regardless of the actual filename - e.g. a file literally named `"0=LegacyShell.png"` matches an item named `"LegacyShell"`. Handy for giving a file a more descriptive filename on disk than the in-game item name, without needing them to match.

## Build-time compositing

On client server startup, every matched stamp image gets composited into one square spritesheet (`store/client-modified/img/stamps.png`), sized to fit all of them in a `ceil(sqrt(count))` grid. Each stamp's grid position gets written back into the in-memory item data (`x`/`y` fields) so the browser client knows which region of the shared spritesheet to sample for that stamp - this is why stamps don't each need their own texture load at runtime, just one shared image.

This regeneration is **skipped automatically** when nothing's changed - the generator hashes every matched input image plus the current output file, and only redoes the compositing work if that combined hash differs from last time. A large stamp collection doesn't slow down every single server restart, only ones where a stamp actually changed.

A stamp whose artwork touches the edge of its image with non-transparent pixels automatically gets a 1px border added, to avoid visual bleeding between adjacent stamps in the packed spritesheet - you don't need to add this padding yourself.

## Common Issues

**My stamp doesn't appear, with a "Stamp not found" warning in the client server log.** The filename didn't match the item's `name` field by any of the rules above - check for a typo, or use the `<anything>=RealName.png` override to force the match explicitly rather than trying to get the automatic matching to cooperate.

**I updated a stamp's image but the old version still shows.** Check the file's content actually changed (the hash-based skip only regenerates when the *image bytes* differ - re-saving an identical file doesn't count), and confirm you restarted the client server, since this only regenerates at boot.

Next: [Sounds](./sounds.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
