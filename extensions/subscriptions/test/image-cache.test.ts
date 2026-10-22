import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subscriptions } from '../src/service';
import { extractBody, htmlDoc } from '../src/parse';
import { harness } from './helpers';
import { article } from './fixtures';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { Reader } from '../src/reader';
import { readFileSync } from 'node:fs';
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(images: string) {
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, 'Images', [], 1, 0, false, await service.preview(candidate));
    const a = service.repo!.state.articles[0]; h.routes.set(a.url, article('Images', images));
    return { h, service, a, repo: service.repo! };
}
describe('article image caching', () => {
    it('preserves the real Meituan image bytes and MIME returned by the native browser fallback', async () => {
        const url = 'https://p0.meituan.net/meituantechblog/f0ae68810ba98d662aa1d1d984b2a4e6144954.png';
        const bytes = readFileSync('test/fixtures/meituan-network-image.png');
        const { h, service, a, repo } = await setup(`<img src="${url}" alt="Meituan technical diagram">`);
        const fetch = h.host.support.fetch;
        h.host.support.fetch = async (requested, binary) => binary && requested === url
            ? { url, status: 200, headers: { 'content-type': 'image/png' }, body: bytes.toString('base64') }
            : fetch(requested, binary);
        const body = await service.loadBody(a, true);
        expect(body.images).toHaveLength(1);
        const image = body.images[0];
        expect(image).toMatchObject({ url, mime: 'image/png', bytes: 141725 });
        expect(image.error).toBeUndefined();
        expect(image.path).toMatch(/\.png$/);
        expect(Array.from(await h.first.vault.data.readBinary(image.path!))).toEqual(Array.from(bytes));
        expect(a.cache).toMatchObject({ missing: 0, pending: false });
        const rendered = htmlDoc(await service.imageHtml(repo, body.html, body), a.url);
        expect(rendered.querySelector('img')?.getAttribute('src')).toBe(await h.first.vault.data.assetUrl(image.path!));
        expect(rendered.querySelector('.image-unavailable')).toBeNull();
    });
    it('shows counts and retry controls while preserving already displayed image nodes', async () => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const { h, service, a, repo } = await setup('<img src="/one.png"><img src="/two.png">');
        repo.state.settings.autoRead = false;
        const fetch = h.host.support.fetch;
        h.host.support.fetch = async (url, binary) => { if (binary && url.endsWith('/two.png')) throw new Error('HTTP 403'); return fetch(url, binary); };
        await service.loadBody(a, true);
        const container = document.createElement('div'), root = createRoot(container); document.body.append(container);
        try {
            await act(async () => root.render(createElement(Reader, { service, article: a, onBack() {}, onClear() {} })));
            expect(container.querySelector('.cache-status')?.textContent).toContain('图片 1/2');
            expect(container.querySelector('.image-unavailable')?.textContent).toContain('HTTP 403');
            const image = container.querySelector('.prose img'); expect(image).toBeTruthy();
            h.host.support.fetch = fetch;
            await act(async () => {
                [...container.querySelectorAll('button')].find(button => button.textContent === '重试未缓存图片')!.click();
                await service.retryImages(a);
            });
            expect(container.querySelector('.cache-status')?.textContent).toContain('图片 2/2');
            expect(container.querySelector('.image-unavailable')).toBeNull();
            expect(container.querySelector('.prose img')).toBe(image);
        } finally { await act(async () => root.unmount()); container.remove(); }
    });
    it('does not charge rejected large images against the budget for later small images', async () => {
        const { h, service, a } = await setup('<img src="/large-one.png"><img src="/large-two.png"><img src="/small.png">');
        const fetch = h.host.support.fetch;
        h.host.support.fetch = async (url, binary) => binary && url.includes('/large-') ? { url, status: 200, headers: { 'content-type': 'image/png' }, body: 'large-fixture' } : fetch(url, binary);
        const decode = atob;
        vi.stubGlobal('atob', (value: string) => value === 'large-fixture' ? 'x'.repeat(9 * 1024 * 1024) : decode(value));
        const body = await service.loadBody(a, true);
        expect(body.images[0].error).toContain('8 MB'); expect(body.images[1].error).toContain('8 MB');
        expect(body.images[2].path).toBeTruthy(); expect(a.cache?.missing).toBe(2);
        expect(a.cache?.bytes).toBeLessThan(10000);
    });
    it('publishes progress and retains completed paths while the remaining image is downloading', async () => {
        const { h, service, a, repo } = await setup('<img src="/one.png"><img src="/two.png">');
        let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
        let reached!: () => void; const progress = new Promise<void>(resolve => { reached = resolve; });
        const stop = service.subscribe(() => { if (a.cache?.pending && a.cache.processed === 1) reached(); });
        const fetch = h.host.support.fetch;
        h.host.support.fetch = async (url, binary) => { if (binary && url.endsWith('/two.png')) await gate; return fetch(url, binary); };
        const loading = service.loadBody(a, true); await progress;
        expect(service.downloading.has(a.id)).toBe(true);
        const partial = await repo.body(a); expect(partial?.images.filter(image => image.path)).toHaveLength(1);
        release(); await loading; stop();
        expect(a.cache).toMatchObject({ pending: false, processed: 2, missing: 0 });
    });
    it('caches all small images in a photo-heavy article rather than stopping at 24', async () => {
        const { service, a } = await setup(Array.from({ length: 32 }, (_, i) => `<img src="/photo-${i}.png">`).join(''));
        const body = await service.loadBody(a, true);
        expect(body.images).toHaveLength(32);
        expect(body.images.filter(image => image.path)).toHaveLength(32);
        expect(a.cache?.missing).toBe(0);
    });
    it('extracts lazy images and picture/srcset without caching placeholder images', async () => {
        const body = await extractBody(article('Lazy images', '<img src="data:image/gif;base64,AAAA" data-src="/real.png"><picture><source srcset="/wide.webp 600w, /wider.webp 1200w"><img alt="Responsive"></picture><img data-original="/original.jpg"><img srcset="/small.png 1x, /large.png 2x">'), 'https://example.com/post', 'lazy');
        expect(body.images.map(image => image.url)).toEqual(['https://example.com/real.png', 'https://example.com/wider.webp', 'https://example.com/original.jpg', 'https://example.com/large.png']);
        expect(body.html).not.toContain('srcset=');
        const inline = await extractBody(article('Data placeholder', '<img srcset="data:image/png;base64,AAAA 1x, /actual.png 2x">'), 'https://example.com/post', 'inline');
        expect(inline.images.map(image => image.url)).toEqual(['https://example.com/actual.png']);
    });
    it('provides a safe original-image link and the failure reason for unavailable images', async () => {
        const { service, repo, a } = await setup('<img src="/missing.png" alt="Chart">');
        const body = await extractBody(article('Missing', '<img src="/missing.png" alt="Chart">'), a.url, a.id);
        body.images[0].error = 'HTTP 403';
        const rendered = htmlDoc(await service.imageHtml(repo, body.html, body), a.url);
        expect(rendered.querySelector('a[data-original-image]')?.getAttribute('href')).toBe('https://example.com/missing.png');
        expect(rendered.body.textContent).toContain('HTTP 403');
    });
    it('retries only unavailable images without refetching the article or cached images', async () => {
        const { h, service, a } = await setup('<img src="/one.png"><img src="/two.png">');
        const fetch = h.host.support.fetch;
        h.host.support.fetch = async (url, binary) => { if (binary && url.endsWith('/two.png')) throw new Error('HTTP 403'); return fetch(url, binary); };
        const before = await service.loadBody(a, true), path = before.images[0].path;
        expect(a.cache?.missing).toBe(1);
        h.host.support.fetch = fetch;
        const calls = vi.spyOn(h.host.support, 'fetch');
        const after = await service.retryImages(a);
        expect(calls.mock.calls).toEqual([['https://example.com/two.png', true]]);
        expect(after.version).toBe(before.version); expect(after.images[0].path).toBe(path);
        expect(after.images.every(image => !!image.path && !image.error)).toBe(true);
        expect(a.cache?.missing).toBe(0);
    });
});
