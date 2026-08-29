<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# Config Reference

> **Audience:** Server operators, AI agents · **Prereqs:** [Config Files](../../01-Getting%20Started/config-files.md)

Every key in every `src/defaultconfig/*.yaml` template, with its default value and the comment(s) written above/beside it in source - extracted directly, not hand-maintained. Your actual settings live in `store/config/*.yaml`, a personal copy of these defaults (see [Config Files](../../01-Getting%20Started/config-files.md)).

## `all.yaml`

| Key | Default | Comment |
|---|---|---|
| `verbose` | `false` | loads of more logs? |
| `devlogs` | `false` | even more logs in the browser console |

## `client.yaml`

| Key | Default | Comment |
|---|---|---|
| `port` | `13370` | - |
| `sync_server` | `"ws://localhost:13371"` | this is basically the services server. but its not! this is what the client server will internally use to retrieve its configs and shit. in theory the sync server could put in a different services URL entirely! anyway, if the client and services servers are both running on the same machine, you can keep this as localhost. |
| `auth_key` | `""` | optional. giving this client instance an auth_key (create one via the admin panel's SQL/table editor against the game_servers table, same table game servers already register in) lets services target it directly for admin actions (config editor, restart) instead of it only being reachable indirectly. leave blank if you don't need that - everything else works the same either way, this instance just won't show up as a routable target in the admin panel. |
| `this_url` | `"legacyshell.com"` | used in some find and replaces. input the url you want people to access your site via. primarily used for the seo embed things. not critical to the site's function. |
| `login.enabled` | `false` | - |
| `login.username` | `"legacy"` | - |
| `login.password` | `"shell"` | - |

## `distributed_all.yaml`

| Key | Default | Comment |
|---|---|---|
| `closed` | `false` | shuts down services/game and displays a closed message on the webpage. |
| `servicesInfoCollectInterval` | `15` | interval in seconds in which game/client servers report stats to the services server |
| `servicesInfoSendInterval` | `10` | interval in seconds in which the services server sends specific stats back to game/client servers |

## `distributed_client.yaml`

| Key | Default | Comment |
|---|---|---|
| `servicesURL` | `"wss://services.legacyshell.com:443"` | - |
| `minify` | `true ` | this lags startup of the server by a few seconds (to half a minute) in theory though will reduce lag longer term for both clients and the server itself |
| `iif` | `true` | iif means immediately invoked function. in other words, hides vars from the console. good for making messing a little harder. note that its nowhere close to foolproof at all, but at least forces someone to have to make a script to change things |
| `discordServer` | `F3Xh5bhXTr` | do NOT put anything except the ending id/vanity as the rest is filled in! |
| `githubURL` | `"https://github.com/onlypuppy7/LegacyShell/"` | - |

## `distributed_permissions.yaml`

| Key | Default | Comment |
|---|---|---|
| `ranks.0` | `"Guest"` | do not modify |
| `ranks.1` | `"Signed In"` | do not modify |
| `ranks.5` | `"Content Creator"` | - |
| `ranks.10` | `"Moderator"` | do not modify |
| `ranks.20` | `"Admin"` | do not modify |
| `ranks.255` | `"Superuser"` | do not modify |
| `permissions.rooms.joinPublicGame` | `0` | - |
| `permissions.rooms.joinPrivateGame` | `0` | - |
| `permissions.rooms.createPrivateGame` | `0` | - |

## `game.yaml`

| Key | Default | Comment |
|---|---|---|
| `port` | `13372` | the port on your device to use |
| `services_server` | `"ws://localhost:13371"` | the services server to sync with eg, if you want to make an extra region for the public instance, it would be "wss://services.legacyshell.com" otherwise for local usage you can leave as "ws://localhost:13371" |
| `auth_key` | `"AUTH_KEY"` | this is given by the owner of the services server, and can be revoked you cannot act as an endorsed game server without this key from the services server owner this is cause you wont even show up without it, or be able to access account data, or add kills/deaths to the database if you are running a local instance, run the init script to hopefully fill this in if it is unchanged |

## `perpetual_all.yaml`

| Key | Default | Comment |
|---|---|---|
| `pullers` | `["services", "client", "game"]` | if you are running all three, then you can delete all except services because when services restarts, it restarts the others anyway (game/client cant do this) default: ["services", "client", "game"] |
| `client.process_cmd` | `"server-client/run-client.js"` | dont touch unless u changed the path |
| `client.dailyrestart_enable` | `true` | daily restarts, at specified time every day |
| `client.dailyrestart_time` | `"4:00"` | HH:MM (24 hours) |
| `client.dailyrestart_quickpull` | `false` | if true, will pull before restarting |
| `client.logfile_enable` | `true` | logfiles |
| `client.webhook_url` | `""` | webhook logging empty disables it |
| `client.webhook_username` | `"LegacyShell: Client Server"` | - |
| `client.webhook_avatar` | `"https://cdn.onlypuppy7.org/legacyshell/client.png"` | - |
| `client.webhook_ping_user` | `""` | ENTER THE USER ID. for when there is an error. empty = no ping. |
| `client.webhook_ping_role` | `""` | ENTER THE ROLE ID. for when there is an error. empty = no ping. |
| `services.process_cmd` | `"server-services/run-services.js"` | dont touch unless u changed the path |
| `services.dailyrestart_enable` | `true` | daily restarts, at specified time every day |
| `services.dailyrestart_time` | `"4:00"` | HH:MM (24 hours) |
| `services.dailyrestart_quickpull` | `false` | if true, will pull before restarting |
| `services.logfile_enable` | `true` | logfiles |
| `services.webhook_url` | `""` | webhook logging empty disables it |
| `services.webhook_username` | `"LegacyShell: Services Server"` | - |
| `services.webhook_avatar` | `"https://cdn.onlypuppy7.org/legacyshell/services.png"` | - |
| `services.webhook_ping_user` | `""` | ENTER THE USER ID. for when there is an error. empty = no ping. |
| `services.webhook_ping_role` | `""` | ENTER THE ROLE ID. for when there is an error. empty = no ping. |
| `game.process_cmd` | `"server-game/run-game.js"` | dont touch unless u changed the path |
| `game.dailyrestart_enable` | `true` | daily restarts, at specified time every day |
| `game.dailyrestart_time` | `"4:00"` | HH:MM (24 hours) |
| `game.dailyrestart_quickpull` | `false` | if true, will pull before restarting |
| `game.logfile_enable` | `true` | logfiles |
| `game.webhook_url` | `""` | webhook logging empty disables it |
| `game.webhook_username` | `"LegacyShell: Game Server"` | - |
| `game.webhook_avatar` | `"https://cdn.onlypuppy7.org/legacyshell/game.png"` | - |
| `game.webhook_ping_user` | `""` | ENTER THE USER ID. for when there is an error. empty = no ping. |
| `game.webhook_ping_role` | `""` | ENTER THE ROLE ID. for when there is an error. empty = no ping. |

## `services.yaml`

| Key | Default | Comment |
|---|---|---|
| `port` | `13371` | - |
| `feedback` | `false ` | a discord webhook for all feedback to be sent. leave to "false" to disable feedback |
| `nugget_interval` | `24 ` | set interval in hours between each opportunity to get the 1 hour of vip |
| `protect_usernames` | `false ` | makes the errors less revealing of which usernames exist. but this is pointless, as you can just send a register request. if the user doesnt exist, then there is no way you can sign up with it anyway. this is just out of spite, tbh. (hijinks ensue.......) |
| `password_cost_factor` | `10` | higher is more secure, but will require more processing power - run "npm run bcrypt" to determine the recommended cost you should probably leave as is though, because lowering will make it less secure in the event of a breach this is the main defense against a breach, so dont mess with it unless you know what you are doing |
| `session_expiry_time` | `180` | how long, in minutes, sessions should exist for |
| `session_cleanup_interval` | `3 ` | how often, in minutes, sessions should be purged should NOT be higher than expiry time (above)! you will make some strange stuff happen, i can only imagine! dont! |
| `ratelimit.regular.max_count` | `10` | - |
| `ratelimit.regular.reset_interval` | `60` | in seconds |
| `ratelimit.sensitive.max_count` | `5` | - |
| `ratelimit.sensitive.reset_interval` | `300` | in seconds |
| `ratelimit.sensitive.cmds[]` | `"validateLogin"` | - |
| `ratelimit.sensitive.cmds[]` | `"validateLoginViaAuthToken"` | - |
| `ratelimit.sensitive.cmds[]` | `"validateRegister"` | - |
| `ratelimit.sensitive.cmds[]` | `"feedback"` | - |
| `ratelimit.protect_ips` | `true` | md5 hashes ips. this is not a very strong algorithm, so still be careful about sharing info |
| `backups.enabled` | `true` | - |
| `backups.interval` | `4` | in hours |
| `backups.keep` | `50` | how many backups to keep |
| `backups.filepath` | `false` | where to store the backups. false to store in the default location |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
