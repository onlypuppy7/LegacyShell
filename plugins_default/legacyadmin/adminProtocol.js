import path from 'node:path';
import { execFile } from 'node:child_process';
import { scanEditableFiles, readFile, writeFile } from './fileScanner.js';

// Run a command, capture combined stdout+stderr, never reject.
function run(cmd, args, cwd) {
    return new Promise((resolve) => {
        execFile(cmd, args, { cwd, timeout: 300e3, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
            resolve({ ok: !err, code: err?.code ?? 0, out: `$ ${cmd} ${args.join(' ')}\n${stdout || ''}${stderr || ''}`.trim() });
        });
    });
};

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
            // git pull --ff-only + npm install in the repo root. Does NOT restart - the caller
            // hits Restart afterwards. tag echoes back so a bulk "update all" can correlate.
            case 'adminUpdatePull': {
                const pull = await run('git', ['pull', '--ff-only'], rootDir);
                const npm = pull.ok ? await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--no-audit', '--no-fund'], rootDir) : { ok: false, out: '(skipped - git pull failed)' };
                const ok = pull.ok && npm.ok;
                record({ action: 'adminUpdatePull', target: roleLabel, result: ok ? 'ok' : 'error' });
                ws.send(JSON.stringify({ adminUpdatePull: { role: roleLabel, ok, tag: msg.tag, output: [pull.out, npm.out].join('\n\n') } }));
                break;
            };
        };
    } catch (error) {
        record({ action: msg.cmd, target: msg.file || null, result: 'error', detail: { error: String(error?.message || error) } });
        ws.send(JSON.stringify({ error: String(error?.message || error) }));
    };
};
