//legacyshell: services link
import WebSocket from 'ws';
//legacyshell: ss
import { ss } from '#misc';
//legacyshell: logging
import log from 'puppylog';
//

//joining used to open a brand new connection to services (dns, tcp, tls, ws upgrade...) for every getUser, and with services on another machine that was most of the join.
//this keeps a few open instead. services answers each message with one reply and no id, so a socket only ever has one request in flight, the rest queue.
//never rejects, null just means "do it the old way" (client.js falls back to wsrequest)

const size = 3;
const timeout = 5e3;
const keepAlive = 30e3; //proxies drop quiet sockets

const sockets = []; //{ ws, busy, current }
const queue = [];

function connect() {
    const socket = { ws: null, busy: false, current: null };
    sockets.push(socket);
    try {
        const ws = socket.ws = new WebSocket(ss.config.game.services_server);
        const ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.ping(), keepAlive);

        ws.on('message', (data) => {
            const job = socket.current;
            if (!job) return;
            let response = null;
            try { response = JSON.parse(data.toString()) } catch (error) { };
            finish(socket, response && !response.error ? response : null);
        });
        ws.on('open', () => next());
        ws.on('error', () => { });
        ws.on('close', () => {
            clearInterval(ping);
            sockets.splice(sockets.indexOf(socket), 1);
            finish(socket, null);
            setTimeout(() => sockets.length < size && connect(), 2e3);
        });
    } catch (error) {
        log.error("servicesLink: couldn't connect:", error);
        sockets.splice(sockets.indexOf(socket), 1);
    };
};

function finish(socket, response) {
    const job = socket.current;
    socket.current = null;
    socket.busy = false;
    if (job) {
        clearTimeout(job.timer);
        job.resolve(response);
    };
    next();
};

function next() {
    while (queue.length) {
        const socket = sockets.find(socket => !socket.busy && socket.ws && socket.ws.readyState === WebSocket.OPEN);
        if (!socket) return;
        const job = queue.shift();
        clearTimeout(job.waitTimer);
        socket.busy = true;
        socket.current = job;
        job.timer = setTimeout(() => {
            log.warning("servicesLink: getUser timed out, dropping that socket");
            socket.ws.terminate(); //a late reply would answer the wrong job
        }, timeout);
        socket.ws.send(JSON.stringify({ cmd: "getUser", session: job.session, auth_key: ss.config.game.auth_key }));
    };
};

export function warm() {
    while (sockets.length < size) connect();
};

//-> { userData, sessionData } or null
export function getUser(session) {
    if (typeof session !== "string" || session.length === 0 || session.length > 256) return Promise.resolve(null);
    return new Promise(resolve => {
        const open = sockets.some(socket => socket.ws && socket.ws.readyState === WebSocket.OPEN);
        if (!open) {
            warm(); //nothing usable yet, this one takes the old route
            return resolve(null);
        };
        const job = { session, resolve, timer: null, waitTimer: null };
        job.waitTimer = setTimeout(() => { //all sockets busy or dying for too long
            const idx = queue.indexOf(job);
            if (idx !== -1) queue.splice(idx, 1), resolve(null);
        }, timeout);
        queue.push(job);
        next();
    });
};

export default { warm, getUser };
