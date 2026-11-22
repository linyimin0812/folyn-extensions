import type { Disposable, ExtensionApi, ExtensionContext, ExtensionVaultFileChange, ExtensionVaultSession, ExtensionNoteSnapshot, ExtensionWebResponse } from 'folyn-extension-sdk';
export type NoteSnapshot = ExtensionNoteSnapshot;
export type SubscriptionDataSession = ExtensionVaultSession['data'];
export type VaultSession = ExtensionVaultSession;
export type SubscriptionApi = ExtensionApi;
/**
 * What the extension needs from Folyn, gathered from the general APIs
 * (`api.vault` sessions, `api.web`, `api.ui`) in one place, so the service and
 * the tests depend on this shape only.
 */
export interface HostSupport {
    current(): VaultSession | null;
    onChange(handler: (session: VaultSession | null) => void): Disposable;
    onFileChange(handler: (event: ExtensionVaultFileChange) => void): Disposable;
    /** Binary bodies are base64 encoded; url is the final redirected URL. */
    fetch(url: string, binary?: boolean): Promise<ExtensionWebResponse>;
    /** Present only when the host granted `permissions.web.render`. */
    render?(url: string): Promise<ExtensionWebResponse>;
    openExternal(url: string): Promise<void>;
    openSettings(): void;
    openVaults(): void;
    setBadge(value: number): void;
}
export interface Host {
    api: SubscriptionApi;
    ctx: ExtensionContext;
    support: HostSupport;
}
export function requireSupport(api: SubscriptionApi, ctx: ExtensionContext): Host {
    if (typeof api.vault?.session !== 'function' || !api.web || !api.ui)
        throw new Error('当前 Folyn 尚未提供订阅所需的 Vault 会话和网页读取接口。请更新 Folyn 后重启。');
    const { vault, web, ui } = api;
    const support: HostSupport = {
        current: () => vault.session(),
        onChange: handler => vault.onSessionChange(handler),
        onFileChange: handler => vault.onFileChange(handler),
        fetch: (url, binary = false) => web.fetch(url, { binary }),
        ...(web.render ? { render: (url: string) => web.render!(url) } : {}),
        openExternal: url => ui.openExternal(url),
        openSettings: () => ui.openSettings(),
        openVaults: () => ui.openVaults(),
        setBadge: value => ui.setBadge(value),
    };
    return { api, ctx, support };
}
