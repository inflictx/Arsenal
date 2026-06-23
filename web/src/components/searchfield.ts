import { h } from '../lib/dom';

export interface SearchField {
  el: HTMLElement;
  input: HTMLInputElement;
  clear: () => void;
}

/** Text input with an embedded clear (✕) button that appears when non-empty. */
export function SearchField(opts: { placeholder: string; mono?: boolean; onInput: (v: string) => void }): SearchField {
  const input = h('input', {
    class: 'sf-input' + (opts.mono ? ' mono' : ''),
    placeholder: opts.placeholder,
    spellcheck: 'false',
  }) as HTMLInputElement;
  const clearBtn = h('button', { class: 'sf-clear', title: 'Clear (Esc)', type: 'button' }, '✕') as HTMLButtonElement;
  const el = h('div', { class: 'sf' }, input, clearBtn);

  function sync() { el.classList.toggle('has', input.value.length > 0); }
  function reset() { input.value = ''; sync(); opts.onInput(''); }

  input.addEventListener('input', () => { sync(); opts.onInput(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.stopPropagation(); reset(); }
  });
  clearBtn.addEventListener('click', () => { reset(); input.focus(); });
  sync();

  return { el, input, clear: () => { input.value = ''; sync(); } };
}
