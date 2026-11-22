// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ExtensionManifest } from 'folyn-extension-sdk';
import { validateManifest } from '../scripts/manifest-validator.mjs';
import extension from '../src/index';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf8')) as ExtensionManifest;

describe('manifest', () => {
    it('passes the SDK validator used by the host', () => {
        expect(() => validateManifest(manifest)).not.toThrow();
    });
    it('wires every contributed page to a component', () => {
        for (const page of manifest.contributes?.pages ?? []) expect(extension.pages?.[page.component]).toBeTypeOf('function');
    });
});

describe('icons', () => {
    // The host rewrites the first ` width=`/` height=` it finds to the bar size;
    // without them on the root <svg>, it would resize an inner shape instead.
    it('declare their size on the root <svg>', () => {
        for (const icon of [manifest.icon, ...(manifest.contributes?.pages ?? []).map(p => p.icon)]) {
            expect(icon).toMatch(/^<svg[^>]*\swidth="[^"]*"[^>]*\sheight="[^"]*"/);
        }
    });
});
