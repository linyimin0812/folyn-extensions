import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddSource } from '../src/add-source';
import { GroupDialog, Settings, SourceSettings } from '../src/settings';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';

let root: Root | undefined, cleanup: (() => void) | undefined;
const methods = ['showModal', 'close'] as const;
const descriptors = methods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
afterEach(async () => {
    if (root) await act(async () => root!.unmount()); root = undefined;
    cleanup?.(); cleanup = undefined; document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
    methods.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); });
});
async function setup(add = true) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0], preview = await service.preview(candidate);
    if (add) { await service.add(candidate, '原来源', ['工程'], 20, 0, false, preview); await service.loadBody(service.repo!.state.articles[0]); }
    const repo = service.repo!, source = repo.state.sources[0], container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    const close = vi.fn();
    const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent === text)!;
    return { h, service, repo, source, container, candidate, preview, close, button };
}
async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
describe('explicit-save dialog recovery', () => {
    it('keeps source settings open with the edited value after a failed write, then closes after a successful retry', async () => {
        const { service, repo, source, container, close, button } = await setup();
        await act(async () => root!.render(createElement(SourceSettings, { service, source, onClose: close, onRecognize: vi.fn(), onRemove: vi.fn() })));
        const input = container.querySelector<HTMLInputElement>('.source-identity input')!;
        await type(input, '保留的新名称');
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('disk unavailable'));
        await act(async () => button('保存设置').click());
        expect(close).not.toHaveBeenCalled(); expect(input.value).toBe('保留的新名称'); expect(source.name).toBe('原来源');
        expect(container.textContent).toContain('disk unavailable');
        await act(async () => button('保存设置').click());
        expect(source.name).toBe('保留的新名称'); expect(close).toHaveBeenCalledTimes(1);
    });
    it('retains global-settings inputs and rolls back the applied values until persistence succeeds', async () => {
        const { service, repo, container, close, button } = await setup();
        await act(async () => root!.render(createElement(Settings, { service, onClose: close, onClear: vi.fn() })));
        const input = container.querySelector<HTMLInputElement>('input[placeholder="选择 Vault 内的目录"]')!;
        await type(input, 'Notes/保留输入');
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('settings write failed'));
        await act(async () => button('保存设置').click());
        expect(close).not.toHaveBeenCalled(); expect(repo.state.settings.saveDir).toBe(''); expect(input.value).toBe('Notes/保留输入');
        expect(container.textContent).toContain('settings write failed');
        await act(async () => button('保存设置').click());
        expect(close).toHaveBeenCalledTimes(1); expect(repo.state.settings.saveDir).toBe('Notes/保留输入');
    });
    it('restores group membership and the active group when renaming cannot be saved', async () => {
        const { service, repo, source, container, close, button } = await setup(); repo.state.ui.view = 'group:工程'; repo.state.collapsed = ['工程'];
        await act(async () => root!.render(createElement(GroupDialog, { service, group: '工程', onClose: close })));
        const input = container.querySelector<HTMLInputElement>('input')!; await type(input, '新分组');
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('group write failed'));
        await act(async () => button('保存分组').click());
        expect(close).not.toHaveBeenCalled(); expect(input.value).toBe('新分组'); expect(source.groups).toEqual(['工程']);
        expect(repo.state.groups).toEqual(['工程']); expect(repo.state.collapsed).toEqual(['工程']); expect(repo.state.ui.view).toBe('group:工程');
        await act(async () => button('保存分组').click());
        expect(close).toHaveBeenCalledTimes(1); expect(source.groups).toEqual(['新分组']); expect(repo.state.ui.view).toBe('group:新分组');
    });
    it('retains the verified preview when re-recognition cannot be saved, then retries the same configuration', async () => {
        const { service, repo, source, container, candidate, preview, close, button } = await setup();
        vi.spyOn(service, 'discover').mockResolvedValue([candidate]); vi.spyOn(service, 'previewDetails').mockResolvedValue({ body: preview, ranges: [] });
        await act(async () => root!.render(createElement(AddSource, { service, source, onClose: close })));
        await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
        const input = container.querySelector<HTMLInputElement>('input[placeholder="识别后自动填写，也可自定义"]')!; await type(input, '重新识别名称');
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('recognition write failed'));
        await act(async () => button('保存已验证配置').click());
        expect(close).not.toHaveBeenCalled(); expect(source.name).toBe('原来源'); expect(input.value).toBe('重新识别名称');
        expect(container.querySelector('.preview.prose')).not.toBeNull(); expect(container.textContent).toContain('recognition write failed');
        await act(async () => button('保存已验证配置').click());
        expect(close).toHaveBeenCalledTimes(1); expect(source.name).toBe('重新识别名称');
    });
    it('guards cancel, escape and the close icon only while the initial index is committing', async () => {
        const { service, repo, container, candidate, preview, close, button } = await setup(false);
        vi.spyOn(service, 'discover').mockResolvedValue([candidate]); vi.spyOn(service, 'previewDetails').mockResolvedValue({ body: preview, ranges: [] });
        await act(async () => root!.render(createElement(AddSource, { service, onClose: close })));
        await type(container.querySelector<HTMLInputElement>('[data-autofocus]')!, candidate.rule.url);
        await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
        let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }), persist = repo.persist.bind(repo);
        vi.spyOn(repo, 'persist').mockImplementationOnce(async () => { await pending; await persist(); });
        await act(async () => button('订阅并导入').click());
        try {
            expect(button('取消').disabled).toBe(true);
            await act(async () => { container.querySelector<HTMLButtonElement>('.modal-header button')!.click(); container.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true })); });
            expect(close).not.toHaveBeenCalled();
            await act(async () => { release(); });
            expect(close).toHaveBeenCalledTimes(1); expect(repo.state.sources).toHaveLength(1);
        } finally { await act(async () => { release(); }); }
    });
});
