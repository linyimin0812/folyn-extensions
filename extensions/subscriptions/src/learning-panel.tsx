import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { marked } from 'marked';
import type { ExtensionAiPair } from 'folyn-extension-sdk';
import type { LearningArticleInput, LearningMaterial, LearningMessage, LearningNoteInput, LearningRecord, LearningScene } from './learning-model';
import { appendLearningQuote, LearningController, noteHasSource, noteBodyEnd, sourcesAtEnd, splitNoteSources } from './learning';
import { Icon, Modal, Spinner } from './components';
import { SelectField } from './select';
import { clean } from './parse';
import { StableHtml } from './stable-html';
import { message } from './model';
import { modelKey, sameModel } from './translation-model';
import { learningStyles } from './learning-styles';
import { highlightCodeBlocks } from './code-blocks';

type Props = { controller: LearningController; noteFocusRequest?: number; reading?: LearningArticleInput; onClose(): void; onSource(material: LearningMaterial): void; onNotify?(text: string): void; onChooseArticle?(): void };
function answerHtml(value: string) {
    const html = clean(marked.parse(value, { async: false }) as string).replace(/<img\b[^>]*>/gi, '');
    const document = new DOMParser().parseFromString(html, 'text/html');
    highlightCodeBlocks(document.body);
    return document.body.innerHTML;
}
function LearningAnswer({ content, streaming }: { content: string; streaming: boolean }) {
    const html = useMemo(() => answerHtml(content || (streaming ? '正在接收回答…' : '尚未收到回答')), [content, streaming]);
    return <div className="prose learning-answer"><StableHtml html={html}/></div>;
}
function citation(material: LearningMaterial) { return material.url ? `[${material.title}](${material.url})` : `《${material.title}》${material.path ? `（${material.path}）` : ''}`; }

export function LearningPanel({ controller: c, noteFocusRequest = 0, reading, onClose, onSource, onNotify, onChooseArticle }: Props) {
    useSyncExternalStore(c.subscribe, c.snapshot);
    const record = c.active;
    const [pairs, setPairs] = useState<ExtensionAiPair[]>([]), [loadingModels, setLoadingModels] = useState(true), [modelError, setModelError] = useState('');
    const [organizing, setOrganizing] = useState(false), [localError, setLocalError] = useState(''), [guidanceOpen, setGuidanceOpen] = useState(false);
    const [hint, setHint] = useState(''), [choosingNotes, setChoosingNotes] = useState(false);
    const conversation = useRef<HTMLDivElement>(null), atEnd = useRef(true), question = useRef<HTMLTextAreaElement>(null), thought = useRef<HTMLTextAreaElement>(null);
    const quoteDetails = useRef<HTMLDetailsElement>(null), materialDetails = useRef<HTMLDetailsElement>(null), mounted = useRef(true), focusFrame = useRef<number>();
    const selectedPassage = record?.selection;
    const primary = record?.materials.find(material => material.kind === 'article' && material.quote) || record?.materials.find(material => material.kind === 'article');
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current); }; }, []);
    useEffect(() => {
        let cancelled = false, request = 0;
        const load = () => {
            const current = ++request;
            setLoadingModels(true);
            void c.host.api.ai.pairs().then(values => { if (!cancelled && current === request) { setPairs(values); setModelError(''); } }, error => { if (!cancelled && current === request) setModelError(message(error)); }).finally(() => { if (!cancelled && current === request) setLoadingModels(false); });
        };
        load(); window.addEventListener('focus', load);
        return () => { cancelled = true; window.removeEventListener('focus', load); };
    }, [c]);
    useLayoutEffect(() => { if (atEnd.current && conversation.current) conversation.current.scrollTop = conversation.current.scrollHeight; }, [record?.messages.map(item => `${item.id}:${item.content.length}`).join('|')]);
    useLayoutEffect(() => { atEnd.current = true; setLocalError(''); setHint(''); }, [record?.id]);
    useEffect(() => {
        const input = record?.tab === 'notes' ? thought.current : question.current;
        input?.focus({ preventScroll: true });
    }, [record?.id, record?.tab]);
    useLayoutEffect(() => {
        if (quoteDetails.current) quoteDetails.current.open = false;
        if (materialDetails.current) materialDetails.current.open = false;
        if (record?.tab !== 'notes' && selectedPassage) question.current?.focus({ preventScroll: true });
    }, [primary?.id, primary?.quote, selectedPassage?.quote, record?.tab, noteFocusRequest]);
    useLayoutEffect(() => {
        if (!noteFocusRequest || !thought.current) return;
        const input = thought.current;
        input.focus({ preventScroll: true });
        input.setSelectionRange(noteBodyEnd(input.value), noteBodyEnd(input.value));
        input.scrollTop = input.scrollHeight;
        setHint('选段已在笔记中，可以继续写下想法。');
    }, [noteFocusRequest]);
    useEffect(() => {
        const dismiss = (event: PointerEvent) => {
            const details = materialDetails.current;
            if (details?.open && !details.contains(event.target as Node)) details.open = false;
        };
        document.addEventListener('pointerdown', dismiss);
        return () => document.removeEventListener('pointerdown', dismiss);
    }, []);
    const current = (id = record?.id) => mounted.current && c.active?.id === id;
    const focusThought = (id: string) => {
        if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current);
        focusFrame.current = requestAnimationFrame(() => {
            if (!current(id)) return;
            const input = thought.current;
            input?.focus({ preventScroll: true }); input?.setSelectionRange(noteBodyEnd(input.value), noteBodyEnd(input.value));
        });
    };
    const run = async (action: () => unknown | Promise<unknown>) => {
        const id = record?.id; setLocalError('');
        try { await action(); } catch (error) { if (current(id)) setLocalError(message(error)); }
    };
    const writeThought = () => { if (record) { c.setTab('notes'); focusThought(record.id); } };
    const addQuote = (material?: LearningMaterial) => {
        if (!record || !material?.quote) return;
        c.setNoteDraft(appendLearningQuote(record.noteDraft, material));
        c.setTab('notes'); setHint('选段已摘到笔记，可以补上自己的理解。'); focusThought(record.id);
    };
    const addAnswer = (item: LearningMessage) => {
        if (!record) return;
        const refs = item.scope?.materials || record.materials;
        const sources = new Set<string>();
        const references = refs.map((material, index) => {
            const key = material.url || material.path || material.title;
            const existing = noteHasSource(record.noteDraft, key) || sources.has(key); sources.add(key);
            return `- [M${index + 1}] ${existing ? `《${material.title}》` : citation(material)}`;
        });
        const { body, sources: footerSources } = splitNoteSources(record.noteDraft);
        c.setNoteDraft(`${body}${body ? '\n\n---\n\n' : ''}AI 建议（${item.pair?.provider || ''} / ${item.pair?.model || ''}${item.status !== 'complete' ? ' · 未完成' : ''}）：\n\n${item.content}\n\n参考材料：\n${references.join('\n')}${footerSources.length ? `\n\n\n${footerSources.join('\n')}\n` : ''}`);
        c.setTab('notes'); setHint('已摘到笔记，继续修改后再保存。'); focusThought(record.id);
    };
    const chooseNotes = async (id: string, preset = false) => {
        if (choosingNotes) return;
        setChoosingNotes(true); setLocalError('');
        try {
            await c.chooseNotes(id);
            if (current(id)) {
                const count = c.active!.materials.filter(material => material.kind === 'note').length;
                setHint(count ? `已加入 ${count} 份参考笔记${preset ? '，可以继续修改问题。' : '，发送时一起对照。'}` : '未选择笔记，也可以直接输入想对照的问题。');
                if (preset) question.current?.focus({ preventScroll: true });
            }
        } catch (error) { if (current(id)) setLocalError(message(error)); }
        finally { if (mounted.current) setChoosingNotes(false); }
    };
    const presetQuestions: Record<LearningScene, string> = {
        understand: primary?.quote ? '这段话的关键概念和前提是什么？请结合选段举例解释。' : '这篇文章的关键概念和前提是什么？请结合原文举例解释。',
        connect: '请对照我加入的笔记与这篇文章，说明观点的联系、差异与适用前提。',
        apply: '我想把这篇文章的方法用起来，请给我一个可以尝试的小步骤，并说明怎样判断结果。',
    };
    const prepareQuestion = (scene: LearningScene) => {
        if (!record) return;
        c.setScene(scene); c.setDraft(presetQuestions[scene]); setHint('问题已填入，可以修改后发送。'); question.current?.focus({ preventScroll: true });
        if (scene === 'connect') void chooseNotes(record.id, true);
    };
    const readingIncluded = !!reading && !!record?.materials.some(material => material.articleId === reading.articleId && material.version === reading.version);
    const preferred = record?.pair || pairs[0], selectedPair = pairs.find(pair => sameModel(pair, preferred));
    const modelOptions = pairs.map(pair => ({ value: modelKey(pair), label: `${pair.label || pair.provider} / ${pair.model}` }));
    if (!selectedPair) modelOptions.unshift({ value: modelKey(preferred), label: loadingModels ? '正在读取模型…' : preferred ? `${preferred.provider} / ${preferred.model}（不可用）` : '暂无可用模型' });
    const prepareNote = () => {
        if (!record) return;
        if (!record.noteDraft.trim()) { c.setTab('notes'); setHint('先写下一点自己的理解，再保存为笔记。'); focusThought(record.id); return; }
        const uniqueSources = [...new Map(record.materials.map(material => [material.url || material.path || material.title, material])).values()];
        const missing = uniqueSources.filter(material => !noteHasSource(record.noteDraft, material.url || material.path || material.title));
        const draft = sourcesAtEnd(record.noteDraft);
        c.setNoteDraft(`${draft}${missing.length ? `\n\n参考来源：\n${missing.map(material => `- ${citation(material)}`).join('\n')}` : ''}`);
        setOrganizing(true);
    };
    const send = () => { setHint(''); atEnd.current = true; void run(() => c.send(selectedPair)); };
    const firstQuestion = !!record && !record.messages.length;
    return <aside className="learning-panel" id="fsub-learning" aria-label="并排伴读">
        <style>{learningStyles}</style>
        <header className="learning-header"><div className="learning-heading"><Icon name="book" size={14}/>{record ? <div className="learning-record-select"><SelectField label="查看学习历史" value={record.id} options={[...c.state.records].reverse().map(item => ({ value: item.id, label: item.title }))} onChange={value => c.setActive(value)}/></div> : <strong>伴读</strong>}</div><div>
            <button className="icon-button" aria-label="新开学习问题" title="新问题" disabled={!reading} onClick={() => void run(() => c.start(reading!, 'chat', true))}><Icon name="plus" size={15}/></button>
            <button className="icon-button" aria-label="关闭伴读" title="关闭伴读" onClick={onClose}><Icon name="close" size={15}/></button>
        </div></header>
        {!record ? <div className="learning-empty"><h3>{reading ? '从当前文章开始' : '先选择一篇文章'}</h3><p>{reading ? '问一个问题，或直接记下自己的理解。' : '在左侧打开文章，再点阅读区的「伴读」。'}</p>{!reading && onChooseArticle && <button onClick={onChooseArticle}>选择文章</button>}{reading && <div className="learning-inline-actions"><button className="primary" onClick={() => void run(() => c.start(reading, 'chat'))}>问一问</button><button onClick={() => void run(() => c.start(reading, 'notes'))}>直接记笔记</button></div>}</div> : <>
        <div className="learning-toolbar">
            <div className="learning-tabs" role="group" aria-label="伴读内容"><button aria-pressed={record.tab !== 'notes'} onClick={() => c.setTab('chat')}>讨论</button><button aria-pressed={record.tab === 'notes'} onClick={() => c.setTab('notes')}>笔记{record.noteDraft && <span className="learning-draft-dot" aria-label="有草稿"/>}</button></div>
            <details className="learning-materials" ref={materialDetails} onKeyDown={event => { if (event.key === 'Escape' && materialDetails.current?.open) { event.preventDefault(); event.stopPropagation(); materialDetails.current.open = false; materialDetails.current.querySelector('summary')?.focus(); } }}><summary><Icon name="folder" size={13}/>参考<span>{record.materials.length}</span><Icon name="back" size={10}/></summary><div className="learning-context">
                <div className="learning-context-heading"><strong>本次讨论的参考</strong><button className="icon-button" aria-label="收起参考材料" onClick={() => { if (materialDetails.current) { materialDetails.current.open = false; materialDetails.current.querySelector('summary')?.focus(); } }}><Icon name="close" size={13}/></button></div>
                {primary?.quote && <details className="learning-quote" ref={quoteDetails}><summary><span>当前选段 · {primary.title}</span></summary><blockquote>{primary.quote}</blockquote><div className="learning-inline-actions"><button onClick={() => onSource(primary)}>回看原文</button><button onClick={() => addQuote(primary)}>摘录到笔记</button>{primary.language && <small>{primary.language} 译文选段</small>}</div></details>}
                {record.materials.map((material, index) => <section key={material.id}><div><button className="learning-material-title" onClick={() => onSource(material)} title={material.path || material.url}><Icon name={material.kind === 'article' ? 'book' : 'folder'} size={13}/><span>{material.title}</span><small>M{index + 1}</small></button><button className="icon-button" aria-label={`移除材料 ${material.title}`} onClick={() => void run(() => c.removeMaterial(material.id))}><Icon name="close" size={12}/></button></div><small>{material.kind === 'note' ? material.path : material.url}</small><details><summary>查看参考内容</summary><pre>{material.quote ? `选段：${material.quote}\n\n` : ''}{material.text}</pre><small>{material.version ? `正文版本 ${material.version} · ` : ''}{material.text.length} 字</small></details></section>)}
                <div className="learning-material-actions"><button disabled={choosingNotes || !c.repository.vault.chooseNotes} onClick={() => void chooseNotes(record.id)}>{choosingNotes ? <Spinner/> : <Icon name="plus" size={12}/>}加入已有笔记</button>{!c.repository.vault.chooseNotes && <small>选择笔记需要更新 Folyn 宿主</small>}</div>
            </div></details>
        </div>
        {reading && !readingIncluded && <div className="learning-reading-change"><small>正在阅读另一篇文章，当前讨论仍保留《{primary?.title || record.title}》的上下文。</small><div className="learning-inline-actions"><button onClick={() => void run(() => c.addArticle(reading))}>把这篇加入讨论</button><button onClick={() => void run(() => c.start(reading, 'chat', true))}>单独聊这篇</button></div></div>}
        {record.tab !== 'notes' ? <>
            <div className={`learning-conversation ${firstQuestion ? 'is-new' : ''}`} ref={conversation} aria-label="学习讨论" aria-busy={c.busy} tabIndex={0} onScroll={() => { const element = conversation.current!; atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < 70; }} onClick={event => { const anchor = (event.target as Element).closest('a'); if (anchor) { event.preventDefault(); void run(() => c.host.support.openExternal(anchor.getAttribute('href') || '')); } }}>
                {firstQuestion && <div className="learning-start"><span className="learning-eyebrow">{primary?.quote ? '从选中的这段话继续' : '围绕这篇文章'}</span><h3>有哪里没读懂？</h3><p>直接提问，或用下面的问题开始。</p><div className="learning-question-cards">
                    <button aria-label="读懂：解释关键概念与前提" aria-pressed={record.draft.trim() === presetQuestions.understand} onClick={() => prepareQuestion('understand')}><span>读懂</span><strong>解释关键概念与前提</strong><Icon name="back" size={12}/></button>
                    <button aria-label="联系：和我的笔记对照" aria-pressed={record.draft.trim() === presetQuestions.connect} disabled={choosingNotes} onClick={() => prepareQuestion('connect')}><span>联系</span><strong>和我的笔记对照</strong>{choosingNotes ? <Spinner/> : <Icon name="back" size={12}/>}</button>
                    <button aria-label="应用：设计一个小实践" aria-pressed={record.draft.trim() === presetQuestions.apply} onClick={() => prepareQuestion('apply')}><span>应用</span><strong>设计一个小实践</strong><Icon name="back" size={12}/></button>
                </div></div>}
                {record.messages.map(item => <article key={item.id} className={`learning-message ${item.role}`}><small>{item.role === 'user' ? '我的问题' : `Folyn AI · ${item.pair?.model || ''}`}</small>{item.role === 'assistant' ? <LearningAnswer content={item.content} streaming={item.status === 'streaming'}/> : <>{item.selection && <blockquote className="learning-message-selection"><small>{item.selection.title}{item.selection.language ? ` · ${item.selection.language} 译文` : ''}</small>{item.selection.quote}</blockquote>}<p>{item.content}</p></>}{item.role === 'assistant' && <>
                    <div className="learning-answer-actions">{item.status !== 'complete' && <small>{item.status === 'streaming' ? '正在生成' : item.status === 'cancelled' ? '已取消 · 内容已保留' : '未完成 · 可以重试'}</small>}{item.content && <><button onClick={writeThought}>写下我的理解</button><button onClick={() => addAnswer(item)}>摘到笔记</button></>}{item.status !== 'complete' && item.status !== 'streaming' && <button disabled={c.busy} onClick={() => void run(() => c.retry(item.id, selectedPair))}>重试回答</button>}</div>
                    {item.scope && <details className="learning-request-scope"><summary>查看本次依据{item.scope.truncated ? ' · 使用了部分内容' : ''}</summary><p>材料 {item.scope.usedChars.toLocaleString()} / {item.scope.totalChars.toLocaleString()} 字；历史讨论 {item.scope.historyUsedChars.toLocaleString()} / {item.scope.historyTotalChars.toLocaleString()} 字{item.scope.historyTruncated ? '，仅使用最近部分' : ''}。</p>{item.scope.materials.map((material, index) => <details key={material.id}><summary>[M{index + 1}] {material.title} · {material.usedChars} / {material.totalChars} 字{material.truncated ? '（部分）' : ''}</summary><pre>{material.quote ? `选段：${material.quote}\n\n` : ''}{material.text}</pre><button onClick={() => onSource(material)}>回看来源</button></details>)}</details>}
                </>}</article>)}
            </div>
            <div className={`learning-compose-area ${firstQuestion ? 'is-new' : ''}`}>
                <form className="learning-composer" onSubmit={event => { event.preventDefault(); send(); }}><label htmlFor="fsub-learning-question">{selectedPassage ? '针对选段提问' : firstQuestion ? '你的问题' : '继续追问'}</label>{selectedPassage && <div className="learning-pending-selection" title={selectedPassage.quote}><Icon name="book" size={12}/><span>{selectedPassage.quote}</span></div>}<textarea ref={question} id="fsub-learning-question" value={record.draft} placeholder={selectedPassage ? '例如：这段话的前提是什么？' : '例如：文章最重要的结论是什么？'} onChange={event => { setHint(''); c.setDraft(event.target.value); }} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); if (!c.busy) send(); } }}/>
                    {hint && <p className="learning-action-hint" role="status">{hint}</p>}
                    <div className="learning-compose-actions"><div className="learning-model-select"><SelectField label="伴读模型" value={modelKey(preferred)} options={modelOptions} disabled={loadingModels || !pairs.length} onChange={value => { const pair = pairs.find(item => modelKey(item) === value); if (pair) c.setPair(pair); }}/></div><button type="button" className="learning-guidance-toggle" aria-label="调整回答指引" title="回答指引" aria-expanded={guidanceOpen} aria-controls="fsub-learning-guidance" onClick={() => setGuidanceOpen(value => !value)}><Icon name="settings" size={14}/></button>{c.busy ? <button className="learning-send" type="button" aria-label="取消生成" title="取消生成" onClick={() => c.cancel()}><span className="learning-stop"/></button> : <button className="primary learning-send" aria-label="发送问题" title="发送问题 · ⌘/Ctrl + Enter" disabled={!selectedPair || loadingModels} type="submit"><Icon name="send" size={15}/></button>}</div>
                    {guidanceOpen && <label className="learning-guidance" id="fsub-learning-guidance">回答指引<textarea value={record.prompt} onChange={event => c.setPrompt(event.target.value)}/></label>}
                </form>
                {(modelError || !loadingModels && (!pairs.length || !selectedPair)) && <p className="error">{modelError || (pairs.length ? '此模型已停用或移除，请重新选择。' : '在 Folyn 配置并启用 AI 模型后即可讨论。')} <button onClick={() => c.host.support.openSettings()}>打开 AI 配置</button></p>}
            </div>
        </> : <>
            <div className="learning-note-toolbar"><span><Icon name="book" size={13}/>我的笔记</span><button className="learning-note-save" onClick={prepareNote} disabled={c.saving}><Icon name="save" size={13}/>保存笔记…</button></div>
            <div className="learning-thoughts"><label className="sr-only" htmlFor="fsub-learning-thought">写下自己的理解</label><textarea ref={thought} id="fsub-learning-thought" value={record.noteDraft} placeholder={'写下自己的理解、疑问，或下一步想尝试的事…\n\n支持 Markdown，草稿自动保留。'} onChange={event => { setHint(''); c.setNoteDraft(event.target.value); }}/>{hint && <p className="learning-action-hint" role="status">{hint}</p>}
            {record.savedNotes.length > 0 && <div className="learning-saved-notes"><small>已保存到 Vault</small>{record.savedNotes.map(note => <button className="learning-saved-note" key={note.operationKey || `${note.kind}:${note.path}:${note.savedAt}`} onClick={() => void run(() => c.openNote(note.path))}><Icon name="folder" size={13}/><span>{note.title}</span><small>{note.kind === 'append' ? '编辑器中' : '打开'}<Icon name="external" size={11}/></small></button>)}</div>}</div>
            <div className="learning-note-footer"><div className="learning-inline-actions">{primary?.quote && <button onClick={() => addQuote(primary)}>摘录选段</button>}<button disabled={!record.messages.some(item => item.role === 'assistant' && item.content)} onClick={() => { const item = [...record.messages].reverse().find(item => item.role === 'assistant' && item.content); if (item) addAnswer(item); }}>摘入最新 AI 回答</button></div><small>{record.noteDraft.length.toLocaleString()} 字 · 草稿</small></div>
        </>}
        </>}
        {(c.persistError || localError || c.error) && <footer className={`learning-status ${c.persistError || localError ? 'has-error' : ''}`}><span role={c.persistError || localError ? 'alert' : 'status'}>{c.persistError || localError || c.error || (record ? '笔记只包含你摘录和写下的内容' : '可以直接记录，也可以先提问')}</span>{c.persistError && !c.loadError && <button onClick={() => void run(() => c.persist())}>重试保存</button>}</footer>}
        {organizing && record && <OrganizeLearningNote controller={c} record={record} onClose={() => setOrganizing(false)} onSaved={text => onNotify?.(text)}/>}
    </aside>;
}

function OrganizeLearningNote({ controller: c, record, onClose, onSaved }: { controller: LearningController; record: LearningRecord; onClose(): void; onSaved(text: string): void }) {
    const [mode, setMode] = useState<'new' | 'append'>('new'), [name, setName] = useState(record.title), [dir, setDir] = useState(''), [snapshot, setSnapshot] = useState<LearningNoteInput>();
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const targets = [...new Map([...record.savedNotes, ...record.materials.filter(item => item.kind === 'note' && item.path).map(item => ({ path: item.path!, title: item.title }))].map(item => [item.path, item])).values()];
    const run = async (action: () => Promise<void>) => { setBusy(true); setError(''); try { await action(); } catch (value) { setError(message(value)); } finally { setBusy(false); } };
    const save = () => void run(async () => {
        if (mode === 'append' && !snapshot) throw new Error('请先选择要追加的笔记');
        const path = mode === 'append' ? await c.appendNote(snapshot!, record.noteDraft, record.id) : await c.saveNewNote(dir, name, record.noteDraft, record.id);
        if (mode === 'append') { onSaved('已加入笔记编辑器，请在编辑器中确认保存'); onClose(); }
        else {
            try { await c.openNote(path); onSaved('笔记已新建，并在编辑器打开'); onClose(); }
            catch (value) { onSaved(`笔记已新建到 ${path}`); setError(`文件已创建，暂时无法打开：${message(value)}`); }
        }
    });
    return <Modal title="保存笔记" icon="book" description="预览并修改内容，再新建笔记或追加到已有笔记" onClose={() => { if (!busy) onClose(); }} footer={<><button disabled={busy} onClick={onClose}>保留草稿</button><button className="primary" disabled={busy} onClick={save}>{busy && <Spinner/>}{mode === 'new' ? '新建并打开' : '追加到编辑器'}</button></>}>
        <div className="learning-destination" role="group" aria-label="笔记去向"><button aria-pressed={mode === 'new'} disabled={busy} onClick={() => setMode('new')}>新建笔记</button><button aria-pressed={mode === 'append'} disabled={busy} onClick={() => setMode('append')}>已有笔记</button></div>
        {mode === 'new' ? <div className="stack"><label className="field">笔记名称<input value={name} disabled={busy} onChange={event => setName(event.target.value)}/></label><div className="field"><label>保存目录</label><div className="learning-directory"><input aria-label="保存目录" value={dir} disabled={busy} placeholder="Vault 根目录" onChange={event => setDir(event.target.value)}/><button disabled={busy} onClick={() => void run(async () => { const selected = await c.repository.vault.chooseDirectory(); if (selected !== null) setDir(selected); })}>选择目录</button></div></div></div> : <div className="stack"><div className="learning-note-targets">{targets.map(target => <button key={target.path} disabled={busy} aria-pressed={snapshot?.path === target.path} onClick={() => void run(async () => setSnapshot(await c.prepareAppend(target.path)))}>{target.title}<small>{target.path}</small></button>)}</div><button disabled={busy || !c.repository.vault.chooseNotes} onClick={() => void run(async () => { if (!c.repository.vault.chooseNotes) throw new Error('请更新 Folyn 宿主以选择笔记'); const notes = await c.repository.vault.chooseNotes(); if (notes[0]) setSnapshot(notes[0]); })}>选择当前 Vault 的笔记…</button>{snapshot && <details className="learning-target-preview"><summary>追加到 {snapshot.path} 的文末 · 查看当前内容</summary><pre>{snapshot.text}</pre></details>}<small>通过原生编辑器追加，可撤销；保留未保存修改，按编辑器设置保存。</small></div>}
        <label className="field learning-note-preview">{mode === 'append' ? '将追加的内容 · 可以修改' : '笔记正文 · 可以修改'}<textarea value={record.noteDraft} disabled={busy} onChange={event => c.setNoteDraft(event.target.value, record.id)}/></label>
        {error && <p className="error" role="alert">{error}</p>}
    </Modal>;
}
