import type { HostSupport } from './host';
import type { Article, Body, Candidate, Entry, Source } from './model';
import { assist, extractBody, feedLinks, htmlDoc, isDocumentationDocument, listCandidates, parseFeed } from './parse';
import { canonical } from './urls';
import { gateMessage, pageGate, SiteError } from './site-errors';
import { marked } from 'marked';
type Response = Awaited<ReturnType<HostSupport['fetch']>>;
class Requests {
    private running = 0;
    private waiting: (() => void)[] = [];
    async run<T>(fn: () => Promise<T>): Promise<T> {
        if (this.running >= 4) await new Promise<void>(resolve => this.waiting.push(resolve)); else this.running++;
        try { return await fn(); } finally { const next = this.waiting.shift(); if (next) next(); else this.running--; }
    }
}
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const dedupe = (values: Candidate[]) => [...new Map(values.map(value => [`${value.rule.kind}:${value.rule.url}:${value.rule.pathPrefix || ''}:${value.rule.dataPath || ''}`, value])).values()];
function scopeDocumentationMap(candidate: Candidate, section: string, base: string): Candidate {
    const origin = new URL(base).origin;
    const entries = candidate.entries.filter(entry => new URL(entry.url).origin === origin && new URL(entry.url).pathname.startsWith(section));
    const leaf = (entry: Entry) => /\.(?:html?|md)$/i.test(new URL(entry.url).pathname) && new URL(entry.url).pathname.split('/').filter(Boolean).length > 1;
    entries.sort((a, b) => Number(leaf(b)) - Number(leaf(a)));
    return { ...candidate, rule: { ...candidate.rule, pathPrefix: section }, entries };
}
export class SiteReader {
    private requests = new Requests();
    constructor(private readonly support: HostSupport) {}
    private async fetch(url: string): Promise<Response> {
        return this.requests.run(async () => {
            try {
                const response = await this.support.fetch(canonical(url));
                if (response.status < 200 || response.status >= 300) throw new SiteError('network', `网页获取失败（HTTP ${response.status}）：${url}`, url);
                if (response.body.length > 8000000) throw new Error('网页超过 8 MB 读取限制');
                return response;
            } catch (e) {
                if (e instanceof SiteError) throw e;
                throw new SiteError('network', `网页获取失败：${errorText(e)}（${url}）`, url);
            }
        });
    }
    private async render(url: string): Promise<Response> {
        if (!this.support.render) throw new SiteError('render', '此页面需要动态渲染，请更新 Folyn 宿主并重新授权订阅插件的网页渲染权限', url);
        try {
            const response = await this.support.render(canonical(url));
            if (response.status < 200 || response.status >= 300) throw new Error(`HTTP ${response.status}`);
            if (!response.body || response.body.length > 8000000) throw new Error('渲染结果为空或超过 8 MB 限制');
            const gate = pageGate(response.body);
            if (gate) throw new Error(gateMessage(gate));
            return response;
        } catch (e) { throw new SiteError('render', `动态网页读取失败：${errorText(e)}`, url); }
    }
    async discover(value: string, sample?: string): Promise<Candidate[]> {
        const failures: string[] = [];
        const seen = new Map<string, Promise<Response>>();
        const fetch = (url: string) => {
            const key = canonical(url);
            if (!seen.has(key)) seen.set(key, this.fetch(key));
            return seen.get(key)!;
        };
        let response: Response, rendered = false, networkFailed = false;
        try { response = await fetch(value); if (pageGate(response.body)) throw new Error(gateMessage(pageGate(response.body)!)); }
        catch (e) {
            failures.push(errorText(e)); networkFailed = true;
            if (!this.support.render) throw new SiteError('network', `${errorText(e)}；当前宿主未提供动态渲染兜底，请更新 Folyn 宿主`, value);
            response = await this.render(value); rendered = true;
        }
        let url = response.url || value;
        const direct = parseFeed(response.body, url);
        if (direct) return sample ? assist([direct], sample) : [direct];
        if (/^(?:sitemapindex|urlset)$/.test(new DOMParser().parseFromString(response.body, 'text/xml').documentElement.localName)) {
            const maps = await this.sitemaps(url, fetch);
            if (maps.length) return sample ? assist(maps, sample) : maps;
        }
        let candidates = listCandidates(response.body, url);
        const probe = async (urls: string[]) => {
            const feeds: { feed: Candidate; order: number }[] = [];
            await Promise.all([...new Set(urls)].slice(0, 12).map(async (target, order) => {
                try { const r = await fetch(target); const feed = parseFeed(r.body, r.url || target); if (feed) feeds.push({ feed, order }); }
                catch (e) { failures.push(errorText(e)); }
            }));
            // Preserve advertised order, independent of network completion order.
            return feeds.sort((a, b) => a.order - b.order).map(value => value.feed);
        };
        const advertised = (r: Response) => {
            const urls = feedLinks(htmlDoc(r.body, r.url || url), r.url || url).map(feed => feed.url);
            const header = r.headers.link || '';
            for (const match of header.matchAll(/<([^>]+)>\s*;([^,]+)/g)) if (/rel\s*=\s*"?alternate/i.test(match[2]) && /rss|atom|feed\+json/i.test(match[2])) {
                try { urls.push(canonical(match[1], r.url || url)); } catch { /* invalid metadata */ }
            }
            return urls;
        };
        let feeds = await probe(advertised(response));
        const declaredFeed = feeds.length > 0;
        const shell = htmlDoc(response.body, url);
        if (!feeds.length && isDocumentationDocument(shell)) {
            const mapped = await this.sitemaps(url, fetch);
            const location = new URL(url);
            const section = location.pathname.endsWith('/') ? location.pathname : location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1);
            // Generated maps often start with nav/index pages. Preview a leaf
            // document first, and persist the selected section for refreshes.
            const usable = mapped.map(candidate => ({ ...scopeDocumentationMap(candidate, section, url), name: `${shell.title.split('|')[0].trim() || location.hostname} · 文档` })).filter(candidate => candidate.entries.length);
            const selected = sample ? assist(usable, sample) : usable;
            if (selected.length) return dedupe([...selected, ...(sample ? assist(candidates, sample) : candidates)]);
        }
        if (!feeds.length && !candidates.length && !rendered && this.support.render && shell.querySelector('script[src]') && (shell.body.textContent || '').trim().length < 600) {
            try {
                response = await this.render(url); rendered = true; url = response.url || url;
                candidates = listCandidates(response.body, url); feeds = await probe(advertised(response));
            } catch (e) { failures.push(errorText(e)); }
        }
        if (!feeds.length && !networkFailed) {
            const location = new URL(url), directory = location.pathname.endsWith('/') ? location.pathname : /\.[a-z0-9]+$/i.test(location.pathname) ? location.pathname.slice(0, location.pathname.lastIndexOf('/') + 1) : location.pathname + '/';
            const root = location.origin;
            const guesses = [...(directory !== '/' ? [`${root}${directory}feed/`, `${root}${directory}index.xml`, `${root}${directory}rss.xml`] : []), ...['/feed/', '/rss.xml', '/atom.xml', '/index.xml', '/feed.xml', '/feed.json', '/rss/', '/?feed=rss2'].map(path => root + path)];
            const guessed = await probe(guesses);
            const listed = new Set(candidates.flatMap(candidate => candidate.entries.map(entry => entry.url)));
            feeds = guessed.filter(feed => directory === '/' || !listed.size || new URL(feed.rule.url).pathname.startsWith(directory) || feed.entries.some(entry => listed.has(entry.url)));
        }
        const directory = new URL(url).pathname;
        const preferList = directory !== '/' && !declaredFeed && candidates.length > 0 && feeds.every(feed => !new URL(feed.rule.url).pathname.startsWith(directory));
        candidates = dedupe(preferList ? [...candidates, ...feeds] : [...feeds, ...candidates]);
        let selected = sample ? assist(candidates, sample) : candidates;
        if (selected.length) return selected;
        // Sitemaps are a fallback, not an unbounded crawler. Robots declarations
        // and sitemap indexes are traversed through the same public HTTP seam.
        try {
            const mapped = await this.sitemaps(url, fetch);
            selected = sample ? assist(mapped, sample) : mapped;
            if (selected.length) return selected;
        } catch (e) { failures.push(errorText(e)); }
        if (!rendered && this.support.render) {
            try {
                response = await this.render(url); rendered = true;
                const dynamic = dedupe([...await probe(advertised(response)), ...listCandidates(response.body, response.url || url)]);
                selected = sample ? assist(dynamic, sample) : dynamic;
                if (selected.length) return selected;
            } catch (e) { failures.push(errorText(e)); }
        }
        const reason = sample ? '未在可读取的文章列表中找到示例文章，请使用其所属列表页或直接提供订阅源地址' : '网页可访问，但未找到 RSS / JSON Feed、文章列表、结构化文章数据或可用 Sitemap；如果这是一篇单独的文章，请改用来源栏的「添加单篇文章」';
        const rendering = !rendered && !this.support.render ? '；当前宿主未提供动态渲染能力，请更新 Folyn 宿主' : '';
        throw new SiteError('discovery', `${reason}${rendering}${failures.length ? `。探测记录：${[...new Set(failures)].slice(-3).join('；')}` : ''}`, url);
    }
    private async sitemaps(url: string, fetch = (target: string) => this.fetch(target)): Promise<Candidate[]> {
        const parsed = new URL(url), root = parsed.origin;
        const direct = /(?:sitemap|\.xml(?:$|\?))/i.test(parsed.pathname);
        const queue = direct ? [url] : [`${root}/sitemap.xml`, `${root}/sitemap_index.xml`, `${root}/wp-sitemap.xml`];
        if (!direct) {
            try { const robots = await fetch(`${root}/robots.txt`); for (const match of robots.body.matchAll(/^\s*Sitemap:\s*(\S+)/gmi)) queue.unshift(canonical(match[1], root)); } catch { /* conventional paths remain */ }
        }
        const visited = new Set<string>();
        const entries: Entry[] = [];
        let first = '';
        while (queue.length && visited.size < 6 && entries.length < 500) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            try {
                const response = await fetch(current);
                const doc = new DOMParser().parseFromString(response.body, 'text/xml');
                if (doc.querySelector('parsererror')) continue;
                const name = doc.documentElement.localName;
                if (name === 'sitemapindex') {
                    first ||= current;
                    const children = [...doc.getElementsByTagNameNS('*', 'loc')].map(node => node.textContent?.trim()).filter((value): value is string => !!value);
                    // Post/article maps precede taxonomy/media maps on WordPress.
                    children.sort((a, b) => Number(/post|article|news/i.test(b)) - Number(/post|article|news/i.test(a)));
                    queue.unshift(...children.slice(0, 6)); continue;
                }
                if (name !== 'urlset') continue;
                first ||= current;
                for (const node of [...doc.getElementsByTagNameNS('*', 'url')]) {
                    const raw = node.getElementsByTagNameNS('*', 'loc')[0]?.textContent?.trim();
                    if (!raw) continue;
                    let href: string;
                    try { href = canonical(raw, response.url || current); } catch { continue; }
                    const path = new URL(href).pathname;
                    if (path === '/' || /\/(?:tags?|categories|authors?|search|login|privacy|terms|wp-content|assets)(?:\/|$)|\.(?:png|jpg|gif|svg|pdf|zip)$/i.test(path)) continue;
                    let slug = path.split('/').filter(Boolean).pop() || href;
                    try { slug = decodeURIComponent(slug); } catch { /* malformed escapes must not discard other sitemap entries */ }
                    const title = slug.replace(/\.(?:html?|md)$/, '').replace(/[-_]/g, ' ');
                    entries.push({ url: href, title, summary: '', titleFromUrl: true });
                    if (entries.length >= 500) break;
                }
            } catch { /* bounded alternatives may still work */ }
        }
        return entries.length ? [{ name: `${parsed.hostname} · 网站地图`, rule: { kind: 'sitemap', url: first || url }, entries: [...new Map(entries.map(entry => [entry.url, entry])).values()], note: '从 Sitemap 读取公开页面，标题在打开正文后补全；每次最多6份地图、500个链接，不代表全部历史' }] : [];
    }
    async readSource(source: Source): Promise<Candidate> {
        if (source.rule.kind === 'sitemap') {
            const mapped = await this.sitemaps(source.rule.url);
            const values = source.rule.pathPrefix ? mapped.map(candidate => scopeDocumentationMap(candidate, source.rule.pathPrefix!, source.rule.url)).filter(candidate => candidate.entries.length) : mapped;
            if (values[0]) return values[0];
            throw new SiteError('discovery', '网站地图没有可读文章链接，请重新识别来源', source.rule.url);
        }
        let response: Response;
        try { response = await this.fetch(source.rule.url); }
        catch (e) { if (!this.support.render) throw e; response = await this.render(source.rule.url); }
        const gate = pageGate(response.body);
        if (gate) throw new SiteError('discovery', `网站没有返回文章结构：${gateMessage(gate)}`, source.rule.url);
        if (source.rule.kind === 'feed') {
            const feed = parseFeed(response.body, response.url || source.rule.url);
            if (feed) return feed;
            throw new SiteError('discovery', '订阅源未返回有效 RSS / Atom / JSON Feed，请重新识别来源', source.rule.url);
        }
        const choose = (values: Candidate[]) => values.find(value => value.rule.kind === source.rule.kind && (source.rule.kind === 'data' ? value.rule.dataPath === source.rule.dataPath : value.rule.pathPrefix === source.rule.pathPrefix));
        const candidate = choose(listCandidates(response.body, response.url || source.rule.url));
        if (candidate?.entries.length) return candidate;
        const recovered = await this.discover(source.rule.url);
        return choose(recovered) || recovered[0];
    }
    async article(article: Pick<Article, 'id' | 'url' | 'feedHtml'>, selector?: string, force = false): Promise<{ body: Body; response?: Response }> {
        const failures: string[] = [];
        if (article.feedHtml && !force) {
            try { return { body: await extractBody(`<article>${article.feedHtml}</article>`, article.url, article.id, 'article') }; }
            catch (e) { failures.push(`订阅正文：${errorText(e)}`); }
        }
        let response: Response | undefined;
        // Older feeds often keep http links even after the site enables HTTPS.
        // Prefer the secure page, retaining an HTTP fallback for older blogs.
        const targets = article.url.startsWith('http:') ? [article.url.replace(/^http:/, 'https:'), article.url] : [article.url];
        for (const target of targets) {
            try {
                response = await this.fetch(target);
                try { return { body: await extractBody(response.body, response.url || target, article.id, selector), response }; }
                catch (e) { if (!selector) throw e; return { body: await extractBody(response.body, response.url || target, article.id), response }; }
            } catch (e) { failures.push(`静态正文：${errorText(e)}`); }
        }
        if (response) {
            const doc = htmlDoc(response.body, response.url || article.url);
            const alternate = [...doc.querySelectorAll('link[rel~=alternate]')].find(link => /text\/markdown/i.test(link.getAttribute('type') || ''))?.getAttribute('href');
            if (alternate) {
                try {
                    const markdown = await this.fetch(canonical(alternate, response.url || article.url));
                    const html = marked.parse(markdown.body, { async: false }) as string;
                    return { body: await extractBody(`<article>${html}</article>`, response.url || article.url, article.id, 'article'), response };
                } catch (e) { failures.push(`Markdown 正文：${errorText(e)}`); }
            }
        }
        if (this.support.render) {
            try {
                const rendered = await this.render(article.url);
                let body: Body;
                try { body = await extractBody(rendered.body, rendered.url || article.url, article.id, selector); }
                catch (e) { if (!selector) throw e; body = await extractBody(rendered.body, rendered.url || article.url, article.id); }
                return { body, response: rendered };
            } catch (e) { failures.push(errorText(e)); }
        }
        throw new SiteError('body', `正文获取失败。${failures.join('；')}${!this.support.render ? '；此宿主不支持动态渲染，请更新 Folyn 宿主' : ''}`, article.url);
    }
}
