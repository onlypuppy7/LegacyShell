# Users and Ranks

> **Audience:** Server operators · **Prereqs:** [The Database](./the-database.md)
>
> **Canonical source:** `server-services/src/data_management/recordsManagement.js` (`users` schema), `src/shell/permissions.js` (`PermissionsConstructor`), `src/defaultconfig/distributed_permissions.yaml`

## The rank system

Every account has an `adminRoles` integer column in the `users` table (default `0`). That number is compared against named rank levels defined in `store/config/distributed_permissions.yaml`:

| Level | Rank name | Notes |
|---|---|---|
| `0` | Guest | Default for every new account. *(marked "do not modify" in the config)* |
| `1` | Signed In | *(marked "do not modify" in the config)* |
| `5` | Content Creator | A middle rank, free for you to repurpose. |
| `10` | Moderator | *(marked "do not modify" in the config)* |
| `20` | Admin | *(marked "do not modify" in the config)* |
| `255` | Superuser | The highest level. *(marked "do not modify" in the config)* |

The gaps between these numbers (2-4, 6-9, 11-19, 21-254) are intentionally left open in the default config for you to insert your own custom ranks between the built-in ones, without renumbering anything that already exists. The five "do not modify" ranks are load-bearing - several built-in commands are hardcoded to specific ones of them (e.g. the `announce` command requires `Admin`).

## Granting a rank

Directly in the database (see [The Database](./the-database.md) for how to open it):

```sql
UPDATE users SET adminRoles = 255 WHERE username = 'someuser';
```

Use whichever numeric level fits - `10` for Moderator, `20` for Admin, `255` for Superuser (or a custom in-between value you've defined). There's no in-game UI for this; it's an intentionally manual, database-level action.

## How permission checks actually work

Every slash command (see the full list once you're in [Plugin Development](../04-Plugin%20Development/commands.md)) is registered with a **permission tuple**: `[bypassRank, privateRoomRank, requireGameOwnerInPrivate]`.

- **`bypassRank`** - a player at or above this rank can always use the command, anywhere.
- **`privateRoomRank`** - in a *private* room, a player at or above this (lower) rank can also use it...
- **`requireGameOwnerInPrivate`** - ...but only if this is `true` **and** they're also the room's owner (the player who created it), or if this is `false`, rank alone is enough even without being the owner.

In **public** rooms, only the `bypassRank` tier can use the command at all - the private-room allowance never applies there. This is why, for example, a regular player can use gameplay-tweak commands (gravity, speed, etc.) in their own private room, but not in a public game.

## Moderation: what exists, and what doesn't

LegacyShell ships one built-in moderation command: **`boot`** (Moderator rank or above), which disconnects a player from the current room. That's a **kick, not a ban** - there's no persistent, built-in mechanism that stops a booted player from simply reconnecting.

If you need actual bans, you have a few real options, none of them built in:

- Revoke/rename the offending account directly in the `users` table (breaks their login, doesn't stop a new account).
- Block their IP at the network/reverse-proxy level in front of your client and game servers (outside the scope of LegacyShell itself).
- Write a plugin that checks a ban list on `game:joinPlayer` and disconnects/rejects matching players - see [Plugin Development](../04-Plugin%20Development/) once you're ready; this is exactly the kind of thing the "could this be a plugin?" philosophy expects you to build rather than have LegacyShell dictate one specific ban system.

Next: [Adding Game Servers](./adding-game-servers.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
