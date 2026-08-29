import path from 'node:path';
import { scanEditableFiles, readFile, writeFile } from './fileScanner.js';

// One handler shared by all three roles - only `verify` and `rootDir` differ per role (see
// index.js). Services can check a submitted sqlPassword itself (it holds the real hash); client
// and game can't, so their `verify` relays the check to services over #wsrequest instead (see
// index.js's remoteVerify) - this is exactly why adminVerifyPassword exists as its own command,
// separate from every other action, so a client/game instance never needs the real password
// locally to gate access to ITS OWN files.
export async function handleAdminMessage({ msg, ws, verify, rootDir, roleLabel }) {
    if (msg.cmd === 'adminVerifyPassword') {
        // Only meaningful on services (the only role that can answer this for real) - client/game
        // never receive this cmd themselves, they ask services via remoteVerify instead.
        ws.send(JSON.stringify({ adminVerifyPassword: { valid: await verify(msg) } }));
        return;
    };

    if (!(await verify(msg))) {
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
                if (!absPath) { ws.send(JSON.stringify({ error: 'Unknown or disallowed file' })); break; };
                const { raw } = readFile(absPath);
                ws.send(JSON.stringify({ adminReadFile: { file: msg.file, raw } }));
                break;
            };
            case 'adminWriteFile': {
                const absPath = resolveAllowedFile(msg.file);
                if (!absPath) { ws.send(JSON.stringify({ error: 'Unknown or disallowed file' })); break; };
                writeFile(absPath, msg.raw);
                ws.send(JSON.stringify({ adminWriteFile: { file: msg.file, success: true } }));
                break;
            };
            // Restarts THIS process specifically - see index.js for how "restart services" from
            // a client/game instance instead relays adminRestartServices to services itself,
            // rather than calling this locally.
            case 'adminRestartThis':
            case 'adminRestartServices': {
                ws.send(JSON.stringify({ [msg.cmd]: { success: true } }));
                // 1337 is the established "intended restart" exit code puppyperpetual watches
                // for (see start-client.js/start-game.js's own self-restart calls) - delayed one
                // tick so the success response above actually reaches the client first.
                setImmediate(() => process.exit(1337));
                break;
            };
        };
    } catch (error) {
        ws.send(JSON.stringify({ error: String(error?.message || error) }));
    };
};
