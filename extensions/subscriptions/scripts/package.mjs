import { execFile } from 'node:child_process';
import { access, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateManifest } from './manifest-validator.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
validateManifest(manifest);
if (manifest.main !== 'index.js') throw new Error('Packaged manifest.main must be index.js');
await access(path.join(dist, manifest.main));

// Folyn's local ZIP picker derives the requested id from the filename.
// A version suffix would cause an id mismatch even with a valid manifest.
const archive = path.join(root, `${manifest.id}.zip`);
await rm(archive, { force: true });
await promisify(execFile)('zip', ['-q', '-j', archive, path.join(dist, 'manifest.json'), path.join(dist, 'index.js')]);
console.log(`Packaged ${archive} (version ${manifest.version})`);
