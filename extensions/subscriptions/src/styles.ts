export const styles = `
.fsub textarea{resize:none}
.fsub {
  color-scheme:light;
  --pane-header-height:36px;
  --bg:var(--panel,#fff);
  --soft:var(--surf,#f8f9fd);
  --line:var(--brd,#dde2f0);
  --ink:var(--t1,#1a2040);
  --muted:var(--t2,#4a5580);
  --accent:var(--acc,#3a6ef0);
  --selected:var(--accdim,#dce8ff);
  --error:var(--red,#d94040);
  display:flex;
  flex:1 1 0%;
  flex-direction:column;
  align-self:stretch;
  width:100%;
  height:100%;
  min-height:0;
  min-width:0;
  overflow:hidden;
  box-sizing:border-box;
  background:var(--bg);
  color:var(--ink);
  font:12px/1.5 var(--font-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif);
  -webkit-font-smoothing:antialiased;
  container-type:inline-size
}
.fsub.dark {
  color-scheme:dark;
  --bg:var(--panel,#0f1219);
  --soft:var(--surf,#13161f);
  --line:var(--brd,#1c2136);
  --ink:var(--t1,#e2e8f8);
  --muted:var(--t2,#9aa5c0);
  --accent:var(--acc,#5b8af5);
  --selected:var(--accdim,#131d42);
  --error:var(--red,#f06a6a)
}
.fsub * {
  box-sizing:border-box
}
.fsub button,.fsub input {
  font:inherit;
  color:inherit
}
.fsub button {
  cursor:pointer;
  border:1px solid var(--line);
  border-radius:4px;
  background:var(--bg);
  min-height:28px;
  padding:3px 8px;
  white-space:nowrap
}
.fsub button:hover {
  background:var(--soft)
}
.fsub button:disabled {
  opacity:.5;
  cursor:default
}
.fsub button[aria-pressed=true],.fsub button.active {
  background:var(--selected);
  color:var(--accent);
  border-color:var(--accent)
}
.fsub button.primary {
  background:var(--accent);
  color:#fff;
  border-color:var(--accent)
}
.fsub :focus-visible {
  outline:2px solid var(--accent);
  outline-offset:2px
}
.fsub input:not([type=checkbox]):not([type=radio]) {
  min-width:0;
  min-height:30px;
  width:100%;
  border:1px solid var(--line);
  border-radius:4px;
  padding:4px 8px;
  background:var(--bg)
}
.fsub input[type=radio] {
  accent-color:var(--accent);
  width:14px;
  height:14px;
  min-height:0;
  padding:0;
  margin:2px 0 0;
  flex:0 0 14px
}
.fsub input[type=checkbox] {
  accent-color:var(--accent);
  width:13px;
  height:13px;
  flex-shrink:0
}
.fsub a {
  color:var(--accent);
  text-decoration:underline;
  text-underline-offset:3px
}
.fsub p {
  margin:8px 0
}
.fsub h1,.fsub h2,.fsub h3 {
  font-weight:600;
  line-height:1.35;
  text-wrap:balance;
  margin:0 0 8px
}
.fsub h1 {
  font-size:24px
}
.fsub h2 {
  font-size:15px
}
.fsub h3 {
  font-size:14px
}
.fsub small,.fsub .muted {
  color:var(--muted);
  font-size:11px
}
.fsub .row {
  display:flex;
  align-items:center;
  gap:6px;
  flex-wrap:wrap
}
.fsub .row.between {
  justify-content:space-between
}
.fsub .grow {
  flex:1;
  min-width:0
}
.fsub .stack {
  display:flex;
  flex-direction:column;
  gap:10px
}
.fsub .actions {
  display:flex;
  gap:6px;
  flex-wrap:wrap
}
.fsub .workspace {
  position:relative;
  display:flex;
  min-height:0;
  flex:1;
  min-width:0
}
.fsub .nav {
  width:var(--nav-w);
  flex-shrink:0;
  overflow:hidden;
  padding:0;
  background:var(--soft);
  display:flex;
  flex-direction:column;
  border-inline-end:1px solid var(--line);
  min-width:160px;
  max-width:340px
}
.fsub .nav button.navitem {
  width:100%;
  border:0;
  background:transparent;
  display:flex;
  text-align:start;
  gap:6px;
  align-items:center;
  border-radius:4px;
  justify-content:space-between;
  padding:4px 7px;
  min-height:30px
}
.fsub .nav button.navitem.active {
  background:var(--selected);
  color:var(--accent);
  font-weight:600
}
.fsub .section-label {
  margin:16px 7px 4px;
  color:var(--muted);
  font-size:13px;
  font-weight:600;
  line-height:1.5;
  letter-spacing:0
}
.fsub .source-row {
  display:flex;
  align-items:center;
  min-width:0
}
.fsub .source-row .navitem {
  min-width:0;
  flex:1
}
.fsub .ellipsis {
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap
}
.fsub .source-menu {
  min-width:24px;
  padding:2px 4px;
  opacity:.55;
  border:0;
  background:transparent
}
.fsub .source-row:hover .source-menu,.fsub .source-menu:focus-visible {
  opacity:1
}
.fsub .list-pane {
  width:var(--list-w);
  flex-shrink:0;
  border-inline-end:1px solid var(--line);
  display:flex;
  flex-direction:column;
  min-width:245px;
  max-width:520px;
  overflow:auto
}
.fsub .list-head {
  padding:4px 10px 6px
}
.fsub .list-tools {
  padding:0 10px 8px;
  display:flex;
  gap:3px;
  flex-wrap:wrap
}
.fsub .list-tools button {
  font-size:11px;
  min-height:24px;
  padding:2px 5px;
  border-color:transparent;
  color:var(--muted)
}
.fsub .article-list {
  overflow-y:auto;
  min-height:0;
  flex:1
}
.fsub .article-row {
  display:flex;
  border-bottom:1px solid var(--line);
  padding:8px 8px 8px 8px;
  gap:4px;
  position:relative;
  align-items:flex-start
}
.fsub .article-row.selected {
  background:var(--selected);
  box-shadow:inset 2px 0 var(--accent)
}
.fsub .article-select {
  width:24px;
  min-height:24px;
  display:flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  cursor:pointer
}
.fsub .article-select input {
  opacity:.7
}
.fsub .article-card {
  flex:1;
  min-width:0;
  display:block;
  border:0!important;
  border-radius:0!important;
  background:transparent!important;
  text-align:start;
  padding:0!important;
  white-space:normal;
  line-height:1.5
}
.fsub .article-title {
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
  font-size:12.5px;
  line-height:1.45;
  margin:4px 0 3px;
  font-weight:600
}
.fsub .article-summary {
  display:-webkit-box;
  -webkit-line-clamp:1;
  -webkit-box-orient:vertical;
  overflow:hidden;
  color:var(--muted);
  font-size:11px;
  line-height:1.5
}
.fsub .article-flags {
  font-size:10px;
  margin-top:4px;
  display:flex;
  gap:6px;
  flex-wrap:wrap;
  color:var(--muted)
}
.fsub .article-row.read .article-title {
  font-weight:400
}
.fsub .reader {
  min-width:0;
  flex:1;
  display:flex;
  flex-direction:column;
  overflow:hidden
}
.fsub .reader-tools {
  padding:3px 12px;
  min-height:var(--pane-header-height);
  border-bottom:1px solid var(--line);
  display:flex;
  align-items:center;
  gap:6px;
  flex-wrap:wrap
}
.fsub .segmented {
  display:flex;
  gap:2px;
  background:var(--soft);
  padding:2px;
  border-radius:5px
}
.fsub .segmented button {
  border:0;
  min-height:25px;
  padding:2px 10px;
  background:transparent
}
.fsub .segmented button.active {
  background:var(--bg);
  color:var(--accent);
  box-shadow:0 1px 3px #0001
}
.fsub .reader-scroll {
  overflow:auto;
  min-height:0;
  flex:1;
  scrollbar-gutter:stable
}
.fsub .reader-content {
  max-width:808px;
  margin:auto;
  padding:20px 24px 48px
}
.fsub .article-header {
  margin-bottom:16px
}
.fsub .article-header h1 {
  font-size:22px;
  line-height:1.4;
  letter-spacing:-.02em;
  text-wrap:pretty;
  overflow-wrap:anywhere
}
.fsub .prose {
  font-size:14px;
  line-height:1.78;
  overflow-wrap:anywhere
}
.fsub .prose h1 {
  font-size:22px
}
.fsub .prose h2 {
  font-size:18px
}
.fsub .prose h3 {
  font-size:16px
}
.fsub .prose p {
  margin:0 0 12px
}
.fsub .prose ul,.fsub .prose ol {
  padding-inline-start:24px;
  margin-bottom:18px
}
.fsub .prose ul {
  list-style:disc
}
.fsub .prose ol {
  list-style:decimal
}
.fsub .prose ul ul {
  list-style:circle
}
.fsub .prose pre {
  margin:0 0 14px;
  background:var(--soft);
  border:1px solid var(--line);
  border-radius:5px;
  padding:12px 14px;
  overflow-x:auto;
  font:12px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace;
  white-space:pre
}
.fsub .prose code {
  font-family:ui-monospace,SFMono-Regular,Consolas,monospace;
  font-size:.88em
}
.fsub .prose :not(pre)>code {
  background:var(--soft);
  padding:2px 4px;
  border-radius:3px
}
.fsub .prose .table-scroll {
  width:100%;
  max-width:100%;
  overflow-x:auto;
  margin:14px 0
}
.fsub .prose table {
  display:table;
  width:100%;
  max-width:none;
  border-collapse:collapse;
  margin:0
}
.fsub .prose th,.fsub .prose td {
  border:1px solid var(--line);
  padding:5px 9px
}
.fsub .prose img {
  max-width:100%;
  height:auto;
  outline:1px solid #0001;
  border-radius:4px;
  cursor:zoom-in
}
.fsub .image-viewer {
  position:fixed;
  inset:0;
  width:100vw;
  height:100vh;
  max-width:none;
  max-height:none;
  margin:0;
  padding:0;
  border:0;
  background:var(--soft);
  color:var(--ink);
  overflow:hidden;
  overscroll-behavior:contain
}
.fsub .image-viewer::backdrop { background:#101319b8 }
.fsub .image-viewport { position:absolute; inset:0; overflow:auto; overscroll-behavior:contain; touch-action:none; cursor:grab }
.fsub .image-viewport.is-dragging,.fsub .image-viewport.is-dragging img { cursor:grabbing }
.fsub .image-canvas { position:relative; min-width:100%; min-height:100% }
.fsub .image-viewer img { position:absolute; display:block; margin:0; max-width:none; max-height:none; border-radius:3px; outline:1px solid #0001; user-select:none; -webkit-user-drag:none; cursor:grab }
.fsub.dark .image-viewer img { outline-color:#fff2 }
.fsub .image-caption { position:absolute; top:18px; left:22px; max-width:calc(100% - 310px); display:flex; flex-direction:column; gap:2px; pointer-events:none }
.fsub .image-caption > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-weight:550 }
.fsub .image-caption > small { color:var(--muted); font-size:11px; font-variant-numeric:tabular-nums }
.fsub .image-toolbar { position:absolute; top:16px; right:20px; display:flex; align-items:center; gap:3px; padding:4px; background:var(--bg); border:1px solid var(--line); border-radius:8px; box-shadow:0 2px 4px #00000005,0 5px 18px #0000000b }
.fsub .image-toolbar button { height:30px; min-height:30px; border:0; border-radius:4px; background:transparent; font-size:12px }
.fsub .image-toolbar button:hover { background:var(--soft) }
.fsub .image-toolbar .icon-button { width:30px; min-width:30px; padding:0 }
.fsub .image-toolbar .image-reset { min-width:43px; padding:0 6px; font-variant-numeric:tabular-nums }
.fsub .image-toolbar .image-fit { padding:0 7px }
.fsub .image-toolbar-divider { height:14px; width:1px; margin:0 2px; background:var(--line) }
.fsub .image-viewer-hint { position:absolute; left:50%; bottom:12px; transform:translateX(-50%); margin:0; padding:4px 10px; border-radius:5px; background:var(--bg); color:var(--muted); font-size:11px; white-space:nowrap; pointer-events:none }
.fsub .image-viewer-status { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); color:var(--muted); font-size:12px; pointer-events:none }
@media (max-width:560px) {
  .fsub .image-caption { max-width:calc(100% - 40px); top:16px; left:20px }
  .fsub .image-toolbar { top:auto; bottom:16px; left:50%; right:auto; transform:translateX(-50%) }
  .fsub .image-viewer-hint { display:none }
}

.fsub.dark .prose img {
  outline-color:#fff2
}
.fsub .prose blockquote {
  border-inline-start:3px solid var(--line);
  margin:18px 0;
  padding-inline-start:18px;
  color:var(--muted)
}
.fsub .translation {
  color:var(--accent);
  border-inline-start:2px solid var(--line);
  padding-inline-start:12px;
  margin:0 0 16px;
  font-size:13px
}
.fsub .is-streaming > :is(p,h1,h2,h3,li):last-child::after { content:''; display:inline-block; width:2px; height:12px; margin-inline-start:3px; vertical-align:baseline; background:var(--accent); opacity:.7 }
.fsub .streamed-fallback { white-space:pre-wrap; overflow-wrap:anywhere; margin-block:12px }
.fsub .translation:empty {
  display:none
}
.fsub .block {
  scroll-margin-top:16px
}
.fsub .empty {
  margin:24px auto;
  max-width:360px;
  text-align:center;
  padding:20px
}
.fsub .empty p {
  color:var(--muted);
  margin:8px 0 14px
}
.fsub .empty-icon {
  width:34px;
  height:34px;
  border-radius:8px;
  background:var(--soft);
  display:grid;
  place-items:center;
  margin:0 auto 10px;
  color:var(--accent)
}
.fsub .banner {
  background:var(--soft);
  padding:6px 12px;
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
  font-size:11px;
  border-bottom:1px solid var(--line)
}
.fsub .muted,.fsub .tip {
  overflow-wrap:anywhere
}
.fsub .error {
  color:var(--error);
  white-space:pre-wrap
}
.fsub .statusbox {
  padding:8px 10px;
  border-radius:4px;
  background:var(--soft);
  margin-bottom:14px;
  font-size:11px
}
.fsub .back {
  display:none
}
.fsub dialog {
  --bg:var(--panel,#fff);
  --soft:var(--surf,#f8f9fd);
  position:fixed;
  inset:0;
  margin:auto;
  height:fit-content;
  overflow:hidden;
  border:1px solid color-mix(in srgb,var(--line) 65%,transparent);
  background:var(--bg);
  color:var(--ink);
  border-radius:12px;
  width:min(660px,calc(100% - 32px));
  max-height:calc(100% - 40px);
  padding:0;
  box-shadow:0 0 0 1px #00000003,0 8px 24px #0000000d,0 28px 80px #00000029;
  overscroll-behavior:contain
}
.fsub dialog[open] { display:flex; flex-direction:column }
.fsub.dark dialog { --bg:var(--panel,#0f1219); --soft:var(--surf,#13161f); --line:var(--brd,#1c2136); box-shadow:0 0 0 1px #ffffff04,0 8px 24px #0003,0 28px 80px #0006 }
.fsub dialog.modal-compact { width:min(460px,calc(100% - 32px)) }
.fsub dialog.modal-source { height:min(660px,calc(100% - 40px)) }
.fsub .modal-source .modal-body { flex:1; scrollbar-gutter:stable }
.fsub dialog.modal input:not([type=checkbox]):not([type=radio]),.fsub dialog.modal button.select-trigger {
  height:36px; min-height:36px; padding:7px 10px; font-size:13px; line-height:20px;
  background:var(--soft); border:1px solid transparent; border-radius:7px
}
.fsub dialog.modal input:not([type=checkbox]):not([type=radio]):hover,.fsub dialog.modal button.select-trigger:hover { border-color:var(--line) }
.fsub dialog.modal input:not([type=checkbox]):not([type=radio]):focus,.fsub dialog.modal button.select-trigger[aria-expanded=true] { border-color:color-mix(in srgb,var(--accent) 65%,var(--line)); background:var(--bg); box-shadow:none }
.fsub dialog.modal :focus-visible { outline:1px solid var(--accent); outline-offset:-1px; box-shadow:none }
.fsub dialog.modal button:not(.icon-button):not(.group-option):not(.group-new):not(.text-action) { min-height:36px; border-radius:7px; font-size:12px; padding-inline:12px }
.fsub dialog.modal button.primary { font-weight:500; box-shadow:0 1px 2px #0001 }
.fsub dialog::backdrop { background:#18213155; backdrop-filter:blur(4px) }
.fsub.dark dialog::backdrop { background:#080b136b }
.fsub .modal-header {
  display:flex; align-items:center; gap:10px; padding:18px 20px 16px; flex-shrink:0;
  background:var(--bg)
}
.fsub .modal-symbol { display:grid; place-items:center; width:32px; height:32px; flex-shrink:0; border-radius:8px; background:var(--selected); color:var(--accent) }
.fsub .modal-heading { flex:1; min-width:0 }
.fsub .modal-header h2 { margin:0; font-size:15px; line-height:1.4; font-weight:600; letter-spacing:-.3px; text-wrap:pretty; overflow-wrap:anywhere }
.fsub .modal-heading p { margin:4px 0 0; font-size:11px; color:var(--muted); line-height:1.55; overflow-wrap:anywhere }
.fsub .modal-header button.icon-button { width:30px; min-height:30px; border-radius:8px; align-self:flex-start; margin-top:1px }
.fsub .modal-body { padding:0 20px 18px; overflow-y:auto; min-height:0; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:var(--line) transparent; overflow-wrap:anywhere }
.fsub .modal-footer { padding:12px 20px; border-top:1px solid var(--line); background:color-mix(in srgb,var(--soft) 60%,var(--bg)); display:flex; gap:12px; align-items:center; flex-shrink:0 }
.fsub .modal-footer-actions { display:flex; justify-content:flex-end; gap:8px; margin-inline-start:auto; flex-wrap:wrap }
.fsub .modal-footer-actions>button { min-width:74px }
.fsub .modal-note { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:10px }
.fsub dialog.modal .field { display:flex; flex-direction:column; gap:7px; min-width:0; font-size:11px; font-weight:500 }
.fsub dialog.modal small { font-weight:400; line-height:1.6 }
.fsub .modal-sections,.fsub .source-settings { gap:0 }
.fsub .modal-section + .modal-section { margin-top:16px; padding-top:16px; border-top:1px solid var(--line) }
.fsub .modal-section-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:18px; margin-bottom:11px }
.fsub .modal-section-heading h3 { margin:0; font-size:12px; font-weight:600; line-height:1.5 }
.fsub .modal-section .stack { gap:10px }
.fsub .source-identity { display:grid; grid-template-columns:minmax(0,.8fr) minmax(0,1.5fr); gap:12px }
.fsub .modal-badge { padding:2px 7px; background:var(--soft); border-radius:5px; color:var(--muted); font-size:10px; font-variant-numeric:tabular-nums }
.fsub .action-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px }
.fsub .action-grid button,.fsub .modal-inline-row button,.fsub button.text-action { display:flex; align-items:center; justify-content:center; gap:7px }
.fsub .action-grid button { color:var(--ink); background:var(--bg); border-color:var(--line) }
.fsub .action-grid button svg { color:var(--muted) }
.fsub .inline-spinner { display:inline-block; width:14px; height:14px; flex:0 0 14px; border:1.5px solid color-mix(in srgb,currentColor 18%,transparent); border-top-color:currentColor; border-radius:50%; color:inherit }
.fsub dialog button.recognition-submit { min-width:0; white-space:normal; text-align:start }
.fsub .action-grid button[aria-busy=true] { opacity:1; color:var(--accent); background:var(--selected); border-color:color-mix(in srgb,var(--accent) 25%,var(--line)); cursor:progress }
.fsub .source-action-feedback:empty { display:none }
.fsub .source-action-feedback:not(:empty) { padding:10px 12px; border-radius:8px; background:var(--soft); font-size:11px; line-height:1.65 }
.fsub .source-action-message { display:flex; align-items:flex-start; gap:8px }
.fsub .source-action-message>svg,.fsub .source-action-message>.inline-spinner { margin-top:2px; color:var(--accent) }
.fsub .source-action-feedback[data-state=error] { color:var(--error); background:color-mix(in srgb,var(--error) 6%,var(--bg)) }
.fsub .source-action-feedback[data-state=error] svg { color:var(--error) }
.fsub .source-action-feedback progress { display:block; appearance:none; width:100%; height:3px; margin-top:8px; border:0; border-radius:3px; overflow:hidden; accent-color:var(--accent); background:var(--line) }
.fsub .source-action-feedback progress::-webkit-progress-bar { background:var(--line) }
.fsub .source-action-feedback progress::-webkit-progress-value { background:var(--accent); border-radius:3px }
.fsub .source-action-feedback progress::-moz-progress-bar { background:var(--accent); border-radius:3px }
@media (prefers-reduced-motion:no-preference) { .fsub .inline-spinner,.fsub .source-refresh[aria-busy=true] svg,.fsub .list-refresh[aria-busy=true] svg { animation:fsub-spin .8s linear infinite } }
.fsub .modal-danger-row { display:flex; align-items:center; justify-content:space-between; gap:16px; margin-top:16px; padding-top:16px; border-top:1px solid var(--line) }
.fsub .modal-danger-row strong { display:block; font-size:12px; font-weight:500 }
.fsub .modal-danger-row small { display:block; margin-top:3px; font-size:10px }
.fsub button.danger-quiet { color:var(--error); border-color:color-mix(in srgb,var(--error) 18%,var(--line)) }
.fsub button.danger-quiet:hover { background:color-mix(in srgb,var(--error) 6%,var(--bg)) }
.fsub button.danger { color:var(--bg); background:var(--error); border-color:var(--error) }
.fsub .modal-danger .modal-symbol { color:var(--error); background:color-mix(in srgb,var(--error) 9%,var(--bg)) }
.fsub .modal-inline-row { display:flex; justify-content:space-between; align-items:center; gap:12px }
.fsub button.text-action { padding:0; min-height:24px; border:0; color:var(--accent); background:transparent; font-size:11px }
.fsub button.text-action svg { rotate:180deg }
.fsub .modal-stats { display:grid; grid-template-columns:repeat(3,1fr); padding:12px 14px; border-radius:9px; background:var(--soft) }
.fsub .modal-stats>div+div { padding-inline-start:16px; border-inline-start:1px solid var(--line) }
.fsub .modal-stats strong { display:block; font-size:19px; font-weight:550; line-height:1.4; font-variant-numeric:tabular-nums }
.fsub .modal-stats em { font-size:10px; font-style:normal; font-weight:400; color:var(--muted) }
.fsub .modal-stats span { display:block; margin-top:2px; color:var(--muted); font-size:10px }
.fsub dialog label.check { align-items:center; padding:10px 12px; border:1px solid var(--line); border-radius:8px; font-size:12px; line-height:1.6; cursor:pointer }
.fsub dialog label.check:has(input:checked) { background:color-mix(in srgb,var(--selected) 40%,var(--bg)); border-color:color-mix(in srgb,var(--accent) 22%,var(--line)) }
.fsub dialog label.check input { margin:0; accent-color:var(--accent) }
.fsub .modal-callout { padding:14px 16px; border-radius:10px; background:var(--soft) }
.fsub .modal-callout strong { font-size:13px; font-weight:600 }
.fsub .modal-callout p { color:var(--muted); font-size:12px; margin:6px 0 0; line-height:1.7 }
.fsub .modal-lead { margin:0 0 4px; line-height:1.8; color:var(--muted) }
.fsub dialog .error:empty { display:none }
.fsub dialog .error:not(:empty) { font-size:11px; line-height:1.6; margin:0; overflow-wrap:anywhere }
.fsub dialog .tip { border:0; background:var(--soft); padding:13px 14px; border-radius:9px }
.fsub dialog .tip p { margin:5px 0; font-size:11px; color:var(--muted) }
.fsub dialog .preview-list { max-height:156px; overflow:auto; margin:0; font-size:12px }
.fsub dialog .preview { max-height:170px; border-radius:8px; padding:12px; background:var(--soft); border-color:transparent }
.fsub dialog .candidate { padding:11px 12px; border-radius:8px }
.fsub dialog .candidate.active { border-color:color-mix(in srgb,var(--accent) 35%,var(--line)); background:var(--selected) }
@media (max-width:560px) {
  .fsub dialog,.fsub dialog.modal-compact { width:calc(100% - 24px); max-height:calc(100% - 24px); border-radius:13px }
  .fsub .modal-header { padding:18px 18px 16px; gap:10px }
  .fsub .modal-header h2 { font-size:16px }
  .fsub .modal-body { padding:0 18px 18px }
  .fsub .modal-footer { padding:12px 18px }
  .fsub .modal-note { display:none }
  .fsub .source-identity { grid-template-columns:1fr }
  .fsub .action-grid { grid-template-columns:1fr }
  .fsub .modal-stats { padding:12px }
  .fsub .modal-stats>div+div { padding-inline-start:10px }
  .fsub .modal-danger-row { gap:10px }
  .fsub .modal-inline-row { flex-wrap:wrap; gap:4px }
}
.fsub label.field {
  display:flex;
  flex-direction:column;
  gap:6px
}
.fsub label.check {
  display:flex;
  gap:8px;
  align-items:flex-start
}
.fsub .preview {
  max-height:220px;
  overflow:auto;
  border:1px solid var(--line);
  border-radius:7px;
  padding:14px
}
.fsub .preview p {
  font-size:12px
}
.fsub .candidate {
  padding:9px;
  border:1px solid var(--line);
  border-radius:5px;
  display:flex;
  align-items:flex-start;
  gap:7px
}
.fsub .candidate.active {
  border-color:var(--accent);
  background:var(--selected)
}
.fsub .preview-list {
  padding-inline-start:22px
}
.fsub .preview-list li {
  margin:6px 0
}
.fsub .divider {
  border:0;
  border-top:1px solid var(--line);
  margin:12px 0
}
.fsub .split {
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px
}
.fsub .sr-only {
  position:absolute;
  width:1px;
  height:1px;
  overflow:hidden;
  clip-path:inset(50%);
  white-space:nowrap
}
.fsub details>summary {
  cursor:pointer;
  min-height:28px;
  display:flex;
  align-items:center;
  gap:8px
}
.fsub .tip {
  border:1px solid var(--line);
  border-radius:5px;
  padding:10px;
  line-height:1.6;
  background:var(--soft)
}
.fsub svg {
  flex-shrink:0
}
.fsub button.quiet {
  border-color:transparent;
  color:var(--muted)
}
.fsub button.icon-button {
  width:26px;
  min-height:26px;
  padding:4px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  flex-shrink:0;
  border-color:transparent;
  background:transparent;
  color:var(--muted)
}
.fsub button.icon-button:hover {
  background:var(--soft);
  color:var(--ink)
}
.fsub button.icon-button[aria-pressed=true] {
  color:var(--accent);
  background:var(--selected)
}
.fsub button.icon-button[aria-pressed=true] svg {
  fill:currentColor;
  fill-opacity:.18
}
.fsub .nav-content {
  padding:6px 8px;
  flex:1;
  min-height:0;
  overflow:auto
}
.fsub .nav-footer {
  border-top:1px solid var(--line);
  margin-top:8px;
  margin-inline:0;
  margin-bottom:0;
  flex-shrink:0
}
.fsub .nav-footer button.navitem {
  justify-content:center;
  min-height:34px;
  padding:0 5px;
  border-radius:0
}
.fsub .group-heading {
  display:flex;
  align-items:center;
  gap:0;
  margin-top:6px
}
.fsub .group-heading button.group-title {
  flex:1;
  min-width:0;
  width:auto;
  display:flex;
  align-items:center;
  justify-content:flex-start;
  gap:7px;
  overflow:hidden;
  text-overflow:ellipsis;
  font-weight:600;
  font-size:13px;
  min-height:28px;
  padding:4px 6px;
  border-radius:5px
}
.fsub .group-heading .group-count { min-width:18px; text-align:center; margin-inline-start:auto; font-size:11px; color:var(--muted); font-variant-numeric:tabular-nums }
.fsub .source-menu { display:inline-flex; align-items:center; justify-content:center }
.fsub .group-toggle[aria-expanded] > svg {
  transform:rotate(180deg);
  flex-shrink:0
}
.fsub .group-toggle[aria-expanded=true] > svg {
  transform:rotate(-90deg)
}
.fsub .group-sources {
  padding-inline-start:26px
}
.fsub .nav-label {
  display:flex;
  align-items:center;
  gap:8px;
  min-width:0
}
.fsub .nav-count {
  font-size:10px;
  font-variant-numeric:tabular-nums;
  color:var(--muted);
  min-width:16px;
  text-align:end
}
.fsub .navitem:hover {
  background:var(--selected)!important
}
.fsub .group-heading button.group-title:hover,.fsub .group-heading button.group-title.active {
  background:color-mix(in srgb, var(--ink) 7%, transparent)!important;
  color:var(--ink)
}
.fsub .search-field {
  position:relative;
  display:flex;
  align-items:center
}
.fsub .search-field>svg {
  position:absolute;
  inset-inline-start:8px;
  color:var(--muted);
  pointer-events:none
}
.fsub .search-field input {
  padding-inline-start:28px!important;
  background:var(--soft)!important;
  border-color:transparent!important
}
.fsub .search-field input:focus {
  background:var(--bg)!important;
  border-color:var(--line)!important
}
.fsub .search-field input:focus-visible {
  outline:1px solid var(--accent);
  outline-offset:0
}
.fsub .article-meta {
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  font-size:11px
}
.fsub .article-origin {
  min-width:0;
  display:flex;
  align-items:center;
  gap:4px
}
.fsub .article-meta .ellipsis {
  min-width:0
}
.fsub .meta-status {
  display:inline-flex;
  flex-shrink:0;
  color:var(--muted)
}
.fsub .cache-status {
  color:var(--muted);
  font-size:11px;
  margin-bottom:14px;
  line-height:1.6
}
.fsub .article-meta time {
  white-space:nowrap;
  font-variant-numeric:tabular-nums;
  font-size:10px
}
.fsub .article-actions {
  display:flex;
  flex-direction:column;
  gap:1px;
  padding-top:0
}
.fsub .article-actions .icon-button {
  opacity:.8
}
.fsub .article-row:hover .icon-button,.fsub .article-row:focus-within .icon-button,.fsub .article-actions .icon-button[aria-pressed=true] {
  opacity:1
}
.fsub .article-row:hover:not(.selected) {
  background:var(--soft)
}
.fsub .article-select input:checked,.fsub .article-row:focus-within .article-select input {
  opacity:1
}
.fsub .unread-dot {
  display:inline-block;
  width:5px;
  height:5px;
  margin-inline-end:5px;
  margin-bottom:2px;
  border-radius:50%;
  background:var(--accent)
}
.fsub .article-header>.muted {
  margin:0 0 7px;
  font-size:11px
}
.fsub .reader-tools>details {
  position:relative
}
.fsub .reader-tools>details>summary {
  display:flex;
  align-items:center;
  justify-content:center;
  width:26px;
  min-height:26px;
  padding:4px;
  cursor:pointer;
  border-radius:4px;
  color:var(--muted);
  list-style:none
}
.fsub .reader-tools>details>summary::-webkit-details-marker { display:none }
.fsub .reader-tools>details>summary:hover {
  background:var(--soft)
}
.fsub .reader-tools>details[open]>.stack {
  position:absolute;
  inset-inline-end:0;
  top:32px;
  z-index:4;
  min-width:190px;
  padding:5px;
  gap:2px;
  border:1px solid var(--line);
  border-radius:6px;
  background:var(--bg);
  box-shadow:0 6px 20px #0001
}
.fsub .reader-tools>details[open]>.stack button {
  border:0;
  text-align:start;
  padding:5px 8px
}
.fsub .article-list>.empty {
  margin:16px auto;
  padding:16px
}
.fsub .article-list>.empty .empty-icon {
  display:none
}
.fsub .empty h2 {
  font-size:14px
}
.fsub .column-resizer {
  position:relative;
  flex:0 0 0;
  width:0;
  align-self:stretch;
  z-index:2;
  cursor:col-resize;
  touch-action:none
}
.fsub .column-resizer::before {
  content:'';
  position:absolute;
  inset-block:0;
  inset-inline-start:-4px;
  width:9px
}
.fsub .column-resizer::after {
  content:'';
  position:absolute;
  inset-block:0;
  inset-inline-start:-1px;
  width:1px;
  background:transparent;
  pointer-events:none
}
.fsub .column-resizer:hover::after,.fsub .column-resizer:focus-visible::after {
  background:var(--accent)
}
@media (pointer:coarse) {
  .fsub { --pane-header-height:39px }
  .fsub button.icon-button,.fsub .reader-tools>details>summary {
    width:32px;
    min-height:32px
  }
  .fsub input:not([type=checkbox]):not([type=radio]),.fsub dialog.modal input:not([type=checkbox]):not([type=radio]) {
    font-size:16px
  }
  .fsub button {
    min-height:32px
  }
}
.fsub .pane-header {
  min-height:var(--pane-header-height);
  flex-shrink:0;
  display:flex;
  align-items:center;
  gap:6px;
  padding:3px 8px;
  border-bottom:1px solid var(--line)
}
.fsub .pane-header h2 {
  flex:1;
  min-width:0;
  margin:0;
  font-size:12px;
  line-height:1.5;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis
}
.fsub .pane-count { white-space:nowrap; font-variant-numeric:tabular-nums }
.fsub .source-header { gap:4px }
.fsub .source-header-actions { display:flex; align-items:center; gap:2px; flex-shrink:0 }
.fsub .system-views { display:grid; gap:2px }
.fsub .source-header .source-add { border-radius:5px }
.fsub .source-header .source-add[aria-expanded=true] { color:var(--accent); background:var(--selected) }
.fsub .list-body { display:flex; flex-direction:column; min-height:0; flex:1; overflow:hidden }
.fsub .workspace.nav-overlay { padding-inline-start:36px }
@container(max-width:1100px) {
  .fsub .nav-resizer { display:none }
  .fsub .nav:not(.collapsed) {
    display:flex;
    position:absolute;
    inset-inline-start:0;
    top:0;
    bottom:0;
    z-index:3;
    box-shadow:10px 0 30px #0001
  }
  .fsub .reader-content {
    padding:18px 22px 40px
  }
}
@container(max-width:800px) {
  .fsub .list-resizer { display:none }
  .fsub .list-pane:not(.collapsed) {
    width:auto;
    flex:1;
    min-width:0;
    max-width:none;
    border:0
  }
  .fsub .reader {
    display:none
  }
  .fsub .article-open .reader,.fsub .list-pane.collapsed~.reader {
    display:flex
  }
  .fsub .back {
    display:inline-flex
  }
  .fsub .reader-tools {
    padding:3px 10px
  }
  .fsub .reader-content {
    padding:16px 16px 40px
  }
  .fsub .article-header h1 {
    font-size:20px
  }
  .fsub .split {
    grid-template-columns:1fr
  }
  .fsub .prose {
    font-size:14px
  }
}
.fsub .nav.collapsed {
  display:flex;
  width:36px;
  min-width:36px;
  max-width:36px;
  flex:0 0 36px;
  overflow:hidden
}
.fsub .list-pane[hidden] {
  display:none
}
.fsub .nav.collapsed .pane-header h2,.fsub .nav.collapsed .source-tree,
.fsub .nav.collapsed .nav-text,.fsub .nav.collapsed .nav-count,
.fsub .nav.collapsed .source-refresh {
  display:none
}
.fsub .nav.collapsed .pane-header {
  padding:3px 1px;
  flex-direction:column;
  gap:2px
}
.fsub .nav.collapsed .source-header-actions { flex-direction:column; gap:4px }
.fsub .nav.collapsed .nav-content { padding:6px 1px }
.fsub .nav.collapsed button.navitem { justify-content:center; padding:4px 0; min-height:32px }
.fsub .nav.collapsed .nav-label { justify-content:center }
.fsub .nav.collapsed .nav-footer { margin-top:0 }
.fsub .nav.collapsed + .nav-resizer,.fsub .list-pane.collapsed + .list-resizer {
  display:none!important
}
.fsub .list-pane,.fsub .article-list {
  scrollbar-width:none
}
.fsub .list-pane:hover,.fsub .list-pane:hover .article-list {
  scrollbar-width:thin
}
.fsub .list-pane::-webkit-scrollbar,.fsub .article-list::-webkit-scrollbar {
  width:6px;
  display:none
}
.fsub .list-pane:hover::-webkit-scrollbar,.fsub .list-pane:hover .article-list::-webkit-scrollbar {
  display:block
}
.fsub .list-pane::-webkit-scrollbar-thumb,.fsub .article-list::-webkit-scrollbar-thumb {
  background:var(--line);
  border-radius:3px
}
.fsub .list-pane::-webkit-scrollbar-track,.fsub .article-list::-webkit-scrollbar-track {
  background:transparent
}
.fsub .message-stack {
  position:absolute; top:18px; inset-inline:16px; display:flex;
  flex-direction:column; align-items:center; gap:8px; z-index:30;
  pointer-events:none; max-height:45%; overflow-y:auto
}
.fsub .message-stack:empty { display:none }
.fsub:has(dialog[open]) .message-workspace { display:none }
.fsub .message-embedded { top:84px; z-index:5 }
.fsub .message-card {
  --message-tone:var(--accent);
  display:flex; align-items:center; gap:8px; min-width:min(240px,100%); max-width:min(560px,100%);
  min-height:36px; padding:5px 8px 5px 10px; border:1px solid color-mix(in srgb,var(--message-tone) 32%,var(--line)); border-radius:7px;
  background:color-mix(in srgb,var(--message-tone) 6%,var(--bg)); color:var(--ink); font-size:12px; font-weight:500; line-height:1.5;
  box-shadow:0 2px 6px #0000000a,0 6px 18px #00000014; pointer-events:auto;
  flex-shrink:0
}
.fsub.dark .message-card {
  box-shadow:0 2px 6px #0003,0 6px 18px #0004
}
.fsub .message-card.success { --message-tone:#36735b }
.fsub.dark .message-card.success { --message-tone:#83c6a7 }
.fsub .message-card.warning { --message-tone:#946b26 }
.fsub.dark .message-card.warning { --message-tone:#d6b375 }
.fsub .message-card.error { --message-tone:var(--error) }
.fsub .message-text { min-width:0; flex:1; overflow-wrap:anywhere }
.fsub .message-symbol { display:grid; place-items:center; width:20px; height:20px; flex:0 0 20px; border-radius:50%; background:color-mix(in srgb,var(--message-tone) 12%,transparent); color:var(--message-tone) }
.fsub .message-symbol svg { stroke-width:1.8 }
.fsub .message-card button.icon-button { width:24px; height:24px; min-height:24px; padding:5px; border-radius:4px; color:var(--muted); background:transparent }
.fsub .message-card button.icon-button:hover { background:color-mix(in srgb,var(--message-tone) 10%,transparent); color:var(--ink) }
.fsub .message-card button.icon-button:focus-visible { outline:1px solid var(--accent); outline-offset:1px }
@media (prefers-reduced-motion:no-preference) { .fsub .message-card { animation:fsub-message-in .15s ease-out } }
@keyframes fsub-message-in { from { opacity:0; transform:translateY(-4px) } }
.fsub .list-body.loading {
  position:relative;
  pointer-events:none
}
.fsub .list-body.loading::before {
  content:'';
  position:absolute;
  inset:0;
  z-index:5;
  background:color-mix(in srgb, var(--bg) 65%, transparent)
}
.fsub .list-body.loading::after {
  content:'';
  position:absolute;
  inset:0;
  z-index:6;
  margin:auto;
  width:22px;
  height:22px;
  border-radius:50%;
  border:2px solid var(--line);
  border-top-color:var(--accent);
  animation:fsub-spin .8s linear infinite
}
@keyframes fsub-spin {
  to {
    transform:rotate(360deg)
  }
}
.fsub .full-span,.fsub .group-picker { grid-column:1/-1 }
.fsub .group-picker { border:0; padding:0; margin:0; min-inline-size:0 }
.fsub .group-picker legend { padding:0; margin-bottom:6px; font-size:12px }
.fsub .group-options { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px; max-height:144px; overflow-y:auto }
.fsub button.group-new { min-height:30px; padding:4px 10px; border:1px dashed var(--line); border-radius:6px; color:var(--muted); background:transparent; font-size:11px }
.fsub button.group-option { display:inline-flex; align-items:center; min-height:30px; padding:4px 12px; border:1px solid var(--line); border-radius:5px; cursor:pointer; color:var(--muted); font-size:12px }
.fsub button.group-option.selected { background:var(--selected); color:var(--accent); border-color:color-mix(in srgb,var(--accent) 38%,var(--line)); font-weight:600 }
.fsub .source-settings { border:0; padding:0; margin:0; min-inline-size:0 }

.fsub .source-settings .error:empty { display:none }
.fsub button.select-trigger {
  display:flex; align-items:center; justify-content:space-between; gap:12px;
  width:100%; height:36px; min-height:36px; padding:7px 10px;
  border:1px solid var(--line); border-radius:5px; background:var(--bg);
  color:var(--ink); text-align:start; font-size:13px; line-height:20px
}
.fsub button.select-trigger:hover { border-color:color-mix(in srgb,var(--muted) 45%,var(--line)); background:var(--bg) }
.fsub button.select-trigger[aria-expanded=true] { border-color:var(--accent) }
.fsub .select-trigger>svg { flex-shrink:0; color:var(--muted) }
.fsub .select-popup {
  position:fixed; inset:auto; margin:0; padding:4px; overflow-y:auto;
  border:1px solid var(--line); border-radius:8px; background:var(--bg); color:var(--ink);
  box-shadow:0 3px 8px #0000000a,0 10px 28px #00000018;
  font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;
  overscroll-behavior:contain; z-index:10
}
.fsub.dark .select-popup { box-shadow:0 4px 12px #0003,0 12px 32px #0005 }
.fsub .select-option { display:flex; align-items:center; justify-content:space-between; gap:14px; min-height:34px; padding:7px 9px; border-radius:4px; cursor:pointer; overflow-wrap:anywhere }
.fsub .select-option>span { min-width:0 }
.fsub .select-option.highlighted { background:var(--soft) }
.fsub .select-option[aria-selected=true] { color:var(--accent); background:var(--selected); font-weight:500 }
.fsub .select-check { flex-shrink:0; opacity:0 }
.fsub .select-option[aria-selected=true] .select-check { opacity:1 }
.fsub .group-create { margin-bottom:5px }
.fsub .group-create button { min-height:36px }

.fsub .prose .document-label{font-size:12px;line-height:1.4;font-weight:500;color:var(--muted);margin:0 0 14px;letter-spacing:.06em}
.fsub .document-result{min-width:0}
.fsub .document-result.is-streaming > div > :is(p,h1,h2,h3,ul,ol):last-child::after{content:"";display:inline-block;width:2px;height:12px;margin-inline-start:3px;background:var(--accent);opacity:.7}
.fsub .document-original{border-top:1px solid var(--line);padding-top:20px;margin-top:20px}

.fsub .prose pre > code{display:block;font:inherit;white-space:pre;tab-size:2;background:transparent;padding:0;color:var(--ink)}
.fsub .prose pre[data-code-label]::before{content:attr(data-code-label);display:block;white-space:normal;font:11px/1.4 system-ui,sans-serif;color:var(--muted);margin-bottom:10px;user-select:none}
.fsub .prose .hljs-keyword,.fsub .prose .hljs-selector-tag,.fsub .prose .hljs-literal{color:#9055a2}
.fsub .prose .hljs-string,.fsub .prose .hljs-regexp,.fsub .prose .hljs-addition{color:#327345}
.fsub .prose .hljs-number,.fsub .prose .hljs-symbol,.fsub .prose .hljs-attr{color:#996126}
.fsub .prose .hljs-title,.fsub .prose .hljs-built_in,.fsub .prose .hljs-section{color:#32628e}
.fsub .prose .hljs-comment,.fsub .prose .hljs-quote{color:var(--muted)}
.fsub .prose .hljs-variable,.fsub .prose .hljs-name,.fsub .prose .hljs-deletion{color:#a34d50}
.fsub.dark .prose .hljs-keyword,.fsub.dark .prose .hljs-selector-tag,.fsub.dark .prose .hljs-literal{color:#c5a2d8}
.fsub.dark .prose .hljs-string,.fsub.dark .prose .hljs-regexp,.fsub.dark .prose .hljs-addition{color:#9ac79b}
.fsub.dark .prose .hljs-number,.fsub.dark .prose .hljs-symbol,.fsub.dark .prose .hljs-attr{color:#d8b686}
.fsub.dark .prose .hljs-title,.fsub.dark .prose .hljs-built_in,.fsub.dark .prose .hljs-section{color:#96bddb}
.fsub.dark .prose .hljs-variable,.fsub.dark .prose .hljs-name,.fsub.dark .prose .hljs-deletion{color:#dda4a6}

.fsub .image-cache-actions { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-top:5px }
.fsub .image-cache-actions > button { display:inline-flex; align-items:center; gap:5px; min-height:26px; font-size:12px; padding:2px 8px }
.fsub .image-cache-actions details { min-width:0; max-width:100% }
.fsub .image-cache-actions summary { cursor:pointer; font-size:12px }
.fsub .image-cache-actions ul { margin:6px 0; padding-left:18px; max-height:180px; overflow:auto }
.fsub .image-cache-actions li { margin:4px 0; overflow-wrap:anywhere }
.fsub .image-cache-actions li span { display:block }
.fsub .prose .image-unavailable { display:flex; align-items:baseline; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:10px 12px; margin:10px 0; border:1px dashed var(--line); border-radius:6px; background:var(--soft); font-size:12px; line-height:1.6; color:var(--muted); overflow-wrap:anywhere }
.fsub .image-unavailable a { flex-shrink:0; color:var(--accent) }

.fsub .learning-slot{flex:0 1 var(--learning-w,370px);width:var(--learning-w,370px);min-width:300px;max-width:520px;min-height:0;border-inline-start:1px solid var(--line);overflow:hidden}
.fsub .workspace.with-learning>.reader{min-width:260px}
.fsub .workspace.with-learning>.list-pane{flex-shrink:1}
.fsub .workspace.with-learning.nav-overlay>.nav:not(.collapsed){position:absolute;inset-inline-start:0;top:0;bottom:0;z-index:3;box-shadow:10px 0 30px #0001}
.fsub .workspace.with-learning.nav-overlay>.nav-resizer{display:none}
.fsub .workspace.with-learning>.nav.collapsed~.nav-resizer{display:none}
.fsub .reader{position:relative}
.fsub .learning-selection{position:absolute;visibility:hidden;z-index:6;display:flex;gap:2px;padding:4px;border:1px solid var(--line);border-radius:7px;background:var(--bg);box-shadow:0 4px 16px #0002}
.fsub .learning-selection button{border:0;min-height:27px;padding:3px 9px;font-size:12px}
.fsub .learning-source-highlight{outline:1px solid var(--accent);outline-offset:5px;background:var(--selected);border-radius:3px}
.fsub dialog.learning-overlay{padding:0;width:min(480px,calc(100vw - 24px));max-width:calc(100vw - 24px);height:min(760px,calc(100dvh - 36px));max-height:calc(100dvh - 36px);overflow:visible;border-radius:12px}
.fsub dialog.learning-overlay .learning-panel{border-radius:12px}

.fsub .reader-tools .reader-learning-button{color:var(--ink)}
.fsub .reader-tools .reader-learning-button:hover{background:var(--selected);color:var(--accent)}
`;
