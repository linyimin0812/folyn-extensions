// @vitest-environment node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ExtensionManifest } from 'folyn-extension-sdk';
import { validateManifest } from '../scripts/manifest-validator.mjs';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as ExtensionManifest;

describe('installation manifest', () => {
    it('passes the same SDK validator used by ExtensionHost', () => {
        expect(() => validateManifest(manifest)).not.toThrow();
    });

    it('rejects the original single-word ID with the reported install error', () => {
        expect(() => validateManifest({ ...manifest, id: 'subscriptions' })).toThrow(
            'manifest.id must be kebab-case, got: subscriptions',
        );
    });
    it('rejects an invalid source manifest before producing installation files', () => {
        const root = process.cwd();
        const fixture = mkdtempSync(path.join(tmpdir(), 'folyn-manifest-'));
        try {
            mkdirSync(path.join(fixture, 'scripts'));
            cpSync(path.join(root, 'build.mjs'), path.join(fixture, 'build.mjs'));
            cpSync(path.join(root, 'scripts/manifest-validator.mjs'), path.join(fixture, 'scripts/manifest-validator.mjs'));
            symlinkSync(path.join(root, 'node_modules'), path.join(fixture, 'node_modules'), 'dir');
            writeFileSync(path.join(fixture, 'manifest.json'), JSON.stringify({ ...manifest, id: 'subscriptions' }));
            const result = spawnSync(process.execPath, ['build.mjs'], { cwd: fixture, encoding: 'utf8' });
            expect(result.status).not.toBe(0);
            expect(result.stderr).toContain('manifest.id must be kebab-case, got: subscriptions');
            expect(existsSync(path.join(fixture, 'dist'))).toBe(false);
        } finally {
            rmSync(fixture, { recursive: true, force: true });
        }
    });
});
