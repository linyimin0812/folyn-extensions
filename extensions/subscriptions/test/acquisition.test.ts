import { afterEach, describe, expect, it, vi } from 'vitest';
import { SiteReader } from '../src/acquisition';
import { extractBody, htmlDoc, listCandidates, parseFeed } from '../src/parse';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';
import { article, paragraph } from './fixtures';
const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.restoreAllMocks(); });
function setup() {
    const h = harness(); h.routes.clear();
    cleanups.push(() => h.dispose());
    const reader = new SiteReader(h.host.support);
    const root = 'https://blog.example.org/';
    const list = `<main><article><a href="/post-one"><h2>随笔</h2></a></article><article><a href="/post-two"><h2>近况</h2></a></article></main>`;
    const feed = (next?: string, start = 1, count = 2) => `<rss xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>测试博客</title>${next ? `<atom:link rel="next" href="${next}"/>` : ''}${Array.from({ length: count }, (_, i) => `<item><title>文章 ${i + start}</title><link>${root}article-${i + start}</link><description>${paragraph}</description></item>`).join('')}</channel></rss>`;
    return { h, reader, root, list, feed };
}
describe('general website acquisition', () => {
    it('preserves a primary article with a comment class while removing actual discussion widgets', async () => {
        const { root } = setup();
        const result = await extractBody(`<main><article class="comment"><pre>${paragraph}\n\n${paragraph}</pre></article><div id="disqus_thread">Discussion widget</div><p class="dsq-brlink">blog comments powered by Disqus</p></main>`, root, 'primary');
        expect(result.text).toContain(paragraph); expect(result.text).not.toContain('powered by Disqus');
    });
    it('upgrades legacy HTTP article links and rejects transport error pages', async () => {
        const { h, reader, root } = setup();
        h.routes.set(root + 'old-post', article());
        const body = await reader.article({ id: 'http', url: root.replace('https:', 'http:') + 'old-post' });
        expect(body.response?.url).toBe(root + 'old-post');
        await expect(extractBody('<pre>Blocked: Only HTTPS requests are allowed</pre>', root, 'blocked')).rejects.toThrow('网络中间层');
    });
    it('does not cache a long RSS description as the full article', async () => {
        const { h, reader, root, feed } = setup();
        const entry = parseFeed(feed(), root + 'feed.xml')!.entries[0];
        expect(entry.summary).toContain('A reliable subscription');
        expect(entry.feedHtml).toBeUndefined();
        h.routes.set(entry.url, article('Full article', '<p>The final section is only on the website.</p>'));
        const result = await reader.article({ ...entry, id: 'full-rss' });
        expect(result.body.text).toContain('The final section is only on the website.');
    });
    it('recovers a stale body selector using static content before invoking the renderer', async () => {
        const { h, reader, root } = setup();
        h.routes.set(root + 'post', article());
        const render = vi.fn(); h.host.support.render = render;
        const result = await reader.article({ id: 'stale', url: root + 'post' }, '.removed-selector');
        expect(result.body.text).toContain(paragraph);
        expect(render).not.toHaveBeenCalled();
    });
    it('discovers a slashless blog directory feed and preserves advertised order across redirects', async () => {
        const { h, reader, root, feed } = setup();
        h.routes.set(root + 'blog', '<main>Blog</main>'); h.routes.set(root + 'blog/feed/', feed());
        expect((await reader.discover(root + 'blog'))[0].rule.url).toBe(root + 'blog/feed/');
        h.routes.set(root, '<link rel="alternate" type="application/rss+xml" href="/preferred"><link rel="alternate" type="application/rss+xml" href="/secondary">');
        const original = h.host.support.fetch;
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => {
            if (url === root + 'preferred') { await new Promise(resolve => setTimeout(resolve, 5)); return { url: root + 'redirected', status: 200, headers: {}, body: feed() }; }
            if (url === root + 'secondary') return { url, status: 200, headers: {}, body: feed() };
            return original(url, binary);
        });
        expect((await reader.discover(root))[0].rule.url).toBe(root + 'redirected');
    });
    it('discovers WordPress feed paths even when static links already form a candidate', async () => {
        const { h, reader, root, list, feed } = setup();
        h.routes.set(root, list); h.routes.set(root + 'feed/', feed());
        const found = await reader.discover(root);
        expect(found[0].rule).toMatchObject({ kind: 'feed', url: root + 'feed/' });
        expect(found.some(candidate => candidate.rule.kind === 'html')).toBe(true);
    });
    it('keeps an explicitly selected subdirectory ahead of an unrelated global guessed feed', async () => {
        const { h, reader, root, list, feed } = setup();
        h.routes.set(root + 'category/', list); h.routes.set(root + 'feed/', feed());
        const found = await reader.discover(root + 'category/');
        expect(found[0].rule.kind).toBe('html');
        expect(found[0].entries.map(entry => entry.title)).toEqual(['随笔', '近况']);
    });
    it('honors RSS anchors and HTTP Link metadata instead of probing only XML alternate tags', async () => {
        const { h, reader, root, feed } = setup();
        h.routes.set(root, '<main>Blog</main><a href="/rss/">RSS</a>'); h.routes.set(root + 'rss/', feed());
        expect((await reader.discover(root))[0].rule.url).toBe(root + 'rss/');
        const original = h.host.support.fetch;
        h.routes.set(root, '<main>Blog</main>'); h.routes.set(root + 'unusual-subscription', feed());
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => {
            const response = await original(url, binary);
            return url === root ? { ...response, headers: { link: '</unusual-subscription>; rel="alternate"; type="application/rss+xml"' } } : response;
        });
        expect((await reader.discover(root))[0].rule.url).toBe(root + 'unusual-subscription');
    });
    it('reads JSON Feed text/html content, authors and pagination without losing valid items', async () => {
        const { reader, root } = setup();
        const value = { version: 'https://jsonfeed.org/version/1.1', title: 'JSON Blog', next_url: '/feed-2.json', items: [null, { id: 'one', url: '/one', title: '新文', content_html: `<p>${paragraph}</p>`, authors: [{ name: 'Author' }] }, { id: 'two', url: '/two', content_text: paragraph }] };
        const parsed = parseFeed(JSON.stringify(value), root + 'feed.json')!;
        expect(parsed.entries).toHaveLength(2); expect(parsed.entries[0].author).toBe('Author'); expect(parsed.next).toBe(root + 'feed-2.json');
        const body = (await reader.article({ ...parsed.entries[0], id: 'json' })).body;
        expect(body.text).toContain(paragraph);
    });
    it('retains short CJK titles and clear article cards linking to another origin', () => {
        const { root } = setup();
        const result = listCandidates('<main><nav><a href="/login">登录</a></nav><article><a href="https://posts.example.org/a"><h2>随笔</h2></a></article><article><a href="/b"><h2>近况</h2></a></article></main>', root);
        expect(result.flatMap(candidate => candidate.entries).map(entry => entry.title)).toEqual(['随笔', '近况']);
    });
    it('reads common JSON state assignments without evaluating trailing JavaScript', () => {
        const { root } = setup();
        const html = `<main></main><script>window.__INITIAL_STATE__ = ${JSON.stringify({ posts: [{ title: '短文', slug: 'new-post', excerpt: 'An article' }] })}; window.acquisitionExecuted = true;</script>`;
        const candidates = listCandidates(html, root + 'blog/');
        expect(candidates[0].entries[0].url).toBe(root + 'blog/new-post');
        expect((window as unknown as Record<string, unknown>).acquisitionExecuted).toBeUndefined();
    });
    it('reads JSON-LD ItemList and articles without confusing unrelated navigation with posts', () => {
        const { root } = setup();
        const value = { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', item: { '@type': 'BlogPosting', headline: '内容', url: '/post' } }] };
        const result = listCandidates(`<script type="application/ld+json">${JSON.stringify(value)}</script>`, root);
        expect(result[0].entries[0]).toMatchObject({ title: '内容', url: root + 'post' });
        expect(listCandidates('<script type="application/json">{"navigation":[{"title":"登录","url":"/login"}]}</script>', root)).toEqual([]);
    });
    it('keeps date archive paths stable and follows conventional older-page links', () => {
        const { root } = setup();
        const a = listCandidates('<main><article><a href="/blog/2026/10/one">十月文章</a></article><article><a href="/blog/2026/10/two">另一篇文章</a></article><a href="?page=2">Older posts</a></main>', root);
        const b = listCandidates('<main><article><a href="/blog/2026/11/one">十一月文章</a></article><article><a href="/blog/2026/11/two">另一篇文章</a></article></main>', root);
        expect(a[0].rule.pathPrefix).toBe('/blog/'); expect(b[0].rule.pathPrefix).toBe('/blog/'); expect(a[0].next).toBe(root + '?page=2');
    });
    it('uses robots-declared sitemap indexes and excludes taxonomy URLs', async () => {
        const { h, reader, root } = setup();
        h.routes.set(root, '<main>Blog</main>');
        h.routes.set(root + 'robots.txt', `User-agent: *\nSitemap: ${root}custom-map.xml`);
        h.routes.set(root + 'custom-map.xml', `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${root}posts-map.xml</loc></sitemap></sitemapindex>`);
        h.routes.set(root + 'posts-map.xml', `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${root}first-article</loc></url><url><loc>${root}tags/testing</loc></url></urlset>`);
        const found = await reader.discover(root);
        expect(found[0].rule).toEqual({ kind: 'sitemap', url: root + 'custom-map.xml' });
        expect(found[0].entries).toEqual([{ url: root + 'first-article', title: 'first article', summary: '', titleFromUrl: true }]);
        expect((await reader.discover(root + 'custom-map.xml'))[0].entries).toHaveLength(1);
    });
    it('extracts structured articleBody when the HTML only contains an application shell', async () => {
        const { root } = setup();
        const body = await extractBody(`<html><head><title>Structured article</title><script type="application/ld+json">${JSON.stringify({ '@type': 'BlogPosting', headline: 'Structured article', articleBody: paragraph, url: root + 'article' })}</script></head><body><main id="app"></main></body></html>`, root + 'article', 'article');
        expect(body.text).toContain(paragraph); expect(body.html).not.toContain('<script');
    });
    it('accepts short genuine posts and rejects long login/verification pages as article content', async () => {
        const { root } = setup();
        const body = await extractBody(`<article><p>${'今天整理了一些开发笔记，记录代码审查与阅读体验。'.repeat(3)}</p></article>`, root, 'short');
        expect(body.text.length).toBeLessThan(160);
        await expect(extractBody(`<title>Just a moment...</title><main><p>Verify you are human ${paragraph}</p></main>`, root, 'gate')).rejects.toThrow('人机验证');
        await expect(extractBody('<title>Sign in</title><form><input type="password"></form>', root, 'gate')).rejects.toThrow('登录');
    });
    it('uses rendered snapshots on proxy/network failure for discovery, preview and refresh', async () => {
        const { h, reader, root, list } = setup();
        const render = vi.fn(async (url: string) => ({ url, status: 200, headers: {}, body: url === root ? list : article() }));
        h.host.support.render = render;
        vi.spyOn(h.host.support, 'fetch').mockRejectedValue(new Error('network unavailable'));
        const found = await reader.discover(root); expect(found[0].entries).toHaveLength(2);
        const loaded = await reader.article({ ...found[0].entries[0], id: 'rendered' }); expect(loaded.body.text).toContain(paragraph);
        const source = { id: 's', name: 'Site', groups: [], rule: found[0].rule, interval: 0, autoDownload: false, paused: false, imported: 2 };
        expect((await reader.readSource(source)).entries).toHaveLength(2);
    });
    it('renders JS-only shells and recovers a changed embedded-data path on refresh', async () => {
        const { h, reader, root, list } = setup();
        h.routes.set(root, '<main id="app"></main><script src="/app.js"></script>');
        const render = vi.fn(async (url: string) => ({ url, status: 200, headers: {}, body: list })); h.host.support.render = render;
        expect((await reader.discover(root))[0].entries).toHaveLength(2); expect(render).toHaveBeenCalledOnce();
        h.routes.set(root, '<script id="new-data" type="application/json">{"posts":[{"title":"文章","url":"/post"}]}</script>');
        const source = { id: 's', name: 'Site', groups: [], rule: { kind: 'data' as const, url: root, dataPath: 'old-data.posts' }, interval: 0, autoDownload: false, paused: false, imported: 1 };
        expect((await reader.readSource(source)).rule.dataPath).toBe('new-data.posts');
    });
    it('uses alternate Markdown after HTML body extraction fails', async () => {
        const { h, reader, root } = setup();
        h.routes.set(root + 'post', '<link rel="alternate" type="text/markdown" href="/post.md"><main></main>');
        h.routes.set(root + 'post.md', `# Markdown article\n\n${paragraph}\n\n\`\`\`typescript\nconst ok = true;\n\`\`\``);
        const result = await reader.article({ id: 'md', url: root + 'post' });
        expect(result.body.html).toContain('const ok = true;'); expect(result.body.text).toContain(paragraph);
    });
    it('retains old content when both static and rendered attempts fail and explains the stages', async () => {
        const { h, reader, root } = setup();
        h.routes.set(root + 'post', '<main></main>');
        h.host.support.render = vi.fn().mockRejectedValue(new Error('render timeout'));
        await expect(reader.article({ id: 'fail', url: root + 'post' })).rejects.toThrow(/静态正文.*动态网页读取失败.*render timeout/);
    });
    it('shares a four-request HTTP pool across operations', async () => {
        const { h, reader, root, feed } = setup();
        let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
        let running = 0, peak = 0;
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async url => {
            running++; peak = Math.max(peak, running); await gate; running--;
            return { url, status: 200, headers: {}, body: feed() };
        });
        const tasks = Array.from({ length: 7 }, (_, i) => reader.discover(root + `feed-${i}.xml`));
        await Promise.resolve(); expect(peak).toBe(4); release(); await Promise.all(tasks); expect(peak).toBe(4);
    });
    it('preview no longer depends on a separate static-only preflight', async () => {
        const { h, root, list } = setup();
        const service = new Subscriptions(h.host); await service.start(); cleanups.push(() => service.stop());
        h.routes.set(root, list); h.host.support.render = vi.fn(async url => ({ url, status: 200, headers: {}, body: article() }));
        const candidate = (await service.discover(root))[0];
        const details = await service.previewDetails(candidate);
        expect(details.body.text).toContain(paragraph); expect(details.ranges.some(range => range.selector === 'article')).toBe(true);
    });
    it('advances manual history beyond the first three pages without losing entries or read state', async () => {
        const { h, root, feed } = setup();
        const service = new Subscriptions(h.host); await service.start(); cleanups.push(() => service.stop());
        for (let i = 1; i <= 5; i++) h.routes.set(root + `page-${i}.xml`, feed(i < 5 ? `/page-${i + 1}.xml` : undefined, i * 2 - 1, 2));
        const candidate = (await service.discover(root + 'page-1.xml'))[0];
        await service.add(candidate, 'History', [], 1, 0, false, await service.preview(candidate));
        const source = service.repo!.state.sources[0], first = service.repo!.state.articles[0]; first.starred = true; first.read = true;
        await service.refresh(source, true); expect(service.repo!.state.articles).toHaveLength(6); expect(source.historyCursor).toBe(root + 'page-4.xml');
        await service.refresh(source, true); expect(service.repo!.state.articles).toHaveLength(10); expect(source.historyCursor).toBeNull();
        expect(first.starred && first.read).toBe(true); await service.refresh(source, true); expect(service.repo!.state.articles).toHaveLength(10);
    });
});
