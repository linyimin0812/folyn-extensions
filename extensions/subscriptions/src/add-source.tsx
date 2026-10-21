import { GroupPicker } from './group-picker';
import { useRef, useState } from 'react';
import type { Body, Candidate, Source } from './model';
import { message } from './model';
import type { Subscriptions } from './service';
import { bodyRanges, clean } from './parse';
import { inputUrl } from './urls';
import { Modal, ModalSection, SourceLink, Spinner } from './components';
import { SelectField, intervals } from './select';
export function AddSource({ service, source, onClose }: {
    service: Subscriptions;
    source?: Source;
    onClose: () => void;
}) {
    const repo = service.repo!;
    const [url, setUrl] = useState(source?.rule.url || '');
    const [sample, setSample] = useState(source?.rule.sample || '');
    const [assisted, setAssisted] = useState(!!source);
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [choice, setChoice] = useState(0);
    const [body, setBody] = useState<Body>();
    const [ranges, setRanges] = useState<ReturnType<typeof bodyRanges>>([]);
    const [selector, setSelector] = useState(source?.rule.bodySelector || '');
    const [name, setName] = useState(source?.name || '');
    const [groups, setGroups] = useState(source?.groups || []);
    const [interval, setInterval] = useState(source?.interval ?? repo.state.settings.interval);
    const [auto, setAuto] = useState(source?.autoDownload || false);
    const [count, setCount] = useState(20);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const token = useRef(0);
    const submitting = useRef(false);
    const invalid = useRef<HTMLInputElement>(null);
    const cancel = () => {
        if (submitting.current) return;
        ++token.current;
        onClose();
    };
    const candidate = candidates[choice];
    const invalidate = () => {
        ++token.current;
        setBusy('');
        setBody(undefined);
    };
    async function test(chosen?: Candidate) {
        const run = ++token.current;
        setError('');
        setBusy('正在查找订阅源与文章列表…');
        try {
            const all = chosen ? candidates : await service.discover(inputUrl(url), sample ? inputUrl(sample) : undefined);
            if (run !== token.current || service.repo !== repo)
                return;
            if (!all.length)
                throw new Error('没有发现可订阅文章。请核对网站地址，或提供文章列表和示例文章；登录与人机验证页面需要先在浏览器处理。');
            if (!chosen) {
                setCandidates(all);
                setChoice(0);
            }
            const c = chosen || all[0];
            setName(current => current || c.name);
            setBusy('正在提取示例文章，核对正文范围…');
            const sampleUrl = sample ? inputUrl(sample) : c.entries[0]?.url;
            if (!sampleUrl)
                throw new Error('该来源没有可预览的文章');
            const { body: extracted, ranges: detectedRanges } = await service.previewDetails(c, sampleUrl, selector || undefined);
            if (run !== token.current || service.repo !== repo)
                return;
            setRanges(detectedRanges);
            c.rule = { ...c.rule, sample: sampleUrl, bodySelector: selector || undefined };
            setBody(extracted);
        }
        catch (e) {
            if (run === token.current) {
                setBody(undefined);
                setError(message(e));
                setAssisted(true);
                invalid.current?.focus();
            }
        }
        finally {
            if (run === token.current)
                setBusy('');
        }
    }
    async function confirm() {
        if (!candidate || !body || service.repo !== repo || submitting.current)
            return;
        submitting.current = true;
        setBusy('正在保存订阅…');
        setError('');
        try {
            if (source) {
                await service.updateSource(source, { name: name.trim() || candidate.name, groups, interval, autoDownload: auto, paused: auto ? false : source.paused, url: candidate.rule.url }, candidate);
            }
            else
                await service.add(candidate, name, groups, Math.max(1, Math.min(100, count)), interval, auto, body);
            ++token.current;
            onClose();
        }
        catch (e) {
            setError(message(e));
            setBusy('');
        }
        finally { submitting.current = false; }
    }
    return <Modal size="source" title={source ? '重新识别来源' : '添加订阅'} icon="rss" description={source ? '验证新的文章范围，保留已有阅读记录' : '输入博客或网站地址，自动查找文章并预览'} note={`当前 Vault · ${repo.vault.name}`} onClose={cancel} footer={<>
        <button disabled={busy === '正在保存订阅…'} onClick={cancel}>取消</button><button className="primary" aria-busy={busy === '正在保存订阅…'} disabled={!body || !!busy} onClick={() => void confirm()}>{busy === '正在保存订阅…' ? '正在保存…' : source ? '保存已验证配置' : '订阅并导入'}</button></>}>
    <fieldset className="stack source-settings modal-sections" disabled={busy === '正在保存订阅…'}>
    <ModalSection title="订阅地址">
    <form onSubmit={e => {
        e.preventDefault();
        void test();
    }} className="stack">
    <label className="field">网站或文章列表地址<input ref={invalid} data-autofocus autoFocus value={url} onChange={e => {
        ++token.current;
        setUrl(e.target.value);
        setBody(undefined);
        setCandidates([]);
        setBusy('');
    }} placeholder="https://claude.dev/" required aria-invalid={!!error} aria-describedby="fsub-add-error"/>
    </label>
    {assisted && <>
        <label className="field">示例文章地址<input value={sample} onChange={e => {
            setSample(e.target.value);
            invalidate();
        }} placeholder="粘贴一篇属于该列表的文章链接"/>
        <small>通过真实文章确定订阅范围，无需填写 CSS 选择器。</small>
        </label>{ranges.length > 0 && <><SelectField label="正文范围" value={selector} options={[{ value: '', label: '自动识别正文' }, ...ranges.map(r => ({value:r.selector, label:`${r.label} · ${r.preview.slice(0,45)}…`}))]} onChange={value => {
                setSelector(value);
                invalidate();
            }}/>{selector && <div className="preview">
                <p>{ranges.find(r => r.selector === selector)?.preview}</p>
                </div>}</>}</>}
    <div className="row">
    <button className={`row recognition-submit ${body ? '' : 'primary'}`} disabled={!!busy} aria-busy={!!busy} type="submit">{busy && <Spinner/>}{busy || (assisted ? '测试识别' : '识别')}</button>
    <button type="button" onClick={() => setAssisted(!assisted)}>{assisted ? '收起辅助配置' : '辅助配置'}</button>
    </div>
    </form>
    <div id="fsub-add-error" className="error" role="status">{error}</div>
    </ModalSection>
    {candidates.length > 0 && <>
        <ModalSection title="文章范围">{candidates.map((c, i) => <label className={`candidate ${choice === i ? 'active' : ''}`} key={i}>
            <input type="radio" name="candidate" checked={choice === i} onChange={() => {
                invalidate();
                setChoice(i);
                setName(c.name);
                setSample('');
                setSelector('');
            }}/>
            <span className="grow">{c.name}<br />
            <small>{c.rule.kind === 'feed' ? '标准订阅源' : c.rule.kind === 'data' ? '网站文章数据' : c.rule.kind === 'sitemap' ? '网站地图 · 打开后补全标题' : '网站文章列表'} · {c.entries.length} 篇可发现文章</small>
            </span>
            </label>)}
    {candidate && <>
            <ol className="preview-list">{candidate.entries.slice(0, 8).map(e => <li key={e.url}>
                <SourceLink service={service} url={e.url}>{e.title}</SourceLink>
                <br />
                <small>{e.published ? new Date(e.published).toLocaleDateString() : '无发布时间'}</small>{assisted && <button onClick={() => {
                    setSample(e.url);
                    invalidate();
                }}>用作示例</button>}</li>)}</ol>
            <small>{candidate.note}</small>{!body && <button disabled={!!busy} onClick={() => void test(candidate)}>测试所选列表与示例正文</button>}</>}</ModalSection>
    {body && <ModalSection title="正文预览">
            <div className="preview prose" dangerouslySetInnerHTML={{ __html: clean(body.blocks.slice(0, 5).map(b => b.html).join('')) }}/>
            <small>核对正文是否完整；如混入导航或评论，请使用辅助配置调整。</small>
            </ModalSection>}
    </>}
            <ModalSection title="订阅偏好">
            <div className="split">
            <label className="field full-span">来源名称<input value={name} onChange={e => setName(e.target.value)} placeholder="识别后自动填写，也可自定义"/>
            </label>
            <GroupPicker options={repo.state.groups} value={groups} onChange={setGroups}/>
            <SelectField label="刷新间隔" value={String(interval)} options={intervals} onChange={value => setInterval(Number(value))}/>
            <label className="field">首次导入数量<input type="number" min="1" max="100" value={count} onChange={e => setCount(Number(e.target.value))}/>
            <small>{candidate ? `最多导入 ${Math.min(count, candidate.entries.length)} 篇当前可发现文章` : '识别后按可发现文章数量导入'}</small>
            </label>
            </div>
            <label className="check">
            <input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/>
            <span>自动下载后续新发现文章的正文与可缓存图片</span>
            </label>
            </ModalSection>
  </fieldset>
    </Modal>;
}
