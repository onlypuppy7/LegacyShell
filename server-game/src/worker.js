//legacyshell: room worker (bridge)
import { parentPort } from 'worker_threads';
import RoomConstructor from '#rooms';
//legacyshell: basic
import misc from '#misc';
//

let ss = misc.instanciateSS(import.meta.dirname);

var room;

parentPort.on('message', (msg) => {
    const [ cmd, message, wsId ] = msg;
    // console.log(cmd, 'from main thread:', message);

    switch (cmd) {
        case "setSS":
            ss = {
                ...ss,
                ...message,
                parentPort
            };
            RoomConstructor.setSS(ss, parentPort);
            break;
        case "createRoom":
            room = new RoomConstructor.newRoom(message);
            break;
        case "joinPlayer":
            room.joinPlayer(message);
            break;
        case "wsMessage":
        case "wsClose":
            room.sendWsToClient(cmd, message, wsId);
            break;
        case "exit":
            console.log('Worker is exiting...', room.id);
            room.destroy();
            break;
        default:
            break;
    };
});

console.log("im working on it");

// parentPort.postMessage(`Received: ${message}`);
