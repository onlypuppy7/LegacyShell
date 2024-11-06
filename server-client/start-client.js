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
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

//i know its called start, even though it should be the other way round. please excuse this.
//i just didnt want to break old configs for the perpetual wrapper.

export default async function run () {
    Object.assign(ss, {
        cache: {},
        misc,
    });

    let retrieved = false;
    let offline = false;

    await plugins.emit('onLoad', { ss });

    async function startServer() {
        try {
            const app = express();
            const port = ss.config.client.port || 13370;

            await plugins.emit('onStartServer', { ss, app });

            if (ss.config.client.closed) {
                await plugins.emit('closedBeforeDefault', { ss, app });
                app.use(express.static(path.join(ss.currentDir, 'src', 'client-closed')));

                app.use((req, res, next) => {
                    if (req.path !== '/closed' && req.path !== '/discord') {
                        res.redirect('/closed');
                    } else {
                        next();
                    };
                });

                await plugins.emit('closedAfterDefault', { ss, app });

                log.bgRed('Server is running in closed mode.');
            } else {
                await plugins.emit('openBeforeDefault', { ss, app });

                try {
                    if (ss.config.client.login.enabled) {
                        console.log("Password enabled:", ss.config.client.login);
                        app.use(checkPassword);
                    };
                } catch (error) {
                    console.log("Starting client server failed:", error);
                    // process.exit(1);
                };

                app.use(express.static(path.join(ss.currentDir, 'store', 'client-modified')));
                app.use(express.static(path.join(ss.currentDir, 'src', 'client-static')));

                app.use((req, res, next) => {
                    console.log(req.path);
                    if (req.path.includes("closed")) {
                        res.redirect('/');
                    } else {
                        next();
                    };
                });

                await plugins.emit('openAfterDefault', { ss, app });

                retrieved = 2;
                try {
                    await plugins.emit('beforePrepareModified', { ss, app });
                    await prepareModified();
                    await plugins.emit('afterPrepareModified', { ss, app });
                } catch (error) {
                    console.error('Modification failed:', error);
                    process.exit(1);
                };
            };

            app.get('/discord', async (req, res) => {
                res.redirect('https://discord.gg/' + ss.config.client.discordServer);
            });

            app.listen(port, async () => {
                log.success(`\nServer is running on http://localhost:${port}`);
                await plugins.emit('onServerRunning', { ss, app });
            });
        } catch (error) {
            console.log(error);
        };
    };

    const checkPassword = async (req, res, next) => {
        try {
            const auth = { login: ss.config.client.login.username, password: ss.config.client.login.password };
        
            const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
            const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

            await plugins.emit('onCheckPassword', { ss, req, res, next, login, password, auth });
        
            // console.log(login, password, auth.login, auth.password);

            if (login && password && login === auth.login && password === auth.password) {
                return next();
            };
        
            res.set('WWW-Authenticate', 'Basic realm="Protected Area"');
            res.status(401).send('Authentication required.');
        } catch (error) { console.error(error) };
    };

    //all this is retrieving the config:

    let filepaths = {
        items: path.join(ss.currentDir, 'store', 'items.json'),
        maps: path.join(ss.currentDir, 'store', 'maps.json'),
        servers: path.join(ss.currentDir, 'store', 'servers.json'),
    };

    await plugins.emit('filepaths', { ss, filepaths });

    async function connectWebSocket(retryCount = 0) {
        nextTimeout = Math.min(nextTimeout + 5e3, 30e3);

        await plugins.emit('onConnectWebSocket', { ss, retryCount, nextTimeout });

        try {
            log.blue('WebSocket connection opening. Requesting config information...');
            await wsrequest({
                cmd: "requestConfig",
                    lastItems: Math.floor(misc.getLastSavedTimestamp(filepaths.items)/1000), //well in theory, if its not in existence this returns 0 and we should get it :D
                    lastMaps: Math.floor(misc.getLastSavedTimestamp(filepaths.maps)/1000),
                    lastServers: Math.floor(misc.getLastSavedTimestamp(filepaths.servers)/1000),
            }, ss.config.client.sync_server, undefined, async (event) => {
                let response = event.data;
                var configInfo = JSON.parse(response);

                await plugins.emit('onConfigInfo', { ss, configInfo });

                if (configInfo) {
                    if (!retrieved) {
                        log.green('Received config information from sync server.');
                        offline = false;

                        await plugins.emit('onConfigInfoReceived', { ss, configInfo });
                
                        const load = async function(thing, filePath) {
                            await plugins.emit('onLoadThing', { ss, thing, filePath });

                            if (configInfo[thing]) {
                                log.blue(`[${thing}] loaded from newly retrieved json.`)
                                configInfo[thing] = JSON.stringify(configInfo[thing]);
                                fs.writeFileSync(filePath, configInfo[thing]); //dont convert the json. there is no need.
                                ss.cache[thing] = configInfo[thing];
                                delete configInfo[thing];
                            } else {
                                delete configInfo[thing]; //still delete the false, derp
                                if (fs.existsSync(filePath)) {
                                    log.italic(`[${thing}] loaded from previously saved json.`);
                                    ss.cache[thing] = fs.readFileSync(filePath, 'utf8');
                                } else {
                                    log.red(`Shit. We're fucked. We didn't receive an [${thing}] json nor do we have one stored. FUUUU-`);
                                };
                            };
                        };
                
                        await load("items", filepaths.items);
                        await load("maps", filepaths.maps);
                        await load("servers", filepaths.servers);

                        await plugins.emit('loadingThings', { ss, load, filepaths });
                
                        // console.log(ss.items);
                
                        delete configInfo.distributed_game;
            
                        configInfo = { ...configInfo, ...configInfo.distributed_client };
                        delete configInfo.distributed_client;
                
                        configInfo = { ...configInfo, ...configInfo.distributed_all };
                        delete configInfo.distributed_all;
                
                        
                        Object.assign(ss, {
                            permissions: configInfo.permissions
                        });
                        delete configInfo.permissions;
            
                        ss.config.client = { ...ss.config.client, ...configInfo };

                        delete configInfo.login;
                        delete configInfo.permissions;

                        await plugins.emit('onConfigInfoLoaded', { ss, configInfo });
            
                        ss.distributed_config = yaml.dump(configInfo, { indent: 4 }); //this is for later usage displaying for all to see
                
                        ss.config.verbose && log.info(`\n${ss.distributed_config}`);
            
                        // console.log(ss.permissions);
                
                        retrieved = true;
                        await startServer();
                    } else {
                        if (offline && (configInfo.servicesMeta.startTime > ss.config.client.servicesMeta.startTime) && ss.isPerpetual) {
                            console.log("Services server restarted, restarting...");
                            await plugins.emit('onServicesRestart', { ss, configInfo });
                            process.exit(1337);
                        };
                        offline = false;
                    };
                } else {
                    if (!retrieved) {
                        log.yellow(`Config retrieval failed. Retrying in ${nextTimeout / 1e3} seconds...`);
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
                    log.yellow(`Services server offline. Retrying in ${nextTimeout / 1e3} seconds...`);
                    setTimeout(() => {
                        connectWebSocket(retryCount + 1);
                    }, nextTimeout);
                };
            });
        } catch (err) {
            if (!retrieved) {
                log.red(`WebSocket connection failed: ${err.message}. Retrying in ${nextTimeout / 1e3} seconds... (Attempt ${retryCount + 1})`);
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
};