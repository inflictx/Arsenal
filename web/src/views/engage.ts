import { h, clear } from '../lib/dom';
import { api } from '../api';
import { ScrollTop } from '../components/scrolltop';
import { copyText } from '../lib/copy';
import { toast } from '../lib/toast';
import { t } from '../lib/i18n';

interface Target { id: number; name: string; host: string | null; lhost: string | null; scope: string | null; status: string; notes: string | null; is_active: boolean; updated_at: string; }
interface Finding { id: number; target_id: number | null; title: string; severity: string; url: string | null; status: string; body: string | null; }

const SEV = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const STATUS = ['open', 'triage', 'reported', 'accepted', 'duplicate', 'wontfix'];

export function EngageView(outlet: HTMLElement): () => void {
  clear(outlet);

  let targets: Target[] = [];
  let active: Target | null = null;
  let findings: Finding[] = [];

  // Push the active target's host/lhost into the global keys Commands reads, and notify it.
  const pushGlobalTarget = (tg: Target | null) => {
    try {
      if (tg?.host) localStorage.setItem('cmd.target', tg.host);
      if (tg?.lhost) localStorage.setItem('cmd.lhost', tg.lhost);
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('ars:target'));
  };

  const newBtn = h('button', { class: 'btn note-new', type: 'button', onclick: () => newTarget() }, t('engage.newTarget'));
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' },
    h('div', { class: 'note-left-head' }, h('div', { class: 'eng-left-h' }, t('engage.leftHead')), newBtn), listScroll);

  const titleEl = h('h1', { class: 'cat-h' }, t('engage.title'));
  const actionsEl = h('div', { class: 'note-actions' });
  const bodyEl = h('div', { class: 'note-body' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head note-head' }, titleEl, actionsEl), bodyEl);

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  function renderList() {
    clear(listScroll);
    for (const tg of targets) {
      listScroll.appendChild(
        h('div', { class: 'cat note-row' + (active && active.id === tg.id ? ' active' : ''), onclick: () => select(tg) },
          tg.is_active ? h('span', { class: 'eng-dot', title: t('engage.activeDot') }, '●') : null,
          h('span', { class: 'chk-row-title' }, tg.name || t('engage.noName')),
          h('span', { class: 'note-date' }, tg.status)),
      );
    }
    if (!targets.length) listScroll.appendChild(h('div', { class: 'burp-hits' }, t('engage.noTargets')));
  }

  async function loadFindings() { try { findings = active ? await api.findings(active.id) : []; } catch { findings = []; } }
  async function select(tg: Target) { active = tg; await loadFindings(); renderList(); renderRight(); }

  async function newTarget() {
    const tg = await api.createTarget({ name: t('engage.defaultTargetName'), status: 'active' });
    targets = await api.targets();
    await select(targets.find((x) => x.id === tg.id) ?? tg);
    toast(t('engage.targetCreated'));
  }
  async function activate() {
    if (!active) return;
    await api.activateTarget(active.id);
    targets = await api.targets();
    active = targets.find((x) => x.id === active!.id) ?? active;
    renderList(); renderRight();
    pushGlobalTarget(active);
    toast(t('engage.activePrefix') + (active?.name ?? '') + ' → Commands');
  }
  async function removeTarget() {
    if (!active) return;
    if (!window.confirm(t('engage.delTargetConfirm').replace('{name}', active.name).replace('{count}', String(findings.length)))) return;
    await api.removeTarget(active.id);
    targets = await api.targets();
    active = targets[0] ?? null;
    await loadFindings();
    renderList(); renderRight();
  }

  let tTimer: ReturnType<typeof setTimeout> | undefined;
  function saveTarget(patch: Partial<Target>) {
    if (!active) return;
    Object.assign(active, patch);
    const i = targets.findIndex((x) => x.id === active!.id);
    if (i >= 0) { const row = targets[i]; if (row) Object.assign(row, patch); }
    clearTimeout(tTimer);
    tTimer = setTimeout(() => {
      api.updateTarget(active!.id, patch).then(() => renderList()).catch(() => toast(t('engage.notSaved')));
      if (active!.is_active && ('host' in patch || 'lhost' in patch)) pushGlobalTarget(active);
    }, 400);
  }

  function tInput(label: string, key: keyof Target, ph: string) {
    const inp = h('input', { class: 'input', placeholder: ph, spellcheck: 'false' }) as HTMLInputElement;
    inp.value = (active?.[key] as string) ?? '';
    inp.addEventListener('input', () => saveTarget({ [key]: inp.value || null } as Partial<Target>));
    return h('label', { class: 'eng-field' }, h('span', { class: 'eng-flabel' }, label), inp);
  }

  function findingCard(f: Finding): HTMLElement {
    let fTimer: ReturnType<typeof setTimeout> | undefined;
    const save = (patch: Partial<Finding>) => {
      Object.assign(f, patch);
      clearTimeout(fTimer);
      fTimer = setTimeout(() => { api.updateFinding(f.id, patch).catch(() => toast(t('engage.notSaved'))); }, 400);
    };
    const sevSel = h('select', { class: 'eng-sel eng-sev sev-' + f.severity,
      onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; (e.target as HTMLElement).className = 'eng-sel eng-sev sev-' + v; save({ severity: v }); } },
      ...SEV.map((s) => h('option', { value: s, selected: s === f.severity ? '' : null }, s))) as HTMLSelectElement;
    const statSel = h('select', { class: 'eng-sel', onchange: (e: Event) => save({ status: (e.target as HTMLSelectElement).value }) },
      ...STATUS.map((s) => h('option', { value: s, selected: s === f.status ? '' : null }, s)));
    const titleInp = h('input', { class: 'input eng-ftitle', placeholder: t('engage.findingTitlePh'), spellcheck: 'false' }) as HTMLInputElement;
    titleInp.value = f.title;
    titleInp.addEventListener('input', () => save({ title: titleInp.value }));
    const urlInp = h('input', { class: 'input', placeholder: t('engage.findingUrlPh'), spellcheck: 'false' }) as HTMLInputElement;
    urlInp.value = f.url ?? '';
    urlInp.addEventListener('input', () => save({ url: urlInp.value || null }));
    const bodyArea = h('textarea', { class: 'note-area eng-fbody', placeholder: t('engage.findingBodyPh'), spellcheck: 'false' }) as HTMLTextAreaElement;
    bodyArea.value = f.body ?? '';
    bodyArea.addEventListener('input', () => save({ body: bodyArea.value }));
    const del = h('button', { class: 'btn note-del', type: 'button', title: t('engage.delFindingTitle'),
      onclick: async () => { if (!window.confirm(t('engage.delFindingConfirm'))) return; await api.removeFinding(f.id); findings = findings.filter((x) => x.id !== f.id); renderRight(); } }, '🗑');

    return h('div', { class: 'card eng-finding' },
      h('div', { class: 'eng-finding-head' }, sevSel, titleInp, statSel, del),
      urlInp, bodyArea);
  }

  async function addFinding() {
    if (!active) return;
    const f = await api.createFinding({ target_id: active.id, title: t('engage.defaultFindingTitle'), severity: 'medium', status: 'open' });
    findings.push(f);
    renderRight();
  }

  function buildReport(): string {
    if (!active) return '';
    let md = `# ${active.name}\n\n`;
    if (active.host) md += `**Host:** \`${active.host}\`  \n`;
    if (active.lhost) md += `**LHOST:** \`${active.lhost}\`  \n`;
    if (active.scope) md += `**Scope:** ${active.scope}  \n`;
    md += `**Status:** ${active.status}\n\n`;
    if (active.notes) md += `${t('engage.reportNotes')}\n\n${active.notes}\n\n`;
    md += `${t('engage.reportFindings')} (${findings.length})\n\n`;
    for (const f of [...findings].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))) {
      md += `### [${f.severity.toUpperCase()}] ${f.title}\n\n`;
      if (f.url) md += `- **URL:** ${f.url}\n`;
      md += `${t('engage.reportStatus')}${f.status}\n\n`;
      if (f.body) md += `${f.body}\n\n`;
    }
    return md;
  }
  function exportReport() {
    const md = buildReport();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (active?.name || 'engagement').replace(/[^\w.-]+/g, '_') + '-report.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t('engage.reportDownloaded'));
  }

  function renderRight() {
    if (!active) {
      titleEl.textContent = t('engage.title');
      clear(actionsEl); clear(bodyEl);
      bodyEl.appendChild(h('div', { class: 'note-empty' },
        h('p', {}, t('engage.emptyDesc')),
        h('button', { class: 'btn', type: 'button', onclick: () => newTarget() }, t('engage.createFirst'))));
      return;
    }
    titleEl.textContent = active.name || t('engage.noName');
    clear(actionsEl);
    actionsEl.append(
      active.is_active
        ? h('span', { class: 'eng-active-badge' }, t('engage.activeBadge'))
        : h('button', { class: 'btn', type: 'button', onclick: () => activate() }, t('engage.makeActive')),
      h('button', { class: 'btn', type: 'button', title: t('engage.reportTitle'), onclick: () => exportReport() }, t('engage.report')),
      h('button', { class: 'btn note-del', type: 'button', title: t('engage.delTargetTitle'), onclick: () => removeTarget() }, '🗑'),
    );
    clear(bodyEl);

    // name
    const nameInp = h('input', { class: 'input eng-name', placeholder: t('engage.namePh'), spellcheck: 'false' }) as HTMLInputElement;
    nameInp.value = active.name;
    nameInp.addEventListener('input', () => saveTarget({ name: nameInp.value }));

    const statusSel = h('select', { class: 'eng-sel', onchange: (e: Event) => saveTarget({ status: (e.target as HTMLSelectElement).value }) },
      ...['active', 'parked', 'done'].map((s) => h('option', { value: s, selected: s === active!.status ? '' : null }, s)));

    const notesArea = h('textarea', { class: 'note-area', placeholder: t('engage.notesPh'), spellcheck: 'false' }) as HTMLTextAreaElement;
    notesArea.value = active.notes ?? '';
    notesArea.addEventListener('input', () => saveTarget({ notes: notesArea.value }));

    const meta = h('div', { class: 'eng-grid' },
      h('label', { class: 'eng-field' }, h('span', { class: 'eng-flabel' }, t('engage.name')), nameInp),
      h('label', { class: 'eng-field' }, h('span', { class: 'eng-flabel' }, t('engage.status')), statusSel),
      tInput(t('engage.hostLabel'), 'host', '10.10.11.50 / target.htb'),
      tInput(t('engage.lhostLabel'), 'lhost', '10.10.14.7'),
    );
    const scopeField = tInput(t('engage.scope'), 'scope', t('engage.scopePh'));

    const fHead = h('div', { class: 'eng-fhead' },
      h('span', {}, `${t('engage.findingsHead')} (${findings.length})`),
      h('button', { class: 'btn', type: 'button', onclick: () => addFinding() }, t('engage.addFinding')));
    const fWrap = h('div', { class: 'eng-findings' },
      ...[...findings].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)).map(findingCard));

    bodyEl.append(
      meta, scopeField,
      h('div', { class: 'eng-section-h' }, t('engage.notesHead')), notesArea,
      h('div', { class: 'eng-section-h' }, fHead),
      findings.length ? fWrap : h('div', { class: 'burp-hits' }, t('engage.noFindings')),
    );
  }

  (async () => {
    try { targets = await api.targets(); } catch { targets = []; }
    active = targets.find((tg) => tg.is_active) ?? targets[0] ?? null;
    await loadFindings();
    renderList();
    renderRight();
  })();

  return () => scrollTop.destroy();
}
