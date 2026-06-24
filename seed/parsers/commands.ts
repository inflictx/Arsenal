import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntryInput } from '../../server/repo';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'commands');
const DIR_EN = join(here, '..', 'commands-en');

// RU category names that need an English label for the en locale (others are already English).
const CAT_EN: Record<string, string> = {
  'Обзор': 'Overview',
  'Крекинг паролей': 'Password Cracking',
};

interface Cat { category: string; order: number; }
const OVERVIEW: Cat = { category: 'Обзор', order: 1 };

// `# DOMAIN` headers → ARS3NAL category + sort order. First match wins.
const DOMAINS: { match: RegExp; cat: Cat }[] = [
  { match: /\bweb\b/i, cat: { category: 'WEB', order: 2 } },
  { match: /active directory|network|services/i, cat: { category: 'Network / AD', order: 3 } },
  { match: /privilege escalation/i, cat: { category: 'Privilege Escalation', order: 4 } },
  { match: /крекинг|cracking/i, cat: { category: 'Крекинг паролей', order: 5 } },
  { match: /binary exploitation|\bpwn\b/i, cat: { category: 'Pwn', order: 6 } },
  { match: /reverse engineering/i, cat: { category: 'Reverse Engineering', order: 7 } },
  { match: /cryptography|\bcrypto\b/i, cat: { category: 'Crypto', order: 8 } },
  { match: /forensics|stego/i, cat: { category: 'Forensics & Stego', order: 9 } },
  { match: /exploit|pivot|ресурсы/i, cat: { category: 'Exploit / Pivoting', order: 10 } },
];

function classifyH1(text: string): Cat | null {
  if (/recommendations|caveats|справочник/i.test(text)) return OVERVIEW;
  for (const d of DOMAINS) if (d.match.test(text)) return d.cat;
  return null; // unknown heading → keep current domain
}

function overviewTitle(text: string, en: boolean): string {
  if (/справочник|reference/i.test(text)) return en ? 'About this reference' : 'О справочнике';
  if (/recommendations|рекоменд/i.test(text)) return en ? 'Recommendations: workflow stages' : 'Рекомендации — стадии работы';
  if (/caveats/i.test(text)) return en ? 'Caveats: version notes' : 'Caveats — нюансы версий';
  return text.trim();
}

// "1. nmap — сканер портов" → { title: "nmap", subcategory: "сканер портов" }
function splitHeading(s: string): { title: string; subcategory: string | null } {
  const noNum = s.replace(/^\s*\d+\.\s*/, '').trim();
  const parts = noNum.split(/\s+[—–]\s+/); // em / en dash with surrounding spaces
  return {
    title: (parts[0] ?? '').trim(),
    subcategory: parts.length > 1 ? parts.slice(1).join(' — ').trim() : null,
  };
}

interface Draft { category: string; catOrder: number; title: string; subcategory: string | null; lines: string[]; }

export function parseCommands(dir: string = DIR, locale: 'ru' | 'en' = 'ru'): EntryInput[] {
  if (!existsSync(dir)) return [];
  const en = locale === 'en';
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort((a, b) => (a === 'reference.md' ? -1 : b === 'reference.md' ? 1 : a.localeCompare(b)));

  const drafts: Draft[] = [];
  for (const file of files) {
    const text = readFileSync(join(dir, file), 'utf8');
    let cur: Cat = OVERVIEW;
    let entry: Draft | null = null;
    const flush = () => {
      if (entry && entry.lines.join('\n').trim()) drafts.push(entry);
      entry = null;
    };
    for (const raw of text.split(/\r?\n/)) {
      const h1 = /^#\s+(.+?)\s*$/.exec(raw);
      const h2 = /^##\s+(.+?)\s*$/.exec(raw);
      if (h1) {
        const cls = classifyH1(h1[1] ?? '');
        flush();
        if (cls === OVERVIEW) {
          cur = OVERVIEW;
          entry = { category: cur.category, catOrder: cur.order, title: overviewTitle(h1[1] ?? '', en), subcategory: null, lines: [] };
        } else if (cls) {
          cur = cls;
        }
      } else if (h2) {
        flush();
        const { title, subcategory } = splitHeading(h2[1] ?? '');
        entry = { category: cur.category, catOrder: cur.order, title, subcategory, lines: [] };
      } else if (entry) {
        entry.lines.push(raw);
      }
    }
    flush();
  }

  return drafts.map((d, i) => ({
    type: 'command',
    category: en ? (CAT_EN[d.category] ?? d.category) : d.category,
    subcategory: d.subcategory,
    title: d.title,
    body: d.lines
      .join('\n')
      .replace(/^\s*---\s*$/gm, '') // strip stray section-separator rules
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    language: 'md',
    tags: [],
    source: null,
    meta: { catOrder: d.catOrder, toolOrder: i },
  }));
}
