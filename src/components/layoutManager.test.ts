import { beforeEach, describe, expect, it, vi } from 'vitest';

const settings = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock('../scripts/settings/appSettings', () => ({ default: settings }));
vi.mock('../utils/events.ts', () => ({ default: { trigger: vi.fn() } }));

describe('TV layout', () => {
    beforeEach(() => {
        vi.resetModules();
        settings.set.mockClear();
        document.documentElement.className = 'layout-desktop layout-mobile layout-modern';
    });

    it.each(['desktop', 'mobile', 'modern', 'experimental', 'desktop-legacy', 'mobile-legacy', 'auto', 'tv', ''])(
        'ignores saved layout %s and migrates it to TV', async saved => {
            settings.get.mockReturnValue(saved);
            const { default: layoutManager } = await import('./layoutManager');
            expect(layoutManager.tv).toBe(true);
            expect(layoutManager.mobile).toBe(false);
            expect(layoutManager.desktop).toBe(false);
            expect(layoutManager.modern).toBe(false);
            expect(settings.set).toHaveBeenCalledWith('layout', 'tv');
            expect(document.documentElement.className).toBe('layout-tv');
        }
    );
});
