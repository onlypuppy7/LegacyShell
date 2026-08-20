# Troubleshooting (Getting Started)

> **Audience:** Total newbies · **Prereqs:** [Installation](./installation.md), [First Run](./first-run.md)

Problems specific to first-time setup. For issues once you're actually operating a server day to day, see [Running a Server troubleshooting](../02-Running%20a%20Server/troubleshooting.md) instead.

## `git clone` fails with "Filename too long" (Windows)

```
error: unable to create file wiki/wiki/History/Shellshock.io Gameplay (100 Kill Streak!!!)... Filename too long
fatal: unable to checkout working tree
```

Windows limits file paths to 260 characters by default, and a few of this repo's wiki history pages exceed that once combined with a typical clone path. Enable long-path support in git, then re-clone:

```bash
git config --global core.longpaths true
```

If you already have a partially-checked-out folder from a failed clone, delete it first and clone again from scratch - a partial clone can't just be "resumed."

## `Please run 'npm run init' first`

```
Perpetual config file not found at .../store/config/perpetual_all.yaml. Please run 'npm run init' first.
```

You'll see this if you try `npm run all`/`client`/`services`/`game` before running the setup wizard. It's not a bug - every server genuinely refuses to start without `store/config/` existing. Go back to [Installation](./installation.md) step 4.

## `npm install` fails building `canvas` or `sharp`

Both packages compile native code and occasionally need system libraries that aren't present by default, particularly on Linux. If you hit build errors mentioning `canvas`, `node-gyp`, or similar, the project's own README documents this fix for Debian/Ubuntu-based systems:

```bash
sudo apt-get update
sudo apt-get install -y libcairo2-dev libjpeg-dev libpango1.0-dev libgif-dev build-essential g++ pkg-config
sudo apt-get install libpixman-1-dev
npm install
```

This wasn't something we personally had to reproduce while validating these docs (a plain Windows `npm install` completed with no native build errors at all - see [Installation](./installation.md)), so if the fix above doesn't resolve it for your specific distro, search the exact error message from `node-gyp` - it'll usually name the missing header directly.

## A port is already in use

```
Error: listen EADDRINUSE: address already in use :::13371
```

Something is already bound to that port - most often, a previous LegacyShell process that didn't shut down cleanly (a crashed terminal, a background job you forgot about). On Unix-likes, `npm run cn` kills anything bound to ports 13370-13372 in one shot. On Windows, that script doesn't work (it depends on `lsof`) - find and end the process manually:

```powershell
Get-NetTCPConnection -LocalPort 13370,13371,13372 -State Listen | Select-Object LocalPort, OwningProcess
```

Then end the listed process ID(s) via Task Manager, or `Stop-Process -Id <pid>`. Double-check what a process actually is before killing it if you're not sure it's yours - on a shared or previously-used machine, don't assume every hit on these ports is your own leftover process.

## Blank page / stuck loading at `localhost:13370`

A few likely causes, roughly in order of likelihood:

1. **The client server hasn't finished its first-run build yet.** The very first time it starts, it has to build the browser bundle and the wiki - watch its terminal for errors rather than just refreshing the browser.
2. **The client can't reach the services server.** Check `store/config/client.yaml`'s `sync_server` matches where your services server is actually listening, and that the services server is actually running.
3. **WebGL isn't available in your browser.** The in-game FAQ (linked from the bottom of the page) has per-browser instructions for enabling it - this is inherited from the original Shell Shockers and isn't LegacyShell-specific.
4. **Browser console has an actual JS error.** Open dev tools (F12) and check the console - if `devlogs: true` is set in `store/config/all.yaml`, you'll get much more detail here.

## Plugin fails to load / auto-installs a dependency you didn't expect

Normal on first boot - see [First Run](./first-run.md#what-you-ll-see). Some bundled plugins declare their own npm dependencies and install them automatically the first time they load. If a plugin fails to load entirely with a message about a missing **plugin** dependency (not an npm package), it means another plugin it depends on isn't installed or its folder was renamed - check the failing plugin's `dependencies.js`.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
