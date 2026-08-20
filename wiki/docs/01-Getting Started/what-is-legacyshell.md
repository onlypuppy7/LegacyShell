# What is LegacyShell?

> **Audience:** Total newbies · **Prereqs:** None

LegacyShell is a from-scratch, open-source rebuild of the backend and browser client for **Shell Shockers** (shellshock.io), an egg-themed multiplayer shooter, preserved as it played at version 0.17.0 - plus a bunch of things the original never had (a commands system, new gamemodes, an in-game map editor, and a plugin system for adding your own features).

You can just play it in a browser like the original game. This section of the docs is for people who want to **run their own copy** - either to host a private server for friends, or to develop/mod it.

## The three servers

Unlike a simple website, LegacyShell is made of three separate programs that talk to each other over the network. You don't need to understand *how* they work yet - just what each one is responsible for:

| Server | What it does | Analogy |
|---|---|---|
| **Services** | Keeps the database - accounts, passwords, stats, inventories, which maps/items exist, which game servers are allowed to connect. | The "back office." There should only be one of these per LegacyShell deployment. |
| **Game** | Actually runs matches - physics, hit detection, keeping every player's screen in sync. | The "arena." You can run several of these (even in different countries) to spread out players. |
| **Client** | Serves the actual web page and game files your browser downloads when you visit the site. | The "storefront." You can run several of these too, as simple mirrors. |

When you play LegacyShell in a browser, your browser is talking to a **Client** server to download the game, then to a **Game** server once you actually join a match, and a **Game**/**Client** server is separately talking to a **Services** server behind the scenes for account and stats info.

## What you need to run all three yourself

For just trying LegacyShell out on your own computer, you run all three servers locally with one command (`npm run all` - covered in [First Run](./first-run.md)), and everything talks to `localhost`. You don't need three computers, three IP addresses, or anything like that to get started.

You *only* need to think about running them separately once you want to do something like add a second game-server region, or run a public instance where the client is mirrored across several machines - that's covered in [Running a Server](../02-Running%20a%20Server/).

## What you need before installing

Just three things, expanded on in [Requirements](./requirements.md):

- [Node.js](https://nodejs.org/)
- Git (technically optional, but strongly recommended)
- A terminal

Head to [Installation](./installation.md) next for the full walkthrough, or [Speed Setup](./speed-setup.md) if you already know your way around Node/git and just want the commands.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
