import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { renderMarkdown } from '../lib/markdown';

// chip key → label (key matches the tags stored on each entry)
const FUNC_CHIPS: [string, string][] = [
  ['shell', 'Shell'], ['command', 'Command'], ['reverse-shell', 'Reverse shell'], ['bind-shell', 'Bind shell'],
  ['file-write', 'File write'], ['file-read', 'File read'], ['upload', 'Upload'], ['download', 'Download'], ['library-load', 'Library load'],
];
const CTX_CHIPS: [string, string][] = [
  ['sudo', 'Sudo'], ['suid', 'SUID'], ['capabilities', 'Capabilities'], ['limited-suid', 'Limited SUID'],
];

export function GtfobinsView(outlet: HTMLElement): () => void {
  clear(outlet);

  let bins: Entry[] = [];
  let active: Entry | null = null;
  const rowById = new Map<number, HTMLElement>();
  const filters = new Set<string>();

  const filter = SearchField({ placeholder: 'Поиск бинаря…', onInput: () => renderList() });
  const countEl = h('div', { class: 'burp-hits' });
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const credit = h('div', { class: 'gtfo-credit' },
    'Данные — ', h('a', { href: 'https://gtfobins.github.io', target: '_blank', rel: 'noreferrer' }, 'GTFOBins'), ' · GPL-3.0');
  const left = h('aside', { class: 'catlist' }, filter.el, countEl, listScroll, credit);

  const titleEl = h('h1', { class: 'cat-h' }, 'GTFOBins');
  const bodyEl = h('article', { class: 'md cmd-md' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head' }, titleEl), bodyEl);

  const chipBar = h('div', { class: 'gtfo-filters' });
  const addChips = (label: string, list: [string, string][], cls: string) => {
    chipBar.appendChild(h('span', { class: 'gtfo-filter-label' }, label));
    for (const [key, lbl] of list) {
      chipBar.appendChild(h('button', { class: 'gtfo-chip ' + cls, type: 'button',
        onclick: (e: MouseEvent) => {
          const b = e.currentTarget as HTMLElement;
          if (filters.has(key)) filters.delete(key); else filters.add(key);
          b.classList.toggle('on', filters.has(key));
          renderList();
        } }, lbl));
    }
  };
  addChips('Функции', FUNC_CHIPS, 'func');
  addChips('Контексты', CTX_CHIPS, 'ctx');

  outlet.appendChild(h('div', { class: 'content' }, chipBar, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'бинарь';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'бинаря';
    return 'бинарей';
  }

  function matches(b: Entry): boolean {
    const q = filter.input.value.trim().toLowerCase();
    if (q && !b.title.toLowerCase().includes(q)) return false;
    for (const f of filters) if (!b.tags.includes(f)) return false; // AND across selected filters
    return true;
  }

  function makeRow(b: Entry): HTMLElement {
    const row = h('div', { class: 'cat' + (active?.id === b.id ? ' active' : ''), onclick: () => select(b) },
      h('span', { class: 'chk-row-title' }, b.title));
    rowById.set(b.id, row);
    return row;
  }

  function renderList() {
    clear(listScroll);
    rowById.clear();
    const hits = bins.filter(matches);
    countEl.textContent = `${hits.length} ${plural(hits.length)}`;
    for (const b of hits) listScroll.appendChild(makeRow(b));
  }

  function select(b: Entry) {
    active = b;
    for (const [id, el] of rowById) el.classList.toggle('active', id === b.id);
    titleEl.textContent = b.title;
    bodyEl.innerHTML = renderMarkdown(b.body ?? '');
    bodyEl.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      const btn = copyButton(() => (code?.textContent ?? pre.textContent ?? ''), 'Copy');
      btn.classList.add('doc-copy');
      pre.appendChild(btn);
    });
  }

  (async () => {
    try { bins = await api.entries({ type: 'gtfobin', limit: 1000 }); } catch { bins = []; }
    bins.sort((a, b) => a.title.localeCompare(b.title));
    renderList();
    if (!bins.length) {
      bodyEl.innerHTML = '<p>GTFOBins ещё не загружены — выполни <code>npm run seed</code>.</p>';
      titleEl.textContent = 'GTFOBins';
      return;
    }
    select(bins[0]);
  })();

  return () => scrollTop.destroy();
}
