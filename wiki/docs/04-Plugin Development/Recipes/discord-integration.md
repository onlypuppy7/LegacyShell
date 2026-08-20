# Recipe: Discord Integration

> **Audience:** Plugin authors · **Prereqs:** [Events (concept)](../events-concept.md)
>
> **Canonical source:** `server-game/src/rooms.js` (`packChat`)

Posting room chat to a Discord webhook - server-side only, no browser code needed. Several bundled plugins already do something in this family (`autoshopnotifications`, `playercountnotifications`, and the built-in `feedback` command all post to Discord webhooks) - this recipe builds the same pattern from scratch for chat specifically.

## The hook

`packChat` fires every time a chat packet is built, after [censor.js](../../05-Codebase%20Reference/) filtering has already run, with the raw text and sender id:

```js
// server-game/src/rooms.js - real code
packChat(output, text, id = 255, chatType = Comm.Chat.user) {
    plugins.emit('packChat', {this: this, output, text, id, chatType});
    // ...packs the actual network packet...
};
```

`chatType` distinguishes real user chat (`Comm.Chat.user`, value `0`) from slash commands (`cmd`), blocked/censored messages (`blocked`), and whispers (`whisper`) - a Discord-relay plugin should filter to `user` only, otherwise every command a player types (and every message that got blocked by the censor) shows up in your Discord channel too.

## The plugin

```js
// plugins/discordchat/index.js
import log from 'puppylog';

export const PluginMeta = {
    identifier: "discordchat",
    name: 'Discord Chat Relay',
    author: 'you',
    version: '1.0.0',
    descriptionShort: 'Relays in-game chat to a Discord webhook.',
    descriptionLong: 'Posts every real user chat message to a configured Discord webhook.',
    legacyShellVersion: 598,
};

const WEBHOOK_URL = "https://discord.com/api/webhooks/your-webhook-here";

export class Plugin {
    constructor(plugins, thisDir) {
        this.plugins = plugins;
        this.thisDir = thisDir;

        if (plugins.type !== "game") {
            log.orange(`${PluginMeta.identifier} won't run on this server type.`);
            return;
        };

        this.plugins.on('game:packChat', this.onPackChat.bind(this));
    };

    onPackChat(data) {
        if (data.chatType !== 0) return; // Comm.Chat.user only - skip commands/blocked/whispers

        const [, player] = data.this.getPlayerClient(data.id);
        const username = player?.name || "Unknown";

        fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: `**${username}**: ${data.text}` }),
        }).catch(err => log.red(`discordchat: webhook post failed: ${err.message}`));
    };
};
```

Uses the built-in `fetch` (available natively in Node 18+, which is already this project's minimum - see [Requirements](../../01-Getting%20Started/requirements.md)) rather than adding a dependency for something this simple.

## Why `.catch` and not `await`

The webhook post isn't awaited - `onPackChat` returns immediately, and the actual HTTP request resolves (or fails) in the background. This is deliberate: `packChat` runs synchronously inside packet-building, on the hot path of every chat message sent to every player in the room - blocking that on an external HTTP round-trip would add real, user-visible latency to something that should be instant. The `.catch` just makes sure a failed request logs instead of becoming an unhandled promise rejection.

## Rate limiting your own webhook

Discord itself rate-limits webhooks - a very active room could trigger Discord's own throttling if every single message is relayed instantly. If that becomes a problem, batch messages into an interval-based digest instead of firing one HTTP request per chat line, the same way the bundled `playercountnotifications` plugin posts periodic summaries on a timer rather than one webhook call per individual event.

## What we validated

Loaded against a real (isolated, scratch) game server: the plugin registers its `game:packChat` listener cleanly with no errors, on both the main thread and inside a room worker. We did **not** send a real request to any Discord webhook as part of validating this recipe - doing so would require an actual webhook URL and would post a real message to a real external channel, which isn't something to do as a side effect of writing documentation. Triggering `packChat` itself also requires live chat activity in a real match, the same category of limitation as [Killstreaks](./killstreaks.md#validated).

## Common Issues

**Every command a player types shows up in Discord too.** You're not filtering `chatType` - see the check above.

**Nothing posts, no error either.** Check the webhook URL is actually valid and the log line from the `.catch` handler isn't appearing somewhere you're not looking (services/game logs are separate - this fires from the **game** server, not services).

---
*This page was drafted with AI assistance and reviewed for accuracy. If something looks wrong, please [open a PR](https://github.com/onlypuppy7/LegacyShell) or flag it.*
