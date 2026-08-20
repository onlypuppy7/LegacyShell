# Rate Limiting

> **Audience:** Server operators · **Prereqs:** [Architecture Overview](./architecture-overview.md)
>
> **Canonical source:** `server-services/src/ratelimit.js`, `server-services/start-services.js` (the dispatch logic that calls it)

Services rate-limits incoming WebSocket commands per-IP, to keep a single misbehaving or malicious client from hammering the database or auth flow.

## The two buckets

Every command is classified into exactly one of three types before it's even processed:

| Type | What's in it | Default limit |
|---|---|---|
| `sensitive` | Whatever commands are listed in `ratelimit.sensitive.cmds` - by default `validateLogin`, `validateLoginViaAuthToken`, `validateRegister`, `feedback` (the account/auth-touching commands most worth protecting against brute-forcing or spam). | 5 requests per 300 seconds |
| `regular` | Everything else, except... | 10 requests per 60 seconds |
| `auth_required` | A fixed list baked into the code (not configurable): `getUser`, `addEggs`, `addKill`, `addDeath`, `sqlRequest`. | Not rate-limited at all - instead, **rejected outright unless a valid `auth_key` is present.** |

See the [generated config reference](../05-Codebase%20Reference/Generated/config-reference.md#services-yaml) for the exact config keys and current defaults.

## `auth_key` bypasses rate limiting entirely

If a message includes a valid `auth_key` (checked against the `game_servers` table - see [Adding Game Servers](./adding-game-servers.md)), it skips the rate limiter completely, regardless of command type. This is intentional: a legitimate game server needs to report kills/deaths/eggs at whatever volume real gameplay produces, which could easily exceed the regular-visitor limits. It's also why an `auth_key` is worth protecting - anyone holding one can send unlimited requests.

## How the counting actually works

Counts live in an in-memory cache (`ss.requests_cache`, keyed by IP) for speed, backed by the `ip_requests` database table for persistence across restarts - but writes to the table are **lazy**, only happening when a count is reset or when a limit is actually hit, not on every single request. This keeps the common case (a well-behaved IP making a handful of requests) cheap, while still surviving a services restart without losing track of an IP that was already near its limit.

## What happens when a request is rejected

The client gets back `{ "error": "Too many requests. Please try again later." }` over the same WebSocket connection - no special close code, no ban, just that one message in place of whatever response it was expecting. The next request from that IP is evaluated fresh against the same rolling window.

## `protect_ips`

If `ratelimit.protect_ips` is `true` (the default), every IP is MD5-hashed before being used as a rate-limit cache/table key. The config's own comment is upfront that this is not strong cryptography - it's a basic privacy measure (so raw IPs aren't sitting in the database) rather than a security control. Don't rely on it to actually anonymize anything sensitive.

## Common Issues

**Legitimate players are getting rate-limited.** This should only affect rapid-fire login/register/feedback attempts (the `sensitive` bucket) or an unusually high volume of other requests from one IP - which is more likely behind a shared NAT/VPN than from one individual player. If it's a real problem, raise `ratelimit.sensitive.max_count`/`regular.max_count` or the corresponding `reset_interval` in `services.yaml`.

**A game server is being rate-limited.** Check its `auth_key` is actually valid and being sent - see [Adding Game Servers](./adding-game-servers.md). A game server without a working auth key falls back to normal per-IP limits, which real gameplay traffic will blow through quickly.

Next: [Moderation](./moderation.md).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
