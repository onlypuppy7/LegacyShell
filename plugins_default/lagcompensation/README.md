# LagCompensation

Shots are checked against where the target was on the shooter's screen when they fired, not where the server has them now. Someone on 100ms ping hits what they aimed at.

## How it works

- Every tick the room records each player's real position into a ~1s ring (`lagcomp.js`'s `History`).
- Each human's ping is worked out from how far apart their one-a-second ping packets arrive (minus the 1000ms the client waits), taking the smallest of the last few so a laggy tab can't inflate it.
- When a bullet (or rocket) leaves the gun it is stamped with how many ticks to rewind: ping, plus the ticks of their input batch not yet sent.
- While that projectile is being tested against players, the targets are swapped for their recorded position at that time. The hit point is moved back to where the target really is so damage falloff still works out.

Respawns and teleports are never interpolated across, and a shot can't land on someone's previous life. With no history (just joined), no ping estimate yet, or a bot shooting, the old test is used.

## What it doesn't cover

Grenades, rocket splash and contact damage still use current positions. Direct rocket hits are compensated.

## Settings

Per room, under `gameOptions.plugins.lagcomp`:

| Key | Default | |
|---|---|---|
| `enabled` | `true` | |
| `maxRttMs` | `100` | pings above this count as this |
| `maxRewindMs` | `150` | hard cap on reach |
| `extraMs` | `0` | added on top of the ping |
| `rockets` | `false` | compensate direct rocket hits |
| `pingSamples` | `5` | pings the estimate looks at |
| `minSamples` | `4` | pings measured before anything is rewound |

The defaults are tight on purpose: the ping is read from when the client's own packets arrive, so a modified client can fake some of it. The cap is how much that is worth.
| `teleportDist` | `2` | a jump this big in one tick is a teleport |
| `minRewindTicks` | `0.5` | less than this and nothing is rewound |

## Testing

`node plugins_default/lagcompensation/test.js` - headless, no game server needed.

---
*This plugin was vibecoded.*
