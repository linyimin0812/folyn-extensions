import type { ExtensionApi, ExtensionContext, ExtensionSubscriptions, ExtensionVaultSession, ExtensionNoteSnapshot } from 'folyn-extension-sdk';
export type NoteSnapshot = ExtensionNoteSnapshot;
export type SubscriptionDataSession = ExtensionVaultSession['data'];
export type VaultSession = ExtensionVaultSession;
export type HostSupport = ExtensionSubscriptions;
export type SubscriptionApi = ExtensionApi;
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
