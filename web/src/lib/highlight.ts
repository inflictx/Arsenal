const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const RULES: [RegExp, string][] = [
  [/^<\/?[A-Za-z][\w-]*/, 't-tag'],
  [/^\/?>/, 't-tag'],
  [/^[A-Za-z][\w-]*(?==)/, 't-attr'],
  [/^"[^"]*"|^'[^']*'/, 't-str'],
  [/^(alert|prompt|confirm|eval|document|cookie|domain|location|String|fromCharCode|javascript|onerror|onload)\b/i, 't-fn'],
  [/^\d+/, 't-num'],
  [/^[(){}\[\];:=/*\\.!%\-]+/, 't-punct'],
  [/^\s+/, 'ws'],
];

/** Lightweight single-pass tokenizer for payload/HTML/JS snippets. */
export function highlight(raw: string): string {
  let out = '';
  let s = raw;
  let guard = 0;
  while (s.length && guard++ < 200000) {
    let matched = false;
    for (const [re, cls] of RULES) {
      const m = s.match(re);
      if (m) {
        const t = m[0];
        out += cls === 'ws' ? esc(t) : `<span class="${cls}">${esc(t)}</span>`;
        s = s.slice(t.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      out += esc(s[0]!);
      s = s.slice(1);
    }
  }
  return out + esc(s);
}

export function codeBlock(raw: string, opts: { wrap?: boolean } = {}): HTMLElement {
  const pre = document.createElement('div');
  pre.className = 'code' + (opts.wrap ? ' wrap' : '');
  const code = document.createElement('code');
  if (raw.length > 4000) code.textContent = raw; // skip tokenizer for big blobs
  else code.innerHTML = highlight(raw);
  pre.appendChild(code);
  return pre;
}
