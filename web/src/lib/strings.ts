// Bilingual UI strings. `ru` is the source of truth; `en` is the translation.
// Keys are namespaced by area (e.g. "topbar.entries"). Add every key to BOTH maps.
// Missing keys fall back to ru, then to the key itself (see i18n.ts t()).

type Dict = Record<string, string>;

const ru: Dict = {
  // shell / sidebar
  'nav.reference': 'Справочник',
  'nav.workspace': 'Рабочее',
  'sidebar.brandSub': '// личный набор для пентеста',
  'sidebar.offline': 'офлайн · v0.1',
  // topbar
  'topbar.searchPlaceholder': "Поиск по payload'ам, командам, техникам…",
  'topbar.entries': 'записей',
};

const en: Dict = {
  // shell / sidebar
  'nav.reference': 'Reference',
  'nav.workspace': 'Workspace',
  'sidebar.brandSub': '// personal payload toolkit',
  'sidebar.offline': 'offline · v0.1',
  // topbar
  'topbar.searchPlaceholder': 'Search payloads, commands, techniques…',
  'topbar.entries': 'entries',
};

export const STRINGS = { ru, en };

export type StrKey = string;
