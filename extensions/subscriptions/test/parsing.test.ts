import { describe, it, expect } from 'vitest';
import { assist, bodyRanges, clean, extractBody, feedLinks, htmlDoc, listCandidates, markdown, parseFeed } from '../src/parse';
import { canonical, relativePath } from '../src/urls';
import { units, documentInputs, documentHtml } from '../src/translation';
import { article, feed, staticList, dynamicList } from './fixtures';
import type { Translation } from '../src/model';
describe('source discovery and identity', () => {
    it('A01 discovers RSS from a homepage and imports available metadata', () => {
        expect(feedLinks(htmlDoc('<link rel="alternate" type="application/rss+xml" href="/rss">', 'https://example.com'), 'https://example.com')).toEqual([{ url: 'https://example.com/rss', name: 'https://example.com/rss' }]);
        const c = parseFeed(feed(), 'https://example.com/rss')!;
        expect(c.entries).toHaveLength(2);
        expect(c.entries[0].published).toBe('2026-10-16T10:00:00.000Z');
        expect(c.entries[1].published).toBeUndefined();
    });
    it('A02 parses namespace-aware Atom alternate links and relative dates', () => {
        const c = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><id>one</id><title>A useful article</title><link rel="self" href="/api/one"/><link rel="alternate" href="/posts/one"/><published>2026-10-16</published><author><name>Author</name></author></entry></feed>', 'https://example.com/atom')!;
        expect(c.entries[0]).toMatchObject({ url: 'https://example.com/posts/one', author: 'Author' });
    });
    it('A03 excludes static navigation, recommendations and unrelated scopes', () => {
        const c = listCandidates(staticList(), 'https://example.com/blog/');
        expect(c).toHaveLength(1);
        expect(c[0].entries).toHaveLength(3);
        expect(c[0].entries.every(e => e.url.includes('/blog/article-'))).toBe(true);
    });
    it('A04 recognizes inert Next hydration JSON without RSS or script execution', () => {
        const c = listCandidates(dynamicList(), 'https://example.com/dynamic/');
        expect(c[0].rule.kind).toBe('data');
        expect(c[0].entries).toHaveLength(3);
    });
    it('A05 narrows candidates by a real example and exposes readable body ranges', () => {
        const all = listCandidates(staticList(), 'https://example.com/blog/');
        expect(assist(all, 'https://example.com/blog/article-2')[0].rule.sample).toContain('article-2');
        expect(assist(all, 'https://example.com/unrelated')).toEqual([]);
        expect(bodyRanges(article(), 'https://example.com/blog/article-1')[0].selector).toBe('article');
    });
    it('A07 rejects invalid feeds and JavaScript-only empty shells', () => {
        expect(parseFeed('<rss>', 'https://example.com')).toBeNull();
        expect(listCandidates('<main id="app"></main><script>throw new Error()</script>', 'https://example.com')).toEqual([]);
    });
    it('A10 strips only tracking parameters and preserves article identity queries', () => {
        expect(canonical('https://EXAMPLE.com/p?id=42&utm_source=x#top')).toBe('https://example.com/p?id=42');
        expect(canonical('https://example.com/p?id=43')).not.toBe(canonical('https://example.com/p?id=42'));
    });
});
describe('safe technical reading and translations', () => {
    it('A19 preserves code, tables, links and math while removing executable content', async () => {
        const b = await extractBody(article('Technical reader', '<p onclick="evil()">Safe paragraph</p><script>evil()</script><img src="/image.png" onerror="evil()">'), 'https://example.com/blog/post', 'one');
        expect(b.html).toContain('const vault = capture();');
        expect(b.html).toContain('<table>');
        expect(b.html).toContain('<math>');
        expect(b.images[0].url).toBe('https://example.com/image.png');
        expect(b.html).not.toMatch(/onclick|onerror|<script/);
        expect(markdown(b.html)).toContain('```typescript');
        expect(markdown(b.html)).toContain('x^2');
    });
    it('rejects short navigation masquerading as an article', async () => {
        await expect(extractBody('<nav>Home</nav>', 'https://example.com', 'one')).rejects.toThrow('提取不完整');
    });
    it('does not permit executable URLs or SVG in reading HTML', () => {
        expect(clean('<img src=x onerror=alert(1)><a href="javascript:alert(1)">a</a><svg onload=alert(1)></svg>')).not.toMatch(/onerror|javascript:|<svg/);
    });
    it('A26 translates a full document while protecting technical resources', async () => {
        const b = await extractBody(article(), 'https://example.com/blog/post', 'one');
        const input = documentInputs(b).join('\n\n');
        expect(input).not.toContain('const vault'); expect(input).not.toContain('readFile(path)'); expect(input).not.toContain('x^2');
        const translated = documentHtml(b, `中文译文\n\n${input}`);
        expect(translated).toContain('readFile(path)'); expect(translated).toContain('const vault = capture();');
        expect(translated).toContain('href="https://example.com/docs"'); expect(translated).toContain('中文译文'); expect(translated).toContain('<table>');
    });
    it('A27 keeps a long natural paragraph whole instead of slicing it every 1600 characters', async () => {
        const b = await extractBody(article('Long', `<p>${'More engineering detail. '.repeat(400)}</p>`), 'https://example.com/long', 'long');
        const u = units(b, 'zh-CN');
        expect(u.filter(x => x.text.includes('More engineering'))).toHaveLength(1);
        expect(u.find(x => x.text.includes('More engineering'))!.text.length).toBeGreaterThan(9000);
        expect(u.map(x => x.text).join('')).toContain('More engineering detail.');
    });
    it('accepts direct prose and strips optional Markdown response fences', async () => {
        const b = await extractBody(article(), 'https://example.com/blog/post', 'one');
        expect(documentHtml(b, '直接返回译文')).toContain('<p>直接返回译文</p>');
        expect(documentHtml(b, '```markdown\n# 中文\n\n完整正文\n```')).toContain('<h1>中文</h1>');
    });
    it('A34 rejects traversal and absolute save directories', () => {
        expect(() => relativePath('../other')).toThrow();
        expect(() => relativePath('/tmp')).toThrow();
        expect(relativePath('Notes/articles')).toBe('Notes/articles');
    });
});
