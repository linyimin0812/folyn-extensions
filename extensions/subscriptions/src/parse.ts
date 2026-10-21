import { structuredEntries, structuredBody } from './structured-data';
import { pageGate, gateMessage } from './site-errors';
import { normalizeCodeBlocks } from './code-blocks';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import Turndown from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { Body, Candidate, Entry, Rule } from './model';
import { canonical, digest, webUrl } from './urls';
const compact = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();
const text = (el: ParentNode, name: string) => compact(el.querySelector(name)?.textContent);
export function date(value?: string | null): string | undefined {
    const n = value ? Date.parse(value) : NaN;
    return Number.isFinite(n) ? new Date(n).toISOString() : undefined;
}
export function htmlDoc(html: string, url: string): Document {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('base').forEach(e => e.remove());
    const base = doc.createElement('base');
    base.href = url;
    doc.head.prepend(base);
    return doc;
}
function link(value: string | null | undefined, url: string): string | undefined {
    try {
        return value ? canonical(value, url) : undefined;
    }
    catch {
        return undefined;
    }
}
export function parseFeed(raw: string, url: string): Candidate | null {
    const xml = raw.replace(/^\uFEFF/, '').trim();
    if (xml.startsWith('{')) {
        try {
            const value = JSON.parse(xml);
            if (!/^https:\/\/jsonfeed.org\/version\//.test(value.version) || !Array.isArray(value.items)) return null;
            const entries: Entry[] = value.items.flatMap((item: Record<string, unknown>) => {
                if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
                const href = link(String(item.url || item.external_url || ''), url);
                if (!href) return [];
                const html = typeof item.content_html === 'string' ? item.content_html : typeof item.content_text === 'string' ? `<p>${escapeHtml(item.content_text).replace(/\n/g, '<br>')}</p>` : undefined;
                const summary = compact(typeof item.summary === 'string' ? item.summary : htmlDoc(html || '', href).body.textContent).slice(0, 360);
                const authors = Array.isArray(item.authors) ? item.authors : item.author ? [item.author] : [];
                return [{ url: href, title: compact(typeof item.title === 'string' ? item.title : summary) || new URL(href).pathname, guid: typeof item.id === 'string' ? item.id : undefined, summary, feedHtml: html, author: authors.map((a: { name?: string }) => a?.name).filter(Boolean).join('、') || undefined, published: date(typeof item.date_published === 'string' ? item.date_published : undefined) }];
            });
            return { name: compact(value.title) || new URL(url).hostname, rule: { kind: 'feed', url }, entries: unique(entries), next: link(value.next_url, url), note: 'JSON Feed；正文优先使用订阅源提供的完整内容' };
        } catch { return null; }
    }
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.querySelector('parsererror') || !['rss', 'feed', 'RDF'].includes(doc.documentElement.localName)) return null;
    const nodes = [...doc.getElementsByTagNameNS('*', 'item'), ...doc.getElementsByTagNameNS('*', 'entry')];
    const get = (el: Element, name: string) => el.getElementsByTagNameNS('*', name)[0]?.textContent?.trim() ?? '';
    const entries: Entry[] = [];
    for (const el of nodes) {
        const alt = [...el.getElementsByTagNameNS('*', 'link')].find(l => !l.getAttribute('rel') || l.getAttribute('rel') === 'alternate');
        const declaredBase = el.getAttribute('xml:base') || doc.documentElement.getAttribute('xml:base');
        const base = declaredBase ? link(declaredBase, url) || url : url;
        const href = link(alt?.getAttribute('href') || alt?.textContent || get(el, 'guid'), base);
        const title = compact(get(el, 'title'));
        if (!href || !title) continue;
        const content = el.getElementsByTagNameNS('*', 'content')[0];
        const description = get(el, 'description');
        // RSS descriptions are frequently long excerpts. Length/HTML alone
        // cannot establish completeness; fetch the article for those feeds.
        const raw = get(el, 'encoded') || (content?.getAttribute('type') === 'xhtml' ? content.innerHTML : get(el, 'content'));
        const summary = get(el, 'summary') || description;
        entries.push({ title, url: href, guid: get(el, 'id') || get(el, 'guid') || undefined, author: get(el, 'creator') || get(el, 'name') || undefined, published: date(get(el, 'pubDate') || get(el, 'published') || get(el, 'updated') || get(el, 'date')), summary: compact(htmlDoc(summary, href).body.textContent).slice(0, 360), feedHtml: raw || undefined });
    }
    const next = [...doc.getElementsByTagNameNS('*', 'link')].find(l => l.getAttribute('rel') === 'next');
    return { name: text(doc, 'channel > title') || get(doc.documentElement, 'title') || new URL(url).hostname, rule: { kind: 'feed', url }, entries: unique(entries), next: link(next?.getAttribute('href'), url), note: 'RSS / Atom；历史范围取决于来源提供的条目与分页' };
}
function unique(entries: Entry[]): Entry[] {
    return [...new Map(entries.map(e => [e.url, e])).values()];
}
export function feedLinks(doc: Document, url: string): { url: string; name: string }[] {
    const values = [...doc.querySelectorAll('link[rel~=alternate],a[href]')].flatMap(el => {
        const raw = el.getAttribute('href');
        if (!raw || !(el.tagName === 'LINK' ? /rss|atom|xml|feed\+json|jsonfeed/i.test(el.getAttribute('type') || '') : /(?:^|\/)(?:rss|feed|atom)(?:\.xml|\.json)?\/?(?:\?|$)|\/(?:index|rss|atom|feed)\.xml(?:\?|$)|[?&]feed=(?:rss|rss2|atom)/i.test(raw))) return [];
        const href = link(raw, url);
        return href ? [{ url: href, name: el.getAttribute('title') || href }] : [];
    });
    return [...new Map(values.map(value => [value.url, value])).values()].slice(0, 12);
}
const IGNORED = /^(home|about|contact|privacy|terms|login|sign.in|sign.up|subscribe|next|previous|load.more|首页|关于|登录|注册|下一页|更多)$/i;
const DOCUMENT_CONTENT = '[vp-content],.theme-hope-content,.theme-default-content,.vp-doc,.theme-doc-markdown,.md-content__inner';
export function isDocumentationDocument(doc: Document): boolean {
    return /VuePress|VitePress|Docusaurus|MkDocs|Sphinx/i.test(doc.querySelector('meta[name=generator]')?.getAttribute('content') || '') || !!doc.querySelector(DOCUMENT_CONTENT);
}
function pageEntries(doc: Document, url: string): Entry[] {
    const root = (isDocumentationDocument(doc) ? doc.querySelector(DOCUMENT_CONTENT) : null) || doc.querySelector('main, [role=main]') || doc.body;
    return unique([...root.querySelectorAll('a[href]')].flatMap(a => {
        if (a.closest('nav, header, footer, aside, [role=navigation]'))
            return [];
        const href = link(a.getAttribute('href'), url);
        const title = compact(a.querySelector('h1,h2,h3,h4')?.textContent || a.textContent);
        if (!href || href === canonical(url) || !title || IGNORED.test(title) || /\.(jpg|png|pdf|zip|mp4)$/i.test(new URL(href).pathname))
            return [];
        const card = a.closest('article, li, [class*=post], [class*=card]');
        if (new URL(href).origin !== new URL(url).origin && !card && !a.querySelector('h1,h2,h3,h4')) return [];
        const container = card || a.parentElement;
        const published = date(container?.querySelector('time')?.getAttribute('datetime'));
        const summary = compact(container?.querySelector('p')?.textContent).slice(0, 260);
        return [{ url: href, title: title.slice(0, 400), summary, published }];
    }));
}
export function nextPage(doc: Document, url: string): string | undefined {
    const explicit = doc.querySelector('a[rel~=next],link[rel~=next]');
    const next = explicit || [...doc.querySelectorAll('a[href]')].find(a => /^(?:next(?: page)?|older(?: posts)?|下一页|下页|更早(?:的文章)?|»|›|→)$/i.test(compact(a.getAttribute('aria-label') || a.textContent)));
    const href = link(next?.getAttribute('href'), url);
    return href && href !== canonical(url) && new URL(href).origin === new URL(url).origin ? href : undefined;
}
export function listCandidates(html: string, url: string): Candidate[] {
    const doc = htmlDoc(html, url);
    const entries = pageEntries(doc, url);
    const next = nextPage(doc, url);
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
        const p = new URL(entry.url).pathname.split('/').filter(Boolean);
        if (p.length < 2)
            continue;
        const parent = p.slice(0, -1);
        while (parent.length && /^\d{1,4}$/.test(parent[parent.length - 1])) parent.pop();
        const key = parent.length ? '/' + parent.join('/') + '/' : '/';
        groups.set(key, [...(groups.get(key) || []), entry]);
    }
    const candidates: Candidate[] = [...groups].filter(([, v]) => v.length >= 2).map(([prefix, items]) => ({ name: `${text(doc, 'title') || new URL(url).hostname} · ${prefix}`, rule: { kind: 'html', url, pathPrefix: prefix }, entries: items, next, note: '网页文章列表；每次最多读取3页，可继续加载历史，不保证完整历史' }));
    if (!candidates.length && entries.length >= 1 && (entries.length > 1 || doc.querySelector('article a[href],a[href] h2,[class*=post] a[href]')))
        candidates.push({ name: text(doc, 'title') || new URL(url).hostname, rule: { kind: 'html', url }, entries, next, note: '请核对候选文章；若混入其他内容，请选择一篇示例文章辅助确定范围' });
    const origin = new URL(url).origin;
    candidates.sort((a, b) => Number(a.entries.every(entry => new URL(entry.url).origin !== origin)) - Number(b.entries.every(entry => new URL(entry.url).origin !== origin)));
    const local = entries.filter(entry => new URL(entry.url).origin === origin);
    if (isDocumentationDocument(doc) && local.length) candidates.unshift({ name: text(doc, 'title') || new URL(url).hostname, rule: { kind: 'html', url }, entries: local, next, note: '本站公开文档目录；按目录链接发现内容' });
    const found = [...candidates, ...structuredEntries(doc, url)];
    return (isDocumentationDocument(doc) ? found.map(candidate => ({ ...candidate, entries: candidate.entries.filter(entry => new URL(entry.url).origin === origin) })).filter(candidate => candidate.entries.length) : found).slice(0, 20);
}
export function matchCandidate(candidates: Candidate[], rule: Rule): Candidate | undefined {
    return candidates.find(c => c.rule.kind === rule.kind && (rule.kind === 'data' ? c.rule.dataPath === rule.dataPath : c.rule.pathPrefix === rule.pathPrefix));
}
export function assist(candidates: Candidate[], sample: string): Candidate[] {
    const normalized = canonical(sample);
    const exact = candidates.filter(c => c.entries.some(e => e.url === normalized));
    if (exact.length)
        return exact.map(c => ({ ...c, rule: { ...c.rule, sample: normalized } }));
    return [];
}
const turndown = new Turndown({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
turndown.use(gfm);
turndown.addRule('math', { filter: node => node.nodeName.toUpperCase() === 'MATH' || (node instanceof Element && node.hasAttribute('data-latex')), replacement: (_, node) => {
        const el = node as Element;
        return ` $${el.getAttribute('data-latex') || el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || el.textContent}$ `;
    } });
export function markdown(html: string): string {
    const root = htmlDoc(html, 'https://reader.invalid').body;
    normalizeCodeBlocks(root);
    return turndown.turndown(root.innerHTML);
}
export function clean(html: string): string {
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true }, ADD_ATTR: ['data-latex'], FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed', 'video', 'audio', 'svg'], FORBID_ATTR: ['style', 'srcset', 'id', 'name'] });
}
export function bodyRanges(html: string, url: string): {
    selector: string;
    label: string;
    preview: string;
}[] {
    const doc = htmlDoc(html, url);
    return ['article', 'main', '[role=main]', '[itemprop=articleBody]', '.post-content', '.entry-content'].flatMap(selector => {
        const el = doc.querySelector(selector);
        const t = compact(el?.textContent);
        return t.length > 160 ? [{ selector, label: selector, preview: t.slice(0, 280) }] : [];
    });
}
function normalizeArticleImages(doc: Document, url: string) {
    const bestSet = (value: string | null) => {
        const raw = value || '', entries: { src: string; size: number }[] = [];
        let cursor = 0;
        while (cursor < raw.length) {
            while (/[\s,]/.test(raw[cursor] || '') && cursor < raw.length) cursor++;
            const start = cursor;
            while (cursor < raw.length && !/\s/.test(raw[cursor])) cursor++;
            let src = raw.slice(start, cursor), descriptor = '';
            if (src.endsWith(',')) src = src.replace(/,+$/, '');
            else {
                const begin = cursor;
                while (cursor < raw.length && raw[cursor] !== ',') cursor++;
                descriptor = raw.slice(begin, cursor).trim(); cursor++;
            }
            // Keep commas inside a URL (notably data URIs) intact so a
            // placeholder's payload cannot become an invented relative URL.
            if (src && !/^(?:data|javascript):/i.test(src)) entries.push({ src, size: Number.parseFloat(descriptor) || 1 });
        }
        return entries.sort((a, b) => b.size - a.size)[0]?.src;
    };
    doc.querySelectorAll('img').forEach(image => {
        const picture = image.closest('picture');
        const values = [image.getAttribute('data-src'), image.getAttribute('data-original'), image.getAttribute('data-lazy-src'), bestSet(image.getAttribute('data-srcset')), bestSet(image.getAttribute('srcset')), bestSet(picture?.querySelector('source[srcset]')?.getAttribute('srcset') || null), image.getAttribute('src')];
        for (const value of values) {
            if (!value || /^(?:data|javascript):/i.test(value)) continue;
            try { image.setAttribute('src', webUrl(value, url)); break; } catch { /* next usable source */ }
        }
        image.removeAttribute('srcset'); image.removeAttribute('sizes');
        picture?.querySelectorAll('source').forEach(source => source.remove());
    });
}
export async function extractBody(html: string, url: string, articleId: string, selector?: string): Promise<Body> {
    const doc = htmlDoc(html, url);
    normalizeCodeBlocks(doc.body);
    normalizeArticleImages(doc, url);
    const unsupported = !!doc.querySelector('iframe,canvas,video,audio,embed,object');
    const gate = pageGate(html);
    if (gate) throw new Error(gateMessage(gate));
    let content: string | undefined;
    if (selector) content = doc.querySelector(selector)?.innerHTML;
    else if (isDocumentationDocument(doc) && compact(doc.querySelector(DOCUMENT_CONTENT)?.textContent).length >= 40) content = doc.querySelector(DOCUMENT_CONTENT)!.innerHTML;
    else {
        const candidates: string[] = [];
        const structured = structuredBody(doc, url);
        if (structured) candidates.push(`<article>${structured}</article>`);
        const readable = new Readability(doc.cloneNode(true) as Document, { charThreshold: 80, keepClasses: true }).parse()?.content;
        if (readable) candidates.push(readable);
        // #js_content: WeChat articles keep the full text in static HTML but hide
        // it with visibility until client JS runs, so Readability skips it.
        doc.querySelectorAll('article,[itemprop=articleBody],.post-content,.entry-content,.article-content,.post-body,.markdown-body,main,[role=main],#js_content').forEach(node => candidates.push(node.innerHTML));
        content = candidates.find(value => {
            const root = htmlDoc(value, url).body;
            root.querySelectorAll('script,style,nav,header,footer,aside,form').forEach(node => node.remove());
            const plain = compact(root.textContent);
            const linked = [...root.querySelectorAll('a')].reduce((size, a) => size + compact(a.textContent).length, 0);
            return plain.length >= 40 && linked / Math.max(plain.length, 1) < .55 && !!root.querySelector('p,pre,blockquote,ul,ol,table,h2,h3');
        });
    }
    if (!content || compact(htmlDoc(content, url).body.textContent).length < 40)
        throw new Error('正文提取不完整：未找到可读正文，页面可能仍在加载，或返回了导航、登录、验证内容');
    const selected = htmlDoc(content, url);
    normalizeArticleImages(selected, url);
    const root = htmlDoc(clean(selected.body.innerHTML), url).body;
    normalizeCodeBlocks(root);
    root.querySelectorAll('a[href],img').forEach(el => {
        const attr = el.tagName === 'IMG' ? 'src' : 'href';
        const value = el.getAttribute(attr) || el.getAttribute('data-src');
        try {
            if (!value)
                throw new Error();
            el.setAttribute(attr, webUrl(value, url));
        }
        catch {
            el.removeAttribute(attr);
        }
        if (attr === 'href') {
            el.setAttribute('rel', 'noopener noreferrer');
            el.setAttribute('target', '_blank');
        }
    });
    // Some publishing systems use article.comment for the post itself.
    // Remove discussion widgets by container, rather than deleting any node
    // whose class happens to contain "comment" after extraction.
    root.querySelectorAll('script,nav,footer,form,.comments,.comment-list,.comment-thread,.comment-form,#comments,[id^=disqus_thread],.dsq-brlink').forEach(el => el.remove());
    if (compact(root.textContent).length < 40) throw new Error('正文清理后内容不足，未缓存可能的错误页面');
    // Readability may wrap everything in a single div. Unwrap containers so paragraphs have stable anchors.
    while (root.children.length === 1 && ['DIV', 'SECTION', 'ARTICLE', 'MAIN'].includes(root.children[0].tagName))
        root.innerHTML = root.children[0].innerHTML;
    const normalized = root.innerHTML;
    const version = await digest(normalized);
    const blocks = [...root.childNodes].flatMap((n, i) => {
        const value = n.nodeType === 3 ? (n.textContent?.trim() ? `<p>${escapeHtml(n.textContent)}</p>` : '') : (n as Element).outerHTML;
        return value ? [{ id: `b${i}`, html: value }] : [];
    });
    return { articleId, version, title: compact(doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.querySelector('h1')?.textContent || doc.title) || undefined, html: normalized, text: root.textContent || '', blocks, images: [...new Set([...root.querySelectorAll('img[src]')].map(i => i.getAttribute('src')!))].map(url => ({ url })), unsupported, fetched: new Date().toISOString() };
}
export function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
