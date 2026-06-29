import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { db, setSetting } from '../server/db';
import { insertMany, type EntryInput } from '../server/repo';
import { parseChecklists } from './parsers/checklists';
import { parseCommands } from './parsers/commands';
import { parseStructuredCommands, cmdKey } from './parsers/commands-structured';
import { parseGtfobins } from './parsers/gtfobins';
import { parseScripts } from './parsers/scripts';
import { parseChains } from './parsers/chains';
import { parseReports } from './parsers/reports';
import { parseWordlistsRef } from './parsers/wordlists-ref';
import { replaceChecklists } from '../server/checklists';
import { CURATED, CURATED_EN } from './curated/index';
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

  // Curated categories authored in TypeScript (CURATED_EN holds the English versions).
  for (const cat of (en ? CURATED_EN : CURATED)) total += insertMany(rowsFromCategory(cat, locale));

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
  const structured = en && existsSync(cmdEnDir) ? parseStructuredCommands(cmdEnDir) : parseStructuredCommands();
  const mdEnDir = join(here, 'commands-en');
  const mdEntries = en && existsSync(mdEnDir) ? parseCommands(mdEnDir, 'en') : parseCommands();
  // coveredKeys + md taken from the SAME locale set so the "structured overrides md" filter matches.
  const md = mdEntries.filter((e) => !structured.coveredKeys.has(cmdKey(e.category, e.title)));
  total += insertMany(withLocale(structured.entries, locale));
  total += insertMany(withLocale(md, locale));

  // GTFOBins: en uses the original English function descriptions + technique comments
  // (no RU overlay). Wordlist refs are mostly English data (RU copy fallback for now).
  total += insertMany(withLocale(parseGtfobins(locale), locale));
  total += insertMany(withLocale(parseWordlistsRef(locale), locale));

  // Scripts: full copy-paste-and-run scripts. EN prefers scripts-en/, falls back to the RU source.
  const scriptsEnDir = join(here, 'scripts-en');
  const scripts = en && existsSync(scriptsEnDir) ? parseScripts(scriptsEnDir) : parseScripts();
  total += insertMany(withLocale(scripts, locale));

  // Attack Chains: curated leveled kill-chains. EN prefers chains-en/, falls back to the RU source.
  const chainsEnDir = join(here, 'chains-en');
  const chains = en && existsSync(chainsEnDir) ? parseChains(chainsEnDir) : parseChains();
  total += insertMany(withLocale(chains, locale));

  // Report templates (RU; EN prefers reports-en/, falls back to the RU source).
  const reportsEnDir = join(here, 'reports-en');
  const reports = en && existsSync(reportsEnDir) ? parseReports(reportsEnDir) : parseReports();
  total += insertMany(withLocale(reports, locale));

  return total;
}

function main() {
  console.log('[ARS3NAL] seeding database…');

  // Preserve ★/notes the user set on SEEDED (is_custom=0) rows — re-applied after reseed.
  // Match by type|locale|category|title|body (mirrors repo.ts findSeed): every reference row is
  // seeded once per locale with the same title, so WITHOUT locale+body a per-locale note bleeds
  // onto the other locale and a second note in the loop clobbers the first (silent data loss).
  const preserved = db.prepare(
    "SELECT type, category, title, locale, body, is_favorite, notes FROM entries WHERE is_custom=0 AND (is_favorite=1 OR (notes IS NOT NULL AND notes<>''))",
  ).all() as { type: string; category: string | null; title: string; locale: string; body: string | null; is_favorite: number; notes: string | null }[];

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

  // English checklist overlay: parse the en markdown, align to the RU structure by
  // slug + position so EN items reuse the RU keys (progress is shared across languages),
  // and stash the EN definitions in settings for the en locale. Falls back to RU per
  // field where a translation is missing or the structure does not line up.
  const enChkDir = join(here, 'checklists-en');
  let enLists = lists;
  if (existsSync(enChkDir)) {
    const parsedEn = parseChecklists(enChkDir, 'en');
    const enBySlug = new Map(parsedEn.map((l) => [l.slug, l]));
    enLists = lists.map((ru) => {
      const en = enBySlug.get(ru.slug);
      if (!en) return ru;
      const sections = ru.sections.map((rs, si) => {
        const es = en.sections[si];
        return {
          name: es?.name ?? rs.name,
          items: rs.items.map((ri, ii) => ({ key: ri.key, text: es?.items[ii]?.text ?? ri.text })),
        };
      });
      return { ...ru, title: en.title, research: en.research || ru.research, sections };
    });
    const enCount = enLists.filter((l, i) => l !== lists[i]).length;
    console.log(`  = en overlay: ${enCount}/${lists.length} translated (rest fall back to ru)`);
  }
  setSetting('checklists:en', JSON.stringify(enLists));

  // Re-apply the preserved ★/notes onto the freshly-seeded rows.
  if (preserved.length) {
    const upd = db.prepare(
      "UPDATE entries SET is_favorite=@is_favorite, notes=COALESCE(@notes, notes) WHERE is_custom=0 AND type=@type AND locale=@locale AND IFNULL(category,'')=IFNULL(@category,'') AND title=@title AND IFNULL(body,'')=IFNULL(@body,'')",
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
