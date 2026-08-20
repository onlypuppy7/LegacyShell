# Requirements

> **Audience:** Total newbies · **Prereqs:** [What is LegacyShell?](./what-is-legacyshell.md)
>
> **Canonical source:** [package.json](https://github.com/onlypuppy7/LegacyShell/blob/main/package.json), root [README.md](https://github.com/onlypuppy7/LegacyShell/blob/main/README.md)

## Node.js

LegacyShell is a Node.js project - you need Node installed to run any of it. There's no strict minimum version pinned in the project itself, but these versions are known to work in practice (from the project maintainer's own machines):

| Node version | OS |
|---|---|
| v18.19.0 | Raspberry Pi (Debian) |
| v20.11.1 | Windows 11 |
| v20.18.1 | macOS (M4) |
| v20.19.2 | macOS (M2 Pro) |

If you don't have Node yet, grab the current **LTS** release from [nodejs.org](https://nodejs.org/) - anything in the v18-v20 range should be safe. Check what you have with:

```bash
node --version
npm --version
```

Bun is also supported as an alternative runtime (`binit`/`bclient`/`bservices`/`bgame` npm scripts exist for it), but it isn't officially supported the way Node is - stick with Node unless you specifically know why you want Bun.

## Git

Not strictly required - you can download the repository as a `.zip` from GitHub instead - but strongly recommended, because:

- It's the easiest way to pull updates later.
- Individual plugins in `plugins_default/` and `plugins/` are each their own git repository and auto-update themselves via `git pull` when the server starts. Without git installed, plugin auto-update silently does nothing (it's non-fatal, just skipped).

Get it from [git-scm.com](https://git-scm.com/) if you don't have it.

::: tip Windows: enable long paths
This repository's wiki contains some files with very long names (video-title-style filenames from imported history pages). Windows' default 260-character path limit can make `git clone` fail partway through with `Filename too long` errors. Fix it once, globally, before cloning:

```bash
git config --global core.longpaths true
```
:::

## A terminal

Any of these work fine:

- **Windows**: PowerShell, Command Prompt, or [Git Bash](https://git-scm.com/downloads) (installed alongside Git).
- **macOS**: Terminal.app, iTerm2.
- **Linux**: whatever your distro ships with.

If you've never used a terminal before: it's the black window where you type commands instead of clicking things. Every command in these docs is meant to be typed there, one at a time.

## Disk space and hardware

Nothing demanding - a few hundred MB for the repository plus `node_modules` after `npm install`. Running the game server for a handful of players doesn't need much CPU or RAM; the actual physics simulation is lightweight per-room.

## Optional but useful

- **A SQLite browser** (e.g. [DB Browser for SQLite](https://sqlitebrowser.org/)) - you'll want this once you get to [The Database](../02-Running%20a%20Server/the-database.md) for things like granting yourself admin.

Next: [Installation](./installation.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
