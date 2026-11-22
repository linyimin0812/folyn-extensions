export type Priority = 'high' | 'medium' | 'low';
export const PRIORITIES: Priority[] = ['high', 'medium', 'low'];

/** Same-day slot, `HH:MM` 24h; never crosses midnight. */
export interface TimeRange {
    start: string;
    end: string;
}

export type LinkKind = 'output' | 'reference';
export const LINK_KINDS: LinkKind[] = ['output', 'reference'];

/** A vault file attached to a work item. The schedule spans vaults, so the
 *  link keeps its vault: the same path in another vault is a different file. */
export interface FileLink {
    kind: LinkKind;
    vaultId: string;
    /** Name when linked, for display while another vault is open. */
    vaultName: string;
    /** Vault-relative; not updated when the file is later moved. */
    path: string;
}

export interface WorkItem {
    id: string;
    /** Set on a subitem. Subitems are one level deep and share their parent's date. */
    parentId?: string;
    /** Local calendar day, `YYYY-MM-DD`. */
    date: string;
    title: string;
    done: boolean;
    time?: TimeRange;
    priority: Priority;
    /** Hours, multiple of 0.5. Independent of `time`. */
    estimate?: number;
    tags: string[];
    note: string;
    links: FileLink[];
    createdAt: number;
}

/** Editable fields of a work item. */
export type WorkItemDraft = Pick<WorkItem, 'date' | 'title' | 'time' | 'priority' | 'estimate' | 'tags' | 'note' | 'links'>;

export type DraftError = 'titleRequired' | 'dateInvalid' | 'timeIncomplete' | 'timeOrder' | 'estimateInvalid';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function dateKey(d: Date): string {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateKey(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
    const d = parseDateKey(key);
    d.setDate(d.getDate() + days);
    return dateKey(d);
}

const SUNDAY_FIRST = new Set(['en', 'ja']);

/** 0 = Sunday, 1 = Monday, following the UI language. */
export function weekStartDay(locale: string): number {
    return SUNDAY_FIRST.has(locale.toLowerCase().split(/[-_]/)[0]) ? 0 : 1;
}

export function startOfWeek(key: string, locale: string): string {
    return addDays(key, -((parseDateKey(key).getDay() - weekStartDay(locale) + 7) % 7));
}

export function startOfMonth(key: string): string {
    return key.slice(0, 8) + '01';
}

/** Same day in another month, clamped to that month's length. */
export function shiftMonth(key: string, delta: number): string {
    const d = parseDateKey(key);
    const last = new Date(d.getFullYear(), d.getMonth() + delta + 1, 0).getDate();
    return dateKey(new Date(d.getFullYear(), d.getMonth() + delta, Math.min(d.getDate(), last)));
}

/** The six-week grid that shows the month of `key`. */
export function monthGrid(key: string, locale: string): string[] {
    const start = startOfWeek(startOfMonth(key), locale);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function isDateKey(value: unknown): value is string {
    return typeof value === 'string' && DATE_RE.test(value) && dateKey(parseDateKey(value)) === value;
}

function isEstimate(value: unknown): value is number {
    return typeof value === 'number' && value > 0 && value <= 24 && Number.isInteger(value * 2);
}

export function normalizeTags(tags: string[]): string[] {
    return [...new Set(tags.map(t => t.trim()).filter(Boolean))];
}

export function sameFile(a: FileLink, b: FileLink): boolean {
    return a.vaultId === b.vaultId && a.path === b.path;
}

export function linkName(path: string): string {
    return path.split('/').pop() || path;
}

function isSubsequence(needle: string, haystack: string): boolean {
    let at = 0;
    for (const ch of haystack) if (ch === needle[at]) ++at;
    return at === needle.length;
}

/** Best matches for a file search: name hits, then path hits, then fuzzy path hits. */
export function matchFiles<T extends { path: string; name: string }>(files: T[], query: string, limit = 20): T[] {
    const q = query.trim().toLowerCase();
    if (!q) return files.slice(0, limit);
    const rank = (file: T) => {
        const path = file.path.toLowerCase();
        if (file.name.toLowerCase().includes(q)) return 0;
        if (path.includes(q)) return 1;
        return isSubsequence(q, path) ? 2 : -1;
    };
    return files.map(file => ({ file, score: rank(file) }))
        .filter(m => m.score >= 0)
        .sort((a, b) => a.score - b.score || a.file.path.length - b.file.path.length)
        .slice(0, limit)
        .map(m => m.file);
}

function parseLinks(raw: unknown): FileLink[] {
    if (!Array.isArray(raw)) return [];
    const links = raw.filter((v): v is FileLink => !!v && LINK_KINDS.includes(v.kind)
        && typeof v.vaultId === 'string' && !!v.vaultId
        && typeof v.vaultName === 'string' && typeof v.path === 'string' && !!v.path);
    return links.filter((link, i) => links.findIndex(other => sameFile(other, link)) === i);
}

/** Returns the first problem with a draft, or null when it can be saved. */
export function validateDraft(draft: WorkItemDraft): DraftError | null {
    if (!draft.title.trim()) return 'titleRequired';
    if (!isDateKey(draft.date)) return 'dateInvalid';
    if (draft.time) {
        if (!TIME_RE.test(draft.time.start) || !TIME_RE.test(draft.time.end)) return 'timeIncomplete';
        if (draft.time.end <= draft.time.start) return 'timeOrder';
    }
    if (draft.estimate !== undefined && !isEstimate(draft.estimate)) return 'estimateInvalid';
    return null;
}

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Timed items first by start time; untimed after, by priority. Ties keep creation order. */
export function compareItems(a: WorkItem, b: WorkItem): number {
    if (a.time && b.time) {
        const byStart = a.time.start.localeCompare(b.time.start);
        if (byStart) return byStart;
    }
    else if (a.time || b.time) return a.time ? -1 : 1;
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.createdAt - b.createdAt;
}

/** Top-level items of a day; their subitems come from {@link childrenOf}. */
export function itemsOn(items: WorkItem[], date: string): WorkItem[] {
    return items.filter(i => i.date === date && !i.parentId).sort(compareItems);
}

export function childrenOf(items: WorkItem[], id: string): WorkItem[] {
    return items.filter(i => i.parentId === id).sort(compareItems);
}

/** Unfinished top-level items dated before `today`: what carry-over brings forward. */
export function carryOverCandidates(items: WorkItem[], today: string): WorkItem[] {
    return items.filter(i => !i.parentId && !i.done && i.date < today);
}

/** Brings the chosen unfinished past items (`ids`) to `today` without their time slots, which
 *  were planned for another day. An item moves with its subitems; when some
 *  subitems are already done, the parent stays behind with them as a record and
 *  a copy on `today` takes the unfinished ones. */
export function carryOver(items: WorkItem[], today: string, ids: ReadonlySet<string>, newId: () => string, now: number): WorkItem[] {
    const moved = new Map<string, WorkItem>();
    const copies: WorkItem[] = [];
    const toToday = (item: WorkItem): WorkItem => ({ ...item, date: today, time: undefined });
    for (const parent of carryOverCandidates(items, today).filter(i => ids.has(i.id))) {
        const children = items.filter(i => i.parentId === parent.id);
        if (children.some(c => c.done)) {
            const copy = { ...toToday(parent), id: newId(), createdAt: now };
            copies.push(copy);
            for (const child of children) if (!child.done) moved.set(child.id, { ...toToday(child), parentId: copy.id });
        }
        else {
            for (const item of [parent, ...children]) moved.set(item.id, toToday(item));
        }
    }
    return [...items.map(i => moved.get(i.id) ?? i), ...copies];
}

/** Restores the parent/subitem rules: a subitem stays on its parent's date, a
 *  parent is done exactly when all its subitems are, and a subitem whose parent
 *  is gone or is itself a subitem becomes a top-level item. */
export function normalizeTree(items: WorkItem[]): WorkItem[] {
    const roots = new Map(items.filter(i => !i.parentId).map(i => [i.id, i]));
    const tree = items.map((item): WorkItem => {
        if (!item.parentId) return item;
        const parent = roots.get(item.parentId);
        return parent ? { ...item, date: parent.date } : { ...item, parentId: undefined };
    });
    return tree.map(item => {
        const children = tree.filter(c => c.parentId === item.id);
        return children.length ? { ...item, done: children.every(c => c.done) } : item;
    });
}

export interface DayMark {
    total: number;
    done: number;
}

export interface PeriodSummary {
    total: number;
    done: number;
    /** Hours estimated on top-level items; subitem estimates would count twice. */
    estimate: number;
}

/** Top-level items in `[from, to]` inclusive. */
export function summarize(items: WorkItem[], from: string, to: string): PeriodSummary {
    const top = items.filter(i => !i.parentId && i.date >= from && i.date <= to);
    return { total: top.length, done: top.filter(i => i.done).length, estimate: top.reduce((sum, i) => sum + (i.estimate ?? 0), 0) };
}

/** Per-day counts of top-level items, for marking days in the calendar. */
export function dayMarks(items: WorkItem[]): Map<string, DayMark> {
    const marks = new Map<string, DayMark>();
    for (const item of items) {
        if (item.parentId) continue;
        const mark = marks.get(item.date) ?? { total: 0, done: 0 };
        marks.set(item.date, { total: mark.total + 1, done: mark.done + (item.done ? 1 : 0) });
    }
    return marks;
}

/** All tags ever used, most frequent first. */
export function knownTags(items: WorkItem[]): string[] {
    const counts = new Map<string, number>();
    for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
}

/** Storage is a trust boundary: drop anything that is not a well-formed item. */
export function parseItems(raw: unknown): WorkItem[] {
    if (!Array.isArray(raw)) return [];
    return normalizeTree(raw.flatMap((value): WorkItem[] => {
        if (!value || typeof value !== 'object') return [];
        const v = value as Record<string, unknown>;
        const time = v.time as Record<string, unknown> | undefined;
        const item: WorkItem = {
            id: typeof v.id === 'string' && v.id ? v.id : crypto.randomUUID(),
            parentId: typeof v.parentId === 'string' && v.parentId ? v.parentId : undefined,
            date: v.date as string,
            title: typeof v.title === 'string' ? v.title : '',
            done: v.done === true,
            time: time && typeof time.start === 'string' && typeof time.end === 'string' ? { start: time.start, end: time.end } : undefined,
            priority: PRIORITIES.includes(v.priority as Priority) ? v.priority as Priority : 'medium',
            estimate: typeof v.estimate === 'number' ? v.estimate : undefined,
            tags: Array.isArray(v.tags) ? normalizeTags(v.tags.filter((t): t is string => typeof t === 'string')) : [],
            note: typeof v.note === 'string' ? v.note : '',
            links: parseLinks(v.links),
            createdAt: typeof v.createdAt === 'number' ? v.createdAt : 0,
        };
        return validateDraft(item) ? [] : [item];
    }));
}
