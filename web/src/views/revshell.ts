import { h, clear } from '../lib/dom';
import { codeBlock } from '../lib/highlight';
import { copyButton } from '../lib/copy';
import { SearchField } from '../components/searchfield';
import { fmt, fmtAssembled, psB64, applyEncoding, ENCODINGS, type Encoding } from '../data/revshells';
import { rsgData, CommandType } from '../data/rsg-data';
import { t } from '../lib/i18n';

interface Cmd { name: string; command: string; meta: string[]; }
const DATA = rsgData as { reverseShellCommands: Cmd[]; listenerCommands: [string, string][]; shells: string[]; specialCommands: Record<string, string> };
const CT = CommandType;

// The PowerShell "(Base64)" rows ship as name-only placeholders; their real payload lives in
// specialCommands and must be UTF-16LE-base64'd at gen() time (after {ip}/{port} substitution).
const PS_B64_SPECIAL: Record<string, string> = {
  'PowerShell #3 (Base64)': 'PowerShell payload',
  'PowerShell #5 (stderr support) (Base64)': 'PowerShell +stderr payload',
};

const TABS: { id: string; label: string }[] = [
  { id: CT.ReverseShell, label: t('revshell.tabReverse') },
  { id: CT.BindShell, label: t('revshell.tabBind') },
  { id: CT.MSFVenom, label: 'MSFVenom' },
  { id: CT.HoaxShell, label: 'HoaxShell' },
  { id: CT.Assembled, label: t('revshell.tabAssembled') },
];
const OSES: { id: string; label: string }[] = [
  { id: '', label: t('revshell.osAll') }, { id: 'linux', label: 'Linux' }, { id: 'windows', label: 'Windows' }, { id: 'mac', label: 'Mac' },
];

const isPwsh = (c: Cmd) => /powershell|pwsh/i.test(c.name) || /^\s*powershell/i.test(c.command);
const langOf = (c: Cmd): string => {
  const n = c.name.toLowerCase();
  if (/powershell|pwsh|powercat/.test(n)) return 'powershell';
  if (/python/.test(n)) return 'python';
  if (/perl/.test(n)) return 'perl';
  if (/php/.test(n)) return 'php';
  if (/ruby/.test(n)) return 'ruby';
  if (/c#|csharp/.test(n)) return 'csharp';
  if (/java|jsp|war/.test(n)) return 'java';
  if (/golang|\bgo\b/.test(n)) return 'go';
  if (/lua/.test(n)) return 'lua';
  if (/node|javascript|deno/.test(n)) return 'javascript';
  if (/msfvenom|haskell/.test(n)) return 'bash';
  if (/^c\b|c windows/.test(n)) return 'c';
  return 'bash';
};
const fmtListener = (t: string, ip: string, port: string) =>
  t.split('{ip}').join(ip).split('{port}').join(port).split('{payload}').join('linux/x64/shell_reverse_tcp').split('{type}').join('c');

const LS = {
  get: (k: string, d: string) => { try { return localStorage.getItem('rev:' + k) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem('rev:' + k, v); } catch { /* ignore */ } },
};

export function RevShellView(outlet: HTMLElement): () => void {
  clear(outlet);

  // Default LHOST = the global target (cmd.lhost, shared with Engagements/Commands), else last RevShell IP.
  let ip = (() => { try { return localStorage.getItem('cmd.lhost') || LS.get('ip', '10.10.14.1'); } catch { return LS.get('ip', '10.10.14.1'); } })();
  // Propagate the resolved default LHOST to the global key so Payloads/Commands pick it up even before you edit the field.
  try { if (!localStorage.getItem('cmd.lhost')) localStorage.setItem('cmd.lhost', ip); } catch { /* ignore */ }
  let port = LS.get('port', '4444');
  let shell = LS.get('shell', 'bash');
  let enc = LS.get('enc', 'none') as Encoding;
  let tab = CT.ReverseShell;
  let osf = '';
  let listenerName = DATA.listenerCommands[0]?.[0] ?? '';
  let selectedName: string | null = null;

  const gen = (c: Cmd, withEnc: boolean) => {
    // PowerShell "(Base64)" placeholders -> build the real `powershell -e <b64>` from specialCommands
    // (already encoded, so the enc dropdown does not apply).
    const special = PS_B64_SPECIAL[c.name];
    if (special && DATA.specialCommands[special]) {
      return `powershell -e ${psB64(fmt(DATA.specialCommands[special], { ip, port, shell }))}`;
    }
    // Assembled shellcode embeds {ip}/{port} inside the \xNN byte run -> substitute as network bytes.
    if (c.meta.includes(CT.Assembled)) {
      const raw = fmtAssembled(c.command, ip, port);
      return withEnc ? applyEncoding(raw, enc, false) : raw;
    }
    const raw = fmt(c.command, { ip, port, shell });
    return withEnc ? applyEncoding(raw, enc, isPwsh(c)) : raw;
  };

  // ── IP & Port panel ──
  const ipInput = h('input', { class: 'input', value: ip, spellcheck: 'false' }) as HTMLInputElement;
  const portInput = h('input', { class: 'input', value: port, spellcheck: 'false' }) as HTMLInputElement;
  const plus1 = h('button', { class: 'rev-plus', title: t('revshell.portPlus1') }, '+1');
  ipInput.addEventListener('input', () => {
    ip = ipInput.value.trim(); LS.set('ip', ip);
    try { localStorage.setItem('cmd.lhost', ip); } catch { /* ignore */ } // share LHOST with Commands
    window.dispatchEvent(new CustomEvent('ars:target'));
    live();
  });
  portInput.addEventListener('input', () => { port = portInput.value.trim(); LS.set('port', port); live(); });
  plus1.addEventListener('click', () => { port = String((parseInt(port, 10) || 0) + 1); portInput.value = port; LS.set('port', port); live(); });
  const ipPanel = h('div', { class: 'rev-panel' },
    h('div', { class: 'rev-panel-h' }, t('revshell.ipPort')),
    h('div', { class: 'rev-ipport' }, field(t('revshell.ipLhost'), ipInput, 'rev-ip'), field(t('revshell.port'), portInput, 'rev-port'), plus1),
  );

  // ── Listener panel ──
  const listenerSel = h('select', { class: 'input' }, ...DATA.listenerCommands.map(([n]) => h('option', { value: n }, n))) as HTMLSelectElement;
  listenerSel.value = listenerName;
  const listenerOut = h('div', { class: 'rev-out' });
  const listenerCopy = copyButton(() => { const l = DATA.listenerCommands.find((x) => x[0] === listenerName); return l ? fmtListener(l[1], ip, port) : ''; });
  listenerSel.addEventListener('change', () => { listenerName = listenerSel.value; renderListener(); });
  const listenerPanel = h('div', { class: 'rev-panel' },
    h('div', { class: 'rev-panel-h' }, t('revshell.listener')),
    listenerOut,
    h('div', { class: 'rev-panel-foot' }, field(t('revshell.type'), listenerSel), h('span', { class: 'spacer' }), listenerCopy),
  );

  // ── Tabs ──
  const tabBtns = TABS.map((t) => h('button', { class: 'rev-tab' + (t.id === tab ? ' active' : ''), onclick: () => switchTab(t.id) }, t.label));
  const tabs = h('div', { class: 'rev-tabs' }, ...tabBtns);

  // ── Control row ──
  const osSel = h('select', { class: 'input' }, ...OSES.map((o) => h('option', { value: o.id }, o.label))) as HTMLSelectElement;
  osSel.addEventListener('change', () => { osf = osSel.value; renderList(); renderDetail(); });
  const search = SearchField({ placeholder: t('revshell.searchPh'), onInput: () => { renderList(); renderDetail(); } });
  const ctl = h('div', { class: 'rev-ctl' }, field(t('revshell.os'), osSel), search.el);

  // ── Master list + detail ──
  const listScroll = h('div', { class: 'scroll' });
  const listPanel = h('aside', { class: 'catlist' }, listScroll);

  const detailOut = h('div', { class: 'rev-out' });
  const shellSel = h('select', { class: 'input' }, ...DATA.shells.map((s) => h('option', { value: s }, s))) as HTMLSelectElement;
  shellSel.value = shell;
  const encSel = h('select', { class: 'input' }, ...ENCODINGS.map((e) => h('option', { value: e.id }, e.label))) as HTMLSelectElement;
  encSel.value = enc;
  shellSel.addEventListener('change', () => { shell = shellSel.value; LS.set('shell', shell); renderDetail(); });
  encSel.addEventListener('change', () => { enc = encSel.value as Encoding; LS.set('enc', enc); renderDetail(); });
  const detail = h('div', { class: 'rev-detail' },
    detailOut,
    h('div', { class: 'rev-detail-foot' }, field(t('revshell.shell'), shellSel), field(t('revshell.encoding'), encSel)),
  );

  outlet.appendChild(
    h('div', { class: 'content' },
      h('div', { class: 'rev-top' }, ipPanel, listenerPanel),
      tabs, ctl,
      h('div', { class: 'browser rev-browser' }, listPanel, detail),
    ),
  );

  function field(label: string, control: HTMLElement, cls?: string) {
    return h('label', { class: 'rev-field' + (cls ? ' ' + cls : '') }, h('span', { class: 'rev-label' }, label), control);
  }

  function currentList(): Cmd[] {
    const q = search.input.value.trim().toLowerCase();
    return DATA.reverseShellCommands
      .filter((c) => c.meta.includes(tab))
      .filter((c) => !osf || c.meta.includes(osf))
      .filter((c) => !q || c.name.toLowerCase().includes(q));
  }
  function sel(): Cmd | null { return currentList().find((c) => c.name === selectedName) ?? null; }

  function renderList() {
    const list = currentList();
    if (!list.some((c) => c.name === selectedName)) selectedName = list[0]?.name ?? null;
    clear(listScroll);
    if (!list.length) { listScroll.appendChild(h('div', { class: 'empty', style: { padding: '24px 10px' } }, t('revshell.empty'))); return; }
    for (const c of list) {
      const osTag = c.meta.includes('windows') && !c.meta.includes('linux') ? 'win' : c.meta.find((m) => m === 'linux' || m === 'mac') ?? '';
      listScroll.appendChild(
        h('div', { class: 'cat' + (c.name === selectedName ? ' active' : ''), onclick: () => selectCmd(c.name) },
          h('span', { class: 'chk-row-title' }, c.name),
          h('span', { class: 'n' }, osTag),
        ),
      );
    }
  }
  function selectCmd(name: string) { selectedName = name; renderList(); renderDetail(); }

  function renderDetail() {
    clear(detailOut);
    const c = sel();
    if (!c) { detailOut.appendChild(h('div', { class: 'empty' }, t('revshell.pickLeft'))); return; }
    const rawBtn = copyButton(() => gen(c, false), t('revshell.raw'));
    const copyBtn = copyButton(() => gen(c, true), t('revshell.copy'));
    detailOut.appendChild(
      h('div', { class: 'card rev-cmd-card' },
        h('div', { class: 'card-top' },
          h('span', { class: 'card-title', title: c.name }, c.name),
          h('span', { class: 'lang' }, langOf(c)),
          h('div', { class: 'card-actions' }, rawBtn, copyBtn),
        ),
        codeBlock(gen(c, true), { wrap: true }),
      ),
    );
  }
  function renderListener() {
    clear(listenerOut);
    const l = DATA.listenerCommands.find((x) => x[0] === listenerName);
    if (l) listenerOut.appendChild(codeBlock(fmtListener(l[1], ip, port), { wrap: true }));
  }
  function switchTab(t: string) {
    tab = t;
    for (let i = 0; i < tabBtns.length; i++) tabBtns[i]?.classList.toggle('active', TABS[i]?.id === t);
    selectedName = null;
    renderList();
    renderDetail();
  }
  function live() { renderDetail(); renderListener(); }

  // Pick up the global LHOST when Engagements/Commands changes the active target.
  const onTarget = () => {
    let v = '';
    try { v = localStorage.getItem('cmd.lhost') ?? ''; } catch { /* ignore */ }
    if (v && v !== ip) { ip = v; ipInput.value = v; LS.set('ip', ip); live(); }
  };
  window.addEventListener('ars:target', onTarget);

  renderList();
  renderDetail();
  renderListener();

  return () => window.removeEventListener('ars:target', onTarget);
}
