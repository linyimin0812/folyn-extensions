import { describe, expect, it } from 'vitest';
import type { ExtensionStorageApi } from 'folyn-extension-sdk';
import { Schedule } from '../src/schedule';

function memoryStorage(initial?: unknown): ExtensionStorageApi & { data: Map<string, unknown> } {
    const data = new Map<string, unknown>(initial === undefined ? [] : [['items', initial]]);
    return { data, async get(key) { return data.get(key); }, async set(key, value) { data.set(key, value); } };
}

const draft = { date: '2026-03-10', title: ' Plan sprint ', priority: 'high' as const, tags: ['team', ' team '], note: '', links: [] };

describe('Schedule', () => {
    it('persists added, edited, toggled and removed items', async () => {
        const storage = memoryStorage();
        const schedule = new Schedule(storage);
        await schedule.load();
        await schedule.add(draft);
        const [added] = schedule.items;
        expect(added).toMatchObject({ title: 'Plan sprint', tags: ['team'], done: false });

        await schedule.toggle(added.id);
        await schedule.update(added.id, { ...draft, date: '2026-03-11' });
        expect(storage.data.get('items')).toEqual([expect.objectContaining({ done: true, date: '2026-03-11' })]);

        await schedule.remove(added.id);
        expect(storage.data.get('items')).toEqual([]);
    });

    describe('subitems', () => {
        async function withChildren() {
            const schedule = new Schedule(memoryStorage());
            await schedule.load();
            await schedule.add(draft);
            const parent = schedule.items[0];
            await schedule.add({ ...draft, title: 'a' }, parent.id);
            await schedule.add({ ...draft, title: 'b', priority: 'low', estimate: 1 }, parent.id);
            const [, a, b] = schedule.items;
            const get = (id: string) => schedule.items.find(i => i.id === id)!;
            return { schedule, parent, a, b, get };
        }

        it('ticks and unticks all subitems with the parent', async () => {
            const { schedule, parent, a, b, get } = await withChildren();
            await schedule.toggle(parent.id);
            expect([get(parent.id).done, get(a.id).done, get(b.id).done]).toEqual([true, true, true]);
            await schedule.toggle(parent.id);
            expect([get(parent.id).done, get(a.id).done, get(b.id).done]).toEqual([false, false, false]);
        });

        it('completes the parent with its last subitem and reopens it with any', async () => {
            const { schedule, parent, a, b, get } = await withChildren();
            await schedule.toggle(a.id);
            expect(get(parent.id).done).toBe(false);
            await schedule.toggle(b.id);
            expect(get(parent.id).done).toBe(true);
            await schedule.toggle(a.id);
            expect(get(parent.id).done).toBe(false);
        });

        it('reopens a done parent when a subitem is added', async () => {
            const { schedule, parent, get } = await withChildren();
            await schedule.toggle(parent.id);
            await schedule.add({ ...draft, title: 'c' }, parent.id);
            expect(get(parent.id).done).toBe(false);
        });

        it('moves subitems with the parent date, keeping their own fields', async () => {
            const { schedule, parent, b, get } = await withChildren();
            await schedule.update(parent.id, { ...draft, date: '2026-03-20' });
            expect(get(b.id)).toMatchObject({ date: '2026-03-20', priority: 'low', estimate: 1 });
        });

        it('deletes subitems with the parent but not the reverse', async () => {
            const { schedule, parent, a } = await withChildren();
            await schedule.remove(a.id);
            expect(schedule.items).toHaveLength(2);
            await schedule.remove(parent.id);
            expect(schedule.items).toEqual([]);
        });
    });

    it('reloads what it saved', async () => {
        const storage = memoryStorage();
        const first = new Schedule(storage);
        await first.load();
        await first.add(draft);
        const second = new Schedule(storage);
        await second.load();
        expect(second.items).toEqual(first.items);
    });

    it('never overwrites storage it failed to read', async () => {
        const storage = memoryStorage([{ keep: true }]);
        storage.get = async () => { throw new Error('disk'); };
        const schedule = new Schedule(storage);
        await schedule.load();
        await schedule.add(draft);
        expect(schedule.loadError).toBe('disk');
        expect(storage.data.get('items')).toEqual([{ keep: true }]);
    });

    it('reports save failures', async () => {
        const storage = memoryStorage();
        storage.set = async () => { throw new Error('full'); };
        const schedule = new Schedule(storage);
        await schedule.load();
        await schedule.add(draft);
        expect(schedule.saveError).toBe('full');
        schedule.dismissSaveError();
        expect(schedule.saveError).toBe('');
    });
});
