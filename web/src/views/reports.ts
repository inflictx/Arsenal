import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { decorateCodeBlocks } from '../lib/codeblock';
import { favoriteButton } from '../lib/favorite';
import { renderMarkdown } from '../lib/markdown';
import { substTarget, onTargetChange } from '../lib/target';
import { t } from '../lib/i18n';

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function ReportsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  let items: Entry[] = [];
  let active: Entry | null = null;
  const rowById = new Map<number, HTMLElement>();

  const filter = SearchField({ placeholder: t('reports.searchPlaceholder'), onInput: () => { renderList(); ensureSelection(); } });
  const countEl = h('div', { class: 'burp-hits' });
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' }, filter.el, countEl, listScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Report Templates');
  const headActions = h('div', { class: 'head-actions' });
  const metaEl = h('div', { class: 'report-meta' });
  const bodyEl = h('article', { class: 'md cmd-md' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head' }, titleEl, headActions), metaEl, bodyEl);

  const intro = h('div', { class: 'script-intro' }, t('reports.howto'));
  const sevFilter = new Set<string>();
  const SEV_CHIPS: [string, string][] = [['critical', 'Critical'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  const chipBar = h('div', { class: 'gtfo-filters' });
  chipBar.appendChild(h('span', { class: 'gtfo-filter-label' }, t('reports.sevLabel')));
  for (const [key, lbl] of SEV_CHIPS) {
    chipBar.appendChild(h('button', { class: 'gtfo-chip ctx report-sev-chip ' + key, type: 'button',
      onclick: (e: MouseEvent) => {
        const b = e.currentTarget as HTMLElement;
        if (sevFilter.has(key)) sevFilter.delete(key); else sevFilter.add(key);
        b.classList.toggle('on', sevFilter.has(key));
        renderList(); ensureSelection();
      } }, lbl));
  }
  outlet.appendChild(h('div', { class: 'content' }, chipBar, intro, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  const off = onTargetChange(() => { if (active) select(active); }); // re-substitute on target change

  const sev = (e: Entry) => SEV_ORDER[String(e.meta?.severity ?? '').toLowerCase()] ?? 9;
  const sortHits = (arr: Entry[]) => arr.slice().sort((a, b) => sev(a) - sev(b) || Number(a.meta?.order ?? 0) - Number(b.meta?.order ?? 0));

  function matches(e: Entry): boolean {
    if (sevFilter.size && !sevFilter.has(String(e.meta?.severity ?? '').toLowerCase())) return false;
    const q = filter.input.value.trim().toLowerCase();
    if (!q) return true;
    return e.title.toLowerCase().includes(q) || (e.body ?? '').toLowerCase().includes(q) || (e.tags ?? []).some((tg) => tg.toLowerCase().includes(q));
  }

  function sevBadge(s: string): HTMLElement | null {
    if (!s) return null;
    return h('span', { class: 'report-sev ' + s.toLowerCase() }, s);
  }

  function makeRow(e: Entry): HTMLElement {
    const s = String(e.meta?.severity ?? '').toLowerCase();
    const row = h('div', { class: 'cat' + (active?.id === e.id ? ' active' : ''), onclick: () => select(e) },
      h('span', { class: 'report-dot ' + s }), h('span', { class: 'chk-row-title' }, e.title));
    rowById.set(e.id, row);
    return row;
  }

  function renderList() {
    clear(listScroll);
    rowById.clear();
    const hits = sortHits(items.filter(matches));
    countEl.textContent = `${hits.length} ${plural(hits.length)}`;
    if (!hits.length) { listScroll.appendChild(h('div', { class: 'script-empty-list' }, t('reports.none'))); return; }
    for (const e of hits) listScroll.appendChild(makeRow(e));
  }

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return t('reports.pluralOne');
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return t('reports.pluralFew');
    return t('reports.pluralMany');
  }

  function ensureSelection() {
    const hits = sortHits(items.filter(matches));
    if (!hits.length) { active = null; titleEl.textContent = 'Report Templates'; headActions.replaceChildren(); clear(metaEl); bodyEl.innerHTML = ''; return; }
    if (active && hits.some((e) => e.id === active!.id)) { for (const [id, el] of rowById) el.classList.toggle('active', id === active!.id); return; }
    select(hits[0]!);
  }

  function exportMd(e: Entry) {
    const text = substTarget(e.body ?? '').out;
    const blob = new Blob([text], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (e.meta?.vulnClass || 'report').toString().replace(/\W+/g, '-').toLowerCase() + '.md';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Wrap any tokens that did NOT substitute (e.g. {USER_B} not set) so you never copy a dead
  // placeholder into a real submission. Returns how many are unfilled.
  function highlightUnfilled(root: HTMLElement): number {
    const re = /\{[A-Z][A-Z0-9_]*\}/g;
    const nodes: Text[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) { if (re.test(n.nodeValue || '')) nodes.push(n as Text); re.lastIndex = 0; }
    let count = 0;
    for (const node of nodes) {
      const text = node.nodeValue || '';
      const frag = document.createDocumentFragment();
      let last = 0, m: RegExpExecArray | null;
      re.lastIndex = 0;
      while ((m = re.exec(text))) {
        frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        frag.appendChild(h('mark', { class: 'report-unfilled' }, m[0]));
        last = m.index + m[0].length; count++;
      }
      frag.appendChild(document.createTextNode(text.slice(last)));
      node.parentNode?.replaceChild(frag, node);
    }
    return count;
  }

  function select(e: Entry) {
    active = e;
    for (const [id, el] of rowById) el.classList.toggle('active', id === e.id);
    titleEl.textContent = e.title;

    const copyAll = copyButton(() => substTarget(e.body ?? '').out, t('reports.copyAll'));
    copyAll.classList.add('report-copy-all');
    const exportBtn = h('button', { class: 'report-export', type: 'button', title: t('reports.exportTip'), onclick: () => exportMd(e) }, t('reports.export'));
    headActions.replaceChildren(favoriteButton(e), copyAll, exportBtn);

    clear(metaEl);
    const m = (e.meta ?? {}) as Record<string, any>;
    const badges = h('div', { class: 'report-badges' },
      sevBadge(String(m.severity ?? '')),
      m.cwe ? h('span', { class: 'report-cwe' }, String(m.cwe)) : null);
    metaEl.appendChild(badges);
    if (m.cvss) {
      const cvssCopy = copyButton(() => String(m.cvss), t('reports.copy'));
      cvssCopy.classList.add('report-cvss-copy');
      metaEl.appendChild(h('div', { class: 'report-cvss' }, h('b', {}, 'CVSS:3.1'), ' ', h('code', {}, String(m.cvss)), cvssCopy));
    }
    metaEl.appendChild(h('div', { class: 'report-ctx-hint' }, t('reports.ctxHint')));

    bodyEl.innerHTML = renderMarkdown(substTarget(e.body ?? '').out);
    decorateCodeBlocks(bodyEl, t('reports.copy'));
    const unfilled = highlightUnfilled(bodyEl);
    if (unfilled) metaEl.appendChild(h('div', { class: 'report-warn' }, `⚠ ${unfilled} ${t('reports.unfilled')}`));
  }

  (async () => {
    try { items = await api.entries({ type: 'report_tmpl', limit: 500 }); } catch { items = []; }
    renderList();
    if (!items.length) { titleEl.textContent = 'Report Templates'; bodyEl.innerHTML = t('reports.notLoaded'); return; }
    const want = params.id ? items.find((e) => String(e.id) === params.id) : (params.sub ? items.find((e) => e.title === params.sub) : null);
    select(want ?? sortHits(items)[0]!);
    if (want) rowById.get(want.id)?.scrollIntoView({ block: 'center' });
  })();

  return () => { off(); scrollTop.destroy(); };
}
