import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export interface SelectOption { value: string; label: string }
export const intervals: SelectOption[] = [
    { value: '0', label: '仅手动' }, { value: '15', label: '15 分钟' },
    { value: '30', label: '30 分钟' }, { value: '60', label: '1 小时' }, { value: '360', label: '6 小时' },
];

/** Select-only combobox. The custom menu stays in the dialog's top layer. */
export function SelectField({ label, value, options, onChange, disabled = false }: {
    label: string; value: string; options: SelectOption[];
    onChange(value: string): void; disabled?: boolean;
}) {
    const id = useId(), trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false), [active, setActive] = useState(0);
    const search = useRef({ text: '', time: 0 });
    const selected = options.findIndex(option => option.value === value);
    const show = () => { setActive(Math.max(0, selected)); setOpen(true); };
    const choose = (index: number) => {
        if (options[index]) onChange(options[index].value);
        setOpen(false);
        trigger.current?.focus();
    };
    useLayoutEffect(() => {
        if (!open) return;
        const menu = popup.current!, button = trigger.current!;
        menu.showPopover?.();
        const place = () => {
            const rect = button.getBoundingClientRect();
            const below = innerHeight - rect.bottom - 12, above = rect.top - 12;
            const up = below < Math.min(220, options.length * 34 + 10) && above > below;
            const height = Math.min(250, Math.max(48, up ? above : below));
            menu.style.width = `${Math.min(rect.width, innerWidth - 24)}px`;
            menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - rect.width - 12))}px`;
            menu.style.maxHeight = `${height}px`;
            menu.style.top = `${up ? Math.max(12, rect.top - Math.min(menu.scrollHeight, height) - 5) : rect.bottom + 5}px`;
        };
        place();
        const dismiss = (event: Event) => {
            if (!menu.contains(event.target as Node) && !button.contains(event.target as Node)) setOpen(false);
        };
        const scroll = (event: Event) => { if (!menu.contains(event.target as Node)) place(); };
        document.addEventListener('pointerdown', dismiss);
        document.addEventListener('scroll', scroll, true);
        window.addEventListener('resize', place);
        return () => {
            document.removeEventListener('pointerdown', dismiss);
            document.removeEventListener('scroll', scroll, true);
            window.removeEventListener('resize', place);
        };
    }, [open, options.length]);
    useEffect(() => {
        const menu = popup.current, option = menu?.children[active] as HTMLElement | undefined;
        if (!open || !menu || !option) return;
        if (option.offsetTop < menu.scrollTop) menu.scrollTop = option.offsetTop;
        else if (option.offsetTop + option.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = option.offsetTop + option.offsetHeight - menu.clientHeight;
    }, [open, active]);
    return <div className="field select-field">
        <span id={`${id}-label`}>{label}</span>
        <button ref={trigger} type="button" className="select-trigger" role="combobox" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={open ? `${id}-list` : undefined} aria-haspopup="listbox" aria-activedescendant={open ? `${id}-option-${active}` : undefined} disabled={disabled} onClick={() => open ? setOpen(false) : show()} onBlur={() => setOpen(false)} onKeyDown={event => {
            const key = event.key;
            if (key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
            if (key === 'Tab') { setOpen(false); return; }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' '].includes(key)) {
                event.preventDefault();
                if (!open) { show(); if (key === 'Home') setActive(0); if (key === 'End') setActive(options.length - 1); }
                else if (key === 'Enter' || key === ' ') choose(active);
                else setActive(index => key === 'Home' ? 0 : key === 'End' ? options.length - 1 : Math.max(0, Math.min(options.length - 1, index + (key === 'ArrowDown' ? 1 : -1))));
            } else if (key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
                const now = Date.now();
                search.current = { text: now - search.current.time < 600 ? search.current.text + key : key, time: now };
                const match = options.findIndex(option => option.label.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()));
                if (match >= 0) { event.preventDefault(); if (!open) show(); setActive(match); }
            }
        }}><span id={`${id}-value`} className="ellipsis">{options[selected]?.label || '请选择'}</span><svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
        {open && <div ref={popup} {...('showPopover' in HTMLElement.prototype ? { popover: 'manual' } : {})} className="select-popup" id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} onPointerDown={event => event.preventDefault()}>
            {options.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} data-index={index} role="option" aria-selected={option.value === value} className={`select-option ${active === index ? 'highlighted' : ''}`} onPointerMove={() => setActive(index)} onClick={() => choose(index)}>
                <span>{option.label}</span><svg className="select-check" aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>)}
        </div>}
    </div>;
}
