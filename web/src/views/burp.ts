import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { renderMarkdown } from '../lib/markdown';
import { t } from '../lib/i18n';

export function BurpView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  const filter = SearchField({ placeholder: t('burp.searchPlaceholder'), onInput: () => renderTree() });
  const treeScroll = h('div', { class: 'scroll burp-tree' });
  const credit = h('div', { class: 'gtfo-credit' },
    t('burp.creditPrefix'), h('a', { href: 'https://portswigger.net/burp/documentation', target: '_blank', rel: 'noreferrer' }, 'PortSwigger Burp Suite'));
  const left = h('aside', { class: 'catlist' }, filter.el, treeScroll, credit);

  const titleEl = h('h1', { class: 'cat-h' }, 'Burp Suite');
  const bodyEl = h('article', { class: 'md burp-md' });
  const right = h('div', { style: { minWidth: '0' } },
    h('div', { class: 'cards-head' }, titleEl),
    bodyEl,
  );

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  let docs: Entry[] = [];
  let active: Entry | null = null;
  const rowById = new Map<number, HTMLElement>();
  const collapsed = new Set<string>();
  let wasSearching = false;
  const persistCollapsed = () => {
    try { localStorage.setItem('burp.collapsed', JSON.stringify([...collapsed])); } catch { /* ignore */ }
  };
  function toggleSec(name: string) {
    if (collapsed.has(name)) collapsed.delete(name); else collapsed.add(name);
    persistCollapsed();
    renderTree();
  }
  function scrollActiveIntoView() {
    if (!active) return;
    const row = rowById.get(active.id);
    if (!row) return;
    const rRow = row.getBoundingClientRect();
    const rBox = treeScroll.getBoundingClientRect();
    treeScroll.scrollTop += rRow.top - rBox.top - (treeScroll.clientHeight - rRow.height) / 2;
  }

  function sections() {
    const map = new Map<string, Entry[]>();
    for (const d of docs) {
      const c = d.category || '—';
      if (!map.has(c)) map.set(c, []);
      map.get(c)!.push(d);
    }
    return [...map.entries()]
      .map(([name, pages]) => ({
        name,
        order: (pages[0].meta?.sectionOrder ?? 99) as number,
        pages: pages.slice().sort((a, b) => ((a.meta?.pageOrder ?? 0) as number) - ((b.meta?.pageOrder ?? 0) as number)),
      }))
      .sort((a, b) => a.order - b.order);
  }

  function makeRow(p: Entry, secLabel: string | null): HTMLElement {
    const row = h('div', { class: 'cat' + (active?.id === p.id ? ' active' : ''), onclick: () => select(p) },
      h('span', { class: 'chk-row-title' }, p.title),
      secLabel ? h('span', { class: 'burp-hit-sec' }, secLabel) : null);
    rowById.set(p.id, row);
    return row;
  }

  // Full-text-ish ranked search over the already-loaded docs (title + category + body).
  // Title match → top, then whole matching section (via category), then body mentions.
  function searchDocs(q: string): Entry[] {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const scored: { d: Entry; s: number }[] = [];
    for (const d of docs) {
      const title = d.title.toLowerCase();
      const cat = (d.category ?? '').toLowerCase();
      const body = (d.body ?? '').toLowerCase();
      if (!tokens.every((t) => title.includes(t) || cat.includes(t) || body.includes(t))) continue;
      let s = 0;
      if (tokens.every((t) => title.includes(t))) s += 1000;
      if (tokens.every((t) => cat.includes(t))) s += 400;
      for (const t of tokens) s += Math.min(body.split(t).length - 1, 25);
      scored.push({ d, s });
    }
    scored.sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title, 'ru'));
    return scored.map((x) => x.d);
  }

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return t('burp.pluralOne');
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return t('burp.pluralFew');
    return t('burp.pluralMany');
  }

  function renderTree() {
    clear(treeScroll);
    rowById.clear();
    const q = filter.input.value.trim();
    if (q) {
      wasSearching = true;
      const hits = searchDocs(q);
      treeScroll.appendChild(h('div', { class: 'burp-hits' },
        hits.length ? `${hits.length} ${plural(hits.length)}` : t('burp.notFound')));
      for (const p of hits) treeScroll.appendChild(makeRow(p, p.category));
      return;
    }
    const cameFromSearch = wasSearching;
    wasSearching = false;
    // returning from search → make sure the section we landed in is expanded
    if (cameFromSearch && active?.category) collapsed.delete(active.category);
    for (const sec of sections()) {
      const open = !collapsed.has(sec.name);
      treeScroll.appendChild(
        h('div', { class: 'nav-label burp-sec' + (open ? '' : ' collapsed'), onclick: () => toggleSec(sec.name) },
          h('span', { class: 'burp-chevron' }, open ? '▾' : '▸'),
          h('span', { class: 'burp-sec-name' }, sec.name),
          h('span', { class: 'burp-sec-n' }, String(sec.pages.length))),
      );
      if (open) for (const p of sec.pages) treeScroll.appendChild(makeRow(p, null));
    }
    if (cameFromSearch && active) scrollActiveIntoView();
  }

  function select(p: Entry) {
    active = p;
    for (const [id, el] of rowById) el.classList.toggle('active', id === p.id);
    titleEl.textContent = p.title;
    bodyEl.innerHTML = renderMarkdown(p.body ?? '');
    bodyEl.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      const btn = copyButton(() => (code?.textContent ?? pre.textContent ?? ''), t('burp.copy'));
      btn.classList.add('doc-copy');
      pre.appendChild(btn);
    });
  }

  (async () => {
    try { docs = await api.entries({ type: 'doc', limit: 1000 }); } catch { docs = []; }
    if (!docs.length) {
      renderTree();
      bodyEl.innerHTML = t('burp.notLoaded');
      titleEl.textContent = t('burp.notLoadedTitle');
      return;
    }
    const secs = sections();
    let saved: unknown = null;
    try { saved = JSON.parse(localStorage.getItem('burp.collapsed') ?? 'null'); } catch { /* ignore */ }
    if (Array.isArray(saved)) for (const n of saved) collapsed.add(String(n));
    else secs.forEach((s) => collapsed.add(s.name)); // default: all groups collapsed (clean overview)
    const want = params.id ? docs.find((d) => String(d.id) === params.id) : (params.sub ? docs.find((d) => d.title === params.sub) : null);
    if (want) { const sec = secs.find((s) => s.pages.some((p) => p.id === want.id)); if (sec) collapsed.delete(sec.name); }
    renderTree();
    if (want) { select(want); rowById.get(want.id)?.scrollIntoView({ block: 'center' }); }
    else { const first = (secs.find((s) => !collapsed.has(s.name)) ?? secs[0])?.pages[0]; if (first) select(first); }
  })();

  return () => scrollTop.destroy();
}
