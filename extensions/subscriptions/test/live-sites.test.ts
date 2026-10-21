import { writeFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SiteReader } from '../src/acquisition';
import { harness } from './helpers';
// Explicit opt-in only. CI/unit tests never depend on public network availability.
describe.skipIf(process.env.FOLYN_LIVE_SITES !== '1')('public-site acquisition smoke', () => {
    it('records discovery and article extraction against different public publishing systems', async () => {
        const results: Record<string, unknown>[] = [];
        const sites = process.env.FOLYN_LIVE_SITE ? [process.env.FOLYN_LIVE_SITE] : ['https://www.ruanyifeng.com/blog/', 'https://danluu.com/', 'https://antirez.com/', 'https://martinfowler.com/'];
        for (const url of sites) {
            const h = harness();
            h.host.support.fetch = async target => {
                let current = target;
                for (let redirects = 0; redirects < 8; redirects++) {
                    const response = await new Promise<{ status: number; headers: Record<string, string>; bytes: Buffer }>((resolve, reject) => {
                        const request = (current.startsWith('https:') ? httpsRequest : httpRequest)(current, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Folyn-Subscriptions/0.3)', Accept: 'text/html,application/rss+xml,application/atom+xml,application/feed+json,application/xml;q=0.9,*/*;q=0.8' } }, response => {
                            const chunks: Buffer[] = []; let size = 0;
                            response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 8000000) request.destroy(new Error('size limit')); else chunks.push(chunk); });
                            response.on('error', reject);
                            response.on('end', () => resolve({ status: response.statusCode || 0, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value || ''])), bytes: Buffer.concat(chunks) }));
                        });
                        request.setTimeout(8000, () => request.destroy(new Error('timeout'))); request.on('error', reject); request.end();
                    });
                    if (response.status >= 300 && response.status < 400 && response.headers.location) { current = new URL(response.headers.location, current).href; continue; }
                    let bytes = response.bytes;
                    if (response.headers['content-encoding'] === 'gzip') bytes = gunzipSync(bytes);
                    if (response.headers['content-encoding'] === 'deflate') bytes = inflateSync(bytes);
                    if (response.headers['content-encoding'] === 'br') bytes = brotliDecompressSync(bytes);
                    const raw = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
                    const charset = /charset=["']?([\w-]+)/i.exec(response.headers['content-type'] || '')?.[1] || /charset=["']?([\w-]+)/i.exec(raw)?.[1] || 'utf-8';
                    let body: string;
                    try { body = new TextDecoder(charset).decode(bytes); } catch { body = new TextDecoder().decode(bytes); }
                    return { url: current, status: response.status, headers: response.headers, body };
                }
                throw new Error('too many redirects');
            };
            const reader = new SiteReader(h.host.support), started = Date.now();
            try {
                const candidates = await reader.discover(url);
                const candidate = candidates[0];
                const entry = candidate.entries[0];
                const { body } = await reader.article({ ...entry, id: 'live-site' });
                if (body.text.length < 80) throw new Error(`Extracted article is too short: ${body.text.length} characters`);
                results.push({ url, success: true, strategy: candidate.rule.kind, source: candidate.rule.url, entries: candidate.entries.length, article: entry.url, characters: body.text.length, blocks: body.blocks.length, elapsedMs: Date.now() - started });
            } catch (error) { results.push({ url, success: false, error: String(error), elapsedMs: Date.now() - started }); }
            finally { h.dispose(); }
        }
        writeFileSync(process.env.FOLYN_LIVE_RESULT || 'docs/general-sites-live-results.json', JSON.stringify({ capturedAt: new Date().toISOString(), transport: 'Node HTTP adapter; production parser/acquisition; no native renderer in this test', results }, null, 2));
        console.info(JSON.stringify(results));
        expect(results.filter(result => result.success).length).toBeGreaterThanOrEqual(Math.min(2, sites.length));
    }, 180000);
});
