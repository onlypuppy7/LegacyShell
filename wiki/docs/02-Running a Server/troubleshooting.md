# Troubleshooting (Running a Server)

> **Audience:** Server operators · **Prereqs:** [Architecture Overview](./architecture-overview.md)

Operational problems once you're past initial setup - for first-install issues, see [Getting Started troubleshooting](../01-Getting%20Started/troubleshooting.md) instead.

## Game or client server can't reach services

Both poll services on startup via `requestConfig` (see [Architecture Overview](./architecture-overview.md#how-they-find-each-other)) and will boot using cached `store/{maps,items,servers}.json` if services is briefly unreachable - so a short services outage doesn't immediately take everything else down. Check:

- Is services actually running, and listening on the port `game.yaml`'s `services_server` / `client.yaml`'s `sync_server` actually points at?
- If services is behind a reverse proxy, is the WebSocket upgrade actually being forwarded? See [Deployment](./deployment.md#websocket-proxying) - this is the single most common cause of "works locally, fails once deployed."
- A game server specifically also needs a valid `auth_key` - see [Adding Game Servers](./adding-game-servers.md). An invalid key doesn't necessarily produce an obvious connection error; check the services server's own log for auth rejections.

## A server keeps restarting in a loop

If you're running under [Perpetual](./perpetual.md) (the normal case via `npm run client`/`services`/`game`), a server that crashes immediately on boot looks like nothing's happening but is actually restarting every 5 seconds forever. Check `store/logs/<role>/` for the actual crash reason rather than just watching the terminal scroll by.

## Servers seem out of sync with each other (stale maps/items/servers list)

Game and client servers only pick up services-side changes on their next `requestConfig` poll, or immediately if services reports a newer `startTime` (which triggers an automatic self-restart on their end - see [Architecture Overview](./architecture-overview.md#how-they-find-each-other)). If something seems stale:

1. Confirm the change actually landed on services first (query the database directly, or via the [web SQL tool](./the-database.md#the-built-in-web-sql-tool)) - a "stale" symptom is sometimes actually "the write never happened."
2. Restart the affected game/client server manually to force an immediate poll, rather than waiting for the next automatic one.
3. If servers *never* seem to pick up services restarts automatically, check `ss.isPerpetual` is actually true for them - self-restart-on-newer-`startTime` only fires the `process.exit(1337)` that [Perpetual](./perpetual.md) then acts on; running the raw `node server-game/run-game.js` without `--perpetual` (bypassing Perpetual entirely) means that exit just kills the process with nothing to restart it.

## `EADDRINUSE` - port already in use

Something else is already bound to that port - most often a previous instance that didn't shut down cleanly. See [Getting Started troubleshooting](../01-Getting%20Started/troubleshooting.md#a-port-is-already-in-use) for how to find and end it. Before assuming it's safe to kill, double check what's actually using the port - on a shared machine, or one where you're not certain nothing else is legitimately running, verify the process first rather than assuming.

## Rate limiting behaving unexpectedly in production

See [Rate Limiting](./rate-limiting.md) and specifically [Deployment](./deployment.md#x-forwarded-for-matters-for-rate-limiting-and-can-be-spoofed-if-misconfigured) - almost always a reverse-proxy `X-Forwarded-For` configuration issue once you're past `localhost`.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
