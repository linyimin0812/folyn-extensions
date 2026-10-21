import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddArticle } from '../src/add-article';
import { Subscriptions } from '../src/service';
import { Repository } from '../src/repository';
import { harness } from './helpers';
const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanups.splice(0).forEach(f => f());
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
});
const URL = 'https://example.com/blog/article-1';
async function setup() {
    const h = harness();
    const s = new Subscriptions(h.host);
    await s.start();
    cleanups.push(() => {
        s.stop();
        h.dispose();
    });
    return { h, s };
}
describe('single-article add', () => {
    it('adds a standalone article, makes the body readable immediately and locates duplicates', async () => {
        const { h, s } = await setup();
        const preview = await s.previewArticle(URL);
        expect(preview.body.title).toBe('A durable reader');
        const article = await s.addArticle(preview);
        const repo = s.repo!;
        expect(article.sourceIds).toEqual([]);
        expect(repo.state.articles).toHaveLength(1);
        expect(repo.state.ui.view).toBe('retained');
        expect(repo.state.ui.selected).toBe(article.id);
        expect(article.cache?.pending).toBe(false);
        // Text is readable right away through the normal reader path.
        const body = await repo.body(article);
        expect(body?.text).toContain('reliable subscription reader');
        // Persisted and reloadable, still without a source.
        const reloaded = new Repository(h.first.vault);
        await reloaded.load();
        expect(reloaded.state.articles).toHaveLength(1);
        expect(reloaded.state.articles[0].sourceIds).toEqual([]);
        // Adding the same URL again locates the article instead of duplicating it.
        await expect(s.addArticle(preview)).rejects.toThrow('文章已在列表中');
        expect(repo.state.articles).toHaveLength(1);
        expect(repo.state.ui.selected).toBe(article.id);
    });
    it('extracts and imports the article end to end from the dialog', async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
        const { s } = await setup();
        // previewArticle digests the body via crypto.subtle, which resolves on a
        // macrotask in Node and escapes the act() flush. Resolve it directly, the
        // real addArticle path below stays microtask-only.
        const preview = await s.previewArticle(URL);
        vi.spyOn(s, 'previewArticle').mockResolvedValue(preview);
        const onClose = vi.fn();
        const container = document.createElement('div');
        document.body.append(container);
        const root = createRoot(container);
        await act(async () => root.render(createElement(AddArticle, { service: s, onClose })));
        const input = container.querySelector<HTMLInputElement>('[data-autofocus]')!;
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, URL);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        const importButton = () => [...container.querySelectorAll('button')].find(b => b.textContent === '添加并阅读')!;
        expect(importButton().disabled).toBe(true);
        await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
        expect(container.querySelector('.preview.prose')).not.toBeNull();
        expect(importButton().disabled).toBe(false);
        await act(async () => { importButton().click(); });
        expect(onClose).toHaveBeenCalled();
        expect(s.repo!.state.articles).toHaveLength(1);
        expect(s.repo!.state.articles[0].url).toBe(URL);
        expect(container.textContent).not.toContain('error');
        await act(async () => root.unmount());
    });
});
