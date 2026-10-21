import { isInGroup } from './groups';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Article, Source, View } from './model';
import type { Subscriptions } from './service';
import { styles } from './styles';
import { AddArticle } from './add-article';
import { AddSource } from './add-source';
import { Reader } from './reader';
import { ClearCache, GroupDialog, RemoveSource, Settings, SourceSettings } from './settings';
import { Empty, Icon, ModalMessagesContext } from './components';
import { ColumnResizer } from './column-resizer';
import { Messages } from './messages';
import { LearningPanel } from './learning-panel';
import type { LearningArticleInput, LearningMaterial, LearningTab } from './learning-model';
let runtime: Subscriptions | undefined;
let failure = '';
let version = 0;
const observers = new Set<() => void>();
export function setRuntime(service: Subscriptions | undefined, error = '') {
    runtime = service;
    failure = error;
    ++version;
    observers.forEach(f => f());
}
const watch = (fn: () => void) => {
    observers.add(fn);
    return () => {
        observers.delete(fn);
    };
};
export function SubscriptionsPage() {
    useSyncExternalStore(watch, () => version);
    return runtime ? <Workspace service={runtime}/> : <div className="fsub">
    <style>{styles}</style>
    <Empty title="订阅暂时不可用">{failure || '正在连接 Folyn…'}</Empty>
    </div>;
}
type Dialog = {
    kind: 'add';
    source?: Source;
} | {
    kind: 'article';
} | {
    kind: 'source';
    source: Source;
} | {
    kind: 'remove';
    source: Source;
} | {
    kind: 'settings';
} | {
    kind: 'clear';
    articles: Article[];
} | {
    kind: 'group';
    group?: string;
};
const views: {
    id: View;
    label: string;
    icon: 'inbox' | 'unread' | 'star' | 'save';
}[] = [{ id: 'all', label: '全部文章', icon: 'inbox' }, { id: 'unread', label: '未读', icon: 'unread' }, { id: 'starred', label: '收藏', icon: 'star' }, { id: 'saved', label: '已保存', icon: 'save' }];
function inView(article: Article, view: View) {
    if (view === 'unread')
        return !article.read;
    if (view === 'starred')
        return article.starred;
    if (view === 'saved')
        return article.saved.length > 0;
    if (view === 'retained')
        return !article.sourceIds.length;
    if (view.startsWith('source:'))
        return article.sourceIds.includes(view.slice(7));
    return true;
}
function Workspace({ service }: {
    service: Subscriptions;
}) {
    useSyncExternalStore(service.subscribe, service.snapshot);
    const repo = service.repo;
    const [theme, setTheme] = useState(service.host.api.env.theme);
    useEffect(() => {
        const d = service.host.api.env.onThemeChange(setTheme);
        return () => {
            void d.dispose();
        };
    }, []);
    return <ModalMessagesContext.Provider value={<Messages service={service} embedded/>}><div className={`fsub ${theme === 'dark' ? 'dark' : ''}`}>
    <style>{styles}</style>{repo ? <VaultWorkspace key={repo.vault.id} service={service}/> : <>
        <Empty title={service.error ? '订阅数据暂时无法读取' : service.loading ? '正在恢复当前 Vault 的订阅…' : '打开一个 Vault 后开始订阅'} action={<button className="primary" onClick={() => service.host.support.openVaults()}>打开 Vault</button>}>{service.error || '来源、文章与阅读进度按 Vault 独立保存。'}</Empty>
        </>}</div></ModalMessagesContext.Provider>;
}
function VaultWorkspace({ service }: {
    service: Subscriptions;
}) {
    const repo = service.repo!, state = repo.state, ui = state.ui;
    const [dialog, setDialog] = useState<Dialog>(), [articleOpen, setArticleOpen] = useState(false), [accepted, setAccepted] = useState(0), [limit, setLimit] = useState(40), [selected, setSelected] = useState<Set<string>>(new Set()), [searchBody, setSearchBody] = useState<Map<string, string>>(new Map()), [fetching, setFetching] = useState(false);
    const container = useRef<HTMLDivElement>(null);
    const learning = service.learning;
    const [learningOpen, setLearningOpen] = useState(false), [workspaceWidth, setWorkspaceWidth] = useState(0);
    const [reading, setReading] = useState<LearningArticleInput>();
    const [noteFocusRequest, setNoteFocusRequest] = useState(0);
    const [reference, setReference] = useState<{ articleId: string; quote?: string; version?: string; serial: number }>();
    const receiveReading = useCallback((input: LearningArticleInput) => {
        setReading(input);
        if (learningOpen && learning && !learning.active) {
            try { learning.start(input); } catch (error) { service.notify(String(error), 'error'); }
        }
    }, [learning, learningOpen]);
    const closeLearning = useCallback(() => {
        setLearningOpen(false); setNoteFocusRequest(0);
        requestAnimationFrame(() => container.current?.querySelector<HTMLElement>('[data-learning-trigger]')?.focus({ preventScroll: true }));
    }, []);
    const beginLearning = (input: LearningArticleInput, tab: LearningTab) => {
        try {
            const activeRecord = learning?.active;
            const previous = activeRecord?.materials.some(material => material.articleId === input.articleId) ? activeRecord : learning?.state.records.filter(record => record.materials.some(material => material.articleId === input.articleId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            // Reopening an article continues its last page; a selected quote is an explicit new action.
            const nextTab = !input.quote && tab === 'chat' && previous ? previous.tab : tab;
            learning?.start(input, nextTab);
            if (learning && input.quote && tab === 'notes') setNoteFocusRequest(value => value + 1);
            else setNoteFocusRequest(0);
            setLearningOpen(true); setArticleOpen(true);
        }
        catch (error) { service.notify(String(error), 'error'); }
    };
    const learningOverlay = workspaceWidth > 0 && workspaceWidth <= 1000;

    const articleButtons = useRef(new Map<string, HTMLButtonElement>());
    const [keyboardTarget, setKeyboardTarget] = useState<{ id: string }>();
    const [compact, setCompact] = useState(false), [single, setSingle] = useState(false);
    useLayoutEffect(() => {
        const element = container.current!;
        const measure = () => {
            setWorkspaceWidth(element.clientWidth);
            setCompact(element.clientWidth <= 1100);
            setSingle(element.clientWidth <= 800);
            // Keep an active reader dialog and its focus target visible when
            // resizing from the split layout to a single pane.
            if (element.clientWidth <= 800 && element.querySelector('.reader dialog[open]')) setArticleOpen(true);
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const compactSources = compact || (learningOpen && !learningOverlay && workspaceWidth < 1500);
    const sourceCollapsed = !!ui.navCollapsed || (compactSources && !ui.navOpen);
    const listCollapsed = !!ui.listCollapsed || (single && articleOpen);
    useLayoutEffect(() => {
        if (!keyboardTarget) return;
        if (!listCollapsed) {
            const button = articleButtons.current.get(keyboardTarget.id);
            button?.focus({ preventScroll: true });
            button?.scrollIntoView?.({ block: 'nearest' });
        }
        setKeyboardTarget(undefined);
    }, [keyboardTarget, listCollapsed, limit]);
    const toggleSources = () => {
        if (sourceCollapsed) {
            ui.navCollapsed = false;
            ui.navOpen = compactSources;
        } else if (compactSources) {
            ui.navOpen = false;
        } else {
            ui.navCollapsed = true;
        }
        void service.persist(repo);
    };
    const toggleList = () => {
        ui.listCollapsed = true;
        setArticleOpen(true);
        const sourceToggle = container.current?.querySelector<HTMLElement>('#fsub-sources [aria-controls="fsub-source-content"]');
        (sourceCollapsed ? sourceToggle : container.current?.querySelector<HTMLElement>('#fsub-sources .navitem.active') || sourceToggle)?.focus();
        void service.persist(repo);
    };
    const source = ui.view.startsWith('source:') ? state.sources.find(s => s.id === ui.view.slice(7)) : undefined;
    const title = source?.name || (ui.view.startsWith('group:') ? ui.view.slice(6) : views.find(v => v.id === ui.view)?.label) || '保留文章';
    const matches = (a: Article) => {
        if (ui.view.startsWith('group:')) {
            if (!isInGroup(a, state.sources, ui.view.slice(6)))
                return false;
        }
        else if (!inView(a, ui.view))
            return false;
        const query = ui.query.toLocaleLowerCase().trim();
        return !query || [a.title, a.summary, a.author, ...a.sourceIds.map(id => state.sources.find(s => s.id === id)?.name), searchBody.get(a.id)].join(' ').toLocaleLowerCase().includes(query);
    };
    const current = state.articles.filter(matches);
    // Apply explicit group edits immediately; keep background arrivals pending until accepted.
    const groupMembership = ui.view.startsWith('group:') ? state.sources.map(source => `${source.id}:${source.groups.includes(ui.view.slice(6))}`).join('|') : '';
    const membership = useMemo(() => new Set(current.map(a => a.id)), [repo, ui.view, ui.query, ui.ascending, accepted, searchBody, groupMembership]);
    const articles = state.articles.filter(a => membership.has(a.id)).sort((a, b) => ((Date.parse(a.published || a.discovered) - Date.parse(b.published || b.discovered)) * (ui.ascending ? 1 : -1)) || a.id.localeCompare(b.id));
    const newCount = current.filter(a => !membership.has(a.id)).length;
    const article = state.articles.find(a => a.id === ui.selected);
    const update = () => void service.persist(repo);
    const showLearningSource = (material: LearningMaterial) => {
        if (material.kind === 'note' && material.path) {
            void learning?.openNote(material.path).catch(error => service.notify(String(error), 'error'));
            return;
        }
        const sourceArticle = state.articles.find(item => item.id === material.articleId);
        if (!sourceArticle) { service.notify('原文章已移除，可在参考材料中查看保留的快照', 'info'); return; }
        ui.selected = sourceArticle.id; setArticleOpen(true);
        setReference({ articleId: sourceArticle.id, quote: material.quote, version: material.version, serial: Date.now() });
        if (material.version !== sourceArticle.cache?.version) service.notify('文章版本可能已更新，原引用仍保存在参考材料快照中', 'info');
        if (learningOverlay) closeLearning();
        update();
    };
    const chooseLearningArticle = () => {
        ui.listCollapsed = false; setArticleOpen(false);
        if (learningOverlay) setLearningOpen(false);
        update();
        requestAnimationFrame(() => (container.current?.querySelector<HTMLElement>('.article-card') || container.current?.querySelector<HTMLElement>('#fsub-search'))?.focus());
    };
    const learningPanel = learningOpen && learning ? <LearningPanel controller={learning} noteFocusRequest={noteFocusRequest} reading={reading?.articleId === ui.selected ? reading : undefined} onClose={closeLearning} onSource={showLearningSource} onChooseArticle={chooseLearningArticle} onNotify={text => { if (service.learning === learning) service.notify(text, 'success'); }}/> : null;
    const showReport = (action: string, rows: { name: string; added: number; error?: string }[]) => {
        if (service.repo !== repo) return;
        if (!rows.length) {
            service.notify(`${action}：没有产生结果`, 'info');
            return;
        }
        if (rows.length === 1) {
            const row = rows[0];
            if (row.error)
                service.notify(`${row.name}：${row.error}`, 'error');
            else
                service.notify(`${row.name}：${row.added ? `新增 ${row.added} 篇` : '无新文章'}`, row.added ? 'success' : 'info');
            return;
        }
        const added = rows.reduce((n, r) => n + r.added, 0), failed = rows.filter(r => r.error).length;
        service.notify(`${action}完成：新增 ${added} 篇${failed ? `，${failed} 个来源失败` : ''}`, failed ? 'error' : added ? 'success' : 'info');
    };
    const setView = (view: View) => {
        setKeyboardTarget(undefined);
        ui.view = view;
        ui.listCollapsed = false;
        setArticleOpen(false);
        ui.navOpen = false;
        if (compactSources && !sourceCollapsed) container.current?.querySelector<HTMLElement>('#fsub-sources [aria-controls="fsub-source-content"]')?.focus();
        setSelected(new Set());
        setLimit(40);
        setAccepted(n => n + 1);
        update();
    };
    useEffect(() => {
        if (!ui.query.trim()) {
            setSearchBody(new Map());
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            void Promise.all(state.articles.filter(a => a.cache).map(async (a) => [a.id, (await repo.body(a))?.text || ''] as const)).then(items => {
                if (!cancelled)
                    setSearchBody(new Map(items));
            }).catch(e => service.notify(String(e), 'error'));
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [ui.query, repo]);
    const clearSearch = () => {
        ui.query = '';
        setSearchBody(new Map());
        setLimit(40);
        setAccepted(n => n + 1);
        update();
        container.current?.querySelector<HTMLInputElement>('#fsub-search')?.focus();
    };
    async function refreshCurrent() {
        if (fetching) return;
        setFetching(true);
        service.report = [];
        try {
            if (source) await service.refresh(source);
            else await service.refreshAll();
            showReport(source ? '刷新来源' : '刷新全部', service.report);
        } finally { setFetching(false); }
    }
    const hasQuery = !!ui.query.trim();
    const emptyTitle = hasQuery ? '没有匹配当前搜索的文章' : ui.view === 'unread' ? '当前没有未读文章' : ui.view === 'starred' ? '还没有收藏文章' : ui.view === 'saved' ? '还没有保存的文章' : '这里还没有文章';
    const emptyDescription = hasQuery ? '可清空搜索后查看当前视图的文章。搜索仅覆盖当前 Vault 已获取的数据。'
        : !state.sources.length && !state.articles.length ? '添加你关注的博客，更新会出现在这里。'
        : ui.view === 'unread' ? '当前视图的文章均已读，可以继续浏览全部文章。'
        : ui.view === 'starred' ? '点击文章上的星标，将它留待稍后阅读。'
        : ui.view === 'saved' ? '阅读时使用「保存到 Vault」，保存的文章会出现在这里。'
        : '刷新订阅，获取来源中可发现的文章。';
    const emptyAction = hasQuery ? <button onClick={clearSearch}>清空搜索</button>
        : !state.sources.length && !state.articles.length ? <button onClick={() => setDialog({ kind: 'add' })}>添加来源</button>
        : ['unread', 'starred', 'saved'].includes(ui.view) ? <button onClick={() => setView('all')}>查看全部文章</button>
        : <button disabled={fetching} onClick={() => void refreshCurrent()}>刷新订阅</button>;
    const sourceRow = (s: Source) => <div className="source-row" key={s.id}>
    <button className={`navitem ${ui.view === `source:${s.id}` ? 'active' : ''}`} onClick={() => setView(`source:${s.id}`)}>
    <span className="ellipsis">{s.name}<small style={{ display: 'block' }}>{service.refreshing.has(s.id) ? '刷新中' : s.paused ? '已暂停' : s.error ? '需要处理' : ''}</small>
    </span>
    <span>{state.articles.filter(a => a.sourceIds.includes(s.id) && !a.read).length || ''}</span>
    </button>
    <button className="source-menu" aria-label={`${s.name} 的来源设置`} title="来源设置" onClick={() => setDialog({ kind: 'source', source: s })}><Icon name="more" size={14}/></button>
    </div>;
    async function markAll() {
        const ids = selected.size ? [...selected] : articles.map(a => a.id);
        if (!selected.size && !await service.host.ctx.ui.dialogs.confirm(`将「${title}」当前搜索范围的 ${ids.length} 篇文章标为已读？`))
            return;
        state.articles.forEach(a => {
            if (ids.includes(a.id))
                a.read = true;
        });
        setSelected(new Set());
        update();
    }
    const pick = (a: Article) => {
        service.readSuppressed.delete(a.id);
        ui.selected = a.id;
        setArticleOpen(true);
        update();
    };
    return <div ref={container} role="main" aria-label="订阅工作区" className={`grow ${articleOpen ? 'article-open' : ''}`} style={{ display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', '--nav-w': `${ui.navWidth}px`, '--list-w': `${ui.listWidth}px`, '--learning-w': `${ui.learningWidth || 370}px` } as React.CSSProperties}>
    <a href="#fsub-articles" className="sr-only" onFocus={e => {
        e.currentTarget.style.clipPath = 'none';
        e.currentTarget.style.position = 'static';
    }} onBlur={e => {
        e.currentTarget.style.clipPath = '';
        e.currentTarget.style.position = '';
    }}>跳转到文章列表</a>
    {service.error && <div className="banner" role="alert">{service.error}<button aria-label="关闭提示" onClick={() => {
        service.error = '';
        service.changed();
    }}>×</button></div>}
    <div className={`workspace ${compactSources && !sourceCollapsed ? 'nav-overlay' : ''} ${learningOpen && !learningOverlay ? 'with-learning' : ''}`}>
    <nav className={`nav ${sourceCollapsed ? 'collapsed' : ''}`} id="fsub-sources" aria-label="订阅来源与系统视图">
    <header className="pane-header source-header">
    <h2>订阅源</h2>
    <button className="icon-button" aria-label={sourceCollapsed ? '展开来源栏' : '收起来源栏'} title={sourceCollapsed ? '展开来源栏' : '收起来源栏'} aria-expanded={!sourceCollapsed} aria-controls="fsub-source-content" onClick={toggleSources}><Icon name="panel-left" size={15}/></button>
    <div className="source-header-actions">
    <button className="icon-button source-refresh" aria-label="刷新全部" title={service.refreshing.size ? '正在刷新' : '刷新全部'} aria-busy={service.refreshing.size > 0} disabled={service.refreshing.size > 0} onClick={() => void (async () => {
        service.report = [];
        await service.refreshAll();
        showReport('刷新全部', service.report);
    })()}><Icon name="refresh" size={14}/></button>
    <button className="icon-button source-add" aria-label="添加订阅" title="添加订阅" aria-haspopup="dialog" aria-expanded={dialog?.kind === 'add'} onClick={() => setDialog({ kind: 'add' })}><Icon name="plus" size={15}/></button>
    <button className="icon-button source-add-article" aria-label="添加单篇文章" title="添加单篇文章" aria-haspopup="dialog" aria-expanded={dialog?.kind === 'article'} onClick={() => setDialog({ kind: 'article' })}><Icon name="fetch" size={15}/></button>
    </div>
    </header>
    <div className="nav-content" id="fsub-source-content"><div className="system-views">{views.map(v => <button className={`navitem ${ui.view === v.id ? 'active' : ''}`} aria-label={v.label} aria-current={ui.view === v.id ? 'page' : undefined} title={`${v.label} · ${state.articles.filter(a => inView(a, v.id)).length} 篇`} key={v.id} onClick={() => setView(v.id)}>
        <span className="nav-label"><Icon name={v.icon} size={15}/><span className="nav-text">{v.label}</span></span>
        <span className="nav-count">{state.articles.filter(a => inView(a, v.id)).length}</span>
        </button>)}{state.articles.some(a => !a.sourceIds.length) && <button className={`navitem ${ui.view === 'retained' ? 'active' : ''}`} aria-label="保留文章" title="保留文章" aria-current={ui.view === 'retained' ? 'page' : undefined} onClick={() => setView('retained')}><span className="nav-label"><Icon name="folder" size={15}/><span className="nav-text">保留文章</span></span></button>}</div><div className="source-tree"><div className="row between section-label">
    <span>分组</span>
    <button className="icon-button" aria-label="创建分组" title="创建分组" onClick={() => setDialog({ kind: 'group' })}><Icon name="plus" size={14}/></button>
    </div>{state.groups.map(g => <div key={g}>
        <div className="group-heading">
        <button className="navitem group-title group-toggle" aria-label={`${state.collapsed.includes(g) ? '展开' : '收起'} ${g} 分组`} title={state.collapsed.includes(g) ? '展开分组' : '收起分组'} aria-expanded={!state.collapsed.includes(g)} aria-controls={`fsub-group-${encodeURIComponent(g)}`} onClick={() => {
            state.collapsed = state.collapsed.includes(g) ? state.collapsed.filter(x => x !== g) : [...state.collapsed, g];
            update();
        }}><Icon name="back" size={12}/><span className="ellipsis">{g}</span><span className="group-count" title={`${state.sources.filter(s => s.groups.includes(g)).length} 个订阅源`}>{state.sources.filter(s => s.groups.includes(g)).length}</span></button>
        <button className="source-menu" aria-label={`编辑分组 ${g}`} title="编辑分组" onClick={() => setDialog({ kind: 'group', group: g })}><Icon name="more" size={14}/></button>
        </div><div className="group-sources" id={`fsub-group-${encodeURIComponent(g)}`} hidden={state.collapsed.includes(g)}>
        {state.sources.filter(s => s.groups.includes(g)).map(sourceRow)}</div></div>)}{state.sources.some(s => !s.groups.length) && <div className="section-label">未分组</div>}{state.sources.filter(s => !s.groups.length).map(sourceRow)}{!state.sources.length && <p className="muted" style={{ padding: '8px' }}>添加你关注的博客，更新会出现在这里。</p>}</div></div><div className="nav-footer">
    <button className="navitem" aria-label="阅读与订阅设置" title="阅读与订阅设置" onClick={() => setDialog({ kind: 'settings' })}><span className="nav-label"><Icon name="settings" size={15}/><span className="nav-text">阅读与订阅设置</span></span></button>
    </div>
    </nav>
    <ColumnResizer className="nav-resizer" label="调整来源栏宽度" controls="fsub-sources" width={ui.navWidth} min={160} max={340} onChange={width => {
        ui.navWidth = width;
        container.current?.style.setProperty('--nav-w', `${width}px`);
    }} onCommit={() => { void repo.persist(); }}/>
    <section className={`list-pane ${listCollapsed ? 'collapsed' : ''}`} hidden={listCollapsed} aria-label="文章列表" id="fsub-articles">
    <header className="pane-header">
    <h2 title={title}>{title}</h2>
    <span className="muted pane-count">{articles.length} 篇</span>
    <button className="icon-button list-refresh" aria-label={source ? '刷新此来源' : '刷新全部订阅'} title={source ? '刷新此来源' : '刷新全部订阅'} aria-busy={fetching || !!source && service.refreshing.has(source.id)} disabled={fetching || !!source && service.refreshing.has(source.id)} onClick={() => void refreshCurrent()}><Icon name="refresh" size={15}/></button>
    <button className="icon-button" aria-label="收起文章列表" title="收起文章列表" aria-expanded="true" aria-controls="fsub-list-content" onClick={toggleList}><Icon name="panel-right" size={15}/></button>
    </header>
    <div className={`list-body ${fetching ? 'loading' : ''}`} id="fsub-list-content">
    <div className="list-head">
    <label className="sr-only" htmlFor="fsub-search">搜索当前视图文章</label>
    <div className="search-field"><Icon name="search" size={14}/><input id="fsub-search" type="search" value={ui.query} placeholder="搜索当前视图…" aria-describedby="fsub-search-scope" onChange={e => {
        ui.query = e.target.value;
        setLimit(40);
        update();
    }}/></div>
    <small id="fsub-search-scope" className="sr-only">搜索标题、来源、摘要与已缓存正文</small>
    </div>
    <div className="list-tools">
    <button onClick={() => {
        ui.ascending = !ui.ascending;
        setAccepted(n => n + 1);
        update();
    }}>{ui.ascending ? '最早在前' : '最新在前'}</button>
    <button disabled={!articles.length} onClick={() => void markAll()}>{selected.size ? `标记 ${selected.size} 篇已读` : '全部已读…'}</button>{selected.size > 0 && <button onClick={() => setDialog({ kind: 'clear', articles: articles.filter(a => selected.has(a.id)) })}>清理所选缓存</button>}{source && <button onClick={() => setDialog({ kind: 'source', source })}>来源设置</button>}</div>{newCount > 0 && <button onClick={() => setAccepted(n => n + 1)}>有 {newCount} 篇新文章，点击显示</button>}
    {source?.error && <div className="statusbox error">{source.error}<button onClick={() => setDialog({ kind: 'add', source })}>测试并重新配置</button>
        </div>}
    <div className="article-list">{articles.slice(0, limit).map((a, i) => <div key={a.id} className={`article-row ${a.read ? 'read' : ''} ${a.id === ui.selected ? 'selected' : ''}`}>
        <label className="article-select"><input type="checkbox" aria-label={`选择 ${a.title}`} checked={selected.has(a.id)} onChange={e => {
            const next = new Set(selected);
            if (e.target.checked)
                next.add(a.id);
            else
                next.delete(a.id);
            setSelected(next);
        }}/></label>
        <button className="article-card" ref={element => { if (element) articleButtons.current.set(a.id, element); else articleButtons.current.delete(a.id); }} title={a.title} aria-current={a.id === ui.selected ? 'true' : undefined} onClick={() => pick(a)} onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                const nextIndex = i + (e.key === 'ArrowDown' ? 1 : -1);
                const next = articles[nextIndex];
                if (next) {
                    if (nextIndex >= limit) setLimit(count => Math.max(count, Math.ceil((nextIndex + 1) / 40) * 40));
                    setKeyboardTarget({ id: next.id });
                    pick(next);
                }
            }
        }}>
        <small className="article-meta">
        <span className="article-origin"><span className="ellipsis">{a.sourceIds.map(s => state.sources.find(x => x.id === s)?.name).filter(Boolean).join('、') || '保留文章'}</span>{a.saved.length > 0 && <span className="meta-status" title="已保存"><Icon name="save" size={11}/><span className="sr-only">已保存</span></span>}{service.downloading.has(a.id) || a.cache?.pending ? <span className="meta-status" title="缓存中"><Icon name="refresh" size={11}/><span className="sr-only">缓存中</span></span> : a.cache && <span className="meta-status" title={a.cache.missing || a.cache.unsupported ? '部分离线' : '完整离线'}><Icon name={a.cache.missing || a.cache.unsupported ? 'unread' : 'check'} size={11}/><span className="sr-only">{a.cache.missing || a.cache.unsupported ? '部分离线' : '完整离线'}</span></span>}</span>
        <time dateTime={a.published || a.discovered} title={`${a.published ? '发布时间' : '发现时间'}：${new Date(a.published || a.discovered).toLocaleString()}`}>{new Date(a.published || a.discovered).toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' })}{!a.published && ' · 发现'}</time>
        </small>
        <span className="article-title">{!a.read && <span className="unread-dot" aria-label="未读"/>}{a.title}</span>{a.summary && <span className="article-summary">{a.summary}</span>}{a.contentError && <span className="article-flags error">正文获取待重试</span>}
        </button>
        <div className="article-actions">
        <button className="icon-button" aria-label={a.starred ? `取消收藏 ${a.title}` : `收藏 ${a.title}`} title={a.starred ? '取消收藏' : '收藏'} aria-pressed={a.starred} onClick={() => {
            a.starred = !a.starred;
            update();
        }}><Icon name="star" size={14}/></button>
        <button className="icon-button" aria-label={`${a.read ? '标为未读' : '标为已读'} ${a.title}`} title={a.read ? '标为未读' : '标为已读'} onClick={() => {
            a.read = !a.read;
            if (!a.read)
                service.readSuppressed.add(a.id);
            update();
        }}><Icon name={a.read ? 'unread' : 'check'} size={14}/></button>{a.saved.length > 0 && <button className="icon-button" aria-label={`查看已保存文档 ${a.title}`} title="查看已保存文档" onClick={() => {
            pick(a);
        }}><Icon name="save" size={14}/></button>}</div>
        </div>)}{articles.length > limit && <button style={{ margin: 16 }} onClick={() => setLimit(n => n + 40)}>显示更多（已显示 {limit}/{articles.length}）</button>}{!articles.length && <Empty title={emptyTitle} action={emptyAction}>{emptyDescription}</Empty>}</div>
    </div></section>
    <ColumnResizer className="list-resizer" label="调整文章列表宽度" controls="fsub-articles" width={ui.listWidth} min={245} max={520} onChange={width => {
        ui.listWidth = width;
        container.current?.style.setProperty('--list-w', `${width}px`);
    }} onCommit={() => { void repo.persist(); }}/>
    {article ? <Reader key={article.id} service={service} article={article} onBack={() => { ui.listCollapsed = false; setArticleOpen(false); update(); }} onClear={() => setDialog({ kind: 'clear', articles: [article] })} onLearn={beginLearning} onReading={receiveReading} reference={reference?.articleId === article.id ? reference : undefined}/> : <section className="reader">
        <Empty title="选择一篇文章开始阅读">原文、译文与双语自由切换。收藏留待稍后，保存为可编辑的 Markdown。</Empty>
        </section>}
    {learningPanel && !learningOverlay && <><ColumnResizer reverse className="learning-resizer" label="调整伴读栏宽度" controls="fsub-learning" width={ui.learningWidth || 370} min={300} max={520} onChange={width => { ui.learningWidth = width; container.current?.style.setProperty('--learning-w', `${width}px`); }} onCommit={() => { void service.persist(repo); }}/><div className="learning-slot">{learningPanel}</div></>}
    </div>
    {learningPanel && learningOverlay && <LearningOverlay onClose={closeLearning}>{learningPanel}</LearningOverlay>}
    {dialog?.kind === 'add' && <AddSource service={service} source={dialog.source} onClose={() => setDialog(undefined)}/>}{dialog?.kind === 'article' && <AddArticle service={service} onClose={() => setDialog(undefined)}/>}{dialog?.kind === 'source' && <SourceSettings service={service} source={dialog.source} onClose={() => setDialog(undefined)} onRecognize={() => setDialog({ kind: 'add', source: dialog.source })} onRemove={() => setDialog({ kind: 'remove', source: dialog.source })}/>}{dialog?.kind === 'remove' && <RemoveSource service={service} source={dialog.source} onClose={() => setDialog(undefined)}/>}{dialog?.kind === 'settings' && <Settings service={service} onClose={() => setDialog(undefined)} onClear={() => setDialog({ kind: 'clear', articles: state.articles })}/>}{dialog?.kind === 'clear' && <ClearCache service={service} articles={dialog.articles} onClose={() => setDialog(undefined)}/>}{dialog?.kind === 'group' && <GroupDialog service={service} group={dialog.group} onClose={() => setDialog(undefined)}/>}
    <Messages service={service}/>
  </div>;
}

function LearningOverlay({ children, onClose }: { children: React.ReactNode; onClose(): void }) {
    const dialog = useRef<HTMLDialogElement>(null);
    useLayoutEffect(() => {
        const element = dialog.current!, previous = document.activeElement as HTMLElement | null;
        element.showModal();
        return () => { element.close(); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
    }, []);
    return <dialog ref={dialog} className="learning-overlay" aria-label="并排伴读" onCancel={event => { event.preventDefault(); onClose(); }}>{children}</dialog>;
}
