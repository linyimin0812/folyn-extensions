import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExtensionAiChatParams } from 'folyn-extension-sdk';
import { LEARNING_PATH } from '../src/learning';
import type { LearningArticleInput } from '../src/learning-model';
import { Subscriptions } from '../src/service';
import { harness } from './helpers';

const services: Subscriptions[] = [], cleanups: (() => void)[] = [];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function setup() {
    const h = harness(), service = new Subscriptions(h.host); await service.start(); services.push(service); cleanups.push(h.dispose);
    const candidate = (await service.discover('https://example.com/feed.xml'))[0];
    await service.add(candidate, 'Source', [], 2, 0, false, await service.preview(candidate));
    const article = service.repo!.state.articles[0], body = await service.loadBody(article);
    const snapshot: LearningArticleInput = { articleId: article.id, title: article.title, url: article.url, version: body.version, text: body.text, quote: 'A retained quote' };
    return { h, service, article, snapshot, source: service.repo!.state.sources[0] };
}
afterEach(async () => {
    vi.restoreAllMocks();
    for (const service of services.splice(0)) { const learning = service.learning; service.stop(); await learning?.dispose().catch(() => {}); }
    cleanups.splice(0).forEach(cleanup => cleanup());
});

describe('learning ownership in subscription lifecycle', () => {
    it('retains both Vault drafts across A→B→A, drains A writes, and ignores A’s delayed AI events', async () => {
        const { h, service, snapshot } = await setup(), network = gate(), writing = gate(); let request!: ExtensionAiChatParams;
        vi.spyOn(h.host.api.ai!, 'chat').mockImplementationOnce(async params => { request = params; params.onEvent({ type: 'text', content: 'First partial answer' }); await network.promise; params.onEvent({ type: 'text', content: ' late response' }); });
        const original = service.learning!, a = original.start(snapshot); original.setDraft('Question from A'); const sending = original.send();
        let returning: Promise<void> | undefined;
        try {
            await vi.waitFor(() => expect(request).toBeTruthy());
            original.setDraft('Unsent follow-up A'); original.setNoteDraft('My own draft A'); original.setPrompt('A guidance');
            const write = h.first.vault.writeText.bind(h.first.vault); let hold = true;
            vi.spyOn(h.first.vault, 'writeText').mockImplementation(async (path, text) => { if (path === LEARNING_PATH && hold) { hold = false; await writing.promise; } await write(path, text); });
            await service.switchVault(h.second.vault);
            const b = service.learning!.start({ ...snapshot, articleId: 'b-article', title: 'B article' }, 'notes'); service.learning!.setDraft('Unsent question B'); service.learning!.setNoteDraft('My own draft B');
            let returned = false; returning = service.switchVault(h.first.vault).then(() => { returned = true; });
            await flush(); expect(returned).toBe(false); expect(service.loading).toBe(true);
            writing.release(); await returning;
            const restored = service.learning!;
            expect(restored.vaultId).toBe(h.first.vault.id); expect(restored.active).toMatchObject({ id: a.id, draft: 'Unsent follow-up A', noteDraft: 'My own draft A', prompt: 'A guidance' });
            expect(restored.active!.messages[1]).toMatchObject({ content: 'First partial answer', status: 'cancelled' });
            request.onEvent({ type: 'text', content: ' ignored after switch' }); network.release(); await sending;
            expect(restored.active!.messages[1].content).toBe('First partial answer');
            const storedB = JSON.parse(h.second.files.get(LEARNING_PATH) as string);
            expect(storedB.records[0]).toMatchObject({ id: b.id, draft: 'Unsent question B', noteDraft: 'My own draft B' });
            expect(JSON.stringify(storedB)).not.toContain('First partial answer');
        } finally { writing.release(); network.release(); await Promise.allSettled([returning, sending].filter(Boolean)); }
    });
    it('restores an unsaved learning draft after switching Vault and makes explicit persistence retry durable', async () => {
        const { h, service, snapshot } = await setup(), controller = service.learning!;
        const record = controller.start(snapshot, 'notes'); controller.setNoteDraft('Do not discard these unsaved thoughts'); controller.setDraft('Also retain this question');
        const write = h.first.vault.writeText.bind(h.first.vault); let failing = true;
        vi.spyOn(h.first.vault, 'writeText').mockImplementation(async (path, text) => { if (path === LEARNING_PATH && failing) throw new Error('read-only learning state'); await write(path, text); });
        await expect(controller.persist()).rejects.toThrow('read-only learning state');
        await service.switchVault(h.second.vault); await service.switchVault(h.first.vault);
        expect(service.learning!.active).toMatchObject({ id: record.id, noteDraft: 'Do not discard these unsaved thoughts', draft: 'Also retain this question' });
        expect(service.learning!.persistError).toContain('read-only learning state');
        failing = false; await service.learning!.persist(); expect(service.learning!.persistError).toBe('');
        await service.switchVault(h.second.vault); await service.switchVault(h.first.vault);
        expect(service.learning!.active!.noteDraft).toBe('Do not discard these unsaved thoughts');
        expect(h.second.files.has(LEARNING_PATH)).toBe(false);
    });
    it('keeps articles readable and the damaged file untouched when learning JSON cannot load', async () => {
        const { h, service, snapshot, article } = await setup(); h.first.files.set(LEARNING_PATH, '{not-valid-json');
        await service.switchVault(h.second.vault); await service.switchVault(h.first.vault);
        expect(service.repo!.state.articles).toHaveLength(2); expect(service.error).toBe('');
        expect((await service.repo!.body(service.repo!.state.articles.find(item => item.id === article.id)!))!.text).toBe(snapshot.text);
        expect(service.learning!.loadError).toContain('学习记录');
        service.learning!.start(snapshot, 'notes'); service.learning!.setNoteDraft('Preserved despite corrupt disk state');
        await expect(service.learning!.persist()).rejects.toThrow('学习记录');
        expect(h.first.files.get(LEARNING_PATH)).toBe('{not-valid-json');
        expect(service.learning!.active!.noteDraft).toBe('Preserved despite corrupt disk state');
    });
    it('retains material snapshots and learning notes after article caches are cleared and the source is removed', async () => {
        const { h, service, snapshot, article, source } = await setup(), controller = service.learning!;
        const record = controller.start(snapshot, 'notes'); controller.setNoteDraft('My independent understanding'); await controller.persist();
        const stored = h.first.files.get(LEARNING_PATH);
        await service.clear([article], true); expect(article.cache).toBeUndefined();
        expect(record.materials[0]).toMatchObject({ text: snapshot.text, quote: snapshot.quote, version: snapshot.version });
        await service.unsubscribe(source, false, false);
        expect(service.repo!.state.articles).toHaveLength(0); expect(service.repo!.state.sources).toHaveLength(0);
        expect(service.learning).toBe(controller); expect(controller.active!.noteDraft).toBe('My independent understanding');
        expect(h.first.files.get(LEARNING_PATH)).toBe(stored);
    });
    it('updates learning subscribers during streaming without invalidating the article workspace', async () => {
        const { h, service, snapshot } = await setup(), controller = service.learning!;
        const record = controller.start(snapshot); controller.setDraft('Explain task ownership');
        const workspaceUpdate = vi.fn(), panelUpdate = vi.fn();
        const stopWorkspace = service.subscribe(workspaceUpdate), stopPanel = controller.subscribe(panelUpdate);
        vi.spyOn(h.host.api.ai, 'chat').mockImplementationOnce(async params => {
            for (const content of ['First explanation. ', 'A concrete example. ', 'The conclusion.']) params.onEvent({ type: 'text', content });
        });
        try {
            await controller.send();
            expect(panelUpdate.mock.calls.length).toBeGreaterThan(3);
            expect(workspaceUpdate).not.toHaveBeenCalled();
            expect(record.messages[1]).toMatchObject({ status: 'complete', content: 'First explanation. A concrete example. The conclusion.' });
        } finally { stopWorkspace(); stopPanel(); }
    });

});
