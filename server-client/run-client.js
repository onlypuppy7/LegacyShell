//legacyshell: basic
import misc from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

(async () => {
    let ss = misc.instantiateSS(import.meta, process.argv);
    await plugins.loadPlugins('client', ss);

    //importing, important to do after plugins are loaded so that they can inject their own methods
    const Client = (await import('./start-client.js')).default;
    Client(ss);
})();