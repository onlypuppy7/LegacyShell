# Making an Account

> **Audience:** Total newbies · **Prereqs:** [First Run](./first-run.md)
>
> **Canonical source:** `server-services/src/data_management/accountManagement.js`

Playing as a guest works fine, but an account is what gets you persistent stats, an inventory, and the ability to be granted admin.

## Registering

1. Open the game at `http://localhost:13370` and click **Login** in the corner.
2. In the box that opens, fill in:
   - **Username** - 3 to 20 characters, letters/numbers/underscores/hyphens only.
   - **Password** - at least 8 characters.
3. Click **Register** (not **Login** - that's for existing accounts).

Behind the scenes, your password is hashed client-side and then re-hashed server-side with `bcrypt` before it's ever written to disk (the cost factor is tunable in `store/config/services.yaml`'s `password_cost_factor` - see [`npm run bcrypt`](../02-Running%20a%20Server/the-database.md) if you ever want to retune it). Your plaintext password is never stored anywhere.

A new account starts with a default loadout and a starting egg balance, defined by the `users` table's schema - see [The Database](../02-Running%20a%20Server/the-database.md) if you're curious about the exact defaults.

## Granting yourself admin

New accounts start as a **Guest**-level user with no special permissions - registering doesn't make you an admin. To get admin (or moderator, or any other rank) on your own local server, you edit the database directly:

```sql
UPDATE users SET adminRoles = 255 WHERE username = 'your_username';
```

`255` is the **Superuser** rank - the highest level. This is a deliberately manual, DB-level step (there's no in-game "make me admin" button, for obvious reasons) - full details on opening the database, the rank levels, and what each one can do are in [Users and Ranks](../02-Running%20a%20Server/users-and-ranks.md), the next logical page once you're past pure setup.

## Common Issues

**Registration silently does nothing.** Check the services server's terminal for a `validateRegisterFail` log line - it'll say why (username taken, doesn't meet the length/character rules above, etc).

**Can't log back in after registering.** Password fields are case-sensitive; there's no "forgot password" flow in the base game - if you've truly lost it, an admin has to reset it directly in the database (`accountManagement.js` exposes the hashing logic if you're doing this via a plugin or script; doing it by hand means generating a new bcrypt hash and writing it into the `password` column - don't just paste a plaintext password into that column).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
