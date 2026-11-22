import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { EnvApi, FileApi, VaultApi } from 'folyn-extension-sdk';
import { addDays, carryOverCandidates, childrenOf, dateKey, dayMarks, itemsOn, knownTags, linkName, shiftMonth, startOfMonth, startOfWeek, summarize, type FileLink, type WorkItem } from './model';
import { MonthView, WeekView } from './periods';
import { DatePicker, formatDate } from './calendar';
import { messagesFor, type Messages } from './i18n';
import type { Schedule } from './schedule';
import { ItemEditor, draftOf, emptyDraft } from './item-editor';
import { Calendar, Check, ChevronLeft, ChevronRight, Pencil, Plus, Sliders, Trash, X } from './icons';
import { LinkChip } from './file-links';
import { CarryOverPanel } from './carry-over';
import { styles } from './styles';

interface Runtime {
    schedule: Schedule;
    env: EnvApi;
    vault: VaultApi;
    files: FileApi;
}

let runtime: Runtime | undefined;
let failure = '';
let version = 0;
const observers = new Set<() => void>();

export function setRuntime(next: Runtime | undefined, error = '') {
    runtime = next;
    failure = error;
    ++version;
    observers.forEach(fn => fn());
}

const watch = (fn: () => void) => {
    observers.add(fn);
    return () => { observers.delete(fn); };
};

export function WorkSchedulePage() {
    useSyncExternalStore(watch, () => version);
    return runtime ? <Workspace {...runtime}/> : <div className="fws"><style>{styles}</style>{failure && <div className="fws-status">{failure}</div>}</div>;
}

type View = 'day' | 'week' | 'month';

/** Which form is open: the new-item form, or the editor of one existing item. */
type Editing = { kind: 'new'; title: string } | { kind: 'item'; id: string } | null;

function Workspace({ schedule, env, vault, files }: Runtime) {
    useSyncExternalStore(schedule.subscribe, schedule.snapshot);
    const [locale, setLocale] = useState(env.locale);
    useEffect(() => {
        const sub = env.onLocaleChange(setLocale);
        return () => { void sub.dispose(); };
    }, [env]);
    const t = messagesFor(locale);

    const today = dateKey(new Date());
    const [day, setDay] = useState(today);
    const [view, setView] = useState<View>('day');
    const [quick, setQuick] = useState('');
    const [editing, setEditing] = useState<Editing>(null);
    const [openError, setOpenError] = useState('');
    const [synced, setSynced] = useState(0);
    const [reviewing, setReviewing] = useState(false);
    const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
    const [addingTo, setAddingTo] = useState<string | null>(null);
    const quickRef = useRef<HTMLInputElement>(null);

    // Opening the page lands on today with the quick-add input focused.
    useEffect(() => { quickRef.current?.focus(); }, [schedule.loading]);

    const items = itemsOn(schedule.items, day);
    const tags = useMemo(() => knownTags(schedule.items), [schedule.items]);
    const marks = useMemo(() => dayMarks(schedule.items), [schedule.items]);
    const readOnly = schedule.loading || !!schedule.loadError;
    const done = items.filter(i => i.done).length;
    const timed = items.filter(i => i.time);
    const untimed = items.filter(i => !i.time);

    const goTo = (key: string) => {
        setDay(key);
        setEditing(null);
        setReviewing(false);
    };

    const openDay = (key: string) => {
        goTo(key);
        setView('day');
    };

    const step = (delta: number) => goTo(view === 'month' ? shiftMonth(day, delta) : addDays(day, view === 'week' ? 7 * delta : delta));
    const weekFrom = startOfWeek(day, locale);
    const period = view === 'week' ? { from: weekFrom, to: addDays(weekFrom, 6) }
        : view === 'month' ? { from: startOfMonth(day), to: addDays(shiftMonth(startOfMonth(day), 1), -1) }
            : { from: day, to: day };
    const inPeriod = today >= period.from && today <= period.to;

    const currentVaultId = vault.current()?.id;
    const candidates = view === 'day' && day === today && !readOnly ? carryOverCandidates(schedule.items, today) : [];

    const carry = (ids: string[]) => {
        setReviewing(false);
        setSynced(ids.length);
        void schedule.carryOver(today, ids);
    };

    const openLink = (link: FileLink) => {
        setOpenError('');
        if (vault.current()?.id !== link.vaultId) return;
        files.open(link.path).catch(() => setOpenError(t.fileMissing(linkName(link.path))));
    };

    const quickAdd = () => {
        const title = quick.trim();
        if (!title) return;
        void schedule.add(emptyDraft(day, title));
        setQuick('');
    };

    const toggleFold = (id: string) => {
        const next = new Set(collapsed);
        if (!next.delete(id)) next.add(id);
        setCollapsed(next);
    };

    const startSubitem = (id: string) => {
        const next = new Set(collapsed);
        next.delete(id);
        setCollapsed(next);
        setAddingTo(id);
    };

    const renderRow = (item: WorkItem, children: WorkItem[]) => editing?.kind === 'item' && editing.id === item.id
        ? <ItemEditor t={t} locale={locale} vault={vault} initial={draftOf(item)} knownTags={tags}
            subitem={!!item.parentId} deletes={children.length}
            onSave={draft => { void schedule.update(item.id, draft); setEditing(null); }}
            onCancel={() => setEditing(null)}
            onDelete={() => { void schedule.remove(item.id); setEditing(null); }}/>
        : <ItemCard item={item} t={t} readOnly={readOnly} currentVaultId={currentVaultId} onOpenLink={openLink}
            children={children} folded={collapsed.has(item.id)} onFold={() => toggleFold(item.id)}
            onAddSubitem={item.parentId ? undefined : () => startSubitem(item.id)}
            onToggle={() => void schedule.toggle(item.id)}
            onDelete={() => void schedule.remove(item.id)}
            onOpen={() => setEditing({ kind: 'item', id: item.id })}/>;

    const renderItem = (item: WorkItem) => {
        const children = childrenOf(schedule.items, item.id);
        const adding = addingTo === item.id && !readOnly;
        return <Fragment key={item.id}>
            {renderRow(item, children)}
            {!collapsed.has(item.id) && (children.length > 0 || adding) && <div className="fws-children">
                {children.map(child => <Fragment key={child.id}>{renderRow(child, [])}</Fragment>)}
                {adding && <SubitemInput t={t} onAdd={title => void schedule.add(emptyDraft(item.date, title), item.id)} onClose={() => setAddingTo(null)}/>}
            </div>}
        </Fragment>;
    };

    const section = (title: string, list: WorkItem[]) => list.length > 0 && <section className="fws-section">
        <div className="fws-section-title">{title}<span>{list.length}</span></div>
        {list.map(renderItem)}
    </section>;

    const totals = summarize(schedule.items, period.from, period.to);
    const summary = (view === 'day'
        ? [
            formatDate(day, locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
            day === today && t.today,
            items.length > 0 && t.progress(done, items.length),
        ]
        : [
            view === 'week'
                ? t.weekRange(formatDate(period.from, locale, { month: 'long', day: 'numeric' }), formatDate(period.to, locale, { month: 'long', day: 'numeric' }))
                : formatDate(day, locale, { year: 'numeric', month: 'long' }),
            totals.total > 0 && t.progress(totals.done, totals.total),
            totals.estimate > 0 && t.estimateTotal(totals.estimate),
        ]).filter(Boolean).join(' · ');

    const [prevLabel, nextLabel, todayLabel] = view === 'week' ? [t.prevWeek, t.nextWeek, t.thisWeek]
        : view === 'month' ? [t.prevMonth, t.nextMonth, t.thisMonth] : [t.prevDay, t.nextDay, t.today];

    return <div className="fws">
        <style>{styles}</style>
        <div className="fws-header">
            <div className="fws-wrap">
                <div className="fws-titlebar">
                    <div className="fws-heading">
                        <h1>{t.pageTitle}</h1>
                        <p>{summary}</p>
                    </div>
                    <div className="fws-actions">
                        {candidates.length > 0 && <button className={`btn btn-g btn-sm ${reviewing ? 'fws-sq on' : ''}`} title={t.syncHint} aria-expanded={reviewing}
                            onClick={() => setReviewing(!reviewing)}>{t.syncUnfinished(candidates.length)}</button>}
                        <div className="fws-views" role="group">
                            {(['day', 'week', 'month'] as const).map(v => <button key={v} aria-pressed={view === v} onClick={() => { setView(v); setEditing(null); setReviewing(false); }}>
                                {v === 'day' ? t.viewDay : v === 'week' ? t.viewWeek : t.viewMonth}
                            </button>)}
                        </div>
                        <button className="btn btn-g btn-sm fws-sq" aria-label={prevLabel} title={prevLabel} onClick={() => step(-1)}><ChevronLeft/></button>
                        <button className="btn btn-g btn-sm" disabled={view === 'day' ? day === today : inPeriod} onClick={() => goTo(today)}>{todayLabel}</button>
                        <button className="btn btn-g btn-sm fws-sq" aria-label={nextLabel} title={nextLabel} onClick={() => step(1)}><ChevronRight/></button>
                        <DatePicker t={t} locale={locale} value={day} marks={marks} align="end" onChange={goTo}
                            trigger={({ open, toggle }) => <button className={`btn btn-g btn-sm fws-sq ${open ? 'on' : ''}`} aria-haspopup="dialog"
                                aria-expanded={open} aria-label={t.pickDate} title={t.pickDate} onClick={toggle}><Calendar/></button>}/>
                    </div>
                </div>

                {schedule.loadError && <Alert t={t}>{t.loadFailed}{schedule.loadError}</Alert>}
                {schedule.saveError && <Alert t={t} onClose={schedule.dismissSaveError}>{t.saveFailed}{schedule.saveError}</Alert>}
                {openError && <Alert t={t} onClose={() => setOpenError('')}>{openError}</Alert>}
                {synced > 0 && <Alert t={t} tone="info" onClose={() => setSynced(0)}>{t.synced(synced)}</Alert>}

                {view === 'day' && !readOnly && editing?.kind !== 'new' && <div className="fws-quick">
                    <Plus/>
                    <input ref={quickRef} placeholder={t.quickAdd} value={quick} onChange={e => setQuick(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) quickAdd(); }}/>
                    <button className="fws-more" onClick={() => { setEditing({ kind: 'new', title: quick }); setQuick(''); }}><Sliders/>{t.moreOptions}</button>
                </div>}
            </div>
        </div>

        <div className="fws-scroll">
            <div className="fws-wrap fws-content">
                {reviewing && candidates.length > 0 && <CarryOverPanel t={t} locale={locale} items={schedule.items} candidates={candidates}
                    onMarkDone={id => void schedule.toggle(id)} onConfirm={carry} onCancel={() => setReviewing(false)}/>}
                {editing?.kind === 'new' && <ItemEditor t={t} locale={locale} vault={vault} initial={emptyDraft(day, editing.title)} knownTags={tags}
                    onSave={draft => { void schedule.add(draft); setEditing(null); }}
                    onCancel={() => setEditing(null)}/>}

                {schedule.loading
                    ? <div className="fws-status">{t.loading}</div>
                    : view === 'week'
                        ? <WeekView t={t} locale={locale} today={today} anchor={day} items={schedule.items} readOnly={readOnly}
                            onOpenDay={openDay} onToggle={id => void schedule.toggle(id)}/>
                    : view === 'month'
                        ? <MonthView t={t} locale={locale} today={today} anchor={day} items={schedule.items} readOnly={readOnly} onOpenDay={openDay}/>
                    : items.length === 0
                        ? <div className="fws-empty">{t.empty}</div>
                        : <>{section(t.scheduled, timed)}{section(t.unscheduled, untimed)}</>}
            </div>
        </div>
    </div>;
}

/** Without `onClose` the alert stays: it explains a state the user cannot dismiss. */
function Alert({ t, tone = 'error', onClose, children }: { t: Messages; tone?: 'error' | 'info'; onClose?(): void; children: ReactNode }) {
    return <div className={`fws-alert ${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
        <span>{children}</span>
        {onClose && <button className="fws-icon" aria-label={t.dismiss} title={t.dismiss} onClick={onClose}><X/></button>}
    </div>;
}

/** Stays open after each Enter, so several subitems can be typed in a row. */
function SubitemInput({ t, onAdd, onClose }: { t: Messages; onAdd(title: string): void; onClose(): void }) {
    const [title, setTitle] = useState('');
    return <div className="fws-subadd">
        <input autoFocus className="fws-input" placeholder={t.subitemPlaceholder} value={title} onChange={e => setTitle(e.target.value)}
            onBlur={() => { if (!title.trim()) onClose(); }}
            onKeyDown={e => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === 'Escape') onClose();
                if (e.key === 'Enter' && title.trim()) {
                    onAdd(title.trim());
                    setTitle('');
                }
            }}/>
    </div>;
}

/** First click arms it; leaving the button disarms, so one stray click deletes nothing. */
function RowDelete({ t, subitems, onDelete }: { t: Messages; subitems: number; onDelete(): void }) {
    const [armed, setArmed] = useState(false);
    const label = !armed ? t.delete : subitems ? t.confirmDeleteAll(subitems) : t.confirmDelete;
    return <button className={`fws-rowact fws-rowdel ${armed ? 'armed' : ''}`} aria-label={label} title={label}
        onMouseLeave={() => setArmed(false)} onBlur={() => setArmed(false)}
        onClick={() => { if (armed) onDelete(); else setArmed(true); }}>
        {armed ? label : <Trash/>}
    </button>;
}

function ItemCard({ item, t, readOnly, currentVaultId, onOpenLink, children, folded, onFold, onAddSubitem, onToggle, onDelete, onOpen }: {
    item: WorkItem;
    t: Messages;
    readOnly: boolean;
    currentVaultId?: string;
    onOpenLink(link: FileLink): void;
    children: WorkItem[];
    folded: boolean;
    onFold(): void;
    /** Absent on subitems: nesting is one level deep. */
    onAddSubitem?(): void;
    onToggle(): void;
    onDelete(): void;
    onOpen(): void;
}) {
    const subDone = children.filter(c => c.done).length;
    const groups = ([['output', t.outputs], ['reference', t.references]] as const)
        .map(([kind, label]) => ({ kind, label, links: item.links.filter(l => l.kind === kind) }))
        .filter(group => group.links.length > 0);
    return <div className={`fws-item ${item.done ? 'done' : ''}`}>
        <div className="fws-row">
            {children.length > 0
                ? <button className={`fws-fold ${folded ? '' : 'open'}`} aria-expanded={!folded} aria-label={folded ? t.expand : t.collapse}
                    title={folded ? t.expand : t.collapse} onClick={onFold}><ChevronRight/></button>
                : <span className="fws-fold"/>}
            <button className="fws-check" role="checkbox" aria-checked={item.done} disabled={readOnly}
                aria-label={item.done ? t.markUndone : t.markDone}
                onClick={onToggle}><Check/></button>
            <span className={`fws-pri ${item.priority}`} role="img" aria-label={`${t.priority}: ${t.priorities[item.priority]}`} title={t.priorities[item.priority]}/>
            <div className="fws-main">
                <span className="fws-title" onDoubleClick={readOnly ? undefined : onOpen}>{item.title}</span>
                {children.length > 0 && <span className="fws-tag" title={t.subProgress(subDone, children.length)}>{subDone}/{children.length}</span>}
                {item.tags.map(tag => <span key={tag} className="fws-tag">#{tag}</span>)}
            </div>
            <span className="fws-est">{item.estimate !== undefined && t.hours(item.estimate)}</span>
            <span className="fws-when">{item.time && `${item.time.start}–${item.time.end}`}</span>
            {!readOnly && <div className="fws-rowacts">
                <button className="fws-rowact" aria-label={t.edit} title={t.edit} onClick={onOpen}><Pencil/></button>
                {onAddSubitem && <button className="fws-rowact" aria-label={t.addSubitem} title={t.addSubitem} onClick={onAddSubitem}><Plus/></button>}
                <RowDelete t={t} subitems={children.length} onDelete={onDelete}/>
            </div>}
        </div>
        {(item.note || groups.length > 0) && <div className="fws-detail">
            {groups.map(({ kind, label, links }) => <Fragment key={kind}>
                <span className="kind">{label}</span>
                {links.map(link => <LinkChip key={`${link.vaultId}:${link.path}`} t={t} link={link} currentVaultId={currentVaultId} onOpen={() => onOpenLink(link)}/>)}
            </Fragment>)}
            {item.note && <span className="fws-note" title={item.note}>{item.note}</span>}
        </div>}
    </div>;
}
