# LegacyShell Documentation

Technical documentation for LegacyShell itself - not lore or trivia about Shell Shockers (that's in the [Wiki](../wiki/) section), but how to install it, run it, extend it, and understand how it works.

This section is organized by **who you are and what you're trying to do**, not by topic. Pick the row that matches you:

| I want to... | Start here |
|---|---|
| Just get the game running for the first time | [Getting Started](./01-Getting%20Started/) |
| Operate a server - accounts, moderation, multiple regions, staying online | [Running a Server](./02-Running%20a%20Server/) |
| Make maps, models, skins, or sounds - no coding | [Content Creation](./03-Content%20Creation/) |
| Write a plugin - new commands, gamemodes, weapons, anticheat | [Plugin Development](./04-Plugin%20Development/) |
| Understand or change the engine itself | [Codebase Reference](./05-Codebase%20Reference/) |
| Write documentation, or I'm an AI agent orienting myself in this repo | [Contributing](./06-Contributing/) |

Each section assumes you've read the ones above it in this table, but not the ones below - stop wherever your goal is met.

## A note on how this documentation is built

Reference-heavy pages (the plugin event catalog, database schema, config keys, wire protocol opcodes) are extracted directly from the source code rather than written by hand, so they can't silently go stale as the code changes. Everything else is written prose, aimed at the specific reader named at the top of each page. See the [style guide](./06-Contributing/docs-style-guide.md) for the conventions behind both.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
