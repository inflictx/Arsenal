// Helpers for the Reverse Shell view. The shell/listener DATA comes from rsg-data.js
// (a verbatim copy of 0dayCTF/reverse-shell-generator's js/data.js).

export type Encoding = 'none' | 'b64' | 'url' | 'durl';
export const ENCODINGS: { id: Encoding; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'b64', label: 'Base64' },
  { id: 'url', label: 'URL' },
  { id: 'durl', label: 'Double URL' },
];

/** Substitute {ip} {port} {shell} (and the rare {name}) placeholders. */
export function fmt(t: string, v: { ip: string; port: string; shell: string }): string {
  return t.split('{ip}').join(v.ip).split('{port}').join(v.port).split('{shell}').join(v.shell).split('{name}').join(v.shell);
}

const toHex = (n: number) => '\\x' + (n & 0xff).toString(16).padStart(2, '0');
/** dotted-quad IP -> its 4 network-order bytes as a literal \xNN run (e.g. 10.10.14.1 -> \x0a\x0a\x0e\x01). */
function ipBytes(ip: string): string {
  const p = ip.split('.').map((x) => parseInt(x, 10));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return ip; // not a dotted-quad: leave as-is
  return p.map(toHex).join('');
}
/** port -> 2 network-order (big-endian) bytes as \xNN\xNN (e.g. 4444 -> \x11\x5c). */
function portBytes(port: string): string {
  const n = parseInt(port, 10);
  if (!Number.isInteger(n) || n < 0 || n > 65535) return port;
  return toHex((n >> 8) & 0xff) + toHex(n & 0xff);
}
/** Assembled shellcode keeps {ip}/{port} INSIDE the \xNN byte run, so they must be substituted as
 *  network-order bytes, not ASCII. A plain string replace would emit "10.10.14.1"/"4444" as text. */
export function fmtAssembled(t: string, ip: string, port: string): string {
  return t.split('{ip}').join(ipBytes(ip)).split('{port}').join(portBytes(port));
}

/** UTF-8 base64. */
function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
/** UTF-16LE base64 → suitable for `powershell -e`. */
export function psB64(s: string): string {
  let bin = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    bin += String.fromCharCode(c & 0xff, (c >> 8) & 0xff);
  }
  return btoa(bin);
}

export function applyEncoding(cmd: string, enc: Encoding, isPowershell: boolean): string {
  switch (enc) {
    case 'url': return encodeURIComponent(cmd);
    case 'durl': return encodeURIComponent(encodeURIComponent(cmd));
    case 'b64': return isPowershell ? `powershell -e ${psB64(cmd)}` : b64(cmd);
    default: return cmd;
  }
}
