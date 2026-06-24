import { localApi } from './lib/local-api';
import { getLang } from './lib/i18n';

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
  meta: any;
  is_custom: boolean;
  is_favorite: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface Stats { total: number; byType: { type: string; n: number }[]; }
export interface Category { category: string; n: number; }

export interface ChecklistSummary { slug: string; title: string; category: string | null; sort: number; total: number; checked: number; }
export interface ChecklistItem { key: string; text: string; checked: boolean; note: string | null; }
export interface ChecklistSection { name: string; items: ChecklistItem[]; }
export interface Checklist {
  slug: string; title: string; category: string | null; sort: number;
  research: string; note: string; sections: ChecklistSection[]; total: number; checked: number;
}

const BASE = '/api';

async function req(path: string, opts?: RequestInit): Promise<any> {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const ct = r.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? r.json() : r.text();
}

function qs(o: Record<string, unknown>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v != null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? '?' + s : '';
}

const json = (body: unknown): RequestInit => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const httpApi = {
  stats: (): Promise<Stats> => req('/stats' + qs({ locale: getLang() })),
  categories: (type: string): Promise<Category[]> => req('/categories' + qs({ type, locale: getLang() })),
  entries: (params: Record<string, unknown>): Promise<Entry[]> => req('/entries' + qs({ ...params, locale: getLang() })),
  entry: (id: number): Promise<Entry> => req('/entries/' + id),
  search: (q: string, type?: string, limit?: number): Promise<Entry[]> => req('/search' + qs({ q, type, limit, locale: getLang() })),
  create: (body: Partial<Entry>): Promise<Entry> => req('/entries', { method: 'POST', ...json(body) }),
  update: (id: number, body: Partial<Entry>): Promise<Entry> => req('/entries/' + id, { method: 'PUT', ...json(body) }),
  remove: (id: number): Promise<{ ok: boolean }> => req('/entries/' + id, { method: 'DELETE' }),
  favorite: (id: number): Promise<Entry> => req('/entries/' + id + '/favorite', { method: 'PATCH' }),
  setNotes: (id: number, notes: string): Promise<Entry> => req('/entries/' + id + '/notes', { method: 'PATCH', ...json({ notes }) }),
  config: (name: string): Promise<any> => req('/config/' + name),
  restore: (data: unknown): Promise<{ entries: number; checklist_state: number }> => req('/restore', { method: 'POST', ...json(data) }),
  merge: (data: unknown): Promise<{ addedEntries: number; mergedState: number; addedTargets: number; addedFindings: number }> => req('/merge', { method: 'POST', ...json(data) }),
  exportBackup: (): Promise<any> => req('/backup'),

  targets: (): Promise<any[]> => req('/targets'),
  createTarget: (b: unknown): Promise<any> => req('/targets', { method: 'POST', ...json(b) }),
  updateTarget: (id: number, b: unknown): Promise<any> => req('/targets/' + id, { method: 'PUT', ...json(b) }),
  removeTarget: (id: number): Promise<{ ok: boolean }> => req('/targets/' + id, { method: 'DELETE' }),
  activateTarget: (id: number): Promise<any> => req('/targets/' + id + '/activate', { method: 'POST' }),
  findings: (targetId?: number): Promise<any[]> => req('/findings' + qs({ target: targetId })),
  createFinding: (b: unknown): Promise<any> => req('/findings', { method: 'POST', ...json(b) }),
  updateFinding: (id: number, b: unknown): Promise<any> => req('/findings/' + id, { method: 'PUT', ...json(b) }),
  removeFinding: (id: number): Promise<{ ok: boolean }> => req('/findings/' + id, { method: 'DELETE' }),

  checklists: (): Promise<ChecklistSummary[]> => req('/checklists' + qs({ locale: getLang() })),
  checklist: (slug: string): Promise<Checklist> => req('/checklists/' + encodeURIComponent(slug) + qs({ locale: getLang() })),
  setChecklistItem: (key: string, checked: boolean): Promise<{ key: string; checked: boolean }> =>
    req('/checklists/item', { method: 'PATCH', ...json({ key, checked }) }),
  setChecklistItemNote: (key: string, note: string): Promise<{ key: string; note: string }> =>
    req('/checklists/item/note', { method: 'PATCH', ...json({ key, note }) }),
  setChecklistNote: (slug: string, note: string): Promise<{ slug: string; note: string }> =>
    req('/checklists/' + encodeURIComponent(slug) + '/note', { method: 'PATCH', ...json({ note }) }),
  resetChecklist: (slug: string): Promise<{ slug: string; cleared: number }> =>
    req('/checklists/' + encodeURIComponent(slug) + '/reset', { method: 'POST' }),
};

// Static (GitHub Pages) build uses the client-only localApi (IndexedDB + bundled
// JSON); the normal build keeps the server-backed httpApi. Selected at build time.
export const api = (import.meta.env.VITE_STATIC ? localApi : httpApi) as unknown as typeof httpApi;
