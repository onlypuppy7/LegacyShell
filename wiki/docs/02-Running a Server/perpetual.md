# Perpetual

> **Audience:** Server operators · **Prereqs:** [Architecture Overview](./architecture-overview.md)
>
> **Canonical source:** `src/scripts/perpetual.js` (LegacyShell's thin wrapper), `node_modules/puppyperpetual/src/` (the actual process manager)

Every `npm run client`/`services`/`game` command runs through **Perpetual** - a process-supervisor wrapper that keeps a server alive unattended: auto-restart on crash, a daily restart schedule, automatic `git pull`, and optional Discord webhook alerts. `src/scripts/perpetual.js` is a ~20-line LegacyShell-side wrapper; nearly all the actual logic lives in the `puppyperpetual` npm package (also maintained by the LegacyShell author).

## What actually runs

`npm run game` resolves to `node src/scripts/perpetual.js --game`, which reads `store/config/perpetual_all.yaml` and then runs the *real* command underneath it - `node server-game/run-game.js --perpetual`. The `--perpetual` flag is what makes `misc.instantiateSS` set `ss.isPerpetual = true`, which is how a server knows to `process.exit(1337)` (rather than just erroring) when it wants Perpetual to restart it intentionally - see [Architecture Overview](./architecture-overview.md#how-they-find-each-other).

## Config: `store/config/perpetual_all.yaml`

See the [generated config reference](../05-Codebase%20Reference/Generated/config-reference.md#perpetual-all-yaml) for the exhaustive key list. The shape, per server role (`client`, `services`, `game`):

```yaml
pullers: ["services", "client", "game"]

client:
  process_cmd: "server-client/run-client.js"
  dailyrestart_enable: true
  dailyrestart_time: "4:00"
  dailyrestart_quickpull: false
  logfile_enable: true
  webhook_url: ""
  webhook_username: "LegacyShell: Client Server"
  webhook_avatar: "https://cdn.onlypuppy7.org/legacyshell/client.png"
  webhook_ping_user: ""
  webhook_ping_role: ""
# ...services, game blocks follow the same shape
```

## Auto-restart on crash

If the wrapped process exits, Perpetual restarts it - after **5 seconds** normally, or **1 second** if the exit was intentional (exit code `1337`, or a manual `SIGINT`). "Intentional" restarts also skip the Discord ping (see below) - the distinction exists specifically so a services-triggered restart-to-sync (see [Architecture Overview](./architecture-overview.md)) doesn't spam your webhook the way an actual crash should.

## Scheduled daily restart

If `dailyrestart_enable` is true, Perpetual computes the time until the next occurrence of `dailyrestart_time` (`"HH:MM"`, 24-hour, and it *can* be an array of multiple times per day, though none of the shipped defaults use more than one) and restarts the process at that time, rescheduling itself afterward. If `dailyrestart_quickpull` is also true, it runs a `git pull` immediately before that restart.

## Git auto-pull and restart-on-update

Independent of the daily schedule, Perpetual checks every **60 seconds**:
- If this server is listed in the top-level `pullers` array, it runs `git pull`.
- Either way, it re-checks the current git commit hash (`git rev-parse HEAD`). If the hash has changed since the last check **and** `restart_on_update` isn't explicitly disabled (it defaults to `true`), it restarts the wrapped process.

This is why the root README's advice is "if you're running all three on one machine, only `services` needs to be a puller" - `services` pulling and restarting is what triggers the *other* two servers to notice (via their own `requestConfig` polling) and self-restart to match, so having every role independently `git pull` is redundant, not wrong, just unnecessary.

## Discord webhook alerts

Set `webhook_url` to a Discord webhook URL to get a message on every **unintentional** restart (crash, not a scheduled/intended one), optionally pinging `webhook_ping_user`/`webhook_ping_role` (raw Discord user/role IDs - the config comments note this can flood a channel, so use it deliberately, not by default). All process stdout/stderr is also mirrored to the webhook, not just restart notices - the config's `logfile_enable` controls file logging (`store/logs/<role>/<timestamp>.log`) separately from webhook logging.

## Interactive commands

While a Perpetual-wrapped process is running in its own terminal, you can type commands directly into that terminal (not into the game - into the terminal window itself) to control it without stopping/restarting the wrapper:

| Command | Effect |
|---|---|
| `r` or `restart` | Intentionally restart the wrapped process now. |
| `p` or `pull` | Run `git pull` immediately, without restarting. |
| `pr` | Pull, then restart 5 seconds later. |

This only works when running a server directly in a terminal you have open (`npm run game`, etc.) - it doesn't apply to a server running detached/backgrounded where you can't type into its stdin.

## Common Issues

**A server keeps restarting in a loop.** Check `store/logs/<role>/` for the actual crash reason - Perpetual will faithfully keep restarting a server that's crashing on startup (a config error, a missing dependency) every 5 seconds forever, which looks like nothing is happening but is actually a crash loop. `Ctrl+C` twice quickly (or close the terminal) to stop it if you need to intervene.

**I don't want a server to auto-restart on schedule.** Set `dailyrestart_enable: false` for that role in `perpetual_all.yaml`.

Next: [Backups](./backups.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
