import { h } from './dom';

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

const ICON_COPY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>`;

export function copyButton(getText: () => string, label = 'Copy'): HTMLButtonElement {
  const btn = h('button', { class: 'btn', html: `${ICON_COPY}<span>${label}</span>` }) as HTMLButtonElement;
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (!(await copyText(getText()))) return;
    btn.classList.add('copied');
    btn.innerHTML = `${ICON_CHECK}<span>Copied</span>`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `${ICON_COPY}<span>${label}</span>`;
    }, 1300);
  });
  return btn;
}
