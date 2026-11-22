import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { VaultApi } from 'folyn-extension-sdk';
import { PRIORITIES, validateDraft, type DraftError, type Priority, type WorkItem, type WorkItemDraft } from './model';
import type { Messages } from './i18n';
import { Calendar, X } from './icons';
import { DatePicker, formatDate } from './calendar';
import { LinkField } from './file-links';

interface Props {
    t: Messages;
    locale: string;
    vault: VaultApi;
    initial: WorkItemDraft;
    knownTags: string[];
    onSave(draft: WorkItemDraft): void;
    onCancel(): void;
    /** Present only when editing an existing item. */
    onDelete?(): void;
    /** A subitem keeps its parent's date, so the field is left out. */
    subitem?: boolean;
    /** Subitems that a delete takes with it. */
    deletes?: number;
}

/** Full form for creating or editing one work item. */
export function ItemEditor({ t, locale, vault, initial, knownTags, onSave, onCancel, onDelete, subitem, deletes = 0 }: Props) {
    const [title, setTitle] = useState(initial.title);
    const [date, setDate] = useState(initial.date);
    const [start, setStart] = useState(initial.time?.start ?? '');
    const [end, setEnd] = useState(initial.time?.end ?? '');
    const [priority, setPriority] = useState<Priority>(initial.priority);
    const [estimate, setEstimate] = useState(initial.estimate?.toString() ?? '');
    const [tags, setTags] = useState(initial.tags);
    const [tagInput, setTagInput] = useState('');
    const [note, setNote] = useState(initial.note);
    const [links, setLinks] = useState(initial.links);
    const [error, setError] = useState<DraftError | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const titleRef = useRef<HTMLInputElement>(null);
    const tagRef = useRef<HTMLInputElement>(null);
    const listId = useRef(`fws-tags-${Math.random().toString(36).slice(2)}`).current;

    useEffect(() => { titleRef.current?.focus(); }, []);

    const addTag = (value: string) => {
        const tag = value.trim();
        if (tag && !tags.includes(tag)) setTags([...tags, tag]);
        setTagInput('');
    };

    const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
        if ((e.key === 'Enter' || e.key === ',') && !e.nativeEvent.isComposing) {
            e.preventDefault();
            addTag(tagInput);
        }
        else if (e.key === 'Backspace' && !tagInput && tags.length) {
            setTags(tags.slice(0, -1));
        }
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        const draft: WorkItemDraft = {
            title,
            date,
            time: start || end ? { start, end } : undefined,
            priority,
            estimate: estimate.trim() ? Number(estimate) : undefined,
            tags: tagInput.trim() ? [...tags, tagInput] : tags,
            note,
            links,
        };
        const problem = validateDraft({ ...draft, title: title.trim() });
        if (problem) return setError(problem);
        onSave(draft);
    };

    return <form className="fws-editor" onSubmit={submit} onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}>
        <input ref={titleRef} className="fws-input" aria-label={t.title} placeholder={t.titlePlaceholder}
            value={title} onChange={e => setTitle(e.target.value)}/>

        <div className="fws-fields">
            {!subitem && <div className="fws-field">
                <span className="label" id="fws-date-label">{t.date}</span>
                <DatePicker t={t} locale={locale} value={date} onChange={setDate}
                    trigger={({ open, toggle }) => <button type="button" className={`fws-input fws-date ${open ? 'on' : ''}`}
                        aria-haspopup="dialog" aria-expanded={open} aria-labelledby="fws-date-label fws-date-value" onClick={toggle}>
                        <span id="fws-date-value">{formatDate(date, locale, { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' })}</span>
                        <Calendar/>
                    </button>}/>
            </div>}

            <div className="fws-field">
                <label htmlFor="fws-start">{t.time}</label>
                <div className="fws-control">
                    <input id="fws-start" className="fws-input" type="time" value={start} onChange={e => setStart(e.target.value)}/>
                    <span className="sep">–</span>
                    <input aria-label={t.time} className="fws-input" type="time" value={end} onChange={e => setEnd(e.target.value)}/>
                    {(start || end) && <button type="button" className="fws-icon" title={t.clearTime} aria-label={t.clearTime}
                        onClick={() => { setStart(''); setEnd(''); }}><X/></button>}
                </div>
            </div>

            <div className="fws-field">
                <span className="label">{t.priority}</span>
                <div className="fws-seg" role="group" aria-label={t.priority}>
                    {PRIORITIES.map(p => <button key={p} type="button" aria-pressed={priority === p} onClick={() => setPriority(p)}>
                        {t.priorities[p]}
                    </button>)}
                </div>
            </div>

            <div className="fws-field">
                <label htmlFor="fws-estimate">{t.estimate}</label>
                <div className="fws-control">
                    <input id="fws-estimate" className="fws-input" type="number" min={0.5} max={24} step={0.5}
                        value={estimate} onChange={e => setEstimate(e.target.value)}/>
                    <span className="unit">h</span>
                </div>
            </div>

            <div className="fws-field wide">
                <label htmlFor="fws-tags">{t.tags}</label>
                <div className="fws-tags" onClick={() => tagRef.current?.focus()}>
                    {tags.map(tag => <span key={tag} className="fws-chip">{tag}
                        <button type="button" aria-label={t.removeTag(tag)} onClick={() => setTags(tags.filter(x => x !== tag))}><X/></button>
                    </span>)}
                    <input id="fws-tags" ref={tagRef} list={listId} placeholder={tags.length ? '' : t.tagsPlaceholder}
                        value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={onTagKey}/>
                    <datalist id={listId}>{knownTags.filter(k => !tags.includes(k)).map(k => <option key={k} value={k}/>)}</datalist>
                </div>
            </div>

            <LinkField t={t} kind="output" label={t.outputs} links={links} vault={vault} onChange={setLinks}/>
            <LinkField t={t} kind="reference" label={t.references} links={links} vault={vault} onChange={setLinks}/>

            <div className="fws-field wide">
                <label htmlFor="fws-note">{t.note}</label>
                <textarea id="fws-note" className="fws-input" placeholder={t.notePlaceholder} value={note} onChange={e => setNote(e.target.value)}/>
            </div>
        </div>

        <div className="fws-editor-foot">
            {onDelete && <button type="button" className="btn btn-d btn-sm"
                onClick={() => confirmDelete ? onDelete() : setConfirmDelete(true)}>
                {!confirmDelete ? t.delete : deletes ? t.confirmDeleteAll(deletes) : t.confirmDelete}
            </button>}
            {error && <span className="err" role="alert">{t.errors[error]}</span>}
            <span className="spacer"/>
            <button type="button" className="btn btn-g btn-sm" onClick={onCancel}>{t.cancel}</button>
            <button type="submit" className="btn btn-p btn-sm">{t.save}</button>
        </div>
    </form>;
}

export function draftOf(item: WorkItem): WorkItemDraft {
    const { date, title, time, priority, estimate, tags, note, links } = item;
    return { date, title, time, priority, estimate, tags, note, links };
}

export function emptyDraft(date: string, title = ''): WorkItemDraft {
    return { date, title, priority: 'medium', tags: [], note: '', links: [] };
}
