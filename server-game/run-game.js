//legacyshell: basic
import { ss, misc } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

(async () => {
    misc.instantiateSS(import.meta, process.argv);
    await plugins.loadPlugins('game');

    //importing, important to do after plugins are loaded so that they can inject their own methods
    const Game = (await import('./start-game.js')).default;
    Game();
})();