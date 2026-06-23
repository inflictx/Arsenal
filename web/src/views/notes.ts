import { h, clear } from '../lib/dom';
import { api, type Entry } from '../api';
import { SearchField } from '../components/searchfield';
import { ScrollTop } from '../components/scrolltop';
import { copyButton } from '../lib/copy';
import { renderMarkdown } from '../lib/markdown';

const NEW: Entry = { id: 0, type: 'note', category: null, subcategory: null, title: '', body: '', language: 'md', tags: [], source: null, meta: null, is_custom: true, is_favorite: false, notes: null, created_at: '', updated_at: '' };

export function NotesView(outlet: HTMLElement): () => void {
  clear(outlet);

  let notes: Entry[] = [];
  let active: Entry | null = null;
  let mode: 'read' | 'edit' = 'read';
  const rowById = new Map<number, HTMLElement>();

  const search = SearchField({ placeholder: 'Поиск заметок…', onInput: () => renderList() });
  const newBtn = h('button', { class: 'btn note-new', type: 'button', onclick: () => startNew() }, '＋ Новая');
  const countEl = h('div', { class: 'burp-hits' });
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' }, h('div', { class: 'note-left-head' }, search.el, newBtn), countEl, listScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Notes');
  const actionsEl = h('div', { class: 'note-actions' });
  const bodyEl = h('div', { class: 'note-body' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head note-head' }, titleEl, actionsEl), bodyEl);

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  const fmtDate = (s?: string | null) => (s ? s.slice(0, 10) : '');
  function plural(n: number): string {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'заметка';
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'заметки';
    return 'заметок';
  }
  function matches(n: Entry, q: string): boolean {
    return [n.title, n.body, (n.tags || []).join(' '), n.category].filter(Boolean).join(' ').toLowerCase().includes(q);
  }
  function sortNotes() {
    notes.sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || (b.updated_at < a.updated_at ? -1 : 1));
  }

  async function reload() {
    try { notes = await api.entries({ type: 'note', limit: 1000 }); } catch { notes = []; }
    sortNotes();
  }

  function renderList() {
    clear(listScroll);
    rowById.clear();
    const q = search.input.value.trim().toLowerCase();
    const hits = notes.filter((n) => !q || matches(n, q));
    countEl.textContent = notes.length ? `${hits.length} ${plural(hits.length)}` : '';
    for (const n of hits) {
      const row = h('div', { class: 'cat note-row' + (active && active.id === n.id ? ' active' : ''), onclick: () => openNote(n) },
        n.is_favorite ? h('span', { class: 'note-star' }, '★') : null,
        h('span', { class: 'chk-row-title' }, n.title || '(без названия)'),
        h('span', { class: 'note-date' }, fmtDate(n.updated_at)),
      );
      rowById.set(n.id, row);
      listScroll.appendChild(row);
    }
  }

  function openNote(n: Entry) { active = n; mode = 'read'; renderList(); renderRight(); }

  function startNew() { active = { ...NEW, tags: [] }; mode = 'edit'; renderList(); renderRight(); }

  async function toggleFav() {
    if (!active || !active.id) return;
    const updated = await api.favorite(active.id);
    active = updated;
    const i = notes.findIndex((n) => n.id === updated.id);
    if (i >= 0) notes[i] = updated;
    sortNotes(); renderList(); renderRight();
  }

  async function removeActive() {
    if (!active || !active.id) return;
    if (!window.confirm(`Удалить заметку «${active.title || 'без названия'}»?`)) return;
    await api.remove(active.id);
    await reload();
    active = notes[0] ?? null;
    renderList(); renderRight();
  }

  async function saveNote(title: string, tagsStr: string, catStr: string, body: string) {
    title = title.trim();
    if (!title && !body.trim()) { mode = 'read'; renderRight(); return; }
    const tags = tagsStr.split(',').map((s) => s.trim()).filter(Boolean);
    const payload = { title: title || '(без названия)', body, tags, category: catStr.trim() || null, language: 'md' };
    const saved = active && active.id
      ? await api.update(active.id, payload)
      : await api.create({ type: 'note', ...payload });
    await reload();
    active = notes.find((n) => n.id === saved.id) ?? saved;
    mode = 'read'; renderList(); renderRight();
  }

  function renderRight() {
    if (!active) {
      titleEl.textContent = 'Notes';
      clear(actionsEl); clear(bodyEl);
      bodyEl.appendChild(h('div', { class: 'note-empty' },
        h('p', {}, 'Заметок пока нет. Здесь — твои личные шпаргалки и заметки (markdown, таблицы, код).'),
        h('button', { class: 'btn', type: 'button', onclick: () => startNew() }, '＋ Создать первую заметку')));
      return;
    }
    if (mode === 'edit') return renderEditor();

    titleEl.textContent = active.title || '(без названия)';
    clear(actionsEl);
    actionsEl.append(
      h('button', { class: 'btn note-fav' + (active.is_favorite ? ' on' : ''), type: 'button', title: 'В избранное', onclick: () => toggleFav() }, active.is_favorite ? '★' : '☆'),
      h('button', { class: 'btn', type: 'button', onclick: () => { mode = 'edit'; renderRight(); } }, '✎ Править'),
      h('button', { class: 'btn note-del', type: 'button', title: 'Удалить', onclick: () => removeActive() }, '🗑'),
    );
    clear(bodyEl);
    const meta = h('div', { class: 'note-meta' }, (active.category ? active.category + ' · ' : '') + 'обновлено ' + fmtDate(active.updated_at));
    const md = h('article', { class: 'md cmd-md' });
    md.innerHTML = renderMarkdown(active.body ?? '');
    md.querySelectorAll('pre').forEach((pre) => {
      const code = pre.querySelector('code');
      const btn = copyButton(() => code?.textContent ?? pre.textContent ?? '', 'Copy');
      btn.classList.add('doc-copy');
      pre.appendChild(btn);
    });
    bodyEl.append(meta, md);
  }

  function renderEditor() {
    if (!active) return;
    titleEl.textContent = active.id ? 'Править заметку' : 'Новая заметка';
    const titleInp = h('input', { class: 'input note-title-inp', placeholder: 'Заголовок', spellcheck: 'false' }) as HTMLInputElement;
    titleInp.value = active.title ?? '';
    const catInp = h('input', { class: 'input note-cat-inp', placeholder: 'категория (необязательно)', spellcheck: 'false' }) as HTMLInputElement;
    catInp.value = active.category ?? '';
    const tagsInp = h('input', { class: 'input note-tags-inp', placeholder: 'теги через запятую (необязательно)', spellcheck: 'false' }) as HTMLInputElement;
    tagsInp.value = (active.tags || []).join(', ');
    const area = h('textarea', { class: 'note-area', placeholder: 'Markdown… **жирный**, таблицы, ```bash\\n код \\n```', spellcheck: 'false' }) as HTMLTextAreaElement;
    area.value = active.body ?? '';
    const preview = h('article', { class: 'md cmd-md note-preview' });
    const renderPrev = () => { preview.innerHTML = renderMarkdown(area.value); };
    area.addEventListener('input', renderPrev);
    renderPrev();

    clear(actionsEl);
    actionsEl.append(
      h('button', { class: 'btn note-save', type: 'button', onclick: () => saveNote(titleInp.value, tagsInp.value, catInp.value, area.value) }, '💾 Сохранить'),
      h('button', { class: 'btn', type: 'button', onclick: () => { if (active && !active.id) active = notes[0] ?? null; mode = 'read'; renderList(); renderRight(); } }, 'Отмена'),
    );
    clear(bodyEl);
    bodyEl.appendChild(h('div', { class: 'note-form' },
      titleInp,
      h('div', { class: 'note-form-row' }, catInp, tagsInp),
      area,
      h('div', { class: 'note-prev-label' }, 'Предпросмотр'),
      preview,
    ));
    titleInp.focus();
  }

  (async () => {
    await reload();
    active = notes[0] ?? null;
    renderList();
    renderRight();
  })();

  return () => scrollTop.destroy();
}
