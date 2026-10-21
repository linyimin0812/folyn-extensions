// THROWAWAY UI PROTOTYPE B — record beside the passage, without leaving the article.
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { LearningProps, Scene } from './contracts';
import { sceneLabels } from './contracts';
import './inline-variant.css';

type Tab = 'discussion' | 'notes';

function Glyph({ name }: { name: 'note' | 'chat' | 'close' | 'plus' | 'send' | 'quote' | 'arrow' }) {
    const paths = {
        note: <><path d="M14 3H5v14h14V8M11 12l1-4 7-7 3 3-7 7-4 1Z" /></>,
        chat: <path d="M18 3H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3v4l5-4h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z" />,
        close: <path d="m6 6 12 12M6 18 18 6" />,
        plus: <path d="M12 5v14M5 12h14" />,
        send: <><path d="m3 11 18-8-8 18-3-8-7-2Z" /><path d="m10 13 5-5" /></>,
        quote: <><path d="M5 10h5v8H3v-6c0-4 2-6 6-6M16 10h5v8h-7v-6c0-4 2-6 6-6" /></>,
        arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    };
    return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

const suggestions: Record<Scene, string> = {
    understand: '这段话的关键前提是什么？请用一个例子解释。',
    connect: '这与我加入的笔记有什么联系，哪些前提不同？',
    apply: '如果把这个方法用在我的项目里，应该先验证什么？',
};

export function InlineVariant({ p, initialTab = 'notes' }: { p: LearningProps; initialTab?: Tab }) {
    const [tab, setTab] = useState<Tab>(initialTab);
    const id = useId();
    const messageList = useRef<HTMLDivElement>(null);
    const tabButtons = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
    const latestAnswer = [...p.messages].reverse().find(message => message.role === 'assistant' && message.text.trim());
    useEffect(() => { setTab(initialTab); }, [initialTab]);
    useLayoutEffect(() => {
        if (tab === 'discussion' && messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight;
    }, [p.messages, tab]);
    const chooseTab = (next: Tab, focus = false) => {
        setTab(next);
        if (focus) tabButtons.current[next]?.focus();
    };
    const addAnswer = () => { p.onAddAnswer(); setTab('notes'); };

    return <section className="lp-inline" aria-label="选段学习批注">
        <div className="lp-inline-head">
            <span className="lp-inline-caption"><Glyph name="note" />就地记录</span>
            <div className="lp-inline-tabs" role="tablist" aria-label="批注方式">
                {(['notes', 'discussion'] as const).map(value => <button
                    key={value}
                    ref={node => { tabButtons.current[value] = node; }}
                    type="button"
                    role="tab"
                    id={`${id}-${value}-tab`}
                    aria-controls={`${id}-${value}-panel`}
                    aria-selected={tab === value}
                    tabIndex={tab === value ? 0 : -1}
                    onClick={() => chooseTab(value)}
                    onKeyDown={event => {
                        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                        event.preventDefault();
                        const next = event.key === 'Home' ? 'notes' : event.key === 'End' ? 'discussion' : value === 'notes' ? 'discussion' : 'notes';
                        chooseTab(next, true);
                    }}
                >{value === 'notes' ? '记想法' : '追问'}{value === 'notes' && p.draft.trim() && <span className="lp-inline-tab-mark" aria-label="已有草稿" />}</button>)}
            </div>
            <button type="button" className="lp-inline-icon" aria-label="收起选段批注" title="收起批注" onClick={p.onClose}><Glyph name="close" /></button>
        </div>

        <div className="lp-inline-context">
            <details className="lp-inline-quote">
                <summary><Glyph name="quote" /><span>原文引句</span><span className="lp-inline-quote-preview">{p.quote}</span></summary>
                <blockquote>{p.quote}</blockquote>
            </details>
            <button type="button" className="lp-inline-source" onClick={p.onSource} title={`回到原文：${p.articleTitle}`}>回看原文<Glyph name="arrow" /></button>
        </div>

        <div className="lp-inline-materials" aria-label="本次参考材料">
            <span className="lp-inline-material-caption">参考</span>
            <span className="lp-inline-article" title={p.articleTitle}>当前文章</span>
            {p.materials.map(material => <span className="lp-inline-material" key={material.id}>
                <span title={material.path}>{material.title}</span>
                <button type="button" className="lp-inline-icon" aria-label={`移除材料 ${material.title}`} title="移除材料" onClick={() => p.onRemoveMaterial(material.id)}><Glyph name="close" /></button>
            </span>)}
            <button type="button" className="lp-inline-add" onClick={p.onChooseMaterial}><Glyph name="plus" />加材料</button>
        </div>

        <div id={`${id}-discussion-panel`} role="tabpanel" aria-labelledby={`${id}-discussion-tab`} hidden={tab !== 'discussion'} className="lp-inline-discussion">
            <div className="lp-inline-scenes" aria-label="提问方向">
                {(Object.keys(sceneLabels) as Scene[]).map(scene => <button type="button" key={scene} aria-pressed={p.scene === scene} onClick={() => { p.onScene(scene); p.onPrompt(suggestions[scene]); }}>{sceneLabels[scene]}</button>)}
                <span>围绕这一段，继续聊</span>
            </div>
            <div className="lp-inline-messages" ref={messageList} aria-label="围绕引句的讨论" aria-busy={p.busy}>
                {p.messages.length ? p.messages.map(message => <div className={`lp-inline-message lp-inline-message-${message.role}`} key={message.id}>
                    <span className="lp-inline-message-role">{message.role === 'assistant' ? 'AI' : '我'}</span>
                    <div>{message.text || '正在准备模拟回复…'}</div>
                </div>) : <div className="lp-inline-empty"><Glyph name="chat" /><p>从一个具体问题开始</p><span>解释前提、联系已有笔记，或想一想怎样用。</span></div>}
            </div>
            {latestAnswer && <div className="lp-inline-answer-action"><span>AI 建议 · 由你选择是否记录</span><button type="button" onClick={addAnswer}>选入最新 AI 内容<Glyph name="arrow" /></button></div>}
            <form className="lp-inline-composer" onSubmit={event => { event.preventDefault(); if (!p.busy && p.prompt.trim()) p.onSend(); }}>
                <label htmlFor={`${id}-prompt`}>继续追问</label>
                <textarea id={`${id}-prompt`} value={p.prompt} rows={2} onChange={event => p.onPrompt(event.target.value)} placeholder="写下你真正想弄明白的问题…" onKeyDown={event => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        if (!p.busy && p.prompt.trim()) p.onSend();
                    }
                }} />
                <div className="lp-inline-composer-foot"><span>模拟对话 · 不调用模型</span><button className="lp-inline-send" type="submit" disabled={p.busy || !p.prompt.trim()}>{p.busy ? '回复中…' : '发送'}<Glyph name="send" /></button></div>
            </form>
        </div>

        <div id={`${id}-notes-panel`} role="tabpanel" aria-labelledby={`${id}-notes-tab`} hidden={tab !== 'notes'} className="lp-inline-notes">
            <div className="lp-inline-draft-label"><label htmlFor={`${id}-draft`}>我的想法</label><span>直接写，不必先问 AI</span></div>
            <textarea id={`${id}-draft`} value={p.draft} rows={4} onChange={event => p.onDraft(event.target.value)} placeholder="这段让我想到… / 我准备验证…" />
            <div className="lp-inline-capture"><button type="button" onClick={p.onAddQuote}><Glyph name="quote" />摘录原文</button><button type="button" onClick={addAnswer} disabled={!latestAnswer}>选入最新 AI 内容</button><span>原文与 AI 引用保留标识</span></div>
        </div>

        <div className="lp-inline-foot">
            <span className="lp-inline-status" role="status">{p.status || (p.draft.trim() ? '草稿仅保留在本次原型中' : '尚未记录想法')}</span>
            <button type="button" className="lp-inline-organize" onClick={p.onOrganize} disabled={!p.draft.trim()}>整理到笔记<Glyph name="arrow" /></button>
        </div>
        {p.savedTitle && <p className="lp-inline-saved">已关联笔记：{p.savedTitle}</p>}
    </section>;
}
