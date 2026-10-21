import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { AddSource } from '../src/add-source';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';
let root: Root | undefined, cleanup: (() => void) | undefined;
const dialogMethods = ['showModal', 'close'] as const;
const descriptors = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; cleanup?.(); cleanup = undefined;
    document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    dialogMethods.forEach((name, i) => { const d = descriptors[i]; if (d) Object.defineProperty(HTMLDialogElement.prototype, name, d); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); });
});
async function setup() {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    const body = await service.preview(candidate);
    vi.spyOn(service, 'discover').mockResolvedValue([candidate]);
    const preview = vi.spyOn(service, 'previewDetails').mockResolvedValue({ body, ranges: [] });
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(AddSource, { service, onClose: vi.fn() })));
    const input = container.querySelector<HTMLInputElement>('[data-autofocus]')!;
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'https://example.com/feed.xml');
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submit = () => container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const importButton = () => [...container.querySelectorAll('button')].find(b => b.textContent === '订阅并导入')!;
    return { container, preview, submit, importButton };
}
it('keeps preferences and the import action in place before recognition, with importing disabled', async () => {
    const { container, importButton } = await setup();
    expect(container.textContent).toContain('订阅偏好');
    expect(importButton()?.disabled).toBe(true);
});
it('retains the displayed preview during a retest and invalidates it if that retest fails', async () => {
    const { container, preview, submit, importButton } = await setup();
    await act(async () => { submit(); });
    const dialog = container.querySelector('dialog'), shown = container.querySelector('.preview.prose');
    expect(shown).not.toBeNull(); expect(importButton().disabled).toBe(false);
    let reject!: (error: Error) => void;
    preview.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    await act(async () => { submit(); });
    expect(container.querySelector('.preview.prose')).toBe(shown);
    expect(container.querySelector('dialog')).toBe(dialog); expect(importButton().disabled).toBe(true);
    await act(async () => { reject(new Error('Network unavailable')); });
    expect(container.querySelector('.preview.prose')).toBeNull(); expect(importButton().disabled).toBe(true);
    expect(container.textContent).toContain('Network unavailable');
});
