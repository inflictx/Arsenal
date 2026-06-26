import { db } from './db';
import { ftsQuery } from './fts';

export interface Entry {
  id: number;
  type: string;
  category: string | null;
  subcategory: string | null;
  title: string;
  body: string | null;
  language: string | null;
  tags: string[];
  source: string | null;
  meta: unknown;
  is_custom: boolean;
  is_favorite: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface EntryInput {
  type: string;
  category?: string | null;
  subcategory?: string | null;
  title: string;
  body?: string | null;
  language?: string | null;
  locale?: string;            // 'ru' | 'en' (defaults to 'ru')
  tags?: string[];
  source?: string | null;
  meta?: unknown;
}

/** Parse a JSON column, never throwing: corrupt data falls back instead of 500-ing the request. */
function safeParse<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string' || s === '') return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function toEntry(r: any): Entry {
  return {
    ...r,
    tags: safeParse<string[]>(r.tags, []),
    meta: safeParse<unknown>(r.meta, null),
    is_custom: !!r.is_custom,
    is_favorite: !!r.is_favorite,
  };
}

const insertStmt = db.prepare(`
  INSERT INTO entries (type, category, subcategory, title, body, language, locale, tags, source, meta, is_custom)
  VALUES (@type, @category, @subcategory, @title, @body, @language, @locale, @tags, @source, @meta, @is_custom)
`);

export function insertEntry(input: EntryInput, isCustom = false): number {
  const info = insertStmt.run({
    type: input.type,
    category: input.category ?? null,
    subcategory: input.subcategory ?? null,
    title: input.title,
    body: input.body ?? null,
    language: input.language ?? null,
    locale: input.locale ?? 'ru',
    tags: JSON.stringify(input.tags ?? []),
    source: input.source ?? null,
    meta: input.meta != null ? JSON.stringify(input.meta) : null,
    is_custom: isCustom ? 1 : 0,
  });
  return Number(info.lastInsertRowid);
}

/** Fast path for seeding many rows in one transaction. Returns count inserted. */
export const insertMany = db.transaction((rows: EntryInput[], isCustom = false): number => {
  for (const r of rows) insertEntry(r, isCustom);
  return rows.length;
});

export function stats(locale?: string) {
  const lc = locale ? ' WHERE (locale=? OR is_custom=1)' : '';
  const args = locale ? [locale] : [];
  const total = (db.prepare(`SELECT COUNT(*) n FROM entries${lc}`).get(...args) as any).n as number;
  const byType = db.prepare(`SELECT type, COUNT(*) n FROM entries${lc} GROUP BY type`).all(...args) as { type: string; n: number }[];
  return { total, byType };
}

export function listCategories(type: string, locale?: string) {
  const params: any[] = [type];
  let sql = `SELECT category, COUNT(*) n FROM entries
       WHERE type=? AND category IS NOT NULL AND category<>''`;
  if (locale) { sql += ' AND (locale=? OR is_custom=1)'; params.push(locale); }
  sql += ' GROUP BY category ORDER BY category COLLATE NOCASE';
  return db.prepare(sql).all(...params) as { category: string; n: number }[];
}

export function listEntries(o: {
  type?: string;
  category?: string;
  tag?: string;
  favorite?: boolean;
  locale?: string;
  limit?: number;
  offset?: number;
}): Entry[] {
  const where: string[] = [];
  const params: any[] = [];
  if (o.type) { where.push('type=?'); params.push(o.type); }
  if (o.category) { where.push('category=?'); params.push(o.category); }
  if (o.tag) { where.push('tags LIKE ?'); params.push(`%"${o.tag}"%`); }
  if (o.favorite) { where.push('is_favorite=1'); }
  if (o.locale) { where.push('(locale=? OR is_custom=1)'); params.push(o.locale); }
  const sql =
    `SELECT * FROM entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY is_favorite DESC, id
     LIMIT ? OFFSET ?`;
  params.push(Math.min(o.limit ?? 200, 1000), o.offset ?? 0);
  return (db.prepare(sql).all(...params) as any[]).map(toEntry);
}

export function getEntry(id: number): Entry | null {
  const r = db.prepare('SELECT * FROM entries WHERE id=?').get(id);
  return r ? toEntry(r) : null;
}

export function createEntry(input: EntryInput): Entry {
  const id = insertEntry(input, true);
  return getEntry(id)!;
}

export function updateEntry(id: number, patch: Partial<EntryInput>): Entry | null {
  const cur = getEntry(id);
  if (!cur) return null;
  // Use "key present in patch" (not ??) so a field CAN be cleared to null/'' via PUT.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(patch, k);
  const next = {
    title: patch.title ?? cur.title, // title is NOT NULL — keep last value if omitted/empty
    category: has('category') ? (patch.category ?? null) : cur.category,
    subcategory: has('subcategory') ? (patch.subcategory ?? null) : cur.subcategory,
    body: has('body') ? (patch.body ?? null) : cur.body,
    language: has('language') ? (patch.language ?? null) : cur.language,
    tags: JSON.stringify(patch.tags ?? cur.tags),
    source: has('source') ? (patch.source ?? null) : cur.source,
    meta: has('meta') ? (patch.meta != null ? JSON.stringify(patch.meta) : null) : (cur.meta != null ? JSON.stringify(cur.meta) : null),
  };
  // A no-op save (open the editor, hit Save without changing anything) must NOT flip the row to
  // "yours" or bump it; only a real content change makes it custom + protected from re-seed.
  const changed =
    next.title !== cur.title ||
    next.category !== cur.category ||
    next.subcategory !== cur.subcategory ||
    next.body !== cur.body ||
    next.language !== cur.language ||
    next.tags !== JSON.stringify(cur.tags) ||
    next.source !== cur.source ||
    next.meta !== (cur.meta != null ? JSON.stringify(cur.meta) : null);
  if (!changed) return cur;
  // Editing a row makes it "yours" → protected from re-seed.
  db.prepare(
    `UPDATE entries SET title=@title, category=@category, subcategory=@subcategory, body=@body,
       language=@language, tags=@tags, source=@source, meta=@meta,
       is_custom=1, updated_at=datetime('now') WHERE id=@id`,
  ).run({ ...next, id });
  return getEntry(id);
}

export function deleteEntry(id: number): boolean {
  return db.prepare('DELETE FROM entries WHERE id=?').run(id).changes > 0;
}

export function toggleFavorite(id: number): Entry | null {
  db.prepare("UPDATE entries SET is_favorite = 1 - is_favorite, updated_at=datetime('now') WHERE id=?").run(id);
  return getEntry(id);
}

export function setNotes(id: number, notes: string): Entry | null {
  db.prepare("UPDATE entries SET notes=?, updated_at=datetime('now') WHERE id=?").run(notes, id);
  return getEntry(id);
}

export function search(q: string, type?: string, limit = 50, locale?: string): Entry[] {
  const match = ftsQuery(q);
  if (!match) return [];
  const params: any[] = [match];
  let sql = `SELECT e.* FROM entries_fts JOIN entries e ON e.id = entries_fts.rowid WHERE entries_fts MATCH ?`;
  if (type) { sql += ' AND e.type=?'; params.push(type); }
  if (locale) { sql += ' AND (e.locale=? OR e.is_custom=1)'; params.push(locale); }
  // Bias ⌘K toward copy-ready things (payloads/recipes/gtfobins) over prose (docs) and filenames (wordlist refs).
  sql += " ORDER BY rank + (CASE WHEN e.type IN ('payload','cmd_recipe','gtfobin') THEN 0.0 ELSE 4.0 END) LIMIT ?";
  params.push(Math.min(limit, 200));
  return (db.prepare(sql).all(...params) as any[]).map(toEntry);
}

// ── Backup / restore: PERSONAL layer + checklist progress ────────────────────
// Export only what the user created/marked — custom entries plus favorite/note overrides on
// seeded rows. The seeded reference content is reproduced by `npm run seed`, so bundling it
// (7+ MB) is pointless and would make restore destructive. Matches the static localApi shape.
export function exportData() {
  return {
    v: 1,
    entries: db.prepare("SELECT * FROM entries WHERE is_custom=1 OR is_favorite=1 OR IFNULL(notes,'')<>''").all(),
    checklist_state: db.prepare('SELECT * FROM checklist_state').all(),
    targets: db.prepare('SELECT * FROM targets ORDER BY id').all(),
    findings: db.prepare('SELECT * FROM findings ORDER BY id').all(),
  };
}

const restoreTx = db.transaction((data: any) => {
  const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
  const cs: any[] = Array.isArray(data?.checklist_state) ? data.checklist_state : [];
  const now = new Date().toISOString();
  // Restore the PERSONAL layer only — never wipe seeded reference content (it comes from seed).
  // Clear current personal layer: drop custom rows, strip favorite/note overrides off seeded rows.
  db.prepare('DELETE FROM entries WHERE is_custom=1').run();
  db.prepare("UPDATE entries SET is_favorite=0, notes=NULL WHERE is_custom=0 AND (is_favorite=1 OR IFNULL(notes,'')<>'')").run();
  const insCustom = db.prepare(`INSERT INTO entries
    (type, category, subcategory, title, body, language, locale, tags, source, meta, is_custom, is_favorite, notes, created_at, updated_at)
    VALUES (@type, @category, @subcategory, @title, @body, @language, @locale, @tags, @source, @meta, 1, @is_favorite, @notes, @created_at, @updated_at)`);
  // seeded rows shift ids across reseed, so re-apply favorite/note overrides by content + locale.
  const findSeed = db.prepare("SELECT id FROM entries WHERE is_custom=0 AND type=? AND locale=? AND IFNULL(category,'')=IFNULL(?,'') AND title=? AND IFNULL(body,'')=IFNULL(?,'') LIMIT 1");
  const applyOverride = db.prepare('UPDATE entries SET is_favorite=@is_favorite, notes=@notes WHERE id=@id');
  let custom = 0, overrides = 0;
  for (const e of entries) {
    // accept both string (server backup) and array/object (static/IndexedDB backup) tag/meta shapes
    const tags = typeof e.tags === 'string' ? e.tags : (e.tags != null ? JSON.stringify(e.tags) : null);
    const meta = typeof e.meta === 'string' ? e.meta : (e.meta != null ? JSON.stringify(e.meta) : null);
    if (e.is_custom) {
      insCustom.run({
        type: e.type, category: e.category ?? null, subcategory: e.subcategory ?? null,
        title: e.title, body: e.body ?? null, language: e.language ?? null, locale: e.locale ?? 'ru',
        tags, source: e.source ?? null, meta, is_favorite: e.is_favorite ? 1 : 0, notes: e.notes ?? null,
        created_at: e.created_at ?? now, updated_at: e.updated_at ?? now,
      });
      custom++;
    } else {
      const row = findSeed.get(e.type, e.locale ?? 'ru', e.category ?? null, e.title, e.body ?? null) as { id: number } | undefined;
      if (row) { applyOverride.run({ id: row.id, is_favorite: e.is_favorite ? 1 : 0, notes: e.notes ?? null }); overrides++; }
    }
  }
  db.prepare('DELETE FROM checklist_state').run();
  const insCs = db.prepare('INSERT INTO checklist_state (key, checked, note, updated_at) VALUES (@key, @checked, @note, @updated_at)');
  for (const r of cs) insCs.run({ key: r.key, checked: r.checked ? 1 : 0, note: r.note ?? null, updated_at: r.updated_at ?? now });

  // targets + findings (only replace if present — older backups won't have these keys)
  if (Array.isArray(data?.targets)) {
    db.prepare('DELETE FROM targets').run();
    const insT = db.prepare('INSERT INTO targets (id,name,host,lhost,scope,status,notes,is_active,created_at,updated_at) VALUES (@id,@name,@host,@lhost,@scope,@status,@notes,@is_active,@created_at,@updated_at)');
    for (const t of data.targets) insT.run({ id: t.id ?? null, name: t.name, host: t.host ?? null, lhost: t.lhost ?? null, scope: t.scope ?? null, status: t.status ?? 'active', notes: t.notes ?? null, is_active: t.is_active ? 1 : 0, created_at: t.created_at ?? now, updated_at: t.updated_at ?? now });
  }
  if (Array.isArray(data?.findings)) {
    db.prepare('DELETE FROM findings').run();
    const insF = db.prepare('INSERT INTO findings (id,target_id,title,severity,url,status,body,sort,created_at,updated_at) VALUES (@id,@target_id,@title,@severity,@url,@status,@body,@sort,@created_at,@updated_at)');
    for (const f of data.findings) insF.run({ id: f.id ?? null, target_id: f.target_id ?? null, title: f.title, severity: f.severity ?? 'medium', url: f.url ?? null, status: f.status ?? 'open', body: f.body ?? null, sort: f.sort ?? 0, created_at: f.created_at ?? now, updated_at: f.updated_at ?? now });
  }
  return { entries: custom + overrides, custom, overrides, checklist_state: cs.length, targets: Array.isArray(data?.targets) ? data.targets.length : 0, findings: Array.isArray(data?.findings) ? data.findings.length : 0 };
});

export function importData(data: unknown) {
  const result = restoreTx(data);
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
  return result;
}

// ── Merge: add a backup's personal data to the current DB WITHOUT wiping anything ──
const mergeTx = db.transaction((data: any) => {
  const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
  const cs: any[] = Array.isArray(data?.checklist_state) ? data.checklist_state : [];
  const now = new Date().toISOString();
  let addedEntries = 0, mergedState = 0, addedTargets = 0, addedFindings = 0;

  // 1) Personal entries only (is_custom); seeded content already exists from the seed.
  //    Dedup by type+title+body so re-merging the same file doesn't pile up duplicates.
  const exists = db.prepare("SELECT 1 FROM entries WHERE type=? AND title=? AND IFNULL(body,'')=IFNULL(?,'') LIMIT 1");
  const insEntry = db.prepare(`INSERT INTO entries
    (type, category, subcategory, title, body, language, locale, tags, source, meta, is_custom, is_favorite, notes)
    VALUES (@type,@category,@subcategory,@title,@body,@language,@locale,@tags,@source,@meta,1,@is_favorite,@notes)`);
  for (const e of entries) {
    if (!e.is_custom) continue;
    if (exists.get(e.type, e.title, e.body ?? '')) continue;
    insEntry.run({
      type: e.type, category: e.category ?? null, subcategory: e.subcategory ?? null,
      title: e.title, body: e.body ?? null, language: e.language ?? null, locale: e.locale ?? 'ru',
      tags: typeof e.tags === 'string' ? e.tags : (e.tags != null ? JSON.stringify(e.tags) : null),
      source: e.source ?? null,
      meta: typeof e.meta === 'string' ? e.meta : (e.meta != null ? JSON.stringify(e.meta) : null),
      is_favorite: e.is_favorite ? 1 : 0, notes: e.notes ?? null,
    });
    addedEntries++;
  }

  // 2) Checklist progress: union — keep a tick if either side has it; fill missing notes.
  const csUpsert = db.prepare(`INSERT INTO checklist_state (key, checked, note, updated_at)
    VALUES (@key,@checked,@note,@updated_at)
    ON CONFLICT(key) DO UPDATE SET
      checked = MAX(checklist_state.checked, excluded.checked),
      note = COALESCE(NULLIF(excluded.note,''), checklist_state.note),
      updated_at = excluded.updated_at`);
  for (const r of cs) { csUpsert.run({ key: r.key, checked: r.checked ? 1 : 0, note: r.note ?? null, updated_at: r.updated_at ?? now }); mergedState++; }

  // 3) Targets + findings: append, remapping ids so they never collide with existing rows.
  if (Array.isArray(data?.targets)) {
    const findings: any[] = Array.isArray(data?.findings) ? data.findings : [];
    const insT = db.prepare('INSERT INTO targets (name,host,lhost,scope,status,notes,is_active) VALUES (@name,@host,@lhost,@scope,@status,@notes,0)');
    const insF = db.prepare('INSERT INTO findings (target_id,title,severity,url,status,body,sort) VALUES (@target_id,@title,@severity,@url,@status,@body,@sort)');
    for (const tg of data.targets) {
      const newId = Number(insT.run({ name: tg.name ?? 'target', host: tg.host ?? null, lhost: tg.lhost ?? null, scope: tg.scope ?? null, status: tg.status ?? 'active', notes: tg.notes ?? null }).lastInsertRowid);
      addedTargets++;
      for (const f of findings.filter((x) => x.target_id === tg.id)) {
        insF.run({ target_id: newId, title: f.title ?? 'finding', severity: f.severity ?? 'medium', url: f.url ?? null, status: f.status ?? 'open', body: f.body ?? null, sort: f.sort ?? 0 });
        addedFindings++;
      }
    }
  }
  return { addedEntries, mergedState, addedTargets, addedFindings };
});

export function mergeData(data: unknown) {
  const result = mergeTx(data);
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
  return result;
}
