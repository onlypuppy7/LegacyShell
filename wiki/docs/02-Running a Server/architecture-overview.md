# Architecture Overview

> **Audience:** Server operators · **Prereqs:** [Getting Started](../01-Getting%20Started/)
>
> **Canonical source:** `server-services/`, `server-game/`, `server-client/`, `src/shell/general/misc.js`

[What is LegacyShell?](../01-Getting%20Started/what-is-legacyshell.md) introduced the three servers at a glance. This page goes one level deeper - what you actually need to know to *operate* a real deployment, especially once it's more than "everything on one machine."

## At a glance

<svg viewBox="0 0 820 400" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="max-width:100%;height:auto;font-family:system-ui,sans-serif" role="img" aria-label="Diagram: a player's browser talks to a client server over HTTP and to a game server over WebSocket; both client and game servers poll the single services server via requestConfig.">
  <defs>
    <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
    </marker>
  </defs>

  <rect x="30" y="170" width="150" height="60" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="105" y="195" text-anchor="middle" font-size="13">
    <tspan x="105" dy="0">Player's</tspan>
    <tspan x="105" dy="15">Browser</tspan>
  </text>

  <rect x="230" y="30" width="200" height="150" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="330" y="22" text-anchor="middle" font-size="11">Client mirrors (many)</text>
  <rect x="250" y="60" width="160" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="330" y="84" text-anchor="middle" font-size="12">Client server</text>
  <rect x="250" y="115" width="160" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="330" y="139" text-anchor="middle" font-size="12">Client mirror #2</text>

  <rect x="230" y="220" width="200" height="150" rx="8" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3" />
  <text x="330" y="212" text-anchor="middle" font-size="11">Game servers (many)</text>
  <rect x="250" y="250" width="160" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="330" y="274" text-anchor="middle" font-size="12">Game server #1</text>
  <rect x="250" y="305" width="160" height="40" rx="4" fill="none" stroke="currentColor" stroke-width="1.5" />
  <text x="330" y="329" text-anchor="middle" font-size="12">Game server #2</text>

  <rect x="560" y="150" width="230" height="100" rx="8" fill="none" stroke="currentColor" stroke-width="2.5" />
  <text x="675" y="175" text-anchor="middle" font-size="13" font-weight="bold">Services</text>
  <text x="675" y="192" text-anchor="middle" font-size="11">
    <tspan x="675" dy="0">single instance - SQLite DB</tspan>
    <tspan x="675" dy="14">accounts, items, maps, auth_keys</tspan>
  </text>

  <line x1="180" y1="188" x2="228" y2="112" stroke="currentColor" stroke-width="1.5" marker-end="url(#arch-arrow)" />
  <text x="150" y="140" font-size="11">HTTP: download</text>
  <text x="150" y="153" font-size="11">game + wiki</text>

  <line x1="180" y1="212" x2="228" y2="288" stroke="currentColor" stroke-width="1.5" marker-end="url(#arch-arrow)" />
  <text x="150" y="245" font-size="11">WebSocket:</text>
  <text x="150" y="258" font-size="11">gameplay</text>

  <line x1="430" y1="112" x2="558" y2="182" stroke="currentColor" stroke-width="1.5" marker-end="url(#arch-arrow)" />
  <text x="440" y="140" font-size="11">requestConfig</text>
  <text x="440" y="153" font-size="11">poll</text>

  <line x1="430" y1="288" x2="558" y2="222" stroke="currentColor" stroke-width="1.5" marker-end="url(#arch-arrow)" />
  <text x="440" y="285" font-size="11">requestConfig poll</text>
  <text x="440" y="298" font-size="11">+ auth_key</text>
</svg>

A visitor's browser only ever talks to a client server (to download the game) and a game server (to actually play) - it never talks to services directly. Both server roles poll services independently, and each caches the last response locally so a brief services outage doesn't take the whole fleet down (see "How they find each other" below).

## The three roles, in detail

| Role | Directory | Protocol / default port | Can you run more than one? |
|---|---|---|---|
| **Services** | `server-services/` | WebSocket only, `:13371` | **No** (not without extra work to sync data across instances) - this is the single source of truth. |
| **Game** | `server-game/` | WebSocket (players) `:13372`, plus an outbound connection to services | **Yes** - add as many as you want, each registered against your services server. |
| **Client** | `server-client/` | HTTP, `:13370` | **Yes** - unauthenticated mirrors, point them at the same services server. |

### Services: the single source of truth

Services owns the SQLite database (`server-services/store/LegacyShellData.db`) - accounts, sessions, item/map definitions, redemption codes, and the list of authorized game servers. It's the only server that talks to the database directly. There should be exactly one services server per deployment (see [The Database](./the-database.md)).

Its entire external interface is a raw WebSocket server - no HTTP, no REST API. Every message is a small JSON envelope (`{ cmd: "...", ... }`), and it applies per-IP rate limiting to most commands (see [Rate Limiting](./rate-limiting.md)) - except for connections presenting a valid `auth_key`, which bypass rate limiting entirely (see [Adding Game Servers](./adding-game-servers.md)).

### Game: where matches actually happen

Each game server is authoritative for the matches it's running - physics, hit detection, scoring - and pushes state updates to connected players over its own WebSocket. It doesn't touch the database directly; instead it talks to services for anything account-related (recording a kill, checking a session).

Internally, each game *room* (a single ongoing match) runs in its own dedicated worker thread, isolated from every other room on the same server - useful to know if you ever get into plugin development, covered in [Codebase Reference](../05-Codebase%20Reference/rooms-and-workers.md), but not something you need to think about just to operate a server.

A game server must be **authorized** by the services server owner before it will do anything useful - see [Adding Game Servers](./adding-game-servers.md).

### Client: what your browser actually downloads

The client server is a plain Express web server, serving the built browser game (HTML/JS/assets) plus the integrated wiki. It's unauthenticated by design - anyone can run a client mirror pointed at your services server, the same way anyone could run a mirror of a normal website. It builds its own JavaScript bundle on startup (merging the shared game-logic code that's also used server-side - not something you need to touch as an operator, but if a first boot seems to take a while, this is why).

## How they find each other

Game and client servers don't just start talking to a services server blindly - each one **polls** services on startup (and periodically afterward) with a `requestConfig` request, asking for the current maps, items, list of authorized servers, and any live config services wants to push out. Both cache the last response to local disk (`store/maps.json`, `items.json`, `servers.json`), so if services is briefly unreachable, a game or client server can still boot using the last-known-good data rather than refusing to start.

If services restarts, every connected game/client server notices (it reports a newer `startTime` on the next poll) and **restarts itself** to pick up the change - this is what the [Perpetual](./perpetual.md) process manager's auto-restart is for.

## A single-machine deployment

Running everything on one computer (what [Getting Started](../01-Getting%20Started/) walks through) is just the smallest valid version of this architecture: one services, one game, one client, all pointed at `localhost`. Nothing about the architecture changes - there's just nothing to distribute yet.

## A multi-region deployment

Scaling out looks like:

1. **One services server**, somewhere central.
2. **Multiple game servers**, one per region you want to offer, each added to services' `game_servers` table with its own `auth_key` (see [Adding Game Servers](./adding-game-servers.md)).
3. **One or more client mirrors**, each pointed at the same services server via `sync_server` in `client.yaml` (see [Client Mirrors](./client-mirrors.md)).

Players pick a game server from the in-game server list (which services assembles from the `game_servers` table and each server's live player counts), but always download the game itself from whichever client mirror they happened to visit.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
