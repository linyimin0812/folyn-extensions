import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subscriptions } from '../src/service';
import { Messages } from '../src/messages';
import { Modal, ModalMessagesContext } from '../src/components';
import { harness } from './helpers';

let root: Root | undefined, service: Subscriptions | undefined;
const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');
afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    root = undefined;
    service?.stop(); service = undefined;
    document.body.replaceChildren();
    for (const [name, descriptor] of [['showModal', showModal], ['close', close]] as const) {
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
    vi.useRealTimers(); vi.unstubAllGlobals();
});
function setup() {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const h = harness();
    service = new Subscriptions(h.host);
    const container = document.createElement('div');
    document.body.append(container);
    return { h, container, s: service };
}
describe('message notifications', () => {
    it('queues identical and simultaneous messages independently, expires success and info, and preserves errors', () => {
        const { s } = setup();
        s.notify('已完成'); s.notify('已完成'); s.notify('没有新文章', 'info'); s.notify('写入失败', 'error');
        expect(s.messages.map(item => item.text)).toEqual(['已完成', '已完成', '没有新文章', '写入失败']);
        expect(new Set(s.messages.map(item => item.id)).size).toBe(4);
        vi.advanceTimersByTime(3500);
        expect(s.messages.map(item => item.text)).toEqual(['写入失败']);
        s.dismissMessage(s.messages[0].id);
        expect(s.messages).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
    });
    it('pauses expiry while the close control has keyboard focus and resumes after leaving', async () => {
        const { s, container } = setup();
        root = createRoot(container);
        await act(async () => { root!.render(createElement(Messages, { service: s })); s.notify('已复制来源链接'); });
        const button = container.querySelector('button')!;
        await act(async () => { button.focus(); vi.advanceTimersByTime(10000); });
        expect(container.querySelector('[role=status]')!.textContent).toContain('已复制来源链接');
        await act(async () => { button.blur(); vi.advanceTimersByTime(3500); });
        expect(s.messages).toEqual([]);
        expect(container.querySelector('.message-card')).toBeNull();
    });
    it('clears queued messages and their timers on Vault changes and extension shutdown', async () => {
        const { s, h } = setup();
        s.notify('Vault A 已完成');
        await s.switchVault(h.second.vault);
        expect(s.messages).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
        s.notify('Vault B 已完成');
        s.stop();
        expect(s.messages).toEqual([]);
        expect(vi.getTimerCount()).toBe(0);
        s.notify('迟到提示');
        expect(s.messages).toEqual([]);
    });
    it('renders messages inside a native modal too and dismisses all views of the same message', async () => {
        const { s, container } = setup();
        Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.open = true; } });
        Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
        root = createRoot(container);
        await act(async () => root!.render(createElement(ModalMessagesContext.Provider, { value: createElement(Messages, { service: s, embedded: true }) },
            createElement('div', null, createElement(Messages, { service: s }), createElement(Modal, { title: '测试弹窗', onClose() {}, children: '弹窗内容' })))));
        await act(async () => { s.notify('图片已重新获取'); });
        expect(container.querySelector('dialog .message-embedded [role=status]')!.textContent).toContain('图片已重新获取');
        expect(container.querySelector('.message-workspace [role=status]')!.textContent).toContain('图片已重新获取');
        await act(async () => { (container.querySelector('dialog .message-card button') as HTMLButtonElement).click(); });
        expect(s.messages).toEqual([]);
        expect(container.querySelectorAll('.message-card')).toHaveLength(0);
    });
});
