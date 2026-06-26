import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { decorateCodeBlocks } from '../lib/codeblock';
import { copyValueFor } from '../lib/palette';
import { renderMarkdown } from '../lib/markdown';
import { t } from '../lib/i18n';

const TYPE_LABEL: Record<string, string> = {
  note: t('favorites.typeNote'), cmd_recipe: t('favorites.typeRecipe'), command: 'Command', payload: 'Payload',
  gtfobin: 'GTFOBins', script: 'Scripts', wordlist_ref: 'Wordlist', wordlist: 'Wordlist', doc: 'Burp Docs',
};
const TYPE_ORDER = ['note', 'cmd_recipe', 'command', 'payload', 'gtfobin', 'script', 'wordlist_ref', 'wordlist', 'doc'];

export function FavoritesView(outlet: HTMLElement): () => void {
  clear(outlet);

  let favs: Entry[] = [];
  const search = SearchField({ placeholder: t('favorites.searchPlaceholder'), onInput: () => render() });
  const countEl = h('div', { class: 'burp-hits' });
  const wrap = h('div', { class: 'fav-wrap' });
  outlet.appendChild(h('div', { class: 'content' },
    h('div', { class: 'fav-head' }, h('h1', { class: 'cat-h' }, '★ ' + t('favorites.title')), search.el), countEl, wrap));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  function matches(e: Entry, q: string): boolean {
    return [e.title, e.body, e.category, (e.tags || []).join(' ')].filter(Boolean).join(' ').toLowerCase().includes(q);
  }

  async function unfav(e: Entry) {
    await api.favorite(e.id);
    favs = favs.filter((x) => x.id !== e.id);
    render();
  }

  function card(e: Entry): HTMLElement {
    const head = h('div', { class: 'fav-card-head' },
      h('span', { class: 'fav-title' }, e.title || t('favorites.untitled')),
      h('span', { class: 'fav-type' }, TYPE_LABEL[e.type] ?? e.type));
    const cv = copyValueFor(e); // copy the useful value per type (payload/command/script…), not prose docs
    const copyBtn = cv ? copyButton(() => cv, 'Copy') : null;
    copyBtn?.classList.add('fav-copy');
    const star = h('button', { class: 'btn fav-x', type: 'button', title: t('favorites.remove'), onclick: () => unfav(e) }, '★');
    head.append(...(copyBtn ? [copyBtn, star] : [star]));

    const md = h('article', { class: 'md cmd-md' });
    md.innerHTML = renderMarkdown(e.body ?? '');
    decorateCodeBlocks(md, 'Copy');

    const kids: HTMLElement[] = [head];
    if (e.category) kids.push(h('div', { class: 'fav-cat' }, e.category));
    kids.push(md);
    return h('div', { class: 'card fav-card' }, ...kids);
  }

  function render() {
    clear(wrap);
    const q = search.input.value.trim().toLowerCase();
    const hits = favs.filter((e) => !q || matches(e, q));
    countEl.textContent = favs.length ? `${hits.length} ${t('favorites.countSuffix')}` : '';
    if (!favs.length) {
      wrap.appendChild(h('div', { class: 'note-empty' },
        h('p', {}, t('favorites.empty'))));
      return;
    }
    const groups = [...new Set(hits.map((e) => e.type))].sort((a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b));
    for (const t of groups) {
      const items = hits.filter((e) => e.type === t);
      wrap.appendChild(h('div', { class: 'wl-group-h' }, TYPE_LABEL[t] ?? t, h('span', { class: 'n' }, String(items.length))));
      for (const e of items) wrap.appendChild(card(e));
    }
  }

  (async () => {
    try { favs = await api.entries({ favorite: 1, limit: 1000 }); } catch { favs = []; }
    render();
  })();

  return () => scrollTop.destroy();
}
