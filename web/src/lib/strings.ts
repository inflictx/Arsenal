// Bilingual UI strings. `ru` is the source of truth; `en` is the translation.
// Keys are namespaced by area (e.g. "topbar.entries", "payloads.filter"). Missing
// keys fall back to ru, then to the key itself (see i18n.ts t()).
//
// Shell strings live inline here. Per-view strings live in ./strings/p-*.ts modules
// (one per group of views) so they can be edited independently without conflicts,
// and are merged in below.

type Dict = Record<string, string>;

import pReference from './strings/p-reference';
import pTools from './strings/p-tools';
import pMisc from './strings/p-misc';

const shellRu: Dict = {
  'nav.reference': 'Справочник',
  'nav.workspace': 'Рабочее',
  'sidebar.brandSub': '// личный набор для пентеста',
  'sidebar.offline': 'офлайн · v0.2',
  'topbar.searchPlaceholder': "Поиск по payload'ам, командам, техникам…",
  'topbar.entries': 'записей',
};

const shellEn: Dict = {
  'nav.reference': 'Reference',
  'nav.workspace': 'Workspace',
  'sidebar.brandSub': '// personal payload toolkit',
  'sidebar.offline': 'offline · v0.2',
  'topbar.searchPlaceholder': 'Search payloads, commands, techniques…',
  'topbar.entries': 'entries',
};

const ru: Dict = { ...shellRu, ...pReference.ru, ...pTools.ru, ...pMisc.ru };
const en: Dict = { ...shellEn, ...pReference.en, ...pTools.en, ...pMisc.en };

export const STRINGS = { ru, en };

export type StrKey = string;
