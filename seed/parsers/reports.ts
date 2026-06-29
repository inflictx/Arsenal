import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntryInput } from '../../server/repo';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'reports');

// Bug-bounty report templates: per-class skeletons (title, summary, steps, PoC, impact, CVSS,
// CWE, remediation, refs) you fill in per finding. type=report_tmpl. The body is markdown that
// uses {TARGET}/{USER_A}/{USER_B} tokens so the active engagement context substitutes live.
interface Tmpl { title: string; vulnClass?: string; cwe?: string; severity?: string; cvss?: string; body: string; }
interface RFile { category: string; catOrder?: number; source?: string; templates: Tmpl[]; }

export function parseReports(dir: string = DIR): EntryInput[] {
  const out: EntryInput[] = [];
  if (!existsSync(dir)) return out;
  let order = 0;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let data: RFile;
    try { data = JSON.parse(readFileSync(join(dir, file), 'utf8')) as RFile; } catch { continue; }
    if (!data?.templates?.length) continue;
    for (const tmpl of data.templates) {
      out.push({
        type: 'report_tmpl',
        category: data.category,
        subcategory: tmpl.vulnClass ?? null,
        title: tmpl.title,
        body: tmpl.body,
        language: 'md',
        tags: [(tmpl.vulnClass || '').toLowerCase(), (tmpl.severity || '').toLowerCase()].filter(Boolean),
        source: data.source ?? null,
        meta: {
          vulnClass: tmpl.vulnClass ?? '',
          cwe: tmpl.cwe ?? '',
          severity: tmpl.severity ?? '',
          cvss: tmpl.cvss ?? '',
          catOrder: data.catOrder ?? 1,
          order: order++,
        },
      });
    }
  }
  return out;
}
