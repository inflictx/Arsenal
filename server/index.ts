import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkpoint } from './db'; // importing also initialises the schema
import { registerRoutes } from './routes';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 7331);
const HOST = '127.0.0.1';

const app = Fastify({ logger: false, bodyLimit: 64 * 1024 * 1024 }); // 64MB — restore uploads the full backup JSON

// DNS-rebinding guard. The server binds 127.0.0.1, but a malicious page can rebind its own domain
// to 127.0.0.1 and reach this local server from the victim's browser (where the Host header is the
// attacker's domain, not localhost). Reject any request whose Host is not one of our local origins,
// so /api/backup can't be read nor /api/restore abused that way. Documented access is localhost:PORT.
const ALLOWED_HOSTS = new Set([
  `localhost:${PORT}`, `127.0.0.1:${PORT}`, `[::1]:${PORT}`,
  'localhost', '127.0.0.1', '[::1]', // port-less forms (e.g. PORT 80/443)
]);
app.addHook('onRequest', async (req, reply) => {
  const host = (req.headers.host ?? '').toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return reply.code(403).send({ error: 'host not allowed' });
  }
});

await app.register(registerRoutes, { prefix: '/api' });

// Local personal tool — never let the browser persist ANY response to its on-disk cache.
// The JS bundle embeds verbatim payloads (incl. the full pentestmonkey PHP reverse shell); if the
// browser writes it to disk cache (OUTSIDE our Defender exclusion) AV flags it Trojan:PHP/RevWebshell.
// A global onSend hook is the only reliable override — @fastify/static's default cacheControl
// otherwise emits `public, max-age=0`, and `public` is enough for the browser to store it on disk.
app.addHook('onSend', async (_req, reply) => {
  reply.header('cache-control', 'no-store');
});

// Serve the built frontend in production (web/dist). In dev, Vite serves it.
const dist = join(here, '..', 'web', 'dist');
if (existsSync(dist)) {
  await app.register(fastifyStatic, {
    root: dist,
    prefix: '/',
    cacheControl: false, // don't emit `public, max-age=0`; the global onSend hook sets no-store
  });
}

// Fold the WAL back into arsenal.db on clean exit (otherwise the -wal file grows unbounded).
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => { checkpoint(); process.exit(0); });
}

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`[ARS3NAL] running at http://localhost:${PORT}`);
} catch (err) {
  console.error('[ARS3NAL] failed to start:', err);
  process.exit(1);
}
