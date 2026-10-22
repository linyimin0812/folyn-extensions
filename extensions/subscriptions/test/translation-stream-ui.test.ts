import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ExtensionAiChatParams } from 'folyn-extension-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Reader } from '../src/reader';
import { Settings } from '../src/settings';
import { Subscriptions } from '../src/service';
import { progress, units, documentHtml } from '../src/translation';
import { languageName, selectedLanguage, translationLanguages } from '../src/languages';
import { Repository } from '../src/repository';
import { harness } from './helpers';

let root: Root | undefined, cleanup: (() => void) | undefined;
const modalDescriptors = ['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
afterEach(async () => {
    if (root) await act(async () => root!.unmount()); root = undefined;
    cleanup?.(); cleanup = undefined;
    for (const [name, descriptor] of modalDescriptors) {
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
    document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function gate() {
    let release!: () => void;
    const promise = new Promise<void>(resolve => { release = resolve; });
    return { promise, release };
}
async function setup() {
    vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, '流式测试', [], 2, 0, false, await service.preview(candidate));
    const repo = service.repo!; repo.state.settings.autoRead = false;
    const article = repo.state.articles[0], body = await service.loadBody(article);
    body.blocks = [{ id: 'first', html: '<p>First <strong>important</strong> paragraph.</p>' }, { id: 'second', html: '<p>Second paragraph.</p>' }];
    body.html = body.blocks.map(block => block.html).join(''); await repo.putBody(body);
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(e => e.textContent?.trim() === label)!;
    const renderReader = () => act(async () => root!.render(createElement(Reader, { service, article, onBack() {}, onClear() {} })));
    let finish = gate(); let request!: ExtensionAiChatParams;
    const chat = vi.spyOn(h.host.api.ai, 'chat').mockImplementation(async params => { request = params; await finish.promise; });
    const begin = async () => { await renderReader(); await act(async () => button('双语').click()); await act(async () => button('开始翻译').click()); };
    const emit = (text: string) => act(async () => { request.onEvent({ type: 'text', content: text }); await vi.advanceTimersByTimeAsync(80); });
    const end = () => act(async () => { finish.release(); await vi.advanceTimersByTimeAsync(0); finish = gate(); });
    return { h, service, repo, article, body, container, button, begin, emit, end, chat, getRequest: () => request };
}
describe('live whole-article translation', () => {
    it('renders wrapper-free Markdown immediately and caches the whole partial and completed document', async () => {
        const { service, repo, article, body, container, begin, emit, end, chat } = await setup();
        await begin();
        expect(container.textContent).toContain('正在请求翻译，返回后实时显示');
        await emit('# 译文\n\n第一');
        expect(container.querySelector('.document-result')!.textContent).toContain('第一');
        expect(container.textContent).toContain('正在接收译文');
        expect(service.translating.has(article.id)).toBe(true);
        let cached = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(cached.document).toMatchObject({ content: '# 译文\n\n第一', complete: false });
        await emit(' **重要**段落。\n\n第二段落。'); await end();
        expect(container.textContent).toContain('全文翻译完成');
        expect(container.querySelector('.document-result strong')!.textContent).toBe('重要');
        cached = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(cached.document).toMatchObject({ content: '# 译文\n\n第一 **重要**段落。\n\n第二段落。', complete: true });
        expect(chat).toHaveBeenCalledOnce();
        expect(service.translationStream(repo, article, body.version, 'zh-CN')).toBeUndefined();
        let path = ''; await act(async () => { path = await service.save(article, body, 'translated', 'Notes', 'Translated', false, false, false); });
        const saved = await repo.vault.readText(path);
        expect(saved).toContain('**重要**'); expect(saved).toContain('translation_complete: true');
        expect(saved).not.toContain('First **important**');
    });
    it('keeps streamed partial text after cancellation, ignores late deltas and replaces it on retry', async () => {
        const { service, repo, article, body, container, begin, emit, end } = await setup(); await begin();
        await emit('已经返回的译文，尚未结束');
        await act(async () => service.cancelTranslation(article));
        expect(container.querySelector('.document-result')!.textContent).toContain('已经返回的译文');
        await emit('迟到内容'); await end();
        expect(container.textContent).not.toContain('迟到内容');
        const cached = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(cached.cancelled).toBe(true); expect(cached.document!.complete).toBe(false);
        expect(cached.document!.content).toBe('已经返回的译文，尚未结束');
        await act(async () => { await expect(service.save(article, body, 'translated', 'Notes', 'Partial', false, false, false)).rejects.toThrow('尚未完成'); });
        let path = ''; await act(async () => { path = await service.save(article, body, 'translated', 'Notes', 'Partial', true, false, false); });
        expect(await repo.vault.readText(path)).toContain('First **important**');
        await act(async () => container.querySelector<HTMLButtonElement>('.statusbox button')!.click());
        await emit('重新生成的完整译文'); await end();
        const resumed = (await repo.translation(article, body.version, 'zh-CN'))!;
        expect(resumed.document).toMatchObject({ content: '重新生成的完整译文', complete: true });
    });
    it('does not expose a previous Vault stream or cache late deltas into the new Vault', async () => {
        const { h, service, repo, article, body, begin, emit, end } = await setup(); await begin();
        await emit('旧工作区预览');
        await act(async () => { root!.render(null); await service.switchVault(h.second.vault); });
        expect(service.translationStream(repo, article, body.version, 'zh-CN')).toBeUndefined();
        await emit('晚到内容'); await end();
        expect([...h.second.files.keys()].some(path => path.includes('/translations/'))).toBe(false);
        expect((await repo.translation(article, body.version, 'zh-CN'))?.document?.content).toBe('旧工作区预览');
    });
    it('sanitizes arbitrary partial Markdown/HTML and removes model-provided resource URLs', async () => {
        const { body } = await setup();
        const html = documentHtml(body, '<p onclick="bad()">Visible<script>bad()</script><img src="https://evil.invalid/image"><a href="javascript:bad()">link</a>');
        expect(html).toContain('Visible'); expect(html).not.toMatch(/onclick|script|src=|href=|evil\.invalid|javascript/);
    });
    it('throttles preview updates and does not write the cache on every token', async () => {
        const { h, service, begin, getRequest, end, repo, article, body } = await setup(); await begin();
        const write = vi.spyOn(h.first.vault.data, 'writeText'), before = service.revision;
        await act(async () => {
            getRequest().onEvent({ type: 'text', content: '首字' });
            for (let i = 0; i < 100; i++) getRequest().onEvent({ type: 'text', content: '字' });
            await vi.advanceTimersByTimeAsync(80);
        });
        expect(service.revision - before).toBeLessThanOrEqual(2);
        expect(write.mock.calls.filter(([path]) => path.includes('/translations/'))).toHaveLength(1);
        expect(service.translationStream(repo, article, body.version, 'zh-CN')!.translation.document!.content).toContain('字'.repeat(100));
        await act(async () => service.cancelTranslation(article)); await end();
    });
    it('keeps translated and original image nodes mounted while streamed prose grows', async () => {
        const { repo, body, container, begin, emit, end } = await setup();
        body.blocks.unshift({ id: 'picture', html: '<p><img src="https://example.com/stable.png" alt="Stable image"></p>' });
        body.images = [{ url: 'https://example.com/stable.png', path: 'subscriptions/images/stable.png' }];
        await repo.putBody(body);
        await begin(); await emit('FOLYNKEEP0END\n\n已经返回的正文');
        const translated = container.querySelector('.document-result img')!;
        const original = container.querySelector('.document-original img')!;
        expect(translated).not.toBeNull(); expect(original).not.toBeNull();
        (translated as HTMLElement).focus();
        await act(async () => { translated.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })); });
        const closeImage = container.querySelector<HTMLButtonElement>('button[aria-label="关闭图片"]')!;
        expect(closeImage).not.toBeNull(); expect(document.activeElement).toBe(closeImage);
        const changes: MutationRecord[] = [];
        const observer = new MutationObserver(records => changes.push(...records));
        observer.observe(container.querySelector('.document-result')!, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
        for (const text of ['，继续', '接收', '**重点**', '。\n\n下一段']) {
            await emit(text);
            expect(container.querySelector('.document-result img')).toBe(translated);
            expect(container.querySelector('.document-original img')).toBe(original);
            expect(document.activeElement).toBe(closeImage);
        }
        await end();
        expect(container.querySelector('.document-result img')).toBe(translated);
        expect(changes.filter(record => record.type === 'attributes')).toHaveLength(0);
        expect(changes.some(record => [...record.removedNodes].some(node => node instanceof Element && (node.matches('img') || node.querySelector('img'))))).toBe(false); observer.disconnect();
        await act(async () => { container.querySelector('dialog.image-viewer')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
        expect(document.activeElement).toBe(translated);
        expect(translated.getAttribute('tabindex')).toBe('0');
        expect(original.getAttribute('tabindex')).toBe('0');
    });
    it('offers exactly the host six languages and persists a choice used by the actual translation prompt', async () => {
        const { h, service, repo, container, button, begin, getRequest, end } = await setup();
        await act(async () => root!.render(createElement(Settings, { service, onClose() {}, onClear() {} })));
        const selector = () => [...container.querySelectorAll<HTMLButtonElement>('[role=combobox]')].find(e => e.closest('.select-field')?.textContent?.startsWith('目标语言'))!;
        await act(async () => selector().click());
        expect([...container.querySelectorAll('[role=option]')].map(e => e.textContent)).toEqual(['中文', 'English', '日本語', 'Español', 'Deutsch', 'Français']);
        await act(async () => (Array.from(container.querySelectorAll<HTMLElement>('[role=option]')).find(e => e.textContent === 'Français')!).click());
        await act(async () => button('保存设置').click());
        const saved = new Repository(h.first.vault); await saved.load(); expect(saved.state.settings.language).toBe('fr');
        await begin(); expect(getRequest().prompt).toContain('to fr.');
        await act(async () => service.cancelTranslation(repo.state.articles[0])); await end();
        expect(translationLanguages).toHaveLength(6);
        expect(selectedLanguage('zh')).toBe('zh-CN');
        expect(selectedLanguage('en-US')).toBe('en');
        expect(languageName('ja')).toBe('日本語');
    });
    it('does not mistake Japanese text for Chinese when the target language is Chinese', async () => {
        const { body } = await setup();
        const japanese = { ...body, blocks: [{ id: 'ja', html: '<p>これは日本語の記事です。</p>' }] };
        expect(units(japanese, 'zh-CN')).toHaveLength(1);
        const chinese = { ...body, blocks: [{ id: 'zh', html: '<p>这是中文正文。</p>' }] };
        expect(units(chinese, 'zh-CN')).toHaveLength(0);
        expect(units(chinese, 'en')).toHaveLength(1);
    });
});
