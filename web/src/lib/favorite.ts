import { h } from './dom';
import { api, type Entry } from '../api';
import { toast } from './toast';
import { t } from './i18n';

// Reusable ★/☆ favorite toggle for a module reader header (GTFOBins, Commands, Scripts, Burp…).
// Mutates the passed entry's is_favorite (so the in-memory list stays in sync) and persists via
// api.favorite. Pass the SAME entry object the view holds in its list, not a copy.
export function favoriteButton(e: Entry): HTMLButtonElement {
  const btn = h('button', {
    class: 'btn fav-toggle' + (e.is_favorite ? ' on' : ''),
    type: 'button',
    title: t('card.favorite'),
  }, e.is_favorite ? '★' : '☆') as HTMLButtonElement;
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    try {
      const u = await api.favorite(e.id);
      e.is_favorite = u.is_favorite;
      btn.classList.toggle('on', u.is_favorite);
      btn.textContent = u.is_favorite ? '★' : '☆';
    } catch { toast(t('card.saveFailed')); }
  });
  return btn;
}
