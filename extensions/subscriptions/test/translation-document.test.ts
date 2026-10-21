import { afterEach, describe, expect, it, vi } from 'vitest';
import { documentInputs, documentHtml, units, progress, translatedBlock } from '../src/translation';
import { Subscriptions } from '../src/service';
import type { Body, Translation } from '../src/model';
import { harness } from './helpers';
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });
function body(html: string): Body {
    return { articleId: 'document-test', version: 'one', html, text: '', blocks: [{ id: 'paragraph', html }], images: [], unsupported: false, fetched: '' };
}
describe('free-form whole-document translation', () => {
    it('sends coherent Markdown and excludes protected code, formulas and image URLs', () => {
        const b = body('<p>Read <strong>the whole paragraph</strong> and <a href="https://example.com/docs">docs</a>, using <code>secretCode()</code> and <math><mi>x</mi></math><img src="https://example.com/image.png"></p>');
        const [input] = documentInputs(b);
        expect(input).toContain('**the whole paragraph**');
        expect(input).toContain('[docs](https://example.com/docs)');
        expect(input).not.toMatch(/secretCode|image\.png|<code|<math|<img/);
        expect(input).toContain('FOLYNKEEP0END');
        const output = documentHtml(b, '阅读 **完整段落** FOLYNKEEP0END FOLYNKEEP1END FOLYNKEEP2END');
        expect(output).toContain('<code>secretCode()</code>');
        expect(output).toContain('<math>'); expect(output).toContain('src="https://example.com/image.png"');
    });
    it('accepts plain prose and Markdown with merged paragraphs or omitted resource markers', () => {
        const b = body('<p>First <code>api()</code>.</p><p>Second.</p>');
        expect(documentHtml(b, '直接返回整篇译文')).toContain('<p>直接返回整篇译文</p>');
        expect(documentHtml(b, '# 标题\n\n合并后的 **段落**。')).toContain('<strong>段落</strong>');
    });
    it('accepts arbitrary HTML structure after sanitizing it', () => {
        const b = body('<p>Original</p>');
        const result = documentHtml(b, '<h2>译文</h2><ul><li onclick="bad()">内容</li></ul><script>bad()</script><a href="javascript:bad()">链接</a><img src="https://evil.invalid/a">');
        expect(result).toContain('<li>内容</li>'); expect(result).not.toMatch(/onclick|javascript|script|evil.invalid/);
    });
    it('only divides long documents at natural boundaries, keeping normal articles in one request', () => {
        const b = body(`<p>${'Long natural prose. '.repeat(1200)}</p>`);
        expect(documentInputs(b)).toHaveLength(1);
        const many = { ...b, blocks: Array.from({ length: 150 }, (_, i) => ({ id: String(i), html: `<p>Paragraph ${i} with <em>emphasis</em>.</p>` })) };
        expect(documentInputs(many)).toHaveLength(1);
        const long = { ...b, blocks: Array.from({ length: 4 }, (_, i) => ({ id: String(i), html: b.html })) };
        expect(documentInputs(long)).toHaveLength(2);
        // A long paragraph is not divided into arbitrary text-node fragments.
        expect(documentInputs(body(`<p>${'Long prose. '.repeat(5000)}</p>`))).toHaveLength(1);
    });
    it('reads both legacy formats and upgrades failed legacy translations to free-form output', async () => {
        const h = harness(), service = new Subscriptions(h.host);
        await service.start(); cleanup = () => { service.stop(); h.dispose(); };
        const candidate = (await service.discover('https://example.com/feed.xml'))[0];
        await service.add(candidate, '旧缓存测试', [], 2, 0, false, await service.preview(candidate));
        const repo = service.repo!, article = repo.state.articles[0], b = await service.loadBody(article);
        const oldUnits = units(b, 'zh-CN', 'text-nodes');
        const old: Translation = { version: b.version, language: 'zh-CN', provider: 'mock', model: 'old', values: Object.fromEntries(oldUnits.map(unit => [unit.key, '以前的译文'])), errors: {}, cancelled: false };
        await repo.putTranslation(article, old);
        expect(b.blocks.map(block => translatedBlock(block.html, block.id, old)).join('')).toContain('以前的译文');
        const chat = vi.spyOn(h.host.api.ai, 'chat');
        await service.translate(article, b, { provider: 'mock', model: 'old' }); expect(chat).not.toHaveBeenCalled();
        delete old.values[oldUnits[0].key]; await repo.putTranslation(article, old);
        await service.translate(article, b, { provider: 'mock', model: 'old' });
        expect(chat).toHaveBeenCalledOnce(); expect(chat.mock.calls[0][0].prompt).toContain('<article-text>');
        expect((await repo.translation(article, b.version, 'zh-CN'))?.format).toBe('document');
        const htmlOld: Translation = { ...old, format: 'html-blocks', values: { [`block:${b.blocks[0].id}`]: '<p>旧版 HTML 译文</p>' }, errors: { 'block:b1': '译文正文不完整' } };
        expect(translatedBlock(b.blocks[0].html, b.blocks[0].id, htmlOld)).toContain('旧版 HTML 译文');
        await repo.putTranslation(article, htmlOld); await service.translate(article, b, { provider: 'mock', model: 'old' });
        expect((await repo.translation(article, b.version, 'zh-CN'))?.errors).toEqual({});
        expect(progress(b, await repo.translation(article, b.version, 'zh-CN'), 'zh-CN').done).toBe(1);
    });
    it('keeps nonempty streamed text incomplete on a provider error rather than discarding it', async () => {
        const h = harness(), service = new Subscriptions(h.host);
        await service.start(); cleanup = () => { service.stop(); h.dispose(); };
        const candidate = (await service.discover('https://example.com/feed.xml'))[0];
        await service.add(candidate, '中断测试', [], 1, 0, false, await service.preview(candidate));
        const repo = service.repo!, article = repo.state.articles[0], b = await service.loadBody(article);
        vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => { request.onEvent({ type: 'text', content: '已经返回的正文' }); throw new Error('connection lost'); });
        await service.translate(article, b, { provider: 'mock', model: 'test' });
        const cached = (await repo.translation(article, b.version, 'zh-CN'))!;
        expect(cached.document).toMatchObject({ content: '已经返回的正文', complete: false });
        expect(Object.values(cached.errors)).toContain('connection lost');
    });
    it.each(['empty', 'error-event'])('does not cache %s as a completed translation or retry automatically', async kind => {
        const h = harness(), service = new Subscriptions(h.host);
        await service.start(); cleanup = () => { service.stop(); h.dispose(); };
        const candidate = (await service.discover('https://example.com/feed.xml'))[0];
        await service.add(candidate, '失败测试', [], 1, 0, false, await service.preview(candidate));
        const repo = service.repo!, article = repo.state.articles[0], b = await service.loadBody(article);
        const chat = vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            if (kind === 'error-event') { request.onEvent({ type: 'text', content: '部分正文' }); request.onEvent({ type: 'error', content: 'provider error' }); }
        });
        await service.translate(article, b, { provider: 'mock', model: 'test' });
        const cached = (await repo.translation(article, b.version, 'zh-CN'))!;
        expect(cached.document!.complete).toBe(false); expect(Object.keys(cached.errors)).toHaveLength(1);
        expect(cached.document!.content).toBe(kind === 'empty' ? '' : '部分正文'); expect(chat).toHaveBeenCalledOnce();
    });

});
