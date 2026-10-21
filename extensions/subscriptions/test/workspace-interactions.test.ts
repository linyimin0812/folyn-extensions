import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { harness } from './helpers';
import { Subscriptions } from '../src/service';
import { SubscriptionsPage, setRuntime } from '../src/workspace';
import type { Article } from '../src/model';
vi.mock('../src/reader', () => ({ Reader: ({ article }: { article: Article }) => createElement('section', { 'data-reader-id': article.id, className: 'reader' }, article.title) }));
let root: Root | undefined, cleanup: (() => void) | undefined;
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; cleanup?.(); cleanup = undefined;
    setRuntime(undefined); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup(count = 3) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const resizeCallbacks: (() => void)[] = [];
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resizeCallbacks.push(callback); } observe() {} disconnect() {} });
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280);
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const repo = service.repo!;
    repo.state.settings.autoRead = false;
    repo.state.sources = [{ id: 'feed', name: 'Example source', groups: ['工程'], rule: { kind: 'feed', url: 'https://example.com/feed.xml' }, interval: 0, autoDownload: false, paused: false, imported: count }];
    repo.state.groups = ['工程'];
    repo.state.articles = Array.from({ length: count }, (_, i) => ({ id: `article-${i + 1}`, title: `Article ${i + 1}`, url: `https://example.com/blog/article-${i + 1}`, summary: '', sourceIds: ['feed'], discovered: new Date(Date.UTC(2026, 0, 1, 0, 0, count - i)).toISOString(), read: false, starred: false, saved: [], positions: {} }));
    setRuntime(service);
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    await act(async () => root!.render(createElement(SubscriptionsPage)));
    const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(e => e.getAttribute('aria-label') === name || e.textContent?.trim() === name)!;
    return { service, repo, container, button, resize(value: number) { width.mockReturnValue(value); resizeCallbacks.forEach(callback => callback()); } };
}
it('clears a failed search inside the current view rather than adding a source', async () => {
    const { service, repo, container, button } = await setup();
    await act(async () => { repo.state.ui.view = 'unread'; repo.state.ui.query = 'no-such-article'; service.changed(); });
    expect(container.querySelector('.empty h2')?.textContent).toBe('没有匹配当前搜索的文章');
    expect(button('清空搜索')).toBeTruthy();
    await act(async () => button('清空搜索').click());
    expect(repo.state.ui.query).toBe(''); expect(repo.state.ui.view).toBe('unread');
    expect(container.querySelectorAll('.article-card')).toHaveLength(3);
    expect(document.activeElement).toBe(container.querySelector('#fsub-search'));
});
it('toggles a group from its label, count, arrow and row without changing the view', async () => {
    const { repo, container, button } = await setup();
    const row = button('收起 工程 分组');
    const content = container.querySelector<HTMLElement>('.group-sources')!;
    row.focus();
    for (const target of [row.querySelector<HTMLElement>('.ellipsis')!, row.querySelector<HTMLElement>('.group-count')!, row.querySelector('svg')!, row]) {
        const wasExpanded = row.getAttribute('aria-expanded') === 'true';
        await act(async () => target.dispatchEvent(new MouseEvent('click', { bubbles: true })));
        expect(row.getAttribute('aria-expanded')).toBe(String(!wasExpanded));
        expect(content.hidden).toBe(wasExpanded);
        expect(repo.state.collapsed.includes('工程')).toBe(wasExpanded);
        expect(repo.state.ui.view).toBe('all');
        expect(document.activeElement).toBe(row);
    }
    expect(row.querySelector('button')).toBeNull();
    expect(button('编辑分组 工程').parentElement).toBe(row.parentElement);
});
it('opens a source directly beneath its group and reopens the list', async () => {
    const { service, repo, container } = await setup();
    await act(async () => { repo.state.ui.listCollapsed = true; service.changed(); });
    const firstSource = container.querySelector<HTMLButtonElement>('.group-sources > :first-child .navitem')!;
    await act(async () => firstSource.click());
    expect(repo.state.ui.view).toBe('source:feed'); expect(repo.state.collapsed).not.toContain('工程');
    expect(repo.state.ui.listCollapsed).toBe(false);
});
it('loads and focuses the next batch at the 40th article boundary', async () => {
    const { repo, container } = await setup(45);
    const cards = () => [...container.querySelectorAll<HTMLButtonElement>('.article-card')];
    expect(cards()).toHaveLength(40);
    await act(async () => { cards()[39].focus(); cards()[39].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); });
    expect(cards()).toHaveLength(45);
    expect(repo.state.ui.selected).toBe('article-41');
    expect(document.activeElement).toBe(cards()[40]);
    expect(container.querySelector('[data-reader-id]')?.getAttribute('data-reader-id')).toBe('article-41');
    await act(async () => cards()[40].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(document.activeElement).toBe(cards()[39]); expect(repo.state.ui.selected).toBe('article-40');
});
it('refreshes latest entries from the source header without advancing the history cursor', async () => {
    const { service, repo, button } = await setup();
    const refresh = vi.spyOn(service, 'refresh').mockResolvedValue();
    await act(async () => { repo.state.ui.view = 'source:feed'; service.changed(); });
    await act(async () => button('刷新此来源').click());
    expect(refresh).toHaveBeenCalledExactlyOnceWith(repo.state.sources[0]);
});

it('shows one accurate cache status through pending, partial and complete states', async () => {
    const { service, repo, container } = await setup();
    const article = repo.state.articles[0];
    await act(async () => { article.cache = { version: 'v1', images: 1, missing: 1, unsupported: false, pending: true }; service.changed(); });
    const statuses = () => [...container.querySelectorAll('.article-origin .meta-status')].map(e => e.getAttribute('title'));
    expect(statuses()).toEqual(['缓存中']);
    await act(async () => { article.cache!.pending = false; service.changed(); });
    expect(statuses()).toEqual(['部分离线']);
    await act(async () => { article.cache!.missing = 0; service.changed(); });
    expect(statuses()).toEqual(['完整离线']);
});

it('keeps an open reader dialog visible when crossing into the single-pane breakpoint', async () => {
    const { service, repo, container, resize } = await setup();
    await act(async () => { repo.state.ui.selected = repo.state.articles[0].id; service.changed(); });
    const reader = container.querySelector('[data-reader-id]')!;
    const dialog = document.createElement('dialog'); dialog.open = true; reader.append(dialog);
    await act(async () => resize(600));
    expect(container.querySelector('[aria-label="订阅工作区"]')?.classList.contains('article-open')).toBe(true);
    expect(container.querySelector<HTMLElement>('.list-pane')?.hidden).toBe(true);
});
