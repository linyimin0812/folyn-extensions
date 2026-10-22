import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageViewer } from '../src/image-viewer';
import { Reader } from '../src/reader';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';

let root: Root | undefined, cleanup: (() => void) | undefined;
const modalDescriptors = ['showModal', 'close'].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const);
const showModal = vi.fn(function(this: HTMLDialogElement) { this.open = true; });
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    showModal.mockClear();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: showModal });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.open = false; } });
});
afterEach(async () => {
    if (root) await act(async () => root!.unmount()); root = undefined;
    cleanup?.(); cleanup = undefined;
    for (const [name, descriptor] of modalDescriptors) {
        if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
        else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
    }
    document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function mountContainer() {
    const container = document.createElement('div'); container.className = 'fsub'; document.body.append(container); root = createRoot(container); return container;
}
async function mountViewer(width = 1600, height = 900) {
    const trigger = document.createElement('img'); trigger.src = '/cached/diagram.png'; trigger.alt = '架构图'; trigger.tabIndex = 0;
    Object.defineProperties(trigger, { naturalWidth: { value: width }, naturalHeight: { value: height } });
    document.body.append(trigger); trigger.focus();
    const container = mountContainer(), closed = vi.fn();
    function Owner() {
        const [open, setOpen] = useState(true);
        return open ? createElement(ImageViewer, { image: { src: trigger.src, alt: trigger.alt, trigger }, onClose() { closed(); setOpen(false); } }) : null;
    }
    await act(async () => root!.render(createElement(Owner)));
    return { container, trigger, closed, dialog: container.querySelector('dialog')!, image: container.querySelector<HTMLImageElement>('dialog img')!, button: (name: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)! };
}
function key(target: Element, value: string) { return act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); }); }

describe('article image viewer', () => {
    it('opens in the native modal top layer, focuses its close control and restores the exact image trigger', async () => {
        const { container, trigger, dialog, button, closed } = await mountViewer();
        expect(showModal).toHaveBeenCalledOnce(); expect(dialog.open).toBe(true);
        expect(document.activeElement).toBe(button('关闭图片'));
        expect(dialog.getAttribute('aria-label')).toBe('查看图片');
        await act(async () => button('关闭图片').click());
        expect(closed).toHaveBeenCalledOnce(); expect(container.querySelector('dialog')).toBeNull();
        expect(document.activeElement).toBe(trigger);
    });
    it('wraps Tab at both toolbar boundaries while preserving native movement between controls', async () => {
        const { button } = await mountViewer();
        const pressTab = async (target: Element, shiftKey = false) => {
            const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
            await act(async () => { target.dispatchEvent(event); }); return event;
        };
        const first = button('缩小图片'), last = button('关闭图片');
        expect(document.activeElement).toBe(last);
        expect((await pressTab(last)).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(first);
        expect((await pressTab(first, true)).defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(last);
        const middle = button('恢复 100% 原始尺寸'); middle.focus();
        expect((await pressTab(middle)).defaultPrevented).toBe(false);
        expect((await pressTab(middle, true)).defaultPrevented).toBe(false);
    });
    it('keeps Tab on close when the image is loading and all zoom controls are disabled', async () => {
        const { button } = await mountViewer(0, 0), close = button('关闭图片');
        for (const shiftKey of [false, true]) {
            const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
            await act(async () => { close.dispatchEvent(event); });
            expect(event.defaultPrevented).toBe(true); expect(document.activeElement).toBe(close);
        }
    });
    it('fits long images initially, zooms by keyboard and wheel, and resets to natural size or window', async () => {
        const { image, dialog, container, button } = await mountViewer(1200, 10000);
        const fitted = parseFloat(image.style.width);
        expect(fitted).toBeLessThan(1200); expect(parseFloat(image.style.height)).toBeLessThanOrEqual(window.innerHeight - 112);
        await key(dialog, '+'); expect(parseFloat(image.style.width)).toBeGreaterThan(fitted);
        const larger = parseFloat(image.style.width);
        await key(dialog, '-'); expect(parseFloat(image.style.width)).toBeLessThan(larger);
        await key(dialog, '0'); expect(image.style.width).toBe('1200px'); expect(image.style.height).toBe('10000px');
        const viewport = container.querySelector<HTMLElement>('.image-viewport')!;
        const top = viewport.scrollTop; await key(dialog, 'ArrowDown'); expect(viewport.scrollTop).toBe(top + 80);
        await key(dialog, 'ArrowUp'); expect(viewport.scrollTop).toBe(top);
        const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 200, bubbles: true, cancelable: true });
        await act(async () => { container.querySelector('.image-viewport')!.dispatchEvent(wheel); });
        expect(wheel.defaultPrevented).toBe(true); expect(parseFloat(image.style.width)).toBeGreaterThan(1200);
        await act(async () => button('恢复 100% 原始尺寸').click()); expect(image.style.width).toBe('1200px');
        await act(async () => button('图片适应窗口').click()); expect(parseFloat(image.style.width)).toBeCloseTo(fitted);
        await act(async () => {
            viewport.dispatchEvent(new MouseEvent('pointerdown', { button: 0, clientX: 200, clientY: 200, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent('pointermove', { clientX: 150, clientY: 120, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent('pointerup', { clientX: 150, clientY: 120, bubbles: true }));
            viewport.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        });
        expect(viewport.scrollLeft).toBe(50); expect(viewport.scrollTop).toBe(80);
        expect(container.querySelector('dialog')).not.toBeNull(); // Completing a drag must not dismiss the viewer.
        await key(dialog, 'Escape'); expect(container.querySelector('dialog')).toBeNull();
    });
    it('honors natural image dimensions on load and provides feedback when an image cannot be displayed', async () => {
        const { image, container } = await mountViewer(0, 0);
        expect(container.textContent).toContain('正在打开图片');
        Object.defineProperties(image, { naturalWidth: { value: 640 }, naturalHeight: { value: 480 } });
        await act(async () => { image.dispatchEvent(new Event('load', { bubbles: true })); });
        expect(image.style.width).toBe('640px'); expect(container.textContent).toContain('640 × 480');
        await act(async () => { image.dispatchEvent(new Event('error')); });
        expect(container.textContent).toContain('图片暂时无法显示');
    });
    it('makes unlinked reader images keyboard operable and preserves image-link navigation', async () => {
        const h = harness(), service = new Subscriptions(h.host); await service.start();
        cleanup = () => { service.stop(); h.dispose(); };
        const candidate = (await service.discover('https://example.com/feed.xml'))[0];
        await service.add(candidate, '图片测试', [], 2, 0, false, await service.preview(candidate));
        const repo = service.repo!; repo.state.settings.autoRead = false;
        const article = repo.state.articles[0], body = await service.loadBody(article);
        body.blocks = [{ id: 'images', html: '<p><img src="https://example.com/a.png" alt="独立图"><a href="https://example.com/original"><img src="https://example.com/a.png" alt="链接图"></a></p>' }];
        body.html = body.blocks[0].html;
        body.images = [{ url: 'https://example.com/a.png', path: 'subscriptions/images/a.png' }];
        await repo.putBody(body);
        const external = vi.spyOn(h.host.support, 'openExternal').mockResolvedValue(undefined);
        const container = mountContainer();
        await act(async () => root!.render(createElement(Reader, { service, article, onBack() {}, onClear() {} })));
        const [trigger, linked] = [...container.querySelectorAll<HTMLImageElement>('.prose img')];
        expect(trigger.tabIndex).toBe(0); expect(trigger.getAttribute('role')).toBe('button');
        expect(trigger.getAttribute('aria-label')).toContain('查看大图');
        expect(linked.hasAttribute('tabindex')).toBe(false); expect(linked.getAttribute('role')).toBeNull();
        trigger.focus(); await key(trigger, ' ');
        expect(container.querySelector<HTMLDialogElement>('dialog.image-viewer')?.open).toBe(true);
        await key(container.querySelector('dialog')!, 'Escape'); expect(document.activeElement).toBe(trigger);
        await key(trigger, 'Enter'); expect(container.querySelector<HTMLDialogElement>('dialog.image-viewer')?.open).toBe(true);
        await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="关闭图片"]')!.click());
        expect(container.querySelector('.prose img')).toBe(trigger);
        await act(async () => linked.click());
        expect(external).toHaveBeenCalledWith('https://example.com/original'); expect(container.querySelector('dialog.image-viewer')).toBeNull();
    });
});
