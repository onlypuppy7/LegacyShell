# LegacyAchievements

Get cracking, earn rewards. This plugin is vibecoded.

Runs on **services, game and client**. LegacyProfiles is used for the Achievements tab and reward redemption; the achievement storage and rules live entirely here. There are no core changes. Restart client, game and services after enabling it. Prefix the folder with `_` to disable it; earned records remain in the database.

## Starter achievements

| Category | Achievement | Requirement | Reward |
| --- | --- | --- | --- |
| Account | Fresh Egg | Make an account | 250 eggs |
| Combat | Getting Cracking I | 5 lifetime kills | 500 eggs |
| Combat | Getting Cracking II | 100 lifetime kills | 2,500 eggs, Eggk47 GOLD, 1 hour VIP |
| Combat | Getting Cracking III | 500 lifetime kills | 5,000 eggs |
| Combat | Getting Cracking IV | 1,000 lifetime kills | 10,000 eggs |
| Combat | Getting Cracking V | 5,000 lifetime kills | 25,000 eggs |
| Combat | Getting Cracking VI | 10,000 lifetime kills | 50,000 eggs |
| Challenges | Sidearm Survivor | Survive a full Zombies round on Blue with at least 50 kills, without firing a primary | 2,500 eggs |

Existing accounts qualify too. Signing in or connecting to achievements checks the authoritative account totals, so past kills count. Kills come from the existing services `addKill` event, never a client progress message. Guests cannot earn or claim account rewards.

Achievements use existing game PNGs where assigned. Locked achievements are greyed out, with progress underneath. Unassigned or missing images fall back to `client/img/placeholder.png`, copied from the existing notification icon. The popup uses the game's fonts, cream/brown/orange colours and buttons; it plays the existing `ammo` sound as a placeholder. It queues multiple unlocks without stealing keyboard focus. If no reward has ever been redeemed on the account, the popup explains that rewards are redeemed from the profile.

The profile tab shows `Achievements X/Y` for the viewed account, independent of active filters. Achievements are grouped into category lists with search, category and status filters (locked, unlocked, rewards ready, redeemed). List rows carry the same category colour as their pins. Live progress updates preserve the filter controls, and claimed rewards keep the current filters. Kill tiers share a title with I–VI suffixes and use threshold-based IDs (`kills_5`, `kills_100`, etc.). No migration is included for the local development IDs.

Sidearm Survivor uses the ZombiesMode plugin's `zombiesRoundStarted` and `zombiesRoundFinished` events. On the installed Blue map, the game server records logged-in participants at the start, counts their scored kills through `scoreKillEggs`, observes actual primary ammunition consumption through a small wrapper around `Player.fire`, and checks surviving humans with at least 50 kills at the finish. Kills must be earned in that round; the victory cleanup does not count. Custom maps named Blue do not qualify. Dry fires and blocked shots do not count. Late joins and reconnects cannot qualify for that round; a cheat flag observed during the round disqualifies it. A registered game-server auth key is required to report the win to services. The browser cannot report progress for this challenge. It records an unlock only; rewards still need redemption in the profile.

Eggs, exact skin thumbnails and VIP time are small reward icons in the list and popup. The optional ItemToolTips plugin supplies the hover tooltips; reward icons also support keyboard focus. Without it, icons retain native title tooltips and accessible labels. Tooltips are removed when rows are filtered, tabs change, popups are dismissed or the profile closes. Skin and stamp thumbnails reuse the existing item renderer at its native 256px size, displayed small in CSS.

Unlocking does **not** grant the reward. Open your profile's Achievements tab and press **Redeem** on an unlocked achievement. Other players can view achievements but cannot claim someone else's rewards. Earned, unclaimed rewards persist across logout and restarts. Popup acknowledgements are stored separately from redemption; dismissing a popup cannot lose a reward.

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
