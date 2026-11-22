import { describe, expect, it } from 'vitest';
import { addDays, carryOver, carryOverCandidates, childrenOf, compareItems, dayMarks, itemsOn, knownTags, matchFiles, monthGrid, normalizeTree, parseItems, shiftMonth, startOfWeek, summarize, validateDraft, type WorkItem, type WorkItemDraft } from '../src/model';

const draft = (patch: Partial<WorkItemDraft> = {}): WorkItemDraft => ({ date: '2026-03-10', title: 'Write report', priority: 'medium', tags: [], note: '', links: [], ...patch });
const item = (patch: Partial<WorkItem> = {}): WorkItem => ({ id: Math.random().toString(), done: false, createdAt: 0, ...draft(), ...patch });

describe('validateDraft', () => {
    it('accepts a minimal draft', () => {
        expect(validateDraft(draft())).toBeNull();
    });
    it('requires a title and a real date', () => {
        expect(validateDraft(draft({ title: '  ' }))).toBe('titleRequired');
        expect(validateDraft(draft({ date: '2026-02-30' }))).toBe('dateInvalid');
    });
    it('keeps time ranges inside one day', () => {
        expect(validateDraft(draft({ time: { start: '14:00', end: '15:00' } }))).toBeNull();
        expect(validateDraft(draft({ time: { start: '14:00', end: '' } }))).toBe('timeIncomplete');
        expect(validateDraft(draft({ time: { start: '23:00', end: '01:00' } }))).toBe('timeOrder');
        expect(validateDraft(draft({ time: { start: '14:00', end: '14:00' } }))).toBe('timeOrder');
    });
    it('takes estimates in half hours', () => {
        expect(validateDraft(draft({ estimate: 1.5 }))).toBeNull();
        expect(validateDraft(draft({ estimate: 0.3 }))).toBe('estimateInvalid');
        expect(validateDraft(draft({ estimate: 0 }))).toBe('estimateInvalid');
        expect(validateDraft(draft({ estimate: 24.5 }))).toBe('estimateInvalid');
    });
});

describe('day view ordering', () => {
    it('puts timed items first by start, then untimed by priority', () => {
        const items = [
            item({ title: 'low', priority: 'low' }),
            item({ title: 'afternoon', time: { start: '14:00', end: '15:00' }, priority: 'low' }),
            item({ title: 'high', priority: 'high' }),
            item({ title: 'morning', time: { start: '09:00', end: '10:00' } }),
            item({ title: 'other day', date: '2026-03-11' }),
        ];
        expect(itemsOn(items, '2026-03-10').map(i => i.title)).toEqual(['morning', 'afternoon', 'high', 'low']);
    });
    it('keeps creation order on ties', () => {
        expect(compareItems(item({ createdAt: 1 }), item({ createdAt: 2 }))).toBeLessThan(0);
    });
});

describe('dates and tags', () => {
    it('moves across month and year boundaries', () => {
        expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    });
    it('ranks known tags by use', () => {
        expect(knownTags([item({ tags: ['b', 'a'] }), item({ tags: ['a'] })])).toEqual(['a', 'b']);
    });
});

describe('parseItems', () => {
    it('drops malformed entries from storage', () => {
        const good = item({ id: 'ok', tags: ['x', ' x ', ''] });
        const parsed = parseItems([good, null, 'x', { ...good, id: 'bad', date: 'nope' }, { ...good, id: 'late', time: { start: '23:00', end: '01:00' } }]);
        expect(parsed.map(i => i.id)).toEqual(['ok']);
        expect(parsed[0].tags).toEqual(['x']);
    });
    it('reads missing storage as an empty schedule', () => {
        expect(parseItems(undefined)).toEqual([]);
    });
});

describe('dayMarks', () => {
    it('counts items and completions per day', () => {
        const marks = dayMarks([item({ done: true }), item(), item({ date: '2026-03-11', done: true })]);
        expect(marks.get('2026-03-10')).toEqual({ total: 2, done: 1 });
        expect(marks.get('2026-03-11')).toEqual({ total: 1, done: 1 });
    });
});

describe('matchFiles', () => {
    const file = (path: string) => ({ path, name: path.split('/').pop()! });
    const files = ['notes/plan.md', 'plan/roadmap.md', 'archive/p-l-a-n.txt', 'readme.md'].map(file);

    it('ranks name hits over path hits over fuzzy hits', () => {
        expect(matchFiles(files, 'PLAN').map(f => f.path)).toEqual(['notes/plan.md', 'plan/roadmap.md', 'archive/p-l-a-n.txt']);
    });
    it('caps results at the limit, with or without a query', () => {
        const many = Array.from({ length: 30 }, (_, i) => file(`a${i}.md`));
        expect(matchFiles(many, '')).toHaveLength(20);
        expect(matchFiles(many, 'a')).toHaveLength(20);
    });
});

describe('file links in storage', () => {
    const link = { kind: 'output', vaultId: 'v1', vaultName: 'Work', path: 'a.md' };

    it('reads items saved before links existed as having none', () => {
        const { links: _, ...old } = item({ id: 'old' });
        expect(parseItems([old])[0].links).toEqual([]);
    });
    it('keeps valid links, drops malformed ones and repeats of a file', () => {
        const parsed = parseItems([item({ links: [link, { ...link, kind: 'reference' }, { ...link, kind: 'other', path: 'b.md' }, { ...link, vaultId: '', path: 'c.md' }, null] as never })]);
        expect(parsed[0].links).toEqual([link]);
    });
    it('treats the same path in two vaults as two files', () => {
        const parsed = parseItems([item({ links: [link, { ...link, vaultId: 'v2' }] as never })]);
        expect(parsed[0].links).toHaveLength(2);
    });
});

describe('subitems', () => {
    const parent = item({ id: 'p' });
    const child = (patch: Partial<WorkItem> = {}) => item({ parentId: 'p', ...patch });

    it('keeps subitems out of the day list and the calendar counts', () => {
        const items = [parent, child()];
        expect(itemsOn(items, parent.date).map(i => i.id)).toEqual(['p']);
        expect(dayMarks(items).get(parent.date)).toEqual({ total: 1, done: 0 });
        expect(childrenOf(items, 'p')).toHaveLength(1);
    });
    it('marks a parent done exactly when all subitems are', () => {
        const done = (kids: boolean[]) => normalizeTree([parent, ...kids.map(d => child({ done: d }))])[0].done;
        expect(done([true, true])).toBe(true);
        expect(done([true, false])).toBe(false);
        expect(normalizeTree([{ ...parent, done: true }])[0].done).toBe(true);
    });
    it('keeps a subitem on its parent date', () => {
        expect(normalizeTree([parent, child({ date: '2030-01-01' })])[1].date).toBe(parent.date);
    });
    it('promotes a subitem that lost its parent or would nest deeper', () => {
        const orphan = normalizeTree([child({ id: 'c' }), item({ id: 'g', parentId: 'c' })]);
        expect(orphan.every(i => !i.parentId)).toBe(true);
    });
    it('reads subitems back from storage', () => {
        const parsed = parseItems([parent, child({ id: 'c', done: true })]);
        expect(parsed.find(i => i.id === 'c')?.parentId).toBe('p');
        expect(parsed.find(i => i.id === 'p')?.done).toBe(true);
    });
});

describe('carryOver', () => {
    const today = '2026-03-10';
    let next = 0;
    const all = (items: WorkItem[]) => new Set(carryOverCandidates(items, today).map(i => i.id));
    const run = (items: WorkItem[], ids = all(items)) => normalizeTree(carryOver(items, today, ids, () => `new${++next}`, 99));
    const find = (items: WorkItem[], id: string) => items.find(i => i.id === id)!;

    it('moves unfinished past items to today and clears their time slot', () => {
        const items = run([
            item({ id: 'a', date: '2026-03-09', time: { start: '09:00', end: '10:00' }, estimate: 1, tags: ['x'] }),
            item({ id: 'b', date: '2026-03-01' }),
        ]);
        expect(find(items, 'a')).toMatchObject({ date: today, time: undefined, estimate: 1, tags: ['x'] });
        expect(find(items, 'b').date).toBe(today);
    });
    it('leaves done items, today and the future alone', () => {
        const items = [item({ id: 'd', date: '2026-03-09', done: true }), item({ id: 't', date: today }), item({ id: 'f', date: '2026-03-11' })];
        expect(run(items)).toEqual(items);
    });
    it('moves a group whose subitems are all unfinished, with no copy', () => {
        const items = run([item({ id: 'p', date: '2026-03-09' }), item({ id: 'c', parentId: 'p', date: '2026-03-09', time: { start: '09:00', end: '10:00' } })]);
        expect(items).toHaveLength(2);
        expect(find(items, 'c')).toMatchObject({ parentId: 'p', date: today, time: undefined });
    });
    it('keeps a partly done parent behind and copies it to today for the unfinished subitems', () => {
        const items = run([
            item({ id: 'p', date: '2026-03-09', title: '发版', links: [{ kind: 'output', vaultId: 'v', vaultName: 'V', path: 'a.md' }] }),
            item({ id: 'done', parentId: 'p', date: '2026-03-09', done: true }),
            item({ id: 'open', parentId: 'p', date: '2026-03-09' }),
        ]);
        expect(find(items, 'p')).toMatchObject({ date: '2026-03-09', done: true });
        expect(find(items, 'done')).toMatchObject({ parentId: 'p', date: '2026-03-09' });
        const copy = items.find(i => i.date === today && !i.parentId)!;
        expect(copy).toMatchObject({ title: '发版', done: false, createdAt: 99, links: [expect.objectContaining({ path: 'a.md' })] });
        expect(copy.id).not.toBe('p');
        expect(find(items, 'open')).toMatchObject({ parentId: copy.id, date: today });
    });
    it('moves only the chosen items', () => {
        const items = run([item({ id: 'a', date: '2026-03-09' }), item({ id: 'b', date: '2026-03-09' })], new Set(['b']));
        expect(find(items, 'a').date).toBe('2026-03-09');
        expect(find(items, 'b').date).toBe(today);
    });
    it('has nothing left to carry over afterwards', () => {
        const items = run([item({ id: 'p', date: '2026-03-09' }), item({ id: 'x', parentId: 'p', date: '2026-03-09', done: true }), item({ id: 'y', parentId: 'p', date: '2026-03-09' })]);
        expect(carryOverCandidates(items, today)).toEqual([]);
        expect(run(items)).toEqual(items);
    });
});

describe('periods', () => {
    it('starts the week on Monday, or Sunday for English and Japanese', () => {
        expect(startOfWeek('2026-03-12', 'zh')).toBe('2026-03-09');
        expect(startOfWeek('2026-03-09', 'zh-CN')).toBe('2026-03-09');
        expect(startOfWeek('2026-03-15', 'zh')).toBe('2026-03-09');
        expect(startOfWeek('2026-03-12', 'en')).toBe('2026-03-08');
    });
    it('lays a month out in six whole weeks', () => {
        const grid = monthGrid('2026-03-20', 'zh');
        expect(grid).toHaveLength(42);
        expect(grid[0]).toBe('2026-02-23');
        expect(grid).toContain('2026-03-31');
    });
    it('clamps the day when paging months', () => {
        expect(shiftMonth('2026-01-31', 1)).toBe('2026-02-28');
        expect(shiftMonth('2026-03-31', -1)).toBe('2026-02-28');
        expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-15');
    });
    it('totals top-level items only, so subitem hours are not counted twice', () => {
        const items = [
            item({ id: 'p', date: '2026-03-09', estimate: 3 }),
            item({ id: 'c', parentId: 'p', date: '2026-03-09', estimate: 1 }),
            item({ date: '2026-03-10', estimate: 1.5, done: true }),
            item({ date: '2026-03-20', estimate: 8 }),
        ];
        expect(summarize(items, '2026-03-09', '2026-03-15')).toEqual({ total: 2, done: 1, estimate: 4.5 });
    });
});
