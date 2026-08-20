# Codebase Anecdotes

> **Audience:** Anyone who wants to enjoy this codebase, not just work in it · **Prereqs:** None

[Known Quirks](./known-quirks.md) is the "this could actually bite you" page. This one isn't - it's just the personality of the source: a maintainer talking to themselves, to future readers, and occasionally to the code itself, mid-comment. Everything below is quoted verbatim (swearing included) with a `file:line` so you can go see it in context. If you only read one entry, make it the `gameKey` one over in Known Quirks - [`784` is the base-36 encoding of "LS"](./known-quirks.md#roommanager-js-s-gamekey-is-hardcoded-to-spell-ls-in-base-36-not-random), which is funnier than most things on this page and didn't fit here because it's a real gotcha, not just a good story.

## The maintainer, talking to the code

`bullets.js:340`, in `Grenade.prototype.update`, right above a line that plays a sound effect:

```js
//what the fuck puppy don't just place audio code here grrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr
```

The maintainer's own handle is `onlypuppy7` - this is them catching themselves mid-refactor and addressing themselves by name, in the second person, in a comment that's still there.

`player.js:643` doesn't waste any words on what `moveZ` is like to work on:

```js
moveZ(ndz, delta, dontApply = {}) { //fuck this function
```

And a couple lines into the `Player` constructor, `player.js:48-49`:

```js
//actually i hate the below. this is total shit.
//listen, im only mirroring what shell actually does.
```

- worth knowing if you're ever tempted to "clean up" the code right below it: the ugliness is a deliberate compatibility choice, not an accident, and the comment is the maintainer pre-emptively defending that decision to whoever reads it next (including, later, themselves).

## JSDoc that gives up mid-explanation

`src/shell/general/wsrequest.js`'s entire doc comment, above the function every server-to-server WebSocket call in the project goes through:

```js
/**
 * Dumps your garbage into a WebSocket and gives you whatever shit the server decides to throw back.
 *
 * @param {Object} payload - The data you're force-feeding to the server.
 * @param {string} url - The WebSocket server URL. Don't fuck this up.
 * @param {string} [auth_key] - Optional. If you've got one, it's getting jammed into the payload whether the server likes it or not.
 * @returns {Promise<*>} - Resolves with whatever mess the server sends back or throws an error if the WebSocket decides to shit the bed.
 *
 * @example
 * const response = await exported({ cmd: 'ping' }, ss.config.game.services_server, ss.config.game.auth_key);
 * console.log(response); // Or don't, if you enjoy the thrill of getting completely fucked over.
 *
 * @throws {Error} If the WebSocket throws a fit.
 */
```

It is, genuinely, an accurate description of what the function does.

`comm.js:6`, the file-level comment at the top of the wire protocol implementation:

```js
// FYI: This file is designed to be imported into the shell JS too. What does this mean? IDK. I cba to explain.
```

("cba" - can't be arsed - shows up often enough in this codebase that it's basically a second author's-note convention alongside real JSDoc tags.)

And `comm.js:477`, the actual JSDoc for the `requestRespawn` opcode:

```js
/** #CLIENT: try to respawn. if rejected for some reason ur screwed (i think)
* @constant {number}
*/
```

## Constants with opinions about themselves

`constants.js:69`, directly above `item_classes`:

```js
//all of these cryptic classes are hell.
```

The [enums reference page](./Generated/enums-reference.md) is generated straight from JSDoc on these same objects, and the JSDoc doesn't get any more confident once you're inside it: `Slot`'s says *"this may as well be a boolean"*, `ItemType`'s says *"idk how to describe this"*, and `CharClass`'s says *"used for items but also for classIdx (its really confusing and inconsistent)"* - three enums, three separate admissions that naming them was hard.

`itemIdOffsets` (constants.js:245) has its own JSDoc verdict on its predecessor tables: *"legacyshell added (these constants shouldve been like this to begin with)"*.

And both `itemIdOffsetsByNameOLD` (constants.js:174) and `itemIdOffsetsByName` (constants.js:224) carry the identical explanation for why they bother aliasing half their own keys:

```js
Object.assign(itemIdOffsetsByName, { //alt names in case its needed (its not my fault shell uses like 4 fucking names for the same exact thing)
```

## Real profanity as an actual test case

`censor.js:148`, in the function that strips repeated characters so people can't dodge the word filter by typing `fuuuck`:

```js
str = str.replace(/(.)(?=\1)/g, ""); //remove duplicate chars eg fuuuck -> fuck
```

The censor system's own inline example of what it censors is the thing it censors.

## An inline changelog, one comment at a time

`player.js:880`, in the jump-buffer tolerance logic - note the second sentence was clearly added later, by the same person, without deleting the first:

```js
//idk if 1.3 is too much or not enough; Should do the job though. - op7: make that 1.5.
```

`op7` is the maintainer signing their own follow-up edit, in-line, like a tiny embedded git-blame.

`player.js:1266`, explaining a deliberate compatibility quirk in respawn ammo logic:

```js
//switching weapons to another then back would give inifinite ammo, so thats pointless, kek...
```

And `player.js:7`, on the import that wires up kill/death tracking:

```js
//legacyshell: adding kills and deaths (literally tracking ur every move the government is watching yuo)
```

`player.js:19` has a `console.log` left in server-only code purely to flag a branch that's not supposed to be reachable:

```js
console.log("wtf?", CommCode); //case that shouldnt exist
```

with a sibling a few hundred lines down at `player.js:345`:

```js
if (this.actor && this.id == meId) { //wtf is this for
```

## The maintainer, everywhere, on purpose

Three of this project's own npm dependencies - `puppylog`, `puppymisc`, `puppyperpetual` (see `package.json`) - are packages the maintainer published themselves, all under the same `puppy` branding as their `onlypuppy7` handle. `puppylog` in particular is imported directly into `src/shell/` (`player.js`, `plugins.js`, `catalog.js`, `events.js`, and more) - the shared game-logic layer's own logging is a personal package, not a generic one.

The built-in `/mod boot` command's `example` field, shown to players in its own help text (`permissions.js:245`):

```js
example: "@onlypuppy7",
```

The maintainer picked themselves as the example person to demonstrate kicking someone.

And `src/scripts/conv-md.js`, a small one-off markdown conversion script, opens its actual transform logic with (line 13):

```js
//1. shut up. 2. i dont care.
```

followed a few lines later, at line 17, by:

```js
//fcking strikethrough (this is all my fault)
```

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
