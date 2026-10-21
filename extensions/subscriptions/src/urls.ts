const TRACKING = /^(utm_.+|fbclid|gclid|dclid|mc_cid|mc_eid|msclkid|igshid|vero_id)$/i;
export function webUrl(value: string, base?: string): string {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
        throw new Error('请输入不含账号密码的 HTTP 或 HTTPS 网址');
    return url.href;
}
export function canonical(value: string, base?: string): string {
    const url = new URL(webUrl(value, base));
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
        if (TRACKING.test(key))
            url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
}
export function inputUrl(value: string): string {
    return canonical(/^[\w+.-]+:\/\//.test(value) ? value : `https://${value}`);
}
export function safeName(title: string): string {
    return title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '').slice(0, 120).trim() || '未命名文章';
}
export function relativePath(value: string): string {
    const parts = value.trim().replace(/\\/g, '/').split('/').filter(Boolean);
    if (/^[a-z]:|^[/~]/i.test(value) || parts.some(p => p === '..' || p === '.'))
        throw new Error('请选择当前 Vault 内的相对目录');
    return parts.join('/');
}
export async function digest(value: string): Promise<string> {
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
