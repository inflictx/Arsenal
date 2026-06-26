// Shared "active target" state: the host + LHOST you set once and reuse across the app.
// Backed by the same localStorage keys and `ars:target` event that Commands / RevShell /
// Engagements already use, so every view stays in sync without a second mechanism.

const LS_TARGET = 'cmd.target';
const LS_LHOST = 'cmd.lhost';

/** Strip scheme + path, leaving just the host (so a pasted URL still substitutes cleanly). */
export const hostOf = (s: string): string => s.replace(/^\w+:\/\//, '').replace(/[/?#].*$/, '').trim();

const read = (k: string): string => { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } };
const write = (k: string, v: string): void => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export const getTarget = (): string => read(LS_TARGET);
export const getLhost = (): string => read(LS_LHOST);

export function setTarget(v: string): void { write(LS_TARGET, v); notify(); }
export function setLhost(v: string): void { write(LS_LHOST, v); notify(); }

function notify(): void { window.dispatchEvent(new CustomEvent('ars:target')); }

/** Subscribe to target/LHOST changes raised from any view. Returns an unsubscribe fn. */
export function onTargetChange(cb: () => void): () => void {
  window.addEventListener('ars:target', cb);
  return () => window.removeEventListener('ars:target', cb);
}

// Placeholders that resolve to the active TARGET / LHOST, by role (verified against seed data):
// example hosts, the bare *_IP words used in payloads, and the HTB-convention IPs. The explicit
// {TARGET}/{LHOST} tokens (emitted by the command builder) are handled separately below.
// NOTE: 1.1.1.1 is intentionally NOT substituted — it is also Cloudflare's public DNS and would mis-fire.
const TARGET_WORDS = ['example.com', 'target.tld', 'target.com', 'target.htb', 'victim.com', 'TARGET_IP', '10.10.10.10'];
const LHOST_WORDS = ['evil.com', 'attacker.com', 'attacker.tld', 'ATTACKER_IP', 'LHOST_IP', '10.10.14.1'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TARGET_RE = new RegExp('\\b(' + TARGET_WORDS.map(escapeRe).join('|') + ')\\b', 'gi');
const LHOST_RE = new RegExp('\\b(' + LHOST_WORDS.map(escapeRe).join('|') + ')\\b', 'gi');
const CURLY_T = /\{TARGET\}/g;
const CURLY_L = /\{LHOST\}/g;

/**
 * Replace target/LHOST placeholders in payload/command text with the active values. Handles the
 * example hosts, the explicit {TARGET}/{LHOST} tokens, the bare *_IP words and the HTB IPs, so
 * substitution behaves the same in every module. Returns the text + whether anything changed.
 */
export function substTarget(text: string): { out: string; changed: boolean } {
  let changed = false;
  let out = text;
  const tgt = hostOf(getTarget());
  const lh = hostOf(getLhost());
  if (tgt) {
    out = out.replace(CURLY_T, () => { changed = true; return tgt; });
    out = out.replace(TARGET_RE, () => { changed = true; return tgt; });
  }
  if (lh) {
    out = out.replace(CURLY_L, () => { changed = true; return lh; });
    out = out.replace(LHOST_RE, () => { changed = true; return lh; });
  }
  return { out, changed };
}
