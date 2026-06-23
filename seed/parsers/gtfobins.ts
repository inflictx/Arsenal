import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as yamlLoad } from 'js-yaml';
import type { EntryInput } from '../../server/repo';

const here = dirname(fileURLToPath(import.meta.url));
const DIR = join(here, '..', 'gtfobins-src');
const BIN_DIR = join(DIR, 'binaries');

interface FnDef { label: string; description: string; }
type FnDefs = Record<string, FnDef>;
type Ctx = null | { code?: string; shell?: boolean };
interface Technique { code?: string; comment?: string; description?: string; contexts?: Record<string, Ctx>; }
interface BinData { functions?: Record<string, Technique[]>; }

const CTX_LABELS: Record<string, string> = {
  sudo: 'Sudo', suid: 'SUID', capabilities: 'Capabilities', 'limited-suid': 'Limited SUID', unprivileged: 'Unprivileged',
};
const ctxLabel = (k: string) => CTX_LABELS[k] ?? k;

// Russian descriptions for the function headers (override the English ones in functions.yml).
const RU_DESC: Record<string, string> = {
  shell: 'Запускает интерактивный системный шелл.',
  command: 'Выполняет неинтерактивные системные команды.',
  'reverse-shell': 'Отправляет обратный (reverse) шелл на слушающую машину атакующего.',
  'bind-shell': 'Привязывает шелл к локальному порту и ждёт подключения атакующего (bind shell).',
  'file-write': 'Записывает данные в локальные файлы.',
  'file-read': 'Читает данные из локальных файлов.',
  upload: 'Выгружает локальные данные наружу.',
  download: 'Скачивает данные с удалённого хоста.',
  'library-load': 'Загружает разделяемые библиотеки — через это можно выполнить произвольный код в том же контексте.',
  'privilege-escalation': 'Даёт механизм повышения привилегий (например, выставление SUID-бита или смена владельца другого файла).',
  inherit: 'Наследует функции от другого бинаря.',
};

function loadFnDefs(): FnDefs {
  try { return (yamlLoad(readFileSync(join(DIR, 'functions.yml'), 'utf8')) as FnDefs) ?? {}; } catch { return {}; }
}

const norm = (s: unknown) => String(s).replace(/\s*\n\s*/g, ' ').trim();

// Merge the agent-produced RU translation maps for technique comments.
function loadComments(): Record<string, string> {
  const map: Record<string, string> = {};
  try {
    for (const f of readdirSync(DIR).filter((x) => /^comments-ru.*\.json$/.test(x))) {
      Object.assign(map, JSON.parse(readFileSync(join(DIR, f), 'utf8')));
    }
  } catch { /* ignore */ }
  return map;
}

function renderBinary(data: BinData, defs: FnDefs, comments: Record<string, string>): { body: string; tags: string[] } {
  const tags = new Set<string>();
  const fnOrder = Object.keys(defs);
  const fnKeys = Object.keys(data.functions ?? {});
  const ordered = [...fnOrder.filter((k) => fnKeys.includes(k)), ...fnKeys.filter((k) => !fnOrder.includes(k))];
  let body = '';
  for (const fn of ordered) {
    const techniques = data.functions![fn];
    if (!Array.isArray(techniques) || !techniques.length) continue;
    tags.add(fn);
    body += `### ${defs[fn]?.label ?? fn}\n`;
    const desc = RU_DESC[fn] ?? defs[fn]?.description;
    if (desc) body += `${desc}\n\n`;
    for (const t of techniques) {
      if (t.description) body += `${t.description}\n\n`;
      if (t.code) body += '```\n' + String(t.code).trim() + '\n```\n';
      if (t.comment) { const cn = norm(t.comment); body += `\n> ${comments[cn] ?? cn}\n`; }
      const ctxs = t.contexts ?? {};
      const ctxKeys = Object.keys(ctxs);
      for (const c of ctxKeys) tags.add(c);
      if (ctxKeys.length) body += `\n*Контексты: ${ctxKeys.map(ctxLabel).join(' · ')}*\n`;
      for (const c of ctxKeys) {
        const v = ctxs[c];
        if (v && v.code) body += `\n**${ctxLabel(c)}:**\n` + '```\n' + String(v.code).trim() + '\n```\n';
      }
      body += '\n';
    }
  }
  return { body: body.trim(), tags: [...tags] };
}

// Parse GTFOBins binaries (seed/gtfobins-src/binaries/*) into type=gtfobin entries.
export function parseGtfobins(): EntryInput[] {
  if (!existsSync(BIN_DIR)) return [];
  const defs = loadFnDefs();
  const comments = loadComments();
  const rows: EntryInput[] = [];
  for (const file of readdirSync(BIN_DIR).sort()) {
    let data: BinData;
    try { data = yamlLoad(readFileSync(join(BIN_DIR, file), 'utf8')) as BinData; } catch { continue; }
    if (!data?.functions) continue;
    const { body, tags } = renderBinary(data, defs, comments);
    if (!body) continue;
    rows.push({
      type: 'gtfobin',
      category: null,
      subcategory: null,
      title: file,
      body,
      language: 'md',
      tags,
      source: `https://gtfobins.github.io/gtfobins/${file}/`,
      meta: { funcs: tags.filter((t) => defs[t]), ctxs: tags.filter((t) => CTX_LABELS[t]) },
    });
  }
  return rows;
}
