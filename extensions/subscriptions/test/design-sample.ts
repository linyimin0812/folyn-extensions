import type { Subscriptions } from '../src/service';
import type { harness } from './helpers';
import { feed } from './fixtures';

// Fictional reading data, only used by the explicitly labelled memory preview.
export async function seedDesignSample(service: Subscriptions, demo: ReturnType<typeof harness>) {
    const sources = [
        { name: '工程手记', group: '工程', titles: ['把异步任务绑定到正确的 Vault', 'Designing durable state for local-first applications', '文件保存为什么需要原子创建', '让缓存失效成为可观察的状态'], summaries: ['从会话快照、任务归属到迟到结果，梳理多工作区应用的数据边界。', 'A practical guide to identity, persistence, and predictable recovery.', '保护用户编辑：并发写入、重复保存与附件目录的处理。', '缓存版本、部分离线与错误恢复，应该如何一起设计。'] },
        { name: 'Web Platform', group: '前端', titles: ['Container queries in production', '更小的界面，更清楚的信息层次', 'A closer look at the native dialog element', 'Reading tables and code on narrow screens'], summaries: ['Why available component width matters more than the viewport.', '用对齐、字重与局部留白组织高密度阅读工具。', 'Focus management, top-layer rendering, and predictable dismissal.', 'Keep long technical content readable without expanding the page.'] },
        { name: '系统设计周刊', group: '工程', titles: ['重新理解后台任务的生命周期', 'When a refresh should not move the current article', '从内容地址到稳定的文章标识', '边界清楚的模块，才能可靠地恢复'], summaries: ['关闭页面、切换工作区和重启应用，分别应该发生什么。', 'Preserve reading context while new entries arrive in the background.', '跟踪参数、重定向与多来源归属中的去重策略。', '把元信息、缓存和正式文档分开管理，让故障可恢复。'] },
    ];
    const body = `<!doctype html><html><head><title>把异步任务绑定到正确的 Vault</title></head><body><article>
    <h1>把异步任务绑定到正确的 Vault</h1>
    <p>在支持多个工作区的应用里，切换 Vault 看起来只是一次界面导航。但正在下载的正文、等待返回的翻译，以及尚未完成的文件保存，都有各自的生命周期。它们需要记住自己从哪里开始，也需要知道结果应该写回哪里。</p>
    <h2>先捕获会话，再启动任务</h2>
    <p>任务开始时捕获所属 Vault 的会话，后续读取和写入都通过这份会话完成。当前界面可以切换，任务的归属保持稳定；结果到达后，也只更新它对应的文章与缓存。</p>
    <pre><code class="language-ts">const session = subscriptions.current();
const article = await fetchArticle(url);

// Write through the captured session.
await session.createText(path, article.markdown);</code></pre>
    <h2>三个边界，对应三种职责</h2>
    <table><thead><tr><th>数据</th><th>职责</th><th>更新方式</th></tr></thead><tbody><tr><td>文章元信息</td><td>来源、已读、收藏</td><td>序列化写入</td></tr><tr><td>阅读缓存</td><td>正文、图片、译文</td><td>按版本保存</td></tr><tr><td>正式文档</td><td>用户可编辑的 Markdown</td><td>原子创建</td></tr></tbody></table>
    <p>缓存可以被清理，正式文档需要继续存在。把这两种生命周期分开，用户才能放心整理阅读数据，而不用担心自己的编辑或附件被一起移除。</p>
    <h2>切换之后，保留阅读上下文</h2>
    <p>返回原 Vault 时，先等待该会话已有写入完成，再恢复已保存的状态。刷新列表时保持当前文章与滚动位置，让新内容通过明确的提示进入列表，阅读过程就不会被后台更新打断。</p>
    <ul><li>结果只写回任务所属的工作区。</li><li>同一篇文章的下载与翻译任务复用。</li><li>失败保留旧缓存，并提供明确的重试入口。</li></ul>
    <p>这些约束可以通过独立的会话和清晰的数据接口表达。相比在每一个调用点判断当前工作区，稳定的归属让异步行为更容易测试，也让错误恢复保持可预测。</p>
    </article></body></html>`;
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const feedUrl = `https://example.com/design-${i}.xml`;
        // Use the real feed parser and add flow, then apply fictional editorial metadata.
        demo.routes.set(feedUrl, feed(4).replaceAll('/blog/article-', `/blog/source-${i}/article-`));
        const c = (await service.discover(feedUrl))[0];
        c.entries.forEach((entry, j) => {
            entry.title = source.titles[j];
            entry.summary = source.summaries[j];
            entry.published = new Date(Date.UTC(2026, 9, 17, 10, 0) - (j * 3 + i) * 3600000).toISOString();
            demo.routes.set(entry.url, body);
        });
        await service.add(c, source.name, [source.group], 20, 0, false, await service.preview(c));
    }
    const repo = service.repo!;
    // Adding finishes after the index/text commit; sample assets are separate work.
    // Keep the visual fixture deterministic before the preview swaps runtimes.
    await Promise.all(repo.state.sources.map(source => {
        const first = repo.state.articles.find(article => article.sourceIds.includes(source.id));
        return first ? service.loadBody(first) : Promise.resolve();
    }));
    repo.state.articles.forEach((a, i) => { a.read = i % 3 === 1; a.starred = i % 5 === 1; });
    repo.state.settings.autoRead = false;
    repo.state.ui.view = 'all';
    repo.state.ui.selected = repo.state.articles[0].id;
    await service.persist(repo);
}
