//legacyshell: basic
import misc from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

(async () => {
    let ss = misc.instantiateSS(import.meta, process.argv);
    await plugins.loadPlugins('game', ss);

    //importing, important to do after plugins are loaded so that they can inject their own methods
    const Game = (await import('./start-game.js')).default;
    Game(ss);
})();