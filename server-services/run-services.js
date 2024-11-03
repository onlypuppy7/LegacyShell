//legacyshell: basic
import misc from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

(async () => {
    let ss = misc.instantiateSS(import.meta, process.argv);
    await plugins.loadPlugins('services', ss);

    //importing, important to do after plugins are loaded so that they can inject their own methods
    const Services = (await import('./start-services.js')).default;
    Services(ss);
})();