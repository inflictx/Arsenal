import { copyButton } from './copy';

// Decorate every <pre> under `root` (markdown output) with a pinned Copy button.
//
// Each <pre> is wrapped in a NON-scrolling `.code-wrap`, and the button is attached
// to the WRAP, not the <pre>. This fixes two bugs reported on long code blocks:
//   (1) the button lived inside the horizontally-scrollable <pre>, so it slid away
//       when you scrolled a long command sideways;
//   (2) it overlapped the code with no backdrop (text showed through it).
// The wrap never scrolls, so the button holds its corner; CSS gives it an opaque bg.
//
// `getText` lets a caller copy a cleaned-up form (e.g. Commands strips trailing `# …`).
// Empty blocks get no button — defends against a stray ``` rendering as a blank <pre>.
export function decorateCodeBlocks(
  root: ParentNode,
  label = 'Copy',
  getText?: (pre: HTMLElement, code: HTMLElement | null) => string,
): void {
  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.parentElement?.classList.contains('code-wrap')) return; // idempotent
    const code = pre.querySelector('code');
    const text = code?.textContent ?? pre.textContent ?? '';
    if (!text.trim()) return; // nothing to copy → no button
    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    const btn = copyButton(() => (getText ? getText(pre, code) : text), label);
    btn.classList.add('doc-copy');
    wrap.appendChild(btn);
  });
}

// Wrap a single hand-built <pre> (NOT from markdown) in the same `.code-wrap` + Copy,
// so the button behaves identically to the markdown path. Returns the wrap to append.
export function codeWrap(pre: HTMLElement, label = 'Copy', getText?: () => string): HTMLElement {
  const code = pre.querySelector('code');
  const wrap = document.createElement('div');
  wrap.className = 'code-wrap';
  wrap.appendChild(pre);
  const btn = copyButton(() => (getText ? getText() : (code?.textContent ?? pre.textContent ?? '')), label);
  btn.classList.add('doc-copy');
  wrap.appendChild(btn);
  return wrap;
}
