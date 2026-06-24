import { STRINGS, type StrKey } from './strings';

export type Lang = 'ru' | 'en';

const LS_KEY = 'ars:lang';

/** Current UI/content language. Defaults to Russian. */
export function getLang(): Lang {
  try {
    const l = localStorage.getItem(LS_KEY);
    if (l === 'en' || l === 'ru') return l;
  } catch { /* ignore */ }
  return 'ru';
}

/**
 * Switch language. We do a full reload: it re-renders every view and re-fetches
 * content in the new locale, which is simpler and more robust than reactive
 * re-rendering across the imperative DOM components.
 */
export function setLang(l: Lang): void {
  if (l === getLang()) return;
  try { localStorage.setItem(LS_KEY, l); } catch { /* ignore */ }
  location.reload();
}

export function toggleLang(): void {
  setLang(getLang() === 'ru' ? 'en' : 'ru');
}

/** Translate a UI string key for the current language (falls back to ru, then the key). */
export function t(key: StrKey): string {
  const lang = getLang();
  const table = STRINGS[lang] as Record<string, string>;
  return table[key] ?? (STRINGS.ru as Record<string, string>)[key] ?? key;
}
