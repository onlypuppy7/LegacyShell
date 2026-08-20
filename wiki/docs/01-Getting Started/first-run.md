# First Run

> **Audience:** Total newbies · **Prereqs:** [Installation](./installation.md)
>
> **Canonical source:** `src/scripts/perpetual.js`, `server-services/start-services.js`, `server-client/start-client.js`, `server-game/start-game.js`

## Starting everything

The simplest way to run LegacyShell is one command that starts all three servers at once:

```bash
npm run all
```

This runs the services, game, and client servers together in the background of one terminal. It's the right choice the first time you run LegacyShell, and fine for casual local use afterward. Once you want to actually watch each server's individual log output (recommended once you move past "does this work at all"), switch to running them in three separate terminals instead:

```bash
npm run services
npm run game
npm run client
```

(Order doesn't matter - each one waits for the others it needs.) Windows and macOS also have double-clickable launcher scripts at the repo root (`windows_start_all.bat`, `osx_start_all.command`, etc.) that do the same thing.

## What you'll see

The very first time any server starts, it loads every plugin in `plugins_default/` (about two dozen, bundled with LegacyShell) plus anything you've added to `plugins/`. **This first boot can take noticeably longer than later ones** - some bundled plugins declare their own npm dependencies (e.g. the `autoshopnotifications` plugin needs the `easy-table` package) which get installed automatically on first load if missing:

```
autoshopnotifications dependencies { 'easy-table': '^1.2.0' } true
[WARN] easy-table is not installed. Attempting to install (^1.2.0)...
added 4 packages, and audited 505 packages in 3s
```

This is normal and only happens once. When the services server finishes starting, you'll see a line like:

```
[SUCCESS] WebSocket server is running on ws://localhost:13371 in 4509ms
```

The game and client servers print their own similar "ready" messages once they've synced with services. Once all three say they're up, you're ready to play.

## Opening the game

Go to **[http://localhost:13370](http://localhost:13370)** in your browser (assuming you kept the default port from [Requirements](./requirements.md)/`store/config/client.yaml`).

You'll land on the normal Shell Shockers-style menu:

- A **Nickname** field (top of the play panel) - you can play as a guest without an account.
- A gamemode dropdown (Free For All, Teams, Timed variants, and LegacyShell's own extra modes like Scale Shift, Lifesteal, Apocalypse, and Parkour).
- **Create**/**Join** buttons for private games.
- A **▶ PLAY** button to jump into a public match.
- A **Login** button in the corner, which opens a combined login/register box with **Username** and **Password** fields and separate **Login**/**Register** buttons.

You can click **▶ PLAY** right away without an account to confirm everything works end to end. To create a persistent account (needed for stats, inventory, and eventually admin access), see [Making an Account](./making-an-account.md).

## Stopping the servers

If you used `npm run all` or the individual `npm run <role>` commands, `Ctrl+C` in that terminal stops them. On Unix-likes, `npm run cn` force-kills anything bound to ports 13370-13372 if a server didn't shut down cleanly (this doesn't work on Windows - use Task Manager, or the process list, to end any stuck `node` processes instead).

Next: [Config Files](./config-files.md) to understand what you can tweak, or jump straight to [Making an Account](./making-an-account.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
