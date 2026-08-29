<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# Enums & Lookup Tables

> **Audience:** Plugin authors, AI agents · **Prereqs:** [Wire Protocol Opcodes](./comm-opcodes.md)

Every top-level, flat, all-number-valued object literal in `src/shell/constants.js` and `src/shell/comm.js`, extracted directly from source - whether or not it carries a JSDoc `@enum` tag (most of the real ones do; a few, like `Team` and `CONTROL`, don't but are unambiguously enum-shaped anyway). Deliberately excludes name→function maps (`item_classes`, `Ease`), name→string maps (`item_classes_strings`, `inputToControlMap`), and name→array maps (`teamColors`) even where they sit right next to genuine enums in the same file - those hold real values, not numeric codes. `Comm.Code` has its own dedicated page: see [Wire Protocol Opcodes](./comm-opcodes.md).

## `Slot`

used in-game, e.g., `me.weaponIdx`. this may as well be a boolean.

Defined at `src/shell/constants.js:129`.

| Key | Value |
|---|---|
| `Primary` | `0` |
| `Secondary` | `1` |

## `ItemType`

used for items, idk how to describe this

Defined at `src/shell/constants.js:139`.

| Key | Value |
|---|---|
| `Hat` | `1` |
| `Stamp` | `2` |
| `Primary` | `3` |
| `Secondary` | `4` |

## `CharClass`

used for items but also for classIdx (its really confusing and inconsistent)

Defined at `src/shell/constants.js:151`.

| Key | Value |
|---|---|
| `Soldier` | `0` |
| `Scrambler` | `1` |
| `Ranger` | `2` |
| `Eggsploder` | `3` |

## `itemIdOffsetsByNameOLD`

Defined at `src/shell/constants.js:160`.

| Key | Value |
|---|---|
| `Hat` | `1000` |
| `Stamp` | `2000` |
| `base` | `3000` |
| `Cluck9mm` | `3000` |
| `Eggk47` | `3100` |
| `CSG1` | `3400` |
| `DozenGauge` | `3600` |
| `RPEGG` | `3800` |
| `Hats` | `itemIdOffsetsByNameOLD.Hat` |
| `Stamps` | `itemIdOffsetsByNameOLD.Stamp` |
| `Primary` | `itemIdOffsetsByNameOLD.base` |
| `Soldier` | `itemIdOffsetsByNameOLD.Eggk47` |
| `Scrambler` | `itemIdOffsetsByNameOLD.DozenGauge` |
| `Ranger` | `itemIdOffsetsByNameOLD.CSG1` |
| `Eggsploder` | `itemIdOffsetsByNameOLD.RPEGG` |
| `Secondary` | `itemIdOffsetsByNameOLD.Cluck9mm` |

## `itemIdOffsetsOLD`

legacyshell added just for converting old item ids to new ones

Defined at `src/shell/constants.js:195`.

| Key | Value |
|---|---|
| `[ItemType.Hat]` | `itemIdOffsetsByNameOLD.Hat - 1` |
| `[ItemType.Stamp]` | `itemIdOffsetsByNameOLD.Stamp - 1` |
| `[ItemType.Primary]` | `{ base: itemIdOffsetsByNameOLD.base, [CharClass.Soldier]: itemIdOffsetsByNameOLD.Eggk47 - itemIdOffsetsByNameOLD.base, [CharClass.Scrambler]: itemIdOffsetsByNameOLD.DozenGauge - itemIdOffsetsByNameOLD.base, [CharClass.Ranger]: itemIdOffsetsByNameOLD.CSG1 - itemIdOffsetsByNameOLD.base, [CharClass.Eggsploder]: itemIdOffsetsByNameOLD.RPEGG - itemIdOffsetsByNameOLD.base }` |
| `[ItemType.Secondary]` | `itemIdOffsetsByNameOLD.Cluck9mm` |

## `itemIdOffsetsByName`

Defined at `src/shell/constants.js:210`.

| Key | Value |
|---|---|
| `Hat` | `50000` |
| `Stamp` | `100000` |
| `base` | `150000` |
| `Cluck9mm` | `150000` |
| `Eggk47` | `200000` |
| `CSG1` | `250000` |
| `DozenGauge` | `300000` |
| `RPEGG` | `350000` |
| `Hats` | `itemIdOffsetsByName.Hat` |
| `Stamps` | `itemIdOffsetsByName.Stamp` |
| `Primary` | `itemIdOffsetsByName.base` |
| `Soldier` | `itemIdOffsetsByName.Eggk47` |
| `Scrambler` | `itemIdOffsetsByName.DozenGauge` |
| `Ranger` | `itemIdOffsetsByName.CSG1` |
| `Eggsploder` | `itemIdOffsetsByName.RPEGG` |
| `Secondary` | `itemIdOffsetsByName.Cluck9mm` |

## `itemIdOffsets`

legacyshell added (these constants shouldve been like this to begin with)

Defined at `src/shell/constants.js:245`.

| Key | Value |
|---|---|
| `[ItemType.Hat]` | `itemIdOffsetsByName.Hat - 1` |
| `[ItemType.Stamp]` | `itemIdOffsetsByName.Stamp - 1` |
| `[ItemType.Primary]` | `{ base: itemIdOffsetsByName.base, [CharClass.Soldier]: itemIdOffsetsByName.Eggk47 - itemIdOffsetsByName.base, [CharClass.Scrambler]: itemIdOffsetsByName.DozenGauge - itemIdOffsetsByName.base, [CharClass.Ranger]: itemIdOffsetsByName.CSG1 - itemIdOffsetsByName.base, [CharClass.Eggsploder]: itemIdOffsetsByName.RPEGG - itemIdOffsetsByName.base }` |
| `[ItemType.Secondary]` | `itemIdOffsetsByName.Cluck9mm` |

## `Team`

Defined at `src/shell/constants.js:258`.

| Key | Value |
|---|---|
| `blue` | `1` |
| `red` | `2` |

## `CONTROL`

Defined at `src/shell/constants.js:271`.

| Key | Value |
|---|---|
| `up` | `1` |
| `down` | `2` |
| `left` | `4` |
| `right` | `8` |
| `jump` | `16` |
| `fire` | `32` |

## `MAP`

Defined at `src/shell/constants.js:280`.

| Key | Value |
|---|---|
| `blank` | `0` |
| `ground` | `1` |
| `block` | `2` |
| `column` | `3` |
| `halfBlock` | `4` |
| `ramp` | `5` |
| `ladder` | `6` |
| `tank` | `7` |
| `lowWall` | `8` |
| `todo3` | `9` |
| `barrier` | `10` |

## `Comm.Close`

Close codes for communication errors or states.

Defined at `src/shell/comm.js:335`.

| Key | Value |
|---|---|
| `gameNotFound` | `4000` |
| `gameFull` | `4001` |
| `badName` | `4002` |
| `mainMenu` | `4003` |
| `masterServerBusy` | `4004` |
| `masterServerOffline` | `4005` |
| `booted` | `4006` |
| `locked` | `4007` |

## `Comm.Worker`

Defined at `src/shell/comm.js:346`.

| Key | Value |
|---|---|
| `send` | `0` |
| `close` | `1` |
| `updateRoom` | `2` |
| `boot` | `3` |
| `closeAllWs` | `4` |
| `terminate` | `5` |
| `chat` | `6` |

## `Comm.Chat`

Defined at `src/shell/comm.js:356`.

| Key | Value |
|---|---|
| `user` | `0` |
| `cmd` | `1` |
| `blocked` | `2` |
| `whisper` | `3` |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
