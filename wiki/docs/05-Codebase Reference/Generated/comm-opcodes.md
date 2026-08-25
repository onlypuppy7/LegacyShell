<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# Wire Protocol Opcodes

> **Audience:** Plugin authors, AI agents · **Prereqs:** [Networking](../../04-Plugin%20Development/networking.md)

Every entry in `Comm.Code` (`src/shell/comm.js`), extracted directly from source, along with its JSDoc comment where one exists. See [Networking](../../04-Plugin%20Development/networking.md) for how to register your own opcode with `Comm.Add`.

| Name | Code | Notes |
|---|---|---|
| `gameJoined` | `0` | #SERVER: in response to one of the three join/create types |
| `addPlayer` | `1` | #SERVER: sends all the details of a player |
| `removePlayer` | `2` | #SERVER: delete a player |
| `chat` | `3` | #CLIENT: sends the player's chat #SERVER: distributes the chat, assuming it completed all checks |
| `controlKeys` | `4` | -???: no known functionality |
| `keyUp` | `5` | -???: no known functionality |
| `sync` | `6` | #CLIENT: sends stateIdx, shotsQueued, FramesBetweenSyncs lots of statebuffer (yaw, pitch, controlKeys) #SERVER: directly sets stateIdx, xyz, climbing, and other stuff i dont understand yet |
| `jump` | `7` | NOTE: this is depracated in LegacyShell, this information is instead sent in controlKeys in sync -CLIENT: attempt to make me player jump -SERVER: attempt to make another player jump |
| `die` | `8` | #SERVER: tells the clients that someone died |
| `hitThem` | `9` | #SERVER: tells the players who didnt get hit that it happened. idk why they need two functions. |
| `hitMe` | `10` | #SERVER: tells the player who got hit that it happened. idk why they need two functions. |
| `collectItem` | `11` | SERVER: tells the client they picked up an item |
| `spawnItem` | `12` | SERVER: tells the client there's a new item (usually right after one has been collected) |
| `respawn` | `13` | #SERVER: informs that ANY player has respawned |
| `swapWeapon` | `14` | #CLIENT: attempt to swap weapons #SERVER: informs that someone's weapon has changed |
| `joinGame` | `15` | #CLIENT: request for a game search |
| `ping` | `16` | #CLIENT: used for both getting ping on home screen and also ensuring connection to the server during a game. #SERVER: returned message to calc client ping |
| `pong` | `17` | -SERVER: you cant actually return this. the game does not recognise this and its useless. |
| `clientReady` | `18` | #SERVER: sent after all players have been initially added. if wanted, it also can send the time and stuff for the unused rounds feature. |
| `requestRespawn` | `19` | #CLIENT: try to respawn. if rejected for some reason ur screwed (i think) |
| `throwGrenade` | `20` | #CLIENT: sends a signal that a grenade was thrown, and its power #SERVER: reports that a player threw a grenade and its power, dir, etc |
| `joinPublicGame` | `21` | - |
| `joinPrivateGame` | `22` | #CLIENT: identify specific room and join it |
| `createPrivateGame` | `23` | #CLIENT: create a room |
| `roundStart` | `24` | SERVER: for the unused rounds feature. |
| `switchTeam` | `25` | - |
| `notification` | `26` | SERVER: display a notification on the person's game for any reason. |
| `changeCharacter` | `27` | CLIENT: attempt to change skins and stuff SERVER: informs that someone's skins and stuff has changed |
| `playerCount` | `28` | SERVER: unused/unknown |
| `roundEnd` | `29` | SERVER: for the unused rounds feature. |
| `pause` | `30` | - |
| `announcement` | `31` | SERVER: no logic associated with this. |
| `updateBalance` | `32` | - |
| `reload` | `33` | - |
| `refreshGameState` | `34` | - |
| `switchTeamFail` | `35` | - |
| `expireUpgrade` | `36` | - |
| `bootPlayer` | `37` | CLIENT: send a req to boot someone (requires gameOwner) |
| `loginRequired` | `38` | SERVER: unused/unknown |
| `banned` | `39` | SERVER: have been booted from a game. |
| `gameLocked` | `40` | SERVER: room has been locked from the public. doesnt seem to have kicked them. |
| `startReload` | `48` | - |
| `fire` | `49` | - |
| `setGameOwner` | `50` | LEGACYSHELL ADDED SERVER: room has a new owner set |
| `warp` | `51` | LEGACYSHELL ADDED SERVER: transfer player to another room |
| `setModifiers` | `52` | LEGACYSHELL ADDED SERVER: set scale of a player |
| `roundUpdate` | `53` | LEGACYSHELL ADDED SERVER: update the round stuff |
| `updateRoomParams` | `54` | LEGACYSHELL ADDED SERVER: update the room's params such as cheats, etc |
| `doThunderStrike` | `55` | LEGACYSHELL ADDED SERVER: inits a thunderstrike |
| `heal` | `56` | LEGACYSHELL ADDED SERVER: heals a player |
| `syncData` | `57` | LEGACYSHELL ADDED SERVER: syncs the data of the player, with less pertinent data |
| `explosionEffect` | `58` | LEGACYSHELL ADDED SERVER: spawns a cosmetic (non-damaging) explosion effect at a player's position, used by /player explode |
| `info` | `255` | CLIENT: used by bwd admins to look at ips and stuff (scary). |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
