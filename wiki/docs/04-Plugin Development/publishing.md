# Publishing

> **Audience:** Plugin authors · **Prereqs:** [Anatomy](./anatomy.md), [Lifecycle](./lifecycle.md)
>
> **Canonical source:** `src/shell/plugins.js` (`preloadPlugin`'s git-pull logic)

Sharing a plugin with other LegacyShell operators, and keeping it updated for them, is built directly on git - no separate package registry or plugin store.

## Make your plugin folder its own git repository

```bash
cd plugins/yourplugin
git init
git add .
git commit -m "Initial commit"
git remote add origin <your repo url>
git push -u origin main
```

That's the entire "publishing" step. LegacyShell doesn't require anything special beyond a normal git repository - no manifest to submit anywhere, no build step, no approval process.

## Installing it (what your users will do)

Anyone wanting your plugin clones it directly into their own `plugins/` folder:

```bash
cd plugins
git clone <your repo url> yourplugin
```

The folder name they clone it into becomes the plugin's directory name on their system - doesn't have to match your repo's name, though matching it avoids confusion.

## Auto-update is already built in

Once a plugin folder is a git repository, [Lifecycle](./lifecycle.md#git-auto-pull-on-every-load) covers what happens next: every time the server hosting it restarts, LegacyShell runs `git pull` on that folder automatically. Pushing a new commit to your plugin's repo is the entire update mechanism from the plugin author's side - there's nothing else to do, and nothing your users need to do beyond restarting their server (which they're often already doing regularly if they're running [Perpetual](../02-Running%20a%20Server/perpetual.md)'s scheduled restarts).

Keep this in mind when developing: **don't push broken/incomplete commits to a branch your users are tracking** - the next restart on their end pulls whatever's currently on that branch, with no review step in between.

## Versioning

Bump `PluginMeta.version` yourself, on whatever scheme you like (semver is the convention every existing plugin uses) - nothing in LegacyShell enforces or reads this beyond displaying it in boot logs and in-game listings. `legacyShellVersion` is a separate, informational field - the LegacyShell build number (from `/versionEnum.txt`) your plugin was last verified against, shown to help a user judge compatibility before installing, but not itself checked or enforced anywhere in the loader.

## Declaring dependencies for others

If your plugin needs npm packages or other plugins to function, see [Dependencies](./dependencies.md) - `dependencies.js` is what makes your plugin installable without the user having to manually chase down what it needs first.

## Listing it publicly

The wiki's [List of Plugins](../../plugins/listofplugins.md) page is the community index of known LegacyShell plugins - it's just a markdown table, edited via a normal PR to the LegacyShell repository (see [Contributing](../06-Contributing/)). Include your plugin's identifier, author, a short category/description, and either a link to its own documentation page (if you've written one under `/wiki/plugins/Plugin Docs/`) or its install/repo location.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
