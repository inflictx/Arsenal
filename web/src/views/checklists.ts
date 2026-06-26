import { h, clear } from '../lib/dom';
import { api, type Checklist, type ChecklistSummary, type ChecklistSection, type ChecklistItem, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { PayloadCard } from '../components/card';
import { renderMarkdown, renderInline } from '../lib/markdown';
import { navigate } from '../router';
import { toast } from '../lib/toast';
import { copyText } from '../lib/copy';
import { t } from '../lib/i18n';

// Слова-шум, не используемые для подбора пейлоадов под пункт.
const STOP = new Set([
  'для', 'или', 'без', 'если', 'при', 'это', 'как', 'что', 'под', 'над', 'все', 'всё', 'там', 'три',
  'два', 'нет', 'есть', 'был', 'для', 'про', 'его', 'их', 'см', 'напр', 'etc', 'via', 'the', 'and',
  'for', 'with', 'not', 'any', 'use',
]);

const TOKEN_RE = /[a-zа-яё0-9_]{3,}/gi;
const tokenize = (s: string): string[] => s.toLowerCase().match(TOKEN_RE) || [];
const termSet = (s: string): Set<string> => new Set(tokenize(s).filter((w) => !STOP.has(w)));

export function ChecklistsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  const filter = SearchField({ placeholder: t('checklists.filterPlaceholder'), onInput: () => renderList() });
  const listScroll = h('div', { class: 'scroll' });
  const leftPanel = h('aside', { class: 'catlist' }, filter.el, listScroll);
  const detail = h('div', { class: 'chk-detail', style: { minWidth: '0' } });

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, leftPanel, detail)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  let summaries: ChecklistSummary[] = [];
  let uncovered: string[] = [];
  let active = params.sub || '';
  let current: Checklist | null = null;
  // Пейлоады текущей категории, проиндексированные для подбора под пункт (idf-взвешенно).
  let catIndex: { p: Entry; terms: Set<string>; strong: Set<string> }[] = [];
  let idf = new Map<string, number>(); // вес термина = log(1 + N/df): редкие слова важнее частых

  // ── left list ───────────────────────────────────────────────────────────
  function renderList() {
    clear(listScroll);
    const f = filter.input.value.toLowerCase();
    for (const c of summaries) {
      if (f && !c.title.toLowerCase().includes(f)) continue;
      const done = c.total > 0 && c.checked >= c.total;
      listScroll.appendChild(
        h('div', { class: 'cat chk-row' + (c.slug === active ? ' active' : '') + (done ? ' done' : ''), onclick: () => select(c.slug) },
          h('span', { class: 'chk-row-title' }, c.title),
          h('span', { class: 'n' }, `${c.checked}/${c.total}`),
        ),
      );
    }
    const fU = uncovered.filter((n) => !f || n.toLowerCase().includes(f));
    if (fU.length) {
      listScroll.appendChild(h('div', { class: 'nav-label chk-uncovered-label' }, t('checklists.noChecklist')));
      for (const name of fU) {
        listScroll.appendChild(
          h('div', { class: 'cat chk-row muted', title: t('checklists.openPayloads'), onclick: () => navigate('payloads', { sub: name }) },
            h('span', { class: 'chk-row-title' }, name),
            h('span', { class: 'n' }, '→'),
          ),
        );
      }
    }
  }

  function syncSummary() {
    if (!current) return;
    const s = summaries.find((x) => x.slug === current!.slug);
    if (s) s.checked = current.checked;
    renderList();
  }

  // Подобрать релевантные пейлоады под пункт: idf-взвешенный матч термов пункта против термов
  // пейлоадов категории. Редкие (отличительные) слова весят больше частых — поэтому generic-пункты
  // не тянут один и тот же набор, а специфичные получают именно свои пейлоады. Совпадение в
  // title/subcategory/tags (strong) весит сильнее, чем в теле; токен из `code` — сильнее обычного слова.
  function matchPayloads(text: string): Entry[] {
    if (!catIndex.length) return [];
    const needles = new Set<string>();
    for (const m of text.matchAll(/`([^`]+)`/g)) for (const tk of tokenize(m[1] ?? '')) needles.add(tk);
    const words = termSet(text.replace(/`[^`]+`/g, ' '));
    if (!needles.size && !words.size) return [];
    const scored = catIndex.map(({ p, terms, strong }) => {
      let score = 0;
      for (const n of needles) if (terms.has(n)) score += (idf.get(n) ?? 1) * (strong.has(n) ? 4 : 2.2);
      for (const w of words) if (terms.has(w)) score += (idf.get(w) ?? 1) * (strong.has(w) ? 2 : 1);
      return { p, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length) return [];
    const top = scored[0]!.score;
    return scored.filter((x) => x.score >= Math.max(top * 0.4, 1.2)).slice(0, 6).map((x) => x.p);
  }

  // Пейлоады, вписанные прямо в `code`-спаны пункта (полиглоты, {{7*7}}, ' UNION SELECT…,
  // ?isAdmin=1, ../../etc/passwd, .phtml …) — копируются, даже если не сматчились с БД.
  // Порог длины ≥4 отсекает мелочь-иллюстрации (`[]`, `.`, `_`, `49`), но ловит реальные пейлоады.
  // ── detail ───────────────────────────────────────────────────────────────
  function renderDetail() {
    clear(detail);
    if (!current) {
      detail.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '✓'), t('checklists.pickLeft')));
      return;
    }
    const c = current;

    const progBadge = h('span', { class: 'badge chk-badge' }, `${c.checked} / ${c.total}`);
    const researchBtn = h('button', { class: 'btn', onclick: toggleResearch }, '📖 ' + t('checklists.research'));
    const resetBtn = h('button', { class: 'btn', onclick: doReset }, '↺ ' + t('checklists.reset'));
    const openPayloads = c.category
      ? h('button', { class: 'btn', onclick: () => navigate('payloads', { sub: c.category! }) }, '⚡ ' + t('checklists.allPayloads'))
      : null;
    const head = h('div', { class: 'cards-head chk-head' },
      h('h1', { class: 'cat-h' }, c.title),
      progBadge,
      h('div', { class: 'card-actions' }, researchBtn, openPayloads, resetBtn),
    );

    const fill = h('div', { class: 'chk-progress-fill' });
    const bar = h('div', { class: 'chk-progress' }, fill);

    const research = h('div', { class: 'chk-research md', html: renderMarkdown(c.research) });
    research.style.display = 'none';

    const counters: { sec: ChecklistSection; span: HTMLElement }[] = [];
    const sectionsWrap = h('div', { class: 'chk-sections' });
    for (const sec of c.sections) {
      const span = h('span', { class: 'chk-section-n' }, sectionLabel(sec));
      counters.push({ sec, span });
      const itemsWrap = h('div', { class: 'chk-items' });
      for (const it of sec.items) itemsWrap.appendChild(itemRow(it));
      sectionsWrap.appendChild(
        h('div', { class: 'chk-section' },
          h('div', { class: 'chk-section-h' }, h('span', {}, sec.name), span),
          itemsWrap,
        ),
      );
    }

    const noteArea = h('textarea', { class: 'chk-note-input', placeholder: t('checklists.notePlaceholder') }) as HTMLTextAreaElement;
    noteArea.value = c.note || '';
    let noteTimer: ReturnType<typeof setTimeout> | undefined;
    noteArea.addEventListener('input', () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { api.setChecklistNote(c.slug, noteArea.value).catch(() => {}); }, 500);
    });
    const noteCard = h('div', { class: 'chk-note' }, h('div', { class: 'chk-note-h' }, '🗒 ' + t('checklists.notesHeading')), noteArea);

    detail.append(head, bar, research, sectionsWrap, noteCard);
    refreshCounters();

    function sectionLabel(sec: ChecklistSection) {
      return `${sec.items.filter((i) => i.checked).length}/${sec.items.length}`;
    }
    function refreshCounters() {
      const pct = c.total ? Math.round((c.checked / c.total) * 100) : 0;
      fill.style.width = pct + '%';
      progBadge.textContent = `${c.checked} / ${c.total}`;
      for (const { sec, span } of counters) span.textContent = sectionLabel(sec);
    }
    function toggleResearch() {
      const showing = research.style.display !== 'none';
      research.style.display = showing ? 'none' : 'block';
      researchBtn.classList.toggle('active', !showing);
      if (!showing) research.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    function doReset() {
      if (!c.total) return;
      api.resetChecklist(c.slug).then(() => {
        for (const sec of c.sections) for (const it of sec.items) it.checked = false;
        c.checked = 0;
        renderDetail();
        syncSummary();
        toast(t('checklists.toastReset'));
      }).catch(() => toast(t('checklists.toastResetFailed')));
    }
    function itemRow(it: ChecklistItem) {
      const box = h('span', { class: 'chk-box' + (it.checked ? ' on' : '') }, it.checked ? '✓' : '');
      const txt = h('span', { class: 'chk-text', html: renderInline(it.text) });
      // Любой inline `code` в тексте пункта → клик копирует (полиглот, {{7*7}}, дорк — что угодно).
      txt.querySelectorAll('code').forEach((cd) => {
        cd.classList.add('chk-copyable');
        (cd as HTMLElement).title = t('checklists.copy');
        cd.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyText(cd.textContent || '').then((ok) => { if (ok) toast(t('checklists.copied')); });
        });
      });

      // Подобранные пейлоады: компактная кнопка В СТРОКЕ пункта (уходит вправо), разворачивает карточки под ним.
      const matches = matchPayloads(it.text);
      const panel = h('div', { class: 'chk-item-payloads' });
      panel.style.display = 'none';
      let plBtn: HTMLButtonElement | null = null;
      if (matches.length) {
        plBtn = h('button', { class: 'chk-pl-btn', type: 'button' },
          `⚡ ${t('checklists.showPayloads')} · ${matches.length}`) as HTMLButtonElement;
      }

      const row = h('label', { class: 'chk-item' + (it.checked ? ' checked' : '') }, box, txt, plBtn);
      row.addEventListener('click', (ev) => { ev.preventDefault(); toggleDone(); });

      if (plBtn) {
        let built = false, open = false;
        plBtn.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          open = !open;
          if (open && !built) {
            built = true;
            for (const p of matches) panel.appendChild(PayloadCard(p));
            if (c.category) {
              panel.appendChild(
                h('a', { class: 'chk-pl-all', href: '#', onclick: (e: Event) => { e.preventDefault(); navigate('payloads', { sub: c.category! }); } },
                  `${t('checklists.openAllPayloads')} ${c.category} →`),
              );
            }
          }
          panel.style.display = open ? 'block' : 'none';
          plBtn!.classList.toggle('open', open);
        });
      }

      function paint(on: boolean) {
        box.classList.toggle('on', on); box.textContent = on ? '✓' : '';
        row.classList.toggle('checked', on);
      }
      function toggleDone() {
        const next = !it.checked;
        it.checked = next; c.checked += next ? 1 : -1;
        paint(next); refreshCounters(); syncSummary();
        api.setChecklistItem(it.key, next).catch(() => {
          it.checked = !next; c.checked += next ? -1 : 1;
          paint(!next); refreshCounters(); syncSummary();
          toast(t('checklists.toastSaveFailed'));
        });
      }
      return h('div', { class: 'chk-item-wrap' }, row, panel);
    }
  }

  async function select(slug: string) {
    active = slug;
    renderList();
    window.scrollTo({ top: 0 });
    try {
      current = await api.checklist(slug);
    } catch {
      current = null;
    }
    catIndex = [];
    idf = new Map();
    if (current?.category) {
      try {
        const pl = await api.entries({ type: 'payload', category: current.category, limit: 1000 });
        catIndex = pl.map((p) => {
          const strongText = p.title + ' ' + (p.subcategory || '') + ' ' + (p.tags || []).join(' ');
          return { p, terms: termSet(strongText + ' ' + (p.body || '')), strong: termSet(strongText) };
        });
        const N = catIndex.length || 1;
        const df = new Map<string, number>();
        for (const x of catIndex) for (const term of x.terms) df.set(term, (df.get(term) ?? 0) + 1);
        for (const [term, d] of df) idf.set(term, Math.log(1 + N / d));
      } catch { catIndex = []; idf = new Map(); }
    }
    renderDetail();
  }

  (async () => {
    try {
      const [lists, cats] = await Promise.all([api.checklists(), api.categories('payload')]);
      summaries = lists;
      const covered = new Set(lists.map((l) => l.category).filter(Boolean) as string[]);
      uncovered = cats.map((c) => c.category).filter((n) => !covered.has(n));
    } catch {
      summaries = [];
    }
    if (!active || !summaries.some((s) => s.slug === active)) active = summaries[0]?.slug || '';
    renderList();
    if (active) select(active);
    else renderDetail();
  })();

  return () => scrollTop.destroy();
}
