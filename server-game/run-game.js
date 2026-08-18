//legacyshell: basic
import { ss, misc } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

(async () => {
    misc.instantiateSS(import.meta, process.argv);
    await plugins.loadPlugins('game');

    //explicit, rather than relying on whatever import chain happens to evaluate '#items' first -
    //see the comment on initItems() in items.js for why that was unreliable
    await (await import('#items')).initItems();

    //importing, important to do after plugins are loaded so that they can inject their own methods
    const Game = (await import('./start-game.js')).default;
    Game();
})();