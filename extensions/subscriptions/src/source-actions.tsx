import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Source } from './model';
import { message } from './model';
import type { Subscriptions } from './service';
import { Icon, ModalSection, Spinner } from './components';

type Action = 'refresh' | 'history' | 'download';
type Feedback = { status: 'success' | 'error' | 'info'; text: string };

export function SourceActions({ service, source, disabled, onBusyChange, onRecognize }: {
    service: Subscriptions; source: Source; disabled: boolean;
    onBusyChange(busy: boolean): void; onRecognize(): void;
}) {
    useSyncExternalStore(service.subscribe, service.snapshot);
    const repo = service.repo;
    const [action, setAction] = useState<Action>(), [feedback, setFeedback] = useState<Feedback>();
    const [progress, setProgress] = useState<{ done: number; total: number }>();
    const inFlight = useRef(false);
    const refreshing = service.refreshing.has(source.id);
    const working = !!action || refreshing;
    const blocked = disabled || working;
    const articles = repo?.state.articles.filter(article => article.sourceIds.includes(source.id)) || [];
    const pending = articles.filter(article => !article.cache || article.cache.pending || article.cache.missing > 0);
    useEffect(() => {
        onBusyChange(working);
        return () => onBusyChange(false);
    }, [working, onBusyChange]);
    useEffect(() => {
        if (refreshing && !action) setFeedback(undefined);
    }, [refreshing, action]);

    async function run(kind: Action) {
        if (!repo || !repo.state.sources.includes(source) || blocked || inFlight.current || service.refreshing.has(source.id)) return;
        inFlight.current = true;
        setAction(kind);
        setFeedback(undefined);
        setProgress(undefined);
        try {
            if (kind === 'download') {
                if (!pending.length) {
                    const interactive = articles.filter(article => article.cache?.unsupported).length;
                    setFeedback({ status: interactive ? 'info' : 'success', text: interactive ? `现有正文与可缓存图片已缓存；${interactive} 篇含交互内容，仍需查看原网页。` : '现有正文与可缓存图片已缓存，无需下载' });
                    return;
                }
                if (!await service.host.ctx.ui.dialogs.confirm(`下载此来源的 ${pending.length} 篇现有文章？`)) {
                    setFeedback({ status: 'info', text: '已取消下载' });
                    return;
                }
                let complete = 0, partial = 0, failed = 0;
                setProgress({ done: 0, total: pending.length });
                for (let index = 0; index < pending.length; index++) {
                    if (service.repo !== repo || !repo.state.sources.includes(source)) return;
                    try {
                        const article = pending[index], cached = await repo.body(article);
                        if (service.repo !== repo || !repo.state.sources.includes(source)) return;
                        const body = cached ? await service.retryImages(article) : await service.loadBody(article);
                        if (body.images.some(image => !image.path) || body.unsupported) partial++;
                        else complete++;
                    }
                    catch { failed++; }
                    if (service.repo !== repo || !repo.state.sources.includes(source)) return;
                    setProgress({ done: index + 1, total: pending.length });
                }
                setFeedback({
                    status: failed ? 'error' : partial ? 'info' : 'success',
                    text: partial || failed
                        ? `下载结束：完整缓存 ${complete} 篇${partial ? `，部分缓存 ${partial} 篇` : ''}${failed ? `，失败 ${failed} 篇` : ''}。缺失图片可继续重试，交互内容请查看原网页。`
                        : `下载完成：${complete} 篇文章已完整缓存`,
                });
            } else {
                const before = new Set(articles.map(article => article.id));
                await service.refresh(source, kind === 'history');
                if (service.repo !== repo || !repo.state.sources.includes(source)) return;
                // refresh records failures on the source instead of rejecting its promise.
                if (source.error) throw new Error(source.error);
                const added = repo.state.articles.filter(article => article.sourceIds.includes(source.id) && !before.has(article.id)).length;
                setFeedback({ status: 'success', text: `${kind === 'history' ? '历史加载完成' : '刷新完成'}：${added ? `新增 ${added} 篇文章` : '没有新增文章'}${source.paused ? '，来源仍保持暂停' : ''}` });
            }
        } catch (error) {
            if (service.repo === repo && repo.state.sources.includes(source)) setFeedback({ status: 'error', text: `${kind === 'download' ? '下载' : kind === 'history' ? '历史加载' : '刷新'}失败：${message(error)}` });
        } finally {
            inFlight.current = false;
            setAction(undefined);
        }
    }
    if (!repo || !repo.state.sources.includes(source)) return null;
    const loadingText = action === 'download' ? progress ? `正在下载现有文章 · 已处理 ${progress.done}/${progress.total} 篇` : '正在准备下载现有文章…' : action === 'history' ? '正在加载历史文章…' : '正在刷新订阅源…';
    return <ModalSection title="内容与缓存" aside={<span className="modal-badge">{articles.length} 篇文章</span>}>
        <div className="action-grid" aria-busy={working}>
            <button disabled={blocked} aria-busy={action === 'refresh'} onClick={() => void run('refresh')}>{action === 'refresh' ? <Spinner/> : <Icon name="refresh" size={14}/>}立即刷新{source.paused ? '（保持暂停）' : ''}</button>
            <button disabled={blocked} aria-busy={action === 'history'} onClick={() => void run('history')}>{action === 'history' ? <Spinner/> : <Icon name="inbox" size={14}/>}加载更多历史文章</button>
            <button disabled={blocked} aria-busy={action === 'download'} onClick={() => void run('download')}>{action === 'download' ? <Spinner/> : <Icon name="fetch" size={14}/>}下载现有文章（{action === 'download' && progress ? progress.total : pending.length} 篇）</button>
            <button disabled={blocked} onClick={onRecognize}><Icon name="search" size={14}/>重新识别与测试</button>
        </div>
        <div className="source-action-feedback" role="status" aria-live="polite" aria-atomic="true" data-state={working ? 'loading' : feedback?.status}>
            {working ? <><div className="source-action-message"><Spinner/><span>{loadingText}</span></div>{action === 'download' && progress && <progress aria-label="现有文章下载进度" value={progress.done} max={progress.total}/>}</> : feedback && <div className="source-action-message"><Icon name={feedback.status === 'error' ? 'warning' : feedback.status === 'info' ? 'close' : 'check'} size={14}/><span>{feedback.text}</span></div>}
        </div>
        <small>最近检查：{source.lastSuccess ? new Date(source.lastSuccess).toLocaleString() : '尚未检查'} · 历史最多回溯 3 页</small>
        {source.error && !feedback && !working && <p className="error">需要处理：{source.error}</p>}
    </ModalSection>;
}
