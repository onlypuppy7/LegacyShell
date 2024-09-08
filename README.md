# LegacyShell
Remake of Shell Shocker's web servers, for a classic version. Then, maybe even extending it.

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
3. Enter: `npm start` to set up the config (just roll with it for now).

## Starting up the server
At the moment you have to start up each section separately. Perhaps in the future there can be a script for them all. I recommend using a program such as tmux (linux), or creating at least a quick batch script to open everything in separate terminal windows.
- `node run client`
- `node run services`
- `node run game`

## Models
egg.babylon contains hats, and stamps, i think. probably.