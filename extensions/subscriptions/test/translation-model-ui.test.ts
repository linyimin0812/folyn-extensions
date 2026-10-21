import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Settings } from '../src/settings';
import { Reader } from '../src/reader';
import { Subscriptions } from '../src/service';
import { Repository } from '../src/repository';
import { harness } from './helpers';

let root: Root | undefined, cleanup: (() => void) | undefined;
const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; cleanup?.(); cleanup = undefined;
    document.body.replaceChildren();
    for (const [name, descriptor] of [['showModal', showModal], ['close', close]] as const) {
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup() {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
    const h = harness(), service = new Subscriptions(h.host);
    await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const pairs = vi.spyOn(h.host.api.ai, 'pairs').mockResolvedValue([
        { provider: 'alpha', model: 'same-model', label: 'Alpha' },
        { provider: 'beta', model: 'same-model', label: 'Beta' },
    ]);
    const container = document.createElement('div'); document.body.append(container);
    root = createRoot(container);
    const onClose = vi.fn(), onClear = vi.fn();
    const renderSettings = () => act(async () => root!.render(createElement(Settings, { service, onClose, onClear })));
    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent?.trim() === label)!;
    const modelSelect = () => [...container.querySelectorAll<HTMLButtonElement>('[role=combobox]')].find(e => e.closest('.select-field')?.textContent?.startsWith('翻译模型'))!;
    const choose = async (label: string) => {
        await act(async () => modelSelect().click());
        await act(async () => [...container.querySelectorAll<HTMLElement>('[role=option]')].find(e => e.textContent === label)!.click());
    };
    return { h, service, pairs, container, onClose, renderSettings, button, modelSelect, choose };
}
describe('translation model selection', () => {
    it('persists the provider/model choice per Vault and sends that pair only after translation confirmation', async () => {
        const { h, service, renderSettings, choose, button, modelSelect, container } = await setup();
        const repo = service.repo!;
        repo.state.settings.autoRead = false;
        repo.state.settings.consent = 'alpha/same-model';
        const candidate = (await service.discover('https://example.com/feed.xml'))[0];
        await service.add(candidate, '测试来源', [], 3, 0, false, await service.preview(candidate));
        const article = repo.state.articles[0];
        await service.loadBody(article);
        await renderSettings();
        await choose('Beta / same-model');
        await act(async () => button('保存设置').click());
        expect(repo.state.settings.pair).toMatchObject({ provider: 'beta', model: 'same-model' });
        expect(repo.state.settings.consent).toBeUndefined();
        const reloaded = new Repository(h.first.vault); await reloaded.load();
        expect(reloaded.state.settings.pair).toMatchObject({ provider: 'beta', model: 'same-model' });
        const chat = vi.spyOn(h.host.api.ai, 'chat');
        await act(async () => root!.render(createElement(Reader, { service, article, onBack() {}, onClear() {} })));
        await act(async () => button('译文').click());
        expect(modelSelect().textContent).toContain('Beta / same-model');
        expect(chat).not.toHaveBeenCalled();
        await act(async () => button('开始翻译').click());
        expect(chat.mock.calls.length).toBeGreaterThan(0);
        expect(chat.mock.calls.every(([request]) => request.provider === 'beta' && request.model === 'same-model')).toBe(true);
        expect(container.querySelector('dialog')).toBeNull();
        await act(async () => root!.render(null));
        await service.switchVault(h.second.vault);
        expect(service.repo!.state.settings.pair).toBeUndefined();
    });
    it('keeps the chosen identity when the host list is reordered and refreshed', async () => {
        const { pairs, renderSettings, choose, modelSelect } = await setup();
        await renderSettings(); await choose('Beta / same-model');
        pairs.mockResolvedValue([{ provider: 'beta', model: 'same-model', label: 'Beta' }, { provider: 'alpha', model: 'same-model', label: 'Alpha' }]);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(modelSelect().textContent).toContain('Beta / same-model');
    });
    it('restarts incomplete translations when another model is explicitly chosen in confirmation', async () => {
        const { service, renderSettings, choose, button, container } = await setup();
        const repo = service.repo!;
        repo.state.settings.autoRead = false;
        const candidate = (await service.discover('https://example.com/feed.xml'))[0];
        await service.add(candidate, '测试来源', [], 3, 0, false, await service.preview(candidate));
        const article = repo.state.articles[0], body = await service.loadBody(article);
        await service.translate(article, body, { provider: 'alpha', model: 'same-model' });
        const translation = (await repo.translation(article, body.version, 'zh-CN'))!;
        translation.document!.complete = false; translation.document!.parts[0].complete = false;
        await repo.putTranslation(article, translation);
        await renderSettings();
        await act(async () => root!.render(createElement(Reader, { service, article, onBack() {}, onClear() {} })));
        await act(async () => button('译文').click());
        await act(async () => button('继续翻译').click());
        await choose('Beta / same-model');
        expect(container.textContent).toContain('更换模型后将重新生成本文译文');
        const translate = vi.spyOn(service, 'translate');
        await act(async () => button('开始翻译').click());
        expect(translate).toHaveBeenCalledWith(article, body, expect.objectContaining({ provider: 'beta', model: 'same-model' }), true);
        expect((await repo.translation(article, body.version, 'zh-CN'))?.provider).toBe('beta');
    });
    it('shows removed models as unavailable without silently selecting a different provider', async () => {
        const { service, renderSettings, modelSelect, button, onClose, choose, container } = await setup();
        service.repo!.state.settings.pair = { provider: 'removed', model: 'retired' };
        await renderSettings();
        expect(modelSelect().textContent).toContain('removed / retired（不可用）');
        await act(async () => button('保存设置').click());
        expect(onClose).not.toHaveBeenCalled();
        expect(container.textContent).toContain('请选择当前可用的翻译模型');
        await choose('Alpha / same-model');
        await act(async () => button('保存设置').click());
        expect(onClose).toHaveBeenCalledOnce();
    });
    it('handles empty and failed model lists and refreshes after host configuration changes', async () => {
        const { pairs, renderSettings, modelSelect, container } = await setup();
        pairs.mockResolvedValue([]); await renderSettings();
        expect(modelSelect().disabled).toBe(true);
        expect(container.textContent).toContain('暂无可用模型');
        pairs.mockRejectedValue(new Error('配置读取失败'));
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(container.textContent).toContain('模型列表读取失败：配置读取失败');
        pairs.mockResolvedValue([{ provider: 'new', model: 'ready', label: 'New' }]);
        await act(async () => { window.dispatchEvent(new Event('focus')); });
        expect(modelSelect().disabled).toBe(false);
        expect(modelSelect().textContent).toContain('New / ready');
    });
});
