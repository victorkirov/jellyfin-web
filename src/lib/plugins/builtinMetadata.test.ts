import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('screenfull', () => ({ default: {} }));
vi.mock('lib/playback/utils/subtitleStyles', () => ({ useCustomSubtitles: {} }));
vi.mock('components/subtitlesettings/subtitleappearancehelper', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {} }));
vi.mock('scripts/settings/userSettings', () => ({ currentSettings: {} }));
vi.mock('scripts/screensavermanager', () => ({ default: {} }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('scripts/settings/appSettings', () => ({ default: {} }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/loading/loading', () => ({ default: {} }));
vi.mock('utils/dom', () => ({ default: {} }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/router/appRouter', () => ({ appRouter: {} }));
vi.mock('components/htmlMediaHelper', () => ({ getSavedVolume: () => 1 }));
vi.mock('components/itemHelper', () => ({ default: {} }));
vi.mock('lib/globalize', () => ({ default: {} }));
vi.mock('scripts/browserDeviceProfile', () => ({ default: {}, canPlaySecondaryAudio: {} }));
vi.mock('scripts/settings/webSettings', () => ({ getIncludeCorsCredentials: vi.fn().mockResolvedValue(false) }));
vi.mock('components/backdrop/backdrop', () => ({ setBackdropTransparency: {} }));

import AudioPlayer from '../../plugins/htmlAudioPlayer/plugin';
import VideoPlayer from '../../plugins/htmlVideoPlayer/plugin';
import PhotoPlayer from '../../plugins/photoPlayer/plugin';
import YoutubePlayer from '../../plugins/youtubePlayer/plugin';
import BackdropScreensaver from '../../plugins/backdropScreensaver/plugin';
import LogoScreensaver from '../../plugins/logoScreensaver/plugin';
import { getBuiltinMetadata, canPlayCandidate } from './builtinMetadata';
import type { RegistryPlugin, PluginConstructor } from 'types/plugin';

const candidates = [
    { Id: 'audio', MediaType: 'Audio' },
    { Id: 'video', MediaType: 'Video' },
    { Id: 'photo', MediaType: 'Photo' },
    { Url: 'https://www.youtube.com/watch?v=test', MediaType: 'Video' },
    { Url: 'https://example.com/video', MediaType: 'Video' },
    { Url: 'https://YOUTUBE.COM/watch?v=test', MediaType: 'Audio' }
];

describe('built-in capability metadata', () => {
    it.each([
        ['htmlAudioPlayer', AudioPlayer],
        ['htmlVideoPlayer', VideoPlayer],
        ['photoPlayer', PhotoPlayer],
        ['youtubePlayer', YoutubePlayer],
        ['backdropScreensaver', BackdropScreensaver],
        ['logoScreensaver', LogoScreensaver]
    ])('matches the real %s implementation before registration', (name, Constructor) => {
        // The legacy screensaver constructor declares its instance through `this`.
        const plugin = new (Constructor as unknown as PluginConstructor)();
        const metadata = getBuiltinMetadata(name + '/plugin')!;
        for (const key of ['id', 'name', 'type', 'priority', 'supportsAnonymous'] as const) {
            expect(metadata[key]).toBe(plugin[key]);
        }
        if (metadata.type === 'mediaplayer') {
            for (const item of candidates) {
                const loadedCanPlay = !!plugin.canPlayMediaType?.(item.MediaType)
                    && !!(item.Id ? !plugin.canPlayItem || plugin.canPlayItem(item) : item.Url && plugin.canPlayUrl?.(item.Url));
                expect(canPlayCandidate(metadata, item)).toBe(loadedCanPlay);
            }
        }
    });

    it('contains no implementation imports and ignores unknown plugins', () => {
        const source = readFileSync('src/lib/plugins/builtinMetadata.ts', 'utf8');
        expect(source).not.toMatch(/(?:from|import\()\s*['"].*plugins\//);
        expect(getBuiltinMetadata('customPlayer/plugin')).toBeUndefined();
        expect(getBuiltinMetadata('htmlVideoPlayer/notPlugin')).toBeUndefined();
    });

    it('keeps anonymous screensavers distinct and YouTube URL selection case insensitive', () => {
        expect(getBuiltinMetadata('logoScreensaver/plugin')?.supportsAnonymous).toBe(true);
        expect(getBuiltinMetadata('backdropScreensaver/plugin')?.supportsAnonymous).toBe(false);
        const youtube = getBuiltinMetadata('youtubePlayer/plugin') as RegistryPlugin;
        expect(canPlayCandidate(youtube, { Url: 'HTTPS://YOUTUBE.COM/watch?v=x', MediaType: 'Video' })).toBe(true);
        expect(canPlayCandidate(youtube, { Id: 'server', MediaType: 'Video' })).toBe(false);
    });
});
