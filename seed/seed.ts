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

function rowsFromCategory(cat: CuratedCategory, locale: string): EntryInput[] {
  return cat.entries.map((e) => ({
    type: e.type ?? 'payload',
    category: cat.category,
    subcategory: e.subcategory ?? null,
    title: e.title,
    body: e.body,
    language: e.language ?? null,
    locale,
    tags: e.tags ?? [],
    source: cat.source ?? null,
    meta: e.meta ?? null,
  }));
}

const withLocale = (rows: EntryInput[], locale: string): EntryInput[] => rows.map((r) => ({ ...r, locale }));

// Seed all REFERENCE content for one locale. For 'en' we prefer translated
// sources in the parallel `*-en/` folders and fall back to the Russian source
// (a copy) wherever a translation does not exist yet, so the English build is
// never empty and fills in progressively as translations land.
function seedContent(locale: 'ru' | 'en'): number {
  const en = locale === 'en';
  let total = 0;

  // Curated categories authored in TypeScript (no EN variant yet → RU copy as fallback).
  for (const cat of CURATED) total += insertMany(rowsFromCategory(cat, locale));

  // Curated categories authored as JSON (prefer curated-en/<file> for 'en').
  const curatedDir = join(here, 'curated');
  const curatedEnDir = join(here, 'curated-en');
  for (const file of readdirSync(curatedDir).filter((n) => n.endsWith('.json'))) {
    let cat: CuratedCategory | null = null;
    const enFile = join(curatedEnDir, file);
    if (en && existsSync(enFile)) {
      try { cat = JSON.parse(readFileSync(enFile, 'utf8')) as CuratedCategory; }
      catch { cat = null; } // malformed/half-written translation → fall back to ru
    }
    if (!cat) cat = JSON.parse(readFileSync(join(curatedDir, file), 'utf8')) as CuratedCategory;
    total += insertMany(rowsFromCategory(cat, locale));
  }

  // Burp docs. Iterate the canonical RU set; for 'en' prefer the translated burp-en/<file>,
  // falling back to the RU file if it is missing or half-written.
  type BurpSec = { section: string; order?: number; entries: { title: string; path: string; order?: number; subcategory?: string; body: string }[] };
  const burpRu = join(here, 'burp');
  const burpEnDir = join(here, 'burp-en');
  if (existsSync(burpRu)) {
    for (const file of readdirSync(burpRu).filter((f) => f.endsWith('.json'))) {
      let sec: BurpSec | null = null;
      const enFile = join(burpEnDir, file);
      if (en && existsSync(enFile)) {
        try { sec = JSON.parse(readFileSync(enFile, 'utf8')) as BurpSec; } catch { sec = null; }
      }
      if (!sec) sec = JSON.parse(readFileSync(join(burpRu, file), 'utf8')) as BurpSec;
      total += insertMany(sec.entries.map((e) => ({
        type: 'doc', category: sec!.section, subcategory: e.subcategory ?? null, title: e.title, body: e.body,
        language: 'md', locale, tags: [], source: 'https://portswigger.net' + e.path,
        meta: { path: e.path, sectionOrder: sec!.order ?? 99, pageOrder: e.order ?? 0 },
      })));
    }
  }

  // Commands. Structured builder tools come from commands-structured-en/ for 'en';
  // coveredKeys is always taken from the RU set (titles are verbatim) so the md filter
  // stays consistent across locales. Markdown long-tail refs stay RU until translated.
  const cmdEnDir = join(here, 'commands-structured-en');
  const ruStructured = parseStructuredCommands();
  const structuredEntries = en && existsSync(cmdEnDir) ? parseStructuredCommands(cmdEnDir).entries : ruStructured.entries;
  const md = parseCommands().filter((e) => !ruStructured.coveredKeys.has(cmdKey(e.category, e.title)));
  total += insertMany(withLocale(structuredEntries, locale));
  total += insertMany(withLocale(md, locale));

  // GTFOBins: en uses the original English function descriptions + technique comments
  // (no RU overlay). Wordlist refs are mostly English data (RU copy fallback for now).
  total += insertMany(withLocale(parseGtfobins(locale), locale));
  total += insertMany(withLocale(parseWordlistsRef(), locale));

  return total;
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

  // Reference content for both locales (en prefers *-en/ sources, falls back to ru copy).
  section('Russian content');
  const ruTotal = seedContent('ru');
  console.log(`  = ${ruTotal} ru entries`);
  section('English content');
  const enTotal = seedContent('en');
  console.log(`  = ${enTotal} en entries`);
  let total = ruTotal + enTotal;

  // Checklists — parsed from operational.md + research.md into structured form.
  // Definitions are replaced; the user's ticks & notes (checklist_state) are NEVER touched.
  // (Currently Russian only; the English UI shows the Russian checklists until translated.)
  section('Checklists');
  const lists = parseChecklists();
  replaceChecklists(lists);
  const itemTotal = lists.reduce((n, l) => n + l.sections.reduce((m, s) => m + s.items.length, 0), 0);
  console.log(`  = ${lists.length} checklists · ${itemTotal} items`);

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
