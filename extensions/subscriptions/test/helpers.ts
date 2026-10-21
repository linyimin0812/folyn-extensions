import type { Host, HostSupport, SubscriptionApi, VaultSession } from '../src/host';
import type { ExtensionContext } from 'folyn-extension-sdk';
import { article, feed, staticList, dynamicList } from './fixtures';
export function memoryVault(id = 'vault-a') {
    const files = new Map<string, string | Uint8Array>();
    files.set('Notes', 'directory');
    const snapshot = async (path: string) => ({ path, title: path.split('/').pop()!.replace(/\.md$/i, ''), text: await vault.readText(path) });
    const vault: VaultSession = { id, name: id,
        async exists(path) {
            return files.has(path);
        },
        async readText(path) {
            const v = files.get(path);
            if (typeof v !== 'string')
                throw new Error('missing');
            return v;
        },
        async readBinary(path) {
            const v = files.get(path);
            if (!(v instanceof Uint8Array))
                throw new Error('missing');
            return v;
        },
        async writeText(path, value) {
            files.set(path, value);
        }, async writeBinary(path, value) {
            files.set(path, value);
        },
        async createText(path, value) {
            if (files.has(path))
                throw new Error('file exists');
            files.set(path, value);
        },
        async remove(path) {
            for (const k of files.keys())
                if (k === path || k.startsWith(path + '/'))
                    files.delete(k);
        },
        async assetUrl(path) {
            return `https://assets.invalid/${id}/${path}`;
        }, async chooseNotes() {
            return Promise.all([...files.keys()].filter(path => /\.md$/i.test(path) && !path.startsWith('.folyn/')).map(snapshot));
        }, readNote: snapshot, async appendNote(path, text, expectedText) {
            const current = await vault.readText(path);
            if (current !== expectedText) throw new Error('笔记内容已变化，请重新确认');
            files.set(path, current + (current ? '\n\n' : '') + text + '\n');
        }, async open() {
        }, async chooseDirectory() {
            return 'Notes';
        },
    };
    return { vault, files };
}
export function harness() {
    const first = memoryVault(), second = memoryVault('vault-b');
    let current: VaultSession | null = first.vault;
    const changeListeners = new Set<(v: VaultSession | null) => void>();
    const disposables: {
        dispose(): void;
    }[] = [];
    const routes = new Map<string, string>([['https://example.com/feed.xml', feed()], ['https://example.com/', `<html><head><link rel="alternate" type="application/rss+xml" href="/feed.xml"></head><body></body></html>`], ['https://example.com/blog/', staticList()], ['https://example.com/dynamic/', dynamicList()]]);
    const support: HostSupport = { current: () => current, onChange(fn) {
            changeListeners.add(fn);
            return { dispose() {
                    changeListeners.delete(fn);
                } };
        }, onFileChange() {
            return { dispose() {
                } };
        }, async openExternal() {
        }, openSettings() {
        }, openVaults() {
        }, setBadge() {
        }, async fetch(url, binary) {
            if (binary)
                return { url, status: 200, headers: { 'content-type': 'image/png' }, body: btoa('fake-image-bytes') };
            if (routes.has(url))
                return { url, status: 200, headers: {}, body: routes.get(url)! };
            if (/\/article-|\/posts\/dynamic-/.test(url))
                return { url, status: 200, headers: {}, body: article() };
            return { url, status: 404, headers: {}, body: 'Not found' };
        } };
    const api = { subscriptions: support, ai: { async pairs() {
                return [{ provider: 'mock', model: 'test' }];
            }, async chat(params: {
                prompt: string;
                onEvent: (e: {
                    type: 'text' | 'done';
                    content?: string;
                }) => void;
            }) {
                if (params.prompt.includes('<reference-materials>')) {
                    params.onEvent({ type: 'text', content: '先把这个概念放回原文语境。原文强调的是：理解方法的适用前提，再用一个小实验判断它是否适合当前问题。[M1]\n\n' });
                    params.onEvent({ type: 'text', content: '### 可以这样验证\n\n1. 写下自己的解释，标出尚不确定的前提。\n2. 对照加入的笔记，找到一个相同点和一个不同点。\n3. 选一个成本最低的实际场景，记录结果与预期的差异。\n\n这是演示回答，用于检查伴读交互。' });
                    params.onEvent({ type: 'done' }); return;
                }
                if (params.prompt.includes('<article-text>')) {
                    const raw = params.prompt.split('<article-text>\n')[1].split('\n</article-text>')[0];
                    params.onEvent({ type: 'text', content: `译文：${raw}` });
                    params.onEvent({ type: 'done' });
                    return;
                }
                if (params.prompt.includes('<article-document>')) {
                    const raw = params.prompt.split('<article-document>\n')[1].split('\n</article-document>')[0];
                    const doc = new DOMParser().parseFromString(raw, 'text/html');
                    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
                    let node: Node | null;
                    while ((node = walker.nextNode())) if (node.textContent?.trim() && !node.parentElement?.closest('[data-folyn-keep]')) node.textContent = `译文：${node.textContent}`;
                    params.onEvent({ type: 'text', content: doc.body.innerHTML });
                    params.onEvent({ type: 'done' });
                    return;
                }
                const raw = params.prompt.split('<article-fragment>\n')[1].split('\n</article-fragment>')[0];
                const value = JSON.parse(raw) as string[];
                params.onEvent({ type: 'text', content: JSON.stringify(value.map(v => `译文：${v}`)) });
                params.onEvent({ type: 'done' });
            } }, env: { theme: 'light', onThemeChange() {
                return { dispose() {
                    } };
            } } } as unknown as SubscriptionApi;
    const ctx = { addDisposable(d: {
            dispose(): void;
        }) {
            disposables.push(d);
        }, ui: { dialogs: { async confirm() {
                    return true;
                }, async info() {
                } } } } as unknown as ExtensionContext;
    const host: Host = { api, ctx, support };
    return { host, first, second, routes, switch(v: VaultSession | null) {
            current = v;
            changeListeners.forEach(fn => fn(v));
        }, dispose() {
            disposables.forEach(d => d.dispose());
        } };
}
