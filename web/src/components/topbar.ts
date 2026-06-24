import { h } from '../lib/dom';
import { openPalette } from '../lib/palette';
import { t, getLang, setLang } from '../lib/i18n';

const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;

export function Topbar(): { el: HTMLElement; setStat: (n: number) => void } {
  const statEl = h('span', { class: 'stat' }, h('b', {}, '…'), ' ', t('topbar.entries'));
  const search = h('div', { class: 'search', onclick: () => openPalette() },
    h('span', { html: SEARCH_ICON }),
    h('input', { placeholder: t('topbar.searchPlaceholder'), readonly: true }),
    h('span', { class: 'kbd' }, '⌘K'),
  );

  const lang = getLang();
  const langToggle = h('div', { class: 'lang-toggle', title: lang === 'ru' ? 'Switch to English' : 'Переключить на русский' },
    h('button', { class: 'lang-opt' + (lang === 'ru' ? ' on' : ''), onclick: () => setLang('ru') }, 'RU'),
    h('button', { class: 'lang-opt' + (lang === 'en' ? ' on' : ''), onclick: () => setLang('en') }, 'EN'),
  );

  const el = h('div', { class: 'topbar' }, search, h('div', { class: 'top-spacer' }), langToggle, statEl);
  function setStat(n: number) {
    statEl.replaceChildren(h('b', {}, n.toLocaleString()), ' ', t('topbar.entries'));
  }
  return { el, setStat };
}
