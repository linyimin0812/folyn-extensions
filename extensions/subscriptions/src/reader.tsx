import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ExtensionAiPair } from 'folyn-extension-sdk';
import type { Article, Body, Mode, Translation } from './model';
import { message, MODES } from './model';
import type { Subscriptions } from './service';
import { clean } from './parse';
import { languageName } from './languages';
import { progress, translatedBlock, documentHtml } from './translation';
import { Modal, Icon, Empty, SourceLink, Spinner } from './components';
import { SaveDialog } from './save';
import { StableHtml } from './stable-html';
import { ImageViewer, type ImageSelection } from './image-viewer';
import { sameModel, TranslationModelField, useTranslationModels } from './translation-model';
import type { LearningArticleInput, LearningTab } from './learning-model';
export function Reader({ service, article, onBack, onClear, onLearn, onReading, reference }: {
    service: Subscriptions;
    article: Article;
    onBack: () => void;
    onClear: () => void;
    onLearn?: (input: LearningArticleInput, tab: LearningTab) => void;
    onReading?: (input: LearningArticleInput) => void;
    reference?: { quote?: string; version?: string; serial: number };
}) {
    useSyncExternalStore(service.subscribe, service.snapshot);
    const repo = useRef(service.repo!).current;
    const [body, setBody] = useState<Body>(), [error, setError] = useState(''), [mode, setMode] = useState<Mode>(repo.state.settings.mode), [cachedTranslation, setTranslation] = useState<Translation>(), [imageHtml, setImageHtml] = useState<Record<string, string>>({}), [translatedHtml, setTranslatedHtml] = useState<Record<string, string>>({}), [saving, setSaving] = useState(false), [consent, setConsent] = useState(false), [pair, setPair] = useState<ExtensionAiPair>(), [image, setImage] = useState<ImageSelection>(), [translationError, setTranslationError] = useState('');
    const scroll = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null), position = useRef<{
        block: string;
        offset: number;
    }>(), restored = useRef('');
    const settings = repo.state.settings, language = settings.language;
    const [learningSelection, setLearningSelection] = useState<{ quote: string; x: number; y: number; language?: string }>();
    const selectionMenu = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        if (!learningSelection || !root.current || !selectionMenu.current) return;
        const place = () => {
            const reader = root.current!, menu = selectionMenu.current!;
            const bounds = reader.getBoundingClientRect(), size = menu.getBoundingClientRect();
            const leftEdge = Math.max(0, bounds.left) + 8, rightEdge = Math.min(innerWidth, bounds.right) - 8;
            const topEdge = Math.max(0, bounds.top + (reader.querySelector('.reader-tools')?.getBoundingClientRect().height || 36)) + 8;
            const bottomEdge = Math.min(innerHeight, bounds.bottom) - 8;
            const { x, y } = learningSelection;
            const left = x + 12 + size.width <= rightEdge ? x + 12 : x - size.width - 12;
            const top = y + 12 + size.height <= bottomEdge ? y + 12 : y - size.height - 12;
            menu.style.left = `${Math.max(leftEdge, Math.min(left, rightEdge - size.width)) - bounds.left}px`;
            menu.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - size.height)) - bounds.top}px`;
            menu.style.visibility = 'visible';
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [learningSelection]);
    const learningInput = useMemo<LearningArticleInput | undefined>(() => body ? { articleId: article.id, title: article.title, url: article.url, version: body.version, text: body.text } : undefined, [body?.version, article.id, article.title]);
    useEffect(() => { if (learningInput) onReading?.(learningInput); }, [learningInput, onReading]);
    useEffect(() => {
        if (!reference?.quote || !body || reference.version !== body.version) return;
        const normalized = (value: string) => value.replace(/\s+/g, ' ').trim();
        const block = [...(scroll.current?.querySelectorAll<HTMLElement>('.block,.document-result') || [])].find(element => normalized(element.textContent || '').includes(normalized(reference.quote!).slice(0, 160)));
        if (!block) return;
        block.scrollIntoView?.({ block: 'center' }); block.classList.add('learning-source-highlight');
        const timer = setTimeout(() => block.classList.remove('learning-source-highlight'), 2200);
        return () => { clearTimeout(timer); block.classList.remove('learning-source-highlight'); };
    }, [reference?.serial, body?.version]);
    const beginLearning = (tab: LearningTab, quote = learningSelection?.quote, quoteLanguage = learningSelection?.language) => {
        if (learningInput) onLearn?.({ ...learningInput, ...(quote ? { quote, language: quoteLanguage } : {}) }, tab);
        setLearningSelection(undefined);
    };
    const captureLearningSelection = (pointer?: { clientX: number; clientY: number }) => {
        const selection = window.getSelection();
        if (!onLearn || !body || !selection?.rangeCount || selection.isCollapsed) { setLearningSelection(undefined); return; }
        const range = selection.getRangeAt(0), parent = range.commonAncestorContainer instanceof Element ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
        if (!parent?.closest('.prose,.document-translation') || !root.current?.contains(parent)) { setLearningSelection(undefined); return; }
        const quote = selection.toString().trim();
        if (!quote) { setLearningSelection(undefined); return; }
        let anchor = pointer;
        if (!anchor) {
            // Keyboard selections follow the active end rather than the first line.
            let rect = range.getBoundingClientRect();
            if (selection.focusNode) {
                const caret = range.cloneRange();
                caret.setStart(selection.focusNode, selection.focusOffset); caret.collapse(true);
                const focusRect = caret.getBoundingClientRect?.();
                if (focusRect?.height) rect = focusRect;
            }
            anchor = { clientX: rect.right, clientY: rect.bottom };
        }
        setLearningSelection({ quote, x: anchor.clientX, y: anchor.clientY, language: mode === 'translated' || parent.closest('.translation,.document-result') ? language : undefined });
    };
    const live = body ? service.translationStream(repo, article, body.version, language) : undefined;
    const translation = live?.translation || cachedTranslation;
    const imageState = body?.images.map(i => i.path || i.error || '').join('\n');
    const models = useTranslationModels(service), { pairs } = models;
    const preferredModel = pair || settings.pair || pairs[0];
    const selectedModel = pairs.find(value => sameModel(value, preferredModel));
    useEffect(() => { setPair(undefined); }, [settings.pair?.provider, settings.pair?.model]);
    const status = useMemo(() => body ? progress(body, translation, language) : { total: 0, done: 0, failed: 0 }, [body, translation, language]);
    useEffect(() => {
        let cancelled = false;
        setBody(undefined);
        setError('');
        setTranslation(undefined);
        setImageHtml({});
        setTranslatedHtml({});
        position.current = undefined;
        restored.current = '';
        void repo.body(article).then(value => {
            if (value && !cancelled)
                setBody(value);
        }).catch(() => {
        });
        void service.loadBody(article).then(value => {
            if (!cancelled)
                setBody(value);
        }).catch(e => {
            if (!cancelled)
                setError(message(e));
        });
        return () => {
            cancelled = true;
        };
    }, [article.id, article.cache?.version]);
    useEffect(() => {
        let cancelled = false;
        if (!body)
            return;
        const stream = service.translationStream(repo, article, body.version, language);
        if (stream) { setTranslation(stream.translation); return; }
        void repo.translation(article, body.version, language).then(t => {
            if (!cancelled)
                setTranslation(t);
        }).catch(e => {
            if (!cancelled)
                setTranslationError(message(e));
        });
        return () => {
            cancelled = true;
        };
    }, [article.id, body?.version, service.revision, language]);
    useEffect(() => {
        let cancelled = false;
        if (!body)
            return;
        void Promise.all(body.blocks.map(async (b) => [b.id, await service.imageHtml(repo, b.html, body)] as const)).then(items => {
            if (!cancelled)
                setImageHtml(Object.fromEntries(items));
        });
        return () => {
            cancelled = true;
        };
    }, [body?.version, imageState]);
    useEffect(() => {
        let cancelled = false;
        if (!body || !translation) {
            setTranslatedHtml({});
            return;
        }
        if (translation.format === 'document') {
            void service.imageHtml(repo, documentHtml(body, translation.document?.content || ''), body).then(html => { if (!cancelled) setTranslatedHtml({ __document: html }); });
            return () => { cancelled = true; };
        }
        void Promise.all(body.blocks.map(async (b) => [b.id, await service.imageHtml(repo, translatedBlock(b.html, b.id, translation, mode === 'bilingual'), body)] as const)).then(items => {
            if (!cancelled)
                setTranslatedHtml(Object.fromEntries(items));
        });
        return () => {
            cancelled = true;
        };
    }, [body?.version, translation, mode, imageState]);
    useEffect(() => {
        if (!body || !settings.autoRead || article.read)
            return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let visible = true;
        const cancel = () => {
            clearTimeout(timer);
            timer = undefined;
        };
        const schedule = () => {
            cancel();
            if (document.visibilityState === 'visible' && document.hasFocus() && visible && !service.readSuppressed.has(article.id))
                timer = setTimeout(() => {
                    if (!service.readSuppressed.has(article.id) && service.repo === repo) {
                        article.read = true;
                        void service.persist(repo);
                    }
                }, 2000);
        };
        const observer = new IntersectionObserver(entries => {
            visible = entries.some(e => e.isIntersecting);
            schedule();
        });
        if (root.current)
            observer.observe(root.current);
        document.addEventListener('visibilitychange', schedule);
        window.addEventListener('focus', schedule);
        window.addEventListener('blur', cancel);
        schedule();
        return () => {
            cancel();
            observer.disconnect();
            document.removeEventListener('visibilitychange', schedule);
            window.removeEventListener('focus', schedule);
            window.removeEventListener('blur', cancel);
        };
    }, [body?.version, article.id, article.read, settings.autoRead]);
    const remember = () => {
        const el = scroll.current;
        if (!el)
            return;
        if (el.scrollTop < 8) {
            const p = { block: '__top', offset: 0 };
            article.positions[mode] = p;
            position.current = p;
            return;
        }
        const top = el.getBoundingClientRect().top;
        const blocks = [...el.querySelectorAll<HTMLElement>('[data-block]')];
        let nearest = blocks[0];
        for (const b of blocks) {
            if (b.getBoundingClientRect().top <= top + 40)
                nearest = b;
            else
                break;
        }
        if (nearest) {
            const p = { block: nearest.dataset.block!, offset: top - nearest.getBoundingClientRect().top };
            article.positions[mode] = p;
            position.current = p;
        }
    };
    const restore = (p: {
        block: string;
        offset: number;
    } | undefined) => {
        const el = scroll.current;
        if (!el || !p)
            return;
        if (p.block === '__top') {
            el.scrollTop = 0;
            return;
        }
        const block = [...el.querySelectorAll<HTMLElement>('[data-block]')].find(e => e.dataset.block === p.block);
        if (block)
            el.scrollTop += block.getBoundingClientRect().top - el.getBoundingClientRect().top + p.offset;
    };
    useLayoutEffect(() => {
        if (!body || !Object.keys(imageHtml).length)
            return;
        const key = `${article.id}:${body.version}:${mode}`;
        if (restored.current === key)
            return;
        restore(position.current || article.positions[mode]);
        restored.current = key;
    }, [body?.version, mode, imageHtml, translatedHtml]);
    useEffect(() => {
        const el = scroll.current;
        if (!el)
            return;
        let timer: ReturnType<typeof setTimeout>;
        const onScroll = () => {
            remember();
            clearTimeout(timer);
            timer = setTimeout(() => void service.persist(repo), 350);
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            clearTimeout(timer);
            el.removeEventListener('scroll', onScroll);
            void repo.persist();
        };
    }, [article.id, body?.version, mode]);
    async function translate(restart = false) {
        if (!body)
            return;
        if (!status.total) {
            service.notify('本文无需翻译', 'info');
            return;
        }
        const selected = translation && !restart ? { provider: translation.provider, model: translation.model } : selectedModel;
        if (!selected) {
            setTranslationError('配置 AI 模型后即可翻译');
            return;
        }
        const consentKey = `${selected.provider}/${selected.model}`;
        if (settings.consent !== consentKey) {
            setConsent(true);
            return;
        }
        setTranslationError('');
        await service.translate(article, body, selected, restart);
    }
    useEffect(() => {
        if (mode !== 'original' && body && status.done < status.total && !service.translating.has(article.id)) {
            // Open the disclosure once when entering translation mode. Errors/retries remain explicit.
            if (!translation && pairs.length)
                void translate();
        }
    }, [mode, body?.version, pairs.length]);
    const clickContent = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const anchor = target.closest('a');
        if (anchor) {
            e.preventDefault();
            void service.host.support.openExternal(anchor.href).catch(e => setError(message(e)));
            return;
        }
        const img = target.closest('img');
        if (img?.src) {
            e.preventDefault();
            setImage({ src: img.currentSrc || img.src, alt: img.alt, trigger: img });
        }
    };
    // StableHtml preserves loaded image nodes; annotate them after its DOM patch.
    useLayoutEffect(() => {
        root.current?.querySelectorAll<HTMLImageElement>('.prose img').forEach(img => {
            if (img.closest('a')) return;
            img.tabIndex = 0;
            img.setAttribute('role', 'button');
            img.setAttribute('aria-label', `${img.alt || '文章图片'}，查看大图`);
        });
    });
    const keyContent = (event: React.KeyboardEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLImageElement) || target.closest('a') || !target.src || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        setImage({ src: target.currentSrc || target.src, alt: target.alt, trigger: target });
    };
    const sourceNames = article.sourceIds.map(s => repo.state.sources.find(x => x.id === s)?.name).filter(Boolean).join('、') || '保留文章';
    return <section className="reader" ref={root} aria-label="文章阅读区" onMouseUp={captureLearningSelection} onKeyUp={event => { if (event.shiftKey) captureLearningSelection(); }}>
    <div className="reader-tools">
    <button className="back" onClick={onBack}>
    <Icon name="back" size={14}/>返回列表</button>
    <div className="segmented" aria-label="阅读模式">{Object.entries(MODES).map(([key, label]) => <button key={key} aria-pressed={mode === key} className={mode === key ? 'active' : ''} onClick={() => {
            remember();
            setMode(key as Mode);
        }}>{label}</button>)}</div>
    <span className="grow"/>
    {onLearn && <button className="icon-button reader-learning-button" data-learning-trigger aria-label="伴读这篇文章" title="伴读 · 提问或记下理解" disabled={!body} onMouseDown={event => event.preventDefault()} onClick={() => beginLearning('chat')}><Icon name="book" size={15}/></button>}
    <button className="icon-button" aria-label="收藏" title={article.starred ? '取消收藏' : '收藏'} aria-pressed={article.starred} onClick={() => {
        article.starred = !article.starred;
        void service.persist(repo);
    }}><Icon name="star" size={16}/></button>
    <button className="icon-button" aria-label="保存到 Vault" title="保存到 Vault" disabled={!body} onClick={() => setSaving(true)}><Icon name="save" size={16}/></button>
    <details>
    <summary className="icon-button" aria-label="更多阅读操作" title="更多阅读操作"><Icon name="more" size={16}/></summary>
    <div className="stack">
    <button onClick={() => {
        service.readSuppressed.add(article.id);
        article.read = false;
        void service.persist(repo);
    }}>标为未读</button>
    <button disabled={service.downloading.has(article.id)} onClick={() => {
        setError('');
        void service.loadBody(article, true).then(setBody).catch(e => setError(message(e)));
    }}>重新获取正文与图片</button>
    <button onClick={() => void navigator.clipboard.writeText(article.url).then(() => service.notify('已复制来源链接')).catch(e => setError(message(e)))}>复制来源链接</button>
    <button onClick={onClear}>清理本文缓存…</button>
    </div>
    </details>
    </div>
    <div className="reader-scroll" ref={scroll} onScroll={() => { if (learningSelection) setLearningSelection(undefined); }}>
    <div className="reader-content">
    <header className="article-header">
    <p className="muted">{sourceNames} · {article.read ? '已读' : '未读'}</p>
    <h1>{article.title}</h1>
    <div className="row muted">{article.author && <span>{article.author}</span>}<span>{article.published ? new Date(article.published).toLocaleString() : `发现于 ${new Date(article.discovered).toLocaleString()}`}</span>
    <SourceLink url={article.url} service={service}>查看原网页 ↗</SourceLink>
    </div>
    </header>
    {error && <div className="statusbox error" role="status">{error}<div className="actions">
        <button onClick={() => void service.loadBody(article, true).then(b => {
            setBody(b);
            setError('');
        }).catch(e => setError(message(e)))}>重试获取</button>
        <SourceLink service={service} url={article.url}>查看原网页</SourceLink>
        </div>
        </div>}
    {!body && !error && <div className="statusbox" role="status">正在获取正文并缓存资源，可以继续浏览文章列表…</div>}
    {!body && article.summary && <div className="statusbox">
        <strong>当前仅有摘要</strong>
        <p>{article.summary}</p>
        <small>联网后可获取全文。</small>
        </div>}
    {body && <>
        <div className="cache-status">
        <span>{article.cache?.pending && service.downloading.has(article.id) ? '正文已缓存，正在缓存图片' : body.images.some(i => !i.path) || body.unsupported ? '部分离线可用' : '正文与受支持图片已缓存，可离线阅读'}</span>{body.images.length > 0 && <span title="按正文中识别到的不同图片地址计数"> · 图片 {body.images.filter(i => i.path).length}/{body.images.length}</span>}
        {body.images.some(i => !i.path) && <div className="image-cache-actions">
            <button disabled={service.downloading.has(article.id)} aria-busy={service.downloading.has(article.id)} onClick={() => {
                setError('');
                void service.retryImages(article).then(setBody).catch(e => setError(message(e)));
            }}>{service.downloading.has(article.id) ? <><Spinner/>已处理 {article.cache?.processed || 0}/{body.images.length} 张</> : '重试未缓存图片'}</button>
            {body.images.some(i => i.error && !i.path) && <details><summary>{body.images.filter(i => i.error && !i.path).length} 张未缓存 · 查看原因</summary><ul>{body.images.map((i, index) => !i.path && i.error ? <li key={i.url}><SourceLink service={service} url={i.url}>查看第 {index + 1} 张原图</SourceLink><span>{i.error}</span></li> : null)}</ul></details>}
        </div>}
        {body.unsupported && <p>部分图表或交互内容需要在原网页查看。</p>}{article.translationVersion && article.translationVersion !== body.version && <p>原文已更新，之前的译文对应旧版本。<button onClick={async () => {
                const old = await repo.bodyAt(article.id, article.translationVersion!);
                if (old) {
                    setBody(old);
                    setMode('bilingual');
                }
                else
                    setTranslationError('旧正文缓存已清理，可重新翻译当前正文');
            }}>查看旧译文</button>
            </p>}</div>
    {body.version !== article.cache?.version && <div className="statusbox">正在查看旧正文及对应译文。<button onClick={() => void repo.body(article).then(b => {
                if (b)
                    setBody(b);
            })}>返回当前正文</button>
            </div>}{mode !== 'original' && <div className="statusbox">
            <div className="row between">
            <span>{status.total ? live && !live.translation.cancelled ? live.received ? `正在接收译文 · 已返回 ${live.received} 字` : '正在请求翻译，返回后实时显示…' : status.done === status.total ? '全文翻译完成' : translation?.format === 'document' ? '译文尚未完成' : translation ? '已有译文尚未完成，可重新翻译' : '等待开始翻译' : '本文无需翻译'}</span>{service.translating.has(article.id) ? <button onClick={() => service.cancelTranslation(article)}>取消翻译</button> : status.done < status.total ? <button onClick={() => void translate()}>继续翻译</button> : status.total > 0 ? <button onClick={() => {
                settings.consent = undefined;
                setConsent(true);
            }}>重新翻译…</button> : null}</div>{translation && <small>{translation.provider} / {translation.model} · {translation.language}{translation.cancelled ? ' · 已取消，已返回译文已保留' : ''}</small>}{status.done < status.total && <p>{translation?.format === 'document' ? '译文实时显示，原文可随时查看。' : '重新翻译将直接接收完整译文，不再校验段落结构。'}</p>}{translationError && <p className="error">{translationError} <button onClick={() => service.host.support.openSettings()}>打开 AI 配置</button>
                </p>}{status.failed > 0 && <details>
                <summary>查看翻译问题</summary>{[...new Set(Object.values(translation?.errors || {}))].map(e => <p key={e}>{e}</p>)}</details>}</div>}
    {translation?.format === 'document' && mode !== 'original' ? <div className="prose document-translation" onClick={clickContent} onKeyDown={keyContent}>

        <section className={`document-result ${live && !translation.cancelled ? 'is-streaming' : ''}`} aria-label="译文" data-block="translation-document">
            {mode === 'bilingual' && <h2 className="document-label">译文</h2>}
            <StableHtml key={`${article.id}:${body.version}:${language}`} html={translatedHtml.__document || documentHtml(body, translation.document?.content || '').replace(/<img\b[^>]*>/g, '')}/>
        </section>
        {mode === 'bilingual' && <section className="document-original" aria-label="原文"><h2 className="document-label">原文</h2>{body.blocks.map(b => <div className="block" data-block={b.id} key={b.id}><StableHtml html={imageHtml[b.id] || clean(b.html).replace(/<img\b[^>]*>/g, '')}/></div>)}</section>}
    </div> : <>
    <div className="prose" onClick={clickContent} onKeyDown={keyContent}>{body.blocks.map(b => <div className="block" data-block={b.id} key={b.id}>{mode !== 'translated' && <StableHtml html={imageHtml[b.id] || clean(b.html).replace(/<img\b[^>]*>/g, '<span>图片正在处理…</span>')}/>}{mode !== 'original' && (mode === 'bilingual' ? <div className="translation"><StableHtml html={translatedHtml[b.id] || ''}/></div> : <StableHtml html={translatedHtml[b.id] || imageHtml[b.id] || clean(b.html).replace(/<img\b[^>]*>/g, '<span>图片正在处理…</span>')}/>)}</div>)}</div></>}

        </>}
    {article.saved.length > 0 && <div className="statusbox">
        <h3>已保存文档</h3>{article.saved.map(s => <div className="row" key={s.path}>
            <button disabled={s.missing} onClick={async () => {
                try {
                    if (!await repo.vault.exists(s.path)) {
                        s.missing = true;
                        await service.persist(repo);
                        return;
                    }
                    await repo.vault.open(s.path);
                }
                catch (e) {
                    setError(message(e));
                }
            }}>{MODES[s.mode]} · {s.path}</button>{s.missing && <span>保存文件已移除，可重新保存</span>}</div>)}</div>}
    </div>
    </div>
    {learningSelection && <div ref={selectionMenu} className="learning-selection" aria-label="选段学习操作" onMouseDown={event => event.preventDefault()} onMouseUp={event => event.stopPropagation()}><button onClick={() => beginLearning('chat')}>追问</button><button onClick={() => beginLearning('notes')}>记想法</button></div>}
    {saving && body && <SaveDialog service={service} article={article} body={body} translation={translation} initialMode={mode} onClose={() => setSaving(false)}/>}
    {consent && body && <Modal title="全文翻译" icon="translate" size="compact" description="保留原文，连贯翻译并缓存正文" onClose={() => setConsent(false)} footer={<>
            <button onClick={() => {
                setConsent(false);
                setMode('original');
            }}>继续阅读原文</button>
            <button className="primary" disabled={models.loading || !selectedModel} onClick={() => {
                const selected = selectedModel;
                if (!selected)
                    return;
                const restart = !!translation && (status.done === status.total || !sameModel(translation, selected));
                settings.consent = `${selected.provider}/${selected.model}`;
                settings.pair = { provider: selected.provider, model: selected.model };
                void service.persist(repo);
                setConsent(false);
                setTranslationError('');
                void service.translate(article, body, selected, restart);
            }}>开始翻译</button>
            </>}>
        <div className="stack">
        <div className="modal-callout"><strong>翻译本文完整正文 · {languageName(language)}</strong><p>将发送当前文章的可翻译正文。代码、公式、图片文件和其他 Vault 内容不发送。</p></div><TranslationModelField {...models} value={preferredModel} onChange={setPair}/>
            <div className="modal-inline-row"><small>使用 Folyn 已配置并启用的模型</small><button className="quiet" onClick={() => service.host.support.openSettings()}>AI 模型配置<Icon name="external" size={13}/></button></div>
            {translation && !sameModel(translation, selectedModel) && <small>更换模型后将重新生成本文译文。</small>}
            <p className="muted">整篇翻译并实时显示返回内容，超长正文才分块。取消后保留已返回译文；可在当前 Vault 设置中更改模型和目标语言。</p>
        </div>
        </Modal>}
    {image && <ImageViewer image={image} onClose={() => setImage(undefined)}/>}
  </section>;
}
