import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntryInput } from '../../server/repo';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'chains');

// Difficulty ladder so a newcomer can start at the easy end and climb.
export type ChainLevel = 'newbie' | 'intermediate' | 'advanced';
const LEVEL_ORDER: Record<string, number> = { newbie: 1, intermediate: 2, advanced: 3 };

// A step's `kind` is the arsenal content type it cross-links to. The view turns that into a
// clickable "open in <module>" deep-link; `q` is an optional category/title/search hint so the
// target view can pre-select. `note` steps are guidance with no module to open.
type StepKind = 'payload' | 'script' | 'checklist' | 'command' | 'gtfobin' | 'revshell' | 'note';

interface ChainStepIn { title: string; kind?: StepKind; q?: string; detail?: string; success?: string; alt?: boolean; }

// A step is an "alternative/branch" (not the next sequential move) when flagged, or when its title
// opens with one of these markers. Lets the view show alt steps as a branch off the spine.
const ALT_TITLE = /^\s*(альтернатив|вариант|запасн|бонус|опционал|ручной вариант|fallback|или\s|alternativ|variant|backup|bonus|optional|or\s)/i;
interface ChainIn {
  title: string;
  level?: ChainLevel;
  impact?: string;
  bounty?: string;
  why?: string;
  precondition?: string;
  tags?: string[];
  realWorld?: string;
  defense?: string;
  steps: ChainStepIn[];
}
interface ChainFile {
  domain: string;          // grouping key + chip label (e.g. "SSRF")
  domainLabel?: string;    // optional longer display label (e.g. "SSRF → облако")
  domainOrder?: number;    // order of the domain group in the list
  source?: string;
  chains: ChainIn[];
}

// Attack Chains: curated, leveled, clickable kill-chains. Each entry is `type=chain`; the whole
// structured chain lives in `meta` (mirrors the commands-structured pattern) and `body` is the
// searchable text only. The seed wires RU from seed/chains/ and EN from seed/chains-en/ (fallback).
export function parseChains(dir: string = DIR): EntryInput[] {
  const out: EntryInput[] = [];
  if (!existsSync(dir)) return out;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let data: ChainFile;
    try { data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as ChainFile; } catch { continue; }
    if (!data?.chains?.length) continue;
    const domain = data.domain;
    const domainLabel = data.domainLabel ?? domain;
    const domainOrder = data.domainOrder ?? 99;
    for (const c of data.chains) {
      const level: ChainLevel = c.level ?? 'intermediate';
      const steps = (c.steps ?? []).map((s, i) => ({
        n: i + 1,
        title: s.title,
        kind: (s.kind ?? 'note') as StepKind,
        q: s.q ?? '',
        detail: s.detail ?? '',
        success: s.success ?? '',
        alt: s.alt ?? ALT_TITLE.test(s.title),
      }));
      const searchText = [
        c.title, c.impact, c.why, c.precondition, c.realWorld,
        ...(c.tags ?? []),
        ...steps.map((s) => `${s.title} ${s.detail}`),
      ].filter(Boolean).join('\n');
      out.push({
        type: 'chain',
        category: domainLabel,
        subcategory: level,
        title: c.title,
        body: searchText,
        language: 'md',
        tags: [domain.toLowerCase().replace(/\s+/g, '-'), level, ...(c.tags ?? [])],
        source: data.source ?? null,
        meta: {
          structured: true,
          domain,
          domainLabel,
          domainOrder,
          level,
          levelOrder: LEVEL_ORDER[level] ?? 2,
          impact: c.impact ?? '',
          bounty: c.bounty ?? '',
          why: c.why ?? '',
          precondition: c.precondition ?? '',
          realWorld: c.realWorld ?? '',
          defense: c.defense ?? '',
          steps,
        },
      });
    }
  }
  return out;
}
