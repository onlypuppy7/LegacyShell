import { spawn } from 'child_process';
import { join } from 'path';
import Fastify from 'fastify';

import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const fastify = Fastify({ logger: true });

// Serve sqlite-web via an endpoint
fastify.get('/db-editor', async (request, reply) => {
  const dbPath = join(__dirname, './../../server-services/store/LegacyShellData.db');

  // Spawn sqlite-web
  const sqliteWeb = spawn('sqlite-web', ['--no-browser', '--read-only', dbPath]);

  sqliteWeb.stdout.on('data', (data) => {
    fastify.log.info(`stdout: ${data}`);
  });

  sqliteWeb.stderr.on('data', (data) => {
    fastify.log.error(`stderr: ${data}`);
  });

  sqliteWeb.on('close', (code) => {
    fastify.log.info(`sqlite-web process exited with code ${code}`);
  });

  // Redirect to the sqlite-web UI running on the default port (e.g., localhost:8080)
  reply.redirect('http://localhost:8080');
});

// Start your Fastify server
fastify.listen({ port: 3000 }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  fastify.log.info(`Server running at ${address}`);
});
