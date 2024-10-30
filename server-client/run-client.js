//basic
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
//legacyshell: basic
import misc from '#misc';
//legacyshell: getting configs
import wsrequest from '#wsrequest';
//legacyshell: web server
import express from 'express';
import prepareModified from '#prepare-modified';
//

(async () => {
    let ss = misc.instantiateSS(import.meta, process.argv);
    await ss.plugins.loadPlugins('client', ss.pluginsDir);

    ss = {
        ...ss,
        cache: {},
        misc,
    };

    let retrieved = false;
    let offline = false;

    ss.plugins.emit('onLoad', { ss });

    function startServer() {
        try {
            const app = express();
            const port = ss.config.client.port || 13370;

            ss.plugins.emit('onStartServer', { ss, app });

            if (ss.config.client.closed) {
                ss.plugins.emit('closedBeforeDefault', { ss, app });
                app.use(express.static(path.join(ss.currentDir, 'src', 'client-closed')));

                app.use((req, res, next) => {
                    if (req.path !== '/closed' && req.path !== '/discord') {
                        res.redirect('/closed');
                    } else {
                        next();
                    };
                });

                ss.plugins.emit('closedAfterDefault', { ss, app });

                ss.log.bgRed('Server is running in closed mode.');
            } else {
                ss.plugins.emit('openBeforeDefault', { ss, app });

                app.use(express.static(path.join(ss.currentDir, 'store', 'client-modified')));
                app.use(express.static(path.join(ss.rootDir, 'src', 'shared-static')));
                app.use(express.static(path.join(ss.currentDir, 'src', 'client-static')));

                app.use((req, res, next) => {
                    console.log(req.path);
                    if (req.path.includes("closed")) {
                        res.redirect('/');
                    } else {
                        next();
                    };
                });

                ss.plugins.emit('openAfterDefault', { ss, app });

                retrieved = 2;
                try {
                    ss.log.blue('Generating modified files (eg minifying shellshock.min.js)...');
                    ss.plugins.emit('beforePrepareModified', { ss, app });
                    prepareModified(ss);
                    ss.plugins.emit('afterPrepareModified', { ss, app });
                } catch (error) {
                    console.error('Modification failed:', error);
                    process.exit(1);
                };

                try {
                    if (ss.config.client.login.enabled) {
                        console.log("Password enabled:", ss.config.client.login);
                        app.use(checkPassword);
                    };
                } catch (error) {
                    console.log("Starting client server failed:", error);
                    // process.exit(1);
                };
            };

            app.get('/discord', (req, res) => {
                res.redirect('https://discord.gg/' + ss.config.client.discordServer);
            });

            app.listen(port, () => {
                ss.log.success(`Server is running on http://localhost:${port}`);
                ss.plugins.emit('onServerRunning', { ss, app });
            });
        } catch (error) {
            console.log(error);
        };
    };

    const checkPassword = (req, res, next) => {
        try {
            const auth = { login: ss.config.client.login.username, password: ss.config.client.login.password };
        
            const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
            const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');
        
            // console.log(login, password, auth.login, auth.password);

            if (login && password && login === auth.login && password === auth.password) {
                return next();
            };
        
            res.set('WWW-Authenticate', 'Basic realm="Protected Area"');
            res.status(401).send('Authentication required.');
        } catch (error) { console.error(error) };
    };

    //all this is retrieving the config:

    let itemsFilePath = path.join(ss.currentDir, 'store', 'items.json');
    let mapsFilePath = path.join(ss.currentDir, 'store', 'maps.json');
    let serversFilePath = path.join(ss.currentDir, 'store', 'servers.json');

    async function connectWebSocket(retryCount = 0) {
        nextTimeout = Math.min(nextTimeout + 5e3, 30e3);

        try {
            ss.log.blue('WebSocket connection opening. Requesting config information...');
            await wsrequest({
                cmd: "requestConfig",
                    lastItems: Math.floor(misc.getLastSavedTimestamp(itemsFilePath)/1000), //well in theory, if its not in existence this returns 0 and we should get it :D
                    lastMaps: Math.floor(misc.getLastSavedTimestamp(mapsFilePath)/1000),
                    lastServers: Math.floor(misc.getLastSavedTimestamp(serversFilePath)/1000),
            }, ss.config.client.sync_server, undefined, (event) => {
                let response = event.data;
                var configInfo = JSON.parse(response);

                if (configInfo) {
                    if (!retrieved) {
                        ss.log.green('Received config information from sync server.');
                        offline = false;
                
                        const load = function(thing, filePath) {
                            if (configInfo[thing]) {
                                ss.log.blue(`[${thing}] loaded from newly retrieved json.`)
                                configInfo[thing] = JSON.stringify(configInfo[thing]);
                                fs.writeFileSync(filePath, configInfo[thing]); //dont convert the json. there is no need.
                                ss.cache[thing] = configInfo[thing];
                                delete configInfo[thing];
                            } else {
                                delete configInfo[thing]; //still delete the false, derp
                                if (fs.existsSync(filePath)) {
                                    ss.log.italic(`[${thing}] loaded from previously saved json.`);
                                    ss.cache[thing] = fs.readFileSync(filePath, 'utf8');
                                } else {
                                    ss.log.red(`Shit. We're fucked. We didn't receive an [${thing}] json nor do we have one stored. FUUUU-`);
                                };
                            };
                        };
                
                        load("items", itemsFilePath);
                        load("maps", mapsFilePath);
                        load("servers", serversFilePath);
                
                        // console.log(ss.items);
                
                        delete configInfo.distributed_game;
            
                        configInfo = { ...configInfo, ...configInfo.distributed_client };
                        delete configInfo.distributed_client;
                
                        configInfo = { ...configInfo, ...configInfo.distributed_all };
                        delete configInfo.distributed_all;
                
                        ss = { ...ss, permissions: configInfo.permissions };
                        delete configInfo.permissions;
            
                        ss.config.client = { ...ss.config.client, ...configInfo };

                        delete configInfo.login;
                        delete configInfo.permissions;
            
                        ss.distributed_config = yaml.dump(configInfo, { indent: 4 }); //this is for later usage displaying for all to see
                
                        ss.config.verbose && ss.log.info(`\n${ss.distributed_config}`);
            
                        // console.log(ss.permissions);
                
                        retrieved = true;
                        startServer();
                    } else {
                        if (offline && (configInfo.servicesMeta.startTime > ss.config.client.servicesMeta.startTime) && ss.isPerpetual) {
                            console.log("Services server restarted, restarting...");
                            process.exit(1337);
                        };
                        offline = false;
                    };
                } else {
                    if (!retrieved) {
                        ss.log.yellow(`Config retrieval failed. Retrying in ${nextTimeout / 1e3} seconds...`);
                        setTimeout(() => {
                            connectWebSocket(retryCount + 1);
                        }, nextTimeout);
                    };
                };

                return true;
            }, (event) => {
                console.log("damn, it closed. that sucks.");

                if (!offline) {
                    nextTimeout = 1e3;
                    offline = true;
                };

                if (retrieved) {
                    ss.log.yellow(`Services server offline. Retrying in ${nextTimeout / 1e3} seconds...`);
                    setTimeout(() => {
                        connectWebSocket(retryCount + 1);
                    }, nextTimeout);
                };
            });
        } catch (err) {
            if (!retrieved) {
                ss.log.red(`WebSocket connection failed: ${err.message}. Retrying in ${nextTimeout / 1e3} seconds... (Attempt ${retryCount + 1})`);
                setTimeout(() => {
                    connectWebSocket(retryCount + 1);
                }, nextTimeout);
            };
        };
    };

    try {
        var nextTimeout = 0;
        connectWebSocket();
    } catch (error) {
        console.error(error);
    };
})();