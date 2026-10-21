import type { VaultSession } from './host';
import type { State, Source, Body, Translation, Article } from './model';
import { freshState } from './model';
import { normalizeGroups } from './groups';
import { LearningRepository } from './learning';
type StoredState = Omit<State, 'schema' | 'sources'> & { schema: number; sources: (Omit<Source, 'groups'> & { group?: unknown; groups?: unknown })[] };
export const ROOT = '.folyn/subscriptions';
export class Repository {
    state: State = freshState();
    readonly learning: LearningRepository;
    private writes: Promise<void> = Promise.resolve();
    private bodies = new Map<string, Body>();
    constructor(readonly vault: VaultSession) {
        this.learning = new LearningRepository(vault);
    }
    async load() {
        if (await this.vault.exists(`${ROOT}/state.json`)) {
            const value = JSON.parse(await this.vault.readText(`${ROOT}/state.json`)) as StoredState;
            if (![1, 2].includes(value.schema) || !Array.isArray(value.sources) || !Array.isArray(value.articles)
                || !Array.isArray(value.groups) || value.groups.some(name => typeof name !== 'string')
                || !Array.isArray(value.collapsed) || value.collapsed.some(name => typeof name !== 'string'))
                throw new Error('订阅数据格式无法读取，请保留数据并检查插件版本');
            const sources = value.sources.map(stored => {
                const { group, groups, ...source } = stored;
                if (value.schema === 1) {
                    if (group !== undefined && typeof group !== 'string') throw new Error('旧订阅分组数据无法读取');
                    return { ...source, groups: normalizeGroups(typeof group === 'string' ? [group] : []) };
                }
                if (!Array.isArray(groups) || groups.some(name => typeof name !== 'string'))
                    throw new Error('订阅分组数据无法读取，请保留数据并检查插件版本');
                return { ...source, groups: normalizeGroups(groups) };
            });
            const groups = normalizeGroups([...value.groups, ...sources.flatMap(source => source.groups)]);
            this.state = { ...value, schema: 2, sources, groups, collapsed: normalizeGroups(value.collapsed).filter(name => groups.includes(name)) };
            // Tasks are owned by a live service, never by a persisted snapshot.
            // switchVault drains that Vault's older tasks before loading it;
            // a cold start has none. Keep interrupted work as partial offline.
            for (const article of this.state.articles)
                if (article.cache?.pending) article.cache.pending = false;
            if (this.state.ui.view.startsWith('group:')) this.state.ui.view = `group:${this.state.ui.view.slice(6).trim()}`;
        }
        await this.learning.load();
    }
    persist(): Promise<void> {
        const snapshot = JSON.stringify(this.state);
        const next = this.writes.catch(() => {
        }).then(() => this.vault.writeText(`${ROOT}/state.json`, snapshot));
        this.writes = next;
        return next;
    }
    async body(article: Article): Promise<Body | undefined> {
        if (!article.cache)
            return undefined;
        const key = `${article.id}/${article.cache.version}`;
        if (this.bodies.has(key))
            return this.bodies.get(key);
        const path = `${ROOT}/bodies/${key}.json`;
        if (!await this.vault.exists(path))
            return undefined;
        const body = JSON.parse(await this.vault.readText(path)) as Body;
        this.bodies.set(key, body);
        return body;
    }
    async bodyAt(articleId: string, version: string): Promise<Body | undefined> {
        const path = `${ROOT}/bodies/${articleId}/${version}.json`;
        return await this.vault.exists(path) ? JSON.parse(await this.vault.readText(path)) as Body : undefined;
    }
    async putBody(body: Body) {
        const key = `${body.articleId}/${body.version}`;
        await this.vault.writeText(`${ROOT}/bodies/${key}.json`, JSON.stringify(body));
        this.bodies.set(key, body);
    }
    translationPath(a: Article, version: string, language: string) {
        return `${ROOT}/translations/${a.id}/${version}-${encodeURIComponent(language)}.json`;
    }
    async translation(a: Article, version: string, language: string): Promise<Translation | undefined> {
        const path = this.translationPath(a, version, language);
        return await this.vault.exists(path) ? JSON.parse(await this.vault.readText(path)) as Translation : undefined;
    }
    async putTranslation(a: Article, t: Translation) {
        await this.vault.writeText(this.translationPath(a, t.version, t.language), JSON.stringify(t));
    }
    async clear(articles: Article[], translations: boolean) {
        for (const a of articles) {
            await this.vault.remove(`${ROOT}/images/${a.id}`);
            await this.vault.remove(`${ROOT}/bodies/${a.id}`);
            this.bodies.forEach((_, k) => {
                if (k.startsWith(a.id + '/'))
                    this.bodies.delete(k);
            });
            if (translations) {
                await this.vault.remove(`${ROOT}/translations/${a.id}`);
                delete a.translationVersion;
            }
            delete a.cache;
            delete a.contentError;
        }
        await this.persist();
    }
}
