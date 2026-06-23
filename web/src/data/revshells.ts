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

/** UTF-8 base64. */
function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}
/** UTF-16LE base64 → suitable for `powershell -e`. */
function psB64(s: string): string {
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
