# Moderation

> **Audience:** Server operators · **Prereqs:** [Users and Ranks](./users-and-ranks.md)
>
> **Canonical source:** `src/shell/permissions.js`

Practical, day-to-day moderation - what commands actually exist, and what to reach for when something goes wrong in a room.

## Setting up moderators

Grant the **Moderator** rank (`10`) to trusted players via the database - see [Users and Ranks](./users-and-ranks.md#granting-a-rank):

```sql
UPDATE users SET adminRoles = 10 WHERE username = 'someone';
```

At Moderator rank or above, a player can use every command tagged `Moderator` in the [generated slash command reference](../05-Codebase%20Reference/Generated/slash-commands.md) - which is most of the built-in room-management surface: `boot`, `notify`, `enableCheats`, `limit`, `warpall`, `lock`, `rounds enable/length/skip`, `time day/night`, `weather rain/storm/snowstorm`, and every `change` command (gravity, speed, scale, etc. - see [Modifiers](../04-Plugin%20Development/modifiers.md) for exactly what each one does and how `@a`/`@t`/`@o` scoping works).

## The commands you'll actually use

The full list with exact permission tuples lives in the [generated slash command reference](../05-Codebase%20Reference/Generated/slash-commands.md) - these are the ones day-to-day moderation actually reaches for:

- **`/mod boot @player`** - disconnects a player from the current room. This is a kick, not a ban - see [Users and Ranks](./users-and-ranks.md#moderation-what-exists-and-what-doesn-t) for what that means in practice and what your real options are if you need something more permanent.
- **`/room notify <message>`** - broadcasts a message to everyone currently in the room, useful for warning a player before booting them, or announcing a rule.
- **`/room lock true`** - stops new players from joining the room (existing players are unaffected).
- **`/room enableCheats false`** - make sure this is off in any room you don't want the `change`-category commands (gravity, speed, etc.) usable at all, even by players who'd otherwise have permission.
- **`/admin announce <message>`** - Admin rank only; sets the homescreen announcement text server-wide, not scoped to one room. Use for site-wide notices (maintenance windows, etc.), not in-room moderation.

## Seeing who's in a room

There's no dedicated "who's online" admin panel - `/room info` (Guest rank, so any player can already run it) shows current room info, and the room's own player list is visible in the normal in-game UI. For anything beyond that (cross-room visibility, a server-wide player list), you'd be looking at either the [web SQL tool](./the-database.md#the-built-in-web-sql-tool) against live session data, or building it as a plugin - see [Plugin Development](../04-Plugin%20Development/) if you need this regularly.

## Public vs. private rooms change what's enforceable

Remember the permission-tuple rule from [Users and Ranks](./users-and-ranks.md#how-permission-checks-actually-work): in a **public** room, only the command's top-level `bypassRank` tier can use it at all - the private-room allowance never applies. This means a Moderator can `/mod boot` someone in any public room, but a *regular player's* private room already grants them elevated command access **within their own room** by design (that's the whole point of private rooms - `/change speed`, etc. are meant to be player-controlled fun there). Don't be surprised that a report of "someone was messing with gravity in their own private room" isn't actually a moderation issue - that's intended behavior, not a hole to close.

## Database-level moderation

For anything the command system doesn't cover - editing a player's stats, resetting their inventory, actually removing their access - see [The Database](./the-database.md) directly, or its [web SQL tool](./the-database.md#the-built-in-web-sql-tool) if you don't have filesystem access to the services machine. The web tool's template dropdown includes several ready-made queries for exactly this (`[users] Set User Admin Role`, `[users] Update User Username`, `[users] Delete User by Account ID`, etc.).

## Common Issues

**A command says "Insufficient permissions" even though I just granted the rank.** The player needs to actually re-log (or at least have their session refresh) for a database-level `adminRoles` change to take effect - it's read at login/session-resolution time, not polled live.

**I booted someone and they immediately rejoined.** Expected - `boot` is a kick, not a ban. See [Users and Ranks](./users-and-ranks.md#moderation-what-exists-and-what-doesn-t) for real options if this is a recurring problem with one player.

Next: [Closed Mode](./closed-mode.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
