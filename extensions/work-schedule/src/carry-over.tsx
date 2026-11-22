import { useState } from 'react';
import { childrenOf, type WorkItem } from './model';
import type { Messages } from './i18n';
import { formatDate } from './calendar';

/** Review step before carry-over: past items may be finished but never ticked,
 *  so nothing moves until the user picks what to bring forward. */
export function CarryOverPanel({ t, locale, items, candidates, onMarkDone, onConfirm, onCancel }: {
    t: Messages;
    locale: string;
    items: WorkItem[];
    /** Unfinished past top-level items, as offered for carry-over. */
    candidates: WorkItem[];
    onMarkDone(id: string): void;
    onConfirm(ids: string[]): void;
    onCancel(): void;
}) {
    const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
    const chosen = candidates.filter(c => !excluded.has(c.id));
    const days = [...new Set(candidates.map(c => c.date))].sort().reverse();

    const toggle = (id: string) => {
        const next = new Set(excluded);
        if (!next.delete(id)) next.add(id);
        setExcluded(next);
    };
    const setAll = (on: boolean) => setExcluded(on ? new Set() : new Set(candidates.map(c => c.id)));

    return <div className="fws-carry" role="dialog" aria-label={t.carryTitle} onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
        <div className="fws-carry-head">
            <strong>{t.carryTitle}</strong>
            <span>{t.carryHint}</span>
            <button className="fws-link-btn" onClick={() => setAll(chosen.length < candidates.length)}>
                {chosen.length < candidates.length ? t.selectAll : t.selectNone}
            </button>
        </div>
        <div className="fws-carry-list">
            {days.map(date => <section key={date}>
                <div className="fws-carry-day">{formatDate(date, locale, { month: 'long', day: 'numeric', weekday: 'short' })}</div>
                {candidates.filter(c => c.date === date).map(item => {
                    const children = childrenOf(items, item.id);
                    const left = children.filter(c => !c.done).length;
                    return <label key={item.id} className="fws-carry-row">
                        <input type="checkbox" checked={!excluded.has(item.id)} onChange={() => toggle(item.id)}/>
                        <span className={`fws-pri ${item.priority}`}/>
                        <span className="title">{item.title}</span>
                        {children.length > 0 && <span className="sub">{t.subitemsLeft(left, children.length)}</span>}
                        <button className="fws-link-btn" onClick={e => { e.preventDefault(); onMarkDone(item.id); }}>{t.markDone}</button>
                    </label>;
                })}
            </section>)}
        </div>
        <div className="fws-carry-foot">
            <span className="spacer"/>
            <button className="btn btn-g btn-sm" onClick={onCancel}>{t.cancel}</button>
            <button className="btn btn-p btn-sm" disabled={!chosen.length} onClick={() => onConfirm(chosen.map(c => c.id))}>{t.carrySelected(chosen.length)}</button>
        </div>
    </div>;
}
