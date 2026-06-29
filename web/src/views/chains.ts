import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { favoriteButton } from '../lib/favorite';
import { PayloadCard } from '../components/card';
import { renderMarkdown } from '../lib/markdown';
import { decorateCodeBlocks } from '../lib/codeblock';
import { substTarget, onTargetChange, getToken, setToken, EXTRA_TOKENS } from '../lib/target';
import { navigate } from '../router';
import { t } from '../lib/i18n';

// Level filter chips (match the `level` tag the parser adds). Order = the newcomer ladder.
const LEVEL_CHIPS: [string, string][] = [
  ['newbie', 'chains.level.newbie'],
  ['intermediate', 'chains.level.intermediate'],
  ['advanced', 'chains.level.advanced'],
];

// A step's `kind` is the arsenal module it links to. note = guidance, no deep-link.
const KIND_ROUTE: Record<string, string> = {
  payload: 'payloads', script: 'scripts', command: 'commands',
  checklist: 'checklists', gtfobin: 'gtfobins', revshell: 'revshell',
};
const KIND_LABEL: Record<string, string> = {
  payload: 'Payloads', script: 'Scripts', command: 'Commands',
  checklist: 'Checklists', gtfobin: 'GTFOBins', revshell: 'Reverse Shell',
};

const LS_COLLAPSED = 'chains.collapsed';
const LS_PROGRESS = 'chains.progress';

interface Step { n: number; title: string; kind: string; q: string; detail: string; success: string; alt?: boolean; }

export function ChainsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  let chains: Entry[] = [];
  let active: Entry | null = null;
  const rowById = new Map<number, HTMLElement>();
  const filters = new Set<string>();
  const collapsed = new Set<string>(loadCollapsed());
  let progress = loadProgress();

  function loadCollapsed(): string[] { try { return JSON.parse(localStorage.getItem(LS_COLLAPSED) || '[]'); } catch { return []; } }
  function saveCollapsed() { try { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed])); } catch { /* ignore */ } }
  function loadProgress(): Record<string, number[]> { try { return JSON.parse(localStorage.getItem(LS_PROGRESS) || '{}'); } catch { return {}; } }
  function saveProgress() { try { localStorage.setItem(LS_PROGRESS, JSON.stringify(progress)); } catch { /* ignore */ } }
  const chainKey = (c: Entry) => c.title;

  const filter = SearchField({ placeholder: t('chains.searchPlaceholder'), onInput: () => { renderList(); ensureSelection(); } });
  const countEl = h('div', { class: 'burp-hits' });
  const collapseBtn = h('button', { class: 'chain-collapse-all', type: 'button', onclick: () => toggleAll() }, t('chains.collapseAll'));
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' }, filter.el, h('div', { class: 'chain-list-bar' }, countEl, collapseBtn), listScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Attack Chains');
  const headActions = h('div', { class: 'head-actions' });
  const metaEl = h('div', { class: 'chain-meta' });
  const bodyEl = h('div', { class: 'chain-body' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head' }, titleEl, headActions), metaEl, bodyEl);

  const chipBar = h('div', { class: 'gtfo-filters' });
  chipBar.appendChild(h('span', { class: 'gtfo-filter-label' }, t('chains.levelLabel')));
  for (const [key, lbl] of LEVEL_CHIPS) {
    chipBar.appendChild(h('button', { class: 'gtfo-chip ctx chain-lvl-chip ' + key, type: 'button',
      onclick: (e: MouseEvent) => {
        const b = e.currentTarget as HTMLElement;
        if (filters.has(key)) filters.delete(key); else filters.add(key);
        b.classList.toggle('on', filters.has(key));
        renderList(); ensureSelection();
      } }, t(lbl)));
  }

  let introHidden = false;
  try { introHidden = localStorage.getItem('chains.introHidden') === '1'; } catch { /* ignore */ }
  const introClose = h('button', { class: 'chain-intro-x', type: 'button', title: t('chains.dismiss'), onclick: () => {
    intro.style.display = 'none';
    try { localStorage.setItem('chains.introHidden', '1'); } catch { /* ignore */ }
  } }, '✕');
  const intro = h('div', { class: 'script-intro chain-intro' }, h('span', {}, t('chains.howto')), introClose);
  if (introHidden) intro.style.display = 'none';

  // Context-tokens panel (collapsible): paste accounts / client_id / redirect_uri / collaborator once.
  const TOK_PH: Record<string, string> = { USER_A: 'свой аккаунт / id', USER_B: 'аккаунт жертвы / id', CLIENT_ID: 'OAuth client_id', REDIRECT_URI: 'https://client/cb', COLLAB: 'abc.oast.pro', EMAIL: 'you@evil.com' };
  let tokOpen = false;
  try { tokOpen = localStorage.getItem('chains.tokopen') === '1'; } catch { /* ignore */ }
  const tokBody = h('div', { class: 'chain-tokens-body' });
  for (const k of EXTRA_TOKENS) {
    const inp = h('input', { class: 'chain-tok-inp', value: getToken(k), placeholder: TOK_PH[k] ?? k, spellcheck: 'false' }) as HTMLInputElement;
    inp.addEventListener('input', () => setToken(k, inp.value));
    tokBody.appendChild(h('label', { class: 'chain-tok-field' }, h('span', { class: 'chain-tok-k' }, '{' + k + '}'), inp));
  }
  tokBody.style.display = tokOpen ? '' : 'none';
  const tokChev = h('span', { class: 'burp-sec-ch' }, tokOpen ? '▾' : '▸');
  const tokHead = h('button', { class: 'chain-tokens-head', type: 'button', onclick: () => {
    tokOpen = !tokOpen; tokBody.style.display = tokOpen ? '' : 'none'; tokChev.textContent = tokOpen ? '▾' : '▸';
    try { localStorage.setItem('chains.tokopen', tokOpen ? '1' : '0'); } catch { /* ignore */ }
  } }, tokChev, h('span', {}, t('chains.tokensTitle')), h('span', { class: 'chain-tokens-hint' }, t('chains.tokensHint')));
  const tokenWrap = h('div', { class: 'chain-tokens' }, tokHead, tokBody);

  outlet.appendChild(h('div', { class: 'content' }, chipBar, intro, tokenWrap, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  const offTarget = onTargetChange(() => { if (active) select(active); });

  // Up/Down in the search box steps through the filtered chains (keyboard nav for the list).
  filter.input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const hits = sortHits(chains.filter(matches));
    if (!hits.length) return;
    const i = active ? hits.findIndex((c) => c.id === active!.id) : -1;
    const next = hits[e.key === 'ArrowDown' ? Math.min(i + 1, hits.length - 1) : Math.max(i - 1, 0)];
    if (next) { select(next); rowById.get(next.id)?.scrollIntoView({ block: 'nearest' }); }
    e.preventDefault();
  });

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return t('chains.pluralOne');
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return t('chains.pluralFew');
    return t('chains.pluralMany');
  }
  function levelLabel(level: string): string {
    return level === 'newbie' ? t('chains.level.newbie') : level === 'advanced' ? t('chains.level.advanced') : t('chains.level.intermediate');
  }

  function matches(c: Entry): boolean {
    const q = filter.input.value.trim().toLowerCase();
    if (q && !(c.title.toLowerCase().includes(q) || (c.category ?? '').toLowerCase().includes(q)
      || (c.body ?? '').toLowerCase().includes(q) || (c.tags ?? []).some((tg) => tg.toLowerCase().includes(q)))) return false;
    if (filters.size && !(c.tags ?? []).some((tg) => filters.has(tg))) return false;
    return true;
  }

  const domOrd = (c: Entry) => Number(c.meta?.domainOrder ?? 99);
  const lvlOrd = (c: Entry) => Number(c.meta?.levelOrder ?? 2);
  const sortHits = (arr: Entry[]) => arr.slice().sort((a, b) =>
    domOrd(a) - domOrd(b) || (a.category ?? '').localeCompare(b.category ?? '') || lvlOrd(a) - lvlOrd(b) || a.title.localeCompare(b.title));

  function levelBadge(level: string): HTMLElement {
    return h('span', { class: 'chain-lvl ' + level, title: t('chains.levelLabel') }, levelLabel(level));
  }

  function toggleAll() {
    const allCats = new Set(chains.filter(matches).map((c) => c.category ?? ''));
    const anyOpen = [...allCats].some((c) => !collapsed.has(c));
    if (anyOpen) for (const c of allCats) collapsed.add(c); else collapsed.clear();
    saveCollapsed(); renderList();
  }

  // wrap the search match in the row title (DOM nodes, never innerHTML with the user query)
  function markMatch(text: string, q: string): (HTMLElement | string)[] {
    if (!q) return [text];
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return [text];
    return [text.slice(0, i), h('mark', { class: 'chain-mark' }, text.slice(i, i + q.length)), text.slice(i + q.length)];
  }

  function makeRow(c: Entry): HTMLElement {
    const level = String(c.meta?.level ?? 'intermediate');
    const nSteps = ((c.meta?.steps as Step[]) ?? []).length;
    const row = h('div', { class: 'cat' + (active?.id === c.id ? ' active' : ''), onclick: () => select(c) },
      h('span', { class: 'chain-row-dot ' + level, title: levelLabel(level) }),
      h('span', { class: 'chk-row-title' }, ...markMatch(c.title, filter.input.value.trim())),
      h('span', { class: 'chain-row-n', title: t('chains.steps') }, String(nSteps)));
    rowById.set(c.id, row);
    return row;
  }

  function renderList() {
    clear(listScroll);
    rowById.clear();
    const hits = sortHits(chains.filter(matches));
    countEl.textContent = `${hits.length} ${plural(hits.length)}`;
    collapseBtn.style.display = hits.length ? '' : 'none';
    if (!hits.length) {
      listScroll.appendChild(h('div', { class: 'script-empty-list' }, t('chains.noneInFilter')));
      if (filters.size || filter.input.value) {
        listScroll.appendChild(h('button', { class: 'script-reset', type: 'button', onclick: () => {
          filters.clear(); filter.input.value = '';
          chipBar.querySelectorAll('.gtfo-chip.on').forEach((c) => c.classList.remove('on'));
          renderList(); ensureSelection();
        } }, t('chains.resetFilters')));
      }
      return;
    }
    const byCat = new Map<string, Entry[]>();
    for (const c of hits) { const k = c.category ?? ''; (byCat.get(k) ?? byCat.set(k, []).get(k)!).push(c); }
    for (const [cat, arr] of byCat) {
      const isCollapsed = collapsed.has(cat);
      const header = h('div', { class: 'burp-sec chain-sec', onclick: () => {
        if (collapsed.has(cat)) collapsed.delete(cat); else collapsed.add(cat);
        saveCollapsed(); renderList();
      } },
        h('span', { class: 'burp-sec-ch' }, isCollapsed ? '▸' : '▾'),
        h('span', { class: 'burp-sec-name' }, cat),
        h('span', { class: 'burp-sec-n' }, String(arr.length)));
      listScroll.appendChild(header);
      if (!isCollapsed) for (const c of arr) listScroll.appendChild(makeRow(c));
    }
    const anyOpen = [...byCat.keys()].some((cc) => !collapsed.has(cc));
    collapseBtn.textContent = anyOpen ? t('chains.collapseAll') : t('chains.expandAll');
  }

  function showEmpty() {
    active = null;
    titleEl.textContent = 'Attack Chains';
    headActions.replaceChildren();
    clear(metaEl);
    clear(bodyEl);
    bodyEl.appendChild(h('p', { class: 'script-empty' }, t('chains.nothingFound')));
  }

  function ensureSelection() {
    const hits = sortHits(chains.filter(matches));
    if (!hits.length) { showEmpty(); return; }
    if (active && hits.some((c) => c.id === active!.id)) {
      for (const [id, el] of rowById) el.classList.toggle('active', id === active!.id);
      return;
    }
    select(hits[0]!);
  }

  function playbookMd(c: Entry): string {
    const m = (c.meta ?? {}) as Record<string, any>;
    const out: string[] = [`# ${c.title}`, '', `${m.domainLabel ?? c.category ?? ''} · ${levelLabel(String(m.level ?? ''))}`, ''];
    if (m.impact) out.push(`**Импакт:** ${m.impact}`, '');
    if (m.precondition) out.push(`**Когда применимо:** ${m.precondition}`, '');
    out.push('## Шаги', '');
    for (const s of (m.steps ?? []) as Step[]) {
      out.push(`${s.n}. ${s.title}`);
      if (s.detail) out.push('   `' + substTarget(s.detail).out + '`');
      if (s.success) out.push(`   ✓ ${s.success}`);
      out.push('');
    }
    if (m.realWorld) out.push(`**Из реальных кейсов:** ${m.realWorld}`, '');
    if (m.defense) out.push(`**Защита:** ${m.defense}`);
    return out.join('\n');
  }

  // Lazy-loaded payload categories (so inline payloads cost one request per category, then cached).
  const catCache = new Map<string, Entry[]>();
  async function loadCategory(cat: string): Promise<Entry[]> {
    if (catCache.has(cat)) return catCache.get(cat)!;
    let cards: Entry[] = [];
    try { cards = await api.entries({ type: 'payload', category: cat, limit: 500 }); } catch { cards = []; }
    catCache.set(cat, cards);
    return cards;
  }
  // Rank a category's payloads by relevance to the step (its concrete detail + title), like checklists.
  function rankPayloads(cards: Entry[], s: Step): Entry[] {
    const toks = new Set((`${s.title} ${s.detail}`.match(/[a-zа-яё0-9_]{3,}/gi) || []).map((x) => x.toLowerCase()));
    const needle = s.detail.toLowerCase().replace(/\s+/g, ' ').slice(0, 24);
    return cards.map((c) => {
      const hay = `${c.title} ${c.subcategory ?? ''} ${c.body ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const tk of toks) if (hay.includes(tk)) score++;
      if (needle.length > 6 && hay.includes(needle)) score += 6;
      return { c, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.c);
  }

  // Scripts: loaded once, ranked against the step like the payloads, rendered inline.
  let scriptsCache: Entry[] | null = null;
  async function loadScripts(): Promise<Entry[]> {
    if (scriptsCache) return scriptsCache;
    try { scriptsCache = await api.entries({ type: 'script', limit: 1000 }); } catch { scriptsCache = []; }
    return scriptsCache;
  }
  function rankScripts(scripts: Entry[], s: Step): Entry[] {
    // q names an exact ARS3NAL script -> use it (or nothing). Never a random token-rank match
    // (that put "Reflected XSS scanner" on a hidden-params step). No q -> token-rank best effort.
    if (s.q) { const exact = scripts.find((c) => c.title.toLowerCase() === s.q.toLowerCase()); return exact ? [exact] : []; }
    const toks = new Set((`${s.title} ${s.detail}`.match(/[a-zа-яё0-9_]{3,}/gi) || []).map((x) => x.toLowerCase()));
    return scripts.map((c) => {
      const hay = `${c.title} ${c.category ?? ''} ${c.body ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase();
      let score = 0; for (const tk of toks) if (hay.includes(tk)) score++;
      return { c, score };
    }).filter((x) => x.score > 1).sort((a, b) => b.score - a.score).map((x) => x.c);
  }
  function scriptCard(sc: Entry): HTMLElement {
    const el = h('div', { class: 'chain-inline-script' });
    el.appendChild(h('div', { class: 'chain-inline-title' }, sc.title));
    const body = h('article', { class: 'md cmd-md' });
    body.innerHTML = renderMarkdown(substTarget(sc.body ?? '').out);
    decorateCodeBlocks(body, t('chains.copy'));
    el.appendChild(body);
    return el;
  }

  // Inline expansion for command + checklist steps (same idea as payload/script).
  const linkTo = (route: string, params: Record<string, string> | undefined, label: string): HTMLElement =>
    h('a', { class: 'chain-pl-all', href: '#', onclick: (e: Event) => { e.preventDefault(); navigate(route, params); } }, label);
  let commandsCache: Entry[] | null = null;
  async function loadCommands(): Promise<Entry[]> {
    if (commandsCache) return commandsCache;
    try { commandsCache = await api.entries({ type: 'command', limit: 2000 }); } catch { commandsCache = []; }
    return commandsCache;
  }
  function findCommands(s: Step): Entry[] {
    const cmds = commandsCache ?? [];
    // q names a specific tool: exact title hit or nothing. Never fall back to a random token-rank
    // match (that is what put "sqlmap" on a curl step). With no q, token-rank as a best effort.
    if (s.q) { const exact = cmds.find((c) => c.title.toLowerCase() === s.q.toLowerCase()); return exact ? [exact] : []; }
    const toks = new Set((`${s.title} ${s.detail}`.match(/[a-zа-яё0-9_]{3,}/gi) || []).map((x) => x.toLowerCase()));
    return cmds.map((c) => {
      const hay = `${c.title} ${(c.meta as any)?.purpose ?? ''} ${c.body ?? ''}`.toLowerCase();
      let score = 0; for (const tk of toks) if (hay.includes(tk)) score++;
      return { c, score };
    }).filter((x) => x.score > 1).sort((a, b) => b.score - a.score).slice(0, 1).map((x) => x.c);
  }
  function commandCard(cmd: Entry): HTMLElement {
    const m = (cmd.meta ?? {}) as Record<string, any>;
    const el = h('div', { class: 'chain-inline-script chain-inline-cmd' });
    el.appendChild(h('div', { class: 'chain-inline-title cmd' }, cmd.title));
    if (m.purpose) el.appendChild(h('div', { class: 'chain-inline-purpose' }, String(m.purpose)));
    const codeRow = (text: string): HTMLElement => {
      const sub = substTarget(text);
      const code = h('code', { class: 'chain-step-code' + (sub.changed ? ' tgt' : '') }, sub.out);
      const cp = copyButton(() => substTarget(text).out, t('chains.copy')); cp.classList.add('chain-step-copy');
      return h('div', { class: 'chain-step-detail' }, code, cp);
    };
    if (m.install) el.appendChild(codeRow(String(m.install)));
    for (const r of ((m.recipes ?? []) as { cmd: string; note?: string }[]).slice(0, 4)) {
      el.appendChild(codeRow(r.cmd));
      if (r.note) el.appendChild(h('div', { class: 'chain-inline-note' }, r.note));
    }
    if (!m.structured) { const body = h('article', { class: 'md cmd-md' }); body.innerHTML = renderMarkdown(substTarget(cmd.body ?? '').out); decorateCodeBlocks(body, t('chains.copy')); el.appendChild(body); }
    return el;
  }
  let clCache: any[] | null = null;
  async function loadChecklistSummaries(): Promise<any[]> {
    if (clCache) return clCache;
    try { clCache = await api.checklists(); } catch { clCache = []; }
    return clCache;
  }
  function rankChecklists(sums: any[], s: Step): any[] {
    // q names the exact checklist slug -> use it or nothing (parity with rankScripts/findCommands:
    // never fall through to a token-rank match on the WRONG checklist). No q -> token-rank best effort.
    if (s.q) { const hit = sums.find((c) => String(c.slug).toLowerCase() === s.q.toLowerCase()); return hit ? [hit] : []; }
    const toks = new Set((`${s.title} ${s.detail}`.match(/[a-zа-яё0-9_]{3,}/gi) || []).map((x) => x.toLowerCase()));
    return sums.map((c) => {
      const hay = `${c.title} ${c.category ?? ''}`.toLowerCase();
      let score = 0; for (const tk of toks) if (hay.includes(tk)) score++;
      return { c, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.c);
  }
  function checklistCard(full: any): HTMLElement {
    const el = h('div', { class: 'chain-inline-script chain-inline-cl' });
    el.appendChild(h('div', { class: 'chain-inline-title cl' }, full.title));
    for (const sec of (full.sections ?? []).slice(0, 4)) {
      el.appendChild(h('div', { class: 'chain-cl-sec' }, sec.name));
      const ul = h('ul', { class: 'chain-cl-items' });
      for (const it of (sec.items ?? []).slice(0, 8)) ul.appendChild(h('li', {}, it.text));
      el.appendChild(ul);
    }
    return el;
  }

  function stepCard(s: Step, key: string, done: Set<number>, onToggle: () => void): HTMLElement {
    const sub = substTarget(s.detail);
    const isDone = done.has(s.n);
    const card = h('div', { class: 'chain-step' + (isDone ? ' done' : '') + (s.alt ? ' alt' : '') });
    const check = h('input', { type: 'checkbox', class: 'chain-step-check' }) as HTMLInputElement;
    check.checked = isDone;
    check.addEventListener('change', () => {
      if (check.checked) done.add(s.n); else done.delete(s.n);
      card.classList.toggle('done', check.checked);
      onToggle();
    });
    // the whole head is a <label>: click anywhere on it toggles the step done (like the checklists rows)
    card.appendChild(h('label', { class: 'chain-step-head' },
      check,
      h('span', { class: 'chain-step-n' }, String(s.n)),
      h('span', { class: 'chain-step-title' }, s.title),
      s.alt ? h('span', { class: 'chain-step-altbadge', title: t('chains.altStep') }, t('chains.altStep')) : null));
    if (s.detail) {
      const code = h('code', { class: 'chain-step-code' + (sub.changed ? ' tgt' : '') }, sub.out);
      const cp = copyButton(() => substTarget(s.detail).out, t('chains.copy'));
      cp.classList.add('chain-step-copy');
      card.appendChild(h('div', { class: 'chain-step-detail' }, code, cp));
    }
    if (s.success) card.appendChild(h('div', { class: 'chain-step-success' }, h('span', { class: 'chain-step-ok-i' }, '✓'), ' ', s.success));
    // payload + script + command + checklist steps EXPAND the matching content INLINE (like the
    // checklists, no jumping). Remaining kinds (gtfobin/revshell) keep a compact deep-link.
    const EXP_LABEL: Record<string, string> = {
      payload: '⚡ ' + t('chains.showPayloads'), script: '📜 ' + t('chains.showScript'),
      command: '⌘ ' + t('chains.showCommand'), checklist: '☑ ' + t('chains.showChecklist'),
    };
    if ((s.kind === 'payload' && s.q) || s.kind === 'script' || s.kind === 'command' || s.kind === 'checklist') {
      const panel = h('div', { class: 'chain-step-payloads' });
      panel.style.display = 'none';
      let open = false, built = false;
      const btn = h('button', { class: 'chain-pl-btn ' + s.kind, type: 'button' }, EXP_LABEL[s.kind]) as HTMLButtonElement;
      btn.addEventListener('click', async () => {
        open = !open; panel.style.display = open ? '' : 'none'; btn.classList.toggle('on', open);
        if (open && !built) {
          built = true;
          panel.appendChild(h('div', { class: 'chain-pl-loading' }, '…'));
          if (s.kind === 'payload') {
            const cards = await loadCategory(s.q); clear(panel);
            const ranked = rankPayloads(cards, s); const list = (ranked.length ? ranked : cards).slice(0, 6);
            for (const p of list) panel.appendChild(PayloadCard(p));
            panel.appendChild(linkTo('payloads', { sub: s.q }, t('chains.openAll') + ' ' + s.q + ' →'));
          } else if (s.kind === 'script') {
            const ranked = rankScripts(await loadScripts(), s).slice(0, 2); clear(panel);
            if (ranked.length) for (const sc of ranked) panel.appendChild(scriptCard(sc));
            else panel.appendChild(h('div', { class: 'chain-pl-loading' }, t('chains.noMatch')));
            panel.appendChild(linkTo('scripts', undefined, t('chains.openAll') + ' Scripts →'));
          } else if (s.kind === 'command') {
            await loadCommands(); const found = findCommands(s); clear(panel);
            if (found.length) for (const c of found) panel.appendChild(commandCard(c));
            else panel.appendChild(h('div', { class: 'chain-pl-loading' }, t('chains.noMatch')));
            panel.appendChild(linkTo('commands', s.q ? { sub: s.q } : undefined, t('chains.openAll') + ' Commands →'));
          } else {
            const ranked = rankChecklists(await loadChecklistSummaries(), s); clear(panel);
            if (ranked.length) {
              try { const full = await api.checklist(ranked[0].slug); panel.appendChild(checklistCard(full)); panel.appendChild(linkTo('checklists', { sub: ranked[0].slug }, t('chains.openAll') + ' Checklists →')); }
              catch { panel.appendChild(h('div', { class: 'chain-pl-loading' }, t('chains.noMatch'))); }
            } else {
              panel.appendChild(h('div', { class: 'chain-pl-loading' }, t('chains.noMatch')));
              panel.appendChild(linkTo('checklists', undefined, t('chains.openAll') + ' Checklists →'));
            }
          }
        }
      });
      card.appendChild(btn);
      card.appendChild(panel);
    } else {
      const route = KIND_ROUTE[s.kind];
      if (route) card.appendChild(h('button', { class: 'chain-open', type: 'button', title: t('chains.openIn') + ' ' + (KIND_LABEL[s.kind] ?? route),
        onclick: () => navigate(route, s.q ? { sub: s.q } : {}) },
        '→ ' + (KIND_LABEL[s.kind] ?? route)));
    }
    return card;
  }

  function metaLine(label: string, value: string): HTMLElement | null {
    if (!value) return null;
    return h('div', { class: 'chain-mline' }, h('b', {}, label), ' ', h('span', {}, value));
  }

  function select(c: Entry) {
    active = c;
    // keep the selected chain's domain group open (the tree starts collapsed on first visit)
    if (c.category && collapsed.has(c.category)) { collapsed.delete(c.category); saveCollapsed(); renderList(); }
    for (const [id, el] of rowById) el.classList.toggle('active', id === c.id);
    const m = (c.meta ?? {}) as Record<string, any>;
    const level = String(m.level ?? 'intermediate');
    const key = chainKey(c);
    const done = new Set<number>(progress[key] ?? []);

    clear(titleEl);
    titleEl.appendChild(document.createTextNode(c.title));
    const playbookCopy = copyButton(() => playbookMd(c), t('chains.copyPlaybook'));
    playbookCopy.classList.add('chain-playbook-copy');
    headActions.replaceChildren(favoriteButton(c), playbookCopy);

    // compact meta: badges + impact accent + precondition gate + collapsible why
    clear(metaEl);
    metaEl.appendChild(h('div', { class: 'chain-badges' },
      h('span', { class: 'chain-domain' }, String(m.domainLabel ?? c.category ?? '')),
      levelBadge(level)));
    if (m.impact) metaEl.appendChild(h('div', { class: 'chain-impact' }, String(m.impact)));
    if (m.precondition) metaEl.appendChild(h('div', { class: 'chain-gate' },
      h('b', {}, t('chains.precondition')), ' ', String(m.precondition)));
    if (m.why) {
      const det = h('details', { class: 'chain-why' }, h('summary', {}, t('chains.whyToggle')), h('div', { class: 'chain-why-body' }, String(m.why))) as HTMLDetailsElement;
      metaEl.appendChild(det);
    }

    // steps with progress
    clear(bodyEl);
    const steps = (m.steps ?? []) as Step[];
    const counter = h('span', { class: 'chain-steps-count' });
    const bar = h('div', { class: 'chain-progress' }, h('div', { class: 'chain-progress-fill' }));
    const fill = bar.firstChild as HTMLElement;
    const updateProgress = () => {
      counter.textContent = `${done.size}/${steps.length}`;
      fill.style.width = steps.length ? Math.round((done.size / steps.length) * 100) + '%' : '0%';
      progress[key] = [...done];
      saveProgress();
    };
    bodyEl.appendChild(h('div', { class: 'chain-steps-h' }, h('span', {}, t('chains.steps')), counter, bar));
    const stepsWrap = h('div', { class: 'chain-steps' });
    for (const s of steps) stepsWrap.appendChild(stepCard(s, key, done, updateProgress));
    bodyEl.appendChild(stepsWrap);
    updateProgress();

    const foot = h('div', { class: 'chain-foot' },
      m.realWorld ? metaLine(t('chains.realWorld'), String(m.realWorld)) : null,
      m.defense ? metaLine(t('chains.defense'), String(m.defense)) : null);
    bodyEl.appendChild(foot);
  }

  (async () => {
    try { chains = await api.entries({ type: 'chain', limit: 1000 }); } catch { chains = []; }
    // First visit: collapse every domain so the tree starts compact; select() re-opens the active one.
    try {
      if (localStorage.getItem('chains.collapsedInit') !== '1') {
        for (const c of chains) collapsed.add(c.category ?? '');
        localStorage.setItem('chains.collapsedInit', '1'); saveCollapsed();
      }
    } catch { /* ignore */ }
    renderList();
    if (!chains.length) {
      titleEl.textContent = 'Attack Chains';
      clear(bodyEl);
      bodyEl.appendChild(h('p', { class: 'script-empty' }, t('chains.notLoaded')));
      return;
    }
    const want = params.id ? chains.find((c) => String(c.id) === params.id)
      : (params.sub ? chains.find((c) => c.title === params.sub || c.category === params.sub) : null);
    select(want ?? sortHits(chains)[0]!);
    if (want) rowById.get(want.id)?.scrollIntoView({ block: 'center' });
  })();

  return () => { offTarget(); scrollTop.destroy(); };
}
