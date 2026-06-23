import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { renderMarkdown } from '../lib/markdown';

const LS_TARGET = 'cmd.target';
const LS_LHOST = 'cmd.lhost';
const LS_COLLAPSED = 'cmd.collapsed';
const hostOf = (s: string) => s.replace(/^\w+:\/\//, '').replace(/\/.*$/, '').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// User-saved recipes live in the DB as `type=cmd_recipe` entries (is_custom=1 → survive re-seed),
// keyed to their tool by `subcategory = tool title`.
type BuiltRecipe = { cmd: string; note?: string };

// Split a string on `sep`, ignoring `sep` inside `backtick` code spans.
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let buf = '', inCode = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '`') inCode = !inCode;
    if (!inCode && s.startsWith(sep, i)) { out.push(buf); buf = ''; i += sep.length - 1; continue; }
    buf += s[i];
  }
  out.push(buf);
  return out;
}

function splitFlagBullets(md: string): string {
  let inFence = false;
  return md.split('\n').flatMap((line) => {
    if (/^\s*```/.test(line)) { inFence = !inFence; return [line]; }
    if (inFence) return [line];
    const m = /^(\s*[-*]\s+)(.*\S)\s*$/.exec(line);
    if (!m) return [line];
    const [, indent, content] = m;
    if (!content.includes('; ') || !content.includes('`')) return [line];
    const parts = splitTopLevel(content, '; ').map((p) => p.trim()).filter(Boolean);
    return parts.length < 2 ? [line] : parts.map((p) => indent + p);
  }).join('\n');
}

function splitCodeBlocks(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const fence = /^(\s*)```(\w*)\s*$/.exec(lines[i]);
    if (!fence) { out.push(lines[i]); i++; continue; }
    const [, indent, lang] = fence;
    const body: string[] = [];
    i++;
    while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { body.push(lines[i]); i++; }
    i++;
    const open = indent + '```' + lang, close = indent + '```';
    const splittable = lang === '' || lang === 'bash' || lang === 'sh';
    const cmds = body.filter((l) => l.trim() && !l.trimStart().startsWith('#'));
    if (!splittable || cmds.length < 2) { out.push(open, ...body, close); continue; }
    let pending: string[] = [];
    for (const l of body) {
      if (!l.trim()) continue;
      if (l.trimStart().startsWith('#')) { pending.push(l); continue; }
      out.push(open, ...pending, l, close);
      pending = [];
    }
    if (pending.length) out.push(open, ...pending, close);
  }
  return out.join('\n');
}

interface SFlag { flag: string; value?: string; desc: string; mode?: string; positional?: boolean; on?: boolean; }
interface SGroup { name: string; flags: SFlag[]; }
interface SMode { name: string; desc?: string; target?: string; }

export function CommandsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  const targetInput = h('input', { class: 'cmd-field', placeholder: '10.10.11.50 · target.htb · http://…', spellcheck: 'false' }) as HTMLInputElement;
  const lhostInput = h('input', { class: 'cmd-field', placeholder: 'ваш IP (LHOST)', spellcheck: 'false' }) as HTMLInputElement;
  targetInput.value = localStorage.getItem(LS_TARGET) ?? '';
  lhostInput.value = localStorage.getItem(LS_LHOST) ?? '';
  const bar = h('div', { class: 'cmd-bar' },
    h('div', { class: 'cmd-field-wrap' }, h('label', {}, 'Target'), targetInput),
    h('div', { class: 'cmd-field-wrap' }, h('label', {}, 'LHOST'), lhostInput),
    h('div', { class: 'cmd-bar-hint' }, 'подставляется в команды и сборщик'),
  );

  const filter = SearchField({ placeholder: 'Поиск по тулзам…', onInput: () => renderTree() });
  const treeScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' }, filter.el, treeScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Commands');
  const subEl = h('div', { class: 'cmd-purpose' });
  const bodyEl = h('article', { class: 'md cmd-md' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head' }, titleEl), subEl, bodyEl);

  outlet.appendChild(h('div', { class: 'content' }, bar, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  let docs: Entry[] = [];
  let active: Entry | null = null;
  const rowById = new Map<number, HTMLElement>();
  const collapsed = new Set<string>();
  let wasSearching = false;
  let liveResub: (() => void) | null = null;
  const recipeCache = new Map<string, Entry[]>(); // user recipes (DB, type=cmd_recipe) keyed by tool title

  const persistCollapsed = () => { try { localStorage.setItem(LS_COLLAPSED, JSON.stringify([...collapsed])); } catch { /* ignore */ } };
  function toggleSec(name: string) {
    if (collapsed.has(name)) collapsed.delete(name); else collapsed.add(name);
    persistCollapsed();
    renderTree();
  }
  function scrollActiveIntoView() {
    if (!active) return;
    const row = rowById.get(active.id);
    if (!row) return;
    const r = row.getBoundingClientRect(), b = treeScroll.getBoundingClientRect();
    treeScroll.scrollTop += r.top - b.top - (treeScroll.clientHeight - r.height) / 2;
  }

  function sections() {
    const map = new Map<string, Entry[]>();
    for (const d of docs) { const c = d.category || '—'; if (!map.has(c)) map.set(c, []); map.get(c)!.push(d); }
    return [...map.entries()]
      .map(([name, pages]) => ({
        name,
        order: (pages[0].meta?.catOrder ?? 99) as number,
        pages: pages.slice().sort((a, b) => ((a.meta?.toolOrder ?? 0) as number) - ((b.meta?.toolOrder ?? 0) as number)),
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

  function searchDocs(q: string): Entry[] {
    const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const scored: { d: Entry; s: number }[] = [];
    for (const d of docs) {
      const title = d.title.toLowerCase(), sub = (d.subcategory ?? '').toLowerCase();
      const cat = (d.category ?? '').toLowerCase(), body = (d.body ?? '').toLowerCase();
      if (!tokens.every((t) => title.includes(t) || sub.includes(t) || cat.includes(t) || body.includes(t))) continue;
      let s = 0;
      if (tokens.every((t) => title.includes(t))) s += 1000;
      if (tokens.every((t) => sub.includes(t))) s += 500;
      if (tokens.every((t) => cat.includes(t))) s += 300;
      for (const t of tokens) s += Math.min(body.split(t).length - 1, 25);
      scored.push({ d, s });
    }
    scored.sort((a, b) => b.s - a.s || a.d.title.localeCompare(b.d.title, 'ru'));
    return scored.map((x) => x.d);
  }

  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'результат';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'результата';
    return 'результатов';
  }

  function renderTree() {
    clear(treeScroll);
    rowById.clear();
    const q = filter.input.value.trim();
    if (q) {
      wasSearching = true;
      const hits = searchDocs(q);
      treeScroll.appendChild(h('div', { class: 'burp-hits' }, hits.length ? `${hits.length} ${plural(hits.length)}` : 'Ничего не найдено'));
      for (const p of hits) treeScroll.appendChild(makeRow(p, p.category));
      return;
    }
    const cameFromSearch = wasSearching;
    wasSearching = false;
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

  // ── Target / LHOST substitution ──
  function substTokens(s: string): string {
    const t = hostOf(targetInput.value.trim()) || '‹target›';
    const l = hostOf(lhostInput.value.trim()) || '‹lhost›';
    return s.replace(/\{TARGET\}/g, t).replace(/\{LHOST\}/g, l);
  }
  function applyTargets(md: string): string {
    const t = hostOf(targetInput.value.trim()), l = hostOf(lhostInput.value.trim());
    let out = md;
    if (t) {
      out = out.replace(/(https?:\/\/)t\b/g, (_m, p1) => p1 + t).replace(/\b10\.10\.10\.10\b/g, () => t);
      if (/[a-z]/i.test(t)) out = out.replace(/\btarget\.htb\b/g, () => t);
    }
    if (l) out = out.replace(/\b10\.10\.14\.1\b/g, () => l).replace(/\b1\.1\.1\.1\b/g, () => l).replace(/\bATTACKER\b/g, () => l);
    return out;
  }
  function highlight(root: HTMLElement) {
    const vals = [...new Set([hostOf(targetInput.value.trim()), hostOf(lhostInput.value.trim())].filter((v) => v.length >= 2))];
    if (!vals.length) return;
    const re = new RegExp(vals.map(escapeRe).join('|'), 'g');
    const codes = root.tagName === 'CODE' ? [root] : [...root.querySelectorAll('code')];
    for (const code of codes) {
      const nodes: Text[] = [];
      const w = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = w.nextNode())) nodes.push(n as Text);
      for (const tn of nodes) {
        const text = tn.nodeValue ?? '';
        re.lastIndex = 0;
        if (!re.test(text)) continue;
        re.lastIndex = 0;
        const frag = document.createDocumentFragment();
        let last = 0, m: RegExpExecArray | null;
        while ((m = re.exec(text))) {
          if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
          frag.appendChild(h('mark', { class: 'cmd-tok' }, m[0]));
          last = m.index + m[0].length;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        tn.replaceWith(frag);
      }
    }
  }

  function codeBox(text: string, subst: boolean): HTMLElement {
    const code = h('code', {}, subst ? substTokens(text) : text);
    const pre = h('pre', { class: 'cmd-box' }, code);
    if (subst) highlight(pre);
    const b = copyButton(() => code.textContent ?? '', 'Copy');
    b.classList.add('doc-copy');
    pre.appendChild(b);
    return pre;
  }

  // ── markdown render (domains not yet structured) ──
  function renderBody() {
    liveResub = null;
    if (!active) return;
    bodyEl.innerHTML = renderMarkdown(splitCodeBlocks(splitFlagBullets(applyTargets(active.body ?? ''))));
    bodyEl.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      const raw = (code?.textContent ?? pre.textContent ?? '').replace(/\n+$/, '');
      const clean = raw.split('\n').map((l) => l.replace(/\s{2,}#.*$/, '').replace(/\s+$/, '')).join('\n').trim();
      const btn = copyButton(() => clean || raw, 'Copy');
      btn.classList.add('doc-copy');
      pre.appendChild(btn);
    });
    highlight(bodyEl);
  }

  // ── structured render: command builder + collapsible recipes ──
  function renderBuilder(p: Entry) {
    const m: any = p.meta ?? {};
    const title = p.title;
    clear(bodyEl);
    if (m.purpose) bodyEl.appendChild(h('p', { class: 'cmd-purpose-text' }, m.purpose));
    if (m.install) {
      bodyEl.appendChild(h('div', { class: 'cmd-section-label' }, 'Установка'));
      bodyEl.appendChild(codeBox(m.install, false));
    }

    const groups: SGroup[] = m.groups ?? [];
    const modes: SMode[] = m.modes ?? [];
    const selected = new Set<string>();
    const values = new Map<string, string>();
    let mode = modes[0]?.name ?? '';
    let lastRaw = '';
    let recipesOpen = false;
    const applyDefaults = () => { // flags marked `on` start selected (e.g. hashcat wordlist)
      selected.clear();
      groups.forEach((g, gi) => g.flags.forEach((f) => { if (f.on) selected.add(gi + '|' + f.flag); }));
    };
    applyDefaults();

    // ── builder bar (sticky) ──
    const cmdLine = h('code', { class: 'builder-cmd' });
    const copyBtn = copyButton(() => cmdLine.textContent ?? '', 'Copy');
    copyBtn.classList.add('builder-copy');
    const resetBtn = h('button', { class: 'builder-reset', type: 'button', title: 'Снять все флаги и вернуть значения к примерам',
      onclick: () => { applyDefaults(); values.clear(); renderFlags(); assemble(); } }, '↺ Сброс');
    const saveBtn = h('button', { class: 'builder-save', type: 'button', title: 'Сохранить собранную команду в рецепты (в базу)',
      onclick: async () => {
        if (!lastRaw.trim()) return;
        try {
          const arr0 = recipeCache.get(title) ?? [];
          const topSort = arr0.length ? Math.min(...arr0.map((x) => (x.meta?.sort ?? 0) as number)) - 1 : 0;
          const e = await api.create({ type: 'cmd_recipe', category: p.category, subcategory: title, title: lastRaw.slice(0, 120) || title, body: lastRaw, meta: { sort: topSort } });
          if (!recipeCache.has(title)) recipeCache.set(title, []);
          recipeCache.get(title)!.unshift(e); // newest on top
          recipesOpen = true;
          renderRecipes();
        } catch { /* ignore */ }
      } }, '★ В рецепты');
    const builderLine = h('div', { class: 'builder-line' }, cmdLine);
    const modesRow = h('div', { class: 'builder-modes' });
    if (modes.length) {
      modes.forEach((md) => modesRow.appendChild(
        h('button', { class: 'mode-btn' + (md.name === mode ? ' on' : ''), type: 'button', title: md.desc ?? '',
          onclick: () => { mode = md.name; [...modesRow.children].forEach((c, i) => (c as HTMLElement).classList.toggle('on', modes[i].name === mode)); renderFlags(); assemble(); } }, md.name)));
    }
    bodyEl.appendChild(h('div', { class: 'builder' },
      h('div', { class: 'builder-head' },
        h('span', { class: 'builder-label' }, '⚙ Сборка команды'),
        h('div', { class: 'builder-actions' }, saveBtn, resetBtn, copyBtn)),
      builderLine,
      modes.length ? modesRow : null,
      h('div', { class: 'builder-hint' }, 'тыкай флаги ниже — они попадают в команду')));

    function assemble() {
      const head: string[] = [m.binary || ''];
      if (mode) head.push(mode);
      const tail: string[] = []; // positional args — placed AFTER the target
      groups.forEach((g, gi) => g.flags.forEach((f) => {
        if (f.mode && f.mode !== mode) return;
        const key = gi + '|' + f.flag;
        if (!selected.has(key)) return;
        if (f.positional) { tail.push(values.get(key) ?? f.value ?? ''); return; }
        head.push(f.value !== undefined ? `${f.flag} ${values.get(key) ?? f.value}` : f.flag);
      }));
      const tgt = (modes.find((x) => x.name === mode)?.target) ?? m.target ?? '';
      lastRaw = [...head, tgt, ...tail].filter(Boolean).join(' ');
      cmdLine.textContent = substTokens(lastRaw);
      highlight(builderLine);
    }

    // ── recipes (collapsed by default, right under the builder) ──
    const recipesWrap = h('div', { class: 'cmd-recipes' });
    bodyEl.appendChild(recipesWrap);
    let dragFrom = -1;
    function reorderUser(from: number, to: number) {
      const arr = recipeCache.get(title);
      if (!arr || from < 0 || to < 0 || from === to) return;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      arr.forEach((en, i) => { en.meta = { ...(en.meta || {}), sort: i }; api.update(en.id, { meta: en.meta }).catch(() => {}); });
      renderRecipes();
    }
    function renderRecipes() {
      clear(recipesWrap);
      const built = (m.recipes ?? []) as BuiltRecipe[];
      const user = recipeCache.get(title) ?? [];
      recipesWrap.appendChild(
        h('div', { class: 'recipes-head' + (recipesOpen ? ' open' : ''), onclick: () => { recipesOpen = !recipesOpen; renderRecipes(); } },
          h('span', { class: 'burp-chevron' }, recipesOpen ? '▾' : '▸'),
          h('span', { class: 'recipes-title' }, 'Готовые команды'),
          h('span', { class: 'recipes-n' }, String(built.length + user.length)),
          h('span', { class: 'recipes-hint' }, recipesOpen ? 'свернуть' : 'развернуть')));
      if (!recipesOpen) return;
      const list = h('div', { class: 'recipes-list' });
      // user-saved commands first (newest on top), drag-to-reorder by the grip
      user.forEach((e, idx) => {
        const item = h('div', { class: 'recipe-item' });
        const grip = h('span', { class: 'recipe-grip', draggable: 'true', title: 'Перетащить' }, '⠿');
        grip.addEventListener('dragstart', (ev: DragEvent) => { dragFrom = idx; ev.dataTransfer?.setData('text/plain', String(idx)); item.classList.add('dragging'); });
        grip.addEventListener('dragend', () => item.classList.remove('dragging'));
        item.addEventListener('dragover', (ev: DragEvent) => { ev.preventDefault(); item.classList.add('drop-target'); });
        item.addEventListener('dragleave', () => item.classList.remove('drop-target'));
        item.addEventListener('drop', (ev: DragEvent) => { ev.preventDefault(); item.classList.remove('drop-target'); reorderUser(dragFrom, idx); dragFrom = -1; });
        const del = h('button', { class: 'recipe-del', type: 'button', title: 'Удалить рецепт',
          onclick: async () => {
            try { await api.remove(e.id); } catch { /* ignore */ }
            const arr = recipeCache.get(title) ?? [];
            const i = arr.indexOf(e);
            if (i >= 0) arr.splice(i, 1);
            renderRecipes();
          } }, '✕');
        item.append(grip, codeBox(e.body ?? '', true), del); // grip · command · delete — one row
        list.appendChild(item);
      });
      // built-in recipes
      for (const r of built) {
        list.appendChild(codeBox(r.cmd, true));
        if (r.note) list.appendChild(h('div', { class: 'recipe-note' }, r.note));
      }
      recipesWrap.appendChild(list);
    }

    // ── flag groups ──
    const flagsWrap = h('div', { class: 'flag-groups' });
    bodyEl.appendChild(flagsWrap);
    function renderFlags() {
      clear(flagsWrap);
      for (const [gi, g] of groups.entries()) {
        const flags = g.flags.filter((f) => !f.mode || f.mode === mode);
        if (!flags.length) continue;
        flagsWrap.appendChild(h('div', { class: 'flag-group-label' }, g.name));
        for (const f of flags) {
          const key = gi + '|' + f.flag;
          const row = h('div', { class: 'flag-row' + (selected.has(key) ? ' on' : '') });
          const toggle = () => { selected.has(key) ? selected.delete(key) : selected.add(key); row.classList.toggle('on', selected.has(key)); assemble(); };
          row.appendChild(h('button', { class: 'flag-key', type: 'button', onclick: toggle }, f.flag));
          if (f.value !== undefined) {
            const inp = h('input', { class: 'flag-val', spellcheck: 'false' }) as HTMLInputElement;
            inp.value = values.get(key) ?? f.value;
            const autosize = () => { inp.size = Math.max(inp.value.length, 6); }; // size attr = chars wide, shows full value
            autosize();
            // editing the value ONLY edits — it does NOT add the flag (add via the flag key)
            inp.addEventListener('input', () => { values.set(key, inp.value); autosize(); if (selected.has(key)) assemble(); });
            inp.addEventListener('mousedown', (e: MouseEvent) => e.stopPropagation());
            row.appendChild(inp);
          }
          row.appendChild(h('span', { class: 'flag-desc', onclick: toggle }, f.desc));
          flagsWrap.appendChild(row);
        }
      }
    }

    renderFlags();
    renderRecipes();
    assemble();
    if (m.notes) bodyEl.appendChild(h('div', { class: 'cmd-notes' }, m.notes));

    liveResub = () => { assemble(); renderRecipes(); };
  }

  function select(p: Entry) {
    active = p;
    for (const [id, el] of rowById) el.classList.toggle('active', id === p.id);
    titleEl.textContent = p.title;
    subEl.textContent = p.subcategory ?? '';
    subEl.style.display = p.subcategory ? '' : 'none';
    if (p.meta?.structured) renderBuilder(p); else renderBody();
  }

  let debounce: ReturnType<typeof setTimeout> | undefined;
  function onTargets() {
    localStorage.setItem(LS_TARGET, targetInput.value);
    localStorage.setItem(LS_LHOST, lhostInput.value);
    clearTimeout(debounce);
    debounce = setTimeout(() => { if (liveResub) liveResub(); else renderBody(); }, 130);
  }
  targetInput.addEventListener('input', onTargets);
  lhostInput.addEventListener('input', onTargets);

  // Pick up the active engagement's host/lhost when it's activated/edited in the Engagements view.
  const onExternalTarget = () => {
    targetInput.value = localStorage.getItem(LS_TARGET) ?? '';
    lhostInput.value = localStorage.getItem(LS_LHOST) ?? '';
    if (liveResub) liveResub(); else if (active) renderBody();
  };
  window.addEventListener('ars:target', onExternalTarget);

  (async () => {
    try { docs = await api.entries({ type: 'command', limit: 1000 }); } catch { docs = []; }
    try {
      for (const r of await api.entries({ type: 'cmd_recipe', limit: 1000 })) {
        const k = r.subcategory ?? '';
        if (!recipeCache.has(k)) recipeCache.set(k, []);
        recipeCache.get(k)!.push(r);
      }
      for (const arr of recipeCache.values()) arr.sort((a, b) => ((a.meta?.sort ?? 0) as number) - ((b.meta?.sort ?? 0) as number));
    } catch { /* ignore */ }
    if (!docs.length) {
      renderTree();
      bodyEl.innerHTML = '<p>Справочник ещё не загружен — выполни <code>npm run seed</code>.</p>';
      titleEl.textContent = 'Commands';
      subEl.style.display = 'none';
      return;
    }
    const secs = sections();
    let saved: unknown = null;
    try { saved = JSON.parse(localStorage.getItem(LS_COLLAPSED) ?? 'null'); } catch { /* ignore */ }
    if (Array.isArray(saved)) for (const n of saved) collapsed.add(String(n));
    else secs.forEach((s) => { if (s.name !== 'WEB') collapsed.add(s.name); });
    const want = params.sub ? docs.find((d) => d.title === params.sub) : null;
    if (want?.category) collapsed.delete(want.category);
    renderTree();
    if (want) { select(want); rowById.get(want.id)?.scrollIntoView({ block: 'center' }); }
    else { const first = (secs.find((s) => !collapsed.has(s.name)) ?? secs[0])?.pages[0]; if (first) select(first); }
  })();

  return () => { window.removeEventListener('ars:target', onExternalTarget); scrollTop.destroy(); };
}
