// THROWAWAY UI PROTOTYPE — variant C puts the user's own note before AI.
import { useRef, useState } from 'react';
import { Icon } from '../../src/components';
import { sceneLabels, type LearningProps, type Scene } from './contracts';
import './notebook-variant.css';

const questions: Record<Scene, { title: string; prompts: string[] }> = {
    understand: {
        title: '这篇文章，我真正理解了什么？',
        prompts: ['用一个具体例子解释这个概念', '这个结论成立需要哪些前提？', '问我一个问题，看看我是否理解'],
    },
    connect: {
        title: '它与我已有的知识有什么联系？',
        prompts: ['对照所选笔记，找出相同点与分歧', '哪些内容值得补进我的已有笔记？', '帮我梳理两个概念之间的关系'],
    },
    apply: {
        title: '这次学到的东西，可以用在哪里？',
        prompts: ['把这个方法放进一个实际场景', '设计一个我今天就能完成的小练习', '哪些情况下不适合使用这个方法？'],
    },
};

export function NotebookVariant({ p }: { p: LearningProps }) {
    const [assistantOpen, setAssistantOpen] = useState(false);
    const assistantRef = useRef<HTMLElement>(null);
    const lastAnswer = [...p.messages].reverse().find(message => message.role === 'assistant');
    const question = questions[p.scene];
    const openAssistant = (prompt?: string) => {
        if (prompt) p.onPrompt(prompt);
        setAssistantOpen(true);
        requestAnimationFrame(() => {
            assistantRef.current?.scrollIntoView({ block: 'nearest' });
        });
    };

    return <section className="lp-notebook" aria-label="笔记优先学习视图">
        <header className="lp-notebook-header">
            <div className="lp-notebook-heading">
                <span className="lp-notebook-eyebrow">学习笔记</span>
                <h2>{question.title}</h2>
            </div>
            <div className="lp-notebook-header-actions">
                <button type="button" className="lp-button" onClick={p.onSource}><Icon name="back" size={14} />回到原文</button>
                <button type="button" className="lp-icon" aria-label="关闭学习视图" title="关闭学习视图" onClick={p.onClose}><Icon name="close" size={16} /></button>
            </div>
        </header>

        <div className="lp-notebook-scroll">
            <div className="lp-notebook-context">
                <button type="button" className="lp-source lp-notebook-source" onClick={p.onSource} title={`阅读原文：${p.articleTitle}`}>
                    <Icon name="rss" size={13} /><span>来源</span><strong>{p.articleTitle}</strong><Icon name="external" size={12} />
                </button>
                <div className="lp-notebook-scene" role="group" aria-label="学习方向">
                    {(Object.keys(sceneLabels) as Scene[]).map(scene => <button key={scene} type="button" className={`lp-scene${p.scene === scene ? ' active' : ''}`} aria-pressed={p.scene === scene} onClick={() => p.onScene(scene)}>{sceneLabels[scene]}</button>)}
                </div>
            </div>

            {p.quote && <section className="lp-notebook-quote" aria-label="所选原文">
                <div><span className="lp-notebook-caption">所选原文</span><blockquote>{p.quote}</blockquote></div>
                <button type="button" className="lp-button" onClick={p.onAddQuote}><Icon name="plus" size={13} />摘录到笔记</button>
            </section>}

            <section className="lp-notebook-materials" aria-label="关联笔记">
                <span className="lp-notebook-caption">参考笔记</span>
                <div className="lp-notebook-material-list">
                    {p.materials.map(material => <div className="lp-material" key={material.id} title={material.path}>
                        <Icon name="folder" size={12} /><span>{material.title}</span>
                        <button type="button" className="lp-icon" aria-label={`移除参考笔记 ${material.title}`} title="移除参考笔记" onClick={() => p.onRemoveMaterial(material.id)}><Icon name="close" size={12} /></button>
                    </div>)}
                    <button type="button" className="lp-button lp-notebook-add-material" onClick={p.onChooseMaterial}><Icon name="plus" size={13} />选择已有笔记</button>
                </div>
            </section>

            <section className="lp-notebook-editor" aria-label="我的笔记">
                <div className="lp-notebook-editor-label">
                    <label htmlFor="lp-notebook-draft">我的理解与记录</label>
                    <span>{p.draft.length > 0 ? `${p.draft.length} 字` : '直接写下想法，也可以摘录原文'}</span>
                </div>
                <textarea id="lp-notebook-draft" className="lp-draft" value={p.draft} onChange={event => p.onDraft(event.target.value)} placeholder={'用自己的话写下来。\n\n我理解的是……\n还没想清楚的是……\n我打算试一试……'} />
            </section>

            <section ref={assistantRef} className={`lp-notebook-assistant${assistantOpen ? ' is-open' : ''}`} aria-label="AI 学习建议">
                <button type="button" className="lp-notebook-assistant-toggle" aria-expanded={assistantOpen} aria-controls="lp-notebook-ai-content" onClick={() => setAssistantOpen(value => !value)}>
                    <span className="lp-notebook-assistant-mark">AI</span>
                    <span><strong>一起想一想</strong><small>{assistantOpen ? '讨论不会自动写入你的笔记' : '卡住了，再请 AI 解释、对照或出一道练习'}</small></span>
                    <Icon name="back" size={14} />
                </button>
                {assistantOpen && <div id="lp-notebook-ai-content" className="lp-notebook-ai-content">
                    <div className="lp-notebook-suggestions" aria-label={`${sceneLabels[p.scene]}提问建议`}>
                        {question.prompts.map(prompt => <button type="button" key={prompt} onClick={() => openAssistant(prompt)}>{prompt}</button>)}
                    </div>
                    {p.messages.length > 0 && <div className="lp-notebook-messages" aria-label="学习讨论记录">
                        {p.messages.map(message => <div className={`lp-message ${message.role}`} key={message.id}>
                            <span className="lp-notebook-message-role">{message.role === 'user' ? '我' : 'AI'}</span><p>{message.text}</p>
                        </div>)}
                    </div>}
                    {lastAnswer && <button type="button" className="lp-button lp-notebook-use-answer" onClick={p.onAddAnswer}><Icon name="plus" size={13} />将最新回答选入笔记</button>}
                    <div className="lp-composer lp-notebook-composer">
                        <label className="lp-notebook-caption" htmlFor="lp-notebook-prompt">继续讨论</label>
                        <textarea id="lp-notebook-prompt" value={p.prompt} onChange={event => p.onPrompt(event.target.value)} placeholder="针对文章或参考笔记，说说你的问题…" onKeyDown={event => {
                            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && !p.busy && p.prompt.trim()) {
                                event.preventDefault();
                                p.onSend();
                            }
                        }} />
                        <div className="lp-notebook-composer-actions"><span>⌘ / Ctrl + Enter 发送</span><button type="button" className="lp-primary" disabled={p.busy || !p.prompt.trim()} onClick={p.onSend}>{p.busy ? '思考中…' : '发送问题'}</button></div>
                    </div>
                </div>}
            </section>
        </div>

        <footer className="lp-notebook-footer">
            <div className="lp-notebook-status" role="status">{p.status || (p.savedTitle ? `已整理到「${p.savedTitle}」` : '内容暂存于本次原型，尚未写入 Vault')}</div>
            <div className="lp-notebook-footer-actions">
                {!assistantOpen && <button type="button" className="lp-button" onClick={() => openAssistant()}>请 AI 帮我想想</button>}
                <button type="button" className="lp-primary" onClick={p.onOrganize} disabled={!p.draft.trim()}><Icon name="save" size={14} />整理到笔记…</button>
            </div>
        </footer>
    </section>;
}
