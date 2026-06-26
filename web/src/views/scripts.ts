import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { decorateCodeBlocks } from '../lib/codeblock';
import { favoriteButton } from '../lib/favorite';
import { renderMarkdown } from '../lib/markdown';
import { t } from '../lib/i18n';

// Top-level group filter chips (match the `group` tag the parser adds to each entry).
const GROUP_CHIPS: [string, string][] = [
  ['exploit', 'Exploit'], ['recon', 'Recon'], ['utility', 'Utility'], ['modern', 'Modern'],
];
// Language filter chips (match the `lang` tag).
const LANG_CHIPS: [string, string][] = [
  ['python', 'Python'], ['bash', 'Bash'], ['js', 'JS'], ['php', 'PHP'], ['html', 'HTML'],
];
// Badge → {label, css-suffix, tip-i18n-key}. Drawn above the body; tip shown on hover.
const BADGE_DEF: Record<string, { label: string; cls: string; tip: string }> = {
  destructive: { label: 'DESTRUCTIVE', cls: 'danger', tip: 'scripts.tip.destructive' },
  paid: { label: 'PAID / KEY', cls: 'warn', tip: 'scripts.tip.paid' },
  http2: { label: 'HTTP/2 only', cls: 'info', tip: 'scripts.tip.http2' },
  root: { label: 'needs root', cls: 'warn', tip: 'scripts.tip.root' },
  legacy: { label: 'legacy', cls: 'muted', tip: 'scripts.tip.legacy' },
  oob: { label: 'OOB / collaborator', cls: 'info', tip: 'scripts.tip.oob' },
};

const LS_COLLAPSED = 'scripts.collapsed';

export function ScriptsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  let scripts: Entry[] = [];
  let active: Entry | null = null;
  const rowById = new Map<number, HTMLElement>();
  const filters = new Set<string>();
  const collapsed = new Set<string>(loadCollapsed());

  function loadCollapsed(): string[] {
    try { return JSON.parse(localStorage.getItem(LS_COLLAPSED) || '[]'); } catch { return []; }
  }
  function saveCollapsed() {
    try { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed])); } catch { /* ignore */ }
  }

  const filter = SearchField({ placeholder: t('scripts.searchPlaceholder'), onInput: () => { renderList(); ensureSelection(); } });
  const countEl = h('div', { class: 'burp-hits' });
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const credit = h('div', { class: 'gtfo-credit' }, t('scripts.credit'));
  const left = h('aside', { class: 'catlist' }, filter.el, countEl, listScroll, credit);

  const titleEl = h('h1', { class: 'cat-h' }, 'Scripts');
  const headActions = h('div', { class: 'head-actions' });
  const metaEl = h('div', { class: 'script-meta' });
  const bodyEl = h('article', { class: 'md cmd-md' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head' }, titleEl, headActions), metaEl, bodyEl);

  const chipBar = h('div', { class: 'gtfo-filters' });
  const addChips = (label: string, list: [string, string][], cls: string) => {
    chipBar.appendChild(h('span', { class: 'gtfo-filter-label' }, label));
    for (const [key, lbl] of list) {
      chipBar.appendChild(h('button', { class: 'gtfo-chip ' + cls, type: 'button',
        onclick: (e: MouseEvent) => {
          const b = e.currentTarget as HTMLElement;
          if (filters.has(key)) filters.delete(key); else filters.add(key);
          b.classList.toggle('on', filters.has(key));
          renderList(); ensureSelection();
        } }, lbl));
    }
  };
  addChips(t('scripts.groupLabel'), GROUP_CHIPS, 'func');
  addChips(t('scripts.langLabel'), LANG_CHIPS, 'ctx');

  const intro = h('div', { class: 'script-intro' }, t('scripts.howto'));

  outlet.appendChild(h('div', { class: 'content' }, chipBar, intro, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return t('scripts.pluralOne');
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return t('scripts.pluralFew');
    return t('scripts.pluralMany');
  }

  function matches(s: Entry): boolean {
    const q = filter.input.value.trim().toLowerCase();
    if (q && !(s.title.toLowerCase().includes(q) || (s.category ?? '').toLowerCase().includes(q)
      || (s.tags ?? []).some((tg) => tg.toLowerCase().includes(q)))) return false;
    for (const f of filters) if (!s.tags.includes(f)) return false; // AND across selected chips
    return true;
  }

  const ord = (s: Entry) => Number(s.meta?.catOrder ?? 99);
  const sortHits = (arr: Entry[]) => arr.slice().sort((a, b) =>
    ord(a) - ord(b) || (a.category ?? '').localeCompare(b.category ?? '') || a.title.localeCompare(b.title));

  function makeRow(s: Entry): HTMLElement {
    const row = h('div', { class: 'cat' + (active?.id === s.id ? ' active' : ''), onclick: () => select(s) },
      h('span', { class: 'chk-row-title' }, s.title),
      s.meta?.rating === 'must' ? h('span', { class: 'script-dot', title: t('scripts.mustHave') }, '★') : null);
    rowById.set(s.id, row);
    return row;
  }

  function renderList() {
    clear(listScroll);
    rowById.clear();
    const hits = sortHits(scripts.filter(matches));
    countEl.textContent = `${hits.length} ${plural(hits.length)}`;
    if (!hits.length) {
      listScroll.appendChild(h('div', { class: 'script-empty-list' }, t('scripts.noneInFilter')));
      if (filters.size || filter.input.value) {
        listScroll.appendChild(h('button', { class: 'script-reset', type: 'button', onclick: () => {
          filters.clear(); filter.input.value = '';
          chipBar.querySelectorAll('.gtfo-chip.on').forEach((c) => c.classList.remove('on'));
          renderList(); ensureSelection();
        } }, t('scripts.resetFilters')));
      }
      return;
    }
    // group by category, with a collapsible header + count per category
    const byCat = new Map<string, Entry[]>();
    for (const s of hits) { const c = s.category ?? ''; (byCat.get(c) ?? byCat.set(c, []).get(c)!).push(s); }
    for (const [cat, arr] of byCat) {
      const isCollapsed = collapsed.has(cat);
      const header = h('div', { class: 'burp-sec script-sec', onclick: () => {
        if (collapsed.has(cat)) collapsed.delete(cat); else collapsed.add(cat);
        saveCollapsed(); renderList();
      } },
        h('span', { class: 'burp-sec-ch' }, isCollapsed ? '▸' : '▾'),
        h('span', { class: 'burp-sec-name' }, cat),
        h('span', { class: 'burp-sec-n' }, String(arr.length)));
      listScroll.appendChild(header);
      if (!isCollapsed) for (const s of arr) listScroll.appendChild(makeRow(s));
    }
  }

  function badge(label: string, cls: string, tip?: string): HTMLElement {
    return h('span', { class: 'script-badge ' + cls, ...(tip ? { title: tip } : {}) }, label);
  }

  function showEmpty() {
    active = null;
    titleEl.textContent = 'Scripts';
    headActions.replaceChildren();
    clear(metaEl);
    bodyEl.innerHTML = `<p class="script-empty">${t('scripts.nothingFound')}</p>`;
  }

  // Keep the reader in sync with the filtered list: if the active script is filtered
  // out (or none selected), select the first visible hit; if nothing matches, show empty.
  function ensureSelection() {
    const hits = sortHits(scripts.filter(matches));
    if (!hits.length) { showEmpty(); return; }
    if (active && hits.some((s) => s.id === active!.id)) {
      for (const [id, el] of rowById) el.classList.toggle('active', id === active!.id);
      return;
    }
    select(hits[0]!);
  }

  function select(s: Entry) {
    active = s;
    for (const [id, el] of rowById) el.classList.toggle('active', id === s.id);
    titleEl.textContent = s.title;
    headActions.replaceChildren(favoriteButton(s));

    // meta chrome: badges + deps + params + source/license
    clear(metaEl);
    const m = s.meta ?? {};
    const chips: HTMLElement[] = [];
    if (m.rating === 'must') chips.push(badge(t('scripts.mustHave'), 'must', t('scripts.tip.must')));
    if (m.lang) chips.push(badge(String(m.lang), 'lang', t('scripts.tip.lang')));
    for (const b of (m.badges ?? []) as string[]) {
      const def = BADGE_DEF[b];
      chips.push(badge(def?.label ?? b, def?.cls ?? 'warn', def ? t(def.tip) : undefined));
    }
    if (chips.length) metaEl.appendChild(h('div', { class: 'script-badges' }, ...chips));
    if (m.deps) {
      const code = h('code', {}, String(m.deps));
      const cp = copyButton(() => String(m.deps), t('scripts.copy'));
      cp.classList.add('script-dep-copy');
      metaEl.appendChild(h('div', { class: 'script-dep' }, h('b', {}, t('scripts.deps')), ' ', code, cp));
    }
    if (m.placeholders) metaEl.appendChild(h('div', { class: 'script-dep' },
      h('b', {}, t('scripts.params')), ' ', h('code', {}, String(m.placeholders))));
    if (m.source) metaEl.appendChild(h('div', { class: 'script-src' },
      h('a', { href: String(m.source), target: '_blank', rel: 'noreferrer' }, t('scripts.source')),
      m.license ? ' · ' + String(m.license) : ''));

    bodyEl.innerHTML = renderMarkdown(s.body ?? '');
    decorateCodeBlocks(bodyEl, t('scripts.copy'));
  }

  (async () => {
    try { scripts = await api.entries({ type: 'script', limit: 1000 }); } catch { scripts = []; }
    renderList();
    if (!scripts.length) {
      bodyEl.innerHTML = t('scripts.notLoaded');
      titleEl.textContent = 'Scripts';
      return;
    }
    const want = params.id ? scripts.find((s) => String(s.id) === params.id)
      : (params.sub ? scripts.find((s) => s.title === params.sub) : null);
    select(want ?? sortHits(scripts)[0]!);
    if (want) rowById.get(want.id)?.scrollIntoView({ block: 'center' });
  })();

  return () => scrollTop.destroy();
}
