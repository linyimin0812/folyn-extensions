// THROWAWAY: compare three learning interactions on the existing subscription
// page via ?learning-prototype=1&sample=1. A was selected by the user.
// Historical alternatives remain accessible with &compare=1&variant=A|B|C.
// Memory only; no AI calls.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../src/components';
import type { LearningProps, Material, Message, Scene } from './contracts';
import { sceneLabels } from './contracts';
import { InlineVariant } from './inline-variant';
import { NotebookVariant } from './notebook-variant';
import './prototype.css';

const names = { A: '并排伴读', B: '就地批注', C: '笔记优先' };
type Variant = keyof typeof names;
const seedNotes: Material[] = [
    { id: 'cache', title: '图片缓存方案', path: '工程/图片缓存方案.md', content: '# 图片缓存方案\n\n图片下载使用两路并发，失败项可以单独重试。\n下载完成后读取当前 Vault，将结果写入缓存目录。\n\n## 待完善\n\n切换工作区时如何处理尚未完成的下载？' },
    { id: 'boundary', title: '多工作区数据边界', path: '工程/多工作区数据边界.md', content: '# 多工作区数据边界\n\n任务需要记住启动时的归属。页面导航与文件写入有独立的生命周期。\n\n待确认：旧工作区仍有写入时，重新打开它应该先等待还是立即读盘？' },
    { id: 'practice', title: '任务取消实验', path: '实验/任务取消实验.md', content: '# 任务取消实验\n\n目标：检查取消后是否仍有迟到的文件写入。\n\n## 观察\n\n尚未开始。' },
];
const prompts: Record<Scene, string> = {
    understand: '为什么切换 Vault 后，后台任务不能直接使用当前 Vault？',
    connect: '请对照我加入的笔记，看看原来的方案遗漏了什么前提。',
    apply: '我想验证图片下载在切换 Vault 后是否会写错位置，怎样设计一个小实验？',
};
const sampleQuote = '任务开始时捕获所属 Vault 的会话，后续读取和写入都通过这份会话完成。当前界面可以切换，任务的归属保持稳定；结果到达后，也只更新它对应的文章与缓存。';

export function LearningPrototype() {
    const params = new URLSearchParams(location.search), comparing = params.has('compare');
    const initial = params.get('variant');
    const [variant, setVariant] = useState<Variant>(comparing && (initial === 'B' || initial === 'C') ? initial : 'A');
    const [active, setActive] = useState(true), [tab, setTab] = useState<'discussion' | 'notes'>('discussion');
    const [toolbar, setToolbar] = useState<Element | null>(null), [reader, setReader] = useState<Element | null>(null), [inlineHost, setInlineHost] = useState<Element | null>(null);
    const [quote, setQuote] = useState(sampleQuote), [articleTitle, setArticleTitle] = useState('把异步任务绑定到正确的 Vault');
    const [articleUrl, setArticleUrl] = useState('https://example.com/blog/source-0/article-1');
    const [scene, setScene] = useState<Scene>('understand'), [prompt, setPrompt] = useState(''), [messages, setMessages] = useState<Message[]>([]);
    const [draft, setDraft] = useState(''), [materials, setMaterials] = useState<string[]>([]), [notes, setNotes] = useState(seedNotes);
    const [busy, setBusy] = useState(false), [status, setStatus] = useState('可以直接记想法，也可以从一个问题开始。');
    const [picker, setPicker] = useState(false), [organizing, setOrganizing] = useState(false), [savedTitle, setSavedTitle] = useState<string>();
    const [editor, setEditor] = useState<string>(), [showState, setShowState] = useState(false);
    const [bubble, setBubble] = useState<{ text: string; x: number; y: number }>();
    const serial = useRef(0), request = useRef(0), selectedBlock = useRef<Element | null>(null);
    const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : '';

    useEffect(() => {
        const bar = document.querySelector('#testbar > span');
        if (bar) bar.textContent = `${comparing ? '学习方案对比' : '并排伴读原型 · A 已选定'} · AI/笔记均为模拟 · 仅内存，刷新重置`;
        document.title = 'Folyn · 学习交互原型';
        const scan = () => {
            setToolbar(document.querySelector('.reader-tools'));
            setReader(document.querySelector('.reader'));
            if (!document.querySelector('#learning-inline-slot')) {
                const block = document.querySelector('.reader .prose .block:nth-child(3)') || document.querySelector('.reader .prose .block');
                if (block) { const slot = document.createElement('div'); slot.id = 'learning-inline-slot'; block.after(slot); setInlineHost(slot); }
            } else setInlineHost(document.querySelector('#learning-inline-slot'));
        };
        scan();
        const observer = new MutationObserver(scan);
        observer.observe(document.querySelector('#root')!, { subtree: true, childList: true });
        return () => { observer.disconnect(); request.current++; document.querySelector('#learning-inline-slot')?.remove(); };
    }, []);
    useLayoutEffect(() => {
        if (active && variant === 'B' && inlineHost) requestAnimationFrame(() => inlineHost.scrollIntoView({ block: 'center' }));
    }, [active, variant, inlineHost]);
    useEffect(() => {
        const page = document.querySelector<HTMLElement>('.fsub');
        const adapt = () => {
            if (page) page.inert = active && variant === 'A' && innerWidth <= 1000;
            // Enter the existing reader through its normal selected-row action
            // when the host's small-window layout currently shows only the list.
            if (active && variant !== 'A' && reader && getComputedStyle(reader).display === 'none')
                document.querySelector<HTMLButtonElement>('.article-card[aria-current="true"]')?.click();
        };
        const frame = requestAnimationFrame(adapt);
        window.addEventListener('resize', adapt);
        return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', adapt); if (page) page.inert = false; };
    }, [active, variant, reader]);

    const changeVariant = (next: Variant) => {
        setVariant(next); setActive(true); setBubble(undefined);
        const url = new URL(location.href); url.searchParams.set('variant', next); history.replaceState(null, '', url);
    };
    const cycle = (direction: number) => changeVariant((['A', 'B', 'C'] as Variant[])[(['A', 'B', 'C'].indexOf(variant) + direction + 3) % 3]);
    useEffect(() => {
        const key = (event: KeyboardEvent) => {
            if ((event.target as Element)?.closest('input,textarea,[contenteditable],dialog,[role=combobox],[role=tablist]')) return;
            if (comparing && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) { event.preventDefault(); cycle(event.key === 'ArrowRight' ? 1 : -1); }
            if (event.key === 'Escape') setBubble(undefined);
        };
        document.addEventListener('keydown', key);
        return () => document.removeEventListener('keydown', key);
    }, [variant, comparing]);
    useEffect(() => {
        const selected = () => {
            const selection = window.getSelection(), text = selection?.toString().trim();
            const parent = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
            if (!text || !parent?.closest('.reader .prose') || parent.closest('.lp')) return;
            const range = selection!.getRangeAt(0), rect = range.getBoundingClientRect();
            selectedBlock.current = parent.closest('.block') || parent.closest('p');
            setBubble({ text: text.slice(0, 1600), x: Math.max(8, Math.min(rect.x, innerWidth - 210)), y: Math.max(45, rect.y - 43) });
        };
        document.addEventListener('mouseup', selected); document.addEventListener('keyup', selected);
        return () => { document.removeEventListener('mouseup', selected); document.removeEventListener('keyup', selected); };
    }, []);
    const start = (mode: 'discussion' | 'notes', text?: string) => {
        if (text) {
            setQuote(text); setArticleTitle(document.querySelector('.article-header h1')?.textContent || articleTitle);
            setArticleUrl(document.querySelector<HTMLAnchorElement>('.article-header a')?.href || articleUrl);
        }
        setTab(mode); setActive(true); setBubble(undefined);
        if (variant === 'B' && inlineHost) {
            if (selectedBlock.current?.isConnected) selectedBlock.current.after(inlineHost);
            requestAnimationFrame(() => inlineHost.scrollIntoView({ block: 'center' }));
        }
    };
    const source = () => {
        setActive(false);
        const block = [...document.querySelectorAll('.reader .block')].find(e => e.textContent?.includes(quote.slice(0, 35))) || document.querySelector('.reader .prose .block');
        block?.scrollIntoView({ block: 'center' });
        if (block) { block.classList.add('lp-source-mark'); setTimeout(() => block.classList.remove('lp-source-mark'), 2000); }
    };
    const addDraft = (value: string) => { setDraft(current => `${current}${current ? '\n\n' : ''}${value}`); setStatus('草稿已暂存于本次预览'); };
    const response = (question: string) => {
        if (scene === 'connect') return materials.length
            ? `对照你加入的《${notes.find(n => n.id === materials[0])?.title}》，有一处值得修正：\n\n笔记里使用的是“下载完成时的当前 Vault”；本文强调的是“任务启动时捕获的 Vault 会话”。两者在下载期间切换工作区时会不同。\n\n可以把方案补充为：启动时固定任务归属，写入前检查任务是否仍有效，并通过捕获的会话写入。\n\n这是基于本次两份演示材料的对照建议，你可以先写下自己的判断。`
            : '先加入一份已有笔记，才能具体对照观点与前提。你也可以在输入框里直接写下以前的理解。';
        if (scene === 'apply') return '可以先做一个很小的实验：\n\n1. 在 Vault A 启动一个延迟返回的图片下载。\n2. 响应返回前切到 Vault B。\n3. 让请求完成，观察 A、B 的写入日志。\n\n预期：任务通过 A 的固定会话处理结果，B 不产生该任务的缓存文件。再加入取消场景，检查约定取消后是否仍有后续写入。\n\n把实际观察补进笔记，才可以判断你的实现是否符合预期。';
        return `${question.includes('为什么') ? '关键在于区分任务归属与界面位置。' : '结合你引用的这段，可以这样理解：'}\n\n下载开始时属于 Vault A。用户切到 B，只改变了正在看的工作区；返回的内容仍是 A 发起的请求。\n\n所以任务启动时要捕获 A 的会话，后续写入沿用它。取消是否允许已开始的写入完成，则需要单独约定和验证。\n\n原文依据是“任务开始时捕获所属 Vault 的会话”。你可以用自己的话复述，再一起检查是否遗漏条件。`;
    };
    const send = async () => {
        if (!prompt.trim() || busy) { if (!prompt.trim()) setStatus('先输入你想弄清楚的问题。'); return; }
        const text = prompt.trim(), id = ++serial.current, token = ++request.current;
        setMessages(current => [...current, { id: ++serial.current, role: 'user', text }, { id, role: 'assistant', text: '' }]);
        setPrompt(''); setBusy(true); setStatus('演示 AI 正在流式回复');
        const answer = response(text);
        for (let length = 0; length < answer.length; length += 22) {
            await new Promise(resolve => setTimeout(resolve, 35));
            if (token !== request.current) return;
            setMessages(current => current.map(message => message.id === id ? { ...message, text: answer.slice(0, length + 22) } : message));
        }
        setBusy(false); setStatus('模拟回复已完成，可继续追问或选入草稿。');
    };
    const p: LearningProps = {
        quote, articleTitle, scene, messages, prompt, draft, materials: notes.filter(note => materials.includes(note.id)), busy, status, savedTitle,
        onScene(next) { setScene(next); setPrompt(prompts[next]); }, onPrompt: setPrompt, onSend: () => void send(),
        onDraft(value) { setDraft(value); setStatus('草稿已暂存于本次预览'); },
        onAddQuote: () => { addDraft(`> ${quote}\n\n来源：[${articleTitle}](${articleUrl})`); setTab('notes'); },
        onAddAnswer() { const last = [...messages].reverse().find(m => m.role === 'assistant' && m.text); if (last) { addDraft(`AI 建议（演示）：\n${last.text}`); setTab('notes'); } },
        onChooseMaterial: () => setPicker(true), onRemoveMaterial: id => setMaterials(current => current.filter(item => item !== id)),
        onOrganize: () => setOrganizing(true), onSource: source, onClose: () => { setActive(false); requestAnimationFrame(() => {
            const trigger = document.querySelector<HTMLButtonElement>('[aria-label="学习这篇文章"]');
            (trigger?.offsetParent ? trigger : document.querySelector<HTMLButtonElement>('.article-card[aria-current="true"]'))?.focus();
        }); },
    };
    const lastQuestion = messages.find(m => m.role === 'user')?.text || '从一个想弄清楚的问题开始';
    return <>
        {toolbar && createPortal(<button className="icon-button" aria-label="学习这篇文章" title="学习 · 追问与记想法" aria-expanded={active} onClick={() => start('discussion')}><StudyIcon size={15}/></button>, toolbar)}
        {bubble && createPortal(<div className={`lp ${theme} lp-selection`} style={{ left: bubble.x, top: bubble.y }} onMouseDown={event => event.preventDefault()}><button onClick={() => start('discussion', bubble.text)}>追问</button><button onClick={() => start('notes', bubble.text)}>记想法</button></div>, document.body)}
        {active && variant === 'A' && <aside className={`lp ${theme} lp-side`} aria-label="并排学习原型"><header className="lp-heading"><div><span className="lp-eyebrow">学习 · 演示</span><h2 title={lastQuestion}>{lastQuestion}</h2></div><button className="lp-icon" aria-label="关闭学习面板" onClick={p.onClose}><Icon name="close" size={16}/></button></header><div className="lp-tabbar"><button aria-pressed={tab === 'discussion'} onClick={() => setTab('discussion')}>追问{messages.length ? ` · ${messages.filter(m => m.role === 'user').length}` : ''}</button><button aria-pressed={tab === 'notes'} onClick={() => setTab('notes')}>我的想法{draft ? ' · 1' : ''}</button></div><div className="lp-side-body"><Source p={p}/><Materials p={p}/>{tab === 'discussion' ? <><Conversation p={p}/><div className="lp-scene">{(Object.keys(sceneLabels) as Scene[]).map(s => <button aria-pressed={scene === s} key={s} onClick={() => p.onScene(s)}>{sceneLabels[s]}</button>)}</div><Composer p={p}/></> : <Draft p={p}/>}</div><footer className="lp-status" role="status">{status}</footer></aside>}
        {active && variant === 'B' && inlineHost && createPortal(<div className={`lp ${theme}`}><InlineVariant key={tab} p={p} initialTab={tab}/></div>, inlineHost)}
        {active && variant === 'C' && reader && createPortal(<div className={`lp ${theme} lp-notebook-host`}><NotebookVariant p={p}/></div>, reader)}
        <div className={`lp ${theme} lp-switcher`} aria-label={comparing ? '原型方案切换' : '伴读原型状态'}>{comparing && <button className="lp-icon" aria-label="上一个方案" onClick={() => cycle(-1)}><Icon name="back" size={14}/></button>}<span><b>{variant} · {names[variant]}{!comparing && ' · 已选定'}</b><small>问答 {messages.filter(m => m.role === 'user').length} · 草稿 {draft.length} 字</small></span>{comparing && <button className="lp-icon lp-next" aria-label="下一个方案" onClick={() => cycle(1)}><Icon name="back" size={14}/></button>}<button className="lp-button" onClick={() => { selectedBlock.current = document.querySelector('.reader .prose .block:nth-child(3)'); start('discussion', sampleQuote); }}>演示划选</button><button className="lp-button" onClick={() => setShowState(!showState)} aria-expanded={showState}>状态</button></div>
        {showState && <pre className={`lp ${theme} lp-state`}>{JSON.stringify({ variant, active, scene: sceneLabels[scene], quote, materials: p.materials.map(n => n.title), messages, draft, notes: notes.map(n => ({ title: n.title, content: n.content })), savedTitle }, null, 2)}</pre>}
        {picker && <MaterialPicker notes={notes} selected={materials} onClose={() => setPicker(false)} onConfirm={ids => { setMaterials(ids); setPicker(false); setStatus(`已加入 ${ids.length} 份笔记，发送后用于本次讨论。`); }}/>}
        {organizing && <Organize draft={draft} notes={notes} onClose={() => setOrganizing(false)} onSave={(target, title, content) => {
            const note = target ? notes.find(n => n.id === target)! : { id: `new-${Date.now()}`, title: title.trim() || '学习笔记', path: `学习/${title.trim() || '学习笔记'}.md`, content: '' };
            const updated = { ...note, content: `${note.content}${note.content ? '\n\n' : ''}${content}` };
            setNotes(current => target ? current.map(n => n.id === target ? updated : n) : [...current, updated]);
            setSavedTitle(updated.title); setEditor(updated.id); setOrganizing(false); setStatus('已加入演示笔记，可继续编辑。');
        }}/>}
        {editor && <PrototypeDialog title="编辑演示笔记" onClose={() => setEditor(undefined)}><label className="lp-field">{notes.find(n => n.id === editor)?.path}<textarea className="lp-note-editor" aria-label="笔记正文" value={notes.find(n => n.id === editor)?.content || ''} onChange={event => setNotes(current => current.map(n => n.id === editor ? { ...n, content: event.target.value } : n))}/></label><footer><small>已保留在本次预览内存，未写入真实 Vault。</small><button className="lp-primary" onClick={() => setEditor(undefined)}>完成编辑</button></footer></PrototypeDialog>}
    </>;
}

function Source({ p }: { p: LearningProps }) {
    return <details className="lp-source"><summary><Icon name="external" size={13}/><span>引自《{p.articleTitle}》</span></summary><blockquote>{p.quote}</blockquote><button className="lp-button" onClick={p.onSource}>回到原文</button></details>;
}
function StudyIcon({ size = 20 }: { size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1ZM12 5v15"/></svg>;
}
function Materials({ p }: { p: LearningProps }) {
    return <div className="lp-materials">{p.materials.map(note => <span className="lp-material" key={note.id}><Icon name="folder" size={12}/>{note.title}<button className="lp-icon" aria-label={`移除材料 ${note.title}`} onClick={() => p.onRemoveMaterial(note.id)}>×</button></span>)}<button className="lp-button" onClick={p.onChooseMaterial}><Icon name="plus" size={12}/>加入笔记</button></div>;
}
function Conversation({ p }: { p: LearningProps }) {
    const end = useRef<HTMLDivElement>(null);
    useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [p.messages]);
    return <div className="lp-conversation" aria-label="学习讨论" aria-busy={p.busy}>{!p.messages.length && <div className="lp-empty"><StudyIcon size={21}/><h3>想弄清楚什么？</h3><p>从当前这段开始，也可以加入一份自己的笔记一起讨论。</p><button className="lp-button" onClick={() => p.onScene('understand')}>为什么要在任务开始时固定 Vault？</button></div>}{p.messages.map(message => <article key={message.id} className={`lp-message ${message.role}`}><small>{message.role === 'user' ? '我的问题' : 'Folyn AI · 模拟回复'}</small><p>{message.text || '正在组织回复…'}</p></article>)}{!!p.messages.length && !p.busy && <div className="lp-response-actions"><button className="lp-button" onClick={p.onAddAnswer}>将 AI 建议选入草稿</button><button className="lp-button" onClick={p.onSource}>回看原文</button></div>}<div ref={end}/></div>;
}
function Composer({ p }: { p: LearningProps }) {
    return <form className="lp-composer" onSubmit={event => { event.preventDefault(); p.onSend(); }}><label htmlFor="lp-side-question">继续追问</label><textarea id="lp-side-question" placeholder="写下疑问，或用自己的话解释这段…" value={p.prompt} onChange={event => p.onPrompt(event.target.value)}/><div><small>仅使用显示的文章与材料 · 模拟 AI</small><button className="lp-primary" disabled={p.busy} type="submit">{p.busy ? '正在回复…' : '发送问题'}<Icon name="external" size={13}/></button></div></form>;
}
function Draft({ p }: { p: LearningProps }) {
    return <div className="lp-draft"><div className="lp-draft-intro"><h3>留下自己的理解</h3><p>一条判断、一个例子，或一个还没想通的问题。</p></div><label htmlFor="lp-side-draft">我的想法</label><textarea id="lp-side-draft" placeholder="我的理解是…" value={p.draft} onChange={event => p.onDraft(event.target.value)}/><div className="lp-response-actions"><button className="lp-button" onClick={p.onAddQuote}>加入原文摘录</button><button className="lp-button" disabled={!p.messages.some(m => m.role === 'assistant')} onClick={p.onAddAnswer}>选入 AI 建议</button></div><small>草稿在本次预览中保留，随时回来继续写。</small><button className="lp-primary" onClick={p.onOrganize}><Icon name="save" size={14}/>整理到笔记…</button>{p.savedTitle && <p className="lp-saved">已关联《{p.savedTitle}》</p>}</div>;
}
function PrototypeDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose(): void }) {
    const ref = useRef<HTMLDialogElement>(null);
    useLayoutEffect(() => { const previous = document.activeElement as HTMLElement; ref.current?.showModal(); return () => { ref.current?.close(); previous?.isConnected && previous.focus(); }; }, []);
    const dark = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : '';
    return <dialog className={`lp ${dark} lp-dialog`} ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} aria-label={title}><header><h2>{title}</h2><button className="lp-icon" aria-label="关闭弹窗" onClick={onClose}><Icon name="close" size={16}/></button></header>{children}</dialog>;
}
function MaterialPicker({ notes, selected, onConfirm, onClose }: { notes: Material[]; selected: string[]; onConfirm(ids: string[]): void; onClose(): void }) {
    const [ids, setIds] = useState(selected);
    return <PrototypeDialog title="加入笔记作为材料" onClose={onClose}><p className="lp-muted">选择已有笔记，对照观点和适用前提。</p><div className="lp-note-options">{notes.map(note => <button key={note.id} aria-pressed={ids.includes(note.id)} onClick={() => setIds(current => current.includes(note.id) ? current.filter(id => id !== note.id) : [...current, note.id])}><Icon name="folder" size={16}/><span><b>{note.title}</b><small>{note.path}</small></span>{ids.includes(note.id) && <Icon name="check" size={16}/>}</button>)}</div><footer><small>演示 Vault · 仅选择的材料加入讨论</small><button className="lp-primary" onClick={() => onConfirm(ids)}>加入讨论{ids.length ? ` · ${ids.length}` : ''}</button></footer></PrototypeDialog>;
}
function Organize({ draft, notes, onSave, onClose }: { draft: string; notes: Material[]; onSave(target: string | undefined, title: string, content: string): void; onClose(): void }) {
    const [existing, setExisting] = useState(true), [target, setTarget] = useState(notes[0].id), [title, setTitle] = useState('后台任务与 Vault 归属'), [content, setContent] = useState(draft), [error, setError] = useState('');
    return <PrototypeDialog title="整理到笔记" onClose={onClose}><div className="lp-destination"><button aria-pressed={existing} onClick={() => setExisting(true)}>已有笔记</button><button aria-pressed={!existing} onClick={() => setExisting(false)}>新建笔记</button></div>{existing ? <div className="lp-note-options compact">{notes.map(note => <button aria-pressed={target === note.id} key={note.id} onClick={() => setTarget(note.id)}><Icon name="folder" size={14}/><span>{note.title}</span>{target === note.id && <Icon name="check" size={14}/>}</button>)}</div> : <label className="lp-field">笔记标题<input value={title} onChange={event => setTitle(event.target.value)}/></label>}<label className="lp-field">{existing ? '追加到文末的内容 · 可以先修改' : '笔记内容 · 可以先修改'}<textarea className="lp-organize-content" value={content} onChange={event => setContent(event.target.value)}/></label>{existing && <details className="lp-existing-preview"><summary>查看目标笔记当前内容</summary><pre>{notes.find(note => note.id === target)?.content}</pre></details>}{error && <p role="alert">{error}</p>}<footer><small>模拟写入，原笔记内容保留。</small><button className="lp-primary" onClick={() => { if (!content.trim()) { setError('先写下一点想法，再整理到笔记。'); return; } onSave(existing ? target : undefined, title, content); }}>{existing ? '加入这篇笔记' : '创建笔记'}</button></footer></PrototypeDialog>;
}
