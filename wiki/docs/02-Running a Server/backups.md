# Backups

> **Audience:** Server operators · **Prereqs:** [The Database](./the-database.md)
>
> **Canonical source:** `server-services/src/data_management/backups.js`

Services backs up its own SQLite database automatically - no separate tooling needed, but worth understanding exactly what it does and doesn't protect against.

## How it works

`createBackup()` runs once at services boot, and then on the interval set by `store/config/services.yaml`'s `backups.interval` (in hours, default `4`). Each run:

1. Checks the most recently modified file already in the backup folder. If it's younger than `backups.interval` hours old, the run is skipped entirely (logged as "Backup already exists for this time") - this makes the interval a *minimum spacing*, not a guaranteed schedule; if services restarts frequently, you won't get a flood of near-duplicate backups.
2. Otherwise, does a raw file copy of the live database (`fs.readFileSync` → `fs.writeFileSync`) to a timestamped filename: `LegacyShellDataBackup-<YYYY-MM-DD>_<HH-MM-SS>.db`.
3. Prunes the oldest backups beyond `backups.keep` (default `50`), sorted by file modification time.

## Where backups go

`store/backups/` by default, or wherever `backups.filepath` in `services.yaml` points if set. See the [generated config reference](../05-Codebase%20Reference/Generated/config-reference.md#services-yaml) for the exact keys.

## What this does and doesn't protect against

Because it's a raw file copy (not SQLite's own online-backup API), it's a straightforward snapshot - fine for the common failure modes (accidental bad `UPDATE`/`DELETE`, a corrupted upgrade, wanting to roll back after testing something on your live database). It is **not** protection against the backup folder itself being lost - `store/backups/` lives on the same disk as the live database by default, so a full disk failure takes both. If that matters to you, point `backups.filepath` somewhere off-machine (a mounted network drive, a synced folder) or add your own off-box copy of that directory on top of this.

It's also not a *replacement* for stopping services before a risky manual edit - see the warning in [The Database](./the-database.md#opening-it). A backup lets you recover from a mistake; it doesn't prevent one from corrupting data mid-write.

## Restoring a backup

Stop the services server, then replace the live database file with a backup:

```bash
cp store/backups/LegacyShellDataBackup-2026-08-15_04-00-00.db server-services/store/LegacyShellData.db
```

(Adjust paths to match your actual `backups.filepath` and DB location.) Restart services once the file is replaced. There's no in-app restore flow - it's a plain file swap.

## Common Issues

**Backups aren't being created.** Check `backups.enabled` is `true` in `services.yaml`, and check the services server's own log output at boot and on each interval tick - a permissions issue on the backup folder logs an error there rather than failing silently.

**The backup folder is growing larger than expected.** `backups.keep` only limits *count*, not total size - 50 backups of a large, heavily-populated database (many users, items, maps) can add up. Lower `backups.keep` or move to a `filepath` with more room if this becomes an issue.

Next: [Rate Limiting](./rate-limiting.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
