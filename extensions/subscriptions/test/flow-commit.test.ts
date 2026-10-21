import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subscriptions } from '../src/service';
import { Repository, ROOT } from '../src/repository';
import { harness } from './helpers';
import { article, feed } from './fixtures';

const cleanups: (() => void)[] = [];
afterEach(() => { vi.restoreAllMocks(); cleanups.splice(0).forEach(cleanup => cleanup()); });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function setup(images = '') {
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanups.push(() => { service.stop(); h.dispose(); });
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    const preview = await service.preview(candidate);
    if (images) {
        h.routes.set(candidate.entries[0].url, article('Preview', images));
        return { h, service, repo: service.repo!, candidate, preview: await service.preview(candidate) };
    }
    return { h, service, repo: service.repo!, candidate, preview };
}
async function added() {
    const context = await setup();
    await context.service.add(context.candidate, '原来源', ['工程'], 20, 0, false, context.preview);
    await context.service.loadBody(context.repo.state.articles[0]);
    return { ...context, source: context.repo.state.sources[0] };
}
describe('explicit commits and add workflow', () => {
    it('rejects a failed source commit, restores memory and disk, and can retry without losing input values', async () => {
        const { h, service, repo, source } = await added();
        const before = structuredClone(source), groups = [...repo.state.groups];
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('Vault is read-only'));
        const settings = { name: '新名称', url: source.rule.url, groups: ['新分组'], interval: 60, autoDownload: true, paused: false };
        await expect(service.updateSource(source, settings)).rejects.toThrow('Vault is read-only');
        expect(source).toEqual(before); expect(repo.state.groups).toEqual(groups);
        const disk = new Repository(h.first.vault); await disk.load(); expect(disk.state.sources[0]).toEqual(before);
        await service.updateSource(source, settings);
        expect(source.name).toBe('新名称'); expect(source.groups).toEqual(['新分组']);
    });
    it('keeps background persistence failures handled rather than introducing unhandled rejected promises', async () => {
        const { service, repo } = await added();
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('background write failed'));
        await expect(service.persist(repo)).resolves.toBeUndefined();
        expect(service.error).toContain('background write failed');
    });
    it('keeps cancellation retryable when its final index write fails after cache removal', async () => {
        const { h, service, repo, source } = await added();
        const persist = repo.persist.bind(repo), articleIds = repo.state.articles.map(article => article.id);
        vi.spyOn(repo, 'persist').mockImplementationOnce(persist).mockRejectedValueOnce(new Error('unsubscribe index write failed'));
        await expect(service.unsubscribe(source, false, false)).rejects.toThrow('unsubscribe index write failed');
        expect(repo.state.sources).toContain(source); expect(repo.state.articles.map(article => article.id)).toEqual(articleIds);
        expect(repo.state.articles.every(article => article.sourceIds.includes(source.id))).toBe(true);
        const reloaded = new Repository(h.first.vault); await reloaded.load(); expect(reloaded.state.sources[0].id).toBe(source.id);
        await service.unsubscribe(source, false, false); expect(repo.state.sources).toHaveLength(0); expect(repo.state.articles).toHaveLength(0);
    });
    it('does not leave a completed history task blocking subsequent ordinary refreshes', async () => {
        const { h, service, repo, source } = await added();
        source.historyCursor = null; h.routes.set(source.rule.url, feed(3));
        const fetch = vi.spyOn(h.host.support, 'fetch');
        await service.refresh(source, true); expect(fetch).not.toHaveBeenCalled();
        await service.refresh(source);
        expect(fetch).toHaveBeenCalledTimes(1); expect(repo.state.articles).toHaveLength(3);
    });
    it('rolls back a failed initial index commit so the same subscription can be retried', async () => {
        const { service, repo, candidate, preview } = await setup();
        vi.spyOn(repo, 'persist').mockRejectedValueOnce(new Error('index write failed'));
        await expect(service.add(candidate, '新来源', ['新分组'], 20, 0, false, preview)).rejects.toThrow('index write failed');
        expect(repo.state.sources).toHaveLength(0); expect(repo.state.articles).toHaveLength(0); expect(repo.state.groups).toEqual([]);
        await service.add(candidate, '新来源', ['新分组'], 20, 0, false, preview);
        expect(repo.state.sources).toHaveLength(1); expect(repo.state.articles).toHaveLength(2);
    });
    it('finishes adding the index while image caching continues with tracked progress in the background', async () => {
        const { h, service, repo, candidate, preview } = await setup('<img src="/slow.png">');
        const pending = gate(), fetch = h.host.support.fetch.bind(h.host.support);
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => { if (binary) await pending.promise; return fetch(url, binary); });
        let committed = false;
        const adding = service.add(candidate, '新来源', [], 20, 0, false, preview).then(() => { committed = true; });
        try {
            await flush(); expect(committed).toBe(true);
            const a = repo.state.articles[0]; expect(service.downloading.has(a.id)).toBe(true);
            expect(a.cache).toMatchObject({ images: 1, missing: 1, pending: true });
            pending.release(); await adding; await service.loadBody(a);
            expect(a.cache).toMatchObject({ missing: 0, pending: false });
        } finally { pending.release(); await adding; }
    });
    it('reports a background preview-cache failure without reversing a successful subscription', async () => {
        const { h, service, repo, candidate, preview } = await setup();
        const write = h.first.vault.writeText.bind(h.first.vault);
        vi.spyOn(h.first.vault, 'writeText').mockImplementation(async (path, value) => { if (path.includes('/bodies/')) throw new Error('body cache write failed'); return write(path, value); });
        await expect(service.add(candidate, '新来源', [], 20, 0, false, preview)).resolves.toBeUndefined();
        await flush();
        expect(repo.state.sources).toHaveLength(1); expect(repo.state.articles).toHaveLength(2);
        expect(service.messages.some(item => item.kind === 'warning' && item.text.includes('缓存'))).toBe(true);
    });
    it('drains the cancelled image task before unsubscribing and leaves no recreated cache files', async () => {
        const { h, service, repo, candidate, preview } = await setup('<img src="/slow.png">');
        const pending = gate(), fetch = h.host.support.fetch.bind(h.host.support);
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => { if (binary) await pending.promise; return fetch(url, binary); });
        const adding = service.add(candidate, '新来源', [], 20, 0, false, preview);
        try {
            await flush();
            const source = repo.state.sources[0], a = repo.state.articles[0];
            const removing = service.unsubscribe(source, false, false);
            pending.release(); await Promise.all([adding, removing]); await flush();
            expect(repo.state.sources).toHaveLength(0); expect(repo.state.articles).toHaveLength(0);
            expect([...h.first.files.keys()].some(path => path.startsWith(`${ROOT}/images/${a.id}`) || path.startsWith(`${ROOT}/bodies/${a.id}`))).toBe(false);
        } finally { pending.release(); await adding; }
    });
    it('does not write late preview images or completion messages into the next Vault', async () => {
        const { h, service, candidate, preview } = await setup('<img src="/slow.png">');
        const pending = gate(), fetch = h.host.support.fetch.bind(h.host.support);
        vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => { if (binary) await pending.promise; return fetch(url, binary); });
        const adding = service.add(candidate, '旧 Vault 来源', [], 20, 0, false, preview);
        try {
            await flush(); await service.switchVault(h.second.vault); pending.release(); await adding; await flush();
            expect(service.repo!.state.sources).toHaveLength(0); expect(service.messages).toHaveLength(0);
            expect([...h.second.files.keys()]).toEqual(['Notes']);
        } finally { pending.release(); await adding; }
    });
    it('loads interrupted cache metadata as partial offline without rewriting it or starting new downloads', async () => {
        const { h, service, repo } = await added(), article = repo.state.articles[0];
        article.cache = { ...article.cache!, images: 2, missing: 1, unsupported: true, pending: true, processed: 1 };
        await repo.persist();
        const stored = h.first.files.get(`${ROOT}/state.json`), fetch = vi.spyOn(h.host.support, 'fetch');
        const reloaded = new Repository(h.first.vault); await reloaded.load();
        expect(reloaded.state.articles[0].cache).toMatchObject({ images: 2, missing: 1, unsupported: true, pending: false, processed: 1 });
        expect(fetch).not.toHaveBeenCalled(); expect(h.first.files.get(`${ROOT}/state.json`)).toBe(stored);
        expect(service.downloading.size).toBe(0);
    });
    it('drains an interrupted preview task before returning to its Vault and clears its orphaned pending flag', async () => {
        const { h, service, repo, candidate, preview } = await setup('<img src="/slow.png">');
        const pending = gate(), fetch = h.host.support.fetch.bind(h.host.support);
        const requests = vi.spyOn(h.host.support, 'fetch').mockImplementation(async (url, binary) => { if (binary) await pending.promise; return fetch(url, binary); });
        let returning: Promise<void> | undefined;
        try {
            await service.add(candidate, '旧 Vault 来源', [], 20, 0, false, preview);
            const article = repo.state.articles[0];
            expect(article.cache).toMatchObject({ pending: true, missing: 1 });
            expect(JSON.parse(h.first.files.get(`${ROOT}/state.json`) as string).articles[0].cache.pending).toBe(true);
            await service.switchVault(h.second.vault);
            const callsBeforeReturn = requests.mock.calls.length;
            let returned = false;
            returning = service.switchVault(h.first.vault).then(() => { returned = true; });
            await flush(); expect(returned).toBe(false); expect(service.loading).toBe(true);
            pending.release(); await returning;
            const restored = service.repo!.state.articles.find(item => item.id === article.id)!;
            expect(restored.cache).toMatchObject({ pending: false, images: 1, missing: 1 });
            expect(service.downloading.has(restored.id)).toBe(false);
            expect(requests.mock.calls.length).toBe(callsBeforeReturn);
            expect(await service.repo!.body(restored)).toBeTruthy();
            expect([...h.second.files.keys()]).toEqual(['Notes']);
        } finally { pending.release(); await returning; }
    });
});
