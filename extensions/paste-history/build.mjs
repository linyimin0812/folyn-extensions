import esbuild from 'esbuild';
import { copyFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

// Sandbox tier: runs in its own WebviewWindow served from the
// folyn-extension:// scheme, fully isolated from the host realm. NO access to
// `window.React` — plain DOM only. Host capabilities (clipboard read/write,
// fs) reach the window only via fetch-RPC to
// folyn-extension://localhost/paste-history/rpc (see src/index.ts). IIFE
// output sidesteps module-script CORS concerns on the folyn-extension:// scheme.
await mkdir(path.join(root, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'src/index.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: path.join(root, 'dist/index.js'),
  target: 'es2022',
  logLevel: 'warning',
  loader: { '.svg': 'text' }, // inlines src/icon.svg as a string for the header
});

// Copy the HTML entry into dist/, rewriting the script src to ./index.js so
// it resolves relative to the dist root. dist/ is the installable folder.
const html = await readFile(path.join(root, 'src/index.html'), 'utf8');
await writeFile(
  path.join(root, 'dist/index.html'),
  html.replace(/src="[^"]*index\.js"/i, 'src="./index.js"'),
);

// Package icon — manifest.icon references it by path; the host fetches and
// inlines it for the Extensions settings list.
await copyFile(path.join(root, 'src/icon.svg'), path.join(root, 'dist/icon.svg'));

// Self-contained installable manifest. main/html are already dist-relative
// ("index.js" / "index.html"), so copy as-is.
const manifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));
await writeFile(
  path.join(root, 'dist/manifest.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);

console.log('built dist/ — install the dist/ folder in Folyn → Settings → Extensions → Install from folder…');
