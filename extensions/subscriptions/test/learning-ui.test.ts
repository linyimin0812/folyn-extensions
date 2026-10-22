import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAiChatParams } from 'folyn-extension-sdk';
import { Subscriptions } from '../src/service';
import { LEARNING_PATH } from '../src/learning';
import { SubscriptionsPage, setRuntime } from '../src/workspace';
import { harness } from './helpers';

let root: Root | undefined, cleanup: (() => void) | undefined;
const dialogMethods = ['showModal', 'close'] as const;
const descriptors = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined; cleanup?.(); cleanup = undefined;
    setRuntime(undefined); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
    dialogMethods.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); });
});
async function flush() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); }
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function setValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
}
async function setup(width = 1280) {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
    const h = harness(), service = new Subscriptions(h.host); await service.start();
    cleanup = () => { service.stop(); h.dispose(); };
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, 'Learning articles', [], 2, 0, false, await service.preview(candidate));
    const repo = service.repo!; repo.state.settings.autoRead = false;
    for (const article of repo.state.articles) await service.loadBody(article);
    repo.state.ui.selected = repo.state.articles[0].id; await repo.persist();
    const chat = vi.spyOn(h.host.api.ai, 'chat');
    const container = document.createElement('div'); document.body.append(container); root = createRoot(container);
    setRuntime(service);
    await act(async () => root!.render(createElement(SubscriptionsPage)));
    await flush();
    const button = (name: string, parent: ParentNode = container) => [...parent.querySelectorAll<HTMLButtonElement>('button')].find(item => item.getAttribute('aria-label') === name || item.textContent?.trim() === name)!;
    const panel = () => container.querySelector<HTMLElement>('#fsub-learning')!;
    const open = async () => { await act(async () => { button('伴读这篇文章').click(); }); await flush(); };
    const materials = async () => { await act(async () => { panel().querySelector<HTMLElement>('.learning-materials>summary')!.click(); }); };
    const notes = async () => { await act(async () => { panel().querySelectorAll<HTMLButtonElement>('.learning-tabs button')[1].click(); }); };
    return { h, service, repo, chat, container, button, panel, open, notes, materials };
}

describe('real subscription learning workflow', () => {
    it('starts with a concrete question action and focuses the editable preset without sending it', async () => {
        const { service, chat, button, panel, open } = await setup();
        await open();
        expect(panel().textContent).toContain('有哪里没读懂？');
        expect(panel().querySelector('.learning-record-select [role=combobox]')).not.toBeNull();
        expect(panel().querySelector('[role=listbox]')).toBeNull();
        expect(panel().querySelector<HTMLDetailsElement>('.learning-materials')!.open).toBe(false);
        expect(button('调整回答指引').getAttribute('aria-expanded')).toBe('false');
        expect(panel().querySelector('.learning-guidance')).toBeNull();
        const input = panel().querySelector<HTMLTextAreaElement>('#fsub-learning-question')!;
        expect(document.activeElement).toBe(input);
        await act(async () => { button('读懂：解释关键概念与前提').click(); });
        expect(input.value).toContain('关键概念');
        expect(service.learning!.active!.draft).toBe(input.value);
        expect(document.activeElement).toBe(input);
        expect(panel().textContent).toContain('问题已填入'); expect(chat).not.toHaveBeenCalled();
        await act(async () => { button('应用：设计一个小实践').click(); });
        expect(input.value).toContain('可以尝试的小步骤'); expect(chat).not.toHaveBeenCalled();
        expect(panel().querySelectorAll('.learning-question-cards>button')).toHaveLength(3);
        await setValue(input, 'What is the key assumption?');
        expect(panel().querySelectorAll('.learning-question-cards>button')).toHaveLength(3);
        expect(panel().querySelector('#fsub-learning-question')).toBe(input);
        expect(panel().textContent).not.toContain('问题已填入');
        await act(async () => { button('发送问题').click(); }); await flush();
        expect(chat).toHaveBeenCalledTimes(1);
        expect(service.learning!.active!.messages[0].content).toBe('What is the key assumption?');
    });

    it('keeps history and models in their toolbars and reveals references and guidance only on demand', async () => {
        const { chat, button, panel, open, materials } = await setup();
        await open();
        expect(panel().querySelector('.learning-header [role=combobox]')).not.toBeNull();
        expect(panel().querySelector('.learning-compose-actions [role=combobox]')).not.toBeNull();
        expect(panel().querySelector('.learning-note-footer')).toBeNull();
        const details = panel().querySelector<HTMLDetailsElement>('.learning-materials')!;
        await materials(); expect(details.open).toBe(true);
        const summary = details.querySelector<HTMLElement>('summary')!;
        await act(async () => { summary.focus(); summary.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
        expect(details.open).toBe(false); expect(document.activeElement).toBe(summary);
        await materials();
        await act(async () => { panel().querySelector('textarea')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
        expect(details.open).toBe(false);
        await act(async () => { button('调整回答指引').click(); });
        expect(panel().querySelector('.learning-guidance textarea')).not.toBeNull();
        expect(button('调整回答指引').getAttribute('aria-expanded')).toBe('true');
        await act(async () => { button('调整回答指引').click(); });
        expect(panel().querySelector('.learning-guidance')).toBeNull();
        expect(chat).not.toHaveBeenCalled();
    });

    it('guides an empty save into note writing instead of creating an empty note', async () => {
        const { h, chat, container, button, panel, open } = await setup();
        const create = vi.spyOn(h.first.vault, 'createText');
        await open();
        await act(async () => { button('笔记').click(); });
        await act(async () => { button('保存笔记…').click(); }); await flush();
        const input = panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!;
        expect(document.activeElement).toBe(input);
        expect(panel().textContent).toContain('先写下一点自己的理解');
        expect(container.querySelector('.modal')).toBeNull(); expect(create).not.toHaveBeenCalled();
        await setValue(input, 'A conclusion I want to keep.');
        await act(async () => { button('保存笔记…').click(); });
        expect(container.querySelector('.modal h2')?.textContent).toBe('保存笔记');
        expect(chat).not.toHaveBeenCalled();
    });

    it('opens note selection only when the comparison card is chosen and explains cancellation', async () => {
        const { h, chat, button, panel, open } = await setup();
        const choose = vi.spyOn(h.first.vault, 'chooseNotes').mockResolvedValue([]);
        await open(); expect(choose).not.toHaveBeenCalled();
        await act(async () => { button('联系：和我的笔记对照').click(); }); await flush();
        expect(choose).toHaveBeenCalledTimes(1);
        expect(panel().textContent).toContain('未选择笔记');
        expect(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-question')!.value).toContain('对照');
        expect(chat).not.toHaveBeenCalled();
    });

    it('enters learning through the article toolbar without a separate sidebar entry', async () => {
        const { service, repo, chat, container, panel, open } = await setup();
        await act(async () => { repo.state.ui.selected = undefined; service.changed(); });
        expect(container.querySelector('.nav-footer [aria-label="伴读与学习记录"]')).toBeNull();
        expect(panel()).toBeNull(); expect(service.learning!.active).toBeUndefined();
        const firstArticle = container.querySelector<HTMLButtonElement>('.article-card')!;
        await act(async () => { firstArticle.click(); }); await flush();
        const trigger = container.querySelector<HTMLButtonElement>('[data-learning-trigger]')!;
        expect(trigger.textContent?.trim()).toBe('');
        expect(trigger.getAttribute('aria-label')).toBe('伴读这篇文章');
        await open();
        expect(panel().textContent).toContain('有哪里没读懂？');
        expect(document.activeElement).toBe(panel().querySelector('#fsub-learning-question'));
        expect(service.learning!.state.records).toHaveLength(1); expect(chat).not.toHaveBeenCalled();
    });
    it('opens from the reader without AI and restores a directly written thought after closing', async () => {
        const { h, service, chat, container, button, panel, open, notes } = await setup();
        expect(service.learning!.state.records).toHaveLength(0);
        await open();
        expect(panel()).not.toBeNull(); expect(chat).not.toHaveBeenCalled();
        await notes();
        const text = '我的理解：任务的归属应在启动时固定。';
        await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!, text);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
        expect(JSON.parse(String(h.first.dataFiles.get(LEARNING_PATH))).records[0].noteDraft).toBe(text);
        await act(async () => { button('关闭伴读').click(); }); await flush();
        expect(container.querySelector('#fsub-learning')).toBeNull();
        await open();
        expect(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')?.value).toBe(text);
        expect(service.learning!.state.records).toHaveLength(1); expect(chat).not.toHaveBeenCalled();
    });

    it('retains the original discussion while reading another article and only adds it explicitly', async () => {
        const { service, repo, chat, container, button, panel, open } = await setup();
        await open();
        const first = service.learning!.active!, originalId = first.id, originalArticle = first.materials[0].articleId;
        const other = repo.state.articles.find(article => article.id !== originalArticle)!;
        await act(async () => { [...container.querySelectorAll<HTMLButtonElement>('.article-card')].find(item => item.title === other.title)!.click(); }); await flush();
        expect(service.learning!.active!.id).toBe(originalId);
        expect(first.materials.map(item => item.articleId)).toEqual([originalArticle]);
        expect(panel().textContent).toContain('正在阅读');
        await act(async () => { button('把这篇加入讨论').click(); });
        expect(first.materials.map(item => item.articleId)).toEqual([originalArticle, other.id]);
        expect(service.learning!.active!.id).toBe(originalId); expect(chat).not.toHaveBeenCalled();
    });

    it('opens a real reader selection as a versioned quote and returns to its source', async () => {
        const { service, repo, chat, container, button, panel } = await setup();
        const paragraph = container.querySelector<HTMLElement>('.reader .prose .block p')!;
        const quote = paragraph.textContent!;
        const range = document.createRange(); range.selectNodeContents(paragraph);
        Object.defineProperty(range, 'getBoundingClientRect', { value: () => new DOMRect(350, 160, 240, 200) });
        const originalBounds = HTMLElement.prototype.getBoundingClientRect;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            return this.classList.contains('learning-selection') ? new DOMRect(0, 0, 140, 36) : originalBounds.call(this);
        });
        const reader = container.querySelector<HTMLElement>('.reader')!;
        vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue(new DOMRect(300, 40, 640, 700));
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        try {
            await act(async () => { paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 530, clientY: 345 })); });
            const popup = container.querySelector<HTMLElement>('.learning-selection')!;
            expect(popup).not.toBeNull();
            expect(Number.parseFloat(popup.style.left)).toBeGreaterThanOrEqual(230);
            expect(Number.parseFloat(popup.style.left)).toBeLessThanOrEqual(250);
            expect(Number.parseFloat(popup.style.top)).toBeGreaterThanOrEqual(305);
            expect(Number.parseFloat(popup.style.top)).toBeLessThanOrEqual(325);
            await act(async () => { paragraph.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 930, clientY: 725 })); });
            expect(Number.parseFloat(popup.style.left) + 140).toBeLessThanOrEqual(632);
            expect(Number.parseFloat(popup.style.top) + 36).toBeLessThanOrEqual(692);
            expect(Number.parseFloat(popup.style.left) + 140).toBeLessThan(630);
            expect(Number.parseFloat(popup.style.top) + 36).toBeLessThan(685);
            const previousPosition = [popup.style.left, popup.style.top];
            const action = popup.querySelector<HTMLButtonElement>('button')!;
            await act(async () => { action.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 800, clientY: 695 })); });
            expect([popup.style.left, popup.style.top]).toEqual(previousPosition);
            await act(async () => { action.click(); }); await flush();
            expect(service.learning!.active!.materials[0]).toMatchObject({ quote, version: repo.state.articles[0].cache!.version, articleId: repo.state.articles[0].id });
            expect(panel().querySelector('.learning-quote blockquote')?.textContent).toBe(quote);
            expect(panel().querySelector<HTMLDetailsElement>('.learning-materials')!.open).toBe(false);
            expect(panel().querySelector<HTMLDetailsElement>('.learning-quote')!.open).toBe(false);
            expect(document.activeElement).toBe(panel().querySelector('#fsub-learning-question'));
            expect(panel().querySelector('label[for="fsub-learning-question"]')?.textContent).toBe('针对选段提问');
            await act(async () => { panel().querySelector<HTMLElement>('.learning-materials > summary')!.click(); });
            expect(panel().querySelector<HTMLDetailsElement>('.learning-materials')!.open).toBe(true);
            await act(async () => { panel().querySelector<HTMLElement>('.learning-quote > summary')!.click(); });
            await act(async () => { button('回看原文').click(); });
            expect(container.querySelector('.reader .learning-source-highlight')?.textContent).toContain(quote);
            expect(chat).not.toHaveBeenCalled();
            expect(panel().querySelector('.learning-pending-selection')?.textContent).toContain(quote);
            await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-question')!, '为什么要这么说');
            await act(async () => { button('发送问题').click(); }); await flush();
            expect(panel().querySelector('.learning-message.user .learning-message-selection')?.textContent).toContain(quote);
            expect(chat.mock.calls[0][0].prompt.split('<selected-passage>')[1].split('</selected-passage>')[0]).toContain(quote);
        } finally { selection.removeAllRanges(); }
    });

    it('continues an existing saved-note draft directly when selecting another excerpt', async () => {
        const { h, service, chat, container, button, panel, open, notes } = await setup();
        await open(); await notes();
        const original = 'My existing understanding must remain intact.';
        await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!, original);
        const record = service.learning!.active!;
        await act(async () => { await service.learning!.saveNewNote('Notes', 'Existing thought', original, record.id); });
        const saved = String(h.first.files.get('Notes/Existing thought.md'));
        await act(async () => { button('关闭伴读').click(); });
        const selectAndWrite = async (element: HTMLElement) => {
            const range = document.createRange(); range.selectNodeContents(element);
            const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
            await act(async () => { element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: 500, clientY: 300 })); });
            await act(async () => { button('记想法').click(); }); await flush();
        };
        try {
            const paragraph = container.querySelector<HTMLElement>('.reader .prose .block p')!;
            await selectAndWrite(paragraph);
            expect(service.learning!.active!.id).toBe(record.id);
            expect(record.noteDraft.startsWith(original)).toBe(true);
            expect(record.noteDraft).toContain(`> ${paragraph.textContent}`);
            expect(panel().querySelector<HTMLDetailsElement>('.learning-materials')!.open).toBe(false);
            let input = panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!;
            expect(document.activeElement).toBe(input);
            expect(input.selectionStart).toBe(input.value.indexOf('来源：') - 1); expect(input.selectionEnd).toBe(input.selectionStart);
            expect(input.value.slice(0, input.selectionStart).endsWith('\n\n')).toBe(true);
            await setValue(input, input.value + 'My new thought.');
            const heading = container.querySelector<HTMLElement>('.reader .prose .block h2')!;
            await selectAndWrite(heading);
            input = panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!;
            expect(input.value).toContain('My new thought.'); expect(input.value).toContain(`> ${heading.textContent}`);
            const articleUrl = record.materials.find(material => material.kind === 'article')!.url!;
            expect(input.value.split(articleUrl).length - 1).toBe(1);
            expect(panel().querySelector<HTMLDetailsElement>('.learning-materials')!.open).toBe(false);
            expect(document.activeElement).toBe(input);
            expect(input.selectionStart).toBe(input.value.indexOf('来源：') - 1); expect(input.selectionEnd).toBe(input.selectionStart);
            expect(container.querySelector('dialog.modal')).toBeNull();
            expect(record.savedNotes).toHaveLength(1);
            expect(String(h.first.files.get('Notes/Existing thought.md'))).toBe(saved);
            expect(chat).not.toHaveBeenCalled();
        } finally { window.getSelection()?.removeAllRanges(); }
    });

    it('chooses real Markdown snapshots and removes only the selected material', async () => {
        const { h, service, chat, button, panel, open, materials } = await setup();
        h.first.files.set('Notes/Task plan.md', '# Task plan\n\nUse the captured Vault session.');
        await open(); await materials();
        await act(async () => { button('加入已有笔记').click(); });
        const material = service.learning!.active!.materials.find(item => item.kind === 'note')!;
        expect(material).toMatchObject({ path: 'Notes/Task plan.md', text: '# Task plan\n\nUse the captured Vault session.' });
        expect([...panel().querySelectorAll('.learning-materials pre')].some(item => item.textContent === material.text)).toBe(true);
        await act(async () => { button('移除材料 Task plan').click(); });
        expect(service.learning!.active!.materials).toHaveLength(1);
        expect(service.learning!.active!.materials[0].kind).toBe('article'); expect(chat).not.toHaveBeenCalled();
    });

    it('streams sanitized Markdown, preserves existing DOM, cancels late chunks and retries the original question', async () => {
        const { service, chat, button, panel, open } = await setup();
        const pending = gate(); let request!: ExtensionAiChatParams;
        chat.mockImplementationOnce(async params => { request = params; params.onEvent({ type: 'text', content: '### Mechanism\n\nFirst paragraph.\n\n' }); await pending.promise; });
        await open(); await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-question')!, 'Why capture the Vault?');
        await act(async () => { panel().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush();
        expect(chat).toHaveBeenCalledTimes(1);
        expect(panel().querySelector('.learning-message.assistant h3')?.textContent).toBe('Mechanism');
        const paragraph = panel().querySelector('.learning-message.assistant p');
        await act(async () => { request.onEvent({ type: 'text', content: 'More detail. <img src="https://tracking.invalid/pixel" onerror="alert(1)"><script>alert(1)</script>' }); });
        expect(panel().querySelector('.learning-message.assistant p')).toBe(paragraph);
        expect(panel().querySelector('.learning-message.assistant img')).toBeNull();
        expect(panel().querySelector('.learning-message.assistant script')).toBeNull();
        await act(async () => { button('取消生成').click(); request.onEvent({ type: 'text', content: 'LATE CHUNK' }); pending.release(); }); await flush();
        const record = service.learning!.active!;
        expect(record.messages[1].status).toBe('cancelled');
        expect(record.messages[1].content).toContain('More detail'); expect(record.messages[1].content).not.toContain('LATE CHUNK');
        expect(panel().textContent).toContain('已取消 · 内容已保留');
        chat.mockImplementationOnce(async params => { params.onEvent({ type: 'text', content: 'Retried answer.' }); params.onEvent({ type: 'done' }); });
        await act(async () => { button('重试回答').click(); }); await flush();
        expect(chat).toHaveBeenCalledTimes(2);
        expect(record.messages.filter(item => item.role === 'user')).toHaveLength(1);
        expect(record.messages.at(-1)).toMatchObject({ content: 'Retried answer.', status: 'complete' });
    });

    it('edits the note preview and creates the chosen Markdown file only after confirmation', async () => {
        const { h, chat, container, button, panel, open, notes } = await setup();
        const create = vi.spyOn(h.first.vault, 'createText'), openNote = vi.spyOn(h.first.vault, 'open');
        await open(); await notes();
        await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!, 'Initial thought.');
        await act(async () => { button('保存笔记…').click(); });
        expect(create).not.toHaveBeenCalled();
        const dialog = container.querySelector<HTMLDialogElement>('.modal')!;
        await setValue([...dialog.querySelectorAll('label.field')].find(item => item.textContent?.startsWith('笔记名称'))!.querySelector('input')!, 'Task ownership');
        await setValue(dialog.querySelector<HTMLInputElement>('[aria-label="保存目录"]')!, 'Notes');
        await setValue(dialog.querySelector<HTMLTextAreaElement>('.learning-note-preview textarea')!, '## My conclusion\n\nFixed session ownership.');
        expect(create).not.toHaveBeenCalled();
        await act(async () => { button('新建并打开', dialog).click(); }); await flush();
        expect(h.first.files.get('Notes/Task ownership.md')).toBe('## My conclusion\n\nFixed session ownership.\n');
        expect(openNote).toHaveBeenCalledExactlyOnceWith('Notes/Task ownership.md');
        expect(container.querySelector('.modal')).toBeNull(); expect(chat).not.toHaveBeenCalled();
    });

    it('previews the append target, preserves drafts on conflict and can refresh the snapshot before retrying', async () => {
        const { h, service, container, button, panel, open, notes, materials } = await setup();
        const path = 'Notes/Existing.md'; h.first.files.set(path, '# Existing\n\nOriginal text.');
        const append = vi.spyOn(h.first.vault, 'appendNote');
        await open(); await materials(); await act(async () => { button('加入已有笔记').click(); }); await notes();
        await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!, 'My new conclusion.');
        await act(async () => { button('保存笔记…').click(); });
        const dialog = container.querySelector<HTMLDialogElement>('.modal')!;
        await act(async () => { button('已有笔记', dialog).click(); });
        await act(async () => { dialog.querySelector<HTMLButtonElement>('.learning-note-targets button')!.click(); });
        expect(dialog.querySelector('.learning-target-preview pre')?.textContent).toBe('# Existing\n\nOriginal text.');
        const preview = dialog.querySelector<HTMLTextAreaElement>('.learning-note-preview textarea')!.value;
        expect(preview).toContain('My new conclusion.');
        expect(append).not.toHaveBeenCalled();
        h.first.files.set(path, '# Existing\n\nChanged while previewing.');
        await act(async () => { button('追加到编辑器', dialog).click(); }); await flush();
        expect(dialog.querySelector('[role=alert]')?.textContent).toContain('笔记内容已变化');
        expect(h.first.files.get(path)).toBe('# Existing\n\nChanged while previewing.');
        expect(service.learning!.active!.noteDraft).toBe(preview);
        await act(async () => { dialog.querySelector<HTMLButtonElement>('.learning-note-targets button')!.click(); });
        await act(async () => { button('追加到编辑器', dialog).click(); }); await flush();
        expect(append).toHaveBeenLastCalledWith(path, preview, '# Existing\n\nChanged while previewing.');
        expect(h.first.files.get(path)).toBe(`# Existing\n\nChanged while previewing.\n\n${preview}\n`);
        expect(service.learning!.active!.savedNotes[0]).toMatchObject({ kind: 'append', path });
        expect(service.messages.some(item => item.text.includes('请在编辑器中确认保存'))).toBe(true);
    });

    it('uses a native modal in narrow layouts and returns focus to the reader on Escape', async () => {
        const { container, button, open } = await setup(700);
        await open();
        const overlay = container.querySelector<HTMLDialogElement>('.learning-overlay')!;
        expect(overlay.open).toBe(true); expect(overlay.querySelector('#fsub-learning')).not.toBeNull();
        await act(async () => { overlay.dispatchEvent(new Event('cancel', { cancelable: true })); }); await flush();
        expect(container.querySelector('.learning-overlay')).toBeNull();
        expect(document.activeElement).toBe(button('伴读这篇文章'));
    });

    it('allows direct thoughts when no AI model is available', async () => {
        const { h, service, chat, button, panel, open, notes } = await setup();
        vi.spyOn(h.host.api.ai, 'pairs').mockResolvedValue([]);
        await open();
        expect(button('发送问题').disabled).toBe(true);
        expect(panel().textContent).toContain('配置并启用 AI 模型');
        await notes();
        const input = panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!;
        expect(input.disabled).toBe(false);
        await setValue(input, 'A useful observation without AI.');
        expect(service.learning!.active!.noteDraft).toBe('A useful observation without AI.');
        expect(chat).not.toHaveBeenCalled();
    });

    it('keeps an unsaved thought editable and retries persistence beside the input', async () => {
        const { h, chat, button, panel, open, notes } = await setup();
        await open(); await notes();
        const write = h.first.vault.data.writeText.bind(h.first.vault); let failed = false;
        vi.spyOn(h.first.vault.data, 'writeText').mockImplementation(async (path, value) => {
            if (path === LEARNING_PATH && !failed) { failed = true; throw new Error('Vault is temporarily read-only'); }
            return write(path, value);
        });
        const text = 'Keep my exact observation after a failed write.';
        await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!, text);
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
        expect(panel().querySelector('.learning-status')?.textContent).toContain('学习记录尚未保存');
        expect(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-thought')!.value).toBe(text);
        await act(async () => { button('重试保存').click(); });
        expect(JSON.parse(String(h.first.dataFiles.get(LEARNING_PATH))).records[0].noteDraft).toBe(text);
        expect(panel().querySelector('.learning-status')).toBeNull();
        expect(chat).not.toHaveBeenCalled();
    });

    it('starts a distinct question explicitly and restores the original discussion through the record dropdown', async () => {
        const { service, chat, button, panel, open } = await setup();
        await open();
        await setValue(panel().querySelector<HTMLTextAreaElement>('#fsub-learning-question')!, 'Original context question');
        await act(async () => { panel().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); await flush();
        const original = service.learning!.active!;
        expect(original.messages.filter(item => item.role === 'user')).toHaveLength(1);
        await act(async () => { button('新开学习问题').click(); });
        expect(service.learning!.state.records).toHaveLength(2);
        expect(service.learning!.active!.id).not.toBe(original.id);
        expect(service.learning!.active!.messages).toHaveLength(0);
        expect(chat).toHaveBeenCalledTimes(1);
        expect(panel().querySelector('.learning-record-select [role=combobox]')).not.toBeNull();
        expect(panel().querySelector('[role=listbox]')).toBeNull();
        await act(async () => { panel().querySelector<HTMLButtonElement>('.learning-record-select [role=combobox]')!.click(); });
        const option = [...panel().querySelectorAll<HTMLElement>('[role=option]')].find(item => item.textContent?.trim() === 'Original context question')!;
        await act(async () => { option.click(); });
        expect(service.learning!.active!.id).toBe(original.id);
        expect(panel().querySelector('.learning-conversation')?.textContent).toContain('Original context question');
        expect(service.learning!.active!.materials).toHaveLength(1);
        expect(chat).toHaveBeenCalledTimes(1);
    });
});
