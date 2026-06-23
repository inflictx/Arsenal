import { h, clear } from '../lib/dom';
import { api } from '../api';
import { ScrollTop } from '../components/scrolltop';
import { copyText } from '../lib/copy';
import { toast } from '../lib/toast';

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
  const pushGlobalTarget = (t: Target | null) => {
    try {
      if (t?.host) localStorage.setItem('cmd.target', t.host);
      if (t?.lhost) localStorage.setItem('cmd.lhost', t.lhost);
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('ars:target'));
  };

  const newBtn = h('button', { class: 'btn note-new', type: 'button', onclick: () => newTarget() }, '＋ Цель');
  const listScroll = h('div', { class: 'scroll burp-tree' });
  const left = h('aside', { class: 'catlist' },
    h('div', { class: 'note-left-head' }, h('div', { class: 'eng-left-h' }, 'Цели / engagements'), newBtn), listScroll);

  const titleEl = h('h1', { class: 'cat-h' }, 'Engagements');
  const actionsEl = h('div', { class: 'note-actions' });
  const bodyEl = h('div', { class: 'note-body' });
  const right = h('div', { style: { minWidth: '0' } }, h('div', { class: 'cards-head note-head' }, titleEl, actionsEl), bodyEl);

  outlet.appendChild(h('div', { class: 'content' }, h('div', { class: 'browser' }, left, right)));
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  function renderList() {
    clear(listScroll);
    for (const t of targets) {
      listScroll.appendChild(
        h('div', { class: 'cat note-row' + (active && active.id === t.id ? ' active' : ''), onclick: () => select(t) },
          t.is_active ? h('span', { class: 'eng-dot', title: 'активная цель' }, '●') : null,
          h('span', { class: 'chk-row-title' }, t.name || '(без имени)'),
          h('span', { class: 'note-date' }, t.status)),
      );
    }
    if (!targets.length) listScroll.appendChild(h('div', { class: 'burp-hits' }, 'целей пока нет'));
  }

  async function loadFindings() { try { findings = active ? await api.findings(active.id) : []; } catch { findings = []; } }
  async function select(t: Target) { active = t; await loadFindings(); renderList(); renderRight(); }

  async function newTarget() {
    const t = await api.createTarget({ name: 'Новая цель', status: 'active' });
    targets = await api.targets();
    await select(targets.find((x) => x.id === t.id) ?? t);
    toast('Цель создана');
  }
  async function activate() {
    if (!active) return;
    await api.activateTarget(active.id);
    targets = await api.targets();
    active = targets.find((x) => x.id === active!.id) ?? active;
    renderList(); renderRight();
    pushGlobalTarget(active);
    toast('Активная цель: ' + (active?.name ?? '') + ' → Commands');
  }
  async function removeTarget() {
    if (!active) return;
    if (!window.confirm(`Удалить цель «${active.name}» и все её находки (${findings.length})?`)) return;
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
    if (i >= 0) Object.assign(targets[i], patch);
    clearTimeout(tTimer);
    tTimer = setTimeout(() => {
      api.updateTarget(active!.id, patch).then(() => renderList()).catch(() => toast('Не сохранилось'));
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
      fTimer = setTimeout(() => { api.updateFinding(f.id, patch).catch(() => toast('Не сохранилось')); }, 400);
    };
    const sevSel = h('select', { class: 'eng-sel eng-sev sev-' + f.severity,
      onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; (e.target as HTMLElement).className = 'eng-sel eng-sev sev-' + v; save({ severity: v }); } },
      ...SEV.map((s) => h('option', { value: s, selected: s === f.severity ? '' : null }, s))) as HTMLSelectElement;
    const statSel = h('select', { class: 'eng-sel', onchange: (e: Event) => save({ status: (e.target as HTMLSelectElement).value }) },
      ...STATUS.map((s) => h('option', { value: s, selected: s === f.status ? '' : null }, s)));
    const titleInp = h('input', { class: 'input eng-ftitle', placeholder: 'Заголовок находки', spellcheck: 'false' }) as HTMLInputElement;
    titleInp.value = f.title;
    titleInp.addEventListener('input', () => save({ title: titleInp.value }));
    const urlInp = h('input', { class: 'input', placeholder: 'URL / эндпоинт', spellcheck: 'false' }) as HTMLInputElement;
    urlInp.value = f.url ?? '';
    urlInp.addEventListener('input', () => save({ url: urlInp.value || null }));
    const bodyArea = h('textarea', { class: 'note-area eng-fbody', placeholder: 'Repro / детали (markdown)', spellcheck: 'false' }) as HTMLTextAreaElement;
    bodyArea.value = f.body ?? '';
    bodyArea.addEventListener('input', () => save({ body: bodyArea.value }));
    const del = h('button', { class: 'btn note-del', type: 'button', title: 'Удалить находку',
      onclick: async () => { if (!window.confirm('Удалить находку?')) return; await api.removeFinding(f.id); findings = findings.filter((x) => x.id !== f.id); renderRight(); } }, '🗑');

    return h('div', { class: 'card eng-finding' },
      h('div', { class: 'eng-finding-head' }, sevSel, titleInp, statSel, del),
      urlInp, bodyArea);
  }

  async function addFinding() {
    if (!active) return;
    const f = await api.createFinding({ target_id: active.id, title: 'Новая находка', severity: 'medium', status: 'open' });
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
    if (active.notes) md += `## Заметки\n\n${active.notes}\n\n`;
    md += `## Находки (${findings.length})\n\n`;
    for (const f of [...findings].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9))) {
      md += `### [${f.severity.toUpperCase()}] ${f.title}\n\n`;
      if (f.url) md += `- **URL:** ${f.url}\n`;
      md += `- **Статус:** ${f.status}\n\n`;
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
    toast('Отчёт скачан');
  }

  function renderRight() {
    if (!active) {
      titleEl.textContent = 'Engagements';
      clear(actionsEl); clear(bodyEl);
      bodyEl.appendChild(h('div', { class: 'note-empty' },
        h('p', {}, 'Рабочее пространство по целям: хост/LHOST/scope, заметки и находки на каждую цель, экспорт отчёта в Markdown.'),
        h('button', { class: 'btn', type: 'button', onclick: () => newTarget() }, '＋ Создать первую цель')));
      return;
    }
    titleEl.textContent = active.name || '(без имени)';
    clear(actionsEl);
    actionsEl.append(
      active.is_active
        ? h('span', { class: 'eng-active-badge' }, '● активная')
        : h('button', { class: 'btn', type: 'button', onclick: () => activate() }, '● Сделать активной'),
      h('button', { class: 'btn', type: 'button', title: 'Экспорт отчёта (Markdown)', onclick: () => exportReport() }, '⤓ Отчёт'),
      h('button', { class: 'btn note-del', type: 'button', title: 'Удалить цель', onclick: () => removeTarget() }, '🗑'),
    );
    clear(bodyEl);

    // name
    const nameInp = h('input', { class: 'input eng-name', placeholder: 'Имя цели / программы / бокса', spellcheck: 'false' }) as HTMLInputElement;
    nameInp.value = active.name;
    nameInp.addEventListener('input', () => saveTarget({ name: nameInp.value }));

    const statusSel = h('select', { class: 'eng-sel', onchange: (e: Event) => saveTarget({ status: (e.target as HTMLSelectElement).value }) },
      ...['active', 'parked', 'done'].map((s) => h('option', { value: s, selected: s === active!.status ? '' : null }, s)));

    const notesArea = h('textarea', { class: 'note-area', placeholder: 'Заметки по цели (markdown): креды, порты, зацепки…', spellcheck: 'false' }) as HTMLTextAreaElement;
    notesArea.value = active.notes ?? '';
    notesArea.addEventListener('input', () => saveTarget({ notes: notesArea.value }));

    const meta = h('div', { class: 'eng-grid' },
      h('label', { class: 'eng-field' }, h('span', { class: 'eng-flabel' }, 'Имя'), nameInp),
      h('label', { class: 'eng-field' }, h('span', { class: 'eng-flabel' }, 'Статус'), statusSel),
      tInput('Host / IP  →  {TARGET}', 'host', '10.10.11.50 / target.htb'),
      tInput('LHOST  →  {LHOST}', 'lhost', '10.10.14.7'),
    );
    const scopeField = tInput('Scope', 'scope', '*.target.com, in-scope hosts…');

    const fHead = h('div', { class: 'eng-fhead' },
      h('span', {}, `Находки (${findings.length})`),
      h('button', { class: 'btn', type: 'button', onclick: () => addFinding() }, '＋ Находка'));
    const fWrap = h('div', { class: 'eng-findings' },
      ...[...findings].sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9)).map(findingCard));

    bodyEl.append(
      meta, scopeField,
      h('div', { class: 'eng-section-h' }, '🗒 Заметки'), notesArea,
      h('div', { class: 'eng-section-h' }, fHead),
      findings.length ? fWrap : h('div', { class: 'burp-hits' }, 'находок пока нет — добавь первую'),
    );
  }

  (async () => {
    try { targets = await api.targets(); } catch { targets = []; }
    active = targets.find((t) => t.is_active) ?? targets[0] ?? null;
    await loadFindings();
    renderList();
    renderRight();
  })();

  return () => scrollTop.destroy();
}
