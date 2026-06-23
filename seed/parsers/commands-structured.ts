import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntryInput } from '../../server/repo';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'commands-structured');

interface SFlag { flag: string; value?: string; desc: string; mode?: string; }
interface SGroup { name: string; flags: SFlag[]; }
interface STool {
  title: string; subcategory?: string; purpose?: string; install?: string;
  binary?: string; target?: string; modes?: { name: string; desc?: string; target?: string }[];
  groups?: SGroup[]; recipes?: { cmd: string; note?: string }[]; notes?: string;
  category?: string; catOrder?: number; // optional per-tool override (one file may mix categories)
}
interface SFile { category: string; catOrder?: number; tools: STool[]; }

// Normalised key so a structured tool overrides its markdown twin even if titles differ slightly
// (e.g. "subfinder" vs "subfinder (ProjectDiscovery)", "gau / waybackurls" spacing).
export function cmdKey(category: string | null | undefined, title: string): string {
  const t = title.toLowerCase().replace(/\(.*?\)/g, '').replace(/[\s/]+/g, '').trim();
  return (category ?? '') + '::' + t;
}

// Structured tool reference (powers the command builder). Returns entries + the set of tool keys
// it covers, so the seed drops ONLY those markdown tools (mixed domains stay partly markdown).
export function parseStructuredCommands(): { entries: EntryInput[]; coveredKeys: Set<string> } {
  const coveredKeys = new Set<string>();
  const entries: EntryInput[] = [];
  if (!existsSync(DIR)) return { entries, coveredKeys };
  let order = 0;
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    let data: SFile;
    try { data = JSON.parse(readFileSync(join(DIR, file), 'utf8')); } catch { continue; }
    if (!data?.tools?.length) continue;
    for (const t of data.tools) {
      const category = t.category ?? data.category;
      const catOrder = t.catOrder ?? data.catOrder ?? 99;
      coveredKeys.add(cmdKey(category, t.title));
      const searchText = [
        t.purpose, t.install, t.notes,
        ...(t.groups ?? []).flatMap((g) => g.flags.map((f) => `${f.flag} ${f.desc}`)),
        ...(t.recipes ?? []).map((r) => `${r.cmd} ${r.note ?? ''}`),
      ].filter(Boolean).join('\n');
      entries.push({
        type: 'command',
        category,
        subcategory: t.subcategory ?? null,
        title: t.title,
        body: searchText,
        language: 'md',
        tags: [],
        source: null,
        meta: {
          catOrder,
          toolOrder: order++,
          structured: true,
          binary: t.binary ?? '',
          target: t.target ?? '',
          modes: t.modes ?? [],
          groups: t.groups ?? [],
          recipes: t.recipes ?? [],
          install: t.install ?? '',
          purpose: t.purpose ?? '',
          notes: t.notes ?? '',
        },
      });
    }
  }
  return { entries, coveredKeys };
}
