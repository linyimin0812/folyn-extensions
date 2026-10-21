import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveDialog } from '../src/save';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';
import { article } from './fixtures';

let root: Root | undefined, cleanup: (() => void) | undefined;
const dialogMethods = ['showModal', 'close'] as const;
const descriptors = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; cleanup?.(); cleanup = undefined;
    document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    dialogMethods.forEach((name, i) => { const d = descriptors[i]; if (d) Object.defineProperty(HTMLDialogElement.prototype, name, d); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); });
});
function gate() {
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
}
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function inputValue(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function setup() {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, 'Images', [], 1, 0, false, await service.preview(candidate));
    const repo = service.repo!, a = repo.state.articles[0];
    await service.loadBody(a);
    h.routes.set(a.url, article('Partial images', '<img src="/one.png"><img src="/two.png">'));
    const fetch = h.host.support.fetch.bind(h.host.support);
    const request = vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => {
        if (binary && url.endsWith('/two.png')) throw new Error('HTTP 503');
        return fetch(url, binary);
    });
    const body = await service.loadBody(a, true);
    request.mockImplementation(fetch); request.mockClear();
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(SaveDialog, { service, article: a, body, initialMode: 'original', onClose: vi.fn() })));
    const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent!.startsWith(text))!;
    const input = (text: string) => [...container.querySelectorAll('label.field')].find(item => item.textContent!.startsWith(text))!.querySelector('input')!;
    return { h, service, repo, a, body, fetch, request, container, button, input };
}
describe('save dialog image repair', () => {
    it('repairs images in place with progress, keeps the draft and prevents saving during repair', async () => {
        const { h, service, a, body, fetch, request, container, button, input } = await setup();
        await inputValue(input('目标目录'), 'Notes'); await inputValue(input('文件名'), 'My reading note');
        const pending = gate();
        request.mockImplementation(async (...args) => { await pending.promise; return fetch(...args); });
        const load = vi.spyOn(service, 'loadBody'), retry = vi.spyOn(service, 'retryImages'), save = vi.spyOn(service, 'save');
        await act(async () => { button('重试获取缺失图片').click(); button('保存 Markdown').click(); });
        expect(retry).toHaveBeenCalledExactlyOnceWith(a);
        expect(load).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
        expect(button('保存 Markdown').disabled).toBe(true);
        expect(container.querySelector('progress')).not.toBeNull();
        expect(container.textContent).toContain('正在补齐图片');
        await act(async () => { pending.release(); }); await flush();
        expect(container.textContent).toContain('图片 2/2 张已缓存');
        expect(container.textContent).not.toContain('重新打开');
        expect(container.textContent).not.toContain('张图片尚未缓存');
        expect(input('目标目录').value).toBe('Notes'); expect(input('文件名').value).toBe('My reading note');
        expect(request.mock.calls).toEqual([['https://example.com/two.png', true]]);
        await act(async () => { button('保存 Markdown').click(); }); await flush();
        expect(save).toHaveBeenCalledWith(a, body, 'original', 'Notes', 'My reading note', false, false, false);
        expect(container.textContent).toContain('文档已保存');
        expect(button('打开文档').disabled).toBe(false);
        const open = vi.spyOn(h.first.vault, 'open');
        await act(async () => { button('打开文档').click(); });
        expect(open).toHaveBeenCalledExactlyOnceWith('Notes/My reading note.md');
    });
    it('keeps the remaining image failures visible after repair rather than reporting full success', async () => {
        const { request, container, button } = await setup();
        request.mockRejectedValue(new Error('HTTP 403'));
        await act(async () => { button('重试获取缺失图片').click(); }); await flush();
        expect(container.textContent).toContain('图片 1/2 张已缓存');
        expect(container.textContent).toContain('仍有 1 张图片未缓存');
        expect(container.textContent).toContain('HTTP 403');
        expect(button('重试获取缺失图片').disabled).toBe(false);
    });
    it('does not start image repair while a save is in progress, including rapid consecutive clicks', async () => {
        const { service, container, button } = await setup();
        await act(async () => { [...container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')].find(item => item.parentElement!.textContent!.includes('保留缺失图片'))!.click(); });
        const pending = gate(), retry = vi.spyOn(service, 'retryImages');
        vi.spyOn(service, 'save').mockImplementation(async () => { await pending.promise; return 'Notes/result.md'; });
        await act(async () => { button('保存 Markdown').click(); button('重试获取缺失图片').click(); });
        expect(retry).not.toHaveBeenCalled();
        expect(button('重试获取缺失图片').disabled).toBe(true);
        await act(async () => { pending.release(); });
    });
    it('ignores repair results after changing Vault without writing into the new Vault', async () => {
        const { h, service, body, container, button } = await setup();
        const pending = gate();
        vi.spyOn(service, 'retryImages').mockImplementation(async () => {
            await pending.promise;
            return { ...body, images: body.images.map(image => ({ ...image, path: 'repaired.png' })) };
        });
        await act(async () => { button('重试获取缺失图片').click(); });
        await act(async () => { await service.switchVault(h.second.vault); pending.release(); }); await flush();
        expect(container.textContent).not.toContain('补图完成');
        expect(container.textContent).not.toContain('图片 2/2 张已缓存');
        expect([...h.second.files.keys()]).toEqual(['Notes']);
    });
    it('releases the repair lock after a storage error so the user can retry in the same dialog', async () => {
        const { service, container, button } = await setup();
        const retry = vi.spyOn(service, 'retryImages').mockRejectedValueOnce(new Error('Cache disk unavailable'));
        await act(async () => { button('重试获取缺失图片').click(); });
        expect(container.textContent).toContain('Cache disk unavailable');
        expect(button('重试获取缺失图片').disabled).toBe(false);
        expect(button('保存 Markdown').disabled).toBe(false);
        await act(async () => { button('重试获取缺失图片').click(); }); await flush();
        expect(retry).toHaveBeenCalledTimes(2);
        expect(container.textContent).toContain('图片 2/2 张已缓存');
        expect(container.textContent).not.toContain('Cache disk unavailable');
    });
    it('ignores save completion after changing Vault', async () => {
        const { h, service, container, button } = await setup();
        const pending = gate();
        vi.spyOn(service, 'save').mockImplementation(async () => { await pending.promise; return 'Notes/old-vault.md'; });
        await act(async () => { button('保存 Markdown').click(); });
        await act(async () => { await service.switchVault(h.second.vault); pending.release(); }); await flush();
        expect(container.textContent).not.toContain('文档已保存');
        expect(container.textContent).not.toContain('old-vault.md');
        expect([...h.second.files.keys()]).toEqual(['Notes']);
    });
});
