export type RenderFn = (outlet: HTMLElement, params: Record<string, string>) => void | (() => void);

let cleanup: (() => void) | undefined;

function parse(): { name: string; params: Record<string, string> } {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  const name = parts[0] || 'payloads';
  const params: Record<string, string> = {};
  if (parts[1]) params.sub = decodeURIComponent(parts[1]);
  if (query) for (const [k, v] of new URLSearchParams(query)) params[k] = v;
  return { name, params };
}

export function startRouter(outlet: HTMLElement, routes: Record<string, RenderFn>, onRoute?: (name: string) => void) {
  function run() {
    const { name, params } = parse();
    if (cleanup) { cleanup(); cleanup = undefined; }
    const resolved = routes[name] ? name : 'payloads';
    const result = routes[resolved]!(outlet, params);
    if (typeof result === 'function') cleanup = result;
    try { localStorage.setItem('ars:route', resolved); } catch { /* ignore */ }
    onRoute?.(resolved);
  }
  window.addEventListener('hashchange', run);
  if (!location.hash) {
    let last = 'payloads';
    try { last = localStorage.getItem('ars:route') || 'payloads'; } catch { /* ignore */ }
    location.hash = '#/' + last;
  }
  run();
}

export function navigate(name: string, params?: Record<string, string>) {
  let hash = '#/' + name;
  if (params) {
    const q = new URLSearchParams(params).toString();
    if (q) hash += '?' + q;
  }
  location.hash = hash;
}
