# Paste History

A Folyn extension (sandbox tier) — clipboard history manager.

Left pane shows the selected entry in full (text / image); right pane lists
copy history, newest first. ⌘P → "Open: Paste History" opens the tool window.

## How capture works

- **Text**: while the window is open, the system clipboard is polled every
  second via the host `clipboard:read` RPC — anything you copy anywhere is
  recorded automatically (consecutive duplicates are skipped).
- **Images**: when the clipboard holds an image (no text flavor), the poll
  switches to `clipboard:read-image` (raw RGBA → PNG) and records it the
  same way. Requires a host with `clipboard:read-image`; on older hosts the
  extension silently falls back to paste (⌘V) / drop into this window.
  Pasting and dropping work everywhere.

## Actions

- Click a history entry → view it in the left pane.
- Hover a row → inline icon actions appear: copy (text rows; writes back to
  the clipboard and bumps the row to the top) and delete. Double-click a
  text row also copies.
- `清空` clears everything (two-click confirm).

History persists to `history.json` in the extension data dir (debounced
writes), capped at 200 entries / ~20 MB; oversized images (> ~3 MB) are
skipped with a notice.

## Develop

```sh
pnpm install
pnpm build      # → dist/ (installable)
node check.mjs  # pure-logic self-check (Node ≥ 23.6)
```

## Install

After `pnpm build`, the `dist/` directory is a self-contained extension
package — `manifest.json` + `index.html` + the bundled `index.js`. Open
**Settings → Extensions → Install from folder…** and pick `dist/`.

To ship a zip, run `cd dist && zip -r ../folyn-extension-paste-history-0.1.0.zip .`
from inside `dist/`.

## Sandbox tier — isolation

The extension runs in its own WebviewWindow served from the
`folyn-extension://` scheme — no host DOM, no `window.React`, no Tauri APIs.
Every host capability (clipboard read/write, fs) goes through the
relative `fetch('rpc')` bridge (resolves to the extension's own origin —
`folyn-extension://localhost/…` on macOS/Linux,
`http://folyn-extension.localhost/…` on Windows/WebView2) and is
checked against `manifest.permissions` before it runs.

Images render via `canvas` + `createImageBitmap` (in-process decode), because
the sandbox CSP (`default-src 'none'`, no `img-src`) forbids `<img src="data:…">`.

## Known limits

- Capture happens while the tool window is open; a closed window cannot
  record (the sandbox tier has no background process).
- While an image sits on the clipboard, unchanged polls are gated by
  NSPasteboard changeCount (macOS) — no per-second re-decode.
- On macOS, copying a file in Finder puts its path on the text flavor, so a
  path entry may appear alongside the pasted image.

## Structure

- `src/logic.ts` — pure logic (capture rules, file validation, trimming,
  list formatting); imported by the app and by `check.mjs`.
- `src/index.ts` — tool-window app: RPC bridge, polling, paste/drop capture,
  persistence, two-pane DOM UI (history rows reuse `icon.svg` inline).
- `src/index.html` — iframe/window HTML entry (styles + app mount).
- `src/icon.svg` — package icon, referenced by `manifest.icon`; also inlined
  into the window header (esbuild text loader).
- `src/types.d.ts` — `*.svg` module declaration for the text-loader import.
- `manifest.json` — declares `tier: "sandbox"`, `html: "index.html"`,
  `main: "index.js"`, `permissions` (clipboard + fs), and the tool window.
- `build.mjs` — esbuild config: bundles `src/index.ts` → `dist/index.js`
  (IIFE), copies `src/index.html` → `dist/index.html` and `src/icon.svg` →
  `dist/icon.svg`, writes `dist/manifest.json`.
