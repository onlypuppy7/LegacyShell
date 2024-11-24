//legacyshell: request
import WebSocket from 'ws';
//

/**
 * Dumps your garbage into a WebSocket and gives you whatever shit the server decides to throw back.
 *
 * @param {Object} payload - The data you’re force-feeding to the server.
 * @param {string} url - The WebSocket server URL. Don’t fuck this up.
 * @param {string} [auth_key] - Optional. If you've got one, it’s getting jammed into the payload whether the server likes it or not.
 * @returns {Promise<*>} - Resolves with whatever mess the server sends back or throws an error if the WebSocket decides to shit the bed.
 * 
 * @example
 * const response = await exported({ cmd: 'ping' }, ss.config.game.services_server, ss.config.game.auth_key);
 * console.log(response); // Or don’t, if you enjoy the thrill of getting completely fucked over.
 * 
 * @throws {Error} If the WebSocket throws a fit.
 */
const wsrequest = async function (payload, url, auth_key, onmessage, onclose) {
    const ws = new WebSocket(url);
    return new Promise((resolve, reject) => {
        if (auth_key) payload.auth_key = auth_key;
        ws.onopen = function() {
            ws.send(JSON.stringify(payload));
        };
        ws.onmessage = function(event) {
            let response = event.data;
            response = JSON.parse(response);
            resolve(response);
            if (!onmessage) ws.close();
            else if (!onmessage(event, ws)) ws.close();
        };
        ws.onerror = function(error) {
            reject('WebSocket error: ' + error.message);
        };
        ws.onclose = function(event) {
            onclose && onclose(event);
        };
    });
};

export default wsrequest;