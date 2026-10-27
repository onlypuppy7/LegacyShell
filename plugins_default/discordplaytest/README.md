# Discord Playtest

Vibeslopped / quickly made. Runs on the client server only. All commands are **Discord slash commands**, not LegacyShell in-game commands.

On the first client run, the plugin creates `plugins_default/discordplaytest/store/config.json`:

```json
{
    "enabled": false,
    "token": "",
    "guild_id": ""
}
```

Paste your Discord bot token, set `enabled` to `true`, and restart the client. Until both are set, the plugin does not start a bot, register hooks or change the client password settings. The plugin loader may still install the declared discord.js dependency. Never commit the store folder or token.

Invite the bot with the `bot` and `applications.commands` scopes. No privileged intents or administrator permission needed. Set `guild_id` to your Discord server ID for server-specific commands; leave it empty for global registration (which may take time to appear). Use one running client process per bot/config; state is local to that client. When switching guild/global scope, remove the old commands from the old scope in Discord.

The owner is fetched from the Discord application. For team-owned bots, only the team owner counts, not every team member. The owner is automatically allowed to create passwords.

| Discord command | Who | Effect |
| --- | --- | --- |
| `/playtest duration:2h` | Owner or approved user | Returns a private `playtest:<random password>` login valid for 2 hours. Accepts whole minutes/hours/days, 1m–7d. |
| `/playtest-clear` | Owner or approved user | Revokes your current password. |
| `/playtest-clear user:@someone` | Owner | Revokes that user's password. |
| `/playtest-clear all:true` | Owner | Revokes all temporary passwords, keeping approvals. |
| `/playtest-approve user:@someone` | Owner | Approves that user to create passwords. |
| `/playtest-unapprove user:@someone` | Owner | Removes approval and immediately revokes that user's password. |

Each Discord user has one active password. Issuing another replaces it. Password replies are ephemeral (visible only to the caller). Approved users can share the temporary login with testers; it is a shared site password, not a Discord identity check or a game account.

The plugin enables the built-in client HTTP password gate while active. Existing static credentials in `store/config/client.yaml` continue to work; if absent, an unguessable fallback is generated in memory. `playtest` is the temporary username. Use HTTPS for the site. Maintenance/closed mode keeps its existing behavior.

Approvals, SHA-256 password hashes and absolute expiration times persist in the plugin's ignored `store/state.json`. Raw passwords are never saved. Expiry is checked on every HTTP request, including after restarts. Discord outages leave the gate enabled and existing unexpired credentials usable. To disable the plugin, set `enabled` to `false` and restart; the normal client.yaml login settings then apply again.

This protects the client site only. Expiry/clearing does not disconnect existing games, lock the services/game WebSockets, or create/delete game accounts. Browsers may keep a downloaded page and cached assets after expiry; their next request to the site will require a valid password.

Checks: `node --test plugins_default/discordplaytest/test-playtest.js`.
