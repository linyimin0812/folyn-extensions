// Diff Viewer — sandbox-tier Folyn tool.
// Runs in an isolated iframe (origin null). Pure client-side: two editable
// columns, live word-level diff highlighted inline. No host capability needed,
// so no postMessage RPC bridge — the iframe loads its own UI on script run.
//
// Inline highlight trick: a transparent <textarea> (handles editing — caret,
// selection, IME, paste) sits over a "backdrop" <div> that renders the same
// text with per-word color/background. Identical typography on both layers keeps
// the highlights aligned character-for-character.
import { diffWords } from 'diff';

type Part = { added?: boolean; removed?: boolean; value: string };

const state = { left: '', right: '' };

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') el.className = v as string;
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const kid of kids) el.append(kid);
  return el;
}

// Left column: show unchanged + removed (removed = red, line-through).
// Right column: show unchanged + added (added = green).
function fillBackdrop(col: HTMLElement, parts: Part[], side: 'left' | 'right'): void {
  col.textContent = '';
  for (const p of parts) {
    if (side === 'left' && p.added) continue;
    if (side === 'right' && p.removed) continue;
    col.append(
      h('span', { className: p.removed ? 'del' : p.added ? 'add' : '' }, [p.value]),
    );
  }
}

function render(): void {
  const app = document.getElementById('app')!;
  app.textContent = '';

  const leftBackdrop = h('div', { className: 'backdrop' });
  const rightBackdrop = h('div', { className: 'backdrop' });
  const leftTa = h('textarea', { spellcheck: false, wrap: 'off', value: state.left });
  const rightTa = h('textarea', { spellcheck: false, wrap: 'off', value: state.right });
  const stats = h('span', { className: 'stats' });

  // Keep the backdrop scrolled with its textarea (wrap height changes on edit).
  const sync = (ta: HTMLTextAreaElement, bg: HTMLElement) => {
    bg.scrollTop = ta.scrollTop;
    bg.scrollLeft = ta.scrollLeft;
  };
  leftTa.addEventListener('input', () => { state.left = leftTa.value; update(); });
  rightTa.addEventListener('input', () => { state.right = rightTa.value; update(); });
  leftTa.addEventListener('scroll', () => sync(leftTa, leftBackdrop));
  rightTa.addEventListener('scroll', () => sync(rightTa, rightBackdrop));

  // Cmd/Ctrl+A → select all in the focused editor. Folyn may claim the native
  // accelerator at the app level; preventDefault + select() guarantees it here.
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
      const ta = document.activeElement;
      if (ta instanceof HTMLTextAreaElement) {
        e.preventDefault();
        ta.select();
      }
    }
  });

  function update(): void {
    const parts = diffWords(state.left, state.right) as Part[];
    fillBackdrop(leftBackdrop, parts, 'left');
    fillBackdrop(rightBackdrop, parts, 'right');
    let adds = 0;
    let dels = 0;
    for (const p of parts) {
      if (p.added) adds++;
      else if (p.removed) dels++;
    }
    stats.innerHTML = `<span class="n-add">+${adds}</span> · <span class="n-del">−${dels}</span>`;
    sync(leftTa, leftBackdrop);
    sync(rightTa, rightBackdrop);
  }
  update();

  const swapBtn = h('button', { textContent: '⇄ 左右互换' });
  swapBtn.addEventListener('click', () => {
    [state.left, state.right] = [state.right, state.left];
    leftTa.value = state.left;
    rightTa.value = state.right;
    update();
  });

  const editor = (label: string, bg: HTMLElement, ta: HTMLTextAreaElement) =>
    h('div', { className: 'pane' }, [
      h('label', {}, [label]),
      h('div', { className: 'editor' }, [bg, ta]),
    ]);

  app.append(
    h('header', {}, [
      h('h1', {}, ['Diff Viewer']),
      h('span', { className: 'spacer' }),
      stats,
      h('span', { className: 'spacer' }),
      swapBtn,
    ]),
    h('div', { className: 'row' }, [
      editor('左侧（原文）', leftBackdrop, leftTa),
      editor('右侧（修改后）', rightBackdrop, rightTa),
    ]),
  );
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
