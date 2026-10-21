//legacyshell: room worker (bridge)
import { parentPort } from 'worker_threads';
//legacyshell: basic
import { ss, misc } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
import log from 'puppylog';
//

export var room;

(async () => {
    try {
        misc.instantiateSS(import.meta, process.argv);
        await plugins.loadPlugins('game');

        //explicit, rather than relying on whatever import chain happens to evaluate '#items' first -
        //see the comment on initItems() in items.js for why that was unreliable
        await (await import('#items')).initItems();

        //importing, important to do after plugins are loaded so that they can inject their own methods
        const RoomConstructor = (await import('#rooms')).default;

        //map.babylon is the same for every room and takes seconds to parse, so the spare worker does it while it waits. the room takes the scene over (see rooms.js)
        try {
            const BABYLON = (await import('babylonjs')).default;
            const { loadMapMeshes } = await import('#loading');
            const engine = new BABYLON.NullEngine();
            const scene = new BABYLON.Scene(engine);
            const preloadStart = Date.now();
            ss.preload = { engine, scene, done: new Promise(resolve => loadMapMeshes(scene, () => {
                log.info(`Preloaded map.babylon in ${Date.now() - preloadStart}ms`);
                resolve();
            })) };
        } catch (error) {
            ss.preload = null;
            log.error("error preloading map.babylon", error);
        };

        parentPort.on('message', (msg) => {
            const [ cmd, message, wsId ] = msg;
            // console.log(cmd, 'from main thread:', message);
        
            switch (cmd) {
                case "setSS":
                    Object.assign(ss, message);
                    break;
                case "createRoom":
                    room = new RoomConstructor(message);
                    ss.room = room;
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
                // Main thread relaying an admin action (e.g. a kick) into THIS specific room - see
                // legacyadmin's game/moderationWorker.js, and roomManager.js's admin dispatch that
                // posts these.
                case "adminCommand":
                    plugins.emit('adminCommand', { payload: message });
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