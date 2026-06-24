import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const CHECKLIST_DIR = join(here, '..', 'checklists');

// Source batches: (operational file, research file, sort offset). Append more batches here.
const BATCHES = [
  { op: 'operational.md', re: 'research.md', base: 0 },
  { op: 'operational-part2.md', re: 'research-part2.md', base: 100 },
  { op: 'operational-part3.md', re: 'research-part3.md', base: 200 },
];

export interface ChecklistItem { key: string; text: string; }
export interface ChecklistSection { name: string; items: ChecklistItem[]; }
export interface ParsedChecklist {
  slug: string;
  title: string;
  category: string | null;
  sort: number;
  sections: ChecklistSection[];
  research: string;
}

/** Stable per-item key = "<slug>#<fnv1a(slug|text)>" — survives reorder & re-seed. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
function itemKey(slug: string, text: string): string {
  return `${slug}#${fnv1a(slug + '|' + text)}`;
}

/** Title (от любого документа) → каноничный slug. Порядок важен: nosql до sql, ssrf≠csrf, orm leak — полная фраза. */
const SLUG_RULES: [string[], string][] = [
  // batch 1 (24)
  [['nosql'], 'nosql'],
  [['sql injection', 'sqli'], 'sql-injection'],
  [['template injection', 'ssti'], 'ssti'],
  [['cross-site scripting', 'xss injection', 'xss'], 'xss'],
  [['server-side request forgery', 'ssrf'], 'ssrf'],
  [['cross-site request forgery', 'csrf'], 'csrf'],
  [['direct object', 'idor', 'bola'], 'idor'],
  [['command injection'], 'command-injection'],
  [['file inclusion', 'lfi', 'rfi'], 'file-inclusion'],
  [['xxe'], 'xxe'],
  [['deserialization'], 'insecure-deserialization'],
  [['json web token', 'jwt'], 'jwt'],
  [['oauth'], 'oauth'],
  [['account takeover'], 'account-takeover'],
  [['business logic'], 'business-logic'],
  [['race condition'], 'race-condition'],
  [['cors'], 'cors'],
  [['open redirect'], 'open-redirect'],
  [['request smuggling', 'desync'], 'request-smuggling'],
  [['graphql'], 'graphql'],
  [['prototype pollution'], 'prototype-pollution'],
  [['mass assignment'], 'mass-assignment'],
  [['web cache'], 'web-cache'],
  // batch 2 (39)
  [['api key'], 'api-key-leaks'],
  [['brute force', 'rate limit'], 'brute-force'],
  [['clickjacking'], 'clickjacking'],
  [['client side path traversal', 'client-side path traversal', 'cspt'], 'cspt'],
  [['crlf'], 'crlf'],
  [['css injection'], 'css-injection'],
  [['csv injection', 'formula injection'], 'csv-injection'],
  [['cve exploits'], 'cve-exploits'],
  [['dns rebinding', 'rebinding'], 'dns-rebinding'],
  [['dom clobbering', 'clobbering'], 'dom-clobbering'],
  [['denial of service'], 'denial-of-service'],
  [['dependency confusion'], 'dependency-confusion'],
  [['encoding transformations', 'encoding'], 'encoding'],
  [['external variable'], 'external-variable'],
  [['google web toolkit', 'gwt'], 'gwt'],
  [['parameter pollution', 'hpp'], 'hpp'],
  [['headless'], 'headless'],
  [['hidden parameter'], 'hidden-parameters'],
  [['management interface'], 'management-interface'],
  [['randomness'], 'insecure-randomness'],
  [['source code management', '.git', '.svn', 'scm'], 'scm'],
  [['java rmi'], 'java-rmi'],
  [['ldap'], 'ldap'],
  [['latex'], 'latex'],
  [['orm leak'], 'orm-leak'],
  [['prompt injection'], 'prompt-injection'],
  [['regular expression', 'redos'], 'redos'],
  [['reverse proxy'], 'reverse-proxy'],
  [['saml'], 'saml'],
  [['ssi / esi', 'ssi/esi', 'server side include', 'esi injection'], 'ssi-esi'],
  [['tabnabbing'], 'tabnabbing'],
  [['type juggling'], 'type-juggling'],
  [['upload'], 'upload'],
  [['virtual host'], 'virtual-hosts'],
  [['web socket', 'websocket', 'cswsh'], 'websockets'],
  [['xpath'], 'xpath'],
  [['xs-leak', 'xs leak', 'xsleak'], 'xs-leaks'],
  [['xslt'], 'xslt'],
  [['zip slip'], 'zip-slip'],
  // batch 3 (инфраструктура / пост-эксплуатация) — до широкого 'recon'
  [['linux privilege', 'linux privesc'], 'linux-privesc'],
  [['windows privilege', 'windows privesc'], 'windows-privesc'],
  [['active directory'], 'active-directory'],
  [['cloud'], 'cloud'],
  [['pivoting', 'туннел'], 'pivoting'],
  [['api testing', 'owasp api'], 'api-testing'],
  [['recon-пайплайн', 'пайплайн', 'recon automation', 'recon pipeline'], 'recon-automation'],
  // meta (после всех — самые широкие ключи)
  [['methodology', 'recon'], 'recon'],
];
function slugForTitle(title: string): string | null {
  const t = title.toLowerCase();
  for (const [keys, slug] of SLUG_RULES) if (keys.some((k) => t.includes(k))) return slug;
  return null;
}

/** slug → имя существующей категории payload'ов (для кросс-ссылки «открыть пейлоады» и инлайн-пейлоадов). */
const CATEGORY_BY_SLUG: Record<string, string | null> = {
  'sql-injection': 'SQL Injection',
  xss: 'XSS Injection',
  ssrf: 'Server Side Request Forgery',
  ssti: 'Server Side Template Injection',
  idor: 'Insecure Direct Object References',
  csrf: 'Cross-Site Request Forgery',
  'command-injection': 'Command Injection',
  'file-inclusion': 'File Inclusion',
  xxe: 'XXE Injection',
  'insecure-deserialization': 'Insecure Deserialization',
  jwt: 'JSON Web Token',
  oauth: 'OAuth Misconfiguration',
  'account-takeover': 'Account Takeover',
  'business-logic': 'Business Logic Errors',
  'race-condition': 'Race Condition',
  cors: 'CORS Misconfiguration',
  'open-redirect': 'Open Redirect',
  'request-smuggling': 'Request Smuggling',
  graphql: 'GraphQL Injection',
  nosql: 'NoSQL Injection',
  'prototype-pollution': 'Prototype Pollution',
  'mass-assignment': 'Mass Assignment',
  'web-cache': 'Web Cache Deception',
  recon: null,
  'api-key-leaks': 'API Key Leaks',
  'brute-force': 'Brute Force Rate Limit',
  clickjacking: 'Clickjacking',
  cspt: 'Client Side Path Traversal',
  crlf: 'CRLF Injection',
  'css-injection': 'CSS Injection',
  'csv-injection': 'CSV Injection',
  'cve-exploits': 'CVE Exploits',
  'dns-rebinding': 'DNS Rebinding',
  'dom-clobbering': 'DOM Clobbering',
  'denial-of-service': 'Denial of Service',
  'dependency-confusion': 'Dependency Confusion',
  encoding: 'Encoding Transformations',
  'external-variable': 'External Variable Modification',
  gwt: 'Google Web Toolkit',
  hpp: 'HTTP Parameter Pollution',
  headless: 'Headless Browser',
  'hidden-parameters': 'Hidden Parameters',
  'management-interface': 'Insecure Management Interface',
  'insecure-randomness': 'Insecure Randomness',
  scm: 'Insecure Source Code Management',
  'java-rmi': 'Java RMI',
  ldap: 'LDAP Injection',
  latex: 'LaTeX Injection',
  'orm-leak': 'ORM Leak',
  'prompt-injection': 'Prompt Injection',
  redos: 'Regular Expression',
  'reverse-proxy': 'Reverse Proxy Misconfigurations',
  saml: 'SAML Injection',
  'ssi-esi': 'Server Side Include Injection',
  tabnabbing: 'Tabnabbing',
  'type-juggling': 'Type Juggling',
  upload: 'Upload Insecure Files',
  'virtual-hosts': 'Virtual Hosts',
  websockets: 'Web Sockets',
  xpath: 'XPATH Injection',
  'xs-leaks': 'XS-Leaks',
  xslt: 'XSLT Injection',
  'zip-slip': 'Zip Slip',
};

interface RawSection { num: number | null; title: string; body: string; }

/** Разбить markdown на блоки по заголовкам `## ...`. Текст до первого `##` отбрасывается. */
function splitH2(md: string): RawSection[] {
  const out: RawSection[] = [];
  let cur: RawSection | null = null;
  for (const line of md.split('\n')) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      const heading = m[1] ?? '';
      const numM = heading.match(/^(\d+)\.\s*(.+)$/);
      cur = numM ? { num: Number(numM[1] ?? ''), title: (numM[2] ?? '').trim(), body: '' } : { num: null, title: heading.trim(), body: '' };
      out.push(cur);
    } else if (cur) {
      cur.body += line + '\n';
    }
  }
  return out;
}

/** Тело одной operational-категории → секции/пункты + info-строки (Инструменты/Защита/заметки). */
function parseOperationalBody(slug: string, body: string, locale: 'ru' | 'en'): { sections: ChecklistSection[]; info: string[] } {
  const sections: ChecklistSection[] = [];
  const info: string[] = [];
  let cur: ChecklistSection | null = null;

  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (!line || line === '---') continue;

    const itemM = line.match(/^-\s*\[\s*\]\s*(.+)$/);
    if (itemM) {
      if (!cur) { cur = { name: locale === 'en' ? 'Steps' : 'Шаги', items: [] }; sections.push(cur); }
      const text = (itemM[1] ?? '').trim();
      cur.items.push({ key: itemKey(slug, text), text });
      continue;
    }

    if (line.startsWith('>')) { info.push('> ' + line.replace(/^>\s?/, '')); continue; }

    const boldM = line.match(/^\*\*(.+?)\*\*(.*)$/);
    if (boldM) {
      const label = (boldM[1] ?? '').trim();
      const rest = (boldM[2] ?? '').trim();
      if (label.endsWith(':') || rest) {
        info.push(`**${label}** ${rest}`.trim());
      } else {
        cur = { name: label, items: [] };
        sections.push(cur);
      }
      continue;
    }

    info.push(line);
  }
  return { sections, info };
}

/** Полный разбор всех батчей в массив чек-листов (по порядку sort). */
export function parseChecklists(dir: string = CHECKLIST_DIR, locale: 'ru' | 'en' = 'ru'): ParsedChecklist[] {
  // pass 1: research → researchBySlug + общий блок (TL;DR/Caveats/Источники → отдаём recon).
  const researchBySlug: Record<string, string> = {};
  const generalParts: string[] = [];
  for (const b of BATCHES) {
    const p = join(dir, b.re);
    if (!existsSync(p)) continue;
    for (const sec of splitH2(readFileSync(p, 'utf8'))) {
      if (sec.num != null) {
        const slug = slugForTitle(sec.title);
        if (slug && !researchBySlug[slug]) researchBySlug[slug] = sec.body.trim();
      } else {
        generalParts.push(`## ${sec.title}\n\n${sec.body.trim()}`);
      }
    }
  }
  const general = generalParts.join('\n\n');

  // pass 2: operational → чек-листы.
  const out: ParsedChecklist[] = [];
  const seen = new Set<string>();
  for (const b of BATCHES) {
    const p = join(dir, b.op);
    if (!existsSync(p)) continue;
    for (const sec of splitH2(readFileSync(p, 'utf8'))) {
      if (sec.num == null) continue;
      const slug = slugForTitle(sec.title);
      if (!slug) { console.warn(`  ! чек-лист без slug: "${sec.title}"`); continue; }
      if (seen.has(slug)) { console.warn(`  ! дубликат slug "${slug}" ("${sec.title}") — пропуск`); continue; }
      seen.add(slug);

      const { sections, info } = parseOperationalBody(slug, sec.body, locale);

      const parts: string[] = [];
      if (slug === 'recon') {
        if (researchBySlug[slug]) parts.push(researchBySlug[slug]!);
        if (general) parts.push(general);
      } else if (researchBySlug[slug]) {
        parts.push(researchBySlug[slug]!);
      }
      if (info.length) parts.push((locale === 'en' ? '## 🛠 Tools & defense\n\n' : '## 🛠 Инструменты и защита\n\n') + info.join('\n\n'));

      out.push({
        slug,
        title: sec.title,
        category: CATEGORY_BY_SLUG[slug] ?? null,
        sort: b.base + sec.num,
        sections,
        research: parts.join('\n\n---\n\n'),
      });
    }
  }
  out.sort((a, b) => a.sort - b.sort);
  return out;
}
