import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';
const URL = 'https://mp.weixin.qq.com/s/ImCVcRPVYbA2RA3OcxXf1w';
const fixture = () => readFileSync('test/fixtures/wx-article.html', 'utf8');
describe('wechat article captured 2026-10-21', () => {
    it('adds the single article from a static page whose body is hidden until client JS runs', async () => {
        const h = harness();
        h.routes.set(URL, fixture());
        const s = new Subscriptions(h.host);
        try {
            await s.start();
            const preview = await s.previewArticle(URL);
            expect(preview.body.title).toBe('都AI编程了，Matt Pocock竟然推荐我去读这三本技术书');
            expect(preview.body.text.length).toBeGreaterThan(1000);
            expect(preview.body.images.length).toBe(2);
            expect(preview.body.html).not.toContain('<script');
            const article = await s.addArticle(preview);
            expect(article.sourceIds).toEqual([]);
            // Lazy-loaded WeChat images use data-src; the normalizer must surface them.
            expect((await h.first.vault.data.exists('subscriptions/bodies/' + article.id + '/' + article.cache!.version + '.json'))).toBe(true);
        }
        finally {
            await s.stop();
            h.dispose();
        }
    });
});
