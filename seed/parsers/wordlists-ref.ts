import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { EntryInput } from '../../server/repo';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'wordlists-ref');
const DIR_EN = join(here, '..', 'wordlists-ref-en');

// Use-case categories in display order (the view sorts by this).
const CAT_ORDER = [
  'Контент и директории',
  'API и эндпоинты',
  'Поддомены и DNS',
  'VHosts',
  'Параметры',
  'Фаззинг и payload-листы',
  'Пароли',
  'Имена пользователей',
  'Учётки по умолчанию',
  'Установка и где лежат',
];
// English category names, SAME order (must match the values the en data files use).
const CAT_ORDER_EN = [
  'Content & directories',
  'API & endpoints',
  'Subdomains & DNS',
  'VHosts',
  'Parameters',
  'Fuzzing & payload lists',
  'Passwords',
  'Usernames',
  'Default credentials',
  'Setup & locations',
];

interface WLRef {
  category: string; name: string; purpose?: string; whenToUse?: string;
  size?: string; tool?: string; paths?: string[]; github?: string; raw?: string; tags?: string[];
}

/** Curated reference of the top wordlists → type=wordlist_ref entries (rendered as cards in the UI). */
export function parseWordlistsRef(locale: 'ru' | 'en' = 'ru'): EntryInput[] {
  if (!existsSync(DIR)) return [];
  const en = locale === 'en';
  const catList = en ? CAT_ORDER_EN : CAT_ORDER;
  const rows: EntryInput[] = [];
  let order = 0;
  // iterate the canonical RU file list; prefer the en translation per file
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    let arr: WLRef[];
    const enFile = join(DIR_EN, file);
    const src = en && existsSync(enFile) ? enFile : join(DIR, file);
    try { arr = JSON.parse(readFileSync(src, 'utf8')) as WLRef[]; } catch { continue; }
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const catOrder = catList.indexOf(e.category);
      const blob = [e.name, e.purpose, e.whenToUse, e.tool, (e.tags ?? []).join(' '), (e.paths ?? []).join(' ')]
        .filter(Boolean).join('\n');
      rows.push({
        type: 'wordlist_ref',
        category: e.category,
        subcategory: e.tool ?? null,
        title: e.name,
        body: blob,
        language: null,
        tags: e.tags ?? [],
        source: e.github ?? e.raw ?? null,
        meta: { ...e, catOrder: catOrder < 0 ? 99 : catOrder, order: order++ },
      });
    }
  }
  return rows;
}
