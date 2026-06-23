import { h } from './dom';

let node: HTMLElement | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function toast(msg: string) {
  if (!node) {
    node = h('div', { class: 'toast' });
    document.body.appendChild(node);
  }
  node.textContent = msg;
  node.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => node?.classList.remove('show'), 1700);
}
