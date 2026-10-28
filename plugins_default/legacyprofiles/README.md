# LegacyProfiles

Have a look at who you are cracking. This plugin is vibecoded.

Click **My Profile** beside Logout (or your stats) on the title screen. Clicking a player's name in the game opens their profile in place of the old player menu. Mute/unmute and Boot stay in the profile; Boot uses the existing permission checks. The account rank and Game Owner are shown separately.

Profiles use the account username as the heading, with a different current nickname underneath. Guests use their nickname. Profiles show rank, join date, VIP, eggs, lifetime kills/deaths/KDR/best streak, a rotatable 3D loadout and a searchable inventory. Filter by item category or an individual weapon, including plugin weapons. The Loadout tab also shows this game's stats when opened from the player list. Guests get their loadout and player actions, with no made-up account stats. The in-game loadout is the one they are wearing; outside a game it is their saved equipment.

Rank badges use the supplied SVGs in `client/icons/roles`, both inside profiles and to the right of ping in the in-game leaderboard: account-off for guests, person shield for players, YouTube for creators, police badge for moderators, tools for admins and crown shield for owners. Custom Developer, Twitch and TikTok ranks use their matching logos. Profile text labels stay visible; leaderboard badges show their role on hover. The SVG viewBoxes have equal artwork padding, and leaderboard badges use a fixed size outside the row highlight, unaffected by the own/other-player text scaling. Room-owner markers sit after the rank badge. Profile icons follow the surrounding text colour; leaderboard icons use the game's white. The leaderboard uses the existing server-supplied `adminRoles` and account ID, with no profile requests. Its plugin wrapper follows the core's score/team ordering and leaves name, score, ping and private-game owner indicators intact. Both views share `ranks.js` for configured role names.

Class names come from the registered class list, including plugin classes such as Crackshot; public loadouts preserve those class indexes. Missing weapon slots on older accounts use the registered default primary and secondary weapons, without writing to the account loadout; this also applies when saving a featured class. Arrows beside the loadout heading cycle through the account's saved weapon classes when more than one is available. The weapon preview and primary/secondary cards change together, without changing the account's equipped class. The egg, hat, stamp and camera stay in place; weapon models are loaded once per open profile.

Runs on **client and services**, with no game-server component or dependencies on other plugins. Restart those two roles after installing. Disable by prefixing the folder with `_`, like other plugins. Uses the core `game:playerClicked` event; no source-text replacements or changes to core account/loadout fields. The plugin owns a separate `profile_preferences` table in the services database, created automatically.

With LegacyThemes enabled, add **Player Profiles (Alt)** under Settings → Theming → Style Packs for the alternate blue design. It only styles profiles; remove it from the active list to return to the classic menus. The style pack, preview backdrop support and CSS all live in LegacyProfiles. LegacyThemes is optional.

`legacyprofilesGet` is a public services command taking `{ cmd: 'legacyprofilesGet', username: 'some_egg' }`. Usernames match exactly, as with login, and must follow the existing registration format (at least three letters/numbers or `?!._-`). Numeric usernames are looked up as names, never account IDs; old `account_id`-only requests no longer work. It returns only the explicit public fields in `profiles.js`; account IDs, passwords, auth tokens, sessions and moderation records never enter the response. Normal services rate limiting applies. Inventory and egg balances are public while this plugin is enabled. The title-screen button uses the signed-in username; in-game clicks use the player's server-supplied username. `uniqueId` stays local to the stale-player/mute checks and guest detection, and is not used for profile lookup.

## Profile customisation

On your own profile, hovering the egg preview reveals a pencil for the saved egg angle and featured class. Drag the model, choose a class, then Save or Cancel; Reset returns the angle to its default. The camera and backdrop remain fixed. Normal viewing can still rotate/zoom temporarily, but zoom is never saved. The featured class only changes the profile preview, not your equipped class in the game.

Hover Favourite Items to choose up to six owned items, in selection order, from the searchable inventory. Selected favourites appear as small icons above the inventory while editing. Drag the small icons to reorder, or click an icon to remove it. Keyboard users can reorder a focused icon with Left/Right and remove it with Enter, Space or Delete. Click an inventory item again to remove it, then Save or Cancel. The default Loadout page shows a compact 2-by-2 loadout beside the 3-by-2 favourites grid, with a 40:60 width split. Both grids use matching row heights. Other profiles without featured items keep the full-width loadout. Favourite item names appear beneath their thumbnails, without hover tooltips. Edit pencils appear only on hover or keyboard focus, and only to the account owner.

`legacyprofilesSave` takes `{ cmd: 'legacyprofilesSave', session, preferences: { yaw, pitch, classIdx, featuredItems } }`. Services validate the session/IP and derive the account from that session, ignoring supplied usernames/IDs. Angles must be finite with bounded pitch; the featured class must have a saved primary weapon or a registered default; featured items must be unique, owned and at most six. Preferences live separately from `users`, and removed inventory items are omitted from the public featured list. Public profiles include only these cosmetic preferences, without the storage account ID.

## Adding more later

`game:playerClicked` receives `{ player, playerId, uniqueId, username, event, handled }`. Set `handled = true` to replace the default player menu, and respect an already handled click. Core validates the player before and after async listeners. With LegacyProfiles disabled, the original menu remains available.

Browser plugins can add tabs with `LegacyProfiles.registerSection(id, { label, render(profile, container) })` from their inserted source, or `extern.profiles.registerSection(...)` after setup. `loadout` and `inventory` are reserved. The render callback fills its container with DOM elements; treat account text as text, not HTML. For example:

```js
LegacyProfiles.registerSection('achievements', {
    label: 'Achievements',
    render(profile, container) {
        //fetch this account's achievements and fill the tab
    },
});
```

`game:legacyprofilesViewed` receives `{ profile, container }` after the viewer is drawn. This uses the usual browser `game:` namespace. Nothing needs to be added to the layout just to support a new tab. Other plugins can supply achievements and badges through this API. XP and friends are not implemented here.

The preview reuses the game's engine, with its own scene, offscreen render texture and stamp texture. Closing it releases those resources and its own render callback. The game canvas, resolution and render callbacks stay in place. The backdrop and blurred ground shadow use the home screen's settings. Dragging turns and tilts just the egg and its loadout immediately, without inertia; the camera angle and horizon stay fixed. Idle rendering is limited to 30 FPS. Inventory thumbnails reuse the game's item renderer, with at most 24 items on a page.

The preview borrows `Customizer.poseWithHat` and `poseWithStamp` with a preview-only actor adapter, plus the existing actor helpers for hats, shell colours and hand/weapon bone posing. Mesh and skeleton clones use the game's scene helpers, including skeleton-specific gun selection for classic models. Customizer itself is unchanged. Its constructor, scene setup, weapon selection and stamp application touch account state, global stamp/shadow state or live menu controls, so the preview keeps its own scene, weapon lifecycle and stamp texture. Shared materials cannot be reused safely because their bindings include the live game's global shadow and stamp state.

## Checking it

```sh
node --test plugins_default/legacyprofiles/test-profiles.js
```

The tests cover the public data boundary, read-only behavior, username validation, rejection of old ID requests, numeric usernames, client request payloads, legacy JSON, VIP expiry, ranks/icons, player-click interception and fallback, stale player slots, browser minification, inventory filters, loadout cycling and preview input/disposal/default-scene isolation. Preview tests execute the existing Customizer/actor helpers and check that account, stamp and shadow globals stay untouched.
