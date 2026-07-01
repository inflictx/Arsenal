import { h } from './dom';
import { t } from './i18n';

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

// label is rendered via textContent (never innerHTML) so a caller-supplied label can't inject markup.
export function copyButton(getText: () => string, label = t('common.copy')): HTMLButtonElement {
  const btn = h('button', { class: 'btn' }) as HTMLButtonElement;
  const render = (icon: string, text: string) => {
    btn.innerHTML = icon;                     // icon is a trusted static SVG constant
    btn.appendChild(h('span', null, text));   // label/text via createTextNode, not innerHTML
  };
  render(ICON_COPY, label);
  btn.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    if (!(await copyText(getText()))) return;
    btn.classList.add('copied');
    render(ICON_CHECK, t('common.copied'));
    setTimeout(() => {
      btn.classList.remove('copied');
      render(ICON_COPY, label);
    }, 1300);
  });
  return btn;
}
