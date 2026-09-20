import { useEffect, useRef, useState, useCallback } from 'react';
import type { ExtensionApi } from 'folyn-extension-sdk';
import { renderMarkdown } from './markdown';
import {
  ATTACH_ACCEPT,
  DOC_SVG,
  buildPrompt,
  isTextFile,
  readFiles,
  type PendingAttachment,
} from './attachments';

export interface Assistant {
  id: string;
  name: string;
  prompt: string;
  /** persona version — bumping it starts a fresh AI session so a edited prompt takes effect */
  v: number;
}

interface Msg {
  role: 'user' | 'assistant';
  content: string;
  /** reasoning tokens (msg-thinking collapsible block, mirrors AiPanel) */
  thinking?: string;
  /** user message send time (chat-msg-user-meta, mirrors AiPanel) */
  ts?: number;
  /** pair used for this assistant turn (chat-pair-tag, mirrors AiPanel) */
  pair?: Pair;
  /** attachments sent with this user turn ({name, data: URL} for images, {name} for text files) — persisted */
  attachments?: { name: string; url?: string }[];
}

/** A chat session under an assistant (mirrors the host AiPanel session model). */
interface Session {
  id: string;
  assistantId: string;
  title: string;
  /** context version — the eraser bumps it to start a fresh rig history while keeping messages */
  ctx: number;
}

/** Pending input attachment (image base64 or text file content) — see attachments.ts. */
export type PendingImage = PendingAttachment;

const ASSISTANTS_KEY = 'ai-assistant:assistants';
const SESSIONS_KEY = 'ai-assistant:sessions';
const MESSAGES_KEY = 'ai-assistant:messages';
const PAIR_KEY = 'ai-assistant:pair';
const ACTIVE_KEY = 'ai-assistant:active';

interface Pair {
  provider: string;
  model: string;
  /** provider display label (localized host-side via ai.pairs) */
  label?: string;
  /** host asset URL for the provider logo */
  iconUrl?: string;
}
const DEFAULT_ASSISTANT: Assistant = {
  id: 'default',
  name: '默认助手',
  prompt: '你是一个乐于助人的中文 AI 助手。',
  v: 1,
};

let apiRef: ExtensionApi | undefined;
export function setApi(api: ExtensionApi | undefined) {
  apiRef = api;
}
let dialogsRef: { confirm(message: string): Promise<boolean> } | undefined;
export function setDialogs(d: { confirm(message: string): Promise<boolean> } | undefined) {
  dialogsRef = d;
}
/** Host dialog (ctx.ui.dialogs, Tauri popup) with a window.confirm fallback —
 *  the host refuses when permissions.dialog is missing, hence the try/catch. */
async function confirmDialog(message: string): Promise<boolean> {
  try {
    return (await dialogsRef?.confirm(message)) ?? window.confirm(message);
  } catch {
    return window.confirm(message);
  }
}

// Layout mirrors the host AiPanel: same host classes (chat-msg-*, chat-pair-tag,
// chat-toast, chat-send-btn, chat-empty, chat-msg-scroll, cursor-blink) and the
// same Tailwind strings AiPanel/ChatInput/ChatMessageList use, so the page is
// visually identical to the built-in AI panel. Only the assistant sidebar and
// the draft form need extension CSS — themed off host vars.
// Injected once at module load — trusted pages render in the host document.
const CSS = `
.aias-root{flex:1;display:flex;height:100%;min-height:0;font-family:var(--font-ui);font-size:12.5px;color:var(--t1);background:var(--panel)}
.aias-side{width:200px;flex-shrink:0;border-right:1px solid var(--brd);display:flex;flex-direction:column;overflow-y:auto;padding:8px 8px 12px}
.aias-new{display:flex;align-items:center;justify-content:center;gap:6px;padding:6px 8px;margin-bottom:6px;border-radius:6px;border:1px dashed var(--brd2);background:transparent;color:var(--t3);font:inherit;font-size:12px;cursor:pointer;transition:all .12s}
.aias-new:hover{background:var(--hov);color:var(--t1);border-color:var(--brd2)}
.aias-item{display:flex;align-items:center;gap:4px;padding:6px 8px;border-radius:6px;cursor:pointer;color:var(--t2);font-size:12px}
.aias-item:hover{background:var(--hov)}
.aias-item.active{background:var(--accdim);color:var(--acc);font-weight:600}
.aias-item-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aias-act{width:20px;height:20px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;color:var(--t3);font-size:11px;opacity:0;transition:opacity .12s}
.aias-item:hover .aias-act{opacity:1}
.aias-act:hover{background:var(--hov);color:var(--t1)}
.aias-act.del:hover{color:var(--red)}
.aias-input{width:100%;padding:7px 12px;border-radius:8px;border:1px solid var(--brd);background:var(--inp);color:var(--t1);font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
.aias-input:focus{border-color:var(--acc);box-shadow:0 0 0 3px var(--accglow)}
.aias-input::placeholder{color:var(--t3)}
textarea.aias-input{resize:vertical}
`;
if (typeof document !== 'undefined') {
  const el = document.createElement('style');
  el.textContent = CSS;
  document.head.appendChild(el);
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sessionTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= 24 ? t : `${t.slice(0, 24)}…`;
}

// Deterministic letter-avatar (host ProviderIcon's fallback, same palette).
const AVATAR_COLORS = ['#3a6ef0', '#6a3af0', '#0a8ab8', '#8040d0', '#cc44cc', '#22a863', '#f5a623', '#e0484d'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/** Provider logo with the host's letter-avatar fallback. iconUrl is a host
 *  asset URL — valid because trusted pages run in the host document. */
function ProviderImg({ pair, size }: { pair: Pair | null; size: number }) {
  const [imgError, setImgError] = useState(false);
  if (pair?.iconUrl && !imgError) {
    return (
      <img
        src={pair.iconUrl}
        alt=""
        onError={() => setImgError(true)}
        className="shrink-0"
        style={{ width: size, height: size, objectFit: 'contain' }}
      />
    );
  }
  const label = pair?.label ?? pair?.provider ?? '?';
  const char = label.trim().charAt(0).toUpperCase() || '?';
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-full text-white font-bold"
      style={{ width: size, height: size, background: avatarColor(pair?.provider ?? '?'), fontSize: Math.max(8, size - 5) }}
    >
      {char}
    </span>
  );
}

const COPY_SVG = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="5" width="8" height="8" rx="1.5" />
    <path d="M11 5V3.5A1.5 1.5 0 009.5 2H3.5A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
  </svg>
);
const CHECK_SVG = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 8.5l3.5 3.5L13 5" />
  </svg>
);
const TRASH_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
  </svg>
);
// Cpu-style trigger when no pair is picked (host PairSelector uses Cpu for the empty value).
const CPU_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
    <path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" />
  </svg>
);
const SEND_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="19" x2="12" y2="5" />
    <polyline points="5 12 12 5 19 12" />
  </svg>
);
const ERASER_SVG = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 20H7L3 16a1.4 1.4 0 010-2l10-10a1.4 1.4 0 012 0l6 6a1.4 1.4 0 010 2l-8 8" />
    <path d="M8 9l7 7" />
  </svg>
);
const PAPERCLIP_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </svg>
);


export function ChatAssistantPanel() {
  const [assistants, setAssistants] = useState<Assistant[]>([DEFAULT_ASSISTANT]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [msgs, setMsgs] = useState<Record<string, Msg[]>>({});
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState(DEFAULT_ASSISTANT.id);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Assistant | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [pair, setPair] = useState<Pair | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pairOpen, setPairOpen] = useState(false);
  const [sessOpen, setSessOpen] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  /** Persistence gate — the persist effects below must not write the initial
   *  default state before the async load has restored the stored one (they
   *  used to wipe messages/pair on every launch). */
  const [loaded, setLoaded] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const prevLenRef = useRef(0);
  const pairRef = useRef<HTMLDivElement>(null);
  const sessRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Load the shared store (mounted once and on window focus — the tool
   *  window writes the same keys while the main window is unfocused). */
  const loadFromStorage = useCallback(async () => {
    try {
      const a = (await apiRef?.storage.get(ASSISTANTS_KEY)) as Assistant[] | undefined;
      if (Array.isArray(a) && a.length) setAssistants(a);
      const s = (await apiRef?.storage.get(SESSIONS_KEY)) as Session[] | undefined;
      const m = (await apiRef?.storage.get(MESSAGES_KEY)) as Record<string, Msg[]> | undefined;
      // Migration: pre-session data was keyed by assistantId — fold each old
      // conversation into one session so existing chats survive the upgrade.
      let restored: Session[] | null = null;
      if (Array.isArray(s) && s.length > 0) {
        restored = s;
        if (m && typeof m === 'object') setMsgs(m);
      } else if (m && typeof m === 'object' && Object.keys(m).length > 0) {
        const migrated: Session[] = [];
        const remapped: Record<string, Msg[]> = {};
        for (const [assistantId, list] of Object.entries(m)) {
          if (!Array.isArray(list) || list.length === 0) continue;
          const id = crypto.randomUUID();
          migrated.push({ id, assistantId, title: '迁移的对话', ctx: 1 });
          remapped[id] = list;
        }
        restored = migrated;
        setMsgs(remapped);
      }
      if (restored) {
        setSessions(restored);
        // Restore the last active assistant/session.
        const act = (await apiRef?.storage.get(ACTIVE_KEY)) as { assistantId?: string; sessionId?: string } | undefined;
        const actSession = act?.sessionId ? restored.find((x) => x.id === act.sessionId) : undefined;
        if (actSession) {
          setActiveId(actSession.assistantId);
          setActiveSessionId(actSession.id);
        } else if (act?.assistantId) {
          setActiveId(act.assistantId);
        }
      }
      const p = (await apiRef?.storage.get(PAIR_KEY)) as Pair | undefined;
      if (p && typeof p.provider === 'string' && typeof p.model === 'string') setPair(p);
      const list = (await apiRef?.ai.pairs()) as Pair[] | undefined;
      if (Array.isArray(list)) {
        setPairs(list);
        // Host semantics: the picker always shows a concrete pair — default
        // to the first enabled one. Without this the UI displayed pairs[0]
        // while sends passed no override and fell through to the (possibly
        // unset) host extensionPair default.
        setPair((prev) =>
          prev && list.some((x) => x.provider === prev.provider && x.model === prev.model) ? prev : list[0] ?? null,
        );
      }
    } catch {
      // keep defaults
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  // Shared-store freshness: the tool window writes the same keys while the
  // main window is unfocused (page switches remount this component anyway);
  // reload on focus. Skip mid-turn so an in-flight reply isn't clobbered.
  useEffect(() => {
    const onFocus = () => {
      if (busy) return;
      void loadFromStorage();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [busy, loadFromStorage]);

  useEffect(() => {
    if (!loaded) return;
    void apiRef?.storage.set(ASSISTANTS_KEY, assistants).catch(() => {});
  }, [assistants, loaded]);
  useEffect(() => {
    if (!loaded || sessions.length === 0) return;
    void apiRef?.storage.set(SESSIONS_KEY, sessions).catch(() => {});
  }, [sessions, loaded]);
  useEffect(() => {
    if (!loaded) return;
    void apiRef?.storage.set(MESSAGES_KEY, msgs).catch(() => {});
  }, [msgs, loaded]);
  useEffect(() => {
    if (!loaded) return;
    void apiRef?.storage.set(PAIR_KEY, pair).catch(() => {});
  }, [pair, loaded]);
  useEffect(() => {
    if (notice === null) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  const active = assistants.find((x) => x.id === activeId) ?? assistants[0];
  const mySessions = active ? sessions.filter((s) => s.assistantId === active.id) : [];
  const session = mySessions.find((s) => s.id === activeSessionId) ?? mySessions[0] ?? null;
  const list = session ? msgs[session.id] ?? [] : [];

  useEffect(() => {
    if (!loaded) return;
    void apiRef?.storage.set(ACTIVE_KEY, { assistantId: activeId, sessionId: session?.id }).catch(() => {});
  }, [activeId, session?.id, loaded]);

  // Auto-follow streaming — same pinned logic as the host ChatMessageList.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (list.length > prevLenRef.current) pinnedRef.current = true;
    prevLenRef.current = list.length;
    if (pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [list]);

  // Click-outside closes the pair / session popovers (PairSelector behavior).
  useEffect(() => {
    if (!pairOpen && !sessOpen) return;
    const onDown = (e: MouseEvent) => {
      if (pairOpen && pairRef.current && !pairRef.current.contains(e.target as Node)) setPairOpen(false);
      if (sessOpen && sessRef.current && !sessRef.current.contains(e.target as Node)) setSessOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pairOpen, sessOpen]);

  function setList(id: string, items: Msg[]) {
    setMsgs((prev) => ({ ...prev, [id]: items }));
  }
  function append(id: string, delta: string) {
    setMsgs((prev) => {
      const items = [...(prev[id] ?? [])];
      const last = items[items.length - 1];
      if (last && last.role === 'assistant') {
        items[items.length - 1] = { ...last, content: last.content + delta };
      } else {
        items.push({ role: 'assistant', content: delta });
      }
      return { ...prev, [id]: items };
    });
  }
  function appendThinking(id: string, delta: string) {
    setMsgs((prev) => {
      const items = [...(prev[id] ?? [])];
      const last = items[items.length - 1];
      if (last && last.role === 'assistant') {
        items[items.length - 1] = { ...last, thinking: (last.thinking ?? '') + delta };
      } else {
        items.push({ role: 'assistant', content: '', thinking: delta });
      }
      return { ...prev, [id]: items };
    });
  }

  function newSession(assistantId: string): Session {
    const s: Session = { id: crypto.randomUUID(), assistantId, title: '新对话', ctx: 1 };
    setSessions((prev) => [...prev, s]);
    setActiveSessionId(s.id);
    return s;
  }

  async function deleteSession(id: string) {
    if (!(await confirmDialog('删除该会话?消息将一并删除。'))) return;
    setSessions((prev) => {
      const target = prev.find((x) => x.id === id);
      const rest = prev.filter((x) => x.id !== id);
      if (target && rest.filter((x) => x.assistantId === target.assistantId).length === 0) {
        const fresh: Session = { id: crypto.randomUUID(), assistantId: target.assistantId, title: '新对话', ctx: 1 };
        setActiveSessionId(fresh.id);
        return [...rest, fresh];
      }
      return rest;
    });
    setMsgs((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSessOpen(false);
  }

  async function removeAssistant(id: string) {
    if (!(await confirmDialog('删除该助手及其全部会话?'))) return;
    setAssistants((prev) => {
      const next = prev.filter((x) => x.id !== id);
      if (next.length === 0) {
        setMsgs((m) => {
          const copy = { ...m };
          for (const s of sessions.filter((x) => x.assistantId === id)) delete copy[s.id];
          return copy;
        });
        setSessions((s) => s.filter((x) => x.assistantId !== id));
        setActiveId(DEFAULT_ASSISTANT.id);
        return [DEFAULT_ASSISTANT];
      }
      setMsgs((m) => {
        const copy = { ...m };
        for (const s of sessions.filter((x) => x.assistantId === id)) delete copy[s.id];
        return copy;
      });
      setSessions((s) => s.filter((x) => x.assistantId !== id));
      if (activeId === id) setActiveId(next[0].id);
      return next;
    });
  }

  // ── attachments (images + text files) ──

  async function addFiles(files: File[]) {
    const added = await readFiles(files);
    if (added.length > 0) {
      setAttachments((prev) => [...prev, ...added]);
    } else if (files.length > 0) {
      setNotice('仅支持 ≤4MB 图片、≤256KB 文本或 ≤16MB PDF');
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  async function send() {
    const a = active;
    const s = session ?? (a ? newSession(a.id) : null);
    const text = input.trim();
    if (!a || !s || (!text && attachments.length === 0) || busy) return;
    setInput('');
    const sent = attachments;
    setAttachments([]);
    const imgs = sent.filter((x) => x.kind === 'image');
    const pdfs = sent.filter((x) => x.kind === 'pdf');
    const prompt = buildPrompt(text, sent.filter((x) => x.kind === 'text'));
    const prevList = msgs[s.id] ?? [];
    const seeded = prevList.some((m) => m.role === 'user');
    setList(s.id, [
      ...prevList,
      {
        role: 'user',
        content: text,
        ts: Date.now(),
        ...(sent.length > 0 ? { attachments: sent.map((x) => (x.kind === 'image' ? { name: x.name, url: `data:${x.mediaType};base64,${x.data}` } : { name: x.name })) } : {}),
      },
      { role: 'assistant', content: '', pair: pair ?? undefined },
    ]);
    if (s.title === '新对话' && text) {
      setSessions((prev) => prev.map((x) => (x.id === s.id ? { ...x, title: sessionTitle(text) } : x)));
    }
    setBusy(true);
    try {
      await apiRef?.ai.chat({
        sessionId: `ai-assistant-${a.id}-${a.v}-${s.id}-${s.ctx}`,
        prompt: seeded || !a.prompt ? prompt : `${a.prompt}\n\n${prompt}`,
        ...(pair ? { provider: pair.provider, model: pair.model } : {}),
        ...(imgs.length + pdfs.length > 0
          ? {
              images: [
                ...imgs.map((i) => ({ data: i.data, mediaType: i.mediaType })),
                ...pdfs.map((p) => ({ data: p.data, mediaType: 'application/pdf' })),
              ],
            }
          : {}),
        onEvent: (e) => {
          if (e.type === 'text' && e.content) append(s.id, e.content);
          else if (e.type === 'thinking' && e.content) appendThinking(s.id, e.content);
          else if (e.type === 'error') append(s.id, `\n[错误] ${e.content ?? ''}`);
        },
      });
    } catch (err) {
      append(s.id, `\n[错误] ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyMsg(i: number, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(`${session?.id}:${i}`);
      window.setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      // clipboard rejected; leave button in copy state
    }
  }

  function saveDraft() {
    if (!draft || !draft.name.trim()) return;
    if (draft.id) {
      setAssistants((prev) =>
        prev.map((x) =>
          x.id === draft.id
            ? { ...draft, name: draft.name.trim(), prompt: draft.prompt.trim(), v: x.prompt !== draft.prompt.trim() ? x.v + 1 : x.v }
            : x,
        ),
      );
    } else {
      const a: Assistant = { id: crypto.randomUUID(), name: draft.name.trim(), prompt: draft.prompt.trim(), v: 1 };
      setAssistants((prev) => [...prev, a]);
      setActiveId(a.id);
      newSession(a.id);
    }
    setDraft(null);
  }

  const userCount = (id: string): number => (msgs[id] ?? []).filter((m) => m.role === 'user').length;
  const currentPair: Pair | null = pair;
  /** Merge a persisted msg pair with the live pair list (label/iconUrl may have
   *  been missing when the message was stored). */
  const pairInfo = (p: Pair): Pair => pairs.find((x) => x.provider === p.provider && x.model === p.model) ?? p;

  return (
    <div className="aias-root">
      <aside className="aias-side">
        <button className="aias-new" onClick={() => setDraft({ id: '', name: '', prompt: '', v: 1 })}>
          ＋ 新建助手
        </button>
        {assistants.map((a) => (
          <div key={a.id} title={a.prompt} className={`aias-item${a.id === active?.id ? ' active' : ''}`} onClick={() => setActiveId(a.id)}>
            <span className="aias-item-name">{a.name}</span>
            <span className="aias-act" onClick={(e) => { e.stopPropagation(); setDraft({ ...a }); }} title="编辑">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" />
              </svg>
            </span>
            <span className="aias-act del" onClick={(e) => { e.stopPropagation(); void removeAssistant(a.id); }} title="删除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </span>
          </div>
        ))}
      </aside>

      <main className="flex-1 min-w-0 h-full bg-panel flex flex-col overflow-hidden relative">
        {/* Header — mirrors AiPanel's 34px session bar: title dropdown + new/delete */}
        <div className="flex items-center justify-between h-[34px] pl-3 pr-2 border-b border-brd shrink-0">
          <div className="relative min-w-0 flex-1" ref={sessRef}>
            <button
              className="flex items-center gap-1.5 cursor-pointer bg-transparent border-none py-1 px-1.5 rounded-md max-w-full min-w-0 transition-colors hover:bg-hov"
              onClick={() => setSessOpen(!sessOpen)}
            >
              <span className="text-[13px] font-semibold text-t1 truncate"><span className="text-acc">✦</span> {session?.title ?? active?.name ?? 'AI 助手'}</span>
              <svg className={`shrink-0 text-t3 transition-transform duration-150 ${sessOpen ? 'rotate-180' : ''}`} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {sessOpen && (
              <div className="absolute top-full left-0 mt-1 min-w-[200px] max-w-[280px] max-h-[300px] overflow-y-auto bg-panel border border-brd rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.14)] z-[100] p-1">
                {mySessions.map((s) => (
                  <button
                    key={s.id}
                    className={`flex items-center justify-between gap-2 w-full py-1.5 px-2 rounded-md cursor-pointer bg-transparent border-none text-left text-[12px] transition-colors hover:bg-hov ${s.id === session?.id ? 'bg-accdim text-acc' : 'text-t2'}`}
                    onClick={() => { setActiveSessionId(s.id); setSessOpen(false); }}
                  >
                    <span className="truncate min-w-0 flex-1 flex items-center gap-1.5">{s.title}</span>
                    <span className="shrink-0 text-[10px] text-t3">{userCount(s.id)} 条</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-t3 cursor-pointer transition-all duration-[120ms] hover:bg-hov hover:text-t1" onClick={() => { if (active) newSession(active.id); setSessOpen(false); }} title="新建会话">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button className="w-[26px] h-[26px] flex items-center justify-center rounded-md text-t3 cursor-pointer transition-all duration-[120ms] hover:bg-hov hover:text-red disabled:opacity-40 disabled:cursor-not-allowed" onClick={() => session && void deleteSession(session.id)} disabled={!session || list.length === 0} title="删除会话">
              {TRASH_SVG}
            </button>
          </div>
        </div>

        {/* Messages — same scroll container / rows / bubbles as ChatMessageList */}
        <div
          ref={scrollRef}
          onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
          }}
          className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto chat-msg-scroll p-3"
          role="log"
        >
          {list.length === 0 && (
            <div className="chat-empty">
              <div className="chat-empty-badge"><span>✦</span></div>
              <div className="text-t3 text-[12px]">输入消息，开始对话…</div>
            </div>
          )}
          {list.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="chat-msg-row justify-end">
                <div className="chat-msg-bubble chat-msg-bubble-user">
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                      {m.attachments.map((att, j) =>
                        att.url ? (
                          <img key={j} className="w-14 h-14 object-cover rounded-md shrink-0" src={att.url} alt={att.name} title={att.name} />
                        ) : (
                          <span key={j} className="inline-flex items-center gap-1.5 max-w-[160px] px-1.5 py-1 bg-panel border border-brd rounded-md text-[11px] text-t2 truncate" title={att.name}>
                            <span className="text-t3 shrink-0 inline-flex" dangerouslySetInnerHTML={{ __html: DOC_SVG }} />
                            <span className="truncate">{att.name}</span>
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  <div className="chat-msg-user-text">{m.content}</div>
                  {m.ts ? <div className="chat-msg-user-meta">{formatTimestamp(m.ts)}</div> : null}
                </div>
              </div>
            ) : (
              <div key={i} className="chat-msg-row">
                <div className="flex flex-col flex-1 min-w-0">
                  {m.pair ? (
                    <span className="chat-pair-tag mb-1 px-0.5">
                      <ProviderImg pair={pairInfo(m.pair)} size={13} />
                      <span className="font-semibold text-t2">{pairInfo(m.pair).label ?? m.pair.provider}</span>
                      <span className="text-t3">|</span>
                      <span className="text-t3">{m.pair.model}</span>
                    </span>
                  ) : null}
                  <div className="chat-msg-bubble chat-msg-bubble-ai">
                    {m.thinking && (
                      <details className="msg-thinking" open={busy && i === list.length - 1}>
                        <summary className="msg-thinking-label">Thinking</summary>
                        <div className="msg-thinking-body">{m.thinking}</div>
                      </details>
                    )}
                    <div className="text-[12px] leading-[1.6] text-t1 break-words">
                      {m.content ? (
                        <div className="msg-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                      ) : (
                        busy && <span className="cursor-blink">▎</span>
                      )}
                    </div>
                    {m.content && (
                      <div className="chat-msg-actions">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center w-6 h-6 rounded-md text-t3 hover:bg-hov hover:text-t1 transition-colors"
                          onClick={() => void copyMsg(i, m.content)}
                          aria-label="复制"
                          title="复制"
                        >
                          {copiedKey === `${session?.id}:${i}` ? CHECK_SVG : COPY_SVG}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>

        {/* Input — ChatInputBox composition. Toolbar: pair picker (with provider
            logos) + paperclip (image/text/pdf attachments) on the leading side;
            eraser (clear context) + trash (clear messages)
            + round send button on the trailing side. Mode button omitted — the
            extension has a single Chat mode, a one-item dropdown is noise. */}
        <div className="flex flex-col py-2.5 px-3 border-t border-brd shrink-0">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {attachments.map((att) => (
                <div key={att.id} className="flex items-center gap-1.5 py-1 px-1.5 bg-panel border border-brd rounded-lg text-[11px] text-t2 max-w-[160px]">
                  {att.kind === 'image' ? (
                    <img className="w-7 h-7 object-cover rounded-md shrink-0" src={`data:${att.mediaType};base64,${att.data}`} alt={att.name} />
                  ) : (
                    <span className="w-7 h-7 flex items-center justify-center text-t3 shrink-0" dangerouslySetInnerHTML={{ __html: DOC_SVG }} />
                  )}
                  <span className="truncate min-w-0 flex-1">{att.name}</span>
                  <button className="w-4 h-4 flex items-center justify-center rounded-full text-[10px] text-t3 cursor-pointer shrink-0 transition-all duration-100 bg-transparent border-none hover:bg-hov hover:text-red" onClick={() => removeAttachment(att.id)} aria-label="移除附件">×</button>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-col border border-brd rounded-xl bg-inp transition-[border-color,box-shadow] duration-150 focus-within:border-acc focus-within:shadow-[0_0_0_3px_var(--accglow)]">
            <textarea
              className="flex-1 w-full resize-none border-none rounded-t-xl pt-2.5 px-3 pb-1 text-[12px] font-ui leading-[18px] bg-transparent outline-none placeholder:text-t3 text-t1"
              placeholder={busy ? '回复中…' : '输入消息，Enter 发送'}
              value={input}
              rows={2}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData.files);
                if (files.some((f) => f.type.startsWith('image/') || isTextFile(f))) {
                  e.preventDefault();
                  void addFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !(e.nativeEvent as any).isComposing) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="flex items-center gap-1 py-1 px-1.5 pb-2">
              <div ref={pairRef} className="relative">
                <button
                  type="button"
                  className={`w-7 h-7 flex items-center justify-center rounded-md cursor-pointer transition-all duration-[120ms] disabled:opacity-40 disabled:cursor-not-allowed ${pairOpen ? 'bg-hov text-t1' : 'text-t3 hover:bg-hov hover:text-t1'}`}
                  onClick={() => setPairOpen((o) => !o)}
                  disabled={pairs.length === 0}
                  title={currentPair ? `${currentPair.label ?? currentPair.provider} / ${currentPair.model}` : '服务提供商 / 模型'}
                  aria-label="选择服务提供商 / 模型"
                >
                  {currentPair ? <ProviderImg pair={currentPair} size={16} /> : CPU_SVG}
                </button>
                {pairOpen && (
                  <div className="absolute bottom-full mb-1 left-0 w-max min-w-[220px] max-w-[360px] max-h-[300px] overflow-y-auto bg-panel border border-brd rounded-lg shadow-[0_8px_24px_rgba(0,0,0,.14)] z-[100] p-1">
                    {pairs.map((p) => {
                      const on = currentPair?.provider === p.provider && currentPair?.model === p.model;
                      return (
                        <div
                          key={`${p.provider}|${p.model}`}
                          className={`flex items-start gap-1.5 py-1.5 px-2 rounded-md cursor-pointer whitespace-nowrap transition-colors ${on ? 'bg-accdim text-acc' : 'text-t2 hover:bg-hov hover:text-t1'}`}
                          onClick={() => { setPair(p); setPairOpen(false); }}
                        >
                          <span className="mt-[1px]"><ProviderImg pair={p} size={14} /></span>
                          <span className="flex flex-col">
                            <span className="block text-[12px] leading-tight font-semibold text-t1">{p.label ?? p.provider}</span>
                            <span className="block text-[11px] leading-tight mt-0.5">{p.model}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md text-t3 cursor-pointer transition-all duration-[120ms] hover:bg-hov hover:text-t1 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                title="附加图片/文件"
                aria-label="附加图片/文件"
              >
                {PAPERCLIP_SVG}
              </button>
              <div className="flex-1" />
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md text-t3 cursor-pointer transition-all duration-[120ms] hover:bg-hov hover:text-t1 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => void (async () => {
                  if (!session || busy) return;
                  if (await confirmDialog('清空上下文?将从下一条消息开始全新对话历史(消息保留)。')) {
                    setSessions((prev) => prev.map((x) => (x.id === session.id ? { ...x, ctx: x.ctx + 1 } : x)));
                    setNotice('上下文已清空');
                  }
                })()}
                disabled={busy}
                title="清空上下文"
                aria-label="清空上下文"
              >
                {ERASER_SVG}
              </button>
              <button
                type="button"
                className="w-7 h-7 flex items-center justify-center rounded-md text-t3 cursor-pointer transition-all duration-[120ms] hover:bg-hov hover:text-t1 disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => void (async () => {
                  if (!session || busy || list.length === 0) return;
                  if (await confirmDialog('清空该会话的全部消息?')) setList(session.id, []);
                })()}
                disabled={busy || list.length === 0}
                title="清空对话"
                aria-label="清空对话"
              >
                {TRASH_SVG}
              </button>
              <button
                type="button"
                className="chat-send-btn"
                onClick={() => void send()}
                disabled={busy || (input.trim().length === 0 && attachments.length === 0)}
                title="发送"
                aria-label="发送"
              >
                {SEND_SVG}
              </button>
            </div>
          </div>
          {notice && (
            <div className="chat-toast" role="status">
              <span className="dot" />
              <span>{notice}</span>
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ATTACH_ACCEPT}
          style={{ display: 'none' }}
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </main>

      {/* New/edit assistant modal — host .dlg-* classes (same as settings modals). */}
      {draft && (
        <div
          className="dlg-overlay"
          onClick={() => setDraft(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setDraft(null); }}
        >
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            <div className="dlg-hd">
              <h3>{draft.id ? '编辑助手' : '新建助手'}</h3>
              <button className="dlg-close" onClick={() => setDraft(null)}>✕</button>
            </div>
            <div className="dlg-body">
              <div className="dlg-label">名称</div>
              <input
                className="dlg-input"
                autoFocus
                value={draft.name}
                placeholder="助手名称"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="dlg-label">人设 / 系统提示词</div>
              <textarea
                className="aias-input"
                style={{ height: 'auto', fontSize: 13 }}
                rows={6}
                value={draft.prompt}
                placeholder="你是一个乐于助人的中文 AI 助手…"
                onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              />
            </div>
            <div className="dlg-ft">
              <button className="dlg-btn" onClick={() => setDraft(null)}>取消</button>
              <button className="dlg-btn primary" disabled={!draft.name.trim()} onClick={saveDraft}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
