// adminGetPerf: process CPU% / memory / uptime for an instance. Handled directly here for the
// services role; game/client answer the routed form in legacyadmin/index.js's onServicesCommand.
// Moderator+ (it's just numbers). Shared sampler so game/client can import it too.
import os from 'node:os';
import { requireModeratorOrAbove } from './auth.js';

export async function samplePerf(role) {
    const start = process.cpuUsage();
    await new Promise(r => setTimeout(r, 200));
    const d = process.cpuUsage(start);
    const cpuPercent = Math.round(((d.user + d.system) / 1000 / 200) * 100 * 10) / 10; // % of one core over the window
    const mem = process.memoryUsage();
    return {
        role,
        pid: process.pid,
        uptimeSec: Math.round(process.uptime()),
        cpuPercent,
        rssMB: Math.round(mem.rss / 1048576 * 10) / 10,
        heapMB: Math.round(mem.heapUsed / 1048576 * 10) / 10,
        loadavg1: Math.round(os.loadavg()[0] * 100) / 100,
        cpuCount: os.cpus().length,
        sysFreeMB: Math.round(os.freemem() / 1048576),
        sysTotalMB: Math.round(os.totalmem() / 1048576),
        nodeVersion: process.version,
    };
};

export function registerPerf(plugins) {
    plugins.on('services:unhandledCommand', async ({ msg, ws, ip }) => {
        if (msg.cmd !== 'adminGetPerf') return;
        plugins.cancel = true;
        if (!(await requireModeratorOrAbove(msg, ws, ip))) return;
        ws.send(JSON.stringify({ adminGetPerf: { ...(await samplePerf('services')), tag: msg.tag } }));
    });
};
