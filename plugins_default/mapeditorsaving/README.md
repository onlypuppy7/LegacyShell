# Map Editor Saving

Adds a **Saves** button next to Save in the map editor. Vibecoded.

## Public Maps

Every map in the database that is available to public games (`public` or `both`) can be opened straight into the editor. Search by name, hit **Open**. Unsaved work asks before it gets scrambled.

## This Browser

Up to **50** saves kept in the browser's IndexedDB. **Autosave** (on by default, toggle in the tab) snapshots the map every minute while it has unsaved changes and differs from the last snapshot. When all 50 slots are full the oldest autosaves go first, then the oldest manual saves.

## Your Account

Saves stored in the services database (`editor_saved_maps`), per account. **10MB** per account, **1GB** for moderators and up (`adminRoles >= 10`). Saving over a name replaces it, and only the difference counts against the quota.

The editor sends the main page's stored login (`LegacyShellAuthToken`) with each request and services checks it directly. No session is created and the token isn't rotated, so an open game tab stays signed in.

## Installation

Included as a default plugin. Restart the services and client servers, then reload the editor. Prefix this folder with `_` to disable it. `node plugins_default/mapeditorsaving/test.js` checks the services side.
