# LegacyProfiles

Have a look at who you are cracking. This plugin is vibecoded.

Click **My Profile** beside Logout (or your stats) on the title screen. Clicking a player's name in the game opens their profile in place of the old player menu. Mute/unmute and Boot stay in the profile; Boot uses the existing permission checks. The account rank and Game Owner are shown separately.

Profiles show the nickname, account username, rank, join date, VIP, eggs, lifetime kills/deaths/KDR/best streak, a rotatable 3D loadout and a searchable inventory. Filter by item category or an individual weapon, including plugin weapons. The Loadout tab also shows this game's stats when opened from the player list. Guests get their loadout and player actions, with no made-up account stats. The in-game loadout is the one they are wearing; outside a game it is their saved equipment.

Arrows beside the loadout heading cycle through the account's saved weapon classes when more than one is available. The weapon preview and primary/secondary cards change together, without changing the account's equipped class. The egg, hat, stamp and camera stay in place; weapon models are loaded once per open profile.

Runs on **client and services**, with no game-server component or dependencies on other plugins. Restart those two roles after installing. Disable by prefixing the folder with `_`, like other plugins. No core source changes, database migrations or account writes.

`legacyprofilesGet` is a public services command taking a positive `account_id`. It returns only the explicit public fields in `profiles.js`; passwords, auth tokens, sessions and moderation records never enter the response. Normal services rate limiting applies. Inventory and egg balances are public while this plugin is enabled.

## Adding more later

Browser plugins can add tabs with `LegacyProfiles.registerSection(id, { label, render(profile, container) })` from their inserted source, or `extern.profiles.registerSection(...)` after setup. `loadout` and `inventory` are reserved. The render callback fills its container with DOM elements; treat account text as text, not HTML. For example:

```js
LegacyProfiles.registerSection('achievements', {
    label: 'Achievements',
    render(profile, container) {
        //fetch this account's achievements and fill the tab
    },
});
```

`game:legacyprofilesViewed` receives `{ profile, container }` after the viewer is drawn. This uses the usual browser `game:` namespace. Nothing needs to be added to the layout just to support a new tab. XP, badges, achievements, friends and profile editing are not implemented here.

The preview reuses the game's engine, with its own scene, offscreen render texture and stamp texture. Closing it releases those resources and its own render callback. The game canvas, resolution and render callbacks stay in place. Dragging rotates immediately, without inertia; idle rendering is limited to 30 FPS. Inventory thumbnails reuse the game's item renderer, with at most 24 items on a page.

## Checking it

```sh
node --test plugins_default/legacyprofiles/test-profiles.js
```

The tests cover the public data boundary, read-only behavior, invalid IDs, legacy JSON, VIP expiry, rank names, the player-menu build insertion, browser minification, inventory category/weapon filters, loadout cycling and preview input setup/disposal/default-scene isolation.
