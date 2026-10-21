import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { extractBody, feedLinks, htmlDoc, listCandidates, parseFeed } from '../src/parse';
const captured = existsSync('test/fixtures/claude-home.html') && existsSync('test/fixtures/claude-rss.xml') && existsSync('test/fixtures/claude-article.html');
describe.skipIf(!captured)('PRD real site claude.dev captured 2026-10-17', () => {
    it('discovers the actual RSS and reads the real technical article', async () => {
        const home = readFileSync('test/fixtures/claude-home.html', 'utf8');
        const links = feedLinks(htmlDoc(home, 'https://claude.dev/'), 'https://claude.dev/');
        expect(links.some(l => l.url === 'https://claude.dev/rss.xml')).toBe(true);
        const rss = parseFeed(readFileSync('test/fixtures/claude-rss.xml', 'utf8'), 'https://claude.dev/rss.xml')!;
        expect(rss.entries.length).toBeGreaterThan(5);
        const list = listCandidates(home, 'https://claude.dev/');
        expect(list.some(c => c.entries.length >= 5)).toBe(true);
        const body = await extractBody(readFileSync('test/fixtures/claude-article.html', 'utf8'), 'https://claude.dev/blog/solving-code-review-at-anthropic/', 'real-article');
        expect(body.text.length).toBeGreaterThan(5000);
        expect(body.blocks.length).toBeGreaterThan(10);
        expect(body.html).not.toContain('<script');
        console.info(JSON.stringify({ site: 'claude.dev', feedEntries: rss.entries.length, staticCandidates: list.length, bodyCharacters: body.text.length, blocks: body.blocks.length, images: body.images.length }));
    });
});
