import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { Subscriptions } from '../src/service';
import { SiteReader } from '../src/acquisition';
import { harness } from './helpers';
import { listCandidates, extractBody } from '../src/parse';
const root = 'https://csguide.cn/';
const fixture = (name: string) => readFileSync(`test/fixtures/csguide-${name}`, 'utf8');
function capturedHost() {
    const h = harness(); h.routes.clear();
    for (const [url, file] of [[root, 'home.html'], [root + 'sitemap.xml', 'sitemap.xml'], [root + 'roadmap/', 'roadmap.html'], [root + 'aboutme/make_money_labs.html', 'article.html'], ['https://mp.weixin.qq.com/s/3u4tYZzynERDBTZBQPuD4Q', 'wrong-preview.html']]) h.routes.set(url, fixture(file));
    h.routes.set(root + 'robots.txt', `Sitemap: ${root}sitemap.xml`);
    return h;
}
describe('csguide.cn documentation subscription captured 2026-10-18', () => {
    it('prioritizes the site’s own directory links over promotional WeChat links', () => {
        const list = listCandidates(fixture('home.html'), root);
        expect(list[0].entries.every(e => new URL(e.url).origin === new URL(root).origin)).toBe(true);
        expect(list[0].entries.some(e => e.url === root + 'roadmap/')).toBe(true);
        expect(list.every(candidate => candidate.entries.every(e => new URL(e.url).origin === new URL(root).origin))).toBe(true);
    });
    it('reads the actual documentation body and keeps its link-heavy learning directory', async () => {
        const body = await extractBody(fixture('roadmap.html'), root + 'roadmap/', 'roadmap');
        expect(body.text.length).toBeGreaterThan(200);
        expect(body.html).not.toContain('vp-navbar');
        expect(body.html).not.toContain('<script');
    });
    it('discovers, previews and imports real site content instead of the inaccessible external ad', async () => {
        const h = capturedHost(), service = new Subscriptions(h.host);
        try {
            await service.start();
            const list = await service.discover(root);
            expect(list[0].rule).toMatchObject({ kind: 'sitemap', pathPrefix: '/' });
            expect(list[0].entries.length).toBeGreaterThan(100);
            const body = await service.preview(list[0]);
            expect(body.text.length).toBeGreaterThan(5000);
            expect(body.html).not.toContain('<script');
            await service.add(list[0], 'CSGuide', [], 2, 0, false, body);
            expect(service.repo!.state.sources).toHaveLength(1);
            expect(service.repo!.state.articles).toHaveLength(2);
        } finally { service.stop(); h.dispose(); }
    });
    it('keeps a selected documentation section scoped on later sitemap refreshes', async () => {
        const h = capturedHost(), reader = new SiteReader(h.host.support);
        try {
            const candidate = (await reader.discover(root + 'roadmap/'))[0];
            expect(candidate.rule).toMatchObject({ kind: 'sitemap', pathPrefix: '/roadmap/' });
            const source = { id: 'docs', name: 'Docs', groups: [], rule: candidate.rule, interval: 0, autoDownload: false, paused: false, imported: 0 };
            const refreshed = await reader.readSource(source);
            expect(refreshed.entries.length).toBeGreaterThan(5);
            expect(refreshed.rule.pathPrefix).toBe('/roadmap/');
            expect(refreshed.entries.every(e => e.url.startsWith(root + 'roadmap/'))).toBe(true);
        } finally { h.dispose(); }
    });
});
