import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';

interface WLMeta {
  category: string; name: string; purpose?: string; whenToUse?: string;
  size?: string; tool?: string; paths?: string[]; github?: string; raw?: string; tags?: string[];
  catOrder: number; order: number;
}

// First tag that names a source → coloured badge.
const SRC_TAGS = ['seclists', 'assetnote', 'kali', 'onelistforall', 'dirsearch', 'arjun',
  'jhaddix', 'n0kovo', 'weakpass', 'online', 'blns', 'param-miner', 'x8', 'commix', 'dnsmap', 'six2dez'];

export function WordlistsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  let all: Entry[] = [];
  let cats: string[] = [];
  let activeCat: string | null = null;

  const meta = (e: Entry): WLMeta => e.meta as WLMeta;

  const search = SearchField({ placeholder: 'Поиск словаря…', onInput: () => render() });
  const countEl = h('div', { class: 'burp-hits' });
  const catScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' }, search.el, countEl, catScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Wordlists');
  const subEl = h('p', { class: 'wl-intro' },
    'Топовые словари: путь на Kali, ссылка на GitHub и для чего каждый нужен. Пути сверены на боевой системе (SecLists 2025.3).');
  const cardsEl = h('div', { class: 'wl-cards' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head' }, titleEl), subEl, cardsEl);

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  function srcBadge(m: WLMeta): HTMLElement | null {
    const t = (m.tags ?? []).find((x) => SRC_TAGS.includes(x));
    return t ? h('span', { class: 'wl-src ' + t }, t) : null;
  }

  function matchesSearch(e: Entry, q: string): boolean {
    const m = meta(e);
    return [m.name, m.purpose, m.whenToUse, m.tool, m.category, (m.tags ?? []).join(' '), (m.paths ?? []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase().includes(q);
  }

  function card(e: Entry): HTMLElement {
    const m = meta(e);
    const kids: (HTMLElement | null)[] = [
      h('div', { class: 'wl-card-head' }, h('span', { class: 'wl-name' }, m.name), srcBadge(m)),
    ];
    if (m.purpose) kids.push(h('p', { class: 'wl-purpose' }, m.purpose));
    if (m.whenToUse) kids.push(h('p', { class: 'wl-when' }, h('span', { class: 'wl-when-l' }, 'Когда: '), m.whenToUse));

    const chips = h('div', { class: 'wl-chips' });
    if (m.size) chips.appendChild(h('span', { class: 'wl-chip wl-size' }, m.size));
    if (m.tool) chips.appendChild(h('span', { class: 'wl-chip wl-tool' }, m.tool));
    if (chips.childElementCount) kids.push(chips);

    for (const p of m.paths ?? []) {
      const row = h('div', { class: 'wl-path' }, h('code', {}, p));
      const btn = copyButton(() => p, 'Copy');
      btn.classList.add('wl-copy');
      row.appendChild(btn);
      kids.push(row);
    }

    const links = h('div', { class: 'wl-links' });
    if (m.github) links.appendChild(h('a', { class: 'wl-link', href: m.github, target: '_blank', rel: 'noreferrer' }, 'GitHub ↗'));
    if (m.raw && m.raw !== m.github) links.appendChild(h('a', { class: 'wl-link', href: m.raw, target: '_blank', rel: 'noreferrer' }, 'Прямая ссылка ↗'));
    if (links.childElementCount) kids.push(links);

    return h('div', { class: 'card wl-card' }, ...(kids.filter(Boolean) as HTMLElement[]));
  }

  function renderCatList() {
    clear(catScroll);
    const q = search.input.value.trim().toLowerCase();
    for (const c of cats) {
      const n = all.filter((e) => meta(e).category === c).length;
      catScroll.appendChild(
        h('div', { class: 'cat' + (activeCat === c && !q ? ' active' : ''),
          onclick: () => { search.clear(); activeCat = c; render(); } },
          h('span', { class: 'chk-row-title' }, c),
          h('span', { class: 'burp-sec-n' }, String(n)),
        ),
      );
    }
  }

  function render() {
    renderCatList();
    clear(cardsEl);
    const q = search.input.value.trim().toLowerCase();

    if (q) {
      const hits = all.filter((e) => matchesSearch(e, q));
      titleEl.textContent = 'Поиск';
      countEl.textContent = `${hits.length} ${plural(hits.length)}`;
      let curCat: string | null = null;
      for (const e of hits) {
        const c = meta(e).category;
        if (c !== curCat) {
          curCat = c;
          cardsEl.appendChild(h('div', { class: 'wl-group-h' }, c,
            h('span', { class: 'n' }, String(hits.filter((x) => meta(x).category === c).length))));
        }
        cardsEl.appendChild(card(e));
      }
      if (!hits.length) cardsEl.appendChild(h('p', { class: 'wl-intro' }, 'Ничего не найдено.'));
      return;
    }

    const list = all.filter((e) => meta(e).category === activeCat);
    titleEl.textContent = activeCat ?? 'Wordlists';
    countEl.textContent = `${list.length} ${plural(list.length)}`;
    for (const e of list) cardsEl.appendChild(card(e));
  }

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'словарь';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'словаря';
    return 'словарей';
  }

  (async () => {
    try { all = await api.entries({ type: 'wordlist_ref', limit: 1000 }); } catch { all = []; }
    all.sort((a, b) => (meta(a).catOrder - meta(b).catOrder) || (meta(a).order - meta(b).order));
    cats = [...new Set(all.map((e) => meta(e).category))];
    if (!all.length) {
      subEl.remove();
      cardsEl.appendChild(h('p', { class: 'wl-intro' }, 'Справочник ещё не загружен — выполни npm run seed.'));
      return;
    }
    activeCat = (params.sub && cats.includes(params.sub)) ? params.sub : cats[0]!;
    render();
  })();

  return () => scrollTop.destroy();
}
