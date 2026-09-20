// Tool-window entry: mirrors the ActivityBar page (panel.tsx) feature-for-feature
// — session header, bubbles with pair tags + thinking, toolbar (pair picker,
// paperclip, voice, eraser, trash, send) — but in plain DOM on the isolated
// folyn-extension:// origin, host capabilities via fetch-RPC.
// ai:chat streams via polling: the fetch transport has no push channel, so
// the host returns { jobId } and this script drains deltas with ai:chat-poll
// (~150ms) — token streaming without postMessage.
import { renderMarkdown } from './markdown';

// Relative RPC URL: resolves against this extension's own document URL on
// every platform — `folyn-extension://localhost/ai-assistant/rpc` on
// macOS/Linux, `http://folyn-extension.localhost/ai-assistant/rpc` on
// Windows/WebView2 (where the host serves the scheme as that virtual host
// and the raw `folyn-extension://` form is an unknown scheme — fetch()
// throws before ever reaching the host, so every RPC incl. ai:pairs died
// on Windows and the model picker stayed disabled).
const RPC_URL = 'rpc';

// Storage keys — IDENTICAL to the panel (panel.tsx). Both surfaces share one
// persisted data set: same ext:<id>: namespace (host-side), same shapes.
const ASSISTANTS_KEY = 'ai-assistant:assistants';
const SESSIONS_KEY = 'ai-assistant:sessions';
const MESSAGES_KEY = 'ai-assistant:messages';
const PAIR_KEY = 'ai-assistant:pair';
const ACTIVE_KEY = 'ai-assistant:active';

interface Assistant { id: string; name: string; prompt: string; v: number }
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  ts?: number;
  thinking?: string;
  pair?: Pair;
  attachments?: { name: string; url: string }[];
}
interface Session { id: string; assistantId: string; title: string; ctx: number }
interface PendingImage { id: string; name: string; mediaType: string; data: string }
interface Pair { provider: string; model: string; label?: string; iconUrl?: string }

const DEFAULT_ASSISTANT: Assistant = { id: 'default', name: '默认助手', prompt: '你是一个乐于助人的中文 AI 助手。', v: 1 };

// ponytail: state persists via the storage:get/set RPC — the same
// ext:<id>: namespace and storageClient backend the panel's api.storage uses,
// so both surfaces read/write ONE data set (localStorage on the custom
// folyn-extension:// origin was never persisted by WKWebView). No live
// push between surfaces: each reloads on window focus instead.

async function rpc(method: string, params: unknown): Promise<any> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { return { response: text }; }
  if (!res.ok || (json && json.error)) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

/** dialog:confirm over RPC (host Tauri dialog, gated on permissions.dialog). */
async function confirmDialog(message: string): Promise<boolean> {
  try {
    const r = await rpc('dialog:confirm', { message });
    return r === true || r?.result === true;
  } catch {
    return window.confirm(message);
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function sessionTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= 24 ? t : `${t.slice(0, 24)}…`;
}

const SVG = {
  del: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>',
  edit: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z" /></svg>',
  copy: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M11 5V3.5A1.5 1.5 0 009.5 2H3.5A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" /></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.5 3.5L13 5" /></svg>',
  cpu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" rx="1" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3" /></svg>',
  mic: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0014 0v-1" /><line x1="12" y1="18" x2="12" y2="22" /></svg>',
  stop: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>',
};

const AVATAR_COLORS = ['#3a6ef0', '#6a3af0', '#0a8ab8', '#8040d0', '#cc44cc', '#22a863', '#f5a623', '#e0484d'];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function letterAvatar(p: Pair | null, size: number): HTMLElement {
  const label = p?.label ?? p?.provider ?? '?';
  const a = el('span', 'avatar', (label.trim().charAt(0).toUpperCase() || '?'));
  a.style.width = a.style.height = `${size}px`;
  a.style.fontSize = `${Math.max(8, size - 5)}px`;
  a.style.background = avatarColor(p?.provider ?? '?');
  return a;
}
function providerIcon(p: Pair | null, size: number): HTMLElement {
  if (p?.iconUrl) {
    const img = el('img', 'pimg');
    img.alt = '';
    img.src = p.iconUrl;
    img.style.width = img.style.height = `${size}px`;
    img.onerror = () => img.replaceWith(letterAvatar(p, size));
    return img;
  }
  return letterAvatar(p, size);
}

const SpeechRecognitionCtor: any =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

// ── state ──
let assistants: Assistant[] = [DEFAULT_ASSISTANT];
let msgs: Record<string, Msg[]> = {};
let sessions: Session[] = [];
let activeId = DEFAULT_ASSISTANT.id;
let activeSessionId: string | null = null;
let draft: Assistant | null = null;
let busy = false;
let pairs: Pair[] = [];
let pair: Pair | null = null;
let attachments: PendingImage[] = [];
let recording = false;
let noticeTimer: number | undefined;
/** Persistence gate — no writes before the async load has restored state. */
let loaded = false;

/** Restore state from the shared store. Fresh start when empty/corrupt. */
async function loadState(): Promise<void> {
  const [a, s, m, p, act] = await Promise.all([
    rpc('storage:get', { key: ASSISTANTS_KEY }).catch(() => null),
    rpc('storage:get', { key: SESSIONS_KEY }).catch(() => null),
    rpc('storage:get', { key: MESSAGES_KEY }).catch(() => null),
    rpc('storage:get', { key: PAIR_KEY }).catch(() => null),
    rpc('storage:get', { key: ACTIVE_KEY }).catch(() => null),
  ]);
  if (Array.isArray(a) && a.length > 0) assistants = a;
  if (m && typeof m === 'object' && !Array.isArray(m)) msgs = m;
  if (Array.isArray(s)) sessions = s;
  if (p && typeof p.provider === 'string' && typeof p.model === 'string') pair = p;
  if (!assistants.some((x) => x.id === activeId)) activeId = assistants[0].id;
  // Migration: pre-session data was keyed by assistantId — fold each old
  // conversation into one session so existing chats survive the upgrade.
  if (sessions.length === 0 && Object.keys(msgs).length > 0) {
    const migrated: Session[] = [];
    const remapped: Record<string, Msg[]> = {};
    for (const [assistantId, list] of Object.entries(msgs)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      const id = crypto.randomUUID();
      migrated.push({ id, assistantId, title: '迁移的对话', ctx: 1 });
      remapped[id] = list;
    }
    if (migrated.length > 0) {
      sessions = migrated;
      msgs = remapped;
    }
  }
  // Restore the last active assistant/session.
  const sess = act?.sessionId ? sessions.find((x) => x.id === act.sessionId) : undefined;
  if (sess) {
    activeId = sess.assistantId;
    activeSessionId = sess.id;
  } else if (act?.assistantId && assistants.some((x) => x.id === act.assistantId)) {
    activeId = act.assistantId;
  }
  loaded = true;
}

// ── lookups ──
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const $assistants = $('assistants');
const $messages = $('messages');
const $sessName = $('sessName');
const $sessBtn = $('sessBtn');
const $sessChev = $('sessChev');
const $sessMenu = $('sessMenu');
const $newSessBtn = $<HTMLButtonElement>('newSessBtn');
const $delSessBtn = $<HTMLButtonElement>('delSessBtn');
const $attachRow = $('attachRow');
const $input = $('input') as HTMLTextAreaElement;
const $pairBtn = $<HTMLButtonElement>('pairBtn');
const $pairMenu = $('pairMenu');
const $attachBtn = $<HTMLButtonElement>('attachBtn');
const $micBtn = $<HTMLButtonElement>('micBtn');
const $eraseBtn = $<HTMLButtonElement>('eraseBtn');
const $clearBtn = $<HTMLButtonElement>('clearBtn');
const $sendBtn = $<HTMLButtonElement>('sendBtn');
const $toast = $('toast');
const $toastText = $('toastText');
const $fileInput = $('fileInput') as HTMLInputElement;

function active(): Assistant | undefined {
  return assistants.find((a) => a.id === activeId) ?? assistants[0];
}
function mySessions(): Session[] {
  const a = active();
  return a ? sessions.filter((s) => s.assistantId === a.id) : [];
}
function session(): Session | null {
  const list = mySessions();
  return list.find((s) => s.id === activeSessionId) ?? list[0] ?? null;
}
function currentList(): Msg[] {
  const s = session();
  return s ? msgs[s.id] ?? [] : [];
}
function pairInfo(p: Pair): Pair {
  return pairs.find((x) => x.provider === p.provider && x.model === p.model) ?? p;
}
function userCount(id: string): number {
  return (msgs[id] ?? []).filter((m) => m.role === 'user').length;
}

let writeChain: Promise<void> = Promise.resolve();
function persist(): void {
  if (!loaded) return;
  // Serialized write chain: rpc round-trips can interleave, so queue each
  // snapshot in call order — the last persist's state always lands last.
  writeChain = writeChain
    .then(() => Promise.all([
      rpc('storage:set', { key: ASSISTANTS_KEY, value: assistants }),
      rpc('storage:set', { key: SESSIONS_KEY, value: sessions }),
      rpc('storage:set', { key: MESSAGES_KEY, value: msgs }),
      rpc('storage:set', { key: PAIR_KEY, value: pair }),
      rpc('storage:set', { key: ACTIVE_KEY, value: { assistantId: activeId, sessionId: session()?.id } }),
    ]).then(() => undefined))
    .catch(() => { /* in-memory only */ });
}

// ── rendering ──
function renderAssistants(): void {
  $assistants.innerHTML = '';
  const add = el('button', 'aias-new', '＋ 新建助手');
  add.onclick = () => { draft = { id: '', name: '', prompt: '', v: 1 }; openDraftModal(); };
  $assistants.append(add);

  for (const a of assistants) {
    const row = el('div', `aias-item${a.id === activeId ? ' active' : ''}`);
    row.title = a.prompt;
    row.onclick = () => { activeId = a.id; activeSessionId = null; renderAll(); };
    const name = el('span', 'aias-item-name', a.name);
    const edit = el('span', 'aias-act');
    edit.title = '编辑';
    edit.innerHTML = SVG.edit;
    edit.onclick = (e) => { e.stopPropagation(); draft = { ...a }; openDraftModal(); };
    const del = el('span', 'aias-act del');
    del.title = '删除';
    del.innerHTML = SVG.del;
    del.onclick = (e) => { e.stopPropagation(); void removeAssistant(a.id); };
    row.append(name, edit, del);
    $assistants.append(row);
  }
}

// ── new/edit assistant modal ──
function closeDraftModal(): void {
  document.removeEventListener('keydown', onDraftEsc);
  document.getElementById('draftModal')?.remove();
}
function onDraftEsc(e: KeyboardEvent): void {
  if (e.key === 'Escape') { draft = null; closeDraftModal(); }
}
function openDraftModal(): void {
  closeDraftModal();
  const d = draft;
  if (!d) return;
  const overlay = el('div', 'dlg-overlay');
  overlay.id = 'draftModal';
  overlay.onclick = () => { draft = null; closeDraftModal(); };
  const dlg = el('div', 'dlg');
  dlg.onclick = (e) => e.stopPropagation();
  const hd = el('div', 'dlg-hd');
  hd.append(el('h3', '', d.id ? '编辑助手' : '新建助手'));
  const close = el('button', 'dlg-close', '✕');
  close.onclick = () => { draft = null; closeDraftModal(); };
  hd.append(close);
  const body = el('div', 'dlg-body');
  body.append(el('div', 'dlg-label', '名称'));
  const name = el('input', 'dlg-input') as HTMLInputElement;
  name.value = d.name;
  name.placeholder = '助手名称';
  const prompt = el('textarea', 'aias-input') as HTMLTextAreaElement;
  prompt.style.fontSize = '13px';
  prompt.rows = 6;
  prompt.value = d.prompt;
  prompt.placeholder = '你是一个乐于助人的中文 AI 助手…';
  const ft = el('div', 'dlg-ft');
  const cancel = el('button', 'dlg-btn', '取消');
  cancel.onclick = () => { draft = null; closeDraftModal(); };
  const save = el('button', 'dlg-btn primary', '保存');
  save.disabled = !d.name.trim();
  save.onclick = saveDraft;
  ft.append(cancel, save);
  body.append(name, el('div', 'dlg-label', '人设 / 系统提示词'), prompt);
  dlg.append(hd, body, ft);
  overlay.append(dlg);
  document.body.append(overlay);
  name.oninput = () => { d.name = name.value; save.disabled = !d.name.trim(); };
  prompt.oninput = () => { d.prompt = prompt.value; };
  document.addEventListener('keydown', onDraftEsc);
  name.focus();
}

function saveDraft(): void {
  if (!draft || !draft.name.trim()) return;
  const d: Assistant = draft;
  if (d.id) {
    const orig = assistants.find((x) => x.id === d.id);
    assistants = assistants.map((x) =>
      x.id === d.id
        ? { ...d, name: d.name.trim(), prompt: d.prompt.trim(), v: orig && orig.prompt !== d.prompt.trim() ? x.v + 1 : x.v }
        : x,
    );
  } else {
    const a: Assistant = { id: crypto.randomUUID(), name: d.name.trim(), prompt: d.prompt.trim(), v: 1 };
    assistants = [...assistants, a];
    activeId = a.id;
    activeSessionId = null;
    newSession(a.id);
  }
  draft = null;
  closeDraftModal();
  persist();
  renderAll();
}

function renderHeader(): void {
  const a = active();
  const s = session();
  $sessName.textContent = s?.title ?? a?.name ?? 'AI 助手';
  $sessBtn.title = a?.prompt ?? '';
  const list = currentList();
  $delSessBtn.disabled = !s || list.length === 0;
}

function renderSessMenu(): void {
  $sessMenu.innerHTML = '';
  const cur = session();
  for (const s of mySessions()) {
    const row = el('button', `menu-item${s.id === cur?.id ? ' on' : ''}`);
    row.onclick = () => { activeSessionId = s.id; closeMenus(); persist(); renderAll(); };
    const t = el('span', 't', s.title);
    const n = el('span', 'n', `${userCount(s.id)} 条`);
    row.append(t, n);
    $sessMenu.append(row);
  }
}

function renderMessages(): void {
  $messages.innerHTML = '';
  const list = currentList();
  if (list.length === 0) {
    const empty = el('div', 'chat-empty');
    empty.append(el('div', 'chat-empty-badge', '✦'), el('div', '', '输入消息，开始对话…'));
    $messages.append(empty);
    $messages.scrollTop = $messages.scrollHeight;
    return;
  }
  list.forEach((m, i) => {
    if (m.role === 'user') {
      const row = el('div', 'chat-msg-row end');
      const bubble = el('div', 'chat-msg-bubble chat-msg-bubble-user');
      if (m.attachments && m.attachments.length > 0) {
        const imgs = el('div', 'attach-imgs');
        for (const att of m.attachments) {
          const img = el('img');
          img.src = att.url;
          img.alt = att.name;
          img.title = att.name;
          imgs.append(img);
        }
        bubble.append(imgs);
      }
      bubble.append(el('div', 'chat-msg-user-text', m.content));
      if (m.ts) bubble.append(el('div', 'chat-msg-user-meta', formatTimestamp(m.ts)));
      row.append(bubble);
      $messages.append(row);
      return;
    }
    const row = el('div', 'chat-msg-row');
    const col = el('div', 'ai-col');
    if (m.pair) {
      const info = pairInfo(m.pair);
      const tag = el('span', 'chat-pair-tag');
      tag.append(providerIcon(info, 13), el('span', 'lbl', info.label ?? m.pair.provider), el('span', '', '|'), el('span', '', m.pair.model));
      col.append(tag);
    }
    const bubble = el('div', 'chat-msg-bubble chat-msg-bubble-ai');
    if (m.thinking) {
      const det = el('details', 'msg-thinking') as HTMLDetailsElement;
      if (busy && i === list.length - 1) det.open = true;
      det.append(el('summary', 'msg-thinking-label', 'Thinking'));
      det.append(el('div', 'msg-thinking-body', m.thinking));
      bubble.append(det);
    }
    const body = el('div', 'msg-body');
    if (m.content) {
      const md = el('div', 'msg-md');
      md.innerHTML = renderMarkdown(m.content);
      body.append(md);
    } else if (busy && i === list.length - 1) {
      body.append(el('span', 'cursor-blink', '▎'));
    }
    bubble.append(body);
    if (m.content) {
      const actions = el('div', 'chat-msg-actions');
      const btn = el('button', 'icon-btn xs');
      btn.title = '复制';
      btn.innerHTML = SVG.copy;
      btn.onclick = () => {
        void navigator.clipboard.writeText(m.content).then(() => {
          btn.innerHTML = SVG.check;
          window.setTimeout(() => { btn.innerHTML = SVG.copy; }, 1200);
        }).catch(() => {});
      };
      actions.append(btn);
      bubble.append(actions);
    }
    col.append(bubble);
    row.append(col);
    $messages.append(row);
  });
  $messages.scrollTop = $messages.scrollHeight;
}

function renderInputState(): void {
  const text = $input.value.trim();
  $input.disabled = busy;
  $input.placeholder = busy ? '回复中…' : '输入消息，Enter 发送';
  $sendBtn.disabled = busy || (text.length === 0 && attachments.length === 0);
  $attachBtn.disabled = busy;
  $eraseBtn.disabled = busy;
  $clearBtn.disabled = busy || currentList().length === 0;
  $pairBtn.disabled = pairs.length === 0;
  $pairBtn.title = pair ? `${pair.label ?? pair.provider} / ${pair.model}` : '服务提供商 / 模型';
  $pairBtn.innerHTML = '';
  if (pair) $pairBtn.append(providerIcon(pair, 16));
  else $pairBtn.innerHTML = SVG.cpu;
}

function renderPairMenu(): void {
  $pairMenu.innerHTML = '';
  for (const p of pairs) {
    const on = pair && pair.provider === p.provider && pair.model === p.model;
    const row = el('button', `menu-item pair-item${on ? ' on' : ''}`);
    row.onclick = () => { pair = p; persist(); closeMenus(); renderInputState(); };
    const iconWrap = el('span');
    iconWrap.style.marginTop = '1px';
    iconWrap.append(providerIcon(p, 14));
    const lines = el('span');
    lines.append(el('span', 'l1', p.label ?? p.provider), el('span', 'l2', p.model));
    row.append(iconWrap, lines);
    $pairMenu.append(row);
  }
}

function renderAttachRow(): void {
  $attachRow.innerHTML = '';
  $attachRow.hidden = attachments.length === 0;
  for (const att of attachments) {
    const chip = el('div', 'attach-chip');
    const img = el('img');
    img.src = `data:${att.mediaType};base64,${att.data}`;
    img.alt = att.name;
    const t = el('span', 't', att.name);
    const x = el('button', 'x', '×');
    x.title = '移除附件';
    x.onclick = () => { attachments = attachments.filter((a) => a.id !== att.id); renderAttachRow(); renderInputState(); };
    chip.append(img, t, x);
    $attachRow.append(chip);
  }
}

function renderAll(): void {
  renderAssistants();
  renderHeader();
  renderSessMenu();
  renderMessages();
  renderInputState();
  renderPairMenu();
  renderAttachRow();
}

function showToast(text: string): void {
  $toastText.textContent = text;
  $toast.hidden = false;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { $toast.hidden = true; }, 2500);
}

// ── menus / click-outside ──
function closeMenus(): void {
  $sessMenu.hidden = true;
  $pairMenu.hidden = true;
  $sessChev.classList.remove('open');
}
$sessBtn.onclick = () => {
  const open = $sessMenu.hidden;
  closeMenus();
  $sessMenu.hidden = !open;
  $sessChev.classList.toggle('open', open);
};
$pairBtn.onclick = () => {
  const open = $pairMenu.hidden;
  closeMenus();
  $pairMenu.hidden = !open;
};
document.addEventListener('mousedown', (e) => {
  if ($sessMenu.hidden && $pairMenu.hidden) return;
  const t = e.target as Node;
  if (!$sessMenu.hidden && !$sessBtn.contains(t) && !$sessMenu.contains(t)) closeMenus();
  else if (!$pairMenu.hidden && !$pairBtn.contains(t) && !$pairMenu.contains(t)) closeMenus();
});

// ── sessions ──
function newSession(assistantId: string): Session {
  const s: Session = { id: crypto.randomUUID(), assistantId, title: '新对话', ctx: 1 };
  sessions = [...sessions, s];
  activeSessionId = s.id;
  return s;
}
$newSessBtn.onclick = () => {
  const a = active();
  if (!a) return;
  newSession(a.id);
  closeMenus();
  persist();
  renderAll();
};
$delSessBtn.onclick = () => {
  const s = session();
  if (!s) return;
  void (async () => {
    if (!(await confirmDialog('删除该会话?消息将一并删除。'))) return;
    const target = s;
    const rest = sessions.filter((x) => x.id !== target.id);
    if (rest.filter((x) => x.assistantId === target.assistantId).length === 0) {
      rest.push({ id: crypto.randomUUID(), assistantId: target.assistantId, title: '新对话', ctx: 1 });
    }
    sessions = rest;
    const copy = { ...msgs };
    delete copy[target.id];
    msgs = copy;
    if (activeSessionId === target.id) activeSessionId = null;
    closeMenus();
    persist();
    renderAll();
  })();
};

async function removeAssistant(id: string): Promise<void> {
  if (!(await confirmDialog('删除该助手及其全部会话?'))) return;
  const next = assistants.filter((x) => x.id !== id);
  const doomed = sessions.filter((x) => x.assistantId === id);
  const copy = { ...msgs };
  for (const s of doomed) delete copy[s.id];
  msgs = copy;
  sessions = sessions.filter((x) => x.assistantId !== id);
  if (next.length === 0) {
    assistants = [DEFAULT_ASSISTANT];
    activeId = DEFAULT_ASSISTANT.id;
    activeSessionId = null;
    newSession(DEFAULT_ASSISTANT.id);
  } else {
    assistants = next;
    if (activeId === id) { activeId = next[0].id; activeSessionId = null; }
  }
  persist();
  renderAll();
}

// ── attachments ──
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
function addImageFiles(files: File[]): void {
  for (const f of files.filter((x) => x.type.startsWith('image/'))) {
    if (f.size > MAX_IMAGE_BYTES) continue;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      const comma = url.indexOf(',');
      if (comma < 0) return;
      attachments = [...attachments, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: f.name, mediaType: f.type, data: url.slice(comma + 1) }];
      renderAttachRow();
      renderInputState();
    };
    reader.readAsDataURL(f);
  }
}
$attachBtn.onclick = () => $fileInput.click();
$fileInput.onchange = () => {
  addImageFiles(Array.from($fileInput.files ?? []));
  $fileInput.value = '';
};

// ── voice ──
let recRef: any = null;
let recBase = '';
function toggleVoice(): void {
  if (!SpeechRecognitionCtor) return;
  if (recording) {
    recRef?.stop();
    return;
  }
  const rec = new SpeechRecognitionCtor();
  rec.lang = 'zh-CN';
  rec.interimResults = true;
  rec.continuous = false;
  recBase = $input.value.trimEnd() ? `${$input.value.trimEnd()} ` : '';
  rec.onresult = (e: any) => {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    $input.value = recBase + text;
    renderInputState();
  };
  rec.onend = () => { recording = false; renderMic(); };
  rec.onerror = () => { recording = false; renderMic(); };
  recRef = rec;
  recording = true;
  renderMic();
  rec.start();
}
function renderMic(): void {
  $micBtn.hidden = !SpeechRecognitionCtor;
  if (!SpeechRecognitionCtor) return;
  $micBtn.className = `icon-btn${recording ? ' rec' : ''}`;
  $micBtn.innerHTML = recording ? SVG.stop : SVG.mic;
  $micBtn.title = recording ? '点击停止录音' : '语音输入';
}
$micBtn.onclick = toggleVoice;
renderMic();

// ── toolbar destructive actions ──
$eraseBtn.onclick = () => {
  const s = session();
  if (!s || busy) return;
  void (async () => {
    if (await confirmDialog('清空上下文?将从下一条消息开始全新对话历史(消息保留)。')) {
      sessions = sessions.map((x) => (x.id === s.id ? { ...x, ctx: x.ctx + 1 } : x));
      persist();
      showToast('上下文已清空');
    }
  })();
};
$clearBtn.onclick = () => {
  const s = session();
  if (!s || busy || (msgs[s.id] ?? []).length === 0) return;
  void (async () => {
    if (await confirmDialog('清空该会话的全部消息?')) {
      msgs = { ...msgs, [s.id]: [] };
      persist();
      renderAll();
    }
  })();
};

// ── send ──
async function send(): Promise<void> {
  const a = active();
  if (!a) return;
  let s = session();
  if (!s) s = newSession(a.id);
  const text = $input.value.trim();
  if (!text && attachments.length === 0) return;
  if (busy) return;
  $input.value = '';
  const imgs = attachments;
  attachments = [];
  const prev = msgs[s.id] ?? [];
  const seeded = prev.some((m) => m.role === 'user');
  msgs = {
    ...msgs,
    [s.id]: [
      ...prev,
      {
        role: 'user',
        content: text,
        ts: Date.now(),
        ...(imgs.length > 0 ? { attachments: imgs.map((i) => ({ name: i.name, url: `data:${i.mediaType};base64,${i.data}` })) } : {}),
      },
      { role: 'assistant', content: '', pair: pair ?? undefined },
    ],
  };
  if (s.title === '新对话' && text) {
    sessions = sessions.map((x) => (x.id === s!.id ? { ...x, title: sessionTitle(text) } : x));
  }
  busy = true;
  persist();
  renderAll();
  try {
    // Streaming: ai:chat starts a host-side job and returns { jobId } at once
    // (the fetch transport has no stream channel); ai:chat-poll then drains
    // text/thinking deltas onto the tail bubble every 150ms until done/error.
    const r = await rpc('ai:chat', {
      sessionId: `ai-assistant-${a.id}-${a.v}-${s.id}-${s.ctx}`,
      prompt: seeded || !a.prompt ? text : `${a.prompt}\n\n${text}`,
      ...(pair ? { provider: pair.provider, model: pair.model } : {}),
      ...(imgs.length > 0 ? { images: imgs.map((i) => ({ data: i.data, mediaType: i.mediaType })) } : {}),
    });
    const jobId = typeof r?.jobId === 'string' ? r.jobId : '';
    if (!jobId) throw new Error('ai:chat did not return a jobId');
    let failures = 0;
    for (;;) {
      await new Promise((res) => setTimeout(res, 150));
      let p: any;
      try {
        p = await rpc('ai:chat-poll', { jobId });
        failures = 0;
      } catch (err) {
        // Transient fetch loss — retry a few times before giving up (the
        // host keeps the job alive; deltas accumulate server-side).
        if (++failures > 3) throw err;
        continue;
      }
      const dText = typeof p?.text === 'string' ? p.text : '';
      const dThink = typeof p?.thinking === 'string' ? p.thinking : '';
      if (dText || dThink) patchTail(s.id, dText, dThink);
      if (typeof p?.error === 'string' && p.error) throw new Error(p.error);
      if (p?.done) break;
    }
    finalizeTail(s.id);
  } catch (err) {
    errorTail(s.id, String(err));
  } finally {
    busy = false;
    persist();
    renderAll();
    $input.focus();
  }
}

/** Append polled deltas to the trailing assistant message and re-render. */
function patchTail(sessionId: string, textDelta: string, thinkingDelta: string): void {
  const list = [...(msgs[sessionId] ?? [])];
  const last = list[list.length - 1];
  if (!last || last.role !== 'assistant') return;
  list[list.length - 1] = {
    ...last,
    ...(textDelta ? { content: (last.content || '') + textDelta } : {}),
    ...(thinkingDelta ? { thinking: (last.thinking || '') + thinkingDelta } : {}),
  };
  msgs = { ...msgs, [sessionId]: list };
  renderMessages();
}

/** Mark an empty streamed reply as an empty bubble (mirrors the panel). */
function finalizeTail(sessionId: string): void {
  const list = [...(msgs[sessionId] ?? [])];
  const last = list[list.length - 1];
  if (last && last.role === 'assistant' && !last.content) {
    list[list.length - 1] = { ...last, content: '(空回复)' };
    msgs = { ...msgs, [sessionId]: list };
  }
}

/** Attach the error to the tail — after partial content if any streamed. */
function errorTail(sessionId: string, err: string): void {
  const list = [...(msgs[sessionId] ?? [])];
  const last = list[list.length - 1];
  const line = `[错误] ${err}`;
  if (last && last.role === 'assistant') {
    list[list.length - 1] = { ...last, content: last.content ? `${last.content}\n\n${line}` : line };
  } else {
    list.push({ role: 'assistant', content: line });
  }
  msgs = { ...msgs, [sessionId]: list };
}

$sendBtn.onclick = () => void send();
$input.addEventListener('input', renderInputState);
$input.addEventListener('paste', (e) => {
  const files = Array.from(e.clipboardData?.files ?? []);
  if (files.some((f) => f.type.startsWith('image/'))) {
    e.preventDefault();
    addImageFiles(files);
  }
});
$input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !(e as any).isComposing) {
    e.preventDefault();
    void send();
  }
});

// ── shared-store freshness ──
// The panel writes the same keys while this window is hidden (it reloads on
// its own remount / focus). Reload on focus so each surface sees the other's
// writes; skip mid-turn so an in-flight reply or an open draft isn't clobbered.
window.addEventListener('focus', () => {
  if (busy || draft) return;
  void loadState().then(() => renderAll()).catch(() => {});
});

// ── bootstrap ──
// ponytail: theme is fetched once (env:get) — live theme changes mid-session
// are not pushed on the fetch transport, so the popup follows OS scheme until
// the next open. Fine for a tool window.
void (async () => {
  await loadState();
  renderAll();
  void rpc('env:get', {}).then((r) => {
    if (r?.theme === 'light' || r?.theme === 'dark') {
      document.documentElement.dataset.theme = r.theme;
    }
  }).catch(() => {});

  try {
    const list = await rpc('ai:pairs', {});
    if (Array.isArray(list)) {
      pairs = list as Pair[];
      // Host semantics: the picker always shows a concrete pair — default to
      // the first enabled one so the UI shows what send actually passes.
      pair = pair && pairs.some((x) => x.provider === pair!.provider && x.model === pair!.model)
        ? pair
        : pairs[0] ?? null;
      persist();
    }
  } catch {
    // pairs unavailable — keep the stored pair
  }
  renderAll();
})();
