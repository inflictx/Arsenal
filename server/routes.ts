import type { FastifyInstance } from 'fastify';
import * as repo from './repo';
import * as checklists from './checklists';
import * as engage from './engage';
import { getSetting } from './db';

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
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get('/entries/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const e = repo.getEntry(Number(id));
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.post('/entries', async (req, reply) => {
    const body = req.body as repo.EntryInput;
    if (!body?.type || !body?.title) return reply.code(400).send({ error: 'type and title are required' });
    return repo.createEntry(body);
  });

  app.put('/entries/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const e = repo.updateEntry(Number(id), req.body as Partial<repo.EntryInput>);
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.delete('/entries/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!repo.deleteEntry(Number(id))) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });

  app.patch('/entries/:id/favorite', async (req, reply) => {
    const { id } = req.params as { id: string };
    const e = repo.toggleFavorite(Number(id));
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.patch('/entries/:id/notes', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { notes } = req.body as { notes: string };
    const e = repo.setNotes(Number(id), notes ?? '');
    if (!e) return reply.code(404).send({ error: 'not found' });
    return e;
  });

  app.get('/search', async (req) => {
    const { q, type, limit, locale } = req.query as { q?: string; type?: string; limit?: string; locale?: string };
    if (!q) return [];
    return repo.search(q, type, limit ? Number(limit) : undefined, locale);
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

  // Generator datasets (reverse shells / commands), seeded into settings as JSON.
  app.get('/config/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const raw = getSetting(`config:${name}`);
    if (!raw) return reply.code(404).send({ error: 'config not found' });
    reply.header('content-type', 'application/json');
    return raw;
  });

  // ── Engagements (targets) + findings ──────────────────────────────────────
  app.get('/targets', async () => engage.listTargets());
  app.post('/targets', async (req) => engage.createTarget(req.body as Partial<engage.Target>));
  app.put('/targets/:id', async (req, reply) => {
    const t = engage.updateTarget(Number((req.params as { id: string }).id), req.body as Partial<engage.Target>);
    return t ?? reply.code(404).send({ error: 'not found' });
  });
  app.delete('/targets/:id', async (req) => ({ ok: engage.deleteTarget(Number((req.params as { id: string }).id)) }));
  app.post('/targets/:id/activate', async (req, reply) => {
    const t = engage.activateTarget(Number((req.params as { id: string }).id));
    return t ?? reply.code(404).send({ error: 'not found' });
  });
  app.get('/findings', async (req) => {
    const t = (req.query as { target?: string }).target;
    return engage.listFindings(t != null && t !== '' ? Number(t) : undefined);
  });
  app.post('/findings', async (req) => engage.createFinding(req.body as Partial<engage.Finding>));
  app.put('/findings/:id', async (req, reply) => {
    const f = engage.updateFinding(Number((req.params as { id: string }).id), req.body as Partial<engage.Finding>);
    return f ?? reply.code(404).send({ error: 'not found' });
  });
  app.delete('/findings/:id', async (req) => ({ ok: engage.deleteFinding(Number((req.params as { id: string }).id)) }));

  // ── Backup / restore ──────────────────────────────────────────────────────
  app.get('/backup', async (_req, reply) => {
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('content-disposition', 'attachment; filename="arsenal-backup.json"');
    return repo.exportData();
  });

  app.post('/restore', async (req, reply) => {
    const body = req.body as { entries?: unknown };
    if (!body || !Array.isArray(body.entries)) return reply.code(400).send({ error: 'invalid backup file' });
    return repo.importData(body);
  });
}
