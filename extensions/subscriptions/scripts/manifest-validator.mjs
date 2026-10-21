import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// The SDK is published for bundlers (its ESM imports omit .js extensions).
// Bundle its public validator so build-time Node checks use the host contract.
const { outputFiles } = await build({
  stdin: {
    contents: "export { validateManifest } from 'folyn-extension-sdk';",
    resolveDir: fileURLToPath(new URL('../', import.meta.url)),
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});

export const { validateManifest } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`
);
