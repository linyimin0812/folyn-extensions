import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subscriptions } from '../src/service';
import { Repository } from '../src/repository';
import { harness } from './helpers';
import { feed } from './fixtures';

const cleanups: (() => void)[] = [];
afterEach(() => { cleanups.splice(0).forEach(cleanup => cleanup()); vi.restoreAllMocks(); });
async function setup() {
    const h = harness(), service = new Subscriptions(h.host);
    await service.start();
    cleanups.push(() => { service.stop(); h.dispose(); });
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, '原来源', ['工程'], 20, 0, false, await service.preview(candidate));
    const source = service.repo!.state.sources[0];
    const settings = { name: source.name, groups: source.groups, url: source.rule.url, interval: 0, paused: false, autoDownload: false };
    return { h, service, source, settings };
}
describe('source settings', () => {
    it('validates a changed URL and keeps source identity, article state and cached content', async () => {
        const { h, service, source, settings } = await setup();
        const repo = service.repo!, beforeId = source.id;
        repo.state.articles[0].starred = true;
        const articles = structuredClone(repo.state.articles);
        const bodyFiles = [...h.first.files.keys()].filter(path => path.includes('/bodies/'));
        h.routes.set('https://example.com/new-feed.xml', feed(4));
        await service.updateSource(source, { ...settings, name: '新名称', groups: ['工程', '前端'], url: 'example.com/new-feed.xml', autoDownload: true });
        expect(source.id).toBe(beforeId);
        expect(source.rule.url).toBe('https://example.com/new-feed.xml');
        expect(source.groups).toEqual(['工程', '前端']);
        expect(repo.state.articles).toEqual(articles);
        expect(bodyFiles.every(path => h.first.files.has(path))).toBe(true);
        const reloaded = new Repository(h.first.vault);
        await reloaded.load();
        expect(reloaded.state.sources[0].rule.url).toBe(source.rule.url);
        await service.refresh(source);
        expect(repo.state.articles).toHaveLength(4);
    });
    it('failed URL or body validation leaves all original settings untouched', async () => {
        const { h, service, source, settings } = await setup();
        const before = structuredClone(source);
        await expect(service.updateSource(source, { ...settings, name: '不要保存', url: 'file:///tmp/feed.xml' })).rejects.toThrow();
        h.routes.set('https://example.com/broken.xml', feed());
        vi.spyOn(service, 'preview').mockRejectedValueOnce(new Error('正文不可读取'));
        await expect(service.updateSource(source, { ...settings, name: '不要保存', groups: ['不要创建'], url: 'https://example.com/broken.xml' })).rejects.toThrow('正文不可读取');
        expect(source).toEqual(before);
        expect(service.repo!.state.groups).not.toContain('不要创建');
    });
    it('rejects a URL already owned by another subscription', async () => {
        const { h, service, source, settings } = await setup();
        h.routes.set('https://example.com/other.xml', feed());
        const candidate = (await service.discover('https://example.com/other.xml'))[0];
        await service.add(candidate, '另一个来源', [], 20, 0, false, await service.preview(candidate));
        await expect(service.updateSource(source, { ...settings, url: candidate.rule.url })).rejects.toThrow('已被其他订阅源使用');
        expect(source.rule.url).toBe(settings.url);
        expect(service.repo!.state.sources).toHaveLength(2);
    });
    it('enforces mutually exclusive paused and automatic download states without network on unchanged URLs', async () => {
        const { service, source, settings } = await setup();
        const discover = vi.spyOn(service, 'discover');
        await service.updateSource(source, { ...settings, paused: true, autoDownload: true });
        expect([source.paused, source.autoDownload]).toEqual([true, false]);
        await service.updateSource(source, { ...settings, paused: false, autoDownload: true });
        expect([source.paused, source.autoDownload]).toEqual([false, true]);
        await service.updateSource(source, { ...settings, paused: false, autoDownload: false });
        expect([source.paused, source.autoDownload]).toEqual([false, false]);
        expect(discover).not.toHaveBeenCalled();
    });
    it('discards URL verification results after changing Vault', async () => {
        const { h, service, source, settings } = await setup();
        const before = structuredClone(source), repo = service.repo!;
        h.routes.set('https://example.com/new.xml', feed());
        const preview = service.preview.bind(service);
        vi.spyOn(service, 'preview').mockImplementationOnce(async candidate => {
            await service.switchVault(h.second.vault);
            return preview(candidate);
        });
        await expect(service.updateSource(source, { ...settings, name: '迟到更改', url: 'https://example.com/new.xml' })).rejects.toThrow('取消');
        expect(repo.state.sources[0]).toEqual(before);
        expect(service.repo!.state.sources).toHaveLength(0);
    });
});
