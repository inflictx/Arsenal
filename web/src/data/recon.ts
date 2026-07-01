// Pure, offline logic for the Recon Tools view. No network at runtime: every function only
// ASSEMBLES a URL / query / command the user runs themselves, or does local Punycode math.
// Content researched + verified (CDX semantics vs the wayback CDX source; confusable code points
// and xn-- examples vs Python unicodedata/punycode; dork operators vs each engine's current docs).

// ============================================================
//  Shared
// ============================================================

/** Strip scheme, path, whitespace and a trailing dot; lowercase. Keeps a leading www. */
export function cleanDomain(input: string): string {
  return input
    .trim()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
    .toLowerCase();
}

// ============================================================
//  1. Wayback Machine CDX API query builder
// ============================================================

export const CDX_BASE = 'https://web.archive.org/cdx/search/cdx';

export interface CdxOpts {
  domain: string;
  matchType: 'exact' | 'prefix' | 'host' | 'domain';
  collapse: string; // '', 'urlkey', 'digest', 'timestamp:8' ...
  fl: string;
  output: 'text' | 'json';
  statusOk: boolean; // filter=statuscode:200
  mime: string;
  exts: string[]; // -> filter=original:.*\.(a|b)(\?.*)?$   (CDX filter is FULL-FIELD anchored)
  from: string;
  to: string;
  limit: string;
}

export const CDX_DEFAULTS: CdxOpts = {
  domain: 'example.com', matchType: 'domain', collapse: 'urlkey', fl: 'original',
  output: 'text', statusOk: false, mime: '', exts: [], from: '', to: '', limit: '',
};

export function buildCdxParams(o: CdxOpts): [string, string][] {
  const p: [string, string][] = [];
  p.push(['url', (o.domain || 'example.com').trim()]);
  p.push(['matchType', o.matchType]);
  if (o.collapse) p.push(['collapse', o.collapse]);
  if (o.fl.trim()) p.push(['fl', o.fl.trim()]);
  p.push(['output', o.output]);
  if (o.statusOk) p.push(['filter', 'statuscode:200']);
  if (o.mime.trim()) p.push(['filter', 'mimetype:' + o.mime.trim()]);
  const exts = o.exts.map((e) => e.replace(/^\./, '').trim()).filter(Boolean);
  // full-field anchored regex; tolerate a ?query tail
  if (exts.length) p.push(['filter', 'original:.*\\.(' + exts.join('|') + ')(\\?.*)?$']);
  if (o.from.trim()) p.push(['from', o.from.trim()]);
  if (o.to.trim()) p.push(['to', o.to.trim()]);
  if (o.limit.trim()) p.push(['limit', o.limit.trim()]);
  return p;
}

export function buildCdxUrl(o: CdxOpts): string {
  const qs = buildCdxParams(o).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
  return CDX_BASE + '?' + qs;
}

export function buildCdxCurl(o: CdxOpts): string {
  const params = buildCdxParams(o);
  const lines = ['curl -fsS -A "ARS3NAL-recon/1.0" -G "' + CDX_BASE + '" \\'];
  params.forEach(([k, v]) => lines.push('  --data-urlencode "' + k + '=' + v + '" \\'));
  lines.push('  | sort -u');
  return lines.join('\n');
}

// Full "juicy file" extension catalogue (configs, backups, secrets/keys, dbs, archives, docs, source).
export const CDX_JUICY_EXTS = [
  'zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'iso', 'war', 'jar', 'apk',
  'bak', 'old', 'backup', 'bkp', 'swp', 'save', 'tmp', 'orig',
  'sql', 'db', 'sqlite', 'sqlite3', 'dbf', 'mdb', 'dump',
  'conf', 'config', 'cfg', 'ini', 'env', 'yml', 'yaml', 'toml', 'properties',
  'htpasswd', 'htaccess', 'netrc', 'npmrc',
  'pem', 'key', 'ppk', 'crt', 'pfx', 'p12', 'jks', 'keystore', 'ovpn', 'asc',
  'log', 'xls', 'xlsx', 'csv', 'doc', 'docx', 'pdf',
  'json', 'xml', 'wsdl', 'inc', 'map', 'git', 'svn', 'DS_Store',
];

// The compact set surfaced as toggle chips (a readable subset of the catalogue).
export const CDX_CHIP_EXTS = [
  'env', 'git', 'sql', 'bak', 'old', 'backup', 'zip', 'tar', 'gz', 'json',
  'yml', 'yaml', 'config', 'conf', 'ini', 'log', 'xml', 'pem', 'key', 'crt',
  'pfx', 'db', 'sqlite', 'csv', 'xls', 'xlsx', 'pdf', 'doc', 'js', 'map',
];

// Post-harvest recipes (the user runs these). {D} = target domain.
export interface CdxRecipe { id: string; cmd: (d: string) => string; }
export const CDX_RECIPES: CdxRecipe[] = [
  { id: 'harvest', cmd: (d) => `# passive URL harvest (merge multiple sources for coverage)\ngau --subs ${d} | tee gau.txt\necho ${d} | waybackurls | tee wb.txt\nsort -u gau.txt wb.txt -o all_urls.txt` },
  { id: 'subs', cmd: (d) => `# just the unique subdomains from the archive\ncurl -s "https://web.archive.org/cdx/search/cdx?url=*.${d}/*&output=text&fl=original&collapse=urlkey" \\\n  | sed -e 's_https*://__' -e 's/\\/.*//' -e 's/:.*//' | sort -u` },
  { id: 'juicy', cmd: (d) => `# grep archived URLs for sensitive files\ngau --subs ${d} | grep -iE '\\.(zip|rar|tar\\.gz|tgz|gz|7z|sql|db|sqlite3?|bak|old|backup|swp|conf|config|ini|env|ya?ml|toml|pem|key|p12|pfx|jks|log|json|xml|xlsx?|docx?|pdf|inc|git|svn|map|DS_Store)(\\?|$)' | sort -u` },
  { id: 'params', cmd: (d) => `# URLs that carry parameters (dedup with uro), then unique param names\ngau --subs ${d} | uro | grep -E '\\?[^ ]+=' | sort -u > params.txt\ngrep -oE '[?&][a-zA-Z0-9_.\\[\\]-]+=' params.txt | tr -d '?&=' | sort -u > param_names.txt` },
  { id: 'gf', cmd: (d) => `# classify URLs by bug class with gf (install 1ndianl33t/Gf-Patterns)\ngau --subs ${d} | uro > urls.txt\nfor p in xss sqli ssrf lfi redirect rce idor ssti; do gf $p < urls.txt | sort -u > gf_$p.txt; done` },
  { id: 'raw', cmd: (d) => `# recover a DELETED file's raw bytes (no Wayback toolbar / no rewriting) via the id_ modifier\n# 1) find a snapshot timestamp:\ncurl -s "https://web.archive.org/cdx/search/cdx?url=${d}/config.js&fl=timestamp,original&collapse=digest&output=text"\n# 2) fetch it raw (replace <TS>):\ncurl -s "https://web.archive.org/web/<TS>id_/https://${d}/config.js"` },
  { id: 'robots', cmd: (d) => `# historical robots.txt versions (reveals old Disallow'd paths); collapse=digest = only when content changed\ncurl -s "https://web.archive.org/cdx/search/cdx?url=${d}/robots.txt&fl=timestamp,original,statuscode&collapse=digest&output=text"` },
  { id: 'pdf', cmd: (_d) => `# after downloading archived PDFs (via id_), scan them for secrets\nfor f in *.pdf; do echo "== $f =="; pdftotext "$f" - 2>/dev/null \\\n  | grep -iE 'pass(word|wd)?|secret|api[_-]?key|token|BEGIN (RSA|EC|OPENSSH|PGP)? ?PRIVATE|confidential|internal[_ -]?only'; done` },
];

// ============================================================
//  2. IDN homograph generator / analyzer + email-ATO
// ============================================================

export type ConfSet = 'cyrillic' | 'greek' | 'latin' | 'armenian' | 'fullwidth';
export interface Confusable { ch: string; set: ConfSet; }

// Latin/digit -> visually-confusable single code points (length-preserving so swaps stay aligned).
// 'fullwidth' is NOT listed here — it is computed systematically (cp + 0xFEE0). Curated to strong
// look-alikes; weak letters (m/r/z) rely on latin-accent / fullwidth toggles.
export const CONFUSABLES: Record<string, Confusable[]> = {
  a: [{ ch: 'а', set: 'cyrillic' }, { ch: 'α', set: 'greek' }, { ch: 'à', set: 'latin' }],
  b: [{ ch: 'Ь', set: 'cyrillic' }, { ch: 'ƅ', set: 'latin' }],
  c: [{ ch: 'с', set: 'cyrillic' }, { ch: 'ϲ', set: 'greek' }, { ch: 'ç', set: 'latin' }],
  d: [{ ch: 'ԁ', set: 'cyrillic' }, { ch: 'ɗ', set: 'latin' }],
  e: [{ ch: 'е', set: 'cyrillic' }, { ch: 'é', set: 'latin' }],
  f: [{ ch: 'ƒ', set: 'latin' }],
  g: [{ ch: 'ɡ', set: 'latin' }, { ch: 'ց', set: 'armenian' }],
  h: [{ ch: 'һ', set: 'cyrillic' }, { ch: 'հ', set: 'armenian' }],
  i: [{ ch: 'і', set: 'cyrillic' }, { ch: 'ι', set: 'greek' }, { ch: 'í', set: 'latin' }],
  j: [{ ch: 'ј', set: 'cyrillic' }, { ch: 'ϳ', set: 'greek' }],
  k: [{ ch: 'к', set: 'cyrillic' }, { ch: 'κ', set: 'greek' }],
  l: [{ ch: 'ӏ', set: 'cyrillic' }, { ch: 'ł', set: 'latin' }],
  m: [{ ch: 'м', set: 'cyrillic' }],
  n: [{ ch: 'ո', set: 'armenian' }, { ch: 'ñ', set: 'latin' }],
  o: [{ ch: 'о', set: 'cyrillic' }, { ch: 'ο', set: 'greek' }, { ch: 'ó', set: 'latin' }, { ch: 'օ', set: 'armenian' }],
  p: [{ ch: 'р', set: 'cyrillic' }, { ch: 'ρ', set: 'greek' }],
  q: [{ ch: 'ԛ', set: 'cyrillic' }],
  r: [{ ch: 'г', set: 'cyrillic' }, { ch: 'ŕ', set: 'latin' }],
  s: [{ ch: 'ѕ', set: 'cyrillic' }, { ch: 'ś', set: 'latin' }],
  t: [{ ch: 'τ', set: 'greek' }],
  u: [{ ch: 'υ', set: 'greek' }, { ch: 'ս', set: 'armenian' }, { ch: 'ú', set: 'latin' }],
  v: [{ ch: 'ν', set: 'greek' }, { ch: 'ѵ', set: 'cyrillic' }],
  w: [{ ch: 'ԝ', set: 'cyrillic' }, { ch: 'ѡ', set: 'cyrillic' }],
  x: [{ ch: 'х', set: 'cyrillic' }, { ch: 'χ', set: 'greek' }],
  y: [{ ch: 'у', set: 'cyrillic' }, { ch: 'γ', set: 'greek' }, { ch: 'ý', set: 'latin' }],
  z: [{ ch: 'ż', set: 'latin' }],
  '0': [{ ch: 'о', set: 'cyrillic' }, { ch: 'ο', set: 'greek' }],
  '1': [{ ch: 'Ӏ', set: 'cyrillic' }],
  '3': [{ ch: 'З', set: 'cyrillic' }],
  '6': [{ ch: 'б', set: 'cyrillic' }],
};

const REVERSE_CONF: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const [latin, list] of Object.entries(CONFUSABLES)) for (const c of list) m[c.ch] = latin;
  return m;
})();

function fullwidthTwin(ch: string): string | null {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return null;
  if ((cp >= 0x61 && cp <= 0x7a) || (cp >= 0x30 && cp <= 0x39) || (cp >= 0x41 && cp <= 0x5a)) return String.fromCodePoint(cp + 0xfee0);
  return null;
}

export function toPunycode(domain: string): string {
  try { return new URL('http://' + cleanDomain(domain) + '/').hostname; } catch { return domain; }
}

interface RawVariant { str: string; swapped: number[]; sets: ConfSet[]; }

/** Generate single-swap + one maximal variant of a label. skipTld leaves the last dotted label alone. */
function genVariants(input: string, enabled: Set<ConfSet>, skipTld: boolean, cap: number): RawVariant[] {
  const s = input.toLowerCase();
  const chars = [...s];
  const lastDot = s.lastIndexOf('.');
  const bound = skipTld && lastDot > 0 ? lastDot : chars.length;
  const repl = (ch: string): Confusable[] => {
    const list: Confusable[] = [];
    for (const c of CONFUSABLES[ch] ?? []) if (enabled.has(c.set)) list.push(c);
    if (enabled.has('fullwidth')) { const fw = fullwidthTwin(ch); if (fw) list.push({ ch: fw, set: 'fullwidth' }); }
    return list;
  };
  const out: RawVariant[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < bound && out.length < cap; i++) {
    for (const c of repl(chars[i]!)) {
      const copy = chars.slice(); copy[i] = c.ch; const str = copy.join('');
      if (str !== s && !seen.has(str)) { seen.add(str); out.push({ str, swapped: [i], sets: [c.set] }); }
      if (out.length >= cap) break;
    }
  }
  const mx = chars.slice(); const mxsw: number[] = []; const mxset = new Set<ConfSet>();
  for (let i = 0; i < bound; i++) { const r = repl(chars[i]!)[0]; if (r) { mx[i] = r.ch; mxsw.push(i); mxset.add(r.set); } }
  if (mxsw.length > 1) { const str = mx.join(''); if (str !== s && !seen.has(str)) { seen.add(str); out.push({ str, swapped: mxsw, sets: [...mxset] }); } }
  return out;
}

export interface Variant { unicode: string; punycode: string; swapped: number[]; sets: ConfSet[]; }
export function homographVariants(domain: string, enabled: Set<ConfSet>, cap = 60): Variant[] {
  return genVariants(cleanDomain(domain), enabled, true, cap).map((v) => ({ unicode: v.str, punycode: toPunycode(v.str), swapped: v.swapped, sets: v.sets }));
}

// Email 0-click ATO: swap the domain part (punycode-encoded on the wire) OR the local part (stays raw UTF-8).
export interface EmailVariant { unicode: string; wire: string; part: 'local' | 'domain'; swapped: number[]; sets: ConfSet[]; }
export function emailHomographs(email: string, enabled: Set<ConfSet>, cap = 60): EmailVariant[] {
  const at = email.lastIndexOf('@');
  if (at < 1 || at === email.length - 1) return [];
  const local = email.slice(0, at).toLowerCase();
  const domain = cleanDomain(email.slice(at + 1));
  const half = Math.max(6, Math.floor(cap / 2));
  const out: EmailVariant[] = [];
  // domain-part: email shows unicode domain; the ON-THE-WIRE form punycode-encodes the domain label
  for (const v of genVariants(domain, enabled, true, half)) {
    const off = local.length + 1;
    out.push({ unicode: local + '@' + v.str, wire: local + '@' + toPunycode(v.str), part: 'domain', swapped: v.swapped.map((i) => i + off), sets: v.sets });
  }
  // local-part: local stays raw Unicode (SMTPUTF8), domain unchanged ASCII -> wire == unicode
  for (const v of genVariants(local, enabled, false, half)) {
    out.push({ unicode: v.str + '@' + domain, wire: v.str + '@' + domain, part: 'local', swapped: v.swapped, sets: v.sets });
  }
  return out;
}

// --- RFC 3492 Punycode decode (for the analyzer: xn--... -> unicode) ---
function punycodeDecodeLabel(input: string): string {
  const base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128;
  const basicToDigit = (cp: number): number => {
    if (cp - 0x30 < 0x0a) return cp - 0x16;
    if (cp - 0x41 < 0x1a) return cp - 0x41;
    if (cp - 0x61 < 0x1a) return cp - 0x61;
    return base;
  };
  const adapt = (delta: number, numPoints: number, firstTime: boolean): number => {
    delta = firstTime ? Math.floor(delta / damp) : delta >> 1;
    delta += Math.floor(delta / numPoints);
    let k = 0;
    for (; delta > ((base - tmin) * tmax) >> 1; k += base) delta = Math.floor(delta / (base - tmin));
    return Math.floor(k + ((base - tmin + 1) * delta) / (delta + skew));
  };
  const output: number[] = [];
  let idx = input.lastIndexOf('-');
  if (idx < 0) idx = 0;
  for (let j = 0; j < idx; j++) output.push(input.charCodeAt(j));
  let i = 0, n = initialN, bias = initialBias;
  let pos = idx > 0 ? idx + 1 : 0;
  while (pos < input.length) {
    const oldi = i;
    for (let w = 1, k = base; ; k += base) {
      if (pos >= input.length) throw new Error('punycode: truncated');
      const digit = basicToDigit(input.charCodeAt(pos++));
      if (digit >= base) throw new Error('punycode: bad digit');
      i += digit * w;
      const t = k <= bias ? tmin : k >= bias + tmax ? tmax : k - bias;
      if (digit < t) break;
      w *= base - t;
    }
    const outLen = output.length + 1;
    bias = adapt(i - oldi, outLen, oldi === 0);
    n += Math.floor(i / outLen);
    i %= outLen;
    output.splice(i, 0, n);
    i++;
  }
  return String.fromCodePoint(...output);
}

export function decodeIdna(domain: string): string {
  return cleanDomain(domain)
    .split('.')
    .map((lbl) => { if (!/^xn--/i.test(lbl)) return lbl; try { return punycodeDecodeLabel(lbl.slice(4)); } catch { return lbl; } })
    .join('.');
}

export interface CharInfo { ch: string; ascii: boolean; cp: string; mimics: string | null; }
export interface Analysis { unicode: string; punycode: string; hasUnicode: boolean; chars: CharInfo[] }
export function analyzeDomain(input: string): Analysis {
  const unicode = decodeIdna(input);
  const chars: CharInfo[] = [...unicode].map((ch) => {
    const cp = ch.codePointAt(0)!;
    const ascii = cp < 0x80;
    return { ch, ascii, cp: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'), mimics: ascii ? null : REVERSE_CONF[ch] ?? null };
  });
  return { unicode, punycode: toPunycode(unicode), hasUnicode: chars.some((c) => !c.ascii), chars };
}

// ============================================================
//  3. Search-engine dork builder (Google + GitHub + Shodan)
// ============================================================

export type SearchEngine = 'google' | 'bing' | 'duckduckgo' | 'yandex' | 'github' | 'shodan';

export function dorkSearchUrl(engine: SearchEngine, query: string): string {
  const q = encodeURIComponent(query);
  switch (engine) {
    case 'bing': return 'https://www.bing.com/search?q=' + q;
    case 'duckduckgo': return 'https://duckduckgo.com/?q=' + q;
    case 'yandex': return 'https://yandex.com/search/?text=' + q;
    case 'github': return 'https://github.com/search?type=code&q=' + q;
    case 'shodan': return 'https://www.shodan.io/search?query=' + q;
    case 'google':
    default: return 'https://www.google.com/search?q=' + q;
  }
}

export interface DorkPreset { id: string; dorks: (d: string) => string[]; }

// Google-syntax presets. `|` = OR, wrapped in ( ) so the site: scope applies to every alternative.
// (cache:/related:/link: are dead on Google and intentionally absent.)
export const DORK_PRESETS: DorkPreset[] = [
  { id: 'sensitive-files', dorks: (d) => [
    `site:${d} (ext:bak | ext:old | ext:backup | ext:swp | ext:save | ext:tmp)`,
    `site:${d} (ext:zip | ext:rar | ext:7z | ext:gz | ext:tgz | ext:tar)`,
    `site:${d} (ext:sql | ext:db | ext:dbf | ext:sqlite | ext:dump)`,
  ] },
  { id: 'dir-listing', dorks: (d) => [`site:${d} intitle:"index of /"`, `site:${d} intitle:"index of" (backup | dump | ".sql" | ".bak" | ".git")`] },
  { id: 'login-admin', dorks: (d) => [
    `site:${d} (inurl:admin | inurl:administrator | inurl:adminpanel | inurl:admin/login)`,
    `site:${d} (inurl:login | inurl:signin | inurl:auth | inurl:portal | inurl:dashboard | inurl:cpanel)`,
  ] },
  { id: 'config-secrets', dorks: (d) => [
    `site:${d} (ext:env | ext:ini | ext:conf | ext:cnf | ext:cfg | ext:properties)`,
    `site:${d} (ext:yml | ext:yaml | ext:json) (intext:password | intext:secret | intext:token)`,
    `site:${d} (ext:xml | ext:cnf | ext:rdp | ext:ora) intext:password`,
  ] },
  { id: 'api-docs', dorks: (d) => [
    `site:${d} (inurl:swagger | inurl:"swagger-ui.html" | inurl:api-docs | inurl:openapi.json)`,
    `site:${d} (inurl:graphql | inurl:graphiql | inurl:playground | ext:wsdl)`,
  ] },
  { id: 'sqli-params', dorks: (d) => [
    `site:${d} (inurl:"index.php?id=" | inurl:"page.php?id=" | inurl:"view.php?id=")`,
    `site:${d} (inurl:"?id=" | inurl:"pid=" | inurl:"cat=" | inurl:"item=") ext:php`,
  ] },
  { id: 'xss-params', dorks: (d) => [`site:${d} (inurl:"q=" | inurl:"s=" | inurl:"search=" | inurl:"query=" | inurl:"keyword=" | inurl:"name=" | inurl:"message=")`] },
  { id: 'open-redirect', dorks: (d) => [
    `site:${d} (inurl:"redirect=" | inurl:"redir=" | inurl:"url=" | inurl:"return=" | inurl:"next=")`,
    `site:${d} (inurl:"redirect_uri=" | inurl:"returnUrl=" | inurl:"goto=" | inurl:"dest=" | inurl:"continue=" | inurl:"rurl=")`,
  ] },
  { id: 'lfi-path', dorks: (d) => [`site:${d} (inurl:"file=" | inurl:"page=" | inurl:"path=" | inurl:"include=" | inurl:"dir=" | inurl:"doc=" | inurl:"template=" | inurl:"lang=")`] },
  { id: 'ssrf-params', dorks: (d) => [
    `site:${d} (inurl:"url=" | inurl:"uri=" | inurl:"dest=" | inurl:"proxy=" | inurl:"fetch=" | inurl:"host=")`,
    `site:${d} (inurl:"image=" | inurl:"callback=" | inurl:"webhook=" | inurl:"feed=" | inurl:"domain=" | inurl:"target=")`,
  ] },
  { id: 'errors-debug', dorks: (d) => [
    `site:${d} (intext:"Warning: mysql_" | intext:"You have an error in your SQL syntax")`,
    `site:${d} (intext:"Fatal error" | intext:"Uncaught exception" | intext:"Stack trace:" | intext:"Symfony Profiler" | intext:"DEBUG = True")`,
  ] },
  { id: 'exposed-docs', dorks: (d) => [
    `site:${d} (ext:pdf | ext:doc | ext:docx | ext:xls | ext:xlsx | ext:ppt | ext:pptx | ext:csv)`,
    `site:${d} ext:pdf (intext:"confidential" | intext:"internal use only" | intext:"do not distribute")`,
  ] },
  { id: 'subdomains', dorks: (d) => [`site:*.${d} -www`, `site:*.${d} -www -mail -shop -blog -support`, `site:*.*.${d}`] },
  { id: 'cloud-buckets', dorks: (d) => [
    `"${d}" (site:s3.amazonaws.com | site:storage.googleapis.com | site:blob.core.windows.net | site:digitaloceanspaces.com)`,
    `intitle:"index of" "${d}" (site:s3.amazonaws.com | site:digitaloceanspaces.com)`,
  ] },
  { id: 'thirdparty-leaks', dorks: (d) => [
    `"${d}" (site:pastebin.com | site:ghostbin.com | site:controlc.com | site:rentry.co)`,
    `"${d}" (site:trello.com | site:jsfiddle.net | site:codepen.io | site:jsbin.com)`,
    `"${d}" (site:gist.github.com | site:gitlab.com | site:documenter.getpostman.com | site:*.atlassian.net)`,
  ] },
  { id: 'vcs-exposure', dorks: (d) => [
    `site:${d} (inurl:".git" | inurl:"/.git/config" | inurl:"/.git/HEAD")`,
    `site:${d} (inurl:"/.svn/" | inurl:".hg" | inurl:".DS_Store")`,
  ] },
  { id: 'wordpress', dorks: (d) => [
    `site:${d} (inurl:wp-content | inurl:wp-includes | inurl:"/wp-json/" | inurl:xmlrpc.php)`,
    `site:${d} (inurl:"wp-config.php.bak" | inurl:"wp-config.php~" | ext:bak inurl:wp-config)`,
  ] },
  { id: 'apikeys-tokens', dorks: (d) => [
    `site:${d} (intext:"api_key" | intext:"apikey" | intext:"client_secret" | intext:"access_token")`,
    `site:${d} (intext:"aws_access_key_id" | intext:"AKIA" | intext:"authorization: Bearer" | intext:"ghp_" | intext:"xoxb-")`,
    `site:${d} (intext:"-----BEGIN RSA PRIVATE KEY-----" | intext:"-----BEGIN OPENSSH PRIVATE KEY-----")`,
  ] },
  { id: 'dotfiles-ci', dorks: (d) => [
    `site:${d} (inurl:".env" | inurl:".aws" | inurl:".npmrc" | inurl:".dockercfg" | inurl:".netrc")`,
    `site:${d} (inurl:".gitlab-ci.yml" | inurl:".travis.yml" | inurl:"Jenkinsfile" | inurl:"docker-compose.yml")`,
    `site:${d} (inurl:".htaccess" | inurl:".htpasswd" | inurl:"web.config" | inurl:".well-known/security.txt")`,
  ] },
  { id: 'panels-devtools', dorks: (d) => [
    `site:${d} (inurl:phpmyadmin | intitle:"phpMyAdmin" | inurl:adminer.php | intitle:"phpinfo()")`,
    `site:${d} (intitle:"Dashboard [Jenkins]" | intitle:"Grafana" | intitle:"Kibana" | intitle:"Argo CD")`,
    `site:${d} (inurl:actuator | inurl:"actuator/env" | inurl:"/metrics" | inurl:server-status)`,
  ] },
];

// GitHub code-search (new grammar: "quoted" literal, path: glob, AND/OR/NOT). {D} = domain, {ORG} = org.
export const GITHUB_DORKS = [
  `"{D}" (path:*.env OR path:*.yml OR path:*.yaml OR path:*.json OR path:*.properties)`,
  `"{D}" (password OR passwd OR pwd OR secret OR credentials)`,
  `"{D}" (api_key OR apikey OR "api key" OR access_token OR client_secret)`,
  `"{D}" (aws_access_key_id OR aws_secret_access_key OR AKIA)`,
  `"{D}" "BEGIN RSA PRIVATE KEY"`,
  `"{D}" (connectionstring OR "Data Source=" OR "Initial Catalog=" OR "Server=")`,
  `"{D}" (internal OR staging OR "internal use") (path:*.md OR path:*.conf OR path:*.txt)`,
  `"{D}" (smtp OR sendgrid OR mailgun OR twilio OR slack) (token OR key OR password)`,
  `org:{ORG} path:.env`,
  `org:{ORG} (path:*.pem OR path:*.ppk OR path:id_rsa OR path:*.key OR path:*.pfx)`,
];

// Shodan (no OR operator — every filter ANDs). {D} = domain, {ORG}/{CIDR} = org / IP range.
export const SHODAN_DORKS = [
  `ssl.cert.subject.CN:"{D}"`,
  `ssl:"{D}"`,
  `ssl.cert.subject.CN:"{D}" http.status:200`,
  `hostname:"{D}"`,
  `ssl:"{D}" http.title:"login"`,
  `ssl:"{D}" http.title:"index of"`,
  `ssl:"{D}" http.html:"password"`,
  `ssl:"{D}" port:9200`,
  `ssl:"{D}" product:"MongoDB"`,
  `org:"{ORG}"`,
  `net:{CIDR}`,
  `ssl.cert.expired:true ssl:"{D}"`,
];

export const DORK_OPERATORS = ['site:', 'inurl:', 'intitle:', 'intext:', 'ext:', 'filetype:', '-', 'OR'] as const;
