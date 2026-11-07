# LegacyAchievements

Get cracking, earn rewards. This plugin is vibecoded.

Runs on **services, game and client**. LegacyProfiles is used for the Achievements tab and reward redemption; the achievement storage and rules live entirely here. There are no core changes. Restart client, game and services after enabling it. Prefix the folder with `_` to disable it; earned records remain in the database.

## Starter achievements

| Category | Achievement | Requirement | Reward |
| --- | --- | --- | --- |
| Account | Fresh Egg | Make an account | 250 eggs |
| Combat | Kills I–VIII | 5 / 100 / 500 / 1,000 / 5,000 / 10,000 / 25,000 / 100,000 lifetime kills | 250 / 1,000 (+ Eggk47 GOLD and 1 hour VIP) / 2,500 / 5,000 / 10,000 / 20,000 / 40,000 / 100,000 eggs |
| Combat | Deaths I–VIII | 5 / 100 / 500 / 1,000 / 5,000 / 10,000 / 25,000 / 100,000 lifetime deaths | 100 / 500 / 1,000 / 2,000 / 5,000 / 10,000 / 20,000 / 50,000 eggs |
| Combat | Rotten Eggs I–III | 250 / 2,500 / 10,000 zombies killed in the Zombies gamemode | 500 / 2,500 / 10,000 eggs |
| Weapons | Eggk-cellent Soldier I–VIII | 25 / 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 kills with the Eggk47 | 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 20,000 eggs |
| Weapons | Scrambled Legs I–VIII | 25 / 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 kills with the Dozen Gauge | 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 20,000 eggs |
| Weapons | Free Range I–VIII | 25 / 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 kills with the CSG-1 | 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 20,000 eggs |
| Weapons | Big Bang Theory I–VIII | 25 / 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 kills with the RPEGG | 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 20,000 eggs |
| Weapons | Pea Shooter I–VIII | 25 / 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 kills with the Cluck 9mm | 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 20,000 eggs |
| Weapons | Shellshock I–VIII | 10 / 50 / 100 / 250 / 500 / 1,000 / 2,500 / 5,000 kills with grenades | 100 / 250 / 500 / 1,000 / 2,500 / 5,000 / 10,000 / 20,000 eggs |

Single challenges, easiest first. The grade picks the hexagon of the badge and the reward when none is given.

| Grade | Achievement | Requirement | Reward |
| --- | --- | --- | --- |
| 1 (bronze) | Revenge Is Best Served Fried | Kill whoever last killed you | 500 eggs |
| 2 (silver) | Shutdown | End someone's streak of 10 or more | 1,000 eggs |
| 2 (silver) | Air Mail I | Get a kill while mid-jump | 1,000 eggs |
| 4 (platinum) | Air Mail II | Get a kill while mid-jump with every gun | 2,500 eggs |
| 3 (gold) | Last Gasp | Get a kill while on 10 HP or less | 1,500 eggs |
| 4 (platinum) | Sidearm Survivor | Survive a full Zombies round on Blue with at least 50 kills, without firing a primary | 2,500 eggs |
| 4 (platinum) | Long Shot | Get a CSG-1 kill from 40 metres or more | 2,500 eggs |
| 4 (platinum) | From Beyond the Shell | Get a kill after you have died | 2,500 eggs |
| 5 (ruby) | Omelette | Get 3 or more kills with a single explosion | 5,000 eggs |
| 1 (bronze) | Hard Boiled I | Survive a Zombies round | 500 eggs |
| 2 (silver) | Hard Boiled II | Survive 3 Zombies rounds in a row | 1,000 eggs |
| 3 (gold) | Hard Boiled III | Survive 5 Zombies rounds in a row | 1,500 eggs |
| 5 (ruby) | Hard Boiled IV | Survive 10 Zombies rounds in a row | 5,000 eggs |

Existing accounts qualify too. Signing in or connecting to achievements checks the authoritative account totals, so past kills count. Kills come from the existing services `addKill` event, never a client progress message. Guests cannot earn or claim account rewards.

Every tier line has its own badge SVGs in `client/img/` (`kills-1.svg` to `kills-8.svg`, and the same for `deaths`, `eggk47`, `dozen`, `csg1`, `rpegg`, `cluck` and `grenade`, bronze to RGB; gold and above have animated sparkles, the gems shimmer; built by `legacyprofiles/badges/build-badges.js`) Sidearm Survivor has its own badge too, a silver hexagon with the zombie egg and a pistol (`sidearm-survivor.svg`).. Other achievements use existing game PNGs where assigned. Locked achievements are greyed out, with progress underneath. Unassigned or missing images fall back to `client/img/placeholder.png`, copied from the existing notification icon. The popup uses the game's fonts, cream/brown/orange colours and buttons; it plays `client/sfx/achievement.mp3` (the Plants vs. Zombies achievement sound, an audio element at 55% of the game's volume setting, silent when it is at 0). A successful Redeem plays `client/sfx/redeem.wav` the same way. It queues multiple unlocks without stealing keyboard focus. If no reward has ever been redeemed on the account, the popup explains that rewards are redeemed from the profile.

The profile tab shows `Achievements X/Y` for the viewed account, independent of active filters. Achievements are grouped into category lists with search, category and status filters (locked, unlocked, rewards ready, redeemed). List rows carry the same category colour as their pins. Live progress updates preserve the filter controls, and claimed rewards keep the current filters. Tier lines share a title (Kills, Deaths, Eggk-cellent Soldier and so on) with I–VIII suffixes and use threshold-based IDs (`kills_5`, `kills_100`, `deaths_5`, `eggk47_25`, etc.). Deaths come from the account total the services keep, checked on every `addDeath` like a kill. No migration is included for the local development IDs.

Sidearm Survivor uses the ZombiesMode plugin's `zombiesRoundStarted` and `zombiesRoundFinished` events. On the installed Blue map, the game server records logged-in participants at the start, counts their scored kills through `scoreKillEggs`, observes actual primary ammunition consumption through a small wrapper around `Player.fire`, and checks surviving humans with at least 50 kills at the finish. Kills must be earned in that round; the victory cleanup does not count. Custom maps named Blue do not qualify. Dry fires and blocked shots do not count. Late joins and reconnects cannot qualify for that round; a cheat flag observed during the round disqualifies it. A registered game-server auth key is required to report the win to services. The browser cannot report progress for this challenge. It records an unlock only; rewards still need redemption in the profile.

The seven kill challenges above are caught on the game server. It wraps `Player.die`, `Player.hit`, `Player.scoreKill` and `Bullet.collidesWithPlayer` (the same way the primary-shot watcher wraps `Player.fire`), so core is unchanged. Each kill is read as it is scored: the victim's streak is captured as they die (the game zeroes it first), the killer's hp, jump and death state are read when the kill lands, and a CSG-1 kill is known from the bullet's weapon. An explosion is any hit that arrives outside a bullet with a damage figure; every player one blast hits shares the shooter and blast position, so three kills from the same pair within 100 ms count as one omelette. Falls, suicides and guests never count, and neither does anything in a room with cheats on.

Air Mail II is the second tier of Air Mail (Air Mail I keeps the `air_mail` id it always had, so existing unlocks are untouched). Each mid-jump kill, one the killer lands with their feet off the ground and not on a ladder, is also counted for the weapon that made it, as `air_<weapon>` next to the weapon kills (`air_eggk47`, `air_dozen` and so on), and goes to the services in the same ten second batch, which only accepts those keys and weapons. "Every gun" is every weapon that has a tier line in `definitions.js` (each one adds itself to `MidairWeapons`, which also sets the goal), so adding a gun's tier line adds it here too. A weapon counts once however many such kills it has, so the profile shows progress out of the number of guns (6 today). Mid-jump kills on zombies count for their weapon too, and guests and rooms with cheats on never count. There is no badge art for either tier yet (they use the placeholder).

Hard Boiled is a run of Zombies rounds survived as a human, counted per player by the game server (`ZombieRoundGoals` in `definitions.js`). Surviving a round the humans won adds one, and any round they are in without surviving it (bitten, joined the horde, the horde winning) starts them back at nothing, as does leaving the room. Guests and cheats never count. The goals are reported through `achievementsChallenge` as `zombie_rounds_<n>`, and like the other challenges they use the placeholder image and need redeeming in the profile.

Zombie kills (a kill in a Zombies room on the other team) are their own count, `zombies`, kept like a weapon's: they never add to a weapon's tiers, and ZombiesMode already keeps them out of the account's kills by cancelling the default kill reward. The badges (`zombies-1.svg` to `zombies-3.svg`) are the Sidearm Survivor's zombie egg and crosshair without the pistol.

Long Shot is measured in game units, one unit being a metre, and needs 40 (`longShotUnits` in `game.js`). The CSG-1 bullet travels 50 units, so that is the furthest it can ever be. From Beyond the Shell needs the killer to have been dead for a quarter of a second, so a blast that takes you out with them does not count.

Each is reported once per account and server through `achievementsChallenge` (`{ auth_key, username, achievement }`). Services only accept ids in `GameChallenges` (the Sidearm Survivor and every `metric: 'game'` definition) from a registered game server, so a report cannot unlock a kill tier or pay anything out. Like Sidearm Survivor they only unlock; rewards still need redeeming in the profile. These use the default placeholder image until they have their own.

Eggs, exact skin thumbnails and VIP time are small reward icons in the list and popup. The optional ItemToolTips plugin supplies the hover tooltips; reward icons also support keyboard focus. Without it, icons retain native title tooltips and accessible labels. Tooltips are removed when rows are filtered, tabs change, popups are dismissed or the profile closes. Skin and stamp thumbnails reuse the existing item renderer at its native 256px size, displayed small in CSS.

Unlocking does **not** grant the reward. Open your profile's Achievements tab and press **Redeem** on an unlocked achievement. Other players can view achievements but cannot claim someone else's rewards. Earned, unclaimed rewards persist across logout and restarts. Popup acknowledgements are stored separately from redemption; dismissing a popup cannot lose a reward.

## Tiers, grades and weapon kills

A line of eight tiers is built by `line()` in `definitions.js`. `tier` is the roman numeral and also the hexagon its badge gets, 1 bronze to 8 rgb. Anything that is not a tier line carries a `grade` from 1 to 8 instead: it orders the single challenges easiest first (categories keep the order they first appear in, inside one the grade decides), it picks the hexagon of their badge, and it is the reward when a challenge names none (500, 1,000, 1,500, 2,500, 5,000, 10,000, 20,000 and 40,000 eggs). `icon` names the badge a definition is built from. The Weapons category has its own ribbon colour.

Weapon tiers count lifetime kills with one weapon (`metric: 'weapon'`). The gun kills are read the same way as the kill challenges: a bullet names its weapon, and an explosion only has its damage, so a blast of the RPEGG's size (`RPEGG.damage`) counts for it and one of 130 for grenades (`grenadeDamage` in `game.js`). Only logged in humans count, never with cheats on. A kill a connection would be far too many, so the game server keeps the counts and sends them to the services in one batch every ten seconds (`achievementsWeaponKills`, `{ auth_key, username, kills: { eggk47: 3 } }`), putting a batch back if it cannot be sent. The services keep the totals in `achievement_weapon_kills`, accept only known weapons and counts up to 1,000 a message from a registered game server, and check the tiers on every batch. A crashed game server loses at most the last ten seconds.

The badges are built by `legacyprofiles/badges/build-badges.js`, which reads the definitions: every one with an `icon` and an image gets a badge, with the hexagon of its tier or grade. The weapon icons are drawn flat in the master and come out with the same colours and gradient outline as the hand finished ones.

## Profile display pins

Choose up to three earned achievements with the profile summary's hover pencil, or **Choose Pins** in the Achievements tab. Pin/Unpin selects earned entries, and the picker lets you drag to reorder or click to remove before Save/Cancel. Locked entries cannot be pinned; redemption is separate and does not affect eligibility.

Selected pins appear on short banners in the existing space to the right of the nickname, rank/VIP and join date. The display is positioned outside normal layout flow and measured against the username and stats, so it does not change their positions or the profile height. It shrinks to the available space and hides if the identity text leaves insufficient room. The picker remains available in the tab. The optional blue profile theme uses the same banners.

Ribbon colours follow category: Account blue, Combat orange, Challenge(s) purple, Event(s) green, other categories tan. The optional positive integer `tier` displays a Roman numeral; standalone achievements omit it. Hover/focus shows the title and category. Clicking a displayed pin opens Achievements, clears filters that could hide its row, and scrolls/focuses that exact achievement. Redeemed entries show the original earned date as DD/MM/YYYY, and the pin picker hides redemption controls. Artwork and numerals have separate reserved areas, with optical scale corrections for the existing PNGs. Images use the existing PNGs and missing-image fallback.

`achievement_showcases` stores the ordered IDs separately from unlocks and rewards. Public username lookups and authenticated snapshots include `featured`; `achievementsFeature` accepts `{ session, pins: [...] }`, derives the account from the validated session, and accepts only up to three unique known earned IDs. Saving a showcase never pays rewards or changes unlock/notification state.

## Definitions and rewards

Edit `definitions.js`. IDs must stay stable once players have earned them. `category` groups entries in the list and colours display ribbons (defaults to Other). `tier` is optional; omit it for a standalone achievement. The initial metrics are `account` (1 for an existing account) and `kills` (lifetime total). `image` is a PNG URL; omitted or missing images use the placeholder.

```js
{
    id: 'some_achievement',
    name: 'Some Achievement',
    category: 'Combat',
    description: 'Kill 500 eggs.',
    metric: 'kills',
    goal: 500,
    image: '/img/notificationIcon.png',
    reward: { eggs: 5000, items: [200001], vipSeconds: 3600 },
}
```

`items` contains exact item IDs from the installed services catalog, including plugin skins. Already-owned items are not duplicated. If a required item is missing from the catalog, the entire claim fails and remains redeemable, rather than consuming the reward. There is no duplicate-item egg compensation.

VIP adds to `max(now, upgradeExpiryDate)`. An active VIP's product, multiplier and ad-free setting are preserved; a new or expired VIP gets product 1, a 2× multiplier and ad-free time. Existing game loadout changes fetch account data from services, so newly rewarded equipment follows the normal ownership checks.

The promised reward JSON is saved at unlock time. Editing a definition later affects future unlocks, not an already-earned reward. Avoid deleting definitions while their rewards are unclaimed.

## Storage and messages

The plugin creates `achievement_unlocks` in the existing services database, keyed by account ID and achievement ID. Account IDs remain internal. A synchronous SQLite transaction updates eggs, inventory, VIP and the redemption timestamp together. Repeated claims return the receipt without granting anything twice. No client-supplied reward, account ID, username or progress selects the claim recipient: the authenticated session does.

- `achievementsGet`: public `{ username }` lookup. Returns definitions, progress and unlock/redemption dates; no account IDs or notification state. It does not write account progress.
- `achievementsWatch`: `{ session }`, keeps one services socket open for unlock/progress updates and reconnect recovery. At most three subscribed sockets per account are kept. Sessions are checked before pushes and periodically while idle.
- `achievementsSeen`: `{ session, achievement }`, acknowledges a displayed popup.
- `achievementsClaim`: `{ session, achievement }`, redeems one reward. Optional string `requestId` correlates the response. The receipt includes only the account fields needed to refresh eggs, inventory and VIP in the signed-in client.
- `achievementsZombiesWin`: game-server-only `{ auth_key, username }`. Records the fixed zombies challenge; client-selected achievements, progress and rewards are ignored.

Responses use `{ legacyachievements: { type, ... }, requestId }`. Existing services rate limits apply to incoming commands; unlock pushes do not need polling. The browser reconnects after a disconnect and clears its socket, queue and pending requests when the signed-in account changes.

## Checks

```sh
node --test plugins_default/legacyachievements/test-achievements.js plugins_default/legacyachievements/test-game.js plugins_default/legacyprofiles/test-profiles.js
```

Tests cover authoritative progress, username-only public reads, session ownership, forged rewards/recipients, expiry, notification replay, claiming once, inventory deduplication, VIP extension, transaction rollback, browser minification, image assets, popup sound/help and stale tab requests. Visual checks use an isolated in-memory services database and the normal profile/game UI.
