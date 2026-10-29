# List of plugins

Here is a list of known plugins for LegacyShell. (You may even notice a pattern with who made them!)

> Links in the `Identifier` column indicate hyperlinks to documentation. Those in the `Installation info` column are for download pages.

|Identifier|Author|Type|Description|Installation info|
|-|-|-|-|-|
|[legacyshellcore](./Plugin%20Docs/Default/legacyshellcore/info.html)|onlypuppy7|General|Contains custom maps, items, commands, gamemodes, settings, themes, a sound pack and other things which are used in the public instance.|Included in `/plugins_default`|
|[autorestartnotifications](./Plugin%20Docs/Default/autorestartnotifications/info.html)|onlypuppy7|Notifications|Notifies players that the server is about to restart.|Included in `/plugins_default`|
|[autoshopnotifications](./Plugin%20Docs/Default/autoshopnotifications/info.html)|onlypuppy7|Notifications|Posts to a Discord webhook informing users of the current random shop rotation.|Included in `/plugins_default`|
|[christmasevent](./Plugin%20Docs/Default/christmasevent/info.html)|onlypuppy7|Event|Adds Xmas items to the shop, adds decorations and adds snow on the floor, falling snow and other decorations to the map.|Included in `/plugins_default`|
|[healthpackitem](./Plugin%20Docs/Default/healthpackitem/info.html)|onlypuppy7|Pickups|Adds a new item/ammo type which restores health upon collection|Included in `/plugins_default`|
|[itemtooltips](./Plugin%20Docs/Default/itemtooltips/info.html)|onlypuppy7|UI|Adds a tooltip that shows when hovering over an item in the shop.|Included in `/plugins_default`|
|[legacyanalytics](./Plugin%20Docs/Default/legacyanalytics/info.html)|onlypuppy7|Insights|Collects info relating to how the game is being used.<br>Note: not specific user data, but things like room count trends.|Included in `/plugins_default`|
|[modernshellmaps](./Plugin%20Docs/Examples/modernshellmaps/info.html)|onlypuppy7|Maps|Readds newer maps into LegacyShell|Included in `/plugins_samples`|
|[modernmapblocks](./Plugin%20Docs/Default/modernmapblocks/info.html)|onlypuppy7|Tiles|Readds newer maps blocks into LegacyShell|Included in `/plugins_default`|
|[modernshellhats](./Plugin%20Docs/Default/modernshellhats/info.html)|onlypuppy7|Cosmetics|Readds newer hats into LegacyShell|Included in `/plugins_default`|
|[modernshellstamps](./Plugin%20Docs/Default/modernshellstamps/info.html)|onlypuppy7|Cosmetics|Readds newer stamps into LegacyShell|Included in `/plugins_default`|
|[modernshellguns](./Plugin%20Docs/Default/modernshellguns/info.html)|onlypuppy7|Cosmetics|Readds newer gun models into LegacyShell|Included in `/plugins_default`|
|onlyguard7000|onlypuppy7|Security|Experimental anticheat, used in the public instance.|[Currently private](https://github.com/onlypuppy7/OnlyGuard7000)|
|sample1cmd|onlypuppy7|Sample|Adds a basic command.|Included in `/plugins_samples`|
|sample2dependency|onlypuppy7|Sample|Adds a basic command, while leveraging an imported dependency.|Included in `/plugins_samples`|
|[parkourmode](./Plugin%20Docs/Default/parkourmode/info.html)|onlypuppy7|Gamemode|Adds a parkour gamemode, with checkpoints, goals, sfx, a bgm and egg incentives.|Included in `/plugins_default`|
|[playercountnotifications](./Plugin%20Docs/Default/playercountnotifications/info.html)|onlypuppy7|Notifications|Posts to a list of webhooks how many players are online, including the 24h high. Also allows for a dev webhook to post more detailed info such as all active games.|Included in `/plugins_default`|
|[5_crackshot](./Plugin%20Docs/Default/5_crackshot/info.html)|onlypuppy7|Weapons|Adds 0.20.0's Crackshot sniper rifle into the game as a new weapon class.|Included in `/plugins_default`|
|[zaxoniuscustomguns](./Plugin%20Docs/Default/zaxoniuscustomguns/info.html)|Zaxonius & onlypuppy7|Weapons|An alternate Crackshot model set. Disabled by default (folder prefixed `_`).|Included in `/plugins_default`|
|[burntblocksets](./Plugin%20Docs/Default/burntblocksets/info.html)|Burnt Apple & onlypuppy7|Tiles|Replaces the default map block set with one created by Burnt Apple.|Included in `/plugins_default`|
|[deadinternet](./Plugin%20Docs/Default/deadinternet/info.html)|onlypuppy7|Bots|Adds bot players that walk the map and fight - adjustable from a dummy to nightmare skill, with ready-made fields of bots (`/bots add`, `/botsdebug field`) - plus a general A* pathfinding engine other plugins can use.|Included in `/plugins_default`|
|[fancygraphics](./Plugin%20Docs/Default/fancygraphics/info.html)|onlypuppy7 & Burnt|Graphics|Readds old stuff and also some new fancy options: higher resolution shadows, outlined bullets, Burnt's muzzle flash, and explosions and gunfire that light up their surroundings (with LegacyWeather). Built on Legacy Settings and Legacy Themes.|Included in `/plugins_default`|
|[legacysettings](./Plugin%20Docs/Default/legacysettings/info.html)|onlypuppy7|Framework|Revamps the settings menu and adds a framework other plugins build their own settings tabs on top of.|Included in `/plugins_default`|
|[legacythemes](./Plugin%20Docs/Default/legacythemes/info.html)|onlypuppy7|Framework|A theme framework other plugins register selectable, stackable style packs (CSS) and sound packs with.|Included in `/plugins_default`|
|[multiplayermaphost](./Plugin%20Docs/Default/multiplayermaphost/info.html)|Seqsy & onlypuppy7|Tools|Internally "Minerva" - lets the map editor test a map in a real multiplayer match.|Included in `/plugins_default`|
|[timemachine](./Plugin%20Docs/Default/timemachine/info.html)|onlypuppy7|Graphics|Readds old stuff from bygone versions of the game (bullet holes, the classic death animation, classic skyboxes, the first grenade sounds, and more).|Included in `/plugins_default`|
|[vaporwaveblocks](./Plugin%20Docs/Default/vaporwaveblocks/info.html)|onlypuppy7|Tiles|Adds map block models in a vaporwave style, plus matching maps.|Included in `/plugins_default`|
|[whatsapptheme](./Plugin%20Docs/Default/whatsapptheme/info.html)|onlypuppy7|Theme|A little demonstration theme, made as an example of how to add one.|Included in `/plugins_default`|
|[classicskybox](./Plugin%20Docs/Default/classicskybox/info.html)|onlypuppy7 (+Claude)|Graphics|Readds the procedural "classic" and "classic-alpha" skyboxes (sky, clouds, ocean and mountains) from 2017's early versions. Maps can use them as their skybox, and TimeMachine can put them on every map.|Included in `/plugins_default`|
|[debugf3](./Plugin%20Docs/Default/debugf3/info.html)|onlypuppy7 (+Claude)|Tools|A Minecraft style F3 debug screen: fps, ping, coordinates, facing, the block you're looking at, memory and graphics info.|Included in `/plugins_default`|
|[discordplaytest](./Plugin%20Docs/Default/discordplaytest/info.html)|onlypuppy7 (+Codex)|Tools|Owner-approved Discord users make their own expiring site passwords with Discord slash commands, for gating a playtest instance.|Included in `/plugins_default`|
|[legacyachievements](./Plugin%20Docs/Default/legacyachievements/info.html)|onlypuppy7|Progression|Achievements with egg, item and VIP rewards, redeemed from your profile, with up to three pinned next to your name.|Included in `/plugins_default`|
|[legacyadmin](./Plugin%20Docs/Default/legacyadmin/info.html)|onlypuppy7 (+Claude)|Tools|The `/admin` panel: config editor, SQL and table editor, accounts and inventories, codes, bans and mutes, live rooms and chat, backups and an audit log.|Included in `/plugins_default`|
|[legacyprofiles](./Plugin%20Docs/Default/legacyprofiles/info.html)|onlypuppy7|UI|Player profiles: click a name to see their egg, loadouts, inventory, stats, rank badge and achievements.|Included in `/plugins_default`|
|[legacyreplay](./Plugin%20Docs/Default/legacyreplay/info.html)|onlypuppy7 (+Claude)|Tools|Records rooms on the game server: clip the last bit with F8 or `/replay`, watch it back with camera angles, make highlight reels, export video, cast a game live.|Included in `/plugins_default`|
|[legacyweather](./Plugin%20Docs/Default/legacyweather/info.html)|onlypuppy7 (+Claude)|Graphics|Layered rain, storm and snow, wind and time of day, blended smoothly, with `/weather` and `/time` commands.|Included in `/plugins_default`|
|[wikionlymode](./Plugin%20Docs/Default/wikionlymode/info.html)|onlypuppy7 (+Claude)|Tools|Swaps the site's front page for a "currently unavailable" notice while the wiki and services stay up.|Included in `/plugins_default`|
|[zombiesmode](./Plugin%20Docs/Default/zombiesmode/info.html)|onlypuppy7 (+Claude)|Gamemode|Zombies: survive a horde of DeadInternet bots, and whoever dies (or leaves) joins it.|Included in `/plugins_default`|

Made your own plugin? List it :>

Alternatively, [check out this page on my forum](https://forum.onlypuppy7.org/viewforum.php?f=19).