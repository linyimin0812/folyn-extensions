import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { article } from './fixtures';
import { extractBody, htmlDoc, markdown } from '../src/parse';
import { documentInputs, documentHtml } from '../src/translation';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';
import { highlightCodeBlocks } from '../src/code-blocks';
const fixture = readFileSync('test/fixtures/claude-typescript-code.html', 'utf8');
describe('website code blocks', () => {
    it('normalizes the real CODE/TypeScript wrapper and preserves exact lines as fenced TypeScript', async () => {
        const body = await extractBody(article('Code fixture', fixture), 'https://example.com/code', 'code');
        const doc = htmlDoc(body.html, 'https://example.com');
        expect(doc.body.textContent).not.toContain('CODETypeScript');
        const code = [...doc.querySelectorAll('pre code.language-typescript')].find(code => code.textContent?.includes('const vaultId'))!;
        expect(code).not.toBeNull();
        expect(code.textContent).toContain("// the vault's ID, from claude-lock.json\n\n");
        expect(code.textContent).toContain('await client.beta.vaults.credentials.create(vaultId, {\n  display_name:');
        expect(markdown(body.html)).toContain('```typescript\nconst vaultId');
        expect(documentInputs(body).join('\n')).not.toContain('CODETypeScript');
    });
    it('renders already cached website code with highlights and clean headers without refetching', async () => {
        const h = harness(), service = new Subscriptions(h.host); await service.start();
        try {
            const body = await extractBody(article(), 'https://example.com/code', 'code');
            const html = await service.imageHtml(service.repo!, fixture, body);
            const doc = htmlDoc(html, 'https://example.com');
            expect(doc.body.textContent).not.toContain('CODETypeScript');
            expect(doc.querySelector('pre code .hljs-keyword')?.textContent).toBe('const');
            expect(doc.querySelector('pre code')!.textContent).toContain('create(vaultId, {\n  display_name:');
        } finally { service.stop(); h.dispose(); }
    });
    it('restores code resources in a whole translation without translating or duplicating the CODE header', async () => {
        const body = await extractBody(article('Code fixture', fixture), 'https://example.com/code', 'code');
        const input = documentInputs(body).join('\n');
        const tokens = [...input.matchAll(/FOLYNKEEP\d+END/g)].map(match => match[0]);
        const html = documentHtml(body, `译文正文\n\n${tokens.join('\n\n')}`);
        const doc = htmlDoc(html, 'https://example.com');
        expect(doc.body.textContent).not.toContain('CODETypeScript');
        const code = [...doc.querySelectorAll('pre code')].find(code => code.textContent?.includes('const vaultId'));
        expect(code).toBeDefined();
        expect(code!.textContent).toContain('create(vaultId, {\n  display_name:');
    });
    it('removes duplicated CODE labels in old cached whole translations without changing code text', async () => {
        const full = await extractBody(article(), 'https://example.com/code', 'code');
        const body = { ...full, html: fixture, blocks: [{ id: 'cached-code', html: fixture }] };
        expect(documentInputs(body).join('')).not.toContain('CODETypeScript');
        const result = documentHtml(body, 'CODETypeScript\n\nCODETypeScript\n\nFOLYNKEEP0END');
        const doc = htmlDoc(result, 'https://example.com');
        expect(doc.body.textContent).not.toContain('CODETypeScript');
        expect(doc.querySelectorAll('pre')).toHaveLength(1);
        expect(doc.querySelector('pre code')!.textContent).toContain('create(vaultId, {\n  display_name:');
    });
    it('restores DOM line wrappers and br breaks without compressing indentation', () => {
        const doc = htmlDoc('<pre><code class="language-ts"><span class="line">const a = {</span><span class="line">  value: 1,</span><span class="line">};</span></code></pre><pre>echo first<br>  echo second</pre>', 'https://example.com');
        highlightCodeBlocks(doc.body);
        expect(doc.querySelector('code')!.textContent).toBe('const a = {\n  value: 1,\n};');
        expect(doc.querySelectorAll('code')[1].textContent).toBe('echo first\n  echo second');
    });
    it('keeps executable-looking code escaped and leaves unsupported languages readable', () => {
        const doc = htmlDoc('<pre><code class="language-html">&lt;script&gt;alert("sample")&lt;/script&gt;</code></pre><pre><code class="language-unknown">  special &lt;syntax&gt;\n    unchanged</code></pre>', 'https://example.com');
        highlightCodeBlocks(doc.body);
        expect(doc.querySelector('script')).toBeNull();
        expect(doc.querySelector('code')!.textContent).toBe('<script>alert("sample")</script>');
        expect(doc.querySelectorAll('code')[1].textContent).toBe('  special <syntax>\n    unchanged');
    });

});
