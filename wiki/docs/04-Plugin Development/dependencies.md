# Dependencies

> **Audience:** Plugin authors · **Prereqs:** [Lifecycle](./lifecycle.md)
>
> **Canonical source:** `src/shell/plugins.js` (`PluginManager.preloadPlugin`), `plugins_samples/sample2dependency/`

If your plugin needs an npm package, or needs another plugin to also be installed, declare it in an optional `dependencies.js` file rather than assuming it'll just be there.

## The file

```js
// plugins/yourplugin/dependencies.js
export const dependencies = {
    "is-thirteen": "^2.0.0",
};
```

One export, `dependencies`, an object mapping a dependency name to a version string. There are two kinds of entry, distinguished entirely by the version value:

## npm package dependencies

Any version string other than the literal word `"plugin"` is treated as an npm package + semver range:

```js
export const dependencies = {
    "is-thirteen": "^2.0.0",
    "terser": "^5.36.0",
};
```

At load time, LegacyShell tries `require.resolve(dependency)` first - if it's already installed (from your project's own `node_modules`, or a previous auto-install), nothing happens. If that fails, it runs:

```bash
npm install <dependency>@<version> --no-save
```

automatically, before your plugin's constructor ever runs. `--no-save` means this doesn't touch the project's own `package.json`/`package-lock.json` - it's a runtime convenience install, not a real dependency declaration from the host project's point of view. This is genuinely automatic and can add real time to a first boot (see [Troubleshooting](../01-Getting%20Started/troubleshooting.md#plugin-fails-to-load-auto-installs-a-dependency-you-didn-t-expect) for what this looks like in practice) - don't be surprised if a plugin with a heavy dependency makes the very first server start noticeably slower.

## Plugin-to-plugin dependencies

Use the literal string `"plugin"` as the version to require another plugin be installed:

```js
export const dependencies = {
    "legacysettings": "plugin",
    "legacythemes": "plugin",
};
```

The key must exactly match the **folder name** of the required plugin (not necessarily its `PluginMeta.identifier`, though in practice this codebase's plugins keep those the same). At load time, this is checked against the full list of every plugin folder found in `plugins_default/` and `plugins/` combined. If a required plugin isn't present, **your plugin fails to load entirely** - not a partial/degraded load, it's dropped from the plugin list completely, with an error explaining what's missing and where to put it.

This is a real, common pattern in this codebase - `legacyshellcore` alone depends on seven other plugins (`modernmapblocks`, `modernshellguns`, `modernshellhats`, `modernshellstamps`, `legacyanalytics`, `healthpackitem`, `legacysettings`), and several client-facing plugins (`fancygraphics`, `timemachine`, `whatsapptheme`) all declare `legacysettings` and `legacythemes` as dependencies since they build on settings those plugins define.

::: tip This only checks presence, not load order
A `"plugin"` dependency confirms the *folder exists* - it does not guarantee the dependency has already finished its own setup by the time your constructor runs. If you need actual ordering (not just presence), see the number-prefix trick in [Lifecycle](./lifecycle.md#load-order-and-why-some-plugins-have-number-prefixed-identifiers).
:::

## A complete example

`plugins_samples/sample2dependency/` is the canonical minimal example - structurally identical to `sample1cmd` (see [Quickstart](./quickstart.md)), with one added file:

```js
// dependencies.js
export const dependencies = {
    "is-thirteen": "^2.0.0",
};
```

```js
// index.js
import { samplePlugin2 } from './samplecommand.js';

export const PluginMeta = {
    identifier: "sample2dependency",
    name: '"Essential" Sample Plugin',
    author: 'onlypuppy7',
    version: '1.0.0',
    descriptionShort: 'Very important (real)',
    descriptionLong: 'Very important (real)',
    legacyShellVersion: 269,
};

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        this.plugins.on('client:pluginSourceInsertion', this.pluginSourceInsertion.bind(this));
        samplePlugin2.registerListeners(this.plugins);
    };

    pluginSourceInsertion(data) {
        data.pluginInsertion.files.push({
            insertBefore: '\nconsole.log("inserting before... (sample2 plugin)");',
            filepath: path.join(this.thisDir, 'samplecommand.js'),
            insertAfter: '\nconsole.log("inserting after... (sample2 plugin)!");',
            position: 'before'
        });
    };
};
```

The `is-thirteen` package gets used inside `samplecommand.js` - the point of this sample is showing that a normal npm import works fine inside a plugin once declared, nothing special needed at the call site.

## Common Issues

**My plugin dependency isn't found even though the folder is definitely there.** Check the dependency key matches the folder name *exactly*, including case - `preloadPlugin` compares against `this.pluginsList` (raw directory names), so a mismatch of even one character fails silently with the "not found" error rather than a typo warning.

**npm auto-install is slow / I don't want it happening at runtime.** There's no built-in way to opt out - if you don't want a runtime `npm install`, add the package to the main project's own `package.json` yourself so `require.resolve` succeeds immediately and the auto-install path never triggers.

Next: [Events (concept)](./events-concept.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
