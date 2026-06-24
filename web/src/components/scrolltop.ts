import { h } from '../lib/dom';
import { t } from '../lib/i18n';

/** Floating "scroll to top" button that appears after scrolling down. */
export function ScrollTop(): { el: HTMLElement; destroy: () => void } {
  const btn = h('button', { class: 'scrolltop', title: t('scrolltop.title') }, '↑') as HTMLButtonElement;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const onScroll = () => btn.classList.toggle('show', window.scrollY > 500);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return { el: btn, destroy: () => window.removeEventListener('scroll', onScroll) };
}
