import type { ExtensionApi, ExtensionContext, ExtensionHttpResponse, Disposable } from 'folyn-extension-sdk';
export interface NoteSnapshot { path: string; title: string; text: string }
export interface VaultSession {
    id: string;
    name: string;
    readText(path: string): Promise<string>;
    readBinary(path: string): Promise<Uint8Array>;
    writeText(path: string, content: string): Promise<void>;
    writeBinary(path: string, content: Uint8Array): Promise<void>;
    createText(path: string, content: string): Promise<void>;
    exists(path: string): Promise<boolean>;
    remove(path: string): Promise<void>;
    assetUrl(path: string): Promise<string>;
    open(path: string): Promise<void>;
    chooseDirectory(): Promise<string | null>;
    chooseNotes?(): Promise<NoteSnapshot[]>;
    readNote?(path: string): Promise<NoteSnapshot>;
    appendNote?(path: string, text: string, expectedText: string): Promise<void>;
}
export interface HostSupport {
    current(): VaultSession | null;
    onChange(handler: (session: VaultSession | null) => void): Disposable;
    onFileChange(handler: (event: {
        vaultId: string;
        path: string;
        newPath?: string;
        deleted?: boolean;
    }) => void): Disposable;
    openExternal(url: string): Promise<void>;
    openSettings(): void;
    openVaults(): void;
    setBadge(value: number): void;
    render?(url: string): Promise<ExtensionHttpResponse & { url: string }>;
    fetch(url: string, binary?: boolean): Promise<ExtensionHttpResponse & {
        url: string;
    }>;
}
export type SubscriptionApi = ExtensionApi & {
    subscriptions?: HostSupport;
};
export interface Host {
    api: SubscriptionApi;
    ctx: ExtensionContext;
    support: HostSupport;
}
export function requireSupport(api: SubscriptionApi, ctx: ExtensionContext): Host {
    if (!api.subscriptions)
        throw new Error('当前 Folyn 尚未提供订阅所需的 Vault 会话和网页下载接口。请安装随插件提供的宿主更新后重启 Folyn。');
    return { api, ctx, support: api.subscriptions };
}
