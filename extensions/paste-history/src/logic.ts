// Pure logic for paste-history — no DOM, no RPC, no imports.
// Imported by src/index.ts (bundled by esbuild) and by check.mjs (Node runs
// this file directly via native type stripping), so it must stay
// dependency-free and use erasable TS syntax only.

export const MAX_ITEMS = 200;
export const MAX_IMAGE_B64 = 4_000_000; // ~3 MB binary per image (base64 chars)
export const MAX_FILE_CHARS = 20_000_000; // history.json serialized size bound (~20 MB)

export type TextItem = { id: string; kind: 'text'; ts: number; text: string };
export type ImageItem = {
  id: string;
  kind: 'image';
  ts: number;
  mime: string;
  data: string; // raw base64, no data: prefix (CSP forbids data: image URLs)
  w?: number;
  h?: number;
};
export type Item = TextItem | ImageItem;

export function newId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// A polled clipboard string becomes a history item iff it is non-empty and
// differs from the last value the poller saw (consecutive duplicates skipped;
// lastSeen is NOT tied to items[0], so deleting an item must not resurrect it).
export function shouldCapture(text: string | null, lastSeen: string | null): boolean {
  return text !== null && text !== '' && text !== lastSeen;
}

// arboard's ContentNotAvailable: the clipboard holds no TEXT flavor — either
// an image was copied or the clipboard is empty. Normal state, not an error;
// the poller switches to image mode instead of surfacing a failure.
// ponytail: string-match on the plugin's error message — the RPC bridge has no
// error codes; switch to a code if the host ever adds one.
export function isNoTextError(msg: string): boolean {
  return msg.includes('not available in the requested format');
}

// "unknown RPC method: ..." — the host predates clipboard:read-image.
// ponytail: string-match, same rationale as isNoTextError.
export function isUnknownMethodError(msg: string): boolean {
  return msg.startsWith('unknown RPC method');
}

// std::io::Error (ENOENT) from the host's fs:read, as its Display string:
// "No such file or directory (os error 2)" (macOS/Linux) or "The system
// cannot find the file specified. (os error 2)" (Windows). A missing file
// is FIRST RUN — not a load failure; the session may save freely, there is
// nothing on disk to lose.
// ponytail: string-match on the io error text — same rationale as
// isNoTextError; the RPC bridge has no error codes.
export function isNoFileError(msg: string): boolean {
  return msg.includes('os error 2') || /no such file|cannot find the (file|path)/i.test(msg);
}

export function previewText(text: string): string {
  const firstLine = text.split('\n').find((l) => l.trim() !== '') ?? '';
  const s = firstLine.trim().replace(/\s+/g, ' ');
  if (s === '') return '(空白)';
  return s.length > 60 ? s.slice(0, 60) + '…' : s;
}

export function formatTime(ts: number, now: number = Date.now()): string {
  const d = new Date(ts);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return new Date(now).toDateString() === d.toDateString()
    ? hm
    : `${d.getMonth() + 1}/${pad2(d.getDate())} ${hm}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Validate + normalize one entry loaded from history.json. The file is a
// trust boundary (hand-edited / corrupt / older format): bad entries are
// dropped, never thrown on.
export function normalizeItem(raw: unknown): Item | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' && o.id !== '' ? o.id : newId();
  const ts = typeof o.ts === 'number' && Number.isFinite(o.ts) ? o.ts : Date.now();
  if (o.kind === 'text' && typeof o.text === 'string') {
    return { id, kind: 'text', ts, text: o.text };
  }
  if (
    o.kind === 'image' &&
    typeof o.data === 'string' &&
    typeof o.mime === 'string' &&
    /^image\//.test(o.mime)
  ) {
    if (o.data.length > MAX_IMAGE_B64) return null;
    return { id, kind: 'image', ts, mime: o.mime, data: o.data, w: numOrUndef(o.w), h: numOrUndef(o.h) };
  }
  return null;
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

// Keep at most MAX_ITEMS, newest-first, and bound the serialized file size by
// dropping oldest entries.
// ponytail: single history.json with a whole-file size bound; per-image files + fs:list GC when this ceiling hurts
export function trim(items: Item[]): Item[] {
  const out = items.slice(0, MAX_ITEMS);
  while (out.length > 1 && serializedSize(out) > MAX_FILE_CHARS) out.pop();
  return out;
}

function serializedSize(items: Item[]): number {
  let n = 64;
  for (const it of items) n += (it.kind === 'image' ? it.data.length : it.text.length) + 64;
  return n;
}
