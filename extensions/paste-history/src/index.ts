// Paste History — sandbox-tier Folyn tool.
//
// Runs in its own Tauri WebviewWindow served from
// folyn-extension://localhost/paste-history/index.html. Left pane shows the
// selected entry in full (text / image); right pane lists the history,
// newest first. Capture polls the clipboard every second via fetch-RPC:
// text via clipboard:read; when the clipboard has no text flavor (an image
// was copied), image mode via clipboard:read-image. Images pasted (⌘V) or
// dropped into this window are captured too. While an image sits unchanged
// on the clipboard the host's change-count gate returns `{unchanged:true}`
// instead of re-decoding/transferring the image (CPU). History persists to
// history.json in the extension data dir via fs:write (debounced 400 ms).
// Saves are BLOCKED until the session has successfully read history.json
// (or confirmed it absent): a transient fs:read failure (e.g. this window
// opened before the main window's RPC listener attached → rpc timeout)
// must not silently wipe the persisted history — the failed load is
// retried from the 1 s poll until it resolves.
//
// CSP note: sandbox pages carry `default-src 'none'` with no img-src, so
// images must NOT go through <img src="data:…"> — they render via canvas +
// createImageBitmap (in-process decode, no URL fetch, no CSP involvement).

import {
  MAX_IMAGE_B64,
  type ImageItem,
  type Item,
  formatTime,
  isNoFileError,
  isNoTextError,
  isUnknownMethodError,
  newId,
  normalizeItem,
  previewText,
  shouldCapture,
  trim,
} from './logic';
import iconSvg from './icon.svg';

// Row action icons (stroke + currentColor — they inherit the row's state:
// muted normally, accent when the row is selected). Rendered only on hover.
const COPY_ACT_ICON =
  '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="72" stroke-linejoin="round"><rect x="362.667" y="362.667" width="533.333" height="533.333" rx="72"/><path d="M128 637.333V200c0-39.764 32.236-72 72-72h437.333"/></svg>';
const TRASH_ACT_ICON =
  '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="72" stroke-linecap="round" stroke-linejoin="round"><path d="M128 256h768M341.333 256v-85.333a42.667 42.667 0 0 1 42.667-42.667h256a42.667 42.667 0 0 1 42.667 42.667V256M213.333 256l36.99 548.44a85.333 85.333 0 0 0 85.141 80.893h353.072a85.333 85.333 0 0 0 85.141-80.893L810.667 256M426.667 469.333v298.667M597.333 469.333v298.667"/></svg>';

// Relative RPC URL: resolves against this extension's own document URL on
// every platform — `folyn-extension://localhost/paste-history/rpc` on
// macOS/Linux, `http://folyn-extension.localhost/paste-history/rpc` on
// Windows/WebView2 (where the host serves the scheme as that virtual host
// and the raw `folyn-extension://` form is an unknown scheme — fetch()
// would throw before ever reaching the host).
const RPC_URL = 'rpc';
const HISTORY_FILE = 'history.json';
const POLL_MS = 1000;
const SIDE_MIN = 120; // splitter clamp — keeps icon + preview + time readable
const SIDE_MAX = 480;

// ---------- host RPC bridge (tool-window fetch transport) ----------

async function rpc<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const json: unknown = await res.json().catch(() => null);
  const obj = json !== null && typeof json === 'object' ? (json as Record<string, unknown>) : null;
  const err = obj && typeof obj.error === 'string' ? obj.error : null;
  if (!res.ok || err) throw new Error(err ?? `HTTP ${res.status}`);
  return json as T;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ---------- state ----------

let items: Item[] = [];
let selectedId: string | null = null;
let sideWidth: number | null = null; // custom right-column width (null = CSS default); persisted with the history
let lastSeenText: string | null = null; // last clipboard value the poller observed
let lastImageData: string | null = null; // last clipboard image (rgba b64) observed
let skipNextImageCapture = false; // set after writing an image back — the next poll sees our own write
let imageRpcSupported = true; // probed once at startup; false on older hosts
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let clearArmed = false;
let clearDisarm: ReturnType<typeof setTimeout> | undefined;
let historyLoaded = false; // a read of history.json resolved this session (file present OR confirmed absent)
let loadErrMsg: string | null = null; // persistent read failure — saves stay blocked to protect the file
let loadRetryInFlight = false;
let savePausedWarned = false; // one-time toast when a save is blocked by a failed load

let listEl: HTMLElement;
let viewerHeadEl: HTMLElement;
let viewerBodyEl: HTMLElement;
let statusEl: HTMLElement;
let errEl: HTMLElement;
let countEl: HTMLElement;
let clearBtn: HTMLButtonElement;
const rowById = new Map<string, HTMLElement>();

// ---------- persistence ----------

async function load(): Promise<void> {
  let content: string;
  try {
    content = await rpc<string>('fs:read', { path: HISTORY_FILE });
  } catch (e) {
    const msg = errMsg(e);
    if (isNoFileError(msg)) {
      historyLoaded = true; // first run — no file yet, nothing to lose
      loadErrMsg = null;
      return;
    }
    // Read failed (typical cause: this window opened before the MAIN
    // window's RPC listener attached — the request never gets dispatched
    // and times out). Start empty but keep saves BLOCKED: overwriting now
    // would turn a transient read failure into permanent history loss.
    // retryLoad (piggybacked on the 1 s poll) self-heals this in seconds.
    loadErrMsg = msg;
    return;
  }
  // Read OK — corrupt/unparseable content means rewrite allowed (nothing
  // salvageable; bad entries drop, never throw).
  historyLoaded = true;
  loadErrMsg = null;
  try {
    const parsed: unknown = JSON.parse(content);
    const o = parsed !== null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    if (o && o.v === 1 && Array.isArray(o.items)) {
      items = trim((o.items as unknown[]).map(normalizeItem).filter((it): it is Item => it !== null));
      const w = o.sideWidth;
      if (typeof w === 'number' && w >= SIDE_MIN && w <= SIDE_MAX) sideWidth = w;
    }
  } catch {
    // unreadable → start empty; next save rewrites it
  }
}

// Self-heal a failed load(): retried from every poll tick until the read
// resolves (the common cause — tool opened before the main window's RPC
// listener attached — clears within seconds). Captures that piled up while
// saves were blocked are prepended (deduped) so nothing visible is lost.
async function retryLoad(): Promise<void> {
  if (loadErrMsg === null || loadRetryInFlight) return;
  loadRetryInFlight = true;
  try {
    const unsaved = items;
    await load();
    if (loadErrMsg !== null) return; // still failing — the next poll retries
    if (lastSeenText === null) {
      // Same boot semantics as main(): don't re-capture the newest text on
      // the first poll after recovery.
      const newest = items[0];
      lastSeenText = newest && newest.kind === 'text' ? newest.text : null;
    }
    const key = (it: Item) => (it.kind === 'text' ? `t:${it.text}` : `i:${it.data}`);
    const loadedKeys = new Set(items.map(key));
    items = trim([...unsaved.filter((it) => !loadedKeys.has(key(it))), ...items]);
    if (unsaved.length > 0) scheduleSave(); // persist the recovered merge
    if (selectedId === null) selectedId = items[0]?.id ?? null;
    renderList();
    renderViewer();
  } finally {
    loadRetryInFlight = false;
  }
}

function scheduleSave(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), 400);
}

async function saveNow(): Promise<void> {
  if (!historyLoaded) {
    // Never overwrite history.json from a session that could not read it —
    // a transient read failure must not become permanent data loss.
    if (!savePausedWarned) {
      savePausedWarned = true;
      toast('历史文件读取失败，保存已暂停');
    }
    return;
  }
  try {
    await rpc('fs:write', {
      path: HISTORY_FILE,
      content: JSON.stringify({ v: 1, items, sideWidth: sideWidth ?? undefined }),
    });
  } catch (e) {
    toast(`保存失败: ${errMsg(e)}`);
  }
}

// ---------- capture ----------

async function poll(): Promise<void> {
  void retryLoad(); // a failed startup load self-heals from the poll cadence
  let text: string | null;
  try {
    text = await rpc<string | null>('clipboard:read', {});
  } catch (e) {
    const msg = errMsg(e);
    if (isNoTextError(msg)) {
      // No TEXT flavor on the clipboard — usually an image was copied (or the
      // clipboard is empty). Switch to image mode; a red error here would be
      // a false alarm.
      setPollErr(null);
      await pollImage();
      return;
    }
    // Persistent header status, not a transient toast: clipboard read is the
    // one capability this tool depends on, and a silent failure looks exactly
    // like "nothing is being captured". Keep polling — it self-heals once
    // the host allows the read again.
    setPollErr(`剪贴板读取失败: ${msg}`);
    return;
  }
  setPollErr(null);
  lastImageData = null; // a text copy supersedes any image — allow the same image to re-capture later
  if (text !== null && shouldCapture(text, lastSeenText)) {
    add({ id: newId(), kind: 'text', ts: Date.now(), text });
  }
  lastSeenText = text;
}

// Image side of the poll. `clipboard:read-image` returns `{ rgba, w, h }`
// (rgba = base64 raw pixels) or null when the clipboard has no image flavor.
// Exact-string compare against the last observed image detects change —
// no hash needed, the base64 is already in memory.
async function pollImage(): Promise<void> {
  if (!imageRpcSupported) return;
  let img: { rgba: string; w: number; h: number } | { unchanged: true } | null;
  try {
    img = await rpc<{ rgba: string; w: number; h: number } | { unchanged: true } | null>(
      'clipboard:read-image',
      {},
    );
  } catch (e) {
    if (isUnknownMethodError(errMsg(e))) {
      imageRpcSupported = false; // older host — images stay paste/drop-only
      return;
    }
    setPollErr(`剪贴板图片读取失败: ${errMsg(e)}`);
    return;
  }
  setPollErr(null);
  if (img !== null && 'unchanged' in img) {
    if (lastImageData !== null) return; // same image as before — nothing to do
    // Fresh realm (window just opened): we never saw the current image.
    // Ask for the full payload once — the host cache stays cheap for the
    // steady state.
    try {
      img = await rpc<{ rgba: string; w: number; h: number } | null>(
        'clipboard:read-image',
        { full: true },
      );
    } catch {
      return;
    }
  }
  if (img === null) {
    // Neither text nor image — empty clipboard.
    lastSeenText = null;
    lastImageData = null;
    return;
  }
  lastSeenText = null; // an image copy supersedes any text
  if (img.rgba !== lastImageData) {
    if (skipNextImageCapture) {
      // This is our own write-back (recopyImage) — absorb it, don't re-capture.
      skipNextImageCapture = false;
      lastImageData = img.rgba;
      return;
    }
    lastImageData = img.rgba;
    void captureRgba(img.rgba, img.w, img.h);
  } else if (skipNextImageCapture) {
    skipNextImageCapture = false;
  }
}

// Clipboard images arrive as raw RGBA; re-encode to PNG via canvas so the
// item flows through the same pipeline as pasted/dropped images.
async function captureRgba(rgbaB64: string, w: number, h: number): Promise<void> {
  try {
    const data = new Uint8ClampedArray(b64ToBytes(rgbaB64));
    if (data.length !== w * h * 4) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.putImageData(new ImageData(data, w, h), 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (blob) await captureImage(blob, 'image/png');
  } catch (e) {
    toast(`图片读取失败: ${errMsg(e)}`);
  }
}

async function captureImage(blob: Blob, mime: string): Promise<void> {
  try {
    if ((blob.size * 4) / 3 > MAX_IMAGE_B64) {
      toast('图片过大，未保存');
      return;
    }
    const data = await blobToB64(blob);
    const dims = await measure(blob);
    add({ id: newId(), kind: 'image', ts: Date.now(), mime, data, w: dims?.w, h: dims?.h });
  } catch (e) {
    toast(`图片读取失败: ${errMsg(e)}`);
  }
}

async function measure(blob: Blob): Promise<{ w: number; h: number } | null> {
  try {
    const bmp = await createImageBitmap(blob);
    const dims = { w: bmp.width, h: bmp.height };
    bmp.close();
    return dims;
  } catch {
    return null;
  }
}

async function blobToB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function wireCaptureEvents(): void {
  // Images arrive only when pasted into this window (clipboard RPC is
  // text-only). Pasted text needs no handler here — the 1 s poll picks it up.
  document.addEventListener('paste', (e: ClipboardEvent) => {
    const files: Blob[] = [];
    for (const it of Array.from(e.clipboardData?.items ?? [])) {
      if (it.kind === 'file' && it.type.startsWith('image/')) {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      for (const f of files) void captureImage(f, f.type);
    }
  });

  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    for (const f of Array.from(e.dataTransfer?.files ?? [])) {
      if (f.type.startsWith('image/')) void captureImage(f, f.type);
    }
  });

  // Catch up immediately when the user comes back to this window.
  window.addEventListener('focus', () => void poll());
}

// ---------- actions ----------

function add(item: Item): void {
  const hadSelection = selectedId !== null;
  items = trim([item, ...items]);
  if (!hadSelection) selectedId = item.id; // populate the viewer from the first capture
  renderList();
  if (!hadSelection) renderViewer();
  scheduleSave();
}

async function recopy(item: Item): Promise<void> {
  if (item.kind === 'image') return recopyImage(item);
  try {
    await rpc('clipboard:write', { text: item.text });
  } catch (e) {
    toast(`复制失败: ${errMsg(e)}`);
    return;
  }
  lastSeenText = item.text; // the poll must not re-capture what we just wrote
  items = [{ ...item, ts: Date.now() }, ...items.filter((it) => it.id !== item.id)];
  selectedId = item.id;
  renderList();
  renderViewer();
  scheduleSave();
  toast('已复制到剪贴板');
}

// Write a stored image (PNG base64) back to the clipboard. The PNG is
// passed through as-is — decoding happens Rust-side (host write-image →
// JsImage::Bytes), no JS canvas round-trip (which mis-sized large images).
async function recopyImage(item: ImageItem): Promise<void> {
  try {
    await rpc('clipboard:write-image', { png: item.data });
  } catch (e) {
    toast(`复制失败: ${errMsg(e)}`);
    return;
  }
  // Our own write bumps the change count — the next poll would re-capture
  // this image as a NEW entry. Mark it to be absorbed instead.
  skipNextImageCapture = true;
  lastSeenText = null;
  items = [{ ...item, ts: Date.now() }, ...items.filter((it) => it.id !== item.id)];
  selectedId = item.id;
  renderList();
  renderViewer();
  scheduleSave();
  toast('已复制到剪贴板');
}

function deleteItem(id: string): void {
  items = items.filter((it) => it.id !== id);
  if (selectedId === id) selectedId = items[0]?.id ?? null;
  renderList();
  renderViewer();
  scheduleSave();
}

function clearAll(): void {
  items = [];
  selectedId = null;
  renderList();
  renderViewer();
  scheduleSave();
}

// ---------- render ----------

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
  kids: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') el.className = v as string;
    else (el as unknown as Record<string, unknown>)[k] = v;
  }
  for (const kid of kids) el.append(kid);
  return el;
}

function buildLayout(): void {
  const app = document.getElementById('app')!;

  statusEl = h('span', { className: 'status' });
  errEl = h('span', { className: 'err' });
  countEl = h('span', { className: 'count' });
  clearBtn = h('button', { textContent: '清空', title: '清空全部历史（需二次确认）' });
  clearBtn.addEventListener('click', () => {
    if (!clearArmed) {
      // window.confirm is unavailable in sandboxed pages (no allow-modals),
      // so the button arms itself instead.
      clearArmed = true;
      clearBtn.textContent = '确认清空？';
      clearBtn.classList.add('danger');
      clearTimeout(clearDisarm);
      clearDisarm = setTimeout(disarmClear, 2500);
      return;
    }
    disarmClear();
    clearAll();
  });

  listEl = h('div', { className: 'list' });
  viewerHeadEl = h('div', { className: 'viewer-head' });
  viewerBodyEl = h('div', { className: 'viewer-body' });
  const viewer = h('div', { className: 'viewer' }, [viewerHeadEl, viewerBodyEl]);
  const sideHeadIco = h('span', { className: 'side-ico' });
  sideHeadIco.innerHTML = iconSvg; // brand icon in the history column header
  const side = h('div', { className: 'side' }, [
    h('div', { className: 'side-head' }, [sideHeadIco, '复制历史']),
    listEl,
  ]);
  const splitter = h('div', { className: 'splitter', title: '拖拽调整右栏宽度' });
  const row = h('div', { className: 'row' }, [viewer, splitter, side]);

  app.append(
    h('header', {}, [
      h('h1', { className: 'h1' }, [
        h('span', { className: 'h-ico' }),
        '剪贴板历史',
      ]),
      errEl,
      statusEl,
      h('span', { className: 'spacer' }),
      countEl,
      clearBtn,
    ]),
    row,
  );
  // Inline SVG icon (our own static string — no injection surface).
  (app.querySelector('.h-ico') as HTMLElement).innerHTML = iconSvg;
  wireSplitter(splitter, row);
}

// Drag the divider → resize the right column by driving the --side-w CSS
// variable. Pointer capture keeps the drag alive outside the 6px hit area.
function wireSplitter(splitter: HTMLElement, rowEl: HTMLElement): void {
  const apply = (px: number) => {
    document.documentElement.style.setProperty('--side-w', `${px}px`);
  };
  let dragging = false;
  splitter.addEventListener('pointerdown', (e) => {
    dragging = true;
    splitter.setPointerCapture(e.pointerId);
    splitter.classList.add('dragging');
    document.body.classList.add('resizing');
    e.preventDefault();
  });
  splitter.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const rect = rowEl.getBoundingClientRect();
    const w = Math.round(rect.right - e.clientX);
    sideWidth = Math.min(SIDE_MAX, Math.max(SIDE_MIN, w));
    apply(sideWidth);
  });
  const end = (e: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    splitter.classList.remove('dragging');
    document.body.classList.remove('resizing');
    try {
      splitter.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    scheduleSave(); // the custom width persists with the history
  };
  splitter.addEventListener('pointerup', end);
  splitter.addEventListener('pointercancel', end);
}

function disarmClear(): void {
  clearArmed = false;
  clearBtn.textContent = '清空';
  clearBtn.classList.remove('danger');
}

function renderList(): void {
  rowById.clear();
  listEl.textContent = '';
  if (items.length === 0) {
    const empty = h('div', {
      className: 'empty',
      textContent: loadErrMsg !== null ? '历史加载失败，已暂停保存' : '暂无记录',
    });
    if (loadErrMsg !== null) empty.title = loadErrMsg; // full error on hover
    listEl.append(empty);
  }
  for (const it of items) {
    const row = h('div', { className: 'item' });
    if (it.id === selectedId) row.classList.add('sel');
    row.addEventListener('click', () => select(it.id));
    if (it.kind === 'text') row.addEventListener('dblclick', () => void recopy(it));
    row.title = it.kind === 'text' ? '单击查看，双击复制回剪贴板' : '单击查看';
    const prev =
      it.kind === 'image' ? (it.w && it.h ? `图片 ${it.w}×${it.h}` : '图片') : previewText(it.text);
    const ico = h('span', { className: 'ico' });
    ico.innerHTML = iconSvg; // same brand icon as the header/manifest
    // Hover actions — copy (text AND image rows; both can be written back)
    // and delete. Clicks stop propagation so they don't trigger the row's
    // select/dblclick-recopy handlers.
    const act = h('span', { className: 'act' });
    const copyBtn = h('button', { className: 'act-copy', title: '复制到剪贴板' });
    copyBtn.innerHTML = COPY_ACT_ICON;
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      void recopy(it);
    });
    copyBtn.addEventListener('dblclick', (e) => e.stopPropagation());
    act.append(copyBtn);
    const delBtn = h('button', { className: 'act-del', title: '删除这条记录' });
    delBtn.innerHTML = TRASH_ACT_ICON;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteItem(it.id);
    });
    delBtn.addEventListener('dblclick', (e) => e.stopPropagation());
    act.append(delBtn);
    row.append(
      ico,
      h('div', { className: 'meta' }, [
        h('div', { className: 'prev', textContent: prev }),
        h('div', { className: 'ts', textContent: formatTime(it.ts) }),
      ]),
      act,
    );
    rowById.set(it.id, row);
    listEl.append(row);
  }
  countEl.textContent = `${items.length} 条`;
  listEl.scrollTop = 0;
}

function select(id: string): void {
  if (selectedId === id) return;
  selectedId = id;
  for (const [rid, el] of rowById) el.classList.toggle('sel', rid === id);
  renderViewer(); // selection change must NOT re-render the list (scroll position)
}

function renderViewer(): void {
  viewerHeadEl.textContent = '';
  viewerBodyEl.textContent = '';
  viewerBodyEl.className = 'viewer-body';

  const it = items.find((x) => x.id === selectedId);
  if (!it) {
    viewerBodyEl.classList.add('center');
    viewerBodyEl.append(
      h('div', { className: 'empty' }, [
        '暂无内容',
        h('br'),
        '复制任意文字，自动记录',
        h('br'),
        '在此窗口 ⌘V 粘贴 / 拖入图片',
      ]),
    );
    return;
  }

  const info =
    it.kind === 'image'
      ? `图片 · ${it.w && it.h ? `${it.w}×${it.h} · ` : ''}${fmtBytes((it.data.length * 3) / 4)}`
      : `文本 · ${it.text.length} 字符`;
  viewerHeadEl.append(
    h('span', { className: 'info', textContent: `${info} · ${new Date(it.ts).toLocaleString()} · 悬停记录行可复制/删除` }),
  );

  if (it.kind === 'text') {
    viewerBodyEl.append(h('pre', { className: 'text', textContent: it.text }));
  } else {
    viewerBodyEl.classList.add('center');
    const canvas = h('canvas');
    viewerBodyEl.append(canvas);
    drawImage(it, canvas).catch(() => {
      viewerBodyEl.textContent = '';
      viewerBodyEl.className = 'viewer-body center';
      viewerBodyEl.append(h('div', { className: 'empty' }, ['无法解码图片']));
    });
  }
}

async function drawImage(item: ImageItem, canvas: HTMLCanvasElement): Promise<void> {
  const blob = new Blob([b64ToBytes(item.data)], { type: item.mime });
  const bmp = await createImageBitmap(blob);
  // Cap the backing store; CSS max-width/height does the on-screen fitting
  // (so window resizes need no JS).
  const scale = Math.min(1, 4096 / Math.max(bmp.width, bmp.height));
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
}

function fmtBytes(n: number): string {
  return n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

function toast(msg: string): void {
  statusEl.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    statusEl.textContent = '';
  }, 2500);
}

function setPollErr(msg: string | null): void {
  errEl.textContent = msg ?? '';
}

// ---------- main ----------

async function main(): Promise<void> {
  buildLayout();
  wireCaptureEvents();
  await load();
  if (sideWidth !== null) {
    document.documentElement.style.setProperty('--side-w', `${sideWidth}px`);
  }
  const newest = items[0];
  lastSeenText = newest && newest.kind === 'text' ? newest.text : null; // don't duplicate the newest text on first poll
  selectedId = newest?.id ?? null;
  renderList();
  renderViewer();
  void poll();
  setInterval(() => void poll(), POLL_MS);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void main());
} else {
  void main();
}
