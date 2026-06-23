import { h, clear } from '../lib/dom';
import { api, type Entry, type Category } from '../api';
import { PayloadCard } from '../components/card';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';

export function PayloadsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  const catFilter = SearchField({ placeholder: 'Filter categories…', onInput: () => renderCats() });
  const catScroll = h('div', { class: 'scroll' });
  const catPanel = h('aside', { class: 'catlist' }, catFilter.el, catScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Payloads');
  const countEl = h('span', { class: 'badge' }, '');
  const search = SearchField({ placeholder: 'Filter in this category…', mono: true, onInput: (v) => applyFilter(v) });
  const cardsWrap = h('div', { class: 'cards' });
  const right = h('div', { style: { minWidth: '0' } },
    h('div', { class: 'cards-head' }, titleEl, countEl),
    h('div', { style: { margin: '12px 0 16px' } }, search.el),
    cardsWrap,
  );

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, catPanel, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  let categories: Category[] = [];
  let active = params.sub || '';
  let wantId = params.id || ''; // deep-link from ⌘K: scroll to + flash this exact card once
  let loaded: Entry[] = [];

  function renderCats() {
    clear(catScroll);
    const f = catFilter.input.value.toLowerCase();
    for (const c of categories) {
      if (f && !c.category.toLowerCase().includes(f)) continue;
      catScroll.appendChild(
        h('div', { class: 'cat' + (c.category === active ? ' active' : ''), onclick: () => selectCat(c.category) },
          h('span', {}, c.category),
          h('span', { class: 'n' }, String(c.n)),
        ),
      );
    }
  }

  function showCards(entries: Entry[]) {
    clear(cardsWrap);
    if (!entries.length) {
      cardsWrap.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '∅'), 'Nothing here'));
      return;
    }
    for (const e of entries) cardsWrap.appendChild(PayloadCard(e));
  }

  // In-category search is a fast client-side filter over the loaded category.
  function applyFilter(q: string) {
    const s = q.trim().toLowerCase();
    if (!s) { countEl.textContent = loaded.length + ' payloads'; showCards(loaded); return; }
    const filtered = loaded.filter((e) =>
      e.title.toLowerCase().includes(s) ||
      (e.body ?? '').toLowerCase().includes(s) ||
      (e.subcategory ?? '').toLowerCase().includes(s) ||
      e.tags.some((t) => t.includes(s)),
    );
    countEl.textContent = filtered.length + ' / ' + loaded.length;
    showCards(filtered);
  }

  async function selectCat(cat: string) {
    active = cat;
    search.clear();
    titleEl.textContent = cat;
    renderCats();
    window.scrollTo({ top: 0 });
    loaded = await api.entries({ type: 'payload', category: cat, limit: 1000 });
    countEl.textContent = loaded.length + ' payloads';
    showCards(loaded);
    flashWanted();
  }

  // When opened from ⌘K, jump to the exact payload card (not the top of the category).
  function flashWanted() {
    if (!wantId) return;
    const card = cardsWrap.querySelector('[data-id="' + wantId + '"]') as HTMLElement | null;
    wantId = '';
    if (card) { card.scrollIntoView({ block: 'center' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); }
  }

  (async () => {
    categories = await api.categories('payload');
    if (!active && categories.length) {
      active = categories.find((c) => /xss/i.test(c.category))?.category ?? categories[0]!.category;
    }
    renderCats();
    if (active) selectCat(active);
  })();

  return () => scrollTop.destroy();
}
