import { h } from '../lib/dom';
import { openPalette } from '../lib/palette';

const SEARCH_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;

export function Topbar(): { el: HTMLElement; setStat: (n: number) => void } {
  const statEl = h('span', { class: 'stat' }, h('b', {}, '…'), ' entries');
  const search = h('div', { class: 'search', onclick: () => openPalette() },
    h('span', { html: SEARCH_ICON }),
    h('input', { placeholder: 'Search payloads, commands, techniques…', readonly: true }),
    h('span', { class: 'kbd' }, '⌘K'),
  );
  const el = h('div', { class: 'topbar' }, search, h('div', { class: 'top-spacer' }), statEl);
  function setStat(n: number) {
    statEl.replaceChildren(h('b', {}, n.toLocaleString()), ' entries');
  }
  return { el, setStat };
}
