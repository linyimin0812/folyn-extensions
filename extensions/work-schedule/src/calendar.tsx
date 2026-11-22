import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { addDays, dateKey, monthGrid, parseDateKey, shiftMonth, startOfMonth, type DayMark } from './model';
import { ChevronLeft, ChevronRight } from './icons';
import type { Messages } from './i18n';

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export function formatDate(key: string, locale: string, options: Intl.DateTimeFormatOptions) {
    try {
        return parseDateKey(key).toLocaleDateString(locale, options);
    }
    catch {
        return key;
    }
}

interface PanelProps {
    t: Messages;
    locale: string;
    value: string;
    /** Days that have work items get a dot. */
    marks?: Map<string, DayMark>;
    align?: 'start' | 'end';
}

interface PickerProps extends PanelProps {
    onChange(key: string): void;
    /** The trigger must carry `aria-haspopup` so focus can return to it. */
    trigger(props: { open: boolean; toggle(): void }): ReactNode;
}

/** A trigger plus a month-grid popover; closes on pick, Escape or outside click. */
export function DatePicker({ trigger, onChange, ...panel }: PickerProps) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const close = () => {
        setOpen(false);
        root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
    };

    return <div className="fws-picker" ref={root}>
        {trigger({ open, toggle: () => setOpen(!open) })}
        {open && <MonthPanel {...panel} onClose={close} onSelect={key => { onChange(key); close(); }}/>}
    </div>;
}

function MonthPanel({ t, locale, value, marks, align = 'start', onSelect, onClose }: PanelProps & {
    onSelect(key: string): void;
    onClose(): void;
}) {
    const today = dateKey(new Date());
    const [focus, setFocus] = useState(value);
    const grid = useRef<HTMLDivElement>(null);
    // Keyboard moves (and opening) put focus on the day; month buttons keep it on themselves.
    const moveFocus = useRef(true);

    useEffect(() => {
        if (!moveFocus.current) return;
        moveFocus.current = false;
        grid.current?.querySelector<HTMLElement>(`[data-date="${focus}"]`)?.focus();
    }, [focus]);

    const view = startOfMonth(focus);
    const days = monthGrid(focus, locale);

    const onGridKey = (e: KeyboardEvent) => {
        const step = STEPS[e.key];
        const months = e.key === 'PageUp' ? -1 : e.key === 'PageDown' ? 1 : 0;
        if (step === undefined && !months) return;
        e.preventDefault();
        moveFocus.current = true;
        setFocus(months ? shiftMonth(focus, months) : addDays(focus, step));
    };

    return <div className={`fws-cal ${align}`} role="dialog" aria-label={t.pickDate}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        <div className="fws-cal-head">
            <button type="button" className="btn btn-g btn-sm fws-sq" aria-label={t.prevMonth} title={t.prevMonth}
                onClick={() => setFocus(shiftMonth(focus, -1))}><ChevronLeft/></button>
            <strong>{formatDate(view, locale, { year: 'numeric', month: 'long' })}</strong>
            <button type="button" className="btn btn-g btn-sm fws-sq" aria-label={t.nextMonth} title={t.nextMonth}
                onClick={() => setFocus(shiftMonth(focus, 1))}><ChevronRight/></button>
        </div>
        <div className="fws-cal-grid" ref={grid} onKeyDown={onGridKey}>
            {days.slice(0, 7).map(key => <span key={key} className="fws-cal-wd">{formatDate(key, locale, { weekday: 'narrow' })}</span>)}
            {days.map(key => {
                const mark = marks?.get(key);
                const cls = ['fws-cal-day',
                    startOfMonth(key) !== view && 'out',
                    key === today && 'today',
                    key === value && 'selected',
                    mark && (mark.done === mark.total ? 'mark done' : 'mark')].filter(Boolean).join(' ');
                return <button key={key} type="button" className={cls} data-date={key} tabIndex={key === focus ? 0 : -1}
                    aria-pressed={key === value} aria-label={formatDate(key, locale, { dateStyle: 'full' })}
                    onClick={() => onSelect(key)}>{Number(key.slice(8))}</button>;
            })}
        </div>
        <div className="fws-cal-foot">
            <button type="button" className="btn btn-g btn-sm" onClick={() => onSelect(today)}>{t.today}</button>
        </div>
    </div>;
}
