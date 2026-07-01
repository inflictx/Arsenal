import { h, clear } from '../lib/dom';
import { copyButton } from '../lib/copy';
import { getLang } from '../lib/i18n';
import { ScrollTop } from '../components/scrolltop';
import {
  CDX_DEFAULTS, type CdxOpts, buildCdxUrl, buildCdxCurl, CDX_CHIP_EXTS, CDX_RECIPES,
  homographVariants, emailHomographs, analyzeDomain, type ConfSet,
  DORK_PRESETS, dorkSearchUrl, type SearchEngine, DORK_OPERATORS, GITHUB_DORKS, SHODAN_DORKS,
} from '../data/recon';

// Recon Tools: OFFLINE crafters. Each only ASSEMBLES a query / URL / command you run yourself,
// or does local Punycode math. The app never touches the network.

type LS = { ru: string; en: string };

const LSK = (k: string) => 'recon.' + k;
const rd = (k: string, d = '') => { try { return localStorage.getItem(LSK(k)) ?? d; } catch { return d; } };
const wr = (k: string, v: string) => { try { localStorage.setItem(LSK(k), v); } catch { /* ignore */ } };
function loadJson<T>(k: string, def: T): T { try { return { ...def, ...JSON.parse(rd(k) || '{}') }; } catch { return { ...def }; } }
const saveJson = (k: string, v: unknown) => wr(k, JSON.stringify(v));
const sldOf = (d: string) => (d.split('.')[0] || d);

export function ReconView(outlet: HTMLElement): () => void {
  clear(outlet);
  const lang = getLang();
  const L = (s: LS): string => s[lang];

  // ---------- shared builders ----------
  const field = (label: string, control: HTMLElement) =>
    h('label', { class: 'recon-field' }, h('span', { class: 'recon-flabel' }, label), control);
  const textInput = (value: string, ph: string, on: (v: string) => void): HTMLInputElement => {
    const inp = h('input', { class: 'recon-input', type: 'text', value, placeholder: ph, spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' }) as HTMLInputElement;
    inp.addEventListener('input', () => on(inp.value));
    return inp;
  };
  const select = (opts: { v: string; label: string }[], value: string, on: (v: string) => void): HTMLSelectElement => {
    const sel = h('select', { class: 'recon-select' }, ...opts.map((o) => h('option', { value: o.v, selected: o.v === value }, o.label))) as HTMLSelectElement;
    sel.addEventListener('change', () => on(sel.value));
    return sel;
  };
  const checkbox = (label: string, checked: boolean, on: (v: boolean) => void): HTMLElement => {
    const cb = h('input', { type: 'checkbox', checked }) as HTMLInputElement;
    cb.addEventListener('change', () => on(cb.checked));
    return h('label', { class: 'recon-check' }, cb, label);
  };
  const chip = (label: string, active: boolean, on: () => void): HTMLElement => {
    const c = h('button', { class: 'recon-chip' + (active ? ' on' : ''), type: 'button' }, label);
    c.addEventListener('click', () => { c.classList.toggle('on'); on(); });
    return c;
  };
  const outCard = (title: string): { el: HTMLElement; set: (s: string) => void } => {
    const code = h('code', { class: 'recon-outcode' });
    const btn = copyButton(() => code.textContent || '');
    btn.classList.add('recon-copy');
    const el = h('div', { class: 'recon-out' }, h('div', { class: 'recon-out-head' }, h('span', null, title), btn), h('pre', { class: 'recon-pre' }, code));
    return { el, set: (s: string) => { code.textContent = s; } };
  };
  const intro = (s: LS) => h('p', { class: 'recon-intro' }, L(s));
  const uniSpan = (str: string, swapped: number[]) =>
    h('span', { class: 'recon-uni' }, ...[...str].map((ch, i) => h('span', { class: swapped.includes(i) ? 'recon-swap' : '' }, ch)));

  const CONF_SETS: { v: ConfSet; label: LS; def: boolean }[] = [
    { v: 'cyrillic', label: { ru: 'Кириллица', en: 'Cyrillic' }, def: true },
    { v: 'latin', label: { ru: 'Латиница (акценты)', en: 'Latin (accents)' }, def: true },
    { v: 'greek', label: { ru: 'Греческий', en: 'Greek' }, def: false },
    { v: 'armenian', label: { ru: 'Армянский', en: 'Armenian' }, def: false },
    { v: 'fullwidth', label: { ru: 'Fullwidth', en: 'Fullwidth' }, def: false },
  ];

  // =========================================================
  //  Tab 1 — Wayback CDX
  // =========================================================
  function cdxTab(): HTMLElement {
    const o: CdxOpts = loadJson('cdx', { ...CDX_DEFAULTS });
    if (!Array.isArray(o.exts)) o.exts = [];
    const wrap = h('div', { class: 'recon-tool' });
    const controls = h('div', { class: 'recon-controls' });
    const urlOut = outCard('CDX API URL');
    const curlOut = outCard('curl');
    const recipesBox = h('div', { class: 'recon-recipes' });

    const RECIPE_L: Record<string, LS> = {
      harvest: { ru: 'Сбор URL (gau + waybackurls)', en: 'URL harvest (gau + waybackurls)' },
      subs: { ru: 'Извлечь поддомены из архива', en: 'Extract subdomains from the archive' },
      juicy: { ru: 'Чувствительные файлы', en: 'Sensitive files' },
      params: { ru: 'URL с параметрами (+ имена)', en: 'URLs with params (+ names)' },
      gf: { ru: 'Классификация по классам багов (gf)', en: 'Classify by bug class (gf)' },
      raw: { ru: 'Восстановить удалённый файл (id_)', en: 'Recover a deleted file (id_)' },
      robots: { ru: 'История robots.txt', en: 'robots.txt history' },
      pdf: { ru: 'Скан PDF на секреты', en: 'PDF secret scan' },
    };
    const renderRecipes = () => {
      clear(recipesBox);
      recipesBox.append(h('div', { class: 'recon-sublabel' }, L({ ru: 'Рецепты пост-обработки (запускаешь сам)', en: 'Post-processing recipes (you run these)' })));
      for (const r of CDX_RECIPES) {
        const rc = outCard(L(RECIPE_L[r.id] ?? { ru: r.id, en: r.id }));
        rc.set(r.cmd(o.domain || 'example.com'));
        recipesBox.append(rc.el);
      }
    };
    const rebuild = () => { urlOut.set(buildCdxUrl(o)); curlOut.set(buildCdxCurl(o)); saveJson('cdx', o); };

    const renderControls = () => {
      clear(controls);
      controls.append(
        h('div', { class: 'recon-row' },
          field(L({ ru: 'Домен', en: 'Domain' }), textInput(o.domain, 'example.com', (v) => { o.domain = v; rebuild(); renderRecipes(); })),
          field('matchType', select([
            { v: 'domain', label: 'domain (+ subs)' }, { v: 'host', label: 'host' }, { v: 'prefix', label: 'prefix' }, { v: 'exact', label: 'exact' },
          ], o.matchType, (v) => { o.matchType = v as CdxOpts['matchType']; rebuild(); })),
          field('collapse', select([
            { v: 'urlkey', label: 'urlkey (unique URLs)' }, { v: 'digest', label: 'digest (content changed)' },
            { v: 'timestamp:8', label: 'timestamp:8 (per day)' }, { v: '', label: 'none' },
          ], o.collapse, (v) => { o.collapse = v; rebuild(); })),
          field('fl', select([
            { v: 'original', label: 'original' }, { v: 'timestamp,original', label: 'timestamp,original' },
            { v: 'urlkey,timestamp,original,mimetype,statuscode,digest,length', label: 'all columns' },
          ], o.fl, (v) => { o.fl = v; rebuild(); })),
          field('output', select([{ v: 'text', label: 'text' }, { v: 'json', label: 'json' }], o.output, (v) => { o.output = v as CdxOpts['output']; rebuild(); })),
        ),
        h('div', { class: 'recon-checks' }, checkbox('statuscode:200', o.statusOk, (v) => { o.statusOk = v; rebuild(); })),
        h('div', { class: 'recon-sublabel' }, L({ ru: 'Фильтр по расширению файла (складывается в запрос)', en: 'Filter by file extension (added to the query)' })),
        h('div', { class: 'recon-chips' }, ...CDX_CHIP_EXTS.map((e) => chip(e, o.exts.includes(e), () => {
          o.exts = o.exts.includes(e) ? o.exts.filter((x) => x !== e) : [...o.exts, e];
          rebuild();
        }))),
        h('div', { class: 'recon-sublabel' }, L({ ru: 'Доп. фильтры (необязательно)', en: 'Extra filters (optional)' })),
        h('div', { class: 'recon-row' },
          field(L({ ru: 'MIME-тип', en: 'MIME type' }), textInput(o.mime, L({ ru: 'напр. text/html', en: 'e.g. text/html' }), (v) => { o.mime = v; rebuild(); })),
          field(L({ ru: 'Дата от', en: 'Date from' }), textInput(o.from, 'YYYYMMDD', (v) => { o.from = v; rebuild(); })),
          field(L({ ru: 'Дата до', en: 'Date to' }), textInput(o.to, 'YYYYMMDD', (v) => { o.to = v; rebuild(); })),
          field(L({ ru: 'Лимит строк', en: 'Row limit' }), textInput(o.limit, L({ ru: 'число', en: 'number' }), (v) => { o.limit = v; rebuild(); })),
        ),
      );
    };
    const preset = (label: string, apply: () => void) => {
      const b = h('button', { class: 'recon-preset', type: 'button' }, label);
      b.addEventListener('click', () => { apply(); renderControls(); rebuild(); });
      return b;
    };
    const presets = h('div', { class: 'recon-presets' },
      preset(L({ ru: 'Все URL', en: 'All URLs' }), () => { Object.assign(o, { matchType: 'domain', collapse: 'urlkey', statusOk: false, mime: '', exts: [], from: '', to: '', limit: '' }); }),
      preset(L({ ru: 'Чувствительные файлы', en: 'Sensitive files' }), () => { Object.assign(o, { statusOk: true, collapse: 'urlkey', exts: ['env', 'git', 'sql', 'bak', 'old', 'backup', 'conf', 'config', 'ini', 'yml', 'yaml', 'json', 'xml', 'log', 'zip', 'tar', 'gz'] }); }),
      preset(L({ ru: 'Ключи / секреты', en: 'Keys / secrets' }), () => { Object.assign(o, { statusOk: true, exts: ['pem', 'key', 'crt', 'pfx', 'p12', 'env', 'yml', 'yaml', 'conf', 'config'] }); }),
      preset(L({ ru: 'Исходники / JS', en: 'Source / JS' }), () => { Object.assign(o, { statusOk: true, exts: ['js', 'map', 'json'] }); }),
      preset(L({ ru: 'Документы', en: 'Documents' }), () => { Object.assign(o, { statusOk: true, exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv'] }); }),
    );

    renderControls(); rebuild(); renderRecipes();
    wrap.append(
      intro({ ru: 'Строит запрос к Wayback CDX API для пассивной разведки (архивные URL, забытые эндпоинты, .env/.git). Тул только СТРОИТ запрос, в сеть не ходит.', en: 'Builds a Wayback CDX API query for passive recon (archived URLs, forgotten endpoints, .env/.git). It only ASSEMBLES the query, never touches the network.' }),
      h('div', { class: 'recon-sublabel' }, L({ ru: 'Пресеты — клик заполняет фильтры ниже', en: 'Presets — one click fills the filters below' })),
      presets, controls, urlOut.el, curlOut.el, recipesBox,
    );
    return wrap;
  }

  // =========================================================
  //  Tab 2 — IDN homograph (email ATO / domain / analyze)
  // =========================================================
  function homographTab(): HTMLElement {
    const st = loadJson('hg', { mode: 'email', email: 'victim@gmail.com', domain: 'paypal.com', analyze: 'xn--pypal-4ve.com', sets: CONF_SETS.filter((s) => s.def).map((s) => s.v) as string[] });
    if (!Array.isArray(st.sets)) st.sets = ['cyrillic', 'latin'];
    const wrap = h('div', { class: 'recon-tool' });
    const modeRow = h('div', { class: 'recon-tabs sub' });
    const body = h('div');
    const MODES: { id: string; label: LS }[] = [
      { id: 'email', label: { ru: 'Email ATO (attack)', en: 'Email ATO (attack)' } },
      { id: 'domain', label: { ru: 'Домен', en: 'Domain' } },
      { id: 'analyze', label: { ru: 'Анализ (defensive)', en: 'Analyze (defensive)' } },
    ];
    const renderModes = () => {
      clear(modeRow);
      for (const m of MODES) {
        const b = h('button', { class: 'mode-btn' + (st.mode === m.id ? ' on' : ''), type: 'button' }, L(m.label));
        b.addEventListener('click', () => { st.mode = m.id; saveJson('hg', st); renderModes(); render(); });
        modeRow.append(b);
      }
    };
    const setToggles = (onChange: () => void) => h('div', { class: 'recon-checks' }, ...CONF_SETS.map((s) => checkbox(L(s.label), (st.sets as string[]).includes(s.v), (on) => {
      st.sets = on ? [...st.sets, s.v] : (st.sets as string[]).filter((x) => x !== s.v);
      saveJson('hg', st); onChange();
    })));
    const enabledSets = () => new Set(st.sets as ConfSet[]);

    const workflowPanel = () => {
      const d = h('details', { class: 'recon-workflow' },
        h('summary', null, L({ ru: '☰ Как это эксплуатируется (0-click ATO через email)', en: '☰ How this is exploited (0-click ATO via email)' })));
      const li = (s: LS) => h('li', null, L(s));
      d.append(
        h('ol', { class: 'recon-wf-steps' },
          li({ ru: 'Заменяешь 1 букву email жертвы на двойника: домен gmàil.com ИЛИ username аdmin@target.com.', en: 'Swap one letter of the victim email for a look-alike: domain gmàil.com OR username аdmin@target.com.' }),
          li({ ru: 'Регаешь Unicode-вариант. Ответ «email уже существует» = бэкенд схлопывает его на ASCII-аккаунт жертвы (оракул подтверждён).', en: 'Register the Unicode variant. An "email already exists" reply = the backend folds it onto the victim ASCII account (oracle confirmed).' }),
          li({ ru: 'Жмёшь сброс пароля с Unicode/punycode-адресом. Бэкенд ищет по нормализованной форме → находит жертву, но «To:» берёт из твоего сырого ввода.', en: 'Trigger password reset with the Unicode/punycode address. The backend looks up the normalized form → matches the victim, but composes "To:" from your raw input.' }),
          li({ ru: 'Письмо со сбросом улетает тебе (домен резолвится на твой MX / Burp Collaborator / Interactsh).', en: 'The reset mail is delivered to you (the domain resolves to your MX / Burp Collaborator / Interactsh).' }),
          li({ ru: 'Меняешь пароль → входишь как жертва по ОРИГИНАЛЬНОМУ email. 0-click ATO.', en: 'Reset the password → log in as the victim with the ORIGINAL email. 0-click ATO.' }),
        ),
        h('p', { class: 'recon-wf-note' }, '⚠ ' + L({ ru: 'Браузер сам кодирует Unicode в xn-- перед отправкой → баг не сработает. Инжекти СЫРЫЕ Unicode-байты через Burp Repeater / Interactsh. Пробуй обе формы: сырой Unicode и xn--.', en: 'The browser auto-encodes Unicode to xn-- before sending → the bug won\'t fire. Inject the RAW Unicode bytes via Burp Repeater / Interactsh. Try both forms: raw Unicode and xn--.' })),
        h('p', { class: 'recon-wf-note' }, '🔑 ' + L({ ru: '2FA-байпас: зарегай victim@gmáil.com, настрой СВОЙ 2FA; если приложение схлопнет его на жертву — твой код проходит её второй фактор.', en: '2FA bypass: register victim@gmáil.com, enrol YOUR own 2FA; if the app folds it onto the victim, your code satisfies their second factor.' })),
        h('p', { class: 'recon-wf-fix' }, '🛡 ' + L({ ru: 'Фикс: одна политика нормализации везде (register/login/reset); UNIQUE на канонический ключ с binary-collation; ASCII-only local-part; резать xn--/mixed-script на регистрации.', en: 'Fix: one normalization policy everywhere (register/login/reset); UNIQUE on the canonical key with binary collation; ASCII-only local-part; reject xn-- / mixed-script at signup.' })),
      );
      return d;
    };

    const render = () => {
      clear(body);
      if (st.mode === 'email') {
        const list = h('div', { class: 'recon-variants' });
        const build = () => {
          clear(list);
          const vs = emailHomographs(st.email, enabledSets());
          if (!vs.length) { list.append(h('div', { class: 'recon-empty' }, L({ ru: 'Введи email и выбери набор символов', en: 'Enter an email and pick a character set' }))); return; }
          list.append(h('div', { class: 'recon-vcount' }, vs.length + ' ' + L({ ru: 'вариантов', en: 'variants' })));
          for (const v of vs) {
            const badge = h('span', { class: 'recon-part ' + v.part }, v.part === 'domain' ? 'domain' : 'local');
            const wireEq = v.wire === v.unicode;
            const cp = copyButton(() => v.unicode); cp.classList.add('recon-copy');
            list.append(h('div', { class: 'recon-vrow' },
              h('div', { class: 'recon-vmain' }, badge, uniSpan(v.unicode, v.swapped),
                h('span', { class: 'recon-wire-lbl' }, wireEq ? L({ ru: 'на провод (raw)', en: 'on the wire (raw)' }) : L({ ru: 'на провод', en: 'on the wire' })), h('code', { class: 'recon-puny' }, v.wire)),
              cp,
            ));
          }
        };
        body.append(
          intro({ ru: 'Генерит email-двойники для 0-click ATO: подмена в домене (кодируется в punycode на проводе) ИЛИ в username (остаётся сырым Unicode). Клик по значению = копировать.', en: 'Generates email look-alikes for 0-click ATO: swap in the domain (punycode-encoded on the wire) OR the username (stays raw Unicode). Click a value to copy.' }),
          workflowPanel(),
          h('div', { class: 'recon-row' }, field('email', textInput(st.email, 'victim@gmail.com', (val) => { st.email = val; saveJson('hg', st); build(); }))),
          setToggles(build), list,
        );
        build();
      } else if (st.mode === 'domain') {
        const list = h('div', { class: 'recon-variants' });
        const build = () => {
          clear(list);
          const vs = homographVariants(st.domain, enabledSets());
          if (!vs.length) { list.append(h('div', { class: 'recon-empty' }, L({ ru: 'Нет подходящих символов для замены', en: 'No swappable look-alike letters' }))); return; }
          list.append(h('div', { class: 'recon-vcount' }, vs.length + ' ' + L({ ru: 'вариантов', en: 'variants' })));
          for (const v of vs) {
            const cp = copyButton(() => v.unicode); cp.classList.add('recon-copy');
            list.append(h('div', { class: 'recon-vrow' }, h('div', { class: 'recon-vmain' }, uniSpan(v.unicode, v.swapped), h('code', { class: 'recon-puny' }, v.punycode)), cp));
          }
        };
        body.append(
          intro({ ru: 'Домены-двойники (typosquat / фишинг) с их Punycode (xn--). Клик по значению = копировать.', en: 'Look-alike domains (typosquat / phishing) with their Punycode (xn--). Click a value to copy.' }),
          h('div', { class: 'recon-row' }, field(L({ ru: 'Домен', en: 'Domain' }), textInput(st.domain, 'paypal.com', (val) => { st.domain = val; saveJson('hg', st); build(); }))),
          setToggles(build), list,
        );
        build();
      } else {
        const out = h('div', { class: 'recon-analysis' });
        const run = (input: string) => {
          clear(out);
          if (!input.trim()) return;
          const a = analyzeDomain(input);
          out.append(a.hasUnicode
            ? h('div', { class: 'recon-verdict bad' }, '⚠ ' + L({ ru: 'Найдены не-ASCII символы — возможен homograph/IDN-спуфинг', en: 'Non-ASCII look-alike chars found — possible homograph / IDN spoof' }))
            : h('div', { class: 'recon-verdict ok' }, '✓ ' + L({ ru: 'Только ASCII, подмены не видно', en: 'Pure ASCII, no look-alikes' })));
          const acp = copyButton(() => a.punycode); acp.classList.add('recon-copy');
          out.append(h('div', { class: 'recon-vmain' }, h('span', { class: 'recon-uni' }, ...a.chars.map((c) => h('span', { class: c.ascii ? '' : 'recon-swap' }, c.ch))), h('code', { class: 'recon-puny' }, a.punycode), acp));
          const bad = a.chars.filter((c) => !c.ascii);
          if (bad.length) out.append(h('div', { class: 'recon-charlist' }, ...bad.map((c) =>
            h('div', { class: 'recon-charinfo' }, h('span', { class: 'recon-swap' }, c.ch), ' ' + c.cp, c.mimics ? h('span', { class: 'recon-mimics' }, L({ ru: ' маскируется под ', en: ' mimics ' }) + '"' + c.mimics + '"') : null))));
        };
        body.append(
          intro({ ru: 'Вставь подозрительный домен (unicode или xn--punycode) — декодит и подсвечивает символы-подмены. Punycode считается офлайн.', en: 'Paste a suspicious domain (unicode or xn-- punycode) — decodes it and highlights look-alike chars. Offline.' }),
          h('div', { class: 'recon-row' }, field(L({ ru: 'Домен', en: 'Domain' }), textInput(st.analyze, 'xn--pypal-4ve.com', (val) => { st.analyze = val; saveJson('hg', st); run(val); }))),
          out,
        );
        run(st.analyze);
      }
    };
    renderModes(); render();
    wrap.append(modeRow, body);
    return wrap;
  }

  // =========================================================
  //  Tab 3 — Dork builder (Google family + GitHub + Shodan)
  // =========================================================
  function dorksTab(): HTMLElement {
    const st = loadJson('dork', { domain: 'example.com', engine: 'google' as SearchEngine, cats: ['sensitive-files', 'config-secrets', 'login-admin'] as string[] });
    if (!Array.isArray(st.cats)) st.cats = [];
    const wrap = h('div', { class: 'recon-tool' });
    const body = h('div');

    const CAT_L: Record<string, LS> = {
      'sensitive-files': { ru: 'Файлы / бэкапы', en: 'Files / backups' }, 'dir-listing': { ru: 'Листинг директорий', en: 'Directory listing' },
      'login-admin': { ru: 'Логин / админки', en: 'Login / admin' }, 'config-secrets': { ru: 'Конфиги / секреты', en: 'Config / secrets' },
      'api-docs': { ru: 'API / Swagger', en: 'API / Swagger' }, 'sqli-params': { ru: 'Параметры SQLi', en: 'SQLi params' },
      'xss-params': { ru: 'Параметры XSS', en: 'XSS params' }, 'open-redirect': { ru: 'Open redirect', en: 'Open redirect' },
      'lfi-path': { ru: 'LFI / path', en: 'LFI / path' }, 'ssrf-params': { ru: 'Параметры SSRF', en: 'SSRF params' },
      'errors-debug': { ru: 'Ошибки / отладка', en: 'Errors / debug' }, 'exposed-docs': { ru: 'Документы', en: 'Documents' },
      subdomains: { ru: 'Поддомены', en: 'Subdomains' }, 'cloud-buckets': { ru: 'Облачные бакеты', en: 'Cloud buckets' },
      'thirdparty-leaks': { ru: 'Сторонние утечки', en: 'Third-party leaks' }, 'vcs-exposure': { ru: 'Git / SVN', en: 'Git / SVN' },
      wordpress: { ru: 'WordPress', en: 'WordPress' }, 'apikeys-tokens': { ru: 'Ключи / токены', en: 'API keys / tokens' },
      'dotfiles-ci': { ru: 'Dotfiles / CI', en: 'Dotfiles / CI' }, 'panels-devtools': { ru: 'Панели / dev-тулы', en: 'Panels / devtools' },
    };
    const applyPh = (tpl: string, d: string) => tpl.replaceAll('{D}', d).replaceAll('{ORG}', sldOf(d)).replaceAll('{CIDR}', '{CIDR}');
    const dorkRow = (q: string) => {
      const open = h('a', { class: 'recon-open', href: dorkSearchUrl(st.engine, q), target: '_blank', rel: 'noopener noreferrer' }, L({ ru: 'Открыть', en: 'Open' }));
      const cp = copyButton(() => q); cp.classList.add('recon-copy');
      return h('div', { class: 'recon-dork' }, h('code', { class: 'recon-dorkq' }, q), h('div', { class: 'recon-dorkbtns' }, open, cp));
    };

    const render = () => {
      clear(body);
      const d = st.domain || 'example.com';
      const engineSel = field(L({ ru: 'Движок', en: 'Engine' }), select(
        [{ v: 'google', label: 'Google' }, { v: 'bing', label: 'Bing' }, { v: 'duckduckgo', label: 'DuckDuckGo' }, { v: 'yandex', label: 'Yandex' }, { v: 'github', label: 'GitHub code' }, { v: 'shodan', label: 'Shodan' }],
        st.engine, (v) => { st.engine = v as SearchEngine; saveJson('dork', st); render(); }));
      const domainField = field(L({ ru: 'Домен', en: 'Domain' }), textInput(st.domain, 'example.com', (v) => { st.domain = v; saveJson('dork', st); render(); }));

      if (st.engine === 'github' || st.engine === 'shodan') {
        const dorks = (st.engine === 'github' ? GITHUB_DORKS : SHODAN_DORKS).map((t) => applyPh(t, d));
        body.append(
          intro(st.engine === 'github'
            ? { ru: 'GitHub code-search дорки для утечек, привязанных к домену/орге. {ORG} = второй уровень домена, поправь при нужде. «Открыть» = поиск на GitHub.', en: 'GitHub code-search dorks for leaks tied to the domain/org. {ORG} = the second-level label, adjust as needed. "Open" runs GitHub search.' }
            : { ru: 'Shodan-дорки: пивот домен→хосты через TLS-серт (ssl.cert.subject.CN) и др. У Shodan НЕТ OR — фильтры складываются. {CIDR}/{ORG} поправь.', en: 'Shodan dorks: domain→host pivot via the TLS cert (ssl.cert.subject.CN) etc. Shodan has NO OR — filters AND together. Fix {CIDR}/{ORG}.' }),
          h('div', { class: 'recon-row' }, domainField, engineSel),
          h('div', { class: 'recon-dorklist' }, ...dorks.map(dorkRow)),
        );
        return;
      }

      // Google-family: category chips + assembled dorks + custom builder
      const list = h('div', { class: 'recon-dorklist' });
      const buildList = () => {
        clear(list);
        for (const p of DORK_PRESETS) {
          if (!st.cats.includes(p.id)) continue;
          list.append(h('div', { class: 'recon-dorkcat' }, L(CAT_L[p.id] ?? { ru: p.id, en: p.id })));
          for (const q of p.dorks(d)) list.append(dorkRow(q));
        }
        if (!list.childNodes.length) list.append(h('div', { class: 'recon-empty' }, L({ ru: 'Выбери категории дорков', en: 'Pick dork categories' })));
      };
      const catChips = h('div', { class: 'recon-chips' }, ...DORK_PRESETS.map((p) => chip(L(CAT_L[p.id] ?? { ru: p.id, en: p.id }), st.cats.includes(p.id), () => {
        st.cats = st.cats.includes(p.id) ? st.cats.filter((x) => x !== p.id) : [...st.cats, p.id];
        saveJson('dork', st); buildList();
      })));

      const custom = h('input', { class: 'recon-input recon-custom', type: 'text', value: 'site:' + d + ' ', spellcheck: 'false' }) as HTMLInputElement;
      const customOpen = h('a', { class: 'recon-open', target: '_blank', rel: 'noopener noreferrer' }, L({ ru: 'Открыть', en: 'Open' })) as HTMLAnchorElement;
      const syncCustom = () => { customOpen.href = dorkSearchUrl(st.engine, custom.value); };
      custom.addEventListener('input', syncCustom); syncCustom();
      const ops = h('div', { class: 'recon-ops' }, ...DORK_OPERATORS.map((op) => {
        const b = h('button', { class: 'recon-op', type: 'button' }, op);
        b.addEventListener('click', () => { custom.value = (custom.value.replace(/\s+$/, '') + ' ' + op + (op.endsWith(':') ? '' : ' ')).replace(/^\s+/, ''); custom.focus(); syncCustom(); });
        return b;
      }));
      const customCopy = copyButton(() => custom.value); customCopy.classList.add('recon-copy');

      body.append(
        intro({ ru: 'Дорки для домена. «Открыть» = поиск в выбранном движке (Google — самый богатый по операторам; на Bing/DDG/Yandex часть операторов не работает). Только строит запросы.', en: 'Dorks for a domain. "Open" runs the search in the chosen engine (Google has the richest operators; some don\'t work on Bing/DDG/Yandex). It only builds queries.' }),
        h('div', { class: 'recon-row' }, domainField, engineSel),
        catChips, list,
        h('div', { class: 'recon-sublabel' }, L({ ru: 'Свой дорк', en: 'Custom dork' })), ops,
        h('div', { class: 'recon-dork' }, custom, h('div', { class: 'recon-dorkbtns' }, customOpen, customCopy)),
      );
      buildList();
    };
    render();
    wrap.append(body);
    return wrap;
  }

  // =========================================================
  //  shell
  // =========================================================
  const TABS: { id: string; label: LS; build: () => HTMLElement }[] = [
    { id: 'cdx', label: { ru: 'Wayback CDX', en: 'Wayback CDX' }, build: cdxTab },
    { id: 'homograph', label: { ru: 'IDN Homograph', en: 'IDN Homograph' }, build: homographTab },
    { id: 'dorks', label: { ru: 'Дорки', en: 'Dorks' }, build: dorksTab },
  ];
  let active = rd('tab', 'cdx');
  if (!TABS.some((t) => t.id === active)) active = 'cdx';
  const panel = h('div', { class: 'recon-panel' });
  const tabsRow = h('div', { class: 'recon-tabs' });
  const renderTabs = () => {
    clear(tabsRow);
    for (const tb of TABS) {
      const b = h('button', { class: 'mode-btn' + (tb.id === active ? ' on' : ''), type: 'button' }, L(tb.label));
      b.addEventListener('click', () => { active = tb.id; wr('tab', active); renderTabs(); renderPanel(); });
      tabsRow.append(b);
    }
  };
  const renderPanel = () => { clear(panel); panel.append((TABS.find((t) => t.id === active) ?? TABS[0]!).build()); };

  const scroll = ScrollTop();
  outlet.append(
    h('div', { class: 'content recon-scope' },
      h('div', { class: 'view-head recon-head' }, h('h1', null, 'Recon Tools'), h('div', { class: 'recon-sub' }, L({ ru: 'офлайн-конструкторы разведки', en: 'offline recon crafters' }))),
      tabsRow, panel,
    ),
    scroll.el,
  );
  renderTabs(); renderPanel();
  return () => { scroll.destroy(); };
}
