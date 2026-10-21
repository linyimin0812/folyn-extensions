import { useRef, useState } from 'react';
import type { Body } from './model';
import { message } from './model';
import type { Subscriptions } from './service';
import { clean } from './parse';
import { Modal, ModalSection, Spinner } from './components';
export function AddArticle({ service, onClose }: {
    service: Subscriptions;
    onClose: () => void;
}) {
    const repo = service.repo!;
    const [url, setUrl] = useState('');
    const [preview, setPreview] = useState<{ url: string; body: Body }>();
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const token = useRef(0);
    const submitting = useRef(false);
    const invalid = useRef<HTMLInputElement>(null);
    const saving = '正在添加…';
    const cancel = () => {
        if (submitting.current) return;
        ++token.current;
        onClose();
    };
    async function test() {
        const run = ++token.current;
        setError('');
        setBusy('正在提取正文…');
        try {
            const result = await service.previewArticle(url);
            if (run !== token.current || service.repo !== repo)
                return;
            setPreview(result);
        }
        catch (e) {
            if (run === token.current) {
                setPreview(undefined);
                setError(message(e));
                invalid.current?.focus();
            }
        }
        finally {
            if (run === token.current)
                setBusy('');
        }
    }
    async function confirm() {
        if (!preview || service.repo !== repo || submitting.current)
            return;
        submitting.current = true;
        setBusy(saving);
        setError('');
        try {
            await service.addArticle(preview);
            ++token.current;
            onClose();
        }
        catch (e) {
            setError(message(e));
            setBusy('');
        }
        finally { submitting.current = false; }
    }
    return <Modal size="source" title="添加单篇文章" icon="book" description="粘贴一篇文章或网页链接，提取正文后立即阅读，不创建订阅" note={`当前 Vault · ${repo.vault.name}`} onClose={cancel} footer={<>
        <button disabled={busy === saving} onClick={cancel}>取消</button><button className="primary" aria-busy={busy === saving} disabled={!preview || !!busy} onClick={() => void confirm()}>{busy === saving ? '正在添加…' : '添加并阅读'}</button></>}>
    <fieldset className="stack modal-sections" disabled={busy === saving}>
    <ModalSection title="文章地址">
        <form onSubmit={e => {
            e.preventDefault();
            void test();
        }} className="stack">
        <label className="field">文章或网页链接<input ref={invalid} data-autofocus autoFocus value={url} onChange={e => {
            ++token.current;
            setUrl(e.target.value);
            setPreview(undefined);
            setBusy('');
        }} placeholder="https://example.com/blog/post" required aria-invalid={!!error} aria-describedby="fsub-add-article-error"/>
        </label>
        <div className="row">
            <button className={`row recognition-submit ${preview ? '' : 'primary'}`} disabled={!!busy} aria-busy={!!busy} type="submit">{busy && <Spinner/>}{busy || '提取正文'}</button>
        </div>
        </form>
        <div id="fsub-add-article-error" className="error" role="status">{error}</div>
    </ModalSection>
    {preview && <ModalSection title="正文预览">
            <div className="preview prose" dangerouslySetInnerHTML={{ __html: clean(preview.body.blocks.slice(0, 5).map(b => b.html).join('')) }}/>
            <small>核对正文是否完整；登录、验证或付费页面无法读取。需要定时更新请改用「添加订阅」。</small>
            </ModalSection>}
  </fieldset>
    </Modal>;
}
