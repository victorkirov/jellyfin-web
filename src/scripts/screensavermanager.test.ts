import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const plugins = vi.hoisted(() => [] as {
    id: string;
    name: string;
    show: () => void | Promise<void>;
    hide: () => Promise<void>;
}[]);
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: { isPlayingVideo: () => false } }));
vi.mock('components/pluginManager', () => ({ pluginManager: { ofType: () => plugins } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => null } }));
vi.mock('utils/events', () => ({ default: { on: vi.fn() } }));
vi.mock('./inputManager', () => ({ default: { idleTime: () => 0 } }));
vi.mock('./settings/userSettings', () => ({ get: () => 'logoscreensaver', screensaverTime: () => 300 }));

let manager: typeof import('./screensavermanager').default;

beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    plugins.length = 0;
    manager = (await import('./screensavermanager')).default;
});

afterEach(async () => {
    manager.hide();
    await Promise.resolve();
    vi.clearAllTimers();
    vi.useRealTimers();
    document.body.classList.remove('screensaver-noScroll');
});

describe('Screensaver activation failures', () => {
    it('cleans active state, scrolling and input listeners when a lazy load rejects', async () => {
        let reject!: (error: Error) => void;
        const pending = new Promise<void>((_resolve, rejectPromise) => {
            reject = rejectPromise;
        });
        void pending.catch(() => undefined);
        const plugin = { id: 'logoscreensaver', name: 'Logo', show: () => pending, hide: vi.fn().mockResolvedValue(undefined) };
        plugins.push(plugin);
        const remove = vi.spyOn(window, 'removeEventListener');
        const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        manager.show();
        expect(manager.isShowing()).toBe(true);
        expect(document.body.classList.contains('screensaver-noScroll')).toBe(true);
        const error = new Error('chunk unavailable');
        reject(error);
        await Promise.resolve();
        await Promise.resolve();
        expect(manager.isShowing()).toBe(false);
        expect(document.body.classList.contains('screensaver-noScroll')).toBe(false);
        expect(plugin.hide).toHaveBeenCalledOnce();
        for (const event of ['click', 'mousemove', 'keydown']) {
            expect(remove).toHaveBeenCalledWith(event, expect.any(Function), true);
        }
        expect(log).toHaveBeenCalledWith('Failed to show screensaver', error);
    });

    it('keeps pointer dismissal working for synchronous screensavers', async () => {
        const plugin = { id: 'logoscreensaver', name: 'Logo', show: vi.fn(), hide: vi.fn().mockResolvedValue(undefined) };
        plugins.push(plugin);
        manager.show();
        window.dispatchEvent(new MouseEvent('mousemove'));
        await Promise.resolve();
        expect(plugin.show).toHaveBeenCalledOnce();
        expect(plugin.hide).toHaveBeenCalledOnce();
        expect(manager.isShowing()).toBe(false);
        expect(document.body.classList.contains('screensaver-noScroll')).toBe(false);
    });

    it('does not dismiss a replacement screensaver when an old load rejects', async () => {
        let reject!: (error: Error) => void;
        const pending = new Promise<void>((_resolve, rejectPromise) => {
            reject = rejectPromise;
        });
        void pending.catch(() => undefined);
        plugins.push({ id: 'logoscreensaver', name: 'Old', show: () => pending, hide: vi.fn().mockResolvedValue(undefined) });
        manager.show();
        manager.hide();
        await Promise.resolve();
        const replacement = { id: 'logoscreensaver', name: 'New', show: vi.fn(), hide: vi.fn().mockResolvedValue(undefined) };
        plugins.splice(0, 1, replacement);
        manager.show();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        reject(new Error('old chunk unavailable'));
        await Promise.resolve();
        await Promise.resolve();
        expect(manager.isShowing()).toBe(true);
        expect(replacement.hide).not.toHaveBeenCalled();
        expect(document.body.classList.contains('screensaver-noScroll')).toBe(true);
    });
});
