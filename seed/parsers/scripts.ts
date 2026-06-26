import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntryInput } from '../../server/repo';

// Scripts module: full copy-paste-and-run scripts (bash/python/…), distinct from the
// one-liners in Commands. Source files live in seed/scripts/*.json (RU) and the parallel
// seed/scripts-en/*.json (EN). Each becomes a type=script entry; the body is markdown
// (description + fenced code), and meta carries the structured chrome the view renders
// above the body (language, deps, placeholders, badges, rating, source, license).

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(here, '..', 'scripts');

interface ScriptEntry {
  title: string;
  subcategory?: string;
  lang?: string;            // script language: python | bash | js | php | …
  tags?: string[];          // free tags (vuln class etc.) — joined with lang+group for filtering
  body: string;             // markdown: description + ```fenced code```
  deps?: string;            // install hint, e.g. "pip install requests"
  placeholders?: string;    // substitution tokens, e.g. "{{URL}} {{MARKER}}"
  badges?: string[];        // ui badges: destructive | paid | http2 | root | legacy | …
  rating?: string;          // "must" | "nice"
  source?: string;          // upstream link (technique/reference)
  license?: string;         // license note
}
interface ScriptFile {
  category: string;         // e.g. "SQL Injection", "Recon · Subdomains"
  group?: string;           // top-level filter group: exploit | recon | utility | modern
  catOrder?: number;        // sort order within the list
  source?: string;          // file-level default source
  entries: ScriptEntry[];
}

// Parse seed/scripts(/-en)/*.json into type=script entries.
export function parseScripts(dir: string = DEFAULT_DIR): EntryInput[] {
  if (!existsSync(dir)) return [];
  const rows: EntryInput[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let data: ScriptFile;
    try { data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as ScriptFile; } catch { continue; }
    if (!data?.entries) continue;
    for (const e of data.entries) {
      const tags = new Set<string>(e.tags ?? []);
      if (e.lang) tags.add(e.lang);
      if (data.group) tags.add(data.group);
      for (const b of e.badges ?? []) tags.add(b);
      rows.push({
        type: 'script',
        category: data.category,
        subcategory: e.subcategory ?? null,
        title: e.title,
        body: e.body,
        language: 'md',
        tags: [...tags],
        source: e.source ?? data.source ?? null,
        meta: {
          lang: e.lang ?? 'bash',
          group: data.group ?? 'misc',
          catOrder: data.catOrder ?? 99,
          deps: e.deps ?? null,
          placeholders: e.placeholders ?? null,
          badges: e.badges ?? [],
          rating: e.rating ?? null,
          source: e.source ?? data.source ?? null,
          license: e.license ?? null,
        },
      });
    }
  }
  return rows;
}
