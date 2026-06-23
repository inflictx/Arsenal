import { h, clear } from '../lib/dom';
import { api, type Checklist, type ChecklistSummary, type ChecklistSection, type ChecklistItem, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { PayloadCard } from '../components/card';
import { renderMarkdown, renderInline } from '../lib/markdown';
import { navigate } from '../router';
import { toast } from '../lib/toast';
import { copyText } from '../lib/copy';

// Слова-шум, не используемые для подбора пейлоадов под пункт.
const STOP = new Set([
  'для', 'или', 'без', 'если', 'при', 'это', 'как', 'что', 'под', 'над', 'все', 'всё', 'там', 'три',
  'два', 'нет', 'есть', 'был', 'для', 'про', 'его', 'их', 'см', 'напр', 'etc', 'via', 'the', 'and',
  'for', 'with', 'not', 'any', 'use',
]);

export function ChecklistsView(outlet: HTMLElement, params: Record<string, string>): () => void {
  clear(outlet);

  const filter = SearchField({ placeholder: 'Фильтр чек-листов…', onInput: () => renderList() });
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
  // Пейлоады текущей категории, проиндексированные для быстрого подбора под пункт.
  let catIndex: { p: Entry; hay: string }[] = [];

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
      listScroll.appendChild(h('div', { class: 'nav-label chk-uncovered-label' }, 'Без чек-листа'));
      for (const name of fU) {
        listScroll.appendChild(
          h('div', { class: 'cat chk-row muted', title: 'Открыть пейлоады', onclick: () => navigate('payloads', { sub: name }) },
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

  // Подобрать релевантные пейлоады под конкретный пункт (по code-токенам в `..` + ключевым словам).
  function matchPayloads(text: string): Entry[] {
    if (!catIndex.length) return [];
    const codeNeedles = new Set<string>();
    for (const m of text.matchAll(/`([^`]+)`/g)) {
      for (const s of m[1].toLowerCase().match(/[a-zа-яё0-9_]{3,}/gi) || []) codeNeedles.add(s);
    }
    const plain = text.toLowerCase().replace(/`[^`]+`/g, ' ');
    const words = new Set((plain.match(/[a-zа-яё0-9_]{3,}/gi) || []).filter((w) => !STOP.has(w)));
    if (!codeNeedles.size && !words.size) return [];
    const scored = catIndex.map(({ p, hay }) => {
      let score = 0;
      for (const s of codeNeedles) if (hay.includes(s)) score += 3;
      for (const w of words) if (hay.includes(w)) score += 1;
      return { p, score };
    }).filter((x) => x.score >= 3).sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map((x) => x.p);
  }

  // Пейлоады, вписанные прямо в `code`-спаны пункта (полиглоты, {{7*7}}, ' UNION SELECT…,
  // ?isAdmin=1, ../../etc/passwd, .phtml …) — копируются, даже если не сматчились с БД.
  // Порог длины ≥4 отсекает мелочь-иллюстрации (`[]`, `.`, `_`, `49`), но ловит реальные пейлоады.
  // ── detail ───────────────────────────────────────────────────────────────
  function renderDetail() {
    clear(detail);
    if (!current) {
      detail.appendChild(h('div', { class: 'empty' }, h('div', { class: 'big' }, '✓'), 'Выбери чек-лист слева'));
      return;
    }
    const c = current;

    const progBadge = h('span', { class: 'badge chk-badge' }, `${c.checked} / ${c.total}`);
    const researchBtn = h('button', { class: 'btn', onclick: toggleResearch }, '📖 Ресёрч');
    const resetBtn = h('button', { class: 'btn', onclick: doReset }, '↺ Сбросить');
    const openPayloads = c.category
      ? h('button', { class: 'btn', onclick: () => navigate('payloads', { sub: c.category! }) }, '⚡ Все пейлоады')
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

    const noteArea = h('textarea', { class: 'chk-note-input', placeholder: 'Твои заметки, payload’ы, находки по этой цели…' }) as HTMLTextAreaElement;
    noteArea.value = c.note || '';
    let noteTimer: ReturnType<typeof setTimeout> | undefined;
    noteArea.addEventListener('input', () => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => { api.setChecklistNote(c.slug, noteArea.value).catch(() => {}); }, 500);
    });
    const noteCard = h('div', { class: 'chk-note' }, h('div', { class: 'chk-note-h' }, '🗒 Заметки'), noteArea);

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
        toast('Чек-лист сброшен');
      }).catch(() => toast('Не удалось сбросить'));
    }
    function itemRow(it: ChecklistItem) {
      const box = h('span', { class: 'chk-box' + (it.checked ? ' on' : '') }, it.checked ? '✓' : '');
      const txt = h('span', { class: 'chk-text', html: renderInline(it.text) });
      // Любой inline `code` в тексте пункта → клик копирует (полиглот, {{7*7}}, дорк — что угодно).
      txt.querySelectorAll('code').forEach((cd) => {
        cd.classList.add('chk-copyable');
        (cd as HTMLElement).title = 'Скопировать';
        cd.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          copyText(cd.textContent || '').then((ok) => { if (ok) toast('Скопировано'); });
        });
      });

      const matches = matchPayloads(it.text);
      const chip = matches.length
        ? (h('button', { class: 'chk-pl-chip', title: 'Подходящие пейлоады из базы', type: 'button' }, `⚡ ${matches.length}`) as HTMLButtonElement)
        : null;

      const row = h('label', { class: 'chk-item' + (it.checked ? ' checked' : '') }, box, txt, chip);
      const panel = h('div', { class: 'chk-item-payloads' });
      panel.style.display = 'none';

      row.addEventListener('click', (ev) => { ev.preventDefault(); toggleDone(); });

      let built = false;
      let open = false;
      if (chip) {
        chip.addEventListener('click', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          open = !open;
          if (open && !built) {
            built = true;
            for (const p of matches) panel.appendChild(PayloadCard(p));
            if (c.category) {
              panel.appendChild(
                h('a', { class: 'chk-pl-all', href: '#', onclick: (e: Event) => { e.preventDefault(); navigate('payloads', { sub: c.category! }); } },
                  `Открыть все пейлоады: ${c.category} →`),
              );
            }
          }
          panel.style.display = open ? 'block' : 'none';
          chip.classList.toggle('active', open);
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
          toast('Не сохранилось');
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
    if (current?.category) {
      try {
        const pl = await api.entries({ type: 'payload', category: current.category, limit: 1000 });
        catIndex = pl.map((p) => ({
          p,
          hay: (p.title + ' ' + (p.body || '') + ' ' + (p.subcategory || '') + ' ' + (p.tags || []).join(' ')).toLowerCase(),
        }));
      } catch { catIndex = []; }
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
