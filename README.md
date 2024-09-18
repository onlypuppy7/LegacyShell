# LegacyShell
> No clucks given.

Remake of Shell Shocker's web servers, for a classic version. Then, maybe even extending it.

## Forewarning:

LegacyShell is currently in active development and is not ready for production use. Tables in databases may appear or disappear between updates and configs will need manually updating.

## Explanation:
In order to emulate all the parts of the webgame shellshock.io, one must replicate the following:
- Services server
    - This is the central server that does all non-gameplay things, eg stores account info, updates the info when getting kills.
    - This server should also deal with things like Twitch streams, info, news, listing available websocket servers and so on.
    - There can only be one, unless there is some way to sync the data across them.
- Client file server
    - Providing the files needed to play the game in the browser, eg the js, html, images, etc.
    - There can be as many of these to act as mirrors as wanted. Just they will need to be configured to connect to the services server.
- Game server
    - This server allows gameplay to take place. It simulates the game being played and sends packets to all the players, keeping them in sync.
    - So long as the game server is added and authorised by the owner of the services server, then there can be as many as desired to increase the region count.

So depending on your use case, you could either be using all or some of the servers.

## Instructions
### Prerequisites:
- Nodejs
- Some kind of terminal

## Installation
1. Navigate to the root directory in your terminal of choice.
2. Enter: `npm install`
3. Enter: `npm run init` to set up the config (just roll with it for now).

## Starting up the server
At the moment you have to start up each section separately. Perhaps in the future there can be a script for them all. I recommend using a program such as tmux (linux), or creating at least a quick batch script to open everything in separate terminal windows.
- `node run client`
- `node run services`
- `node run game`

These commands will launch the server in a custom wrapper, designed to make keeping track of everything easy and configurable. It will restart in case of crashes, schedule daily restarts, log to files and log to a Discord webhook (all dependent on config). To modify it's settings, use the `perpetual` section of the config.yaml.

## Navigating the database
The LegacyShellData.db database in /server-services/store houses most critical information.
These tags provide information about the function of the table:
> (USER-EDITABLE) indicates that the table is *INTENDED* to be edited 
> 
> (SYS-EDITABLE) indicates that the table is *NOT DESIGNED* to be edited, but can still be edited if you know what you're doing
> 
> (SYS-READONLY) indicates that the table is *NOT INTENDED* to be edited, and doing so will have **no effect**, they can be **ignored and overwritten** by LegacyShell processes.

Here is a breakdown of the tables:
### codes (USER-EDITABLE)
This table holds all item/egg codes that can be used. To add codes, open the database in a SQL editor, add a row. A random code should be automatically generated. You can then edit other information as desired.
Once a code is completely used, it does not get deleted. Instead it stays be able to alert players that the code has been used up.
Codes may contain item(s), eggs, or both.
Codes may be set to be used multiple times, however can only be redeemed once per account.
### game_servers (USER-EDITABLE)
This table holds all authorised game servers. To add an authorised game server, open the database in a SQL editor, add a row. A random auth code should be automatically generated. You can then edit other information as desired (name).
Be cautious about who you give this code to, as it has the potential to ruin your entire database! Rate limits are bypassed and sensitive operations are allowed to those with one.
### ip_requests (SYS-EDITABLE)
This table holds records about ips in regards to ratelimit functions.
### items (USER-EDITABLE)
This table holds records about all the items that the game recognises. Ensuring the correct models are present, here you can either change minor settings such as price and if they should appear in the shop, or you can add new items entirely.
### maps (SYS-READONLY)
This table holds records about the maps that the game recognises. **You cannot directly edit this table**. It is generated from the json files in /server-services/src/maps and it is intended to instead modify those files. The json files in that directory are directly compatible with those exported from the Shell Shockers map editor.
### sessions (SYS-EDITABLE)
This table holds records about sessions and their associated ips and account ids. This is not a very interesting table.
### users (SYS-EDITABLE)
This table holds records about all registered accounts for the services server instance. You can change things like egg counts and inventories.

## Models
egg.babylon contains hats, and stamps, i think. probably.