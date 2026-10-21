import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Icon } from './components';

export interface ImageSelection {
    src: string;
    alt: string;
    trigger: HTMLImageElement;
}

type Size = { width: number; height: number };
const MIN_SCALE = .05, MAX_SCALE = 4;

/** Uses the browser top layer, so background content cannot receive focus or clicks. */
export function ImageViewer({ image, onClose }: { image: ImageSelection; onClose: () => void }) {
    const dialog = useRef<HTMLDialogElement>(null), viewport = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null);
    const [natural, setNatural] = useState<Size>({ width: image.trigger.naturalWidth, height: image.trigger.naturalHeight });
    const [size, setSize] = useState<Size>({ width: window.innerWidth, height: window.innerHeight });
    const [view, setView] = useState({ fit: true, scale: 1 }), [dragging, setDragging] = useState(false), [failed, setFailed] = useState(false);
    const pan = useRef<{ x: number; y: number; left: number; top: number }>();
    const moved = useRef(false);
    const anchor = useRef<{ x: number; y: number; relativeX: number; relativeY: number }>();
    const handlers = useRef<{ zoom: (factor: number, point?: { x: number; y: number }) => void }>({ zoom() {} });
    const loaded = natural.width > 0 && natural.height > 0;
    const fitScale = loaded ? Math.min(1, Math.max(1, size.width - 48) / natural.width, Math.max(1, size.height - 112) / natural.height) : 1;
    const scale = view.fit ? fitScale : view.scale;
    const width = natural.width * scale, height = natural.height * scale;
    const canvasWidth = Math.max(size.width, width + 48), canvasHeight = Math.max(size.height, height + 112);
    const left = (canvasWidth - width) / 2, top = (canvasHeight - height) / 2;

    useLayoutEffect(() => {
        const element = dialog.current!;
        const fallback = image.trigger.closest('.reader')?.querySelector<HTMLButtonElement>('.reader-tools button');
        element.showModal();
        close.current?.focus({ preventScroll: true });
        return () => {
            element.close();
            if (image.trigger.isConnected) image.trigger.focus({ preventScroll: true });
            else if (fallback?.isConnected) fallback.focus({ preventScroll: true });
        };
    }, [image]);
    useLayoutEffect(() => {
        const element = viewport.current!;
        const measure = () => setSize({ width: element.clientWidth || window.innerWidth, height: element.clientHeight || window.innerHeight });
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
        observer?.observe(element);
        window.addEventListener('resize', measure);
        return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
    }, []);
    useLayoutEffect(() => {
        const element = viewport.current!, point = anchor.current;
        if (point && loaded) {
            element.scrollLeft = left + point.relativeX * width - point.x;
            element.scrollTop = top + point.relativeY * height - point.y;
            anchor.current = undefined;
        } else if (view.fit) {
            element.scrollLeft = Math.max(0, (canvasWidth - size.width) / 2);
            element.scrollTop = Math.max(0, (canvasHeight - size.height) / 2);
        }
    }, [scale, loaded, size, view.fit, width, height]);
    function setScale(next: number, point?: { x: number; y: number }) {
        if (!loaded || failed) return;
        const element = viewport.current!;
        const p = point || { x: size.width / 2, y: size.height / 2 };
        anchor.current = { ...p, relativeX: (element.scrollLeft + p.x - left) / width, relativeY: (element.scrollTop + p.y - top) / height };
        setView({ fit: false, scale: Math.min(MAX_SCALE, Math.max(Math.min(MIN_SCALE, fitScale), next)) });
    }
    handlers.current.zoom = (factor, point) => setScale(scale * factor, point);
    useEffect(() => {
        const element = viewport.current!;
        const wheel = (event: WheelEvent) => {
            if (!event.deltaY) return;
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            handlers.current.zoom(event.deltaY < 0 ? 1.15 : 1 / 1.15, { x: event.clientX - rect.left, y: event.clientY - rect.top });
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, []);
    const keyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key === 'Tab') {
            // Some webviews briefly focus body at a native dialog boundary.
            // Keep the cycle on the currently enabled image controls.
            const controls = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const first = controls[0], last = controls[controls.length - 1];
            const active = document.activeElement;
            const outsideControls = !controls.some(control => control === active);
            const target = event.shiftKey && (active === first || outsideControls) ? last
                : !event.shiftKey && (active === last || outsideControls) ? first : undefined;
            if (target) { event.preventDefault(); event.stopPropagation(); target.focus({ preventScroll: true }); }
            return;
        }
        if (event.key === 'Escape') onClose();
        else if (event.key === '+' || event.key === '=') setScale(scale * 1.2);
        else if (event.key === '-' || event.key === '_') setScale(scale / 1.2);
        else if (event.key === '0') setScale(1);
        else if (event.key.toLowerCase() === 'f') { anchor.current = undefined; setView({ fit: true, scale: 1 }); }
        else if (event.key === 'ArrowDown') viewport.current!.scrollTop += 80;
        else if (event.key === 'ArrowUp') viewport.current!.scrollTop -= 80;
        else if (event.key === 'ArrowRight') viewport.current!.scrollLeft += 80;
        else if (event.key === 'ArrowLeft') viewport.current!.scrollLeft -= 80;
        else return;
        event.preventDefault(); event.stopPropagation();
    };
    return <dialog ref={dialog} className="image-viewer" aria-label="查看图片" onKeyDown={keyDown} onCancel={event => { event.preventDefault(); onClose(); }}>
        <div className={`image-viewport${dragging ? ' is-dragging' : ''}`} ref={viewport}
            onClick={event => { if (!moved.current && (event.target === event.currentTarget || (event.target as HTMLElement).classList.contains('image-canvas'))) onClose(); }}
            onPointerDown={event => {
                if (event.button !== 0) return;
                const element = event.currentTarget;
                moved.current = false;
                pan.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop };
                element.setPointerCapture?.(event.pointerId);
                event.preventDefault();
                setDragging(true);
            }} onPointerMove={event => {
                const start = pan.current;
                if (!start) return;
                const dx = event.clientX - start.x, dy = event.clientY - start.y;
                if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
                event.currentTarget.scrollLeft = start.left - dx;
                event.currentTarget.scrollTop = start.top - dy;
            }} onPointerUp={event => { pan.current = undefined; setDragging(false); if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { pan.current = undefined; setDragging(false); }}>
            <div className="image-canvas" style={{ width: canvasWidth, height: canvasHeight }}>
                <img src={image.src} alt={image.alt || '文章图片'} draggable={false} onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} onError={() => setFailed(true)}
                    style={{ width: loaded ? width : undefined, height: loaded ? height : undefined, left, top, visibility: loaded && !failed ? 'visible' : 'hidden' }}/>
            </div>
        </div>
        <div className="image-caption"><span>{image.alt || '文章图片'}</span>{loaded && <small>{natural.width} × {natural.height} · {scale < .01 ? (scale * 100).toFixed(1) : Math.round(scale * 100)}%</small>}</div>
        <div className="image-toolbar" aria-label="图片操作">
            <button type="button" className="icon-button" disabled={!loaded || failed || scale <= Math.min(MIN_SCALE, fitScale)} aria-label="缩小图片" title="缩小（−）" onClick={() => setScale(scale / 1.2)}><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M5 12h14"/></svg></button>
            <button type="button" className="image-reset" disabled={!loaded || failed} aria-label="恢复 100% 原始尺寸" title="原始尺寸（0）" onClick={() => setScale(1)}>100%</button>
            <button type="button" className="icon-button" disabled={!loaded || failed || scale >= MAX_SCALE} aria-label="放大图片" title="放大（+）" onClick={() => setScale(scale * 1.2)}><Icon name="plus" size={16}/></button>
            <span className="image-toolbar-divider"/>
            <button type="button" className="image-fit" disabled={!loaded || failed} aria-label="图片适应窗口" title="适应窗口（F）" onClick={() => { anchor.current = undefined; setView({ fit: true, scale: 1 }); }}>适应</button>
            <span className="image-toolbar-divider"/>
            <button type="button" ref={close} className="icon-button" aria-label="关闭图片" title="关闭（Esc）" onClick={onClose}><Icon name="close" size={16}/></button>
        </div>
        {(!loaded || failed) && <div className="image-viewer-status" role="status">{failed ? '图片暂时无法显示，请关闭后重试' : '正在打开图片…'}</div>}
        <p className="image-viewer-hint">滚轮缩放 · 拖动移动 · Esc 关闭</p>
    </dialog>;
}
