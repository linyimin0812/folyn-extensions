import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subscriptions } from '../src/service';
import { units, progress, documentInputs } from '../src/translation';
import { htmlDoc } from '../src/parse';
import { harness } from './helpers';


let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.useRealTimers(); vi.restoreAllMocks(); });
async function setup(count = 24, length = 60) {
    const h = harness(), service = new Subscriptions(h.host);
    await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, '翻译性能样例', [], 3, 0, false, await service.preview(candidate));
    const repo = service.repo!, article = repo.state.articles[0], body = await service.loadBody(article);
    body.blocks = Array.from({ length: count }, (_, i) => ({ id: `perf-${i}`, html: `<p>Fragment ${i}: ${'engineering '.repeat(Math.ceil(length / 12))}</p>` }));
    return { h, service, repo, article, body };
}
function fragments(prompt: string): string[] {
    return [prompt.split('<article-text>\n')[1].split('\n</article-text>')[0]];
}
function gate() {
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
}
describe('translation scheduling performance', () => {
    it('translates an ordinary article in one document request and one latency wave', async () => {
        vi.useFakeTimers();
        const { h, service, repo, article, body } = await setup();
        const original = h.host.api.ai.chat;
        let active = 0, peak = 0, elapsed = -1;
        const chat = vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            active++; peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, 100));
            await original(request); active--;
        });
        const write = vi.spyOn(h.first.vault.data, 'writeText');
        const started = Date.now();
        const task = service.translate(article, body, { provider: 'mock', model: 'test' }).then(() => { elapsed = Date.now() - started; });
        await vi.advanceTimersByTimeAsync(3000); await task;
        const cached = await repo.translation(article, body.version, 'zh-CN');
        console.log(JSON.stringify({ fragments: units(body, 'zh-CN').length, requests: chat.mock.calls.length, peak, elapsedMs: elapsed, writes: write.mock.calls.length }));
        expect(progress(body, cached, 'zh-CN')).toMatchObject({ total: 1, done: 1, failed: 0 });
        expect(chat.mock.calls.length).toBe(1);
        expect(chat.mock.calls[0][0].prompt).toContain('<article-text>');
        expect(peak).toBe(1);
        expect(elapsed).toBeLessThanOrEqual(100);
        expect(write.mock.calls.length).toBeLessThanOrEqual(6);
    });
    it('bounds encoded batch input while keeping every long fragment in original order', async () => {
        const { h, service, repo, article, body } = await setup(18, 6000);
        const original = h.host.api.ai.chat, sent: string[] = [];
        const chat = vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            const batch = fragments(request.prompt);
            expect(batch[0].length).toBeLessThanOrEqual(48000);
            sent.push(...batch);
            await original(request);
        });
        await service.translate(article, body, { provider: 'mock', model: 'test' });
        expect(sent).toEqual(documentInputs(body));
        const cached = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(cached.document!.content).toBe(sent.map(text => `译文：${text}`).join('\n\n'));
        const count = chat.mock.calls.length;
        await service.translate(article, body, { provider: 'mock', model: 'test' });
        expect(chat).toHaveBeenCalledTimes(count);

    });
    it('limits simultaneous requests across multiple articles, even when batches finish out of order', async () => {
        vi.useFakeTimers();
        const { h, service, repo, article, body } = await setup(24);
        const other = repo.state.articles[1], otherBody = await service.loadBody(other);
        otherBody.blocks = body.blocks;
        const original = h.host.api.ai.chat;
        let active = 0, peak = 0, calls = 0;
        vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            active++; peak = Math.max(peak, active);
            await new Promise(resolve => setTimeout(resolve, ++calls % 2 ? 200 : 100));
            await original(request); active--;
        });
        const task = Promise.all([service.translate(article, body, { provider: 'mock', model: 'test' }), service.translate(other, otherBody, { provider: 'mock', model: 'test' })]);
        await vi.advanceTimersByTimeAsync(2000); await task;
        expect(peak).toBe(2);
        for (const [a, b] of [[article, body], [other, otherBody]] as const) {
            const cached = await repo.translation(a, b.version, 'zh-CN');
            expect(progress(b, cached, 'zh-CN')).toMatchObject({ done: 1, failed: 0 });
            expect(cached!.document!.content).toBe(documentInputs(b).map(text => `译文：${text}`).join('\n\n'));
        }
    });
    it('preserves completed batches on cancellation, discards late results and resumes only missing fragments', async () => {
        const { h, service, repo, article, body } = await setup(24, 6000);
        const original = h.host.api.ai.chat, slow = gate(), completed = gate();
        let calls = 0;
        const unsubscribe = service.subscribe(() => { if (service.translationStream(repo, article, body.version, 'zh-CN')?.translation.document?.parts.some(part => part.complete)) completed.release(); });
        const chat = vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            if (++calls > 1) await slow.promise;
            await original(request);
        });
        const first = service.translate(article, body, { provider: 'mock', model: 'test' });
        const duplicate = service.translate(article, body, { provider: 'mock', model: 'test' });
        await completed.promise;
        service.cancelTranslation(article); slow.release();
        await Promise.all([first, duplicate]); unsubscribe();
        const cached = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(cached.cancelled).toBe(true);
        expect(cached.document!.parts.filter(part => part.complete)).toHaveLength(1);
        expect(calls).toBeLessThanOrEqual(3);
        const previous = cached.document!.parts.filter(part => part.complete).map(part => part.content);
        chat.mockClear();
        await service.translate(article, body, { provider: 'mock', model: 'test' });
        expect(chat).toHaveBeenCalledTimes(documentInputs(body).length - previous.length);
        const resumed = await repo.translation(article, body.version, 'zh-CN');
        expect(progress(body, resumed, 'zh-CN').done).toBe(documentInputs(body).length);
        expect(resumed!.document!.parts.filter(part => previous.includes(part.content))).toHaveLength(previous.length);
    });
    it('does not dispatch queued requests or accept late responses after a Vault switch', async () => {
        const { h, service, repo, article, body } = await setup(24, 6000);
        const other = repo.state.articles[1], otherBody = await service.loadBody(other);
        otherBody.blocks = body.blocks;
        const original = h.host.api.ai.chat, started = gate(), slow = gate();
        let calls = 0;
        vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            if (++calls === 2) started.release();
            await slow.promise; await original(request);
        });
        const tasks = [service.translate(article, body, { provider: 'mock', model: 'test' }), service.translate(other, otherBody, { provider: 'mock', model: 'test' })];
        await started.promise;
        await service.switchVault(h.second.vault);
        slow.release(); await Promise.all(tasks);
        expect(calls).toBe(2);
        expect([...h.second.dataFiles.keys()].some(path => path.includes('/translations/'))).toBe(false);
        for (const [a, b] of [[article, body], [other, otherBody]] as const) {
            const cached = await repo.translation(a, b.version, 'zh-CN');
            expect(cached?.cancelled).toBe(true);
            expect(Object.keys(cached?.values || {})).toHaveLength(0);
        }
        await service.switchVault(h.first.vault);
        expect(service.repo!.state.articles.map(article => article.id)).toEqual(repo.state.articles.map(article => article.id));
    });
    it('accepts free-form prose without wrappers or matching source paragraphs', async () => {
        const { h, service, repo, article, body } = await setup(16);
        const raw = '# 完整译文\n\n自然合并段落，并保留 **重点**。';
        const chat = vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => { request.onEvent({ type: 'text', content: raw }); });
        await service.translate(article, body, { provider: 'mock', model: 'test' });
        const cached = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(cached.document).toMatchObject({ content: raw, complete: true });
        expect(cached.values).toEqual({}); expect(cached.errors).toEqual({});
        expect(chat).toHaveBeenCalledOnce();
        await service.translate(article, body, { provider: 'mock', model: 'test' });
        expect(chat).toHaveBeenCalledOnce();
    });
    it('does not multiply rate-limited batch failures into individual network retries', async () => {
        const { h, service, repo, article, body } = await setup(24);
        const chat = vi.spyOn(h.host.api.ai, 'chat').mockRejectedValue(new Error('HTTP 429'));
        await service.translate(article, body, { provider: 'mock', model: 'test' });
        expect(chat).toHaveBeenCalledTimes(1);
        expect(progress(body, await repo.translation(article, body.version, 'zh-CN'), 'zh-CN')).toEqual({ total: 1, done: 0, failed: 1 });
    });
    it('drains in-flight work after a checkpoint failure before allowing a new task', async () => {
        const { h, service, repo, article, body } = await setup(24, 6000);
        const original = h.host.api.ai.chat, slow = gate(), failed = gate();
        let calls = 0, settled = false;
        vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async request => {
            if (++calls > 1) await slow.promise;
            await original(request);
        });
        const write = h.first.vault.data.writeText;
        vi.spyOn(h.first.vault.data, 'writeText').mockImplementation(async (path, value) => {
            if (path.includes('/translations/')) { failed.release(); throw new Error('disk full'); }
            return write(path, value);
        });
        const task = service.translate(article, body, { provider: 'mock', model: 'test' }).then(() => { settled = true; });
        await failed.promise;
        expect(settled).toBe(false);
        expect(service.translating.has(article.id)).toBe(true);
        slow.release(); await task;
        expect(calls).toBe(2);
        expect(service.translating.has(article.id)).toBe(false);
        expect(service.error).toContain('disk full');
        expect(await repo.translation(article, body.version, 'zh-CN')).toBeUndefined();
    });
});
