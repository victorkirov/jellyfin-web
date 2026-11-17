import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/globalize', () => ({ default: { loadStrings: vi.fn().mockResolvedValue(undefined) } }));
vi.mock('./loading/loading', () => ({ default: {} }));
vi.mock('../scripts/settings/appSettings', () => ({ default: {} }));
vi.mock('./playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('../components/apphost', () => ({ appHost: {} }));
vi.mock('./router/appRouter', () => ({ appRouter: {} }));
vi.mock('../scripts/inputManager', () => ({}));
vi.mock('../components/toast/toast', () => ({ default: {} }));
vi.mock('../components/confirm/confirm', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('./dashboard', () => ({}));
vi.mock('../scripts/screensavermanager', () => ({ default: {} }));
vi.mock('../scripts/settings/userSettings', () => ({}));

import { PluginManager } from './pluginManager';
import Events from '../utils/events';
import globalize from '../lib/globalize';
import type { RegistryPlugin } from '../types/plugin';

const stubPlugin = { id: 'test', name: 'test', type: 'test' };

describe('deferred plugins', () => {
    let manager: PluginManager;
    beforeEach(() => {
        manager = new PluginManager();
    });

    it('registers all player and screensaver choices without loading code', async () => {
        const load = vi.spyOn(manager, 'loadPlugin');
        for (const name of ['htmlAudioPlayer', 'htmlVideoPlayer', 'photoPlayer', 'youtubePlayer', 'backdropScreensaver', 'logoScreensaver']) {
            await manager.registerDeferredPlugin(name + '/plugin');
        }
        expect(load).not.toHaveBeenCalled();
        expect(manager.ofType('mediaplayer')).toHaveLength(4);
        expect(manager.ofType('screensaver')).toHaveLength(2);
        expect(manager.canPlayDeferred({ Id: 'video', MediaType: 'Video' })).toBe(true);
    });

    it.each([
        ['htmlAudioPlayer', { Id: 'audio', MediaType: 'Audio' }],
        ['htmlVideoPlayer', { Id: 'video', MediaType: 'Video' }],
        ['photoPlayer', { Id: 'photo', MediaType: 'Photo' }],
        ['youtubePlayer', { Url: 'https://youtube.com/watch?v=test', MediaType: 'Video' }]
    ])('loads %s once on concurrent first use', async (name, item) => {
        for (const player of ['htmlAudioPlayer', 'htmlVideoPlayer', 'photoPlayer', 'youtubePlayer']) {
            await manager.registerDeferredPlugin(player + '/plugin');
        }
        const load = vi.spyOn(manager, 'loadPlugin').mockResolvedValue(stubPlugin);
        await Promise.all([manager.prepareForPlayback([item]), manager.prepareForPlayback([item])]);
        expect(load).toHaveBeenCalledExactlyOnceWith(name + '/plugin');
    });

    it('retries failed loads and rejects playback preparation', async () => {
        await manager.registerDeferredPlugin('htmlVideoPlayer/plugin');
        const load = vi.spyOn(manager, 'loadPlugin').mockRejectedValueOnce(new Error('offline')).mockResolvedValue(stubPlugin);
        await expect(manager.prepareForPlayback([{ Id: 'video', MediaType: 'Video' }])).rejects.toThrow('offline');
        await manager.prepareForPlayback([{ Id: 'video', MediaType: 'Video' }]);
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('waits for screensaver implementation and cancels activation when hidden', async () => {
        const descriptor = await manager.registerDeferredPlugin('logoScreensaver/plugin');
        if (typeof descriptor === 'string') throw new Error('Expected a deferred descriptor');
        const plugin = { ...stubPlugin, show: vi.fn(), hide: vi.fn().mockResolvedValue(undefined) };
        let finish!: (value: RegistryPlugin | PromiseLike<RegistryPlugin>) => void;
        vi.spyOn(manager, 'loadPlugin').mockImplementation(() => new Promise(resolve => {
            finish = resolve;
        }));
        void descriptor.show!();
        expect(plugin.show).not.toHaveBeenCalled();
        await descriptor.hide!();
        finish(plugin);
        await vi.waitFor(() => expect(manager.loadPlugin).toHaveBeenCalledOnce());
        expect(plugin.show).not.toHaveBeenCalled();
        void descriptor.show!();
        await vi.waitFor(() => expect(plugin.show).toHaveBeenCalledOnce());
        await descriptor.hide!();
        expect(plugin.hide).toHaveBeenCalledOnce();
    });

    it('hydrates metadata with a real instance and emits registration for playback', async () => {
        const descriptor = await manager.registerDeferredPlugin('htmlVideoPlayer/plugin');
        if (typeof descriptor === 'string') throw new Error('Expected a deferred descriptor');
        const show = vi.fn();
        const registered = vi.fn();
        Events.on(manager, 'registered', registered);
        class NativePlayer {
            id = 'htmlvideoplayer';
            type = 'mediaplayer';
            show = show;
        }
        window['htmlVideoPlayer/plugin' as keyof Window] = (() => NativePlayer) as never;
        try {
            const plugin = await descriptor.load!();
            expect(plugin).toBeInstanceOf(NativePlayer);
            expect(registered).toHaveBeenCalledWith({ type: 'registered' }, plugin);
            expect(manager.ofType('mediaplayer')).toEqual([plugin]);
            expect(manager.canPlayDeferred({ Id: 'video', MediaType: 'Video' })).toBe(false);
        } finally {
            delete window['htmlVideoPlayer/plugin' as keyof Window];
        }
    });

    it('loads required interceptors and NativeShell definitions eagerly', async () => {
        const load = vi.spyOn(manager, 'loadPlugin').mockResolvedValue(stubPlugin);
        await manager.registerDeferredPlugin('playAccessValidation/plugin');
        window['htmlVideoPlayer/plugin' as keyof Window] = vi.fn() as never;
        try {
            await manager.registerDeferredPlugin('htmlVideoPlayer/plugin');
        } finally {
            delete window['htmlVideoPlayer/plugin' as keyof Window];
        }
        expect(load.mock.calls).toEqual([['playAccessValidation/plugin'], ['htmlVideoPlayer/plugin']]);
    });
    it('preserves screensaver priority when deferred and loaded', async () => {
        const descriptor = await manager.registerDeferredPlugin('logoScreensaver/plugin');
        expect(descriptor.priority).toBeUndefined();
    });

    it('returns the installed instance when an already loaded plugin is requested', async () => {
        class NativePlayer {
            id = 'native';
            name = 'Native';
            type = 'mediaplayer';
            priority = -5;
            canPlayMediaType = () => false;
        }
        window['native/plugin' as keyof Window] = (() => NativePlayer) as never;
        try {
            const first = await manager.loadPlugin('native/plugin');
            expect(await manager.loadPlugin('native/plugin')).toBe(first);
            expect(first.priority).toBe(-5);
            expect(first.canPlayMediaType?.('Video')).toBe(false);
            expect(manager.plugins).toEqual([first]);
        } finally {
            delete window['native/plugin' as keyof Window];
        }
    });

    it('retries translation failures through deferred playback preparation', async () => {
        await manager.registerDeferredPlugin('htmlVideoPlayer/plugin');
        class NativePlayer {
            id = 'htmlvideoplayer';
            name = 'Native';
            type = 'mediaplayer';
        }
        window['htmlVideoPlayer/plugin' as keyof Window] = (() => NativePlayer) as never;
        vi.mocked(globalize.loadStrings).mockRejectedValueOnce(new Error('translations unavailable'));
        try {
            await expect(manager.prepareForPlayback([{ Id: 'video', MediaType: 'Video' }])).rejects.toThrow('translations unavailable');
            expect(manager.canPlayDeferred({ Id: 'video', MediaType: 'Video' })).toBe(true);
            await manager.prepareForPlayback([{ Id: 'video', MediaType: 'Video' }]);
            expect(manager.canPlayDeferred({ Id: 'video', MediaType: 'Video' })).toBe(false);
        } finally {
            delete window['htmlVideoPlayer/plugin' as keyof Window];
        }
    });
    it('loads a built-in with the same canonical capabilities as its descriptor', async () => {
        const descriptor = await manager.registerDeferredPlugin('photoPlayer/plugin');
        const plugin = await descriptor.load!();
        expect(plugin.id).toBe(descriptor.id);
        expect(plugin.priority).toBe(descriptor.priority);
        expect(plugin.canPlayMediaType?.('Photo')).toBe(true);
        expect(plugin.canPlayItem?.({ Id: 'photo' })).toBe(true);
        expect(plugin.canPlayUrl?.('https://youtube.com/watch?v=test')).toBe(false);
        expect(manager.plugins).toEqual([plugin]);
    });
});
