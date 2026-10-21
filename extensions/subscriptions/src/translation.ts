import { normalizeCodeBlocks } from './code-blocks';
import type { Body, Translation } from './model';
import { clean, htmlDoc, markdown } from './parse';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
export interface Unit {
    key: string;
    text: string;
}
const SKIP = 'pre,code,kbd,samp,math,[data-latex],.katex,.MathJax';
function needsTranslation(text: string, language: string) {
    return /\p{L}/u.test(language.startsWith('zh') ? text.replace(/\p{Script=Han}/gu, '') : text);
}
function parts(value: string): string[] {
    const result: string[] = [];
    while (value.length > 1600) {
        let at = value.lastIndexOf(' ', 1600);
        if (at < 800)
            at = 1600;
        result.push(value.slice(0, at));
        value = value.slice(at);
    }
    if (value)
        result.push(value);
    return result;
}
function nodes(html: string): {
    root: HTMLElement;
    nodes: Text[];
} {
    const root = htmlDoc(html, 'https://reader.invalid').body;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const list: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode()))
        if (!node.parentElement?.closest(SKIP) && /\p{L}/u.test(node.textContent || ''))
            list.push(node as Text);
    return { root, nodes: list };
}
export function units(body: Body, language: string, format: 'html-blocks' | 'text-nodes' = 'html-blocks'): Unit[] {
    if (format === 'html-blocks') return body.blocks.flatMap(block => {
        const text = nodes(block.html).nodes.map(node => node.textContent || '').join(' ');
        if (!needsTranslation(text, language)) return [];
        return [{ key: `block:${block.id}`, text: block.html }];
    });
    return body.blocks.flatMap(b => nodes(b.html).nodes.flatMap((n, i) => parts(n.textContent || '').flatMap((p, j) => {
        // A Chinese-only unit needs no model call when the target is Chinese.
        if (!needsTranslation(p, language))
            return [];
        return [{ key: `${b.id}:${i}:${j}`, text: p }];
    })));
}
export function translatedBlock(html: string, blockId: string, t: Translation, bilingual = false): string {
    if (bilingual && (t.format === 'html-blocks' ? !t.values[`block:${blockId}`] : !Object.keys(t.values).some(key => key.startsWith(`${blockId}:`)))) return '';
    const parsed = nodes(t.format === 'html-blocks' ? clean(t.values[`block:${blockId}`] ?? html) : html);
    if (t.format !== 'html-blocks') parsed.nodes.forEach((n, i) => {
        n.textContent = parts(n.textContent || '').map((p, j) => t.values[`${blockId}:${i}:${j}`] ?? p).join('');
    });
    if (bilingual)
        parsed.root.querySelectorAll('img,pre,math,[data-latex],.katex,.MathJax').forEach(e => e.remove());
    return parsed.root.innerHTML;
}
export function progress(body: Body, t: Translation | undefined, language: string): {
    total: number;
    done: number;
    failed: number;
} {
    if (t?.format === 'document') return { total: t.document?.parts.length || 1, done: t.document?.parts.filter(part => part.complete).length || 0, failed: Object.keys(t.errors).length };
    const u = units(body, language, t ? t.format || 'text-nodes' : 'html-blocks');
    return { total: u.length, done: u.filter(x => !!t?.values[x.key] && !t?.pending?.includes(x.key)).length, failed: u.filter(x => !!t?.errors[x.key]).length };
}

const KEEP = `${SKIP},img,picture`;
/** Optional resource markers preserve code/formulas/images when echoed. They
 * never gate acceptance of prose or require model output to match a DOM shape. */
function documentSource(body: Body) {
    const root = htmlDoc(body.blocks.map(block => block.html).join('\n'), 'https://reader.invalid').body;
    normalizeCodeBlocks(root);
    const resources: string[] = [];
    [...root.querySelectorAll(KEEP)].filter(node => !node.parentElement?.closest(KEEP)).forEach(node => {
        const token = `FOLYNKEEP${resources.length}END`;
        resources.push(clean(node.outerHTML));
        node.replaceWith(root.ownerDocument.createTextNode(token));
    });
    return { root, resources };
}
export function documentInputs(body: Body): string[] {
    const { root } = documentSource(body);
    const inputs: string[] = [];
    let batch = '';
    for (const node of [...root.childNodes]) {
        const text = markdown(node.nodeType === 1 ? (node as Element).outerHTML : node.textContent || '');
        if (!text.trim()) continue;
        if (batch && batch.length + text.length + 2 > 48000) { inputs.push(batch); batch = ''; }
        batch += `${batch ? '\n\n' : ''}${text}`;
    }
    if (batch.trim()) inputs.push(batch);
    return inputs;
}
export function documentHtml(body: Body, content: string): string {
    // Models may return Markdown, plain prose, or HTML. None requires wrappers.
    const raw = content.trim().replace(/^```(?:markdown|md|html)\s*\n/i, '').replace(/\n```\s*$/, '');
    const safe = DOMPurify.sanitize(marked.parse(raw, { async: false }) as string, { FORBID_TAGS: ['img', 'picture', 'source', 'video', 'audio', 'iframe', 'object', 'embed', 'svg', 'link', 'style'] });
    const root = htmlDoc(clean(safe), 'https://reader.invalid').body;
    // Model-provided resources never initiate network/file requests. Only known
    // source resources can be restored below and resolved by imageHtml/save.
    root.querySelectorAll('img,picture,source,video,audio').forEach(node => node.remove());
    const resources = documentSource(body).resources;
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) texts.push(node as Text);
    texts.forEach(text => {
        const value = text.textContent || '';
        if (!/FOLYNKEEP\d+END/.test(value)) return;
        const fragment = root.ownerDocument.createDocumentFragment();
        let start = 0;
        for (const match of value.matchAll(/FOLYNKEEP(\d+)END/g)) {
            fragment.append(value.slice(start, match.index));
            const resource = resources[Number(match[1])];
            if (resource) {
                const template = root.ownerDocument.createElement('template');
                template.innerHTML = resource;
                fragment.append(template.content);
            }
            start = match.index! + match[0].length;
        }
        fragment.append(value.slice(start)); text.replaceWith(fragment);
    });
    normalizeCodeBlocks(root);
    return clean(root.innerHTML);
}
