import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent } from 'react';

type Props = {
    label: string;
    controls: string;
    className: string;
    width: number;
    min: number;
    max: number;
    onChange(width: number): void;
    onCommit(): void;
    reverse?: boolean;
};

/** A thin divider with the same overlapping drag target as Folyn's file sidebar. */
export function ColumnResizer(props: Props) {
    const [value, setValue] = useState(props.width);
    const valueRef = useRef(props.width);
    const latest = useRef(props);
    latest.current = props;
    const drag = useRef<{
        pointer: number;
        x: number;
        width: number;
        direction: number;
        cursor: string;
        selection: string;
    }>();
    useEffect(() => {
        valueRef.current = props.width;
        setValue(props.width);
    }, [props.width]);
    function apply(width: number) {
        const p = latest.current;
        const next = Math.round(Math.max(p.min, Math.min(p.max, width)));
        valueRef.current = next;
        setValue(next);
        p.onChange(next);
    }
    function finish() {
        const session = drag.current;
        if (!session) return;
        drag.current = undefined;
        document.body.style.cursor = session.cursor;
        document.body.style.userSelect = session.selection;
        latest.current.onCommit();
    }
    useEffect(() => () => finish(), []);
    function start(event: PointerEvent<HTMLDivElement>) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
            pointer: event.pointerId,
            x: event.clientX,
            width: valueRef.current,
            direction: (getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1) * (props.reverse ? -1 : 1),
            cursor: document.body.style.cursor,
            selection: document.body.style.userSelect,
        };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }
    function move(event: PointerEvent<HTMLDivElement>) {
        const session = drag.current;
        if (session?.pointer === event.pointerId)
            apply(session.width + (event.clientX - session.x) * session.direction);
    }
    function keyboard(event: KeyboardEvent<HTMLDivElement>) {
        if (event.key === 'Escape' && drag.current) {
            apply(drag.current.width);
            finish();
            event.preventDefault();
            return;
        }
        const direction = (getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1) * (props.reverse ? -1 : 1);
        const step = event.shiftKey ? 24 : 8;
        const next = event.key === 'ArrowLeft' ? valueRef.current - step * direction
            : event.key === 'ArrowRight' ? valueRef.current + step * direction
            : event.key === 'Home' ? props.min : event.key === 'End' ? props.max : undefined;
        if (next === undefined) return;
        event.preventDefault();
        apply(next);
        latest.current.onCommit();
    }
    return <div className={`column-resizer ${props.className}`} role="separator"
        aria-orientation="vertical" aria-label={props.label} aria-controls={props.controls}
        aria-valuemin={props.min} aria-valuemax={props.max} aria-valuenow={value}
        aria-valuetext={`${value} 像素`} tabIndex={0}
        title={`${props.label} · 拖动或使用左右方向键`}
        onPointerDown={start} onPointerMove={move}
        onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
        onKeyDown={keyboard} />;
}
