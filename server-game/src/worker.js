//legacyshell: room worker (bridge)
import { parentPort } from 'worker_threads';
//legacyshell: basic
import { ss, misc } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import log from '#coloured-logging';
//

export var room;

(async () => {
    try {
        misc.instantiateSS(import.meta, process.argv);
        await plugins.loadPlugins('game');
    
        //importing, important to do after plugins are loaded so that they can inject their own methods
        const RoomConstructor = (await import('#rooms')).default;
        
        parentPort.on('message', (msg) => {
            const [ cmd, message, wsId ] = msg;
            // console.log(cmd, 'from main thread:', message);
        
            switch (cmd) {
                case "setSS":
                    Object.assign(ss, message);
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
    } catch (error) {
        log.error("error in worker.js", error);
    };
})();