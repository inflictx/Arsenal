import { h } from '../lib/dom';

/** Floating "scroll to top" button that appears after scrolling down. */
export function ScrollTop(): { el: HTMLElement; destroy: () => void } {
  const btn = h('button', { class: 'scrolltop', title: 'Scroll to top' }, '↑') as HTMLButtonElement;
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  const onScroll = () => btn.classList.toggle('show', window.scrollY > 500);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return { el: btn, destroy: () => window.removeEventListener('scroll', onScroll) };
}
