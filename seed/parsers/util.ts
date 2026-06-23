import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const STOP = new Set([
  'the', 'and', 'for', 'with', 'using', 'from', 'via', 'your', 'this', 'that',
  'are', 'can', 'use', 'used', 'into', 'out', 'all', 'any', 'not', 'how', 'when',
  'common', 'other', 'example', 'examples', 'payload', 'payloads',
]);

/** Lowercased keyword tokens from a heading, minus stopwords. */
export function keywords(s: string, max = 3): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, max);
}

/** Dedupe + clean a tag list. */
export function uniqTags(arr: (string | undefined | null)[], max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arr) {
    if (!a) continue;
    const t = a.toLowerCase().trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Recursively yield every file path under dir (skips .git). */
export function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else yield full;
  }
}
