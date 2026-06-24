import { h, clear } from '../lib/dom';
import { api, type Entry, type Category } from '../api';
import { PayloadCard } from '../components/card';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { toast } from '../lib/toast';
import { t } from '../lib/i18n';
import { getTarget, getLhost, setTarget, setLhost, onTargetChange } from '../lib/target';

export function PayloadsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  const catFilter = SearchField({ placeholder: t('payloads.filterCats'), onInput: () => renderCats() });
  const catScroll = h('div', { class: 'scroll' });
  const catPanel = h('aside', { class: 'catlist' }, catFilter.el, catScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Payloads');
  const countEl = h('span', { class: 'badge' }, '');
  const search = SearchField({ placeholder: t('payloads.filterInCat'), mono: true, onInput: (v) => applyFilter(v) });
  const cardsWrap = h('div', { class: 'cards' });

  // Active-target bar (Batch 1): example hosts in payloads get substituted (shared via lib/target).
  const tgtInput = h('input', { class: 'pl-tgt', placeholder: t('payloads.targetPh'), value: getTarget() }) as HTMLInputElement;
  const lhInput = h('input', { class: 'pl-tgt', placeholder: t('payloads.lhostPh'), value: getLhost() }) as HTMLInputElement;
  tgtInput.addEventListener('input', () => setTarget(tgtInput.value));
  lhInput.addEventListener('input', () => setLhost(lhInput.value));
  const targetBar = h('div', { class: 'pl-targetbar', title: t('payloads.targetBarHint') },
    h('span', { class: 'pl-tgt-ico' }, '🎯'), tgtInput, lhInput,
  );

  // "Only mine" filter + "New" button (Batch 2: personal layer — your own/edited entries survive re-seed).
  const mineCb = h('input', { type: 'checkbox', class: 'pl-mine-cb' }) as HTMLInputElement;
  mineCb.addEventListener('change', () => { onlyMine = mineCb.checked; applyFilter(search.input.value); });
  const mineToggle = h('label', { class: 'pl-mine', title: t('payloads.onlyMine') }, mineCb, h('span', {}, t('payloads.onlyMine')));
  const newBtn = h('button', { class: 'btn pl-new', type: 'button', onclick: () => openForm() }, '＋ ' + t('payloads.new'));

  const right = h('div', { style: { minWidth: '0' } },
    h('div', { class: 'cards-head' }, titleEl, countEl, h('div', { class: 'cards-head-actions' }, mineToggle, newBtn)),
    targetBar,
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
  let onlyMine = false;

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
      cardsWrap.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '∅'), t('payloads.empty')));
      return;
    }
    for (const e of entries) cardsWrap.appendChild(PayloadCard(e, { onEdit: openForm, onDelete: removeEntry }));
  }

  // In-category search is a fast client-side filter over the loaded category; honors the "only mine" toggle.
  function applyFilter(q: string) {
    const s = q.trim().toLowerCase();
    const base = onlyMine ? loaded.filter((e) => e.is_custom) : loaded;
    if (!s) { countEl.textContent = base.length + ' ' + t('payloads.countPayloads'); showCards(base); return; }
    const filtered = base.filter((e) =>
      e.title.toLowerCase().includes(s) ||
      (e.body ?? '').toLowerCase().includes(s) ||
      (e.subcategory ?? '').toLowerCase().includes(s) ||
      e.tags.some((tg) => tg.includes(s)),
    );
    countEl.textContent = filtered.length + ' / ' + base.length;
    showCards(filtered);
  }

  async function selectCat(cat: string) {
    active = cat;
    search.clear();
    titleEl.textContent = cat;
    renderCats();
    window.scrollTo({ top: 0 });
    loaded = await api.entries({ type: 'payload', category: cat, limit: 1000 });
    applyFilter('');
    flashWanted();
  }

  // When opened from ⌘K, jump to the exact payload card (not the top of the category).
  function flashWanted() {
    if (!wantId) return;
    const card = cardsWrap.querySelector('[data-id="' + wantId + '"]') as HTMLElement | null;
    wantId = '';
    if (card) { card.scrollIntoView({ block: 'center' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1600); }
  }

  // Reload the active category + category counts after a create/edit/delete.
  async function refreshCategory() {
    try { categories = await api.categories('payload'); } catch { /* ignore */ }
    renderCats();
    if (active) { loaded = await api.entries({ type: 'payload', category: active, limit: 1000 }); applyFilter(search.input.value); }
  }

  async function removeEntry(e: Entry) {
    if (!window.confirm(t('payloads.confirmDelete') + (e.title ? ` «${e.title}»` : ''))) return;
    try { await api.remove(e.id); } catch { toast(t('card.saveFailed')); return; }
    await refreshCategory();
  }

  // Modal create/edit form. Editing a seeded entry makes it is_custom (survives re-seed) on the server side.
  function openForm(entry?: Entry) {
    const isEdit = !!(entry && entry.id);
    const mk = (cls: string, ph: string, val: string) => {
      const el = h('input', { class: 'input ' + cls, placeholder: ph, spellcheck: 'false' }) as HTMLInputElement;
      el.value = val; return el;
    };
    const titleInp = mk('pl-f-title', t('payloads.phTitle'), entry?.title ?? '');
    const catInp = mk('pl-f-cat', t('payloads.phCategory'), entry?.category ?? active ?? '');
    const subInp = mk('pl-f-sub', t('payloads.phSubcategory'), entry?.subcategory ?? '');
    const langInp = mk('pl-f-lang', t('payloads.phLang'), entry?.language ?? '');
    const tagsInp = mk('pl-f-tags', t('payloads.phTags'), (entry?.tags ?? []).join(', '));
    const area = h('textarea', { class: 'note-area pl-f-body', placeholder: t('payloads.phBody'), spellcheck: 'false' }) as HTMLTextAreaElement;
    area.value = entry?.body ?? '';

    const ov = h('div', { class: 'pl-modal-ov' });
    function close() { ov.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(ev: KeyboardEvent) { if (ev.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', (ev) => { if (ev.target === ov) close(); });

    async function save() {
      const title = titleInp.value.trim();
      if (!title) { titleInp.classList.add('err'); titleInp.focus(); return; }
      const payload = {
        title,
        category: catInp.value.trim() || null,
        subcategory: subInp.value.trim() || null,
        language: langInp.value.trim() || null,
        body: area.value,
        tags: tagsInp.value.split(',').map((s) => s.trim()).filter(Boolean),
      };
      try {
        if (isEdit) await api.update(entry!.id, payload);
        else await api.create({ type: 'payload', ...payload });
      } catch { toast(t('card.saveFailed')); return; }
      close();
      const newCat = payload.category || active;
      if (newCat && newCat !== active) selectCat(newCat);
      else await refreshCategory();
    }

    const form = h('div', { class: 'pl-modal' },
      h('div', { class: 'pl-modal-h' }, isEdit ? t('payloads.formEdit') : t('payloads.formNew')),
      titleInp,
      h('div', { class: 'pl-f-row' }, catInp, subInp, langInp),
      tagsInp,
      area,
      h('div', { class: 'pl-modal-actions' },
        h('button', { class: 'btn pl-f-save', type: 'button', onclick: () => save() }, '💾 ' + t('payloads.save')),
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, t('payloads.cancel')),
      ),
    );
    ov.appendChild(form);
    document.body.appendChild(ov);
    titleInp.focus();
  }

  (async () => {
    categories = await api.categories('payload');
    if (!active && categories.length) {
      active = categories.find((c) => /xss/i.test(c.category))?.category ?? categories[0]!.category;
    }
    renderCats();
    if (active) selectCat(active);
  })();

  // Re-render cards (fresh host substitution) when the target changes here or in another view.
  const offTarget = onTargetChange(() => {
    if (document.activeElement !== tgtInput) tgtInput.value = getTarget();
    if (document.activeElement !== lhInput) lhInput.value = getLhost();
    applyFilter(search.input.value);
  });

  return () => { offTarget(); scrollTop.destroy(); };
}
