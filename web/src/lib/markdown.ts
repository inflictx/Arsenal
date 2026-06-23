import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: false });

// Open any real links in a new tab.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Render a full markdown document to safe HTML (headings, lists, tables, code…). */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html);
}

/** Render a single line of markdown (inline `code`, **bold**, links) to safe HTML. */
export function renderInline(md: string): string {
  const html = marked.parseInline(md ?? '', { async: false }) as string;
  return DOMPurify.sanitize(html);
}
