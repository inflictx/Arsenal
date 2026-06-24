import { h, clear } from '../lib/dom';
import { api } from '../api';
import { t } from '../lib/i18n';

export function BackupView(outlet: HTMLElement): () => void {
  clear(outlet);

  const msg = h('div', { class: 'bk-msg' });
  const statsEl = h('div', { class: 'bk-stats' }, '…');
  const setMsg = (text: string, cls = '') => { msg.textContent = text; msg.className = 'bk-msg' + (cls ? ' ' + cls : ''); };

  const exportA = h('button', { class: 'btn bk-btn', type: 'button', onclick: async () => {
    try {
      const data = await api.exportBackup();
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'arsenal-backup.json' }) as HTMLAnchorElement;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setMsg(t('backup.exportFailed') + (e instanceof Error ? e.message : String(e)), 'err'); }
  } }, '⤓ ' + t('backup.exportBtn'));

  const fileInp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } }) as HTMLInputElement;
  let pendingMode: 'replace' | 'merge' = 'replace';
  const importBtn = h('button', { class: 'btn bk-btn', type: 'button', onclick: () => { pendingMode = 'replace'; fileInp.click(); } }, '⤒ ' + t('backup.importBtn'));
  const mergeBtn = h('button', { class: 'btn bk-btn', type: 'button', onclick: () => { pendingMode = 'merge'; fileInp.click(); } }, '⤬ ' + t('backup.mergeBtn'));

  fileInp.addEventListener('change', async () => {
    const f = fileInp.files?.[0];
    if (!f) return;
    let data: { entries?: unknown[] };
    try { data = JSON.parse(await f.text()); } catch { setMsg(t('backup.readFailed'), 'err'); fileInp.value = ''; return; }
    const n = Array.isArray(data?.entries) ? data.entries!.length : -1;
    if (n < 0) { setMsg(t('backup.noEntries'), 'err'); fileInp.value = ''; return; }

    if (pendingMode === 'merge') {
      if (!window.confirm(t('backup.confirmMergeHead') + `\n\n` + t('backup.confirmMergeBody'))) { fileInp.value = ''; return; }
      setMsg(t('backup.restoring'));
      try {
        const r = await api.merge(data);
        setMsg(`${t('backup.doneMerged')} ${r.addedEntries} ${t('backup.mergedEntries')} + ${r.mergedState} ${t('backup.mergedMarks')}. ` + t('backup.reloadHint'), 'ok');
        loadStats();
      } catch (e) { setMsg(t('backup.restoreError') + (e instanceof Error ? e.message : String(e)), 'err'); }
      fileInp.value = '';
      return;
    }

    if (!window.confirm(t('backup.confirmHead') + `\n\n` + t('backup.confirmBody1') + ` (${n} ` + t('backup.records') + `). ` + t('backup.confirmBody2'))) { fileInp.value = ''; return; }
    setMsg(t('backup.restoring'));
    try {
      const r = await api.restore(data);
      setMsg(t('backup.doneRestored') + ` ${r.entries} ` + t('backup.records') + ` ` + t('backup.and') + ` ${r.checklist_state} ` + t('backup.checklistMarks') + `. ` + t('backup.reloadHint'), 'ok');
      loadStats();
    } catch (e) {
      setMsg(t('backup.restoreError') + (e instanceof Error ? e.message : String(e)), 'err');
    }
    fileInp.value = '';
  });

  async function loadStats() {
    try {
      const s = await api.stats();
      clear(statsEl);
      statsEl.appendChild(h('div', { class: 'bk-stat' }, h('b', {}, String(s.total)), ' ' + t('backup.totalSuffix')));
      for (const row of s.byType) statsEl.appendChild(h('div', { class: 'bk-stat' }, h('b', {}, String(row.n)), ' ' + row.type));
    } catch { statsEl.textContent = t('backup.noServer'); }
  }

  outlet.appendChild(h('div', { class: 'content bk-content' },
    h('div', { class: 'cards-head' }, h('h1', { class: 'cat-h' }, '💾 ' + t('backup.title'))),
    h('p', { class: 'bk-intro' }, t('backup.intro')),
    h('div', { class: 'bk-row' }, exportA, importBtn, mergeBtn),
    fileInp,
    msg,
    h('div', { class: 'cards-head', style: { marginTop: '24px' } }, h('h2', { class: 'bk-h2' }, t('backup.nowInDb'))),
    statsEl,
  ));

  loadStats();
  return () => { /* nothing to clean up */ };
}
