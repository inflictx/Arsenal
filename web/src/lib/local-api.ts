// Client-only data layer for the static GitHub Pages build (VITE_STATIC=1).
// Same surface as `api` in api.ts, but:
//   - reference content comes from bundled JSON (web/public/data/, lazy per type)
//   - the user's own data (custom entries, ★/notes, targets, findings, checklist
//     progress) lives in the browser's IndexedDB — per visitor, never shared.
//   - search runs in-memory over a lightweight index (same payload/gtfobin bias).
// The local (server) build never imports this — it keeps using httpApi.
import type { Entry, Stats, Category, ChecklistSummary, Checklist, ChecklistSection } from '../api';
import { getLang } from './i18n';

const DATA_ROOT = import.meta.env.BASE_URL + 'data/';
const DATA = DATA_ROOT + getLang() + '/'; // per-locale reference content (data/ru/, data/en/)
const USER_BASE = 1_000_000_000; // user-entry ids start here so they never clash with reference ids

// ── IndexedDB (tiny promise wrapper, no deps) ────────────────────────────────
const STORES = ['userEntries', 'overrides', 'targets', 'findings', 'checklistState', 'kv'] as const;
let _db: IDBDatabase | null = null;
function idb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open('ars3nal', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of STORES) {
        if (!d.objectStoreNames.contains(s)) {
          d.createObjectStore(s, { keyPath: s === 'checklistState' ? 'key' : s === 'kv' ? 'k' : 'id' });
        }
      }
    };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return idb().then((d) => new Promise<T>((res, rej) => {
    const rq = fn(d.transaction(store, mode).objectStore(store));
    rq.onsuccess = () => res(rq.result as T);
    rq.onerror = () => rej(rq.error);
  }));
}
const dbGet = <T>(s: string, k: IDBValidKey) => run<T>(s, 'readonly', (st) => st.get(k));
const dbAll = <T>(s: string) => run<T[]>(s, 'readonly', (st) => st.getAll());
const dbPut = (s: string, v: any) => run<IDBValidKey>(s, 'readwrite', (st) => st.put(v));
const dbDel = (s: string, k: IDBValidKey) => run<undefined>(s, 'readwrite', (st) => st.delete(k));
const dbClear = (s: string) => run<undefined>(s, 'readwrite', (st) => st.clear());
async function nextId(seq: string, base: number): Promise<number> {
  const cur = await dbGet<{ k: string; v: number }>('kv', seq);
  const n = (cur?.v ?? base) + 1;
  await dbPut('kv', { k: seq, v: n });
  return n;
}

// ── reference content (bundled JSON, cached) ─────────────────────────────────
const typeCache = new Map<string, Entry[]>();
let _manifest: { types: Record<string, number>; checklists: number } | null = null;
async function manifest() {
  if (!_manifest) { try { _manifest = await (await fetch(DATA + 'manifest.json')).json(); } catch { _manifest = { types: {}, checklists: 0 }; } }
  return _manifest!;
}
async function loadType(type: string): Promise<Entry[]> {
  if (typeCache.has(type)) return typeCache.get(type)!;
  let arr: Entry[] = [];
  // Only fetch a shard for types that were actually exported. User-only types (e.g. cmd_recipe,
  // saved command recipes that live solely in IndexedDB) have no shard — fetching one would 404
  // and spam the console on the static build. Their data is added from userEntries by callers.
  const m = await manifest();
  if (m.types[type]) {
    try { const r = await fetch(DATA + `entries-${type}.json`); if (r.ok) arr = await r.json(); } catch { /* empty */ }
  }
  typeCache.set(type, arr);
  return arr;
}

// ── overrides (★/notes/edits/deletes on reference entries) ───────────────────
interface Override { id: number; type?: string; is_favorite?: boolean; notes?: string | null; deleted?: boolean; patch?: Partial<Entry>; }
let _ov: Map<number, Override> | null = null;
async function overrides(): Promise<Map<number, Override>> {
  if (!_ov) { const all = await dbAll<Override>('overrides'); _ov = new Map(all.map((o) => [o.id, o])); }
  return _ov!;
}
function applyOv(e: Entry, ov?: Override): Entry | null {
  if (!ov) return e;
  if (ov.deleted) return null;
  return {
    ...e, ...(ov.patch ?? {}),
    is_favorite: ov.is_favorite ?? e.is_favorite,
    notes: ov.notes !== undefined ? ov.notes : e.notes,
    is_custom: (ov.patch || ov.is_favorite || ov.notes != null) ? true : e.is_custom,
  };
}
const isUser = (id: number) => id >= USER_BASE;

async function userEntries(): Promise<Entry[]> { return (await dbAll<Entry>('userEntries')) ?? []; }

// resolve a single entry by id (user store, or any reference type)
async function resolve(id: number): Promise<Entry | null> {
  if (isUser(id)) return (await dbGet<Entry>('userEntries', id)) ?? null;
  const ov = (await overrides()).get(id);
  // search loaded caches first, then load remaining types
  for (const arr of typeCache.values()) { const e = arr.find((x) => x.id === id); if (e) return applyOv(e, ov); }
  const m = await manifest();
  for (const t of Object.keys(m.types)) { const arr = await loadType(t); const e = arr.find((x) => x.id === id); if (e) return applyOv(e, ov); }
  return null;
}

function sortEntries(a: Entry, b: Entry) { return Number(b.is_favorite) - Number(a.is_favorite) || a.id - b.id; }

// ── checklist progress (IndexedDB) ───────────────────────────────────────────
interface CS { key: string; checked?: boolean; note?: string | null; }
async function stateMap(): Promise<Map<string, CS>> {
  const all = await dbAll<CS>('checklistState');
  return new Map(all.map((s) => [s.key, s]));
}
let _cls: any[] | null = null;
async function checklistDefs(): Promise<any[]> {
  if (!_cls) {
    const file = getLang() === 'en' ? 'checklists-en.json' : 'checklists.json';
    try { _cls = await (await fetch(DATA_ROOT + file)).json(); } catch { _cls = []; }
  }
  return _cls!;
}

// ── search (lightweight index, cached) ───────────────────────────────────────
interface IdxRow { id: number; type: string; title: string; category: string | null; tags: string[]; snippet: string; }
let _idx: IdxRow[] | null = null;
async function searchIndex(): Promise<IdxRow[]> {
  if (!_idx) { try { _idx = await (await fetch(DATA + 'search-index.json')).json(); } catch { _idx = []; } }
  return _idx!;
}
const BIAS = new Set(['payload', 'cmd_recipe', 'gtfobin']);

export const localApi = {
  async stats(): Promise<Stats> {
    const m = await manifest();
    const total = Object.values(m.types).reduce((a, b) => a + b, 0) + (await userEntries()).length;
    const byType = Object.entries(m.types).map(([type, n]) => ({ type, n }));
    return { total, byType };
  },

  async categories(type: string): Promise<Category[]> {
    const ref = await loadType(type);
    const usr = (await userEntries()).filter((e) => e.type === type);
    const counts = new Map<string, number>();
    for (const e of [...ref, ...usr]) if (e.category) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts.entries()].map(([category, n]) => ({ category, n }))
      .sort((a, b) => a.category.localeCompare(b.category));
  },

  async entries(params: Record<string, any>): Promise<Entry[]> {
    const { type, category, tag, favorite, limit = 200, offset = 0 } = params;
    const ov = await overrides();
    let pool: Entry[] = [];
    if (type) {
      pool = (await loadType(type)).map((e) => applyOv(e, ov.get(e.id))).filter(Boolean) as Entry[];
      pool.push(...(await userEntries()).filter((e) => e.type === type));
    } else {
      // no type → favorites view: gather favorited reference (from overrides) + favorited user entries
      const favIds = [...ov.values()].filter((o) => o.is_favorite && !o.deleted);
      for (const o of favIds) { const e = await resolve(o.id); if (e) pool.push(e); }
      pool.push(...(await userEntries()).filter((e) => e.is_favorite));
    }
    let out = pool;
    if (category) out = out.filter((e) => e.category === category);
    if (tag) out = out.filter((e) => e.tags?.includes(tag));
    if (favorite) out = out.filter((e) => e.is_favorite);
    out.sort(sortEntries);
    return out.slice(offset, offset + Math.min(limit, 1000));
  },

  entry(id: number): Promise<Entry> { return resolve(id).then((e) => { if (!e) throw new Error('404'); return e; }); },

  async search(q: string, type?: string, limit = 50): Promise<Entry[]> {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    const idx = await searchIndex();
    const usr = (await userEntries()).map((e) => ({ id: e.id, type: e.type, title: e.title, category: e.category, tags: e.tags, snippet: (e.body ?? '').slice(0, 160) }));
    const scored: { row: IdxRow; s: number }[] = [];
    for (const row of [...idx, ...usr]) {
      if (type && row.type !== type) continue;
      const hay = (row.title + ' ' + (row.category ?? '') + ' ' + (row.tags || []).join(' ') + ' ' + row.snippet).toLowerCase();
      if (!terms.every((t) => hay.includes(t))) continue;
      let s = 0;
      for (const t of terms) { if (row.title.toLowerCase().includes(t)) s += 5; if ((row.category ?? '').toLowerCase().includes(t)) s += 2; }
      s += BIAS.has(row.type) ? 3 : 0;
      scored.push({ row, s });
    }
    scored.sort((a, b) => b.s - a.s);
    const top = scored.slice(0, Math.min(limit, 200));
    const out: Entry[] = [];
    for (const { row } of top) { const e = await resolve(row.id); if (e) out.push(e); }
    return out;
  },

  async create(body: Partial<Entry>): Promise<Entry> {
    const id = await nextId('seq:entry', USER_BASE);
    const now = new Date().toISOString();
    const e: Entry = {
      id, type: body.type ?? 'note', category: body.category ?? null, subcategory: body.subcategory ?? null,
      title: body.title ?? '', body: body.body ?? null, language: body.language ?? null, tags: body.tags ?? [],
      source: body.source ?? null, meta: body.meta ?? null, is_custom: true, is_favorite: false, notes: null,
      created_at: now, updated_at: now,
    };
    await dbPut('userEntries', e);
    return e;
  },

  async update(id: number, body: Partial<Entry>): Promise<Entry> {
    if (isUser(id)) {
      const cur = await dbGet<Entry>('userEntries', id);
      const next = { ...cur, ...body, id, is_custom: true, updated_at: new Date().toISOString() } as Entry;
      await dbPut('userEntries', next);
      return next;
    }
    // editing a reference entry → store a patch override
    const ov = (await overrides()).get(id) ?? { id };
    const e = await resolve(id);
    ov.type = e?.type; ov.patch = { ...(ov.patch ?? {}), ...body };
    await dbPut('overrides', ov); _ov!.set(id, ov);
    return (await resolve(id))!;
  },

  async remove(id: number): Promise<{ ok: boolean }> {
    if (isUser(id)) { await dbDel('userEntries', id); return { ok: true }; }
    const e = await resolve(id);
    const ov: Override = (await overrides()).get(id) ?? { id };
    ov.deleted = true; ov.type = e?.type;
    await dbPut('overrides', ov); _ov!.set(id, ov);
    return { ok: true };
  },

  async favorite(id: number): Promise<Entry> {
    if (isUser(id)) {
      const cur = (await dbGet<Entry>('userEntries', id))!;
      cur.is_favorite = !cur.is_favorite; await dbPut('userEntries', cur); return cur;
    }
    const e = (await resolve(id))!;
    const ov: Override = (await overrides()).get(id) ?? { id };
    ov.is_favorite = !(ov.is_favorite ?? e.is_favorite); ov.type = e.type;
    await dbPut('overrides', ov); _ov!.set(id, ov);
    return (await resolve(id))!;
  },

  async setNotes(id: number, notes: string): Promise<Entry> {
    if (isUser(id)) { const cur = (await dbGet<Entry>('userEntries', id))!; cur.notes = notes; await dbPut('userEntries', cur); return cur; }
    const e = (await resolve(id))!;
    const ov: Override = (await overrides()).get(id) ?? { id };
    ov.notes = notes; ov.type = e.type;
    await dbPut('overrides', ov); _ov!.set(id, ov);
    return (await resolve(id))!;
  },

  config(_name: string): Promise<any> { return Promise.resolve(null); },

  // ── Backup / restore ──
  async restore(data: any): Promise<{ entries: number; checklist_state: number }> {
    await Promise.all(STORES.map((s) => dbClear(s)));
    _ov = null;
    const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
    let maxUser = USER_BASE;
    for (const e of entries) {
      if (e.is_custom) {
        const ent = { ...e, tags: typeof e.tags === 'string' ? JSON.parse(e.tags) : (e.tags ?? []), meta: typeof e.meta === 'string' ? (e.meta ? JSON.parse(e.meta) : null) : e.meta, is_custom: true, is_favorite: !!e.is_favorite };
        if (typeof ent.id !== 'number' || ent.id < USER_BASE) ent.id = ++maxUser;
        maxUser = Math.max(maxUser, ent.id);
        await dbPut('userEntries', ent);
      } else if (e.is_favorite || (e.notes != null && e.notes !== '')) {
        await dbPut('overrides', { id: e.id, type: e.type, is_favorite: !!e.is_favorite, notes: e.notes ?? null });
      }
    }
    await dbPut('kv', { k: 'seq:entry', v: maxUser });
    const cs: any[] = Array.isArray(data?.checklist_state) ? data.checklist_state : [];
    for (const r of cs) await dbPut('checklistState', { key: r.key, checked: !!r.checked, note: r.note ?? null });
    const tg = Array.isArray(data?.targets) ? data.targets : [];
    let maxT = 0; for (const t of tg) { await dbPut('targets', { ...t, is_active: !!t.is_active }); maxT = Math.max(maxT, t.id ?? 0); }
    if (tg.length) await dbPut('kv', { k: 'seq:target', v: maxT }); // else new targets would reuse restored ids
    const fd = Array.isArray(data?.findings) ? data.findings : [];
    let maxF = 0; for (const f of fd) { await dbPut('findings', f); maxF = Math.max(maxF, f.id ?? 0); }
    if (fd.length) await dbPut('kv', { k: 'seq:finding', v: maxF });
    return { entries: entries.length, checklist_state: cs.length };
  },

  // Merge a backup's personal data into the current IndexedDB without wiping anything.
  async merge(data: any): Promise<{ addedEntries: number; mergedState: number; addedTargets: number; addedFindings: number }> {
    const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
    const existing = await userEntries();
    const key = (e: any) => e.type + ' ' + e.title + ' ' + (e.body ?? '');
    const seen = new Set(existing.map(key));
    let maxUser = (await dbGet<any>('kv', 'seq:entry'))?.v ?? USER_BASE;
    let addedEntries = 0;
    for (const e of entries) {
      if (!e.is_custom) continue;
      const ent = { ...e, tags: typeof e.tags === 'string' ? JSON.parse(e.tags) : (e.tags ?? []), meta: typeof e.meta === 'string' ? (e.meta ? JSON.parse(e.meta) : null) : e.meta, is_custom: true, is_favorite: !!e.is_favorite };
      if (seen.has(key(ent))) continue;
      ent.id = ++maxUser; seen.add(key(ent));
      await dbPut('userEntries', ent); addedEntries++;
    }
    await dbPut('kv', { k: 'seq:entry', v: maxUser });

    const cs: any[] = Array.isArray(data?.checklist_state) ? data.checklist_state : [];
    let mergedState = 0;
    for (const r of cs) {
      const cur = await dbGet<any>('checklistState', r.key);
      const checked = !!(cur?.checked) || !!r.checked;
      const note = (r.note != null && r.note !== '') ? r.note : (cur?.note ?? null);
      await dbPut('checklistState', { key: r.key, checked, note });
      mergedState++;
    }

    const tg = Array.isArray(data?.targets) ? data.targets : [];
    const fd = Array.isArray(data?.findings) ? data.findings : [];
    let maxT = (await dbGet<any>('kv', 'seq:target'))?.v ?? 0;
    let maxF = (await dbGet<any>('kv', 'seq:finding'))?.v ?? 0;
    let addedTargets = 0, addedFindings = 0;
    for (const tt of tg) {
      const newId = ++maxT;
      await dbPut('targets', { ...tt, id: newId, is_active: false });
      addedTargets++;
      for (const f of fd.filter((x: any) => x.target_id === tt.id)) {
        await dbPut('findings', { ...f, id: ++maxF, target_id: newId });
        addedFindings++;
      }
    }
    if (tg.length) await dbPut('kv', { k: 'seq:target', v: maxT });
    if (addedFindings) await dbPut('kv', { k: 'seq:finding', v: maxF });
    return { addedEntries, mergedState, addedTargets, addedFindings };
  },

  async exportBackup(): Promise<any> {
    const users = await userEntries();
    const ovs = (await dbAll<Override>('overrides')).filter((o) => !o.deleted);
    const entries = [
      ...users,
      ...ovs.map((o) => ({ id: o.id, type: o.type, is_favorite: !!o.is_favorite, notes: o.notes ?? null, is_custom: false })),
    ];
    return { v: 1, entries, checklist_state: await dbAll('checklistState'), targets: await dbAll('targets'), findings: await dbAll('findings') };
  },

  // ── Targets / findings (engagements) ──
  async targets(): Promise<any[]> { return ((await dbAll<any>('targets')) ?? []).sort((a, b) => a.id - b.id); },
  async createTarget(b: any): Promise<any> {
    const id = await nextId('seq:target', 0);
    const now = new Date().toISOString();
    const existing = await dbAll<any>('targets');
    const t = { id, name: b.name ?? '', host: b.host ?? null, lhost: b.lhost ?? null, scope: b.scope ?? null, status: b.status ?? 'active', notes: b.notes ?? null, is_active: existing.length === 0, created_at: now, updated_at: now };
    await dbPut('targets', t);
    return t;
  },
  async updateTarget(id: number, b: any): Promise<any> {
    const cur = (await dbGet<any>('targets', id)) ?? { id };
    const t = { ...cur, ...b, id, updated_at: new Date().toISOString() };
    await dbPut('targets', t);
    return t;
  },
  async removeTarget(id: number): Promise<{ ok: boolean }> {
    await dbDel('targets', id);
    for (const f of (await dbAll<any>('findings')).filter((f) => f.target_id === id)) await dbDel('findings', f.id);
    return { ok: true };
  },
  async activateTarget(id: number): Promise<any> {
    for (const t of await dbAll<any>('targets')) { const want = t.id === id; if (!!t.is_active !== want) { t.is_active = want; await dbPut('targets', t); } }
    return (await dbGet<any>('targets', id))!;
  },
  async findings(targetId?: number): Promise<any[]> {
    let all = (await dbAll<any>('findings')) ?? [];
    if (targetId != null) all = all.filter((f) => f.target_id === targetId);
    return all.sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0) || a.id - b.id);
  },
  async createFinding(b: any): Promise<any> {
    const id = await nextId('seq:finding', 0);
    const now = new Date().toISOString();
    const f = { id, target_id: b.target ?? b.target_id ?? null, title: b.title ?? '', severity: b.severity ?? 'medium', url: b.url ?? null, status: b.status ?? 'open', body: b.body ?? null, sort: b.sort ?? 0, created_at: now, updated_at: now };
    await dbPut('findings', f);
    return f;
  },
  async updateFinding(id: number, b: any): Promise<any> {
    const cur = (await dbGet<any>('findings', id)) ?? { id };
    const f = { ...cur, ...b, id, updated_at: new Date().toISOString() };
    await dbPut('findings', f);
    return f;
  },
  async removeFinding(id: number): Promise<{ ok: boolean }> { await dbDel('findings', id); return { ok: true }; },

  // ── Checklists (defs from JSON + progress from IndexedDB) ──
  async checklists(): Promise<ChecklistSummary[]> {
    const defs = await checklistDefs();
    const st = await stateMap();
    return defs.map((c) => {
      let total = 0, checked = 0;
      for (const s of c.sections) for (const it of s.items) { total++; if (st.get(it.key)?.checked) checked++; }
      return { slug: c.slug, title: c.title, category: c.category, sort: c.sort, total, checked };
    });
  },
  async checklist(slug: string): Promise<Checklist> {
    const defs = await checklistDefs();
    const c = defs.find((x) => x.slug === slug);
    if (!c) throw new Error('404');
    const st = await stateMap();
    let total = 0, checked = 0;
    const sections: ChecklistSection[] = c.sections.map((s: any) => ({
      name: s.name,
      items: s.items.map((it: any) => {
        total++; const cs = st.get(it.key); if (cs?.checked) checked++;
        return { key: it.key, text: it.text, checked: !!cs?.checked, note: cs?.note ?? null };
      }),
    }));
    return { slug: c.slug, title: c.title, category: c.category, sort: c.sort, research: c.research ?? '', note: (await dbGet<CS>('checklistState', 'note#' + slug))?.note ?? '', sections, total, checked };
  },
  async setChecklistItem(key: string, checked: boolean) {
    const cur = (await dbGet<CS>('checklistState', key)) ?? { key };
    cur.checked = checked; await dbPut('checklistState', cur);
    return { key, checked };
  },
  async setChecklistItemNote(key: string, note: string) {
    const cur = (await dbGet<CS>('checklistState', key)) ?? { key };
    cur.note = note; await dbPut('checklistState', cur);
    return { key, note };
  },
  async setChecklistNote(slug: string, note: string) {
    await dbPut('checklistState', { key: 'note#' + slug, note });
    return { slug, note };
  },
  async resetChecklist(slug: string) {
    const all = await dbAll<CS>('checklistState');
    let cleared = 0;
    for (const s of all) if (s.key.startsWith(slug + '#') && s.checked) { s.checked = false; await dbPut('checklistState', s); cleared++; }
    return { slug, cleared };
  },
};
