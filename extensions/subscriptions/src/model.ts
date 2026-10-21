export type Mode = 'original' | 'translated' | 'bilingual';
export type View = 'all' | 'unread' | 'starred' | 'saved' | 'retained' | `source:${string}` | `group:${string}`;
export interface Entry {
    url: string;
    title: string;
    guid?: string;
    published?: string;
    author?: string;
    summary: string;
    feedHtml?: string;
    titleFromUrl?: boolean;
}
export interface Rule {
    kind: 'feed' | 'html' | 'data' | 'sitemap';
    url: string;
    sample?: string;
    pathPrefix?: string;
    bodySelector?: string;
    dataPath?: string;
}
export interface Candidate {
    name: string;
    rule: Rule;
    entries: Entry[];
    next?: string;
    note?: string;
}
export interface Source {
    id: string;
    name: string;
    groups: string[];
    rule: Rule;
    interval: number | null;
    autoDownload: boolean;
    paused: boolean;
    lastSuccess?: string;
    error?: string;
    imported: number;
    next?: string;
    historyCursor?: string | null;
}
export interface SavedFile {
    path: string;
    mode: Mode;
    savedAt: string;
    missing?: boolean;
}
export interface Article extends Entry {
    id: string;
    aliases?: string[];
    sourceIds: string[];
    discovered: string;
    read: boolean;
    starred: boolean;
    saved: SavedFile[];
    positions: Partial<Record<Mode, {
        block: string;
        offset: number;
    }>>;
    cache?: {
        version: string;
        images: number;
        missing: number;
        unsupported: boolean;
        pending?: boolean;
        processed?: number;
        bytes?: number;
    };
    contentError?: string;
    translationVersion?: string;
}
export interface ImageCache {
    bytes?: number;
    url: string;
    path?: string;
    mime?: string;
    error?: string;
}
export interface Block {
    id: string;
    html: string;
}
export interface Body {
    articleId: string;
    version: string;
    html: string;
    text: string;
    blocks: Block[];
    images: ImageCache[];
    unsupported: boolean;
    fetched: string;
    title?: string;
}
export interface Translation {
    /** Missing on older caches, which stored individual text-node fragments. */
    format?: 'html-blocks' | 'document';
    /** One coherent result; parts are only for resuming unusually long articles. */
    document?: { content: string; complete: boolean; parts: { content: string; complete: boolean }[] };
    version: string;
    language: string;
    provider: string;
    model: string;
    values: Record<string, string>;
    errors: Record<string, string>;
    cancelled: boolean;
    pending?: string[];
}
export interface Settings {
    interval: number;
    autoRead: boolean;
    mode: Mode;
    language: string;
    saveDir: string;
    pair?: {
        provider: string;
        model: string;
    };
    consent?: string;
}
export interface State {
    schema: 2;
    sources: Source[];
    articles: Article[];
    groups: string[];
    collapsed: string[];
    settings: Settings;
    ui: {
        view: View;
        selected?: string;
        query: string;
        ascending: boolean;
        navWidth: number;
        listWidth: number;
        navOpen: boolean;
        navCollapsed?: boolean;
        listCollapsed?: boolean;
        learningWidth?: number;
    };
    saveDraft?: {
        articleId: string;
        mode: Mode;
        dir: string;
        name: string;
    };
}
export const freshState = (): State => ({ schema: 2, sources: [], articles: [], groups: [], collapsed: [], settings: { interval: 30, autoRead: true, mode: 'original', language: 'zh-CN', saveDir: '' }, ui: { view: 'all', query: '', ascending: false, navWidth: 196, listWidth: 340, navOpen: false } });
export const now = () => new Date().toISOString();
export const id = () => crypto.randomUUID();
export const message = (e: unknown) => e instanceof Error ? e.message : String(e);
export const MODES: Record<Mode, string> = { original: '原文', translated: '译文', bilingual: '双语' };
