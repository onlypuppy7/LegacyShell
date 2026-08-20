<!-- GENERATED — do not edit by hand. Run `npm run gen-docs` to regenerate. See src/scripts/gen-wiki-reference.js. -->

# Database Schema

> **Audience:** Server operators, plugin authors, AI agents · **Prereqs:** [The Database](../../02-Running%20a%20Server/the-database.md)

Every `CREATE TABLE` statement in `server-services/src/data_management/recordsManagement.js`, extracted directly from source. This is the literal DDL LegacyShell runs on boot - for the editability tags (USER-EDITABLE / SYS-EDITABLE / SYS-READONLY) and what each table is *for*, see [The Database](../../02-Running%20a%20Server/the-database.md) instead; this page is the mechanical column-level reference.

## `users`

| Column definition | Note |
|---|---|
| `account_id INTEGER PRIMARY KEY AUTOINCREMENT` | - |
| `username TEXT UNIQUE` | - |
| `password TEXT` | - |
| `authToken TEXT` | - |
| `kills INTEGER DEFAULT 0` | - |
| `deaths INTEGER DEFAULT 0` | - |
| `streak INTEGER DEFAULT 0` | - |
| `currentBalance INTEGER DEFAULT 1000` | - |
| `eggsSpent INTEGER DEFAULT 0` | - |
| `ownedItemIds TEXT DEFAULT '[50001,50002,50003,50004,50005,50006,100001,100002,100003,100004,100005,100006,200000,300000,250000,350000,150000]'` | Will store as JSON string |
| `loadout TEXT DEFAULT '{"primaryId":[200000,300000,250000,350000],"secondaryId":[150000,150000,150000,150000],"classIdx":0,"colorIdx":0,"hatId":null,"stampId":null}'` | Will store as JSON string |
| `version INTEGER DEFAULT 1` | - |
| `upgradeProductId INTEGER DEFAULT 0` | - |
| `upgradeMultiplier INTEGER DEFAULT NULL` | - |
| `upgradeAdFree BOOLEAN DEFAULT TRUE` | - |
| `upgradeExpiryDate INTEGER DEFAULT 0` | - |
| `maybeSchoolEmail INTEGER DEFAULT NULL` | - |
| `adminRoles INTEGER DEFAULT 0` | - |
| `dateCreated INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `dateModified INTEGER DEFAULT (strftime('%s', 'now'))` | - |

## `ip_requests`

| Column definition | Note |
|---|---|
| `ip TEXT PRIMARY KEY` | - |
| `sensitive_count INTEGER DEFAULT 0` | - |
| `regular_count INTEGER DEFAULT 0` | - |
| `last_sensitive_reset INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `last_regular_reset INTEGER DEFAULT (strftime('%s', 'now'))` | - |

## `sessions`

| Column definition | Note |
|---|---|
| `session_id TEXT PRIMARY KEY` | - |
| `user_id INTEGER UNIQUE` | - |
| `ip_address TEXT` | - |
| `dateCreated INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `expires_at INTEGER` | - |

## `items`

| Column definition | Note |
|---|---|
| `id INTEGER PRIMARY KEY` | - |
| `meta_id INTEGER` | - |
| `name TEXT DEFAULT 'Unknown item'` | - |
| `is_available BOOLEAN DEFAULT TRUE` | - |
| `price INTEGER DEFAULT 0` | - |
| `item_class TEXT DEFAULT 'Unknown class'` | - |
| `item_type_id INTEGER DEFAULT 0` | - |
| `item_type_name TEXT DEFAULT 0` | - |
| `exclusive_for_class INTEGER` | - |
| `item_data TEXT DEFAULT '{"class":Eggk47,"meshName":"gun_eggk47"}'` | - |
| `dateCreated INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `dateModified INTEGER DEFAULT (strftime('%s', 'now'))` | - |

## `codes`

| Column definition | Note |
|---|---|
| `key TEXT PRIMARY KEY DEFAULT (<random 12-character string, generated via 12 chained `substr(...)` calls - see source for the exact character set>)` | - |
| `item_ids TEXT DEFAULT '[]'` | - |
| `eggs_given INTEGER DEFAULT 0` | - |
| `uses INTEGER DEFAULT 1` | - |
| `used_by TEXT DEFAULT '[]'` | - |
| `dateCreated INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `dateModified INTEGER DEFAULT (strftime('%s', 'now'))` | - |

## `maps`

| Column definition | Note |
|---|---|
| `name TEXT PRIMARY KEY DEFAULT 'Unknown map'` | - |
| `sun TEXT DEFAULT '{"direction":{"x":0.2,"y":1,"z":-0.3},"color":"#FFFFFF"}'` | - |
| `ambient TEXT DEFAULT '#000000'` | NOT USED! |
| `fog TEXT DEFAULT '{"density":0.1,"color":"#33334C"}'` | NOT USED! |
| `data TEXT DEFAULT '{}'` | - |
| `palette TEXT DEFAULT '[null,null,null,null,null,null,null,null,null,null]'` | - |
| `render TEXT DEFAULT '{}'` | NOT USED! |
| `width INTEGER DEFAULT -9999` | - |
| `height INTEGER DEFAULT -9999` | - |
| `depth INTEGER DEFAULT -9999` | - |
| `surfaceArea INTEGER DEFAULT 0` | - |
| `extents TEXT DEFAULT '{"x":{"max":0,"min":10000},"y":{"max":0,"min":10000},"z":{"max":0,"min":10000},"width":-9999,"height":-9999,"depth":-9999}'` | - |
| `skybox TEXT DEFAULT ''` | - |
| `modes TEXT DEFAULT '{"FFA":true,"Teams":true}'` | - |
| `availability TEXT DEFAULT 'both'` | - |
| `numPlayers INTEGER DEFAULT 18` | - |
| `dateCreated INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `dateModified INTEGER DEFAULT (strftime('%s', 'now'))` | - |

## `game_servers`

| Column definition | Note |
|---|---|
| `auth_key TEXT PRIMARY KEY DEFAULT (<random 32-character string, generated via 32 chained `substr(...)` calls - see source for the exact character set>)` | - |
| `name TEXT DEFAULT 'Unnamed server'` | - |
| `address TEXT DEFAULT 'localhost:13372'` | - |
| `dateCreated INTEGER DEFAULT (strftime('%s', 'now'))` | - |
| `dateModified INTEGER DEFAULT (strftime('%s', 'now'))` | - |

## `flags`

| Column definition | Note |
|---|---|
| `name TEXT PRIMARY KEY DEFAULT 'flag'` | - |
| `value TEXT DEFAULT 'value'` | - |

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
