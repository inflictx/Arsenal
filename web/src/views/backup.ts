import { h, clear } from '../lib/dom';
import { api } from '../api';

export function BackupView(outlet: HTMLElement): () => void {
  clear(outlet);

  const msg = h('div', { class: 'bk-msg' });
  const statsEl = h('div', { class: 'bk-stats' }, '…');
  const setMsg = (t: string, cls = '') => { msg.textContent = t; msg.className = 'bk-msg' + (cls ? ' ' + cls : ''); };

  const exportA = h('a', { class: 'btn bk-btn', href: '/api/backup', download: 'arsenal-backup.json' }, '⤓ Скачать бэкап (JSON)');
  const fileInp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }) as HTMLInputElement;
  const importBtn = h('button', { class: 'btn bk-btn', type: 'button', onclick: () => fileInp.click() }, '⤒ Восстановить из файла…');

  fileInp.addEventListener('change', async () => {
    const f = fileInp.files?.[0];
    if (!f) return;
    let data: { entries?: unknown[] };
    try { data = JSON.parse(await f.text()); } catch { setMsg('Не удалось прочитать файл — это не валидный JSON.', 'err'); fileInp.value = ''; return; }
    const n = Array.isArray(data?.entries) ? data.entries!.length : -1;
    if (n < 0) { setMsg('В файле нет поля «entries» — похоже, это не бэкап ARS3NAL.', 'err'); fileInp.value = ''; return; }
    if (!window.confirm(`Восстановить из бэкапа?\n\nЭто ЗАМЕНИТ все текущие данные содержимым файла (${n} записей). Текущее будет стёрто без возможности отмены.`)) { fileInp.value = ''; return; }
    setMsg('Восстановление…');
    try {
      const r = await api.restore(data);
      setMsg(`Готово: восстановлено ${r.entries} записей и ${r.checklist_state} отметок чек-листов. Обнови страницу (Ctrl+Shift+R).`, 'ok');
      loadStats();
    } catch (e) {
      setMsg('Ошибка восстановления: ' + (e instanceof Error ? e.message : String(e)), 'err');
    }
    fileInp.value = '';
  });

  async function loadStats() {
    try {
      const s = await api.stats();
      clear(statsEl);
      statsEl.appendChild(h('div', { class: 'bk-stat' }, h('b', {}, String(s.total)), ' всего'));
      for (const t of s.byType) statsEl.appendChild(h('div', { class: 'bk-stat' }, h('b', {}, String(t.n)), ' ' + t.type));
    } catch { statsEl.textContent = 'нет связи с сервером'; }
  }

  outlet.appendChild(h('div', { class: 'content bk-content' },
    h('div', { class: 'cards-head' }, h('h1', { class: 'cat-h' }, '💾 Бэкап / восстановление')),
    h('p', { class: 'bk-intro' }, 'Сохрани все данные приложения — пейлоады, твои заметки и готовые команды, прогресс и заметки чек-листов, избранное — в один JSON-файл. Восстановление заменяет текущую базу содержимым файла. Делай бэкап перед обновлениями и важными правками.'),
    h('div', { class: 'bk-row' }, exportA, importBtn),
    fileInp,
    msg,
    h('div', { class: 'cards-head', style: { marginTop: '24px' } }, h('h2', { class: 'bk-h2' }, 'Сейчас в базе')),
    statsEl,
  ));

  loadStats();
  return () => { /* nothing to clean up */ };
}
