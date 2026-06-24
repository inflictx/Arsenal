import { h } from '../lib/dom';
import { codeBlock } from '../lib/highlight';
import { copyButton } from '../lib/copy';
import { toast } from '../lib/toast';
import { t } from '../lib/i18n';
import { api, type Entry } from '../api';
import { substTarget } from '../lib/target';

interface TableData { headers: string[]; rows: string[][]; }

function renderTable(t: TableData): HTMLElement {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'card-table' },
      h('thead', {}, h('tr', {}, ...t.headers.map((hd) => h('th', {}, hd)))),
      h('tbody', {}, ...t.rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c))))),
    ),
  );
}
function tableToText(t: TableData): string {
  return [t.headers.join('\t'), ...t.rows.map((r) => r.join('\t'))].join('\n');
}

export function PayloadCard(e: Entry, opts?: { onEdit?: (e: Entry) => void; onDelete?: (e: Entry) => void }): HTMLElement {
  const meta = (e.meta ?? {}) as Record<string, any>;
  const kind: string | undefined = meta.kind;
  const body = e.body ?? '';
  const titleR = substTarget(e.title);

  const star = h('button', {
    class: 'star' + (e.is_favorite ? ' on' : ''),
    title: t('card.favorite'),
  }, e.is_favorite ? '★' : '☆') as HTMLButtonElement;
  star.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    try {
      const u = await api.favorite(e.id);
      star.classList.toggle('on', u.is_favorite);
      star.textContent = u.is_favorite ? '★' : '☆';
    } catch { toast(t('card.saveFailed')); }
  });

  let content: HTMLElement;
  let actions: (HTMLElement | null)[];
  let chip: string | null = e.language;
  let targeted = titleR.changed;

  if (kind === 'image') {
    content = h('figure', { class: 'card-figure' },
      h('img', { class: 'card-img', src: meta.src, alt: e.title, loading: 'lazy' }),
      meta.caption ? h('figcaption', {}, meta.caption) : null,
    );
    actions = [star];
    chip = t('card.chipScheme');
  } else if (kind === 'table' && meta.table) {
    content = renderTable(meta.table as TableData);
    actions = [star, copyButton(() => tableToText(meta.table as TableData))];
    chip = t('card.chipTable');
  } else {
    const subst = substTarget(body);
    if (subst.changed) targeted = true;
    content = codeBlock(subst.out, { wrap: subst.out.length > 110 });
    actions = [star, copyButton(() => subst.out)];
  }

  if (opts?.onEdit) actions.push(h('button', { class: 'btn card-edit', type: 'button', title: t('payloads.edit'), onclick: (ev: Event) => { ev.stopPropagation(); opts.onEdit!(e); } }, '✎'));
  if (opts?.onDelete && e.is_custom) actions.push(h('button', { class: 'btn card-del', type: 'button', title: t('payloads.delete'), onclick: (ev: Event) => { ev.stopPropagation(); opts.onDelete!(e); } }, '🗑'));

  const sub = e.subcategory ? h('div', { class: 'card-sub' }, e.subcategory) : null;
  const top = h('div', { class: 'card-top' },
    h('span', { class: 'card-title', title: titleR.out }, titleR.out),
    e.is_custom ? h('span', { class: 'card-mine', title: t('payloads.mineTag') }, t('payloads.mineTag')) : null,
    targeted ? h('span', { class: 'card-targeted', title: t('card.targetedHint') }, '🎯') : null,
    chip ? h('span', { class: 'lang' }, chip) : null,
    h('div', { class: 'card-actions' }, ...actions),
  );
  const tags = e.tags?.length
    ? h('div', { class: 'tags' }, ...e.tags.map((t) => h('span', { class: 'tag' }, t)))
    : null;

  return h('div', { class: 'card', 'data-id': String(e.id) }, sub, top, content, tags);
}
