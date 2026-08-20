# Speed Setup

> **Audience:** Anyone who already knows their way around Node/git and just wants this running · **Prereqs:** None

The whole thing, four commands. Every one of them is explained in far more depth on the pages that follow this one - come back to those if something here doesn't make sense, doesn't match what you see, or goes wrong.

```bash
git clone https://github.com/onlypuppy7/LegacyShell.git && cd LegacyShell
```

Windows: if this fails partway through with `Filename too long`, run `git config --global core.longpaths true` and try again - see [Requirements](./requirements.md#git).

```bash
npm install
```

A wall of deprecation warnings and an `npm audit` vulnerability count is normal - not a sign anything's wrong. Details: [Installation](./installation.md#_3-install-dependencies).

```bash
npm run init -- -y
```

Required, one-time. Normally interactive (it asks three yes/no questions), but `-y` auto-answers all three with the right call for "everything on one machine" - drop it if you'd rather answer them yourself. Details: [Installation](./installation.md#_4-run-the-setup-wizard).

```bash
npm run all
```

Starts all three servers in one terminal. The very first boot is slower than later ones (some bundled plugins install their own npm dependencies on first load). Once you see `WebSocket server is running on ws://localhost:13371`, open **[http://localhost:13370](http://localhost:13370)**.

That's it - you're playing. `Ctrl+C` stops everything.

## If you want more than "it's running"

| You want to... | Go to |
|---|---|
| Understand what those three servers actually are | [What is LegacyShell?](./what-is-legacyshell.md) |
| Know exactly what each `npm run init` question does, or run a mirror/extra-region setup instead of "everything on one machine" | [Installation](./installation.md) |
| See what a healthy first boot actually looks like, or what the in-game menu offers | [First Run](./first-run.md) |
| Change ports, logging, or any other setting | [Config Files](./config-files.md) |
| Create a real account and grant yourself admin | [Making an Account](./making-an-account.md) |
| Something above didn't go as described | [Troubleshooting](./troubleshooting.md) |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
