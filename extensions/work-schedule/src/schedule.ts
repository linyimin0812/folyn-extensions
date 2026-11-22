import type { ExtensionStorageApi } from 'folyn-extension-sdk';
import { carryOver, normalizeTags, normalizeTree, parseItems, type WorkItem, type WorkItemDraft } from './model';

const KEY = 'items';

/** The user's work schedule: every work item, persisted as one list in the
 *  extension's global app storage (shared across vaults, never in a vault). */
export class Schedule {
    items: WorkItem[] = [];
    loading = true;
    loadError = '';
    saveError = '';
    private version = 0;
    private readonly observers = new Set<() => void>();

    constructor(private readonly storage: ExtensionStorageApi) {}

    subscribe = (fn: () => void) => {
        this.observers.add(fn);
        return () => { this.observers.delete(fn); };
    };

    snapshot = () => this.version;

    async load() {
        try {
            this.items = parseItems(await this.storage.get(KEY));
        }
        catch (error) {
            this.loadError = message(error);
        }
        this.loading = false;
        this.changed();
    }

    add(draft: WorkItemDraft, parentId?: string) {
        return this.commit([...this.items, { ...clean(draft), id: crypto.randomUUID(), parentId, done: false, createdAt: Date.now() }]);
    }

    update(id: string, draft: WorkItemDraft) {
        return this.commit(this.items.map(i => i.id === id ? { ...i, ...clean(draft) } : i));
    }

    toggle(id: string) {
        const done = !this.items.find(i => i.id === id)?.done;
        return this.commit(this.items.map(i => i.id === id || i.parentId === id ? { ...i, done } : i));
    }

    carryOver(today: string, ids: string[]) {
        return this.commit(carryOver(this.items, today, new Set(ids), () => crypto.randomUUID(), Date.now()));
    }

    remove(id: string) {
        return this.commit(this.items.filter(i => i.id !== id && i.parentId !== id));
    }

    dismissSaveError = () => {
        this.saveError = '';
        this.changed();
    };

    private async commit(next: WorkItem[]) {
        // A failed load must not be overwritten with an empty list.
        if (this.loading || this.loadError) return;
        const items = normalizeTree(next);
        this.items = items;
        this.changed();
        try {
            await this.storage.set(KEY, items);
            this.saveError = '';
        }
        catch (error) {
            this.saveError = message(error);
        }
        this.changed();
    }

    private changed() {
        ++this.version;
        this.observers.forEach(fn => fn());
    }
}

function clean(draft: WorkItemDraft): WorkItemDraft {
    return { ...draft, title: draft.title.trim(), note: draft.note.trim(), tags: normalizeTags(draft.tags) };
}

function message(error: unknown) {
    return error instanceof Error ? error.message : String(error);
}
