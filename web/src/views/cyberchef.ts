import { h, clear } from '../lib/dom';

// CyberChef is embedded as the official offline bundle (web/public/cyberchef/),
// localized + re-themed by scripts/cyberchef-localize.mjs. We just mount it in a
// full-height iframe — it is a self-contained SPA served same-origin from /public.
const CC_SRC = '/cyberchef/CyberChef_v11.2.0.html';

export function CyberChefView(outlet: HTMLElement): void {
  clear(outlet);
  const frame = h('iframe', { class: 'cc-frame', src: CC_SRC, title: 'CyberChef' });
  outlet.appendChild(h('div', { class: 'cc-wrap' }, frame));
}
