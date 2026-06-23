type Attrs = Record<string, unknown>;
type Child = Node | string | number | null | undefined | false;

/** Minimal hyperscript element builder. */
export function h(tag: string, attrs?: Attrs | null, ...children: (Child | Child[])[]): HTMLElement {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = String(v);
      else if (k === 'html') e.innerHTML = String(v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, String(v));
    }
  }
  appendAll(e, children);
  return e;
}

function appendAll(e: HTMLElement, children: unknown[]) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { appendAll(e, c); continue; }
    e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(n: Node) { while (n.firstChild) n.removeChild(n.firstChild); }
