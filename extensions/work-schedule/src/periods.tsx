import { addDays, childrenOf, itemsOn, monthGrid, startOfMonth, startOfWeek, type WorkItem } from './model';
import type { Messages } from './i18n';
import { formatDate } from './calendar';
import { Check } from './icons';

interface ViewProps {
    t: Messages;
    locale: string;
    today: string;
    /** Any day inside the period shown. */
    anchor: string;
    items: WorkItem[];
    readOnly: boolean;
    /** Show one day in the day view. */
    onOpenDay(day: string): void;
}

/** Read-only overview of a week: one group per day, items ticked in place. */
export function WeekView({ t, locale, today, anchor, items, readOnly, onOpenDay, onToggle }: ViewProps & { onToggle(id: string): void }) {
    const start = startOfWeek(anchor, locale);
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    return <div className="fws-week">
        {days.map(day => {
            const list = itemsOn(items, day);
            const done = list.filter(i => i.done).length;
            return <section key={day} className={`fws-week-day ${day === today ? 'today' : ''}`}>
                <button className="fws-week-head" onClick={() => onOpenDay(day)}>
                    <strong>{formatDate(day, locale, { weekday: 'short' })}</strong>
                    <span>{formatDate(day, locale, { month: 'numeric', day: 'numeric' })}</span>
                    {day === today && <span className="badge">{t.today}</span>}
                    {list.length > 0 && <span className="count">{t.progress(done, list.length)}</span>}
                </button>
                {list.length === 0
                    ? <div className="fws-week-none">{t.noItems}</div>
                    : list.map(item => {
                        const children = childrenOf(items, item.id);
                        return <div key={item.id} className={`fws-week-item ${item.done ? 'done' : ''}`}>
                            <button className="fws-check" role="checkbox" aria-checked={item.done} disabled={readOnly}
                                aria-label={item.done ? t.markUndone : t.markDone} onClick={() => onToggle(item.id)}><Check/></button>
                            <span className={`fws-pri ${item.priority}`}/>
                            <button className="fws-week-title" onClick={() => onOpenDay(day)}>{item.title}</button>
                            {children.length > 0 && <span className="fws-tag">{children.filter(c => c.done).length}/{children.length}</span>}
                            <span className="fws-when">{item.time && `${item.time.start}–${item.time.end}`}</span>
                        </div>;
                    })}
            </section>;
        })}
    </div>;
}

const SHOWN = 3;

/** Month grid with up to three titles a day; a day opens in the day view. */
export function MonthView({ t, locale, today, anchor, items, onOpenDay }: ViewProps) {
    const days = monthGrid(anchor, locale);
    const month = startOfMonth(anchor);
    return <div className="fws-month" role="grid">
        {days.slice(0, 7).map(day => <div key={day} className="fws-month-wd">{formatDate(day, locale, { weekday: 'short' })}</div>)}
        {days.map(day => {
            const list = itemsOn(items, day);
            const cls = ['fws-month-day', startOfMonth(day) !== month && 'out', day === today && 'today'].filter(Boolean).join(' ');
            return <button key={day} className={cls} role="gridcell" aria-label={formatDate(day, locale, { dateStyle: 'full' })} onClick={() => onOpenDay(day)}>
                <span className="num">{Number(day.slice(8))}</span>
                {list.slice(0, SHOWN).map(item => <span key={item.id} className={`fws-month-item ${item.done ? 'done' : ''}`}>
                    <span className={`fws-pri ${item.priority}`}/>{item.title}
                </span>)}
                {list.length > SHOWN && <span className="fws-month-more">{t.moreItems(list.length - SHOWN)}</span>}
            </button>;
        })}
    </div>;
}
