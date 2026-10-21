import { GroupPicker } from './group-picker';
import { renameGroup, removeGroup } from './groups';
import { useState } from 'react';
import type { Article, Source } from './model';
import { message, MODES, type Mode } from './model';
import type { Subscriptions } from './service';
import { Icon, Modal, ModalSection } from './components';
import { SelectField, intervals } from './select';
import { selectedLanguage, translationLanguages } from './languages';
import { SourceActions } from './source-actions';
import { sameModel, TranslationModelField, useTranslationModels } from './translation-model';
export function SourceSettings({ service, source, onClose, onRecognize, onRemove }: {
    service: Subscriptions;
    source: Source;
    onClose: () => void;
    onRecognize: () => void;
    onRemove: () => void;
}) {
    const repo = service.repo!;
    const [name, setName] = useState(source.name), [url, setUrl] = useState(source.rule.url), [groups, setGroups] = useState(source.groups), [interval, setInterval] = useState(source.interval ?? repo.state.settings.interval);
    const [policy, setPolicy] = useState(source.paused ? 'paused' : source.autoDownload ? 'download' : 'refresh');
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [actionBusy, setActionBusy] = useState(false);
    return <Modal title="订阅源设置" icon="rss" description={`管理「${source.name}」的内容与更新方式`} note={`当前 Vault · ${repo.vault.name}`} onClose={() => { if (!busy) onClose(); }} footer={<><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy || actionBusy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
            await service.updateSource(source, { name, url, groups, interval, autoDownload: policy === 'download', paused: policy === 'paused' });
            onClose();
        } catch (e) { setError(message(e)); }
        finally { setBusy(false); }
    }}>{busy ? '正在验证并保存…' : '保存设置'}</button></>}>
    <fieldset className="stack source-settings" disabled={busy}>
    <ModalSection title="来源信息">
    <div className="source-identity">
    <label className="field">名称<input value={name} onChange={e => setName(e.target.value)}/>
    </label>
    <label className="field">订阅网址<input type="url" value={url} onChange={e => setUrl(e.target.value)} aria-invalid={!!error} aria-describedby="source-settings-hint source-settings-error"/>
    </label></div>
    <small id="source-settings-hint">修改网址会重新验证来源与正文，已有文章和阅读记录继续保留。</small>
    <p id="source-settings-error" className="error" role="alert">{error}</p>
    </ModalSection>
    <ModalSection title="分组与更新">
    <GroupPicker options={repo.state.groups} value={groups} onChange={setGroups}/>
    <div className="split">
    <SelectField label="刷新间隔" value={String(interval)} options={intervals} onChange={value => setInterval(Number(value))} disabled={busy}/>
    <SelectField label="更新方式" value={policy} onChange={setPolicy} disabled={busy} options={[{ value: 'refresh', label: '仅刷新文章列表' }, { value: 'download', label: '自动下载新文章' }, { value: 'paused', label: '暂停自动刷新与下载' }]}/>
    </div>
    </ModalSection>
    <SourceActions service={service} source={source} disabled={busy} onBusyChange={setActionBusy} onRecognize={onRecognize}/>
    <div className="modal-danger-row"><div><strong>取消订阅</strong><small>可选择保留收藏与已保存文章</small></div><button className="danger-quiet" disabled={actionBusy} onClick={onRemove}>取消订阅…</button></div>
    </fieldset>
    </Modal>;
}
export function RemoveSource({ service, source, onClose }: {
    service: Subscriptions;
    source: Source;
    onClose: () => void;
}) {
    const [star, setStar] = useState(true), [saved, setSaved] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const articles = service.repo!.state.articles.filter(a => a.sourceIds.includes(source.id));
    return <Modal title="取消订阅" icon="warning" tone="danger" size="compact" description={source.name} onClose={() => { if (!busy) onClose(); }} footer={<>
        <button disabled={busy} onClick={onClose}>返回</button>
        <button className="danger" disabled={busy} aria-busy={busy} onClick={async () => {
            setBusy(true);
            try {
                await service.unsubscribe(source, star, saved);
                onClose();
            }
            catch (e) {
                setError(message(e));
            }
            finally {
                setBusy(false);
            }
        }}>{busy ? '正在取消订阅…' : '确认取消订阅'}</button>
        </>}>
    <div className="stack">
    <p className="modal-lead">选择要保留的文章。正式 Markdown 和保存附件继续保留，仍属于其他来源的文章不受影响。</p>
    <label className="check">
    <input type="checkbox" checked={star} onChange={e => setStar(e.target.checked)}/>保留收藏文章（{articles.filter(a => a.starred).length} 篇）</label>
    <label className="check">
    <input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)}/>保留已保存文档的文章记录（{articles.filter(a => a.saved.length).length} 篇）</label>
    <small>保留但失去来源的文章会进入「保留文章」，仅作用于当前 Vault。</small><p className="error" role="alert">{error}</p>
    </div>
    </Modal>;
}
export function ClearCache({ service, articles, onClose }: {
    service: Subscriptions;
    articles: Article[];
    onClose: () => void;
}) {
    const [star, setStar] = useState(false), [translation, setTranslation] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const repo = service.repo!;
    const eligible = articles.filter(a => star || !a.starred);
    return <Modal title="清理文章缓存" icon="trash" size="compact" description="释放缓存空间，保留文章与正式文档" onClose={() => { if (!busy) onClose(); }} footer={<>
        <button disabled={busy} onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={async () => {
            setBusy(true);
            try {
                if (service.downloading.size || service.translating.size)
                    throw new Error('请等待下载结束并取消翻译后再清理缓存');
                await service.clear(eligible, translation);
                service.changed();
                onClose();
            }
            catch (e) {
                setError(message(e));
            }
            finally {
                setBusy(false);
            }
        }}>{busy ? '正在清理…' : `清理 ${eligible.length} 篇缓存`}</button>
        </>}>
    <div className="stack">
    <div className="modal-callout"><strong>{eligible.length} 篇文章</strong><p>将清理正文与缓存图片，下次阅读时重新获取。标题、阅读状态和保存关系继续保留。</p></div>
    <label className="check">
    <input type="checkbox" checked={translation} onChange={e => setTranslation(e.target.checked)}/>同时清除翻译结果</label>
    <label className="check">
    <input type="checkbox" checked={star} onChange={e => setStar(e.target.checked)}/>同时清理收藏文章的缓存</label>
    <p className="error">{error}</p>
    </div>
    </Modal>;
}
export function Settings({ service, onClose, onClear }: {
    service: Subscriptions;
    onClose: () => void;
    onClear: () => void;
}) {
    const repo = service.repo!, s = repo.state.settings;
    const [interval, setInterval] = useState(s.interval), [auto, setAuto] = useState(s.autoRead), [mode, setMode] = useState(s.mode), [language, setLanguage] = useState(selectedLanguage(s.language)), [dir, setDir] = useState(s.saveDir);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const models = useTranslationModels(service);
    const [chosenModel, setChosenModel] = useState(s.pair);
    const selectedModel = chosenModel || models.pairs[0];
    return <Modal title="订阅设置" icon="settings" description="让阅读、更新与离线保存符合你的习惯" note={`当前 Vault · ${repo.vault.name}`} onClose={() => { if (!busy) onClose(); }} footer={<><button disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={busy} onClick={async () => {
        if (!translationLanguages.some(option => option.value === language)) {
            setError('请选择目标语言');
            return;
        }
        if (models.pairs.length && !models.pairs.some(pair => sameModel(pair, selectedModel))) {
            setError('请选择当前可用的翻译模型');
            return;
        }
        const before = structuredClone(s);
        setBusy(true); setError('');
        try {
            await service.commit(repo, () => {
                if (!sameModel(s.pair, selectedModel)) s.consent = undefined;
                Object.assign(s, { interval, autoRead: auto, mode, language: language.trim(), saveDir: dir, pair: selectedModel && { provider: selectedModel.provider, model: selectedModel.model } });
            }, () => { Object.keys(s).forEach(key => Reflect.deleteProperty(s, key)); Object.assign(s, before); });
            onClose();
        } catch (error) { setError(message(error)); }
        finally { setBusy(false); }
    }}>{busy ? '正在保存…' : '保存设置'}</button></>}>
    <fieldset className="stack source-settings modal-sections" disabled={busy}>
    <ModalSection title="阅读偏好">
    <div className="split">
    <SelectField label="默认阅读模式" value={mode} options={Object.entries(MODES).map(([value, label]) => ({value, label}))} onChange={value => setMode(value as Mode)}/>
    <SelectField label="目标语言" value={language} options={translationLanguages} onChange={setLanguage}/>
    </div>
    <label className="check">
    <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/>正文在前台展示 2 秒后自动标记已读</label>
    <TranslationModelField {...models} value={selectedModel} onChange={setChosenModel}/>
    <div className="modal-inline-row"><small>选择保存在当前 Vault，下一次翻译时使用</small><button className="quiet" onClick={() => service.host.support.openSettings()}>AI 模型配置<Icon name="external" size={13}/></button></div>
    </ModalSection>
    <ModalSection title="更新与保存">
    <SelectField label="默认刷新间隔" value={String(interval)} options={intervals} onChange={value => setInterval(Number(value))}/>
    <label className="field">默认保存目录<div className="row">
    <input className="grow" value={dir} onChange={e => setDir(e.target.value)} placeholder="选择 Vault 内的目录"/>
    <button onClick={async () => {
        try {
            const path = await repo.vault.chooseDirectory();
            if (path)
                setDir(path);
        }
        catch (e) {
            setError(message(e));
        }
    }}>选择目录</button>
    </div>
    </label>
    </ModalSection>
    <ModalSection title="离线缓存" aside={<button className="text-action" onClick={onClear}>管理与清理<Icon name="back" size={12}/></button>}>
    <div className="modal-stats">
    <div><strong>{(repo.state.articles.reduce((n, a) => n + (a.cache?.bytes || 0), 0) / 1024 / 1024).toFixed(1)}<em> MB</em></strong><span>缓存占用</span></div>
    <div><strong>{repo.state.articles.filter(a => a.cache).length}<em> 篇</em></strong><span>离线正文</span></div>
    <div><strong>{repo.state.articles.reduce((n, a) => n + (a.cache?.images || 0) - (a.cache?.missing || 0), 0)}<em> 张</em></strong><span>缓存图片</span></div>
    </div><small>图片数量不限，单张最多 8 MB，每篇图片合计最多 64 MB。图片未缓存或含动态嵌入内容的文章为部分离线，可在阅读页重试或查看原网页。</small>
    </ModalSection>
    <p className="error">{error}</p>
    </fieldset>
    </Modal>;
}
export function GroupDialog({ service, group, onClose }: {
    service: Subscriptions;
    group?: string;
    onClose: () => void;
}) {
    const [name, setName] = useState(group || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
    const repo = service.repo!;
    async function submit(change: () => void) {
        const before = { groups: [...repo.state.groups], collapsed: [...repo.state.collapsed], view: repo.state.ui.view, sources: repo.state.sources.map(source => ({ source, groups: [...source.groups] })) };
        setBusy(true); setError('');
        try {
            await service.commit(repo, change, () => {
                repo.state.groups = before.groups; repo.state.collapsed = before.collapsed; repo.state.ui.view = before.view;
                before.sources.forEach(({ source, groups }) => { source.groups = groups; });
            });
            onClose();
        } catch (error) { setError(message(error)); }
        finally { setBusy(false); }
    }
    return <Modal title={group ? '编辑分组' : '创建分组'} icon="folder" size="compact" description="按主题组织订阅，一个来源可以属于多个分组" onClose={() => { if (!busy) onClose(); }} footer={<>
        <button disabled={busy} onClick={onClose}>取消</button>
        <button className="primary" disabled={busy} onClick={() => {
            const value = name.trim();
            if (!value || (value !== group && repo.state.groups.includes(value))) {
                setError('请输入不重复的分组名称');
                return;
            }
            void submit(() => { if (group) renameGroup(repo.state, group, value); else repo.state.groups.push(value); });
        }}>{busy ? '正在保存…' : '保存分组'}</button>
        </>}>
    <fieldset className="stack source-settings" disabled={busy}>
    <label className="field">分组名称<input autoFocus value={name} onChange={e => setName(e.target.value)}/>
    </label>{group && <div className="modal-danger-row"><div><strong>删除分组</strong><small>保留订阅、文章及其他分组归属</small></div><button className="danger-quiet" onClick={() => { void submit(() => removeGroup(repo.state, group)); }}>删除分组</button></div>}<p className="error" role="alert">{error}</p>
    </fieldset>
    </Modal>;
}
