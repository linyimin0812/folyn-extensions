export class SiteError extends Error {
    constructor(readonly stage: 'network' | 'discovery' | 'body' | 'render', message: string, readonly url: string) {
        super(message); this.name = 'SiteError';
    }
}
export function pageGate(html: string): 'verification' | 'login' | 'transport' | undefined {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const title = (doc.title || '').trim();
    const text = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 300 && /^(?:Blocked:\s*Only HTTPS requests are allowed|upstream connect error|no healthy upstream)/i.test(text)) return 'transport';
    if (/^(just a moment|attention required|access denied|verify (?:you|your)|人机验证|安全验证)/i.test(title) || text.length < 5000 && /(?:verify (?:that )?you are human|checking your browser before|enable javascript and cookies to continue|请完成.{0,8}人机验证)/i.test(text)) return 'verification';
    if (/^(?:sign[ -]?in|log[ -]?in|登录|登入)$/i.test(text)) return 'login';
    if (doc.querySelector('input[type=password]') && /^(sign[ -]?in|log[ -]?in|登录|登入)/i.test(title)) return 'login';
}
export function gateMessage(gate: 'verification' | 'login' | 'transport') {
    if (gate === 'transport') return '网络中间层返回了连接错误，没有获取到文章正文';
    return gate === 'login' ? '网站要求登录，当前仅能订阅公开可读内容' : '网站返回了人机验证页面，请先在浏览器完成验证；当前没有获取到文章';
}
