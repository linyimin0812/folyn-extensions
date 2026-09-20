/**
 * Attachment helpers shared by panel.tsx (React, main window) and tool.ts
 * (plain DOM, extension-tool popup) — one source of truth for which files
 * are attachable, how they're read, and how text files fold into the prompt.
 */

export type PendingAttachment =
  | { kind: 'image'; id: string; name: string; mediaType: string; data: string }
  | { kind: 'text'; id: string; name: string; text: string }
  | { kind: 'pdf'; id: string; name: string; data: string };

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** Text cap is tighter than images: attachments go INTO the prompt string,
 *  so a multi-MB text would blow the model context. */
export const MAX_TEXT_BYTES = 256 * 1024;
/** PDFs travel as base64 document blocks (Anthropic limit is 32MB / 100
 *  pages — 16MB is a sane ceiling). */
export const MAX_PDF_BYTES = 16 * 1024 * 1024;

const TEXT_MIMES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/yaml',
  'application/toml',
]);
const TEXT_EXTS =
  /\.(md|markdown|txt|json|ya?ml|csv|tsv|log|ts|tsx|js|jsx|mjs|py|rs|go|java|kt|c|h|cpp|hpp|css|scss|less|html|htm|sh|bash|zsh|fish|sql|toml|ini|cfg|conf|xml|env)$/i;

export function isTextFile(f: File): boolean {
  return f.type.startsWith('text/') || TEXT_MIMES.has(f.type) || TEXT_EXTS.test(f.name);
}

export function isPdfFile(f: File): boolean {
  return f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
}

/** File-picker accept list — matches the image/text/pdf filters above. */
export const ATTACH_ACCEPT =
  'image/*,text/*,.md,.markdown,.json,.yaml,.yml,.csv,.tsv,.log,.ts,.tsx,.js,.jsx,.py,.rs,.go,.java,.sql,.sh,.toml,.xml,.html,.css,.pdf';

function readAsDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

/** Read a file selection into attachments. Unsupported / oversized files are
 *  silently skipped — compare the result length to the input to decide
 *  whether to toast. */
export async function readFiles(files: File[]): Promise<PendingAttachment[]> {
  const out: PendingAttachment[] = [];
  for (const f of files) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (f.type.startsWith('image/')) {
      if (f.size > MAX_IMAGE_BYTES) continue;
      try {
        const url = await readAsDataURL(f);
        const comma = url.indexOf(',');
        if (comma < 0) continue;
        out.push({ kind: 'image', id, name: f.name, mediaType: f.type, data: url.slice(comma + 1) });
      } catch {
        // unreadable — skip
      }
    } else if (isPdfFile(f)) {
      if (f.size > MAX_PDF_BYTES) continue;
      try {
        const url = await readAsDataURL(f);
        const comma = url.indexOf(',');
        if (comma < 0) continue;
        out.push({ kind: 'pdf', id, name: f.name, data: url.slice(comma + 1) });
      } catch {
        // unreadable — skip
      }
    } else if (isTextFile(f)) {
      if (f.size > MAX_TEXT_BYTES) continue;
      out.push({ kind: 'text', id, name: f.name, text: await f.text() });
    }
  }
  return out;
}

/** Fold the typed text and the text attachments into one prompt string. The
 *  host ai:chat RPC only carries images, so text attachments travel here. */
export function buildPrompt(
  text: string,
  docs: Extract<PendingAttachment, { kind: 'text' }>[],
): string {
  return [text, ...docs.map((d) => `[附件: ${d.name}]\n${d.text}`)]
    .filter(Boolean)
    .join('\n\n');
}

/** Chip icon for text attachments (images use their thumbnail). */
export const DOC_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>';
