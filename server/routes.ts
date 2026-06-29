import type { FastifyInstance } from 'fastify';
import * as repo from './repo';
import * as checklists from './checklists';
import * as engage from './engage';

// `:id` params are validated as positive integers. Fastify coerces "5" -> 5 and rejects junk
// with a clean 400 instead of letting NaN reach better-sqlite3 and 500 the request.
const idSchema = {
  schema: {
    params: {
      type: 'object',
      required: ['id'],
      additionalProperties: false,
      properties: { id: { type: 'integer', minimum: 1 } },
    },
  },
};

// POST /entries: type + title are mandatory; everything else (meta/tags/locale/...) passes through.
const newEntrySchema = {
  schema: {
    body: {
      type: 'object',
      required: ['type', 'title'],
      additionalProperties: true,
      properties: {
        type: { type: 'string', minLength: 1 },
        title: { type: 'string', minLength: 1 },
      },
    },
  },
};

// Parse a query number, returning undefined for missing/empty/non-finite input so that
// `?limit=abc` becomes "no limit" instead of NaN reaching the SQL LIMIT bind and 500-ing.
const numParam = (v: string | undefined): number | undefined => {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export async function registerRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true, name: 'ARS3NAL' }));

  app.get('/stats', async (req) => repo.stats((req.query as { locale?: string }).locale));

  app.get('/categories', async (req) => {
    const { type, locale } = req.query as { type?: string; locale?: string };
    return repo.listCategories(type ?? 'payload', locale);
  });

  app.get('/entries', async (req) => {
    const q = req.query as Record<string, string>;
    return repo.listEntries({
      type: q.type,
      category: q.category,
      tag: q.tag,
      favorite: q.favorite === '1' || q.favorite === 'true',
      locale: q.locale,
      limit: numParam(q.limit),
      offset: numParam(q.offset),
    });
  });

  app.get('/entries/:id', idSchema, async (req, reply) => {
    const { id } = req.params as { id: number };
    const e = repo.getEntry(id);
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.post('/entries', newEntrySchema, async (req) => {
    return repo.createEntry(req.body as repo.EntryInput);
  });

  app.put('/entries/:id', idSchema, async (req, reply) => {
    const { id } = req.params as { id: number };
    const e = repo.updateEntry(id, req.body as Partial<repo.EntryInput>);
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.delete('/entries/:id', idSchema, async (req, reply) => {
    const { id } = req.params as { id: number };
    if (!repo.deleteEntry(id)) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.patch('/entries/:id/favorite', idSchema, async (req, reply) => {
    const { id } = req.params as { id: number };
    const e = repo.toggleFavorite(id);
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.patch('/entries/:id/notes', idSchema, async (req, reply) => {
    const { id } = req.params as { id: number };
    const { notes } = req.body as { notes: string };
    const e = repo.setNotes(id, notes ?? '');
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.get('/search', async (req) => {
    const { q, type, limit, locale } = req.query as { q?: string; type?: string; limit?: string; locale?: string };
    if (!q) return [];
    return repo.search(q, type, numParam(limit), locale);
  });

  // ── Checklists ──────────────────────────────────────────────────────────
  app.get('/checklists', async (req) => {
    const locale = (req.query as { locale?: string }).locale === 'en' ? 'en' : 'ru';
    return checklists.listChecklists(locale);
  });

  app.get('/checklists/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const locale = (req.query as { locale?: string }).locale === 'en' ? 'en' : 'ru';
    const c = checklists.getChecklist(slug, locale);
    if (!c) return reply.code(404).send({ error: 'not found' });
    return c;
  });

  // Toggle a single item (persists across re-seed).
  app.patch('/checklists/item', async (req, reply) => {
    const { key, checked } = req.body as { key?: string; checked?: boolean };
    if (!key) return reply.code(400).send({ error: 'key required' });
    return checklists.setItemChecked(key, !!checked);
  });

  // Per-item personal note.
  app.patch('/checklists/item/note', async (req, reply) => {
    const { key, note } = req.body as { key?: string; note?: string };
    if (!key) return reply.code(400).send({ error: 'key required' });
    return checklists.setItemNote(key, note ?? '');
  });

  // Per-checklist personal note.
  app.patch('/checklists/:slug/note', async (req) => {
    const { slug } = req.params as { slug: string };
    const { note } = req.body as { note?: string };
    return checklists.setChecklistNote(slug, note ?? '');
  });

  // Uncheck all items in a checklist (keeps notes).
  app.post('/checklists/:slug/reset', async (req) => {
    const { slug } = req.params as { slug: string };
    return checklists.resetChecklist(slug);
  });

  // ── Engagements (targets) + findings ──────────────────────────────────────
  app.get('/targets', async () => engage.listTargets());
  app.post('/targets', async (req) => engage.createTarget(req.body as Partial<engage.Target>));
  app.put('/targets/:id', idSchema, async (req, reply) => {
    const t = engage.updateTarget((req.params as { id: number }).id, req.body as Partial<engage.Target>);
    return t ?? reply.code(404).send({ error: 'not found' });
  });
  app.delete('/targets/:id', idSchema, async (req) => ({ ok: engage.deleteTarget((req.params as { id: number }).id) }));
  app.post('/targets/:id/activate', idSchema, async (req, reply) => {
    const t = engage.activateTarget((req.params as { id: number }).id);
    return t ?? reply.code(404).send({ error: 'not found' });
  });
  app.get('/findings', async (req) => {
    return engage.listFindings(numParam((req.query as { target?: string }).target));
  });
  app.post('/findings', async (req) => engage.createFinding(req.body as Partial<engage.Finding>));
  app.put('/findings/:id', idSchema, async (req, reply) => {
    const f = engage.updateFinding((req.params as { id: number }).id, req.body as Partial<engage.Finding>);
    return f ?? reply.code(404).send({ error: 'not found' });
  });
  app.delete('/findings/:id', idSchema, async (req) => ({ ok: engage.deleteFinding((req.params as { id: number }).id) }));

  // ── Backup / restore ──────────────────────────────────────────────────────
  app.get('/backup', async (_req, reply) => {
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="arsenal-backup.json"');
    return repo.exportData();
  });

  app.post('/restore', async (req, reply) => {
    const body = req.body as { entries?: unknown };
    if (!body || !Array.isArray(body.entries)) return reply.code(400).send({ error: 'invalid backup file' });
    try { return repo.importData(body); }
    catch { return reply.code(400).send({ error: 'invalid backup file' }); } // malformed entry shape -> 400, not 500 (tx auto-rolls back)
  });

  // Merge: add a backup's personal data without wiping the current DB.
  app.post('/merge', async (req, reply) => {
    const body = req.body as { entries?: unknown };
    if (!body || !Array.isArray(body.entries)) return reply.code(400).send({ error: 'invalid backup file' });
    try { return repo.mergeData(body); }
    catch { return reply.code(400).send({ error: 'invalid backup file' }); }
  });
}
