# Installation

> **Audience:** Total newbies · **Prereqs:** [Requirements](./requirements.md)
>
> **Canonical source:** `src/scripts/init.js`

This walks through getting LegacyShell from "nothing on your computer" to "fully configured, ready to start." Every command here was actually run against a clean clone while writing this page - not just copied from memory.

## 1. Clone the repository

```bash
git clone https://github.com/onlypuppy7/LegacyShell.git
```

::: warning Windows users
If you skipped the "enable long paths" step in [Requirements](./requirements.md), do it now - otherwise this clone can fail partway through with errors like:

```
error: unable to create file wiki/wiki/History/... Filename too long
fatal: unable to checkout working tree
```

Fix:
```bash
git config --global core.longpaths true
```
Then delete the partial folder and clone again. See [Troubleshooting](./troubleshooting.md#git-clone-fails-with-filename-too-long-windows) if you hit this after already having files in place.
:::

## 2. Move into the folder

```bash
cd LegacyShell
```

Everything from here on assumes your terminal is inside this folder (the one containing `package.json`).

## 3. Install dependencies

```bash
npm install
```

This downloads everything LegacyShell needs (Express, SQLite, Babylon.js, VuePress for the wiki, etc.) into a `node_modules` folder. On a clean install this takes well under a minute and pulls in around 500 packages.

You'll very likely see a wall of deprecation warnings and an `npm audit` summary reporting dozens of vulnerabilities - **this is normal and expected** for a project with this dependency tree; it's not a sign something went wrong. Don't run `npm audit fix --force` to "clean it up" - that can silently bump dependencies to incompatible major versions.

If this step fails outright (not just warnings), see [Troubleshooting](./troubleshooting.md).

## 4. Run the setup wizard

```bash
npm run init
```

This is a required, one-time interactive step - every LegacyShell server refuses to start without it having been run first. It will:

::: tip Want it fully unattended?
`npm run init -- -y` (or `node src/scripts/init.js -y` directly) auto-answers all three questions below with `y` - the right call if you're running everything on one machine, same as the recommended answers in the table below. Skip straight to step 5 if you use this.
:::

1. Create an empty `plugins/` folder (for your own third-party plugins).
2. Copy every template config file from `src/defaultconfig/*.yaml` into a new `store/config/` folder.
3. Ask two yes/no questions.
4. Optionally set up a local SQLite database and register your machine as an authorized game server.

It looks like this (real output from a clean run):

```
##################################################################
# Note: make sure you have run 'npm install' before this script! #
##################################################################

Copied all.yaml to config folder.
Copied distributed_all.yaml to config folder.
Copied distributed_client.yaml to config folder.
Copied client.yaml to config folder.
Copied distributed_permissions.yaml to config folder.
Copied game.yaml to config folder.
Copied perpetual_all.yaml to config folder.
Copied services.yaml to config folder.

Enable verbose logging?
(y/n): y
Verbose logging enabled.

Enable dev logging (appears in browser logs)?
(y/n): y
Devlogs enabled.

If just you wish to run LegacyShell on your one machine, select yes. If you
otherwise want to act as a mirror/extra region/other standalone component,
select no.

Add the game server as an authed server?
(y/n): y
Game server added as an authed server.
Updated game.yaml with auth_key: <a randomly generated key>

LegacyShell has been set up for use!
```

**What to answer, as a beginner running everything on one machine:**

| Question | Recommended answer | Why |
|---|---|---|
| Enable verbose logging? | `y` | More console output while you're learning what's going on. You can turn it off later by editing `store/config/all.yaml`. |
| Enable dev logging? | `y` for now | Adds extra logs visible in the browser console too - handy while getting familiar with the game, safe to disable later. |
| Add the game server as an authed server? | `y` | You're running everything locally, so your one game server needs to be authorized against your one services server. Say `n` only if you're specifically setting up an extra region/mirror against a services server that already exists elsewhere - see [Adding Game Servers](../02-Running%20a%20Server/adding-game-servers.md). |

If you answer `y` to the last question, it creates `server-services/store/LegacyShellData.db` (your account/data database - see [The Database](../02-Running%20a%20Server/the-database.md)) and automatically fills in the `auth_key` placeholder in `store/config/game.yaml`.

## 5. You're set up

You now have a `store/config/` folder with your settings and (if you said yes above) a working database. Move on to [First Run](./first-run.md) to actually start the game.

## Reference: what init created

```
store/
  config/
    all.yaml
    client.yaml
    distributed_all.yaml
    distributed_client.yaml
    distributed_permissions.yaml
    game.yaml
    perpetual_all.yaml
    services.yaml
plugins/                              (empty, for your own plugins)
server-services/
  store/
    LegacyShellData.db                (only if you said yes to the last question)
```

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
