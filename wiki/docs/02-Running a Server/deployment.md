# Deployment

> **Audience:** Server operators running a public instance · **Prereqs:** [Architecture Overview](./architecture-overview.md), [Perpetual](./perpetual.md)
>
> **Canonical source:** `server-services/start-services.js` (IP resolution), `server-client/start-client.js`, `server-game/start-game.js`

Running LegacyShell somewhere reachable from the internet, rather than just `localhost`. This page covers the parts specific to LegacyShell; general server-hardening practice (firewalls, SSH keys, unattended upgrades) is out of scope here.

## None of the three servers handle TLS themselves

All three (`server-services`'s raw WebSocket server, `server-game`'s player-facing WebSocket server, `server-client`'s Express HTTP server) listen in plain HTTP/WS. There's no certificate config anywhere in the codebase - a real deployment puts a reverse proxy (nginx, Caddy, etc.) in front to terminate TLS and forward to the plain backend ports. This is completely standard for a Node deployment and not a gap specific to LegacyShell.

## WebSocket proxying

Since services and game are WebSocket-only (no HTTP fallback), your reverse proxy needs to actually support WebSocket upgrade forwarding, not just plain HTTP - this trips people up more with LegacyShell than with a typical REST API, since *two of the three* server roles are WebSocket-exclusive rather than it being one endpoint among many.

An nginx example for the services port:

```nginx
location /services/ {
    proxy_pass http://127.0.0.1:13371/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

Point `wss://your-domain/services/` at this, and set `services_server`/`sync_server`/`servicesURL` in your game/client/distributed config to match (see [Config Files](../01-Getting%20Started/config-files.md) and the [generated config reference](../05-Codebase%20Reference/Generated/config-reference.md)) - `wss://` in place of `ws://` once TLS is actually terminated at the proxy.

## `X-Forwarded-For` matters for rate limiting - and can be spoofed if misconfigured

Services resolves the connecting client's IP as `req.headers['x-forwarded-for'] || req.socket.remoteAddress` - checked directly in source. This is exactly the setup a reverse-proxy deployment needs (otherwise every connection would appear to come from your proxy's own IP, making per-IP [rate limiting](./rate-limiting.md) useless). But it has a real consequence: **whatever your proxy is configured to do with `X-Forwarded-For`, services trusts completely.**

- If your proxy correctly **overwrites** `X-Forwarded-For` with the real client IP (the standard, correct nginx/Caddy behavior when it's the actual edge of your network), this works as intended.
- If a client can reach services **directly**, bypassing your proxy (firewall misconfiguration, services port exposed publicly alongside the proxied one), they can set their own `X-Forwarded-For` header and have services believe they're a different IP than they actually are - trivially defeating rate limiting.

Practical takeaway: if you put a reverse proxy in front of services, also firewall the raw services port (`13371` by default) so it's only reachable from the proxy itself, not directly from the internet. Exposing both "protects nothing" - it's strictly worse than not having a proxy at all, since it looks protected but isn't.

## Process management

Use [Perpetual](./perpetual.md) (`npm run client`/`services`/`game`) rather than running the raw `node server-*/run-*.js` commands directly in production - it's what gives you crash recovery and scheduled restarts. Wrap that in your OS's own process supervisor (`systemd`, a `tmux`/`screen` session that survives logout, or a container orchestrator) so the *Perpetual process itself* comes back after a full machine reboot - Perpetual supervises its child process, but nothing supervises Perpetual.

A minimal `systemd` unit, one per role:

```ini
[Unit]
Description=LegacyShell services
After=network.target

[Service]
WorkingDirectory=/path/to/LegacyShell
ExecStart=/usr/bin/npm run services
Restart=always
User=legacyshell

[Install]
WantedBy=multi-user.target
```

## Common Issues

**WebSocket connections fail only in production, work fine locally.** Almost always the reverse proxy not forwarding the `Upgrade`/`Connection` headers - see the nginx example above. Check your proxy's access logs for a `101 Switching Protocols` response; anything else means the upgrade isn't happening.

**Rate limiting seems to treat every player as the same IP.** Your proxy isn't setting `X-Forwarded-For` (or services isn't configured to trust it correctly) - see the section above.

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
