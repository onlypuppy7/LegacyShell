import path from 'node:path';
import { scanEditableFiles, readFile, writeFile } from './fileScanner.js';

// One handler shared by all three roles - only `verify` and `rootDir` differ per role (see
// index.js). On services `verify` checks the submitted sqlPassword against the real hash; on a
// routed game/client instance it's `() => true`, because the command already passed services'
// routing-gate authorization and arrived on the trusted persistent connection.
export async function handleAdminMessage({ msg, ws, verify, rootDir, roleLabel, audit }) {
    const record = typeof audit === 'function' ? audit : () => {};

    if (!(await verify(msg))) {
        record({ action: msg.cmd, target: msg.file || null, result: 'denied' });
        ws.send(JSON.stringify({ error: 'Invalid SQL password' }));
        return;
    };

    const toRel = (abs) => path.relative(rootDir, abs).split(path.sep).join('/');
    const resolveAllowedFile = (relPath) => {
        if (typeof relPath !== 'string') return null;
        const { core, plugins, other } = scanEditableFiles(rootDir);
        return [...core, ...plugins, ...other].find(abs => toRel(abs) === relPath) || null;
    };

    try {
        switch (msg.cmd) {
            case 'adminListFiles': {
                const { core, plugins, other } = scanEditableFiles(rootDir);
                ws.send(JSON.stringify({
                    adminListFiles: { role: roleLabel, core: core.map(toRel), plugins: plugins.map(toRel), other: other.map(toRel) },
                }));
                break;
            };
            case 'adminReadFile': {
                const absPath = resolveAllowedFile(msg.file);
                if (!absPath) { record({ action: 'adminReadFile', target: msg.file, result: 'denied' }); ws.send(JSON.stringify({ error: 'Unknown or disallowed file' })); break; };
                const { raw } = readFile(absPath);
                record({ action: 'adminReadFile', target: msg.file, result: 'ok' });
                ws.send(JSON.stringify({ adminReadFile: { file: msg.file, raw } }));
                break;
            };
            case 'adminWriteFile': {
                const absPath = resolveAllowedFile(msg.file);
                if (!absPath) { record({ action: 'adminWriteFile', target: msg.file, result: 'denied' }); ws.send(JSON.stringify({ error: 'Unknown or disallowed file' })); break; };
                writeFile(absPath, msg.raw);
                record({ action: 'adminWriteFile', target: msg.file, result: 'ok', detail: { bytes: typeof msg.raw === 'string' ? msg.raw.length : null } });
                ws.send(JSON.stringify({ adminWriteFile: { file: msg.file, success: true } }));
                break;
            };
            // Restarts THIS process specifically - see index.js for how "restart services" from
            // a client/game instance instead relays adminRestartServices to services itself,
            // rather than calling this locally.
            case 'adminRestartThis':
            case 'adminRestartServices': {
                record({ action: msg.cmd, target: roleLabel, result: 'ok' });
                ws.send(JSON.stringify({ [msg.cmd]: { success: true } }));
                // 1337 is the established "intended restart" exit code puppyperpetual watches
                // for (see start-client.js/start-game.js's own self-restart calls) - delayed one
                // tick so the success response above actually reaches the client first.
                setImmediate(() => process.exit(1337));
                break;
            };
        };
    } catch (error) {
        record({ action: msg.cmd, target: msg.file || null, result: 'error', detail: { error: String(error?.message || error) } });
        ws.send(JSON.stringify({ error: String(error?.message || error) }));
    };
};
