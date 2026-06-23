import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { db } from '../server/db';
import { insertMany, type EntryInput } from '../server/repo';
import { parseChecklists } from './parsers/checklists';
import { parseCommands } from './parsers/commands';
import { parseStructuredCommands, cmdKey } from './parsers/commands-structured';
import { parseGtfobins } from './parsers/gtfobins';
import { parseWordlistsRef } from './parsers/wordlists-ref';
import { replaceChecklists } from '../server/checklists';
import { CURATED } from './curated/index';
import type { CuratedCategory } from './curated/types';

const here = dirname(fileURLToPath(import.meta.url));

function section(label: string) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 40 - label.length))}`);
}

function rowsFromCategory(cat: CuratedCategory): EntryInput[] {
  return cat.entries.map((e) => ({
    type: e.type ?? 'payload',
    category: cat.category,
    subcategory: e.subcategory ?? null,
    title: e.title,
    body: e.body,
    language: e.language ?? null,
    tags: e.tags ?? [],
    source: cat.source ?? null,
    meta: e.meta ?? null,
  }));
}

function main() {
  console.log('[ARS3NAL] seeding database…');

  // Preserve ★/notes the user set on SEEDED (is_custom=0) rows — re-applied after reseed (matched by type|category|title).
  const preserved = db.prepare(
    "SELECT type, category, title, is_favorite, notes FROM entries WHERE is_custom=0 AND (is_favorite=1 OR (notes IS NOT NULL AND notes<>''))",
  ).all() as { type: string; category: string | null; title: string; is_favorite: number; notes: string | null }[];

  // Idempotent: drop previously-seeded rows but NEVER touch the user's own (is_custom=1).
  const cleared = db.prepare('DELETE FROM entries WHERE is_custom=0').run().changes;
  if (cleared) console.log(`  cleared ${cleared} previously-seeded rows`);

  let total = 0;

  // Curated categories — hand-reviewed one at a time (payloads, commands, tips, images, tables).
  section('Curated categories');
  for (const cat of CURATED) {
    const rows = rowsFromCategory(cat);
    total += insertMany(rows);
    console.log(`  + ${rows.length} · ${cat.category}`);
  }

  // Curated categories authored as JSON (used when payloads have many ${ } / backticks).
  const curatedDir = join(here, 'curated');
  for (const file of readdirSync(curatedDir).filter((n) => n.endsWith('.json'))) {
    const cat = JSON.parse(readFileSync(join(curatedDir, file), 'utf8')) as CuratedCategory;
    const rows = rowsFromCategory(cat);
    total += insertMany(rows);
    console.log(`  + ${rows.length} · ${cat.category} (json)`);
  }

  // Checklists — parsed from operational.md + research.md into structured form.
  // Definitions are replaced; the user's ticks & notes (checklist_state) are NEVER touched.
  section('Checklists');
  const lists = parseChecklists();
  replaceChecklists(lists);
  const itemTotal = lists.reduce((n, l) => n + l.sections.reduce((m, s) => m + s.items.length, 0), 0);
  for (const l of lists) {
    const n = l.sections.reduce((m, s) => m + s.items.length, 0);
    console.log(`  + ${String(n).padStart(3)} items · ${l.title}`);
  }
  console.log(`  = ${lists.length} checklists · ${itemTotal} items`);

  // Burp Suite docs (translated to Russian) — type=doc, grouped by section.
  section('Burp docs');
  const burpDir = join(here, 'burp');
  if (existsSync(burpDir)) {
    let n = 0;
    for (const file of readdirSync(burpDir).filter((f) => f.endsWith('.json'))) {
      const sec = JSON.parse(readFileSync(join(burpDir, file), 'utf8')) as {
        section: string; order?: number; entries: { title: string; path: string; order?: number; subcategory?: string; body: string }[];
      };
      const rows: EntryInput[] = sec.entries.map((e) => ({
        type: 'doc',
        category: sec.section,
        subcategory: e.subcategory ?? null,
        title: e.title,
        body: e.body,
        language: 'md',
        tags: [],
        source: 'https://portswigger.net' + e.path,
        meta: { path: e.path, sectionOrder: sec.order ?? 99, pageOrder: e.order ?? 0 },
      }));
      total += insertMany(rows);
      n += rows.length;
      console.log(`  + ${String(rows.length).padStart(3)} · ${sec.section} (${file})`);
    }
    console.log(`  = ${n} burp doc pages`);
  }

  // Commands — practical CTF/pentest/HTB tool reference (type=command).
  // Structured tools (seed/commands-structured/*.json) power the command builder and override the
  // markdown version of any category they cover; remaining categories come from seed/commands/*.md.
  section('Commands');
  const structured = parseStructuredCommands();
  const md = parseCommands().filter((e) => !structured.coveredKeys.has(cmdKey(e.category, e.title)));
  total += insertMany(structured.entries);
  total += insertMany(md);
  const cmdCats = new Set([...structured.entries, ...md].map((c) => c.category)).size;
  console.log(`  = ${structured.entries.length} structured + ${md.length} md · ${cmdCats} categories`);

  // GTFOBins — Unix binaries abusable for shell / file ops / privesc (type=gtfobin).
  section('GTFOBins');
  const gtfo = parseGtfobins();
  total += insertMany(gtfo);
  console.log(`  = ${gtfo.length} gtfobins`);

  // Wordlists reference — curated guide to the top wordlists, paths + GitHub links (type=wordlist_ref).
  section('Wordlists reference');
  const wlref = parseWordlistsRef();
  total += insertMany(wlref);
  console.log(`  = ${wlref.length} wordlist refs`);

  // Re-apply the preserved ★/notes onto the freshly-seeded rows.
  if (preserved.length) {
    const upd = db.prepare(
      "UPDATE entries SET is_favorite=@is_favorite, notes=COALESCE(@notes, notes) WHERE is_custom=0 AND type=@type AND category IS @category AND title=@title",
    );
    let restored = 0;
    for (const r of preserved) restored += upd.run(r).changes;
    if (restored) console.log(`  ↺ restored ★/notes on ${restored} seeded rows`);
  }
  db.pragma('wal_checkpoint(TRUNCATE)'); // fold the WAL back so the db file is a complete snapshot

  console.log(`\n[ARS3NAL] done — ${total} entries.`);
  const kept = db.prepare('SELECT COUNT(*) n FROM entries WHERE is_custom=1').get() as { n: number };
  if (kept.n) console.log(`  (${kept.n} custom entries preserved)`);
  const keptState = db.prepare('SELECT COUNT(*) n FROM checklist_state').get() as { n: number };
  if (keptState.n) console.log(`  (${keptState.n} checklist state rows preserved)`);
}

main();
