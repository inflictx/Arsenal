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

// Example hosts that appear in curated payloads, grouped by role (verified against seed/curated).
const TARGET_HOSTS = ['example.com', 'target.tld', 'target.com', 'target.htb', 'victim.com'];
const LHOST_HOSTS = ['evil.com', 'attacker.com', 'attacker.tld'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TARGET_RE = new RegExp('\\b(' + TARGET_HOSTS.map(escapeRe).join('|') + ')\\b', 'gi');
const LHOST_RE = new RegExp('\\b(' + LHOST_HOSTS.map(escapeRe).join('|') + ')\\b', 'gi');

/**
 * Replace example hosts in payload text with the active TARGET / LHOST.
 * Returns the rewritten text and whether anything changed (drives a small UI hint).
 */
export function substTarget(text: string): { out: string; changed: boolean } {
  let changed = false;
  let out = text;
  const tgt = hostOf(getTarget());
  const lh = hostOf(getLhost());
  if (tgt) out = out.replace(TARGET_RE, () => { changed = true; return tgt; });
  if (lh) out = out.replace(LHOST_RE, () => { changed = true; return lh; });
  return { out, changed };
}
