import { describe, expect, it, vi } from 'vitest';
import type { ExtensionApi, ExtensionContext } from 'folyn-extension-sdk';
import { requireSupport } from '../src/host';

function fakeApi(render: boolean) {
    const session = { id: 'v' };
    const vault = { session: vi.fn(() => session), onSessionChange: vi.fn(() => ({ dispose() {} })), onFileChange: vi.fn(() => ({ dispose() {} })) };
    const web = { fetch: vi.fn(async (url: string) => ({ url, status: 200, headers: {}, body: '' })), ...(render ? { render: vi.fn(async (url: string) => ({ url, status: 200, headers: {}, body: '<html/>' })) } : {}) };
    const ui = { openExternal: vi.fn(async () => {}), openSettings: vi.fn(), openVaults: vi.fn(), setBadge: vi.fn() };
    return { api: { vault, web, ui } as unknown as ExtensionApi, vault, web, ui, session };
}

describe('requireSupport', () => {
    it('maps the host APIs onto what the service uses', async () => {
        const f = fakeApi(true);
        const { support } = requireSupport(f.api, {} as ExtensionContext);
        expect(support.current()).toBe(f.session);
        support.onChange(() => {}); support.onFileChange(() => {});
        expect(f.vault.onSessionChange).toHaveBeenCalled();
        expect(f.vault.onFileChange).toHaveBeenCalled();
        await support.fetch('https://example.com/');
        await support.fetch('https://example.com/a.png', true);
        expect(f.web.fetch).toHaveBeenNthCalledWith(1, 'https://example.com/', { binary: false });
        expect(f.web.fetch).toHaveBeenNthCalledWith(2, 'https://example.com/a.png', { binary: true });
        await support.render!('https://example.com/blog');
        expect((f.web as { render: ReturnType<typeof vi.fn> }).render).toHaveBeenCalledWith('https://example.com/blog');
        await support.openExternal('https://example.com/'); support.openSettings(); support.openVaults(); support.setBadge(3);
        expect(f.ui.openExternal).toHaveBeenCalledWith('https://example.com/');
        expect(f.ui.setBadge).toHaveBeenCalledWith(3);
    });

    it('offers no render when the host did not grant it', () => {
        expect(requireSupport(fakeApi(false).api, {} as ExtensionContext).support.render).toBeUndefined();
    });

    it('explains an outdated host instead of failing later', () => {
        expect(() => requireSupport({ vault: {} } as unknown as ExtensionApi, {} as ExtensionContext)).toThrow(/更新 Folyn/);
    });
});
