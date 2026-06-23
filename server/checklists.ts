import { db } from './db';

export interface ChecklistItemDef { key: string; text: string; }
export interface ChecklistSectionDef { name: string; items: ChecklistItemDef[]; }
export interface ChecklistDef {
  slug: string;
  title: string;
  category: string | null;
  sort: number;
  research: string;
  sections: ChecklistSectionDef[];
}

export interface ChecklistSummary {
  slug: string;
  title: string;
  category: string | null;
  sort: number;
  total: number;
  checked: number;
}

export interface ChecklistItemView extends ChecklistItemDef { checked: boolean; note: string | null; }
export interface ChecklistSectionView { name: string; items: ChecklistItemView[]; }
export interface ChecklistView {
  slug: string;
  title: string;
  category: string | null;
  sort: number;
  research: string;
  note: string;
  sections: ChecklistSectionView[];
  total: number;
  checked: number;
}

// ── Seeding (definitions only — never touches checklist_state) ──────────────
const insertDef = db.prepare(
  `INSERT INTO checklists (slug, title, category, sort, research, sections)
   VALUES (@slug, @title, @category, @sort, @research, @sections)`,
);

export const replaceChecklists = db.transaction((defs: ChecklistDef[]): number => {
  db.prepare('DELETE FROM checklists').run();
  for (const d of defs) {
    insertDef.run({
      slug: d.slug,
      title: d.title,
      category: d.category ?? null,
      sort: d.sort,
      research: d.research ?? '',
      sections: JSON.stringify(d.sections),
    });
  }
  return defs.length;
});

// ── Reads ───────────────────────────────────────────────────────────────────
function checkedCount(slug: string): number {
  const r = db.prepare('SELECT COUNT(*) n FROM checklist_state WHERE checked=1 AND key LIKE ?').get(slug + '#%') as { n: number };
  return r.n;
}
function itemCount(sectionsJson: string): number {
  try {
    return (JSON.parse(sectionsJson) as ChecklistSectionDef[]).reduce((n, s) => n + s.items.length, 0);
  } catch { return 0; }
}

export function listChecklists(): ChecklistSummary[] {
  const rows = db.prepare('SELECT slug, title, category, sort, sections FROM checklists ORDER BY sort, title').all() as
    { slug: string; title: string; category: string | null; sort: number; sections: string }[];
  return rows.map((r) => ({
    slug: r.slug,
    title: r.title,
    category: r.category,
    sort: r.sort,
    total: itemCount(r.sections),
    checked: checkedCount(r.slug),
  }));
}

export function getChecklist(slug: string): ChecklistView | null {
  const row = db.prepare('SELECT slug, title, category, sort, research, sections FROM checklists WHERE slug=?').get(slug) as
    { slug: string; title: string; category: string | null; sort: number; research: string; sections: string } | undefined;
  if (!row) return null;

  const state = new Map<string, { checked: number; note: string | null }>();
  for (const s of db.prepare('SELECT key, checked, note FROM checklist_state WHERE key LIKE ?').all(slug + '#%') as
    { key: string; checked: number; note: string | null }[]) {
    state.set(s.key, { checked: s.checked, note: s.note });
  }

  let total = 0;
  let checked = 0;
  const defs = JSON.parse(row.sections) as ChecklistSectionDef[];
  const sections: ChecklistSectionView[] = defs.map((sec) => ({
    name: sec.name,
    items: sec.items.map((it) => {
      const st = state.get(it.key);
      const isChecked = !!st?.checked;
      total++;
      if (isChecked) checked++;
      return { key: it.key, text: it.text, checked: isChecked, note: st?.note ?? null };
    }),
  }));

  const noteRow = db.prepare('SELECT note FROM checklist_state WHERE key=?').get('note#' + slug) as { note: string | null } | undefined;

  return { slug: row.slug, title: row.title, category: row.category, sort: row.sort, research: row.research ?? '', note: noteRow?.note ?? '', sections, total, checked };
}

// ── Writes (user progress) ────────────────────────────────────────────────────
const upsertChecked = db.prepare(
  `INSERT INTO checklist_state (key, checked) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET checked=excluded.checked, updated_at=datetime('now')`,
);
const upsertNote = db.prepare(
  `INSERT INTO checklist_state (key, note) VALUES (?, ?)
   ON CONFLICT(key) DO UPDATE SET note=excluded.note, updated_at=datetime('now')`,
);

export function setItemChecked(key: string, checked: boolean): { key: string; checked: boolean } {
  upsertChecked.run(key, checked ? 1 : 0);
  return { key, checked };
}
export function setItemNote(key: string, note: string): { key: string; note: string } {
  upsertNote.run(key, note);
  return { key, note };
}
export function setChecklistNote(slug: string, note: string): { slug: string; note: string } {
  upsertNote.run('note#' + slug, note);
  return { slug, note };
}
export function resetChecklist(slug: string): { slug: string; cleared: number } {
  const cleared = db.prepare('DELETE FROM checklist_state WHERE key LIKE ?').run(slug + '#%').changes;
  return { slug, cleared };
}
