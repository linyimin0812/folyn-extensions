import React from 'react';
import { createRoot } from 'react-dom/client';
import { Subscriptions } from '../src/service';
import { setRuntime, SubscriptionsPage } from '../src/workspace';
import { harness } from './helpers';
import { seedDesignSample } from './design-sample';
import { article as articleFixture, feed as feedFixture } from './fixtures';
import websiteCodeFixture from './fixtures/claude-typescript-code.html?raw';
import csguideHome from './fixtures/csguide-home.html?raw';
import csguideMap from './fixtures/csguide-sitemap.xml?raw';
import csguideArticle from './fixtures/csguide-article.html?raw';
import csguideRoadmap from './fixtures/csguide-roadmap.html?raw';
const demo = harness();
// Test-only entry: the horizontal parent matches Folyn App.tsx's extension page.
// ?bundle renders the packaged trusted module with the host's React singleton.
const service = new Subscriptions(demo.host);
const display = document.getElementById('root')!;
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') === 'dark' ? 'dark' : 'light';
if (params.has('experience')) {
    demo.routes.set('https://example.com/slow-images.xml', feedFixture(2).replace('Engineering Notes', '慢图片验收源').replaceAll('/blog/article-', '/experience-slow/article-'));
    for (let i = 1; i <= 2; i++) demo.routes.set(`https://example.com/experience-slow/article-${i}`, articleFixture('慢图片不会拖住添加流程', Array.from({ length: 4 }, (_, index) => `<p><img src="https://example.com/experience-slow/image-${index}.png" alt="慢图 ${index + 1}"></p>`).join('')));
    const fetch = demo.host.support.fetch.bind(demo.host.support);
    demo.host.support.fetch = async (url, binary) => {
        if (binary && url.includes('/experience-slow/image-')) await new Promise(resolve => setTimeout(resolve, 4500));
        return fetch(url, binary);
    };
}
if (params.has('csguide')) {
    demo.routes.set('https://csguide.cn/', csguideHome);
    demo.routes.set('https://csguide.cn/robots.txt', 'Sitemap: https://csguide.cn/sitemap.xml');
    demo.routes.set('https://csguide.cn/sitemap.xml', csguideMap);
    demo.routes.set('https://csguide.cn/roadmap/', csguideRoadmap);
    demo.routes.set('https://csguide.cn/aboutme/make_money_labs.html', csguideArticle);
    document.getElementById('testbar')?.append(' · CSGuide公开页面捕获夹具');
}
// Test-only dynamic-site fallback. Public network/native renderer are verified
// separately; this fixture exercises the production bundle's add/import UI.
if (params.has('acquisition')) {
    const fetch = demo.host.support.fetch.bind(demo.host.support);
    demo.host.support.fetch = async (url, binary) => url.startsWith('https://dynamic.example.org/')
        ? { url, status: 200, headers: {}, body: '<html><head><title>动态博客</title></head><body><main id="app"></main><script src="/app.js"></script></body></html>' }
        : fetch(url, binary);
    demo.host.support.render = async url => {
        await new Promise(resolve => setTimeout(resolve, 500));
        const content = url === 'https://dynamic.example.org/'
            ? '<article><a href="/posts/first"><h2>动态页面也能成为订阅来源</h2></a></article><article><a href="/posts/second"><h2>从网站发现文章到离线阅读</h2></a></article>'
            : '<article><h1>动态页面也能成为订阅来源</h1><p>这个演示页面的初始响应只有应用容器。文章列表与正文在脚本执行后出现，订阅插件会在静态读取无结果时自动请求动态渲染，再提取可阅读内容。</p><h2>保留熟悉的阅读体验</h2><p>识别后的文章沿用现有分组、未读、收藏、全文翻译和保存到 Vault 的流程。此处使用模拟渲染响应与内存 Vault，用于验证界面交互。</p></article>';
        return { url, status: 200, headers: { 'x-folyn-rendered': 'true' }, body: `<html><head><title>动态博客</title></head><body><main>${content}</main></body></html>` };
    };
    document.getElementById('testbar')?.append(' · 动态网站模拟响应');
}
demo.host.api.ai.pairs = async () => [
    { provider: 'mock', model: 'test', label: '演示模型' },
    { provider: 'mock', model: 'test-fast', label: '演示模型' },
];
Object.assign(demo.host.api.env, { theme: params.get('theme') === 'dark' ? 'dark' : 'light' });
void service.start().then(async () => {
    if (params.has('learning')) {
        demo.first.files.set('Notes/学习方法.md', '# 学习方法\n\n先用自己的话解释，再通过小实验验证理解。');
        document.getElementById('testbar')?.append(' · 正式伴读 UI / 模拟 AI 与笔记接口 / 内存 Vault');
    }
    if (params.has('sample')) {
        await seedDesignSample(service, demo);
    }
    if (params.has('experience')) {
        const repo = service.repo!, original = repo.state.articles[0], body = original && await repo.body(original);
        if (original && body) {
            for (let index = repo.state.articles.length; index < 55; index++) {
                const next = { ...structuredClone(original), id: `experience-${index + 1}`, title: `连续阅读第 ${index + 1} 篇`, url: `https://example.com/blog/experience/article-${index + 1}`, published: new Date(Date.UTC(2026, 9, 17, 10) - index * 3600000).toISOString(), read: false, starred: false, saved: [], positions: {} };
                repo.state.articles.push(next);
                await repo.putBody({ ...structuredClone(body), articleId: next.id });
                demo.routes.set(next.url, `<html><article>${body.html}</article></html>`);
            }
        }
        await repo.persist();
        const inject = document.createElement('button'); inject.textContent = '模拟下次提交写入失败';
        const write = demo.first.vault.data.writeText.bind(demo.first.vault.data);
        let failNext = false;
        demo.first.vault.data.writeText = async (path, value) => {
            if (failNext && path.endsWith('/state.json')) { failNext = false; inject.textContent = '已触发模拟写入失败'; throw new Error('模拟 Vault 写入失败，请重试'); }
            return write(path, value);
        };
        inject.addEventListener('click', () => { failNext = true; inject.textContent = '已准备：下次提交失败'; });
        document.getElementById('testbar')?.append(' · 体验回归：55篇/可控写入故障 ', inject);
    }
    if (params.has('tablelayout')) {
        const repo = service.repo!, article = repo.state.articles[0], body = await repo.body(article);
        if (body) {
            const columns = Array.from({ length: 30 }, (_, index) => index + 1);
            const html = `<h2>宽表横向滚动验收</h2><table><thead><tr>${columns.map(index => `<th>字段${index}</th>`).join('')}</tr></thead><tbody><tr>${columns.map(index => `<td>内容${index}</td>`).join('')}</tr></tbody></table>`;
            body.blocks.push({ id: 'wide-table-fixture', html });
            body.html = body.blocks.map(block => block.html).join('\n');
            await repo.putBody(body);
        }
    }
    if (params.has('code')) {
        const repo = service.repo!, article = repo.state.articles[0];
        const body = article && await repo.body(article);
        if (body) {
            // Keep the source-site markup to exercise old-cache display repair.
            body.blocks.unshift({ id: 'website-code', html: websiteCodeFixture });
            body.html = body.blocks.map(block => block.html).join('\n');
            await repo.putBody(body);
        }
    }
    if (params.has('imagecache')) {
        const repo = service.repo!, article = repo.state.articles[0], body = await repo.body(article);
        if (body) {
            article.title = '图多文章的缓存状态与失败重试';
            body.images = Array.from({ length: 32 }, (_, i) => ({ url: `https://example.com/many-photo-${i}.png`, ...(i >= 1 && i <= 3 ? { error: i === 3 ? '网页获取失败（HTTP 403）' : '旧版缓存限制或网络超时' } : { path: `subscriptions/images/preview-${i}.png`, bytes: 20 }) }));
            for (const image of body.images) if (image.path) demo.first.dataFiles.set(image.path, new Uint8Array(20));
            body.blocks = [{ id: 'images-intro', html: '<p>图片缓存会显示已缓存数与正文识别总数。没有缓存成功的图片保留原图入口，重试时复用已有缓存。</p>' }, ...body.images.map((image, i) => ({ id: `image-${i}`, html: `<p><img src="${image.url}" alt="示例图片 ${i + 1}"></p>` }))];
            body.html = body.blocks.map(block => block.html).join('\n');
            article.cache = { version: body.version, images: 32, missing: 3, unsupported: false, pending: false };
            await repo.putBody(body); await repo.persist();
            const asset = demo.first.vault.data.assetUrl;
            demo.first.vault.data.assetUrl = async value => value.startsWith(`subscriptions/images/`) ? `${location.origin}/test/fixtures/${params.has('longimage') ? 'reader-long-image.svg' : 'stream-image.svg'}` : asset(value);
            const fetch = demo.host.support.fetch;
            demo.host.support.fetch = async (url, binary) => {
                if (binary && url.includes('/many-photo-')) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                    if (url.endsWith('many-photo-3.png')) throw new Error('网页获取失败（HTTP 403）');
                }
                return fetch(url, binary);
            };
        }
    }
    // Optional browser regression fixture for image identity and load stability.
    if (params.has('image')) {
        const repo = service.repo!, article = repo.state.articles[0];
        if (article) {
            const body = (await repo.body(article))!;
            const url = 'https://example.com/stream-image.png', path = 'subscriptions/images/stream-image.png';
            body.blocks.unshift({ id: 'stream-image', html: `<p><img src="${url}" alt="Cached article image"></p>` });
            body.images = [{ url, path }]; body.html = body.blocks.map(block => block.html).join('\n');
            await repo.putBody(body);
            if (article.cache) article.cache.images = 1;
            const asset = demo.first.vault.data.assetUrl;
            demo.first.vault.data.assetUrl = async value => value === path ? `${location.origin}/test/fixtures/${params.has('longimage') ? 'reader-long-image.svg' : 'stream-image.svg'}` : asset(value);
            await repo.persist();
            const proof = document.createElement('span'); proof.id = 'image-proof';
            document.getElementById('testbar')?.append(proof);
            let loads = 0, replacements = 0;
            const show = () => { proof.textContent = ` · 译文图片加载 ${loads} 次 · 重建 ${replacements} 次`; };
            show();
            document.addEventListener('load', event => {
                if (event.target instanceof HTMLImageElement && event.target.closest('.document-result')) { loads++; show(); }
            }, true);
            new MutationObserver(records => {
                let removed = 0;
                for (const record of records) if (record.target instanceof Element && record.target.closest('.document-result'))
                    for (const node of record.removedNodes) if (node instanceof Element) removed += Number(node.matches('img')) + node.querySelectorAll('img').length;
                if (removed) { replacements += removed; show(); }
            }).observe(display, { childList: true, subtree: true });
        }
    }
    // Test-only latency, applied after seeding so pending UI can be inspected without real network calls.
    const latency = Math.max(0, Math.min(5000, Number(params.get('latency')) || 0));
    if (latency) {
        const fetch = demo.host.support.fetch.bind(demo.host.support);
        demo.host.support.fetch = async (...args) => {
            await new Promise(resolve => setTimeout(resolve, latency));
            return fetch(...args);
        };
    }
    // Test-only streaming simulator; it never enters the extension bundle.
    if (params.has('stream')) {
        const chat = demo.host.api.ai.chat.bind(demo.host.api.ai);
        demo.host.api.ai.chat = async request => {
            const events: Parameters<typeof request.onEvent>[0][] = [];
            await chat({ ...request, onEvent: event => events.push(event) });
            for (const event of events) {
                if (event.type !== 'text') { request.onEvent(event); continue; }
                const value = event.content || '';
                for (let offset = 0; offset < value.length; offset += 32) {
                    await new Promise(resolve => setTimeout(resolve, 180));
                    request.onEvent({ type: 'text', content: value.slice(offset, offset + 32) });
                }
            }
        };
    }
    let Page = SubscriptionsPage;
    if (params.has('bundle')) {
        await service.stop();
        Object.assign(window, { React });
        const { default: extension } = await import(/* @vite-ignore */ `/dist/index.js?build=${Date.now()}`);
        await extension.activate(demo.host.api, demo.host.ctx);
        Page = extension.pages.subscriptions;
    } else {
        setRuntime(service);
    }
    let LearningPrototype = () => null as React.ReactNode;
    if (params.has('learning-prototype') && import.meta.env.DEV) {
        LearningPrototype = (await import('./learning-prototype/prototype')).LearningPrototype;
    }
    createRoot(display).render(<>
        <aside id="activity-bar" aria-label="模拟宿主活动栏"><span>▱</span><span>⌁</span><span>◔</span></aside>
        <Page />
        <LearningPrototype />
    </>);
});
document.getElementById('vault-a')!.addEventListener('click', () => demo.switch(demo.first.vault));
document.getElementById('vault-b')!.addEventListener('click', () => demo.switch(demo.second.vault));
