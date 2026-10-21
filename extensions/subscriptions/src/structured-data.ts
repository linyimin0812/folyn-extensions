import type { Candidate, Entry } from './model';
import { canonical } from './urls';
const compact = (value: unknown) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const articleType = (o: Record<string, unknown>) => /(?:Article|BlogPosting|NewsArticle|TechArticle|DiscussionForumPosting)/i.test(String(o['@type'] || ''));
function urlOf(value: unknown, base: string): string | undefined {
    if (value && typeof value === 'object') value = (value as Record<string, unknown>)['@id'] || (value as Record<string, unknown>).url;
    if (typeof value !== 'string' || !value.trim()) return;
    try { return canonical(value, base); } catch { return; }
}
/** Read inert JSON only, including common initial-state assignments. Balanced
 * scanning accepts JSON values, never evaluates JavaScript expressions. */
export function pageData(doc: Document): { key: string; value: unknown }[] {
    const result: { key: string; value: unknown }[] = [];
    [...doc.querySelectorAll('script')].slice(0, 48).forEach((script, index) => {
        const text = script.textContent || '';
        if (!text || text.length > 4000000) return;
        const key = script.id || `${script.type || 'state'}:${index}`;
        if (/application\/(?:ld\+)?json/i.test(script.type)) {
            try { result.push({ key, value: JSON.parse(text) }); } catch { /* continue other data */ }
            return;
        }
        const assignment = /(?:window\.)?(?:__INITIAL_STATE__|__PRELOADED_STATE__|__NEXT_DATA__|__NUXT__)\s*=\s*/g;
        for (const match of text.matchAll(assignment)) {
            const start = match.index! + match[0].length;
            if (!/[{[]/.test(text[start] || '')) continue;
            let depth = 0, quoted = false, escape = false;
            for (let i = start; i < text.length; i++) {
                const c = text[i];
                if (quoted) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') quoted = false; }
                else if (c === '"') quoted = true;
                else if (c === '{' || c === '[') depth++;
                else if (c === '}' || c === ']') {
                    if (--depth === 0) {
                        try { result.push({ key: `${key}:${match.index}`, value: JSON.parse(text.slice(start, i + 1)) }); } catch { /* non-JSON is never executed */ }
                        break;
                    }
                }
            }
        }
    });
    return result;
}
export function structuredEntries(doc: Document, base: string): Candidate[] {
    const candidates: Candidate[] = [];
    let visited = 0;
    function entry(value: unknown, path: string): Entry | undefined {
        if (!value || typeof value !== 'object') return;
        const item = value as Record<string, unknown>;
        const o = item.item && typeof item.item === 'object' ? item.item as Record<string, unknown> : item.node && typeof item.node === 'object' ? item.node as Record<string, unknown> : item;
        const title = compact(o.headline || o.title || o.name);
        const slug = typeof o.slug === 'string' ? o.slug : undefined;
        const url = urlOf(o.url || o.permalink || o.href || o['@id'] || (slug ? urlOf(slug, base.endsWith('/') ? base : base + '/') : undefined), base);
        if (!title || !url || (!articleType(o) && !/posts|articles|entries|items|results|nodes|edges|itemListElement/i.test(path) && !('datePublished' in o || 'publishedAt' in o || 'excerpt' in o || 'summary' in o || 'slug' in o))) return;
        const published = compact(o.datePublished || o.publishedAt || o.published || o.pubDate);
        const author = typeof o.author === 'object' && o.author ? compact((o.author as Record<string, unknown>).name) : compact(o.author);
        return { title, url, summary: compact(o.description || o.summary || o.excerpt).slice(0, 360), author: author || undefined, published: published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : undefined };
    }
    function walk(value: unknown, path: string, depth: number) {
        if (!value || typeof value !== 'object' || depth > 22 || ++visited > 30000) return;
        if (Array.isArray(value)) {
            const entries = [...new Map(value.map(v => entry(v, path)).filter((v): v is Entry => !!v).map(v => [v.url, v])).values()].slice(0, 500);
            if (entries.length) candidates.push({ name: `页面文章数据`, rule: { kind: 'data', url: base, dataPath: path }, entries, note: '从页面公开结构化数据读取文章，不执行内嵌脚本' });
            value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
        } else Object.entries(value).forEach(([k, v]) => walk(v, `${path}.${k}`, depth + 1));
    }
    for (const { key, value } of pageData(doc)) walk(value, key, 0);
    return candidates;
}
export function structuredBody(doc: Document, base: string): string | undefined {
    let visited = 0, best = '';
    function walk(value: unknown, depth: number) {
        if (!value || typeof value !== 'object' || depth > 22 || ++visited > 30000) return;
        if (Array.isArray(value)) { value.forEach(v => walk(v, depth + 1)); return; }
        const o = value as Record<string, unknown>;
        const ownUrl = urlOf(o.url || o.mainEntityOfPage, base);
        const text = o.articleBody || ((o.title || o.headline) && (o.contentHtml || o.content_html || o.body_html || o.html || o.content || o.body));
        if (typeof text === 'string' && text.trim().length >= 40 && text.length > best.length && (!ownUrl || ownUrl === canonical(base)) && (articleType(o) || o.title || o.headline || o.articleBody)) best = text;
        Object.values(o).forEach(v => walk(v, depth + 1));
    }
    for (const { value } of pageData(doc)) walk(value, 0);
    if (!best) return;
    if (/<(?:p|div|h[1-6]|pre|ul|ol|table|blockquote)\b/i.test(best)) return best;
    return best.split(/\n\s*\n|\n/).map(line => { const p = doc.createElement('p'); p.textContent = line; return p.outerHTML; }).join('\n');
}
