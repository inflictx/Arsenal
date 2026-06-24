// UI strings for reference views: payloads, gtfobins, wordlists, burp.
// Filled by the i18n pass. Keys namespaced per view (e.g. "payloads.filter").
const p: { ru: Record<string, string>; en: Record<string, string> } = {
  ru: {
    // payloads.ts (source placeholders were English UI chrome; ru is the translation)
    'payloads.filterCats': 'Фильтр категорий…',
    'payloads.filterInCat': 'Фильтр в этой категории…',
    'payloads.empty': 'Здесь пусто',
    'payloads.countPayloads': 'payload’ов',

    // gtfobins.ts
    'gtfobins.searchPlaceholder': 'Поиск бинаря…',
    'gtfobins.creditPrefix': 'Данные — ',
    'gtfobins.funcLabel': 'Функции',
    'gtfobins.ctxLabel': 'Контексты',
    'gtfobins.pluralOne': 'бинарь',
    'gtfobins.pluralFew': 'бинаря',
    'gtfobins.pluralMany': 'бинарей',
    'gtfobins.copy': 'Copy',
    'gtfobins.notLoaded': '<p>GTFOBins ещё не загружены — выполни <code>npm run seed</code>.</p>',

    // wordlists.ts
    'wordlists.searchPlaceholder': 'Поиск словаря…',
    'wordlists.intro': 'Топовые словари: путь на Kali, ссылка на GitHub и для чего каждый нужен. Пути сверены на боевой системе (SecLists 2025.3).',
    'wordlists.whenLabel': 'Когда: ',
    'wordlists.copy': 'Copy',
    'wordlists.rawLink': 'Прямая ссылка ↗',
    'wordlists.searchTitle': 'Поиск',
    'wordlists.notFound': 'Ничего не найдено.',
    'wordlists.pluralOne': 'словарь',
    'wordlists.pluralFew': 'словаря',
    'wordlists.pluralMany': 'словарей',
    'wordlists.notLoaded': 'Справочник ещё не загружен — выполни npm run seed.',

    // burp.ts
    'burp.searchPlaceholder': 'Поиск по докам…',
    'burp.creditPrefix': 'На основе документации ',
    'burp.pluralOne': 'результат',
    'burp.pluralFew': 'результата',
    'burp.pluralMany': 'результатов',
    'burp.notFound': 'Ничего не найдено',
    'burp.copy': 'Copy',
    'burp.notLoaded': '<p>Документация ещё не загружена.</p>',
    'burp.notLoadedTitle': 'Burp Suite — документация',
  },
  en: {
    // payloads.ts
    'payloads.filterCats': 'Filter categories…',
    'payloads.filterInCat': 'Filter in this category…',
    'payloads.empty': 'Nothing here',
    'payloads.countPayloads': 'payloads',

    // gtfobins.ts
    'gtfobins.searchPlaceholder': 'Search a binary…',
    'gtfobins.creditPrefix': 'Data from ',
    'gtfobins.funcLabel': 'Functions',
    'gtfobins.ctxLabel': 'Contexts',
    'gtfobins.pluralOne': 'binary',
    'gtfobins.pluralFew': 'binaries',
    'gtfobins.pluralMany': 'binaries',
    'gtfobins.copy': 'Copy',
    'gtfobins.notLoaded': '<p>GTFOBins are not loaded yet. Run <code>npm run seed</code>.</p>',

    // wordlists.ts
    'wordlists.searchPlaceholder': 'Search a wordlist…',
    'wordlists.intro': 'Top wordlists: Kali path, GitHub link and what each one is for. Paths verified on a live system (SecLists 2025.3).',
    'wordlists.whenLabel': 'When: ',
    'wordlists.copy': 'Copy',
    'wordlists.rawLink': 'Direct link ↗',
    'wordlists.searchTitle': 'Search',
    'wordlists.notFound': 'Nothing found.',
    'wordlists.pluralOne': 'wordlist',
    'wordlists.pluralFew': 'wordlists',
    'wordlists.pluralMany': 'wordlists',
    'wordlists.notLoaded': 'The reference is not loaded yet. Run npm run seed.',

    // burp.ts
    'burp.searchPlaceholder': 'Search the docs…',
    'burp.creditPrefix': 'Based on documentation from ',
    'burp.pluralOne': 'result',
    'burp.pluralFew': 'results',
    'burp.pluralMany': 'results',
    'burp.notFound': 'Nothing found',
    'burp.copy': 'Copy',
    'burp.notLoaded': '<p>Documentation is not loaded yet.</p>',
    'burp.notLoadedTitle': 'Burp Suite documentation',
  },
};
export default p;
