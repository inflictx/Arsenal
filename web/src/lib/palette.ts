import { h, clear } from './dom';
import { api, type Entry } from '../api';
import { copyText } from './copy';
import { toast } from './toast';
import { t } from './i18n';
import { navigate } from '../router';

const SEARCH_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>`;

let backdrop: HTMLElement | null = null;

function firstCodeBlock(body: string): string | null {
  const m = body.match(/```[^\n]*\n([\s\S]*?)```/);
  return m ? (m[1] ?? '').trim() : null;
}
// The clean value the ⧉ button copies — or null when there's nothing useful to copy
// (e.g. Burp docs are prose). When null the copy button is hidden, so you never copy junk.
export function copyValueFor(e: Entry): string | null {
  const meta = (e.meta ?? {}) as Record<string, any>;
  if (e.type === 'wordlist_ref') return (meta.paths && meta.paths[0]) || meta.raw || meta.github || null;
  if (e.type === 'command' || e.type === 'gtfobin' || e.type === 'script') return firstCodeBlock(e.body ?? ''); // first command/script block, else null
  if (e.type === 'doc') return null; // Burp docs are prose — nothing clean to copy; just open it
  return (e.body ?? '').trim() || null; // payload / cmd_recipe / note → the payload/command itself
}
function preview(e: Entry): string {
  const meta = (e.meta ?? {}) as Record<string, any>;
  if (e.type === 'wordlist_ref') return (meta.paths && meta.paths[0]) || meta.purpose || 'wordlist';
  return (e.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
}

export function openPalette() {
  if (backdrop) return;

  const input = h('input', { placeholder: t('palette.placeholder'), spellcheck: 'false' }) as HTMLInputElement;
  const clearBtn = h('button', { class: 'palette-clear', title: t('palette.clear') }, '✕') as HTMLButtonElement;
  const inputRow = h('div', { class: 'palette-input' }, h('span', { html: SEARCH_ICON }), input, clearBtn);
  const results = h('div', { class: 'palette-results' });
  const panel = h('div', { class: 'palette' }, inputRow, results,
    h('div', { class: 'palette-foot' },
      h('span', {}, h('b', {}, '↑↓'), ' ' + t('palette.navigate')),
      h('span', {}, h('b', {}, '↵'), ' ' + t('palette.open')),
      h('span', {}, h('b', {}, '⧉'), ' ' + t('palette.copy')),
      h('span', {}, h('b', {}, 'esc'), ' ' + t('palette.close')),
    ),
  );
  backdrop = h('div', { class: 'palette-backdrop', onclick: (e: MouseEvent) => { if (e.target === backdrop) close(); } }, panel);
  document.body.appendChild(backdrop);
  input.focus();

  let items: Entry[] = [];
  let sel = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const syncClear = () => inputRow.classList.toggle('has', input.value.length > 0);

  function render() {
    clear(results);
    if (!input.value.trim()) { results.appendChild(h('div', { class: 'empty' }, t('palette.hint'))); return; }
    if (!items.length) { results.appendChild(h('div', { class: 'empty' }, t('palette.noResults'))); return; }
    items.forEach((e, i) => {
      const cv = copyValueFor(e);
      results.appendChild(
        h('div', { class: 'presult' + (i === sel ? ' sel' : ''), onclick: () => choose(e), onmouseenter: () => { sel = i; mark(); } },
          h('div', { class: 'r-top' },
            h('span', { class: 'r-title' }, e.title),
            h('span', { class: 'r-type ' + e.type }, e.type),
            e.category ? h('span', { class: 'r-cat' }, e.category) : null,
            h('span', { class: 'r-spacer' }),
            cv ? h('button', { class: 'pal-copy', title: t('palette.copyValue'), onclick: (ev: MouseEvent) => { ev.stopPropagation(); copyText(cv); toast(t('palette.copied') + e.title); } }, '⧉') : null,
          ),
          h('div', { class: 'r-body' }, preview(e)),
        ),
      );
    });
  }
  function mark() { [...results.children].forEach((c, i) => (c as HTMLElement).classList?.toggle('sel', i === sel)); }

  async function run(q: string) {
    if (!q.trim()) { items = []; render(); return; }
    try { items = await api.search(q, undefined, 30); sel = 0; render(); } catch { /* ignore */ }
  }
  // Primary action: OPEN the result in its module (navigate + pre-select via params.sub).
  // Copying the useful value is the secondary ⧉ button on each row.
  function routeFor(e: Entry): { route: string; sub: string } {
    switch (e.type) {
      case 'payload': return { route: 'payloads', sub: e.category ?? '' };
      case 'wordlist_ref': return { route: 'wordlists', sub: ((e.meta as any)?.category) || (e.category ?? '') };
      case 'command': return { route: 'commands', sub: e.title };
      case 'cmd_recipe': return { route: 'commands', sub: e.subcategory || e.title };
      case 'gtfobin': return { route: 'gtfobins', sub: e.title };
      case 'doc': return { route: 'burp', sub: e.title };
      case 'note': return { route: 'notes', sub: e.title };
      case 'script': return { route: 'scripts', sub: e.title };
      default: return { route: 'payloads', sub: e.category ?? '' };
    }
  }
  function choose(e: Entry) {
    const { route, sub } = routeFor(e);
    close();
    const p: Record<string, string> = { id: String(e.id) };
    if (sub) p.sub = sub;
    navigate(route, p);
  }
  function resetInput() { input.value = ''; syncClear(); items = []; render(); }

  input.addEventListener('input', () => { syncClear(); clearTimeout(timer); timer = setTimeout(() => run(input.value), 110); });
  clearBtn.addEventListener('click', () => { resetInput(); input.focus(); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { input.value ? resetInput() : close(); }
    else if (ev.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); mark(); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); mark(); ev.preventDefault(); }
    else if (ev.key === 'Enter' && items[sel]) { choose(items[sel]!); }
  });
  render();
}

function close() {
  backdrop?.remove();
  backdrop = null;
}

export function initPaletteHotkey() {
  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });
}
