import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StableHtml } from '../src/stable-html';
let root: Root | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); });
async function mount() {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    const render = (html: string) => act(async () => root!.render(createElement(StableHtml, { html })));
    return { container, render };
}
it('retains loaded images when streaming Markdown changes wrappers or inserts content before them', async () => {
    const { container, render } = await mount();
    await render('<p>Before <img src="/cached/a.png" alt="A"> after</p>');
    const image = container.querySelector('img')!;
    await render('<h2>New heading</h2><section><p>Before <strong>emphasis</strong><img src="/cached/a.png" alt="A"> after, more text</p></section>');
    expect(container.querySelector('img')).toBe(image);
    expect(container.querySelector('h2')!.textContent).toBe('New heading');
    expect(container.querySelector('section strong')!.textContent).toBe('emphasis');
    expect(container.textContent).toContain('after, more text');
});
it('keeps repeated images distinct and removes obsolete content without retaining stale resources', async () => {
    const { container, render } = await mount();
    await render('<p><img src="/cached/a.png"><img src="/cached/a.png"></p>');
    const images = [...container.querySelectorAll('img')];
    await render('<p><img src="/cached/a.png"><img src="/cached/a.png">More</p>');
    expect([...container.querySelectorAll('img')]).toEqual(images);
    await render('<p><img src="/cached/b.png" alt="New"></p>');
    expect(container.querySelector('img')).not.toBe(images[0]);
    expect(container.querySelector('img')!.getAttribute('src')).toBe('/cached/b.png');
    await render(''); expect(container.textContent).toBe(''); expect(container.querySelector('img')).toBeNull();
});

it('keeps the table scroller, column structure and cached images when streamed rows are appended', async () => {
    const { container, render } = await mount();
    const row = '<tr><td><img src="/cached/table.png" alt="Diagram"></td><td>First row</td></tr>';
    await render(`<table><thead><tr><th>Diagram</th><th>Meaning</th></tr></thead><tbody>${row}</tbody></table>`);
    const scroller = container.querySelector<HTMLElement>('.table-scroll')!, table = container.querySelector('table')!, image = table.querySelector('img')!;
    expect(scroller).not.toBeNull(); expect(table.parentElement).toBe(scroller);
    scroller.scrollLeft = 75;
    await render(`<table><thead><tr><th>Diagram</th><th>Meaning</th></tr></thead><tbody>${row}<tr><td>Next</td><td>Streamed row</td></tr></tbody></table>`);
    expect(container.querySelector('.table-scroll')).toBe(scroller);
    expect(scroller.scrollLeft).toBe(75);
    expect(container.querySelector('table')).toBe(table);
    expect(table.querySelector('img')).toBe(image);
    expect(table.tHead!.rows[0].cells).toHaveLength(2);
    expect(table.tBodies[0].rows).toHaveLength(2);
    expect(container.querySelectorAll('.table-scroll')).toHaveLength(1);
});
