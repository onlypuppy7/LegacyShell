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
import { spawn } from 'cross-spawn';
import { prepareStamps } from '#stampsGenerator';
//legacyshell: logging
import log from '#coloured-logging';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: plugins
import { plugins } from '#plugins';
//

export var ws;

//i know its called start, even though it should be the other way round. please excuse this.
//i just didnt want to break old configs for the perpetual wrapper.

export default async function run () {
    Object.assign(ss, {
        cache: {},
        misc,
    });

    let retrieved = false;
    let offline = false;

    var servicesInfo = "";

    await plugins.emit('onLoad', { ss });

    const port = ss.config.client.port || 13370;

    async function startServer() {
        try {
            let serverStartTime = Date.now();

            var started = false;

            const app = express();

            app.listen(port);

            await plugins.emit('onStartServer', { ss, app, ws });

            app.use(express.static(path.join(ss.currentDir, 'src', 'client-imgs')));

            app.get('/discord', async (req, res) => {
                res.redirect('https://discord.gg/' + ss.config.client.discordServer);
            });

            app.use(async (req, res, next) => {
                await plugins.emit('onRequest', { ss, req, res, next });
                if (!plugins.cancel) next();
            });

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

                //delete index.html from client-modified
                fs.rmSync(path.join(ss.currentDir, 'store', 'client-modified', 'index.html'), { force: true });

                app.use(express.static(path.join(ss.currentDir, 'store', 'client-modified')));
                app.use(express.static(path.join(ss.currentDir, 'src', 'client-static')));

                try {
                    if (ss.config.client.login.enabled) {
                        console.log("Password enabled:", ss.config.client.login);
                        app.use(checkPassword);
                    };
                } catch (error) {
                    console.log("Starting client server failed:", error);
                    // process.exit(1);
                };

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
                    let promiseStart = Date.now();

                    buildWiki(); //not essential, can just be left here to do its thing
                    await Promise.all([
                        prepareStamps(),
                        prepareModified(),
                    ]);
                    log.success('All start-client promises resolved in ' + (Date.now() - promiseStart) + 'ms');

                    delete ss.cache; //MEMORY LEAK FUCKING MI-Mi-mi-MITIGATED!!!
                } catch (error) {
                    log.error('One of the start-client promises rejected:', error);
                };

                //if yuo ever want it sequential do this
                // await prepareStamps();
                // await prepareModified();
                // await buildWiki();

                // try {
                //     await plugins.emit('beforePrepareStamps', { ss, app });
                //     await prepareStamps();
                //     await plugins.emit('afterPrepareStamps', { ss, app });
                // } catch (error) {
                //     console.error('Stamp preparation failed:', error);
                //     process.exit(1);
                // };

                // try {
                //     await plugins.emit('beforePrepareModified', { ss, app });
                //     await prepareModified();
                //     await plugins.emit('afterPrepareModified', { ss, app });
                // } catch (error) {
                //     console.error('Modification failed:', error);
                //     process.exit(1);
                // };
            };

            var wikiPath = path.join(ss.rootDir, 'wiki', '.vuepress', 'dist');
            var assetsPath = path.join(ss.rootDir, 'wiki', '.vuepress', 'dist', 'assets');

            app.use('/wiki/', express.static(wikiPath));
            app.use('/assets/', express.static(assetsPath));

            log.success(`\nServer is running on http://localhost:${port} in ${Date.now() - serverStartTime}ms`);
            started = true;
            await plugins.emit('onServerRunning', { ss, app });
        } catch (error) {
            console.log(error);
        };
    };

    async function buildWiki () {
        let wikiStart = Date.now();

        log.info('Starting VuePress build...');

        return new Promise((resolve, reject) => {
            const vuepressBuild = spawn('npx', ['vuepress', 'build', 'wiki']);
    
            vuepressBuild.stdout.on('data', (data) => {
                log.cyan(`Build output: ${data}`);
            });
    
            vuepressBuild.stderr.on('data', (data) => {
                // log.error(`Build error: ${data}`);
                log.cyan(`Build output: ${data}`); //this is not an error, just output, i dont know why it gets treated as such
            });
    
            vuepressBuild.on('close', (code) => {
                log.success(`VuePress build complete in ${Date.now() - wikiStart}ms. Wiki will be available at http://localhost:${port}/wiki`);
                resolve();
            });
    
            vuepressBuild.on('error', (err) => {
                reject(new Error(`VuePress build process encountered an error: ${err.message}`));
            });
        });
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
        nextTimeout = Math.min(nextTimeout + 3e3, 30e3);

        await plugins.emit('onConnectWebSocket', { ss, retryCount, nextTimeout });

        try {
            log.blue('WebSocket connection opening. Requesting config information...');
            await wsrequest({
                cmd: "requestConfig",
                serverType: "client",
                lastItems: Math.floor(misc.getLastSavedTimestamp(filepaths.items)/1000), //well in theory, if its not in existence this returns 0 and we should get it :D
                lastMaps: Math.floor(misc.getLastSavedTimestamp(filepaths.maps)/1000),
                lastServers: Math.floor(misc.getLastSavedTimestamp(filepaths.servers)/1000),
            }, ss.config.client.sync_server, undefined, async (event, wsP) => {
                let response = event.data;
                var msg = JSON.parse(response);
                ws = wsP;

                ss.config.verbose && (log.dim("Received cmd: "+msg.cmd), msg.cmd !== "requestConfig" && console.log(msg));

                await plugins.emit('onMsg', { this: this, ss, msg });

                switch (msg.cmd) {
                    case "requestConfig":
                        if (!retrieved) {
                            log.green('Received config information from sync server.');
                            offline = false;

                            await plugins.emit('onConfigInfoReceived', { ss, configInfo: msg });
                    
                            const load = async function(thing, filePath) {
                                await plugins.emit('onLoadThing', { ss, thing, filePath });

                                if (msg[thing]) {
                                    log.blue(`[${thing}] loaded from newly retrieved json.`)
                                    msg[thing] = JSON.stringify(msg[thing]);
                                    fs.writeFileSync(filePath, msg[thing]); //dont convert the json. there is no need.
                                    ss.cache[thing] = msg[thing];
                                    delete msg[thing];
                                } else {
                                    delete msg[thing]; //still delete the false, derp
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
                    
                            ss.distributed_data = JSON.parse(JSON.stringify(msg));

                            delete msg.distributed_game;
                
                            msg = { ...msg, ...msg.distributed_client };
                            delete msg.distributed_client;
                    
                            msg = { ...msg, ...msg.distributed_all };
                            delete msg.distributed_all;
                    
                            ss.config.servicesMeta = msg.servicesMeta;
                            delete msg.servicesMeta;

                            ss.config.restartTime = msg.restartTime;
                            delete msg.restartTime;
                            
                            Object.assign(ss, {
                                permissions: msg.permissions,
                                events: msg.events,
                            });
                            delete msg.permissions;
                            delete msg.events;
                
                            ss.config.client = { ...ss.config.client, ...msg };

                            delete msg.login;
                            delete msg.permissions;

                            await plugins.emit('onConfigInfoLoaded', { ss, configInfo: msg });
                
                            ss.distributed_config = yaml.dump(msg, { indent: 4 }); //this is for later usage displaying for all to see
                    
                            ss.config.verbose && log.info(`\n${ss.distributed_config}`);
                
                            // console.log(ss.permissions);
                    
                            retrieved = true;
                            await startServer();
                        } else {
                            if (offline && (msg.servicesMeta.startTime > ss.config.servicesMeta.startTime) && ss.isPerpetual) {
                                console.log("Services server restarted, restarting...");
                                await plugins.emit('onServicesRestart', { ss, configInfo: msg });
                                process.exit(1337);
                            };
                            offline = false;
                        };
                        break;
                    case "servicesInfo":
                        var info = {
                            ...msg.client,
                        };
                        var newServicesInfo = JSON.stringify(info);
                        if (Object.keys(info.gameInfo).length !== 0 && servicesInfo !== newServicesInfo) {
                            fs.writeFileSync(path.join(ss.currentDir, 'store', 'client-modified', 'servicesInfo.json'), newServicesInfo);
                        };
                        servicesInfo = newServicesInfo;
                        break;
                    default:
                        log.error(`Unknown command received: ${msg.cmd}`);
                        break;
                };
                
                // } else {
                //     if (!retrieved) {
                //         log.yellow(`Config retrieval failed. Retrying in ${nextTimeout / 1e3} seconds...`);
                //         setTimeout(() => {
                //             connectWebSocket(retryCount + 1);
                //         }, nextTimeout);
                //     };
                // };

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