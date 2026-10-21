import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Article, Body, Mode, Translation } from './model';
import { message, MODES } from './model';
import type { Subscriptions } from './service';
import { progress } from './translation';
import { safeName } from './urls';
import { Icon, Modal, ModalSection, Spinner } from './components';
import { SelectField } from './select';
export function SaveDialog({ service, article, body, translation, initialMode, onClose }: {
    service: Subscriptions;
    article: Article;
    body: Body;
    translation?: Translation;
    initialMode: Mode;
    onClose: () => void;
}) {
    useSyncExternalStore(service.subscribe, service.snapshot);
    const repo = useRef(service.repo!).current, draft = repo.state.saveDraft?.articleId === article.id ? repo.state.saveDraft : undefined;
    const [mode, setMode] = useState<Mode>(draft?.mode || initialMode), [dir, setDir] = useState(draft?.dir || repo.state.settings.saveDir), [name, setName] = useState(draft?.name || safeName(`${article.title}${initialMode === 'original' ? '' : ` · ${MODES[initialMode]}`}`)), [partial, setPartial] = useState(false), [remote, setRemote] = useState(false), [copy, setCopy] = useState(false), [busy, setBusy] = useState<'save' | 'images'>(), [error, setError] = useState(''), [saved, setSaved] = useState('');
    const [cachedBody, setCachedBody] = useState(body), [imageFeedback, setImageFeedback] = useState('');
    const mounted = useRef(true), inFlight = useRef<'save' | 'images'>();
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
    useEffect(() => { setCachedBody(body); }, [body]);
    const current = () => mounted.current && service.repo === repo && repo.state.articles.includes(article);
    const imageBusy = busy === 'images' || service.downloading.has(article.id);
    const working = !!busy || imageBusy || service.repo !== repo;
    const p = progress(cachedBody, translation, repo.state.settings.language);
    const missing = cachedBody.images.filter(i => !i.path);
    const imageCount = cachedBody.images.length, cachedCount = imageCount - missing.length;
    const processed = article.cache?.version === cachedBody.version ? article.cache.processed || 0 : cachedCount;
    const existing = article.saved.filter(s => s.mode === mode && !s.missing);
    const keepDraft = (data: Partial<{
        mode: Mode;
        dir: string;
        name: string;
    }>) => {
        if (!current()) return;
        repo.state.saveDraft = { articleId: article.id, mode, dir, name, ...data };
        void service.persist(repo);
    };
    async function open(path: string) {
        if (!current()) return;
        try {
            const exists = await repo.vault.exists(path);
            if (!current()) return;
            if (!exists) {
                article.saved.forEach(s => {
                    if (s.path === path)
                        s.missing = true;
                });
                await service.persist(repo);
                throw new Error('保存文件已移除，可以重新保存');
            }
            if (current()) await repo.vault.open(path);
        }
        catch (e) {
            if (current()) setError(message(e));
        }
    }
    async function repairImages() {
        if (!current() || inFlight.current || service.downloading.has(article.id)) return;
        inFlight.current = 'images'; setBusy('images'); setError(''); setImageFeedback('');
        try {
            if (cachedBody.version !== article.cache?.version) throw new Error('当前显示的是旧正文，请返回当前正文后补齐图片');
            const repaired = await service.retryImages(article);
            if (!current()) return;
            setCachedBody(repaired);
            const remaining = repaired.images.filter(image => !image.path).length;
            setImageFeedback(remaining ? `仍有 ${remaining} 张图片未缓存，可继续重试或保留远程链接。` : '补图完成，所有图片已缓存。');
        } catch (e) {
            if (current()) setError(message(e));
        } finally {
            inFlight.current = undefined;
            if (current()) setBusy(undefined);
        }
    }
    return <Modal title={saved ? '文档已保存' : '保存到 Vault'} size={saved ? 'compact' : 'default'} icon={saved ? 'check' : 'save'} description={article.title} note={`当前 Vault · ${repo.vault.name}`} onClose={() => { if (busy !== 'save') onClose(); }} footer={saved ? <>
        <button onClick={onClose}>留在阅读页</button>
        <button className="primary" onClick={() => void open(saved)}>打开文档</button>
        </> : <>
        <button disabled={busy === 'save'} onClick={onClose}>取消</button>
        <button className="primary" disabled={working} aria-busy={busy === 'save'} onClick={async () => {
            if (!current() || inFlight.current || service.downloading.has(article.id)) return;
            inFlight.current = 'save'; setBusy('save');
            setError('');
            try {
                const path = await service.save(article, cachedBody, mode, dir, name, partial, remote, copy);
                if (current()) setSaved(path);
            }
            catch (e) {
                if (current()) setError(message(e));
            }
            finally {
                inFlight.current = undefined;
                if (current()) setBusy(undefined);
            }
        }}>{busy === 'save' ? <><Spinner/>正在保存…</> : '保存 Markdown'}</button>
        </>}>
    <fieldset className="stack modal-sections source-settings" disabled={working}>{saved ? <>
        <h3>已保存到 {repo.vault.name}</h3>
        <p>{saved}</p>
        <p className="muted">文件和保存附件独立于订阅缓存，可以继续编辑。</p>
        </> : <>
        <ModalSection title="文档内容">
        <SelectField label="内容形式" value={mode} options={Object.entries(MODES).map(([value, label]) => ({value, label}))} onChange={value => {
            setMode(value as Mode);
            keepDraft({ mode: value as Mode });
            setPartial(false);
        }}/>{mode !== 'original' && p.done < p.total && <div className="tip">
            <p>译文尚未完成。可以关闭浮层等待翻译完成，或切换为原文保存。</p>
            <label className="check">
            <input type="checkbox" checked={partial} onChange={e => setPartial(e.target.checked)}/>保存已返回译文，附上完整原文并注明</label>
            </div>}</ModalSection><ModalSection title="文件位置"><label className="field">目标目录<div className="row">
        <input className="grow" value={dir} onChange={e => {
            setDir(e.target.value);
            keepDraft({ dir: e.target.value });
        }} placeholder="Vault 内的相对目录"/>
        <button onClick={async () => {
            try {
                const path = await repo.vault.chooseDirectory();
                if (path && current() && !inFlight.current) {
                    setDir(path);
                    keepDraft({ dir: path });
                }
            }
            catch (e) {
                if (current()) setError(message(e));
            }
        }}>选择目录</button>
        </div>
        </label>
        <label className="field">文件名<input value={name} onChange={e => {
            setName(e.target.value);
            keepDraft({ name: e.target.value });
        }}/>
        <small>保存为普通 .md 文件；不覆盖已有文件。</small>
        </label>
        </ModalSection>
        <ModalSection title="附件与元信息">
        <div className="tip">
        <strong>图片 {cachedCount}/{imageCount} 张已缓存</strong>
        <p>已缓存图片将复制到文档旁的独立附件目录。</p>{missing.length > 0 && <>
            <p className="error">{missing.length} 张图片尚未缓存：</p>
            <ul>{missing.map(i => <li key={i.url}>
                <small>{i.url} · {i.error}</small>
                </li>)}</ul>
            <button disabled={working} aria-busy={imageBusy} onClick={() => void repairImages()}>{imageBusy ? <><Spinner/>正在补齐图片…</> : '重试获取缺失图片'}</button>
            <label className="check">
            <input type="checkbox" checked={remote} onChange={e => setRemote(e.target.checked)}/>保留缺失图片的远程链接后继续（需联网查看）</label>
            </>}</div><div className="source-action-feedback" role="status" aria-live="polite" aria-atomic="true" data-state={imageBusy ? 'loading' : imageFeedback ? missing.length ? 'info' : 'success' : undefined}>
            {imageBusy ? <><div className="source-action-message"><Spinner/><span>正在补齐图片 · 已处理 {processed}/{imageCount} 张</span></div><progress aria-label="图片补齐进度" value={processed} max={Math.max(1, imageCount)}/></> : imageFeedback && <div className="source-action-message"><Icon name={missing.length ? 'warning' : 'check'} size={14}/><span>{imageFeedback}</span></div>}
            </div>{existing.length > 0 && <div className="tip">
            <p>已有相同内容形式的文档：</p>{existing.map(s => <button key={s.path} onClick={() => void open(s.path)}>打开已有文档：{s.path}</button>)}<label className="check">
            <input type="checkbox" checked={copy} onChange={e => setCopy(e.target.checked)}/>另存副本，保留已有文件和用户编辑</label>
            </div>}<small>保留标题、来源链接、作者与发布时间（如有）、保存时间；翻译文档包含机器翻译说明。</small>
        </ModalSection>
        </>}<div role="status" className="error">{error}</div>
    </fieldset>
    </Modal>;
}
