import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourceActions } from '../src/source-actions';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';
import { article, feed } from './fixtures';

let root: Root | undefined;
let dispose: (() => void) | undefined;
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    dispose?.(); dispose = undefined;
    document.body.replaceChildren();
    vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function gate() {
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
}
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
async function setup() {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const h = harness(), service = new Subscriptions(h.host);
    await service.start();
    dispose = () => { service.stop(); h.dispose(); };
    h.routes.set('https://example.com/feed.xml', feed(4));
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, '测试来源', [], 4, 0, false, await service.preview(candidate));
    const source = service.repo!.state.sources[0], container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    const busy = vi.fn(), recognize = vi.fn();
    await act(async () => root!.render(createElement(SourceActions, { service, source, disabled: false, onBusyChange: busy, onRecognize: recognize })));
    const button = (text: string) => [...container.querySelectorAll('button')].find(item => item.textContent!.startsWith(text))!;
    const status = () => container.querySelector('[role=status]')!;
    return { h, service, source, container, button, status, busy };
}
describe('source actions feedback', () => {
    it('shows pending feedback immediately, prevents duplicate clicks and reports completion inside the section', async () => {
        const { service, source, container, button, status, busy } = await setup();
        const pending = gate(), refresh = vi.spyOn(service, 'refresh').mockImplementation(() => pending.promise);
        await act(async () => { button('立即刷新').click(); button('立即刷新').click(); });
        expect(refresh).toHaveBeenCalledExactlyOnceWith(source, false);
        expect(button('立即刷新').getAttribute('aria-busy')).toBe('true');
        expect(button('立即刷新').querySelector('.inline-spinner')).not.toBeNull();
        expect([...container.querySelectorAll('button')].every(item => item.disabled)).toBe(true);
        expect(status().textContent).toContain('正在刷新');
        expect(busy).toHaveBeenLastCalledWith(true);
        await act(async () => { pending.release(); });
        expect(status().textContent).toContain('刷新完成：没有新增文章');
        expect(button('立即刷新').disabled).toBe(false);
        expect(busy).toHaveBeenLastCalledWith(false);
        expect(service.messages.some(item => item.text.includes('刷新完成'))).toBe(false);
    });
    it('reports refresh failures recorded by the service, then allows a successful retry', async () => {
        const { service, source, button, status } = await setup();
        const refresh = vi.spyOn(service, 'refresh').mockImplementationOnce(async () => { source.error = 'HTTP 503'; });
        await act(async () => { button('立即刷新').click(); });
        expect(status().textContent).toContain('刷新失败：HTTP 503');
        expect(status().getAttribute('data-state')).toBe('error');
        expect(status().textContent).not.toContain('刷新完成');
        refresh.mockImplementationOnce(async () => { delete source.error; });
        await act(async () => { button('立即刷新').click(); });
        expect(status().getAttribute('data-state')).toBe('success');
        expect(status().textContent).toContain('刷新完成');
    });
    it('shows history loading and the number actually imported by the real service', async () => {
        const { h, source, button, status } = await setup();
        const pending = gate(), fetch = h.host.support.fetch.bind(h.host.support);
        h.routes.set(source.rule.url, feed(5));
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (...args) => { await pending.promise; return fetch(...args); });
        await act(async () => { button('加载更多历史文章').click(); });
        expect(status().textContent).toContain('正在加载历史文章');
        await act(async () => { pending.release(); }); await flush();
        expect(status().textContent).toContain('历史加载完成：新增 1 篇文章');
    });
    it('updates actual batch progress, reports partial failure and retries only remaining articles', async () => {
        const { service, button, container, status } = await setup();
        const gates = [gate(), gate(), gate()], load = service.loadBody.bind(service);
        let call = 0;
        const mock = vi.spyOn(service, 'loadBody').mockImplementation(async article => {
            const index = call++;
            await gates[index].promise;
            if (index === 1) throw new Error('HTTP 503');
            return load(article);
        });
        await act(async () => { button('下载现有文章').click(); });
        expect(container.querySelector('progress')!.max).toBe(3);
        expect(container.querySelector('progress')!.value).toBe(0);
        await act(async () => { gates[0].release(); }); await flush();
        expect(container.querySelector('progress')!.value).toBe(1);
        expect(status().textContent).toContain('1/3');
        await act(async () => { gates[1].release(); }); await flush();
        expect(container.querySelector('progress')!.value).toBe(2);
        await act(async () => { gates[2].release(); }); await flush();
        expect(status().textContent).toContain('完整缓存 2 篇，失败 1 篇');
        expect(button('下载现有文章').textContent).toContain('1 篇');
        expect(button('下载现有文章').disabled).toBe(false);
        mock.mockRestore();
        await act(async () => { button('下载现有文章').click(); }); await flush();
        expect(status().textContent).toContain('下载完成：1 篇文章已完整缓存');
        expect(service.repo!.state.articles.every(article => !!article.cache)).toBe(true);
    });
    it('clears the pending state when the user cancels confirmation without starting downloads', async () => {
        const { service, button, status } = await setup();
        vi.spyOn(service.host.ctx.ui.dialogs, 'confirm').mockResolvedValueOnce(false);
        const load = vi.spyOn(service, 'loadBody');
        await act(async () => { button('下载现有文章').click(); });
        expect(load).not.toHaveBeenCalled();
        expect(status().textContent).toBe('已取消下载');
        expect(button('下载现有文章').getAttribute('aria-busy')).toBe('false');
        expect(button('下载现有文章').disabled).toBe(false);
    });
    it('stops the remaining batch after changing Vault and does not announce a false success', async () => {
        const { h, service, button, container } = await setup();
        const pending = gate(), fetch = h.host.support.fetch.bind(h.host.support);
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (...args) => { await pending.promise; return fetch(...args); });
        const mock = vi.spyOn(service, 'loadBody');
        await act(async () => { button('下载现有文章').click(); });
        await act(async () => { await service.switchVault(h.second.vault); pending.release(); }); await flush();
        expect(mock).toHaveBeenCalledTimes(1);
        expect(container.textContent).not.toContain('下载完成');
        expect(service.repo!.state.articles).toHaveLength(0);
        expect([...h.second.files.keys()]).toEqual(['Notes']);
    });
    it('includes articles with missing images and supplements their images without fetching the body again', async () => {
        const { h, service, button, status } = await setup();
        await act(async () => { for (const a of service.repo!.state.articles) await service.loadBody(a); });
        const a = service.repo!.state.articles[0];
        h.routes.set(a.url, article('Partial cache', '<img src="/missing.png">'));
        const fetch = h.host.support.fetch.bind(h.host.support);
        const request = vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => {
            if (binary) throw new Error('HTTP 503');
            return fetch(url, binary);
        });
        await act(async () => { await service.loadBody(a, true); });
        request.mockImplementation(fetch);
        await act(async () => { service.changed(); });
        expect(button('下载现有文章').textContent).toContain('1 篇');
        const load = vi.spyOn(service, 'loadBody'), retry = vi.spyOn(service, 'retryImages');
        request.mockClear();
        await act(async () => { button('下载现有文章').click(); }); await flush();
        expect(load).not.toHaveBeenCalled();
        expect(retry).toHaveBeenCalledExactlyOnceWith(a);
        expect(request.mock.calls).toEqual([['https://example.com/missing.png', true]]);
        expect(status().textContent).toContain('1 篇文章已完整缓存');
    });
    it('reports partial image caches separately from complete caches and keeps them available for retry', async () => {
        const { h, service, button, status } = await setup();
        const fetch = h.host.support.fetch.bind(h.host.support);
        for (const a of service.repo!.state.articles.filter(a => !a.cache)) h.routes.set(a.url, article('Partial cache', '<img src="/missing.png">'));
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => {
            if (binary) throw new Error('HTTP 403');
            return fetch(url, binary);
        });
        await act(async () => { button('下载现有文章').click(); }); await flush();
        expect(status().textContent).toContain('完整缓存 0 篇');
        expect(status().textContent).toContain('部分缓存 3 篇');
        expect(status().textContent).not.toContain('已全部缓存');
        expect(button('下载现有文章').textContent).toContain('3 篇');
    });
    it('explains interactive content when all supported resources are cached without endlessly retrying it', async () => {
        const { h, service, button, status } = await setup();
        await act(async () => { for (const a of service.repo!.state.articles) await service.loadBody(a); });
        const a = service.repo!.state.articles[0];
        h.routes.set(a.url, article('Interactive article', '<canvas>Interactive chart</canvas>'));
        await act(async () => { await service.loadBody(a, true); });
        expect(a.cache?.unsupported).toBe(true);
        expect(button('下载现有文章').textContent).toContain('0 篇');
        const load = vi.spyOn(service, 'loadBody'), retry = vi.spyOn(service, 'retryImages');
        await act(async () => { button('下载现有文章').click(); });
        expect(load).not.toHaveBeenCalled(); expect(retry).not.toHaveBeenCalled();
        expect(status().textContent).toContain('可缓存图片已缓存');
        expect(status().textContent).toContain('1 篇含交互内容，仍需查看原网页');
        expect(status().textContent).not.toContain('已全部缓存');
        expect(status().getAttribute('data-state')).toBe('info');
    });
});
