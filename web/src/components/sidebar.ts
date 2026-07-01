import { h } from '../lib/dom';
import { navigate } from '../router';
import { t } from '../lib/i18n';

export interface NavItem { id: string; label: string; icon: string; }

// Two groups: reference material you look things up in, and the per-engagement workspace.
export const NAV_REFERENCE: NavItem[] = [
  { id: 'payloads', label: 'Payloads', icon: '⚡' },
  { id: 'chains', label: 'Attack Chains', icon: '🔗' },
  { id: 'commands', label: 'Commands', icon: '⌘' },
  { id: 'scripts', label: 'Scripts', icon: '📜' },
  { id: 'gtfobins', label: 'GTFOBins', icon: '🐧' },
  { id: 'wordlists', label: 'Wordlists', icon: '📚' },
  { id: 'cyberchef', label: 'CyberChef', icon: '🧪' },
  { id: 'revshell', label: 'Reverse Shell', icon: '🐚' },
  { id: 'oauthlab', label: 'OAuth / SSO Lab', icon: '🔓' },
  { id: 'jwtlab', label: 'JWT Workshop', icon: '🔑' },
  { id: 'recon', label: 'Recon Tools', icon: '📡' },
  { id: 'burp', label: 'Burp Docs', icon: '🟠' },
];
export const NAV_WORKSPACE: NavItem[] = [
  { id: 'checklists', label: 'Checklists', icon: '☑' },
  { id: 'engage', label: 'Engagements', icon: '🎯' },
  { id: 'reports', label: 'Report Templates', icon: '📝' },
  { id: 'notes', label: 'Notes', icon: '🗒' },
  { id: 'favorites', label: 'Favorites', icon: '★' },
  { id: 'backup', label: 'Backup', icon: '💾' },
];
export const NAV: NavItem[] = [...NAV_REFERENCE, ...NAV_WORKSPACE];

export function Sidebar(): { el: HTMLElement; setActive: (name: string) => void } {
  const items: HTMLElement[] = [];
  const mkItem = (n: NavItem) => {
    const it = h('div', { class: 'nav-item', 'data-id': n.id, onclick: () => navigate(n.id) },
      h('span', { class: 'ic' }, n.icon), n.label);
    items.push(it);
    return it;
  };
  const group = (label: string, list: NavItem[]) => [h('div', { class: 'nav-label' }, label), ...list.map(mkItem)];

  const el = h('aside', { class: 'sidebar' },
    h('div', { class: 'brand' }, h('span', { class: 'g' }, 'ARS3NAL')),
    h('div', { class: 'brand-sub' }, t('sidebar.brandSub')),
    ...group(t('nav.reference'), NAV_REFERENCE),
    ...group(t('nav.workspace'), NAV_WORKSPACE),
    h('div', { class: 'sidebar-footer' }, h('span', { class: 'dot' }), t('sidebar.offline')),
  );
  function setActive(name: string) {
    for (const it of items) it.classList.toggle('active', it.getAttribute('data-id') === name);
  }
  return { el, setActive };
}
