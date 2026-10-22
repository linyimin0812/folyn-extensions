import { afterEach, describe, it, expect, vi } from 'vitest';
import { Subscriptions } from '../src/service';
import { Repository, ROOT } from '../src/repository';
import { extractBody, htmlDoc } from '../src/parse';
import { progress } from '../src/translation';
import { harness } from './helpers';
import { article, feed, staticList, dynamicList } from './fixtures';
const cleanups: (() => void)[] = [];
afterEach(() => {
    cleanups.splice(0).forEach(f => f());
    vi.restoreAllMocks();
});
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
async function add(s: Subscriptions, url = 'https://example.com/feed.xml', count = 20) {
    const c = (await s.discover(url))[0];
    const preview = await s.preview(c);
    await s.add(c, c.name, [], count, 0, false, preview);
    return s.repo!.state.sources[0];
}
describe('sources and persistence', () => {
    it('retains the subscription and article membership if cache removal fails so cancellation can be retried', async () => {
        const { h, s } = await setup();
        const source = await add(s);
        const repo = s.repo!, ids = repo.state.articles.map(a => a.id);
        const remove = h.first.vault.data.remove;
        h.first.vault.data.remove = async () => { throw new Error('Operation not permitted (os error 1)'); };
        await expect(s.unsubscribe(source, false, false)).rejects.toThrow('Operation not permitted (os error 1)');
        expect(repo.state.sources).toContain(source);
        expect(repo.state.articles.map(a => a.id)).toEqual(ids);
        expect(repo.state.articles.every(a => a.sourceIds.includes(source.id))).toBe(true);
        const reloaded = new Repository(h.first.vault); await reloaded.load();
        expect(reloaded.state.sources.some(s => s.id === source.id)).toBe(true);
        h.first.vault.data.remove = remove;
        await s.unsubscribe(source, false, false);
        expect(repo.state.sources).toHaveLength(0); expect(repo.state.articles).toHaveLength(0);
    });
    it('A01 + A08 imports real entries only after preview and prevents same-vault duplicate sources', async () => {
        const { s } = await setup();
        await add(s);
        expect(s.repo!.state.articles).toHaveLength(2);
        await expect(add(s)).rejects.toThrow('已订阅');
        expect(s.repo!.state.sources).toHaveLength(1);
    });
    it('A03 + A04 detects new static and hydration-only entries on refresh', async () => {
        for (const [url, list] of [['https://example.com/blog/', staticList], ['https://example.com/dynamic/', dynamicList]] as const) {
            const { h, s } = await setup();
            const source = await add(s, url);
            expect(s.repo!.state.articles).toHaveLength(3);
            h.routes.set(url, list(4));
            await s.refresh(source);
            expect(s.repo!.state.articles).toHaveLength(4);
            expect(source.error).toBeUndefined();
        }
    });
    it('A09 limits initial import and loads additional discoverable history without duplicates', async () => {
        const { h, s } = await setup();
        h.routes.set('https://example.com/feed.xml', feed(35));
        const source = await add(s, undefined, 20);
        expect(s.repo!.state.articles).toHaveLength(20);
        await s.refresh(source, true);
        expect(s.repo!.state.articles).toHaveLength(35);
        await s.refresh(source, true);
        expect(s.repo!.state.articles).toHaveLength(35);
    });
    it('A10 + A11 merges canonical URLs across sources but does not merge different URLs by title', async () => {
        const { s } = await setup();
        const source = await add(s);
        const repo = s.repo!;
        const original = repo.state.articles[0];
        original.starred = true;
        const second = { ...source, id: 'source-two' };
        repo.state.sources.push(second);
        s.merge(repo, second, [{ url: original.url + '?utm_campaign=x#read', title: original.title, summary: '' }]);
        expect(repo.state.articles).toHaveLength(2);
        expect(original.sourceIds).toContain('source-two');
        s.merge(repo, second, [{ url: 'https://example.com/blog/different', title: original.title, summary: '' }]);
        expect(repo.state.articles).toHaveLength(3);
        await s.unsubscribe(source, false, false);
        expect(repo.state.articles.find(a => a.id === original.id)?.starred).toBe(true);
    });
    it('A12 + A13 failed or implausible refresh retains previous success and existing content', async () => {
        const { h, s } = await setup();
        const source = await add(s, 'https://example.com/blog/');
        const previous = source.lastSuccess;
        h.routes.set(source.rule.url, '<main><p>Sign in</p></main>');
        await s.refresh(source);
        expect(source.error).toContain('结构');
        expect(source.lastSuccess).toBe(previous);
        expect(s.repo!.state.articles).toHaveLength(3);
    });
    it('A35 keeps starred or saved orphan records and never removes official Markdown', async () => {
        const { h, s } = await setup();
        const source = await add(s);
        const [a, b] = s.repo!.state.articles;
        a.starred = true;
        b.saved.push({ path: 'Notes/user.md', mode: 'original', savedAt: '2026-10-17' });
        h.first.files.set('Notes/user.md', 'edited by user');
        await s.unsubscribe(source, true, true);
        expect(s.repo!.state.articles).toHaveLength(2);
        expect(s.repo!.state.articles.every(a => !a.sourceIds.length)).toBe(true);
        expect(h.first.files.get('Notes/user.md')).toBe('edited by user');
    });
    it('A36 + A38 restores isolated vault source state across switching and reload', async () => {
        const { h, s } = await setup();
        await add(s);
        s.repo!.state.articles[0].starred = true;
        await s.persist();
        await s.switchVault(h.second.vault);
        expect(s.repo!.state.articles).toHaveLength(0);
        await add(s);
        expect(s.repo!.state.articles[0].starred).toBe(false);
        await s.switchVault(h.first.vault);
        expect(s.repo!.state.articles[0].starred).toBe(true);
        const reloaded = new Repository(h.first.vault);
        await reloaded.load();
        expect(reloaded.state.sources).toHaveLength(1);
    });
    it('A40 one failed source does not discard another source refresh', async () => {
        const { h, s } = await setup();
        const source = await add(s);
        const second = { ...source, id: 'two', rule: { kind: 'feed' as const, url: 'https://example.com/fail.xml' } };
        s.repo!.state.sources.push(second);
        h.routes.set(source.rule.url, feed(3));
        await s.refreshAll();
        expect(s.repo!.state.articles).toHaveLength(3);
        expect(second.error).toContain('404');
        expect(source.error).toBeUndefined();
    });
});
describe('body, translation and saving', () => {
    it('A21 + A22 caches on demand, does not mark background content read, and shares duplicate tasks', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[1];
        const fetch = vi.spyOn(h.host.support, 'fetch');
        const [one, two] = await Promise.all([s.loadBody(a), s.loadBody(a)]);
        expect(one.version).toBe(two.version);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(a.read).toBe(false);
        fetch.mockRejectedValue(new Error('offline'));
        expect((await s.loadBody(a)).version).toBe(one.version);
    });
    it('A23 + A24 clears cache but retains official images and metadata', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0];
        h.routes.set(a.url, article('Images', '<img src="/picture.png" alt="Architecture">'));
        const body = await s.loadBody(a, true);
        expect(a.cache?.missing).toBe(0);
        await s.save(a, body, 'original', 'Notes', 'Article', false, false, false);
        const file = a.saved[0].path;
        const content = h.first.files.get(file) as string;
        expect(content).toContain('assets/');
        expect(content).toContain('![');
        const formalImages = [...h.first.files.keys()].filter(k => k.startsWith('Notes/assets/'));
        expect(formalImages).toHaveLength(1);
        await s.repo!.clear([a], true);
        expect(a.cache).toBeUndefined();
        expect(h.first.files.has(file)).toBe(true);
        expect(formalImages.every(p => h.first.files.has(p))).toBe(true);
        expect(a.saved).toHaveLength(1);
    });
    it('failed refetch never replaces a readable previous body', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0];
        const previous = await s.loadBody(a);
        h.routes.set(a.url, '<nav>Sign in</nav>');
        await expect(s.loadBody(a, true)).rejects.toThrow();
        expect((await s.repo!.body(a))?.version).toBe(previous.version);
    });
    it('A27 + A28 keeps partial translation and resumes only failed fragments', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        body.blocks = Array.from({ length: 3 }, (_, i) => ({ id: `large-${i}`, html: `<p>Large natural paragraph ${i}: ${'engineering '.repeat(1800)}</p>` }));
        const chat = h.host.api.ai.chat;
        let n = 0;
        let failed: string[] = [];
        vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async (p) => {
            if (++n === 2) {
                failed = [p.prompt.split('<article-text>\n')[1].split('\n</article-text>')[0]];
                throw new Error('temporary model failure');
            }
            return chat(p);
        });
        await s.translate(a, body, { provider: 'mock', model: 'test' });
        let t = await s.repo!.translation(a, body.version, 'zh-CN');
        expect(failed.length).toBeGreaterThan(0);
        expect(progress(body, t, 'zh-CN').failed).toBe(failed.length);
        const successful = t!.document!.parts.filter(part => part.complete).map(part => part.content);
        const previous = n;
        await s.translate(a, body, { provider: 'mock', model: 'test' });
        expect(n - previous).toBe(1);
        t = await s.repo!.translation(a, body.version, 'zh-CN');
        expect(progress(body, t, 'zh-CN').done).toBe(progress(body, t, 'zh-CN').total);
        expect(t!.document!.parts.filter(part => successful.includes(part.content))).toHaveLength(successful.length);
        const completed = n;
        await s.translate(a, body, { provider: 'mock', model: 'test' });
        expect(n).toBe(completed);
    });
    it('A28 cancel retains completed fragments and does not create parallel duplicate jobs', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        body.blocks = Array.from({ length: 3 }, (_, i) => ({ id: `large-${i}`, html: `<p>Large natural paragraph ${i}: ${'engineering '.repeat(1800)}</p>` }));
        const chat = h.host.api.ai.chat;
        let n = 0;
        let firstBatchSize = 0, cancelled = false;
        let release!: () => void;
        const delayed = new Promise<void>(resolve => { release = resolve; });
        const subscription = s.subscribe(() => {
            if (!cancelled && s.translationStream(s.repo!, a, body.version, 'zh-CN')?.translation.document?.parts.some(part => part.complete)) {
                cancelled = true;
                s.cancelTranslation(a);
                release();
            }
        });
        vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async (p) => {
            n++;
            if (n === 1) firstBatchSize = 1;
            if (n === 2) await delayed;
            await chat(p);
        });
        await Promise.all([s.translate(a, body, { provider: 'mock', model: 'test' }), s.translate(a, body, { provider: 'mock', model: 'test' })]);
        subscription();
        const t = await s.repo!.translation(a, body.version, 'zh-CN');
        expect(t?.cancelled).toBe(true);
        expect(n).toBe(2);
        expect(t?.document?.parts.filter(part => part.complete)).toHaveLength(firstBatchSize);
    });
    it('A31 rejects silent partial translation and A33 protects existing edited files', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        await expect(s.save(a, body, 'translated', 'Notes', 'Draft', false, false, false)).rejects.toThrow('译文尚未完成');
        const first = await s.save(a, body, 'original', 'Notes', 'Article', false, false, false);
        h.first.files.set(first, 'user edited');
        await expect(s.save(a, body, 'original', 'Notes', 'Article', false, false, false)).rejects.toThrow('已有');
        const second = await s.save(a, body, 'original', 'Notes', 'Article', false, false, true);
        expect(second).not.toBe(first);
        expect(h.first.files.get(first)).toBe('user edited');
    });
    it('A32 missing images require explicit remote-link choice', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0];
        h.routes.set(a.url, article('Missing', '<img src="/broken.png">'));
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => {
            if (binary)
                throw new Error('missing image');
            return { url, status: 200, headers: {}, body: h.routes.get(url) || article() };
        });
        const body = await s.loadBody(a, true);
        expect(a.cache?.missing).toBe(1);
        await expect(s.save(a, body, 'original', 'Notes', 'Missing', false, false, false)).rejects.toThrow('未缓存');
        const path = await s.save(a, body, 'original', 'Notes', 'Missing', false, true, false);
        expect(h.first.files.get(path)).toContain('需联网查看');
    });
    it('A34 failure writing the document never marks the article saved', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        vi.spyOn(h.first.vault, 'createText').mockRejectedValue(new Error('disk full'));
        await expect(s.save(a, body, 'original', 'Notes', 'Fail', false, false, false)).rejects.toThrow('disk full');
        expect(a.saved).toEqual([]);
    });
    it('A37 a delayed article result cannot mutate a new vault', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[1];
        let release!: (v: {
            url: string;
            status: number;
            headers: {};
            body: string;
        }) => void;
        vi.spyOn(h.host.support, 'fetch').mockImplementation(url => new Promise(resolve => {
            release = resolve;
        }));
        const task = s.loadBody(a);
        await vi.waitFor(() => expect(release).toBeDefined());
        await s.switchVault(h.second.vault);
        release({ url: a.url, status: 200, headers: {}, body: article() });
        await expect(task).rejects.toThrow('取消');
        expect(s.repo!.state.articles).toHaveLength(0);
        expect([...h.second.dataFiles.keys()].some(k => k.startsWith(ROOT))).toBe(false);
    });
    it('A37 saving continues only into the captured original vault after a switch', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        const original = h.first.vault.createText;
        vi.spyOn(h.first.vault, 'createText').mockImplementation(async (path, content) => {
            await s.switchVault(h.second.vault);
            return original(path, content);
        });
        const path = await s.save(a, body, 'original', 'Notes', 'Pinned', false, false, false);
        expect(h.first.files.has(path)).toBe(true);
        expect(h.second.files.has(path)).toBe(false);
        expect(s.repo!.state.articles).toHaveLength(0);
    });
});
describe('final ownership and translation regressions', () => {
    it('stateless article translation never asks the host to persist chat history', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        const chat = vi.spyOn(h.host.api.ai, 'chat');
        await s.translate(a, body, { provider: 'mock', model: 'test' });
        expect(chat.mock.calls.every(([request]) => (request as {
            persistHistory?: boolean;
        }).persistHistory === false)).toBe(true);
    });
    it('retains previous whole translation after failed retranslation and retries explicitly', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        await s.translate(a, body, { provider: 'mock', model: 'old' });
        const previous = await s.repo!.translation(a, body.version, 'zh-CN');
        vi.spyOn(h.host.api.ai, 'chat').mockRejectedValue(new Error('new model offline'));
        await s.translate(a, body, { provider: 'mock', model: 'new' }, true);
        let current = await s.repo!.translation(a, body.version, 'zh-CN');
        expect(current?.document?.content).toEqual(previous?.document?.content);
        expect(progress(body, current, 'zh-CN').done).toBe(0);
        const chosen = Object.keys(current!.errors)[0];
        const count = vi.mocked(h.host.api.ai.chat).mock.calls.length;
        await s.translate(a, body, { provider: 'mock', model: 'new' }, false, chosen);
        expect(vi.mocked(h.host.api.ai.chat).mock.calls.length - count).toBe(1);
    });
    it('saves at the vault root without absolute-path escape', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        const path = await s.save(a, body, 'original', '.', 'Root article', false, false, false);
        expect(path).toBe('Root article.md');
        expect(h.first.files.has(path)).toBe(true);
    });
    it('reopening the original vault drains an older delayed save before reloading state', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], body = await s.loadBody(a);
        const write = h.first.vault.createText;
        let release!: () => void;
        vi.spyOn(h.first.vault, 'createText').mockImplementation(async (path, value) => {
            await new Promise<void>(resolve => {
                release = resolve;
            });
            await write(path, value);
        });
        const save = s.save(a, body, 'original', 'Notes', 'Late', false, false, false);
        await vi.waitFor(() => expect(release).toBeDefined());
        await s.switchVault(h.second.vault);
        const reopen = s.switchVault(h.first.vault);
        expect(s.repo).toBeUndefined();
        release();
        const path = await save;
        await reopen;
        expect(s.repo!.state.articles.find(x => x.id === a.id)?.saved[0].path).toBe(path);
    });
});
describe('canonical redirects and body versions', () => {
    it('retains old version translations after a verified body refresh', async () => {
        const { h, s } = await setup();
        await add(s);
        const a = s.repo!.state.articles[0], old = await s.loadBody(a);
        await s.translate(a, old, { provider: 'mock', model: 'test' });
        h.routes.set(a.url, article('Updated', '<p>A newly added paragraph changes the source version.</p>'));
        const next = await s.loadBody(a, true);
        expect(next.version).not.toBe(old.version);
        expect(a.translationVersion).toBe(old.version);
        expect((await s.repo!.bodyAt(a.id, old.version))?.version).toBe(old.version);
        expect(await s.repo!.translation(a, old.version, 'zh-CN')).toBeDefined();
        expect(await s.repo!.translation(a, next.version, 'zh-CN')).toBeUndefined();
    });
    it('redirect aliases prevent the final canonical URL from creating a second article', async () => {
        const { h, s } = await setup();
        const source = await add(s);
        const a = s.repo!.state.articles[1], oldUrl = a.url;
        vi.spyOn(h.host.support, 'fetch').mockResolvedValue({ url: 'https://example.com/blog/canonical-2', status: 200, headers: {}, body: article() });
        await s.loadBody(a);
        expect(a.url).toBe('https://example.com/blog/canonical-2');
        expect(a.aliases).toContain(oldUrl);
        s.merge(s.repo!, source, [{ url: a.url, title: a.title, summary: '' }, { url: oldUrl, title: a.title, summary: '' }]);
        expect(s.repo!.state.articles).toHaveLength(2);
    });
});
