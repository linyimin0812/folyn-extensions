import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';
import python from 'highlight.js/lib/languages/python';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import css from 'highlight.js/lib/languages/css';
import yaml from 'highlight.js/lib/languages/yaml';
import sql from 'highlight.js/lib/languages/sql';
import java from 'highlight.js/lib/languages/java';
import go from 'highlight.js/lib/languages/go';
import rust from 'highlight.js/lib/languages/rust';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import diff from 'highlight.js/lib/languages/diff';
import markdown from 'highlight.js/lib/languages/markdown';
for (const [name, grammar] of Object.entries({ javascript, typescript, bash, python, json, xml, css, yaml, sql, java, go, rust, cpp, csharp, diff, markdown })) hljs.registerLanguage(name, grammar);
const aliases: Record<string, string> = { js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', shell: 'bash', sh: 'bash', zsh: 'bash', console: 'bash', py: 'python', html: 'xml', svg: 'xml', yml: 'yaml', c: 'cpp', 'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', md: 'markdown', text: 'plaintext', txt: 'plaintext' };
const names: Record<string, string> = { javascript: 'JavaScript', typescript: 'TypeScript', bash: 'Shell', python: 'Python', json: 'JSON', xml: 'HTML / XML', css: 'CSS', yaml: 'YAML', sql: 'SQL', java: 'Java', go: 'Go', rust: 'Rust', cpp: 'C / C++', csharp: 'C#', diff: 'Diff', markdown: 'Markdown', plaintext: 'Text' };
function language(value: string | null | undefined): string {
    const raw = value?.trim().toLowerCase() || '';
    if (!/^[a-z][a-z\d+#.-]{0,31}$/.test(raw)) return '';
    return aliases[raw] || raw;
}
function declared(element: Element | null): string {
    if (!element) return '';
    return language(element.getAttribute('data-language') || element.getAttribute('data-lang') || [...element.classList].map(value => /^(?:language|lang)-(.+)$/.exec(value)?.[1]).find(Boolean));
}
function headerLanguage(element: Element): string | undefined {
    const text = (element.textContent || '').trim();
    const match = /^(?:CODE|代码|程式碼)\s*(.*)$/i.exec(text);
    if (!match) return;
    const lang = language(match[1]);
    return !match[1] || names[lang] ? lang : undefined;
}
/** Normalize before extraction, display and export. Website toolbar text is UI,
 * not article prose. Never infer lost newlines by rewriting program syntax. */
export function normalizeCodeBlocks(root: ParentNode): void {
    root.querySelectorAll('pre').forEach(pre => {
        const paragraph = pre.parentElement;
        if (paragraph?.tagName === 'P' && [...paragraph.childNodes].every(node => node === pre || node.nodeType === 3 && !node.textContent?.trim())) paragraph.replaceWith(pre);
        let lang = declared(pre.querySelector('code')) || declared(pre);
        const wrapper = pre.closest('.art-code,.code-block,.codeblock,[data-rehype-pretty-code-figure]');
        if (wrapper) wrapper.querySelectorAll('button,[role=button]').forEach(node => { if (!pre.contains(node)) node.remove(); });
        let header = pre.previousElementSibling;
        while (header) {
            const fromHeader = headerLanguage(header);
            if (fromHeader === undefined) break;
            lang ||= fromHeader;
            const previous = header.previousElementSibling;
            header.remove(); header = previous;
        }
        const copy = pre.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('br').forEach(node => node.replaceWith('\n'));
        copy.querySelectorAll('.line-number,.line-numbers-rows').forEach(node => node.remove());
        const source = copy.querySelector('code') || copy;
        const lines = [...source.children];
        const text = lines.length > 1 && lines.every(line => line.matches('.line,[data-line]')) && ![...source.childNodes].some(node => node.nodeType === 3 && node.textContent?.includes('\n'))
            ? lines.map(line => line.textContent || '').join('\n') : source.textContent || '';
        const code = pre.ownerDocument.createElement('code');
        code.textContent = text;
        if (lang) code.className = `language-${lang}`;
        if (lang) pre.setAttribute('data-language', lang);
        pre.replaceChildren(code);
    });
}
const highlights = new Map<string, { value: string; language?: string }>();
let cachedCharacters = 0;
function highlight(text: string, lang: string) {
    const key = `${lang}\0${text}`;
    const previous = highlights.get(key);
    if (previous) return previous;
    const result = lang ? hljs.highlight(text, { language: lang, ignoreIllegals: true }) : hljs.highlightAuto(text, ['javascript', 'typescript', 'python', 'bash', 'json', 'yaml', 'xml', 'css', 'sql', 'go', 'rust', 'java']);
    while (highlights.size && (highlights.size >= 32 || cachedCharacters + key.length > 500000)) {
        const oldest = highlights.keys().next().value!;
        cachedCharacters -= oldest.length; highlights.delete(oldest);
    }
    const value = { value: result.value, language: result.language };
    highlights.set(key, value); cachedCharacters += key.length;
    return value;
}
/** Highlight escaped code text; source-site token classes and inline colors are
 * deliberately replaced by a consistent, theme-aware vocabulary. */
export function highlightCodeBlocks(root: ParentNode): void {
    normalizeCodeBlocks(root);
    root.querySelectorAll('pre > code').forEach(code => {
        const pre = code.parentElement!, text = code.textContent || '';
        let lang = declared(code);
        if (text.length <= 100000 && lang !== 'plaintext' && (!lang || hljs.getLanguage(lang))) {
            const result = highlight(text, lang);
            code.innerHTML = result.value; lang ||= result.language || '';
        }
        code.classList.add('hljs');
        if (lang) { code.classList.add(`language-${lang}`); pre.setAttribute('data-language', lang); pre.setAttribute('data-code-label', names[lang] || lang); }
    });
}
