import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import DisplaySettings from '../displaySettings/displaySettings';
import PlaybackSettings from './playbackSettings';
import SubtitleSettings from '../subtitlesettings/subtitlesettings';

const { apiClient } = vi.hoisted(() => ({
    apiClient: {
        getUser: vi.fn(),
        updateUserConfiguration: vi.fn()
    }
}));

vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: () => apiClient } }));
vi.mock('components/apphost', () => ({ appHost: { supports: () => true } }));
vi.mock('components/layoutManager', () => ({ default: { tv: true, setLayout: vi.fn() } }));
vi.mock('components/focusManager', () => ({ default: {} }));
vi.mock('components/pluginManager', () => ({ pluginManager: {} }));
vi.mock('components/qualityOptions', () => ({ default: {} }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/subtitlesettings/subtitleappearancehelper', () => ({ default: {} }));
vi.mock('components/displaySettings/displaySettings.template.html', () => ({ default: '' }));
vi.mock('components/playbackSettings/playbackSettings.template.html', () => ({ default: '' }));
vi.mock('components/subtitlesettings/subtitlesettings.template.html', () => ({ default: '' }));
vi.mock('elements/emby-select/emby-select', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('elements/emby-button/emby-button', () => ({}));
vi.mock('elements/emby-textarea/emby-textarea', () => ({}));
vi.mock('elements/emby-input/emby-input', () => ({}));
vi.mock('elements/emby-slider/emby-slider', () => ({}));

const setters = [
    'language', 'dateTimeLocale', 'enableThemeSongs', 'enableThemeVideos', 'screensaver',
    'backdropScreensaverInterval', 'slideshowInterval', 'screensaverTime', 'libraryPageSize',
    'maxDaysForNextUp', 'enableRewatchingInNextUp', 'enableFastFadein', 'enableBlurhash',
    'enableBackdrops', 'detailsBanner', 'disableCustomCss', 'allowedAudioChannels',
    'stillWatchingPrompt', 'preferFmp4HlsContainer', 'limitSegmentLength', 'enableCinemaMode',
    'selectAudioNormalization', 'set'
];

function createSettings() {
    return {
        ...Object.fromEntries(setters.map(name => [name, vi.fn()])),
        customCss: vi.fn(),
        enableNextVideoInfoOverlay: vi.fn(),
        setSubtitleAppearanceSettings: vi.fn(),
        setUserInfo: vi.fn().mockResolvedValue(undefined),
        getSubtitleAppearanceSettings: vi.fn().mockReturnValue({})
    };
}

function createContext(page: string) {
    const context = document.createElement('div');
    context.innerHTML = readFileSync(`src/components/${page}/${page}.template.html`, 'utf8');
    return context;
}

describe('Device settings saves', () => {
    it('saves display controls without posting user configuration', async () => {
        const settings = createSettings();
        const context = createContext('displaySettings');
        (context.querySelector('#txtLocalCustomCss') as HTMLTextAreaElement).value = '.page { color: red; }';
        DisplaySettings.prototype.submit.call({ options: { element: context, userSettings: settings } });
        await vi.waitFor(() => expect(settings.customCss).toHaveBeenCalledWith('.page { color: red; }'));
        expect(context.querySelector('.chkDisplayMissingEpisodes, #chkUseEpisodeImagesInNextUp')).toBeNull();
        expect(apiClient.getUser).not.toHaveBeenCalled();
        expect(apiClient.updateUserConfiguration).not.toHaveBeenCalled();
    });

    it('preserves the next-video overlay setter without posting audio or autoplay preferences', async () => {
        const settings = createSettings();
        const context = createContext('playbackSettings');
        (context.querySelector('.chkEnableNextVideoOverlay') as HTMLInputElement).checked = true;
        PlaybackSettings.prototype.submit.call({ options: { element: context, userSettings: settings } });
        await vi.waitFor(() => expect(settings.enableNextVideoInfoOverlay).toHaveBeenCalledWith(true));
        expect(context.querySelector('#selectAudioLanguage, .chkEpisodeAutoPlay, .selectSkipForwardLength, .selectChromecastVersion')).toBeNull();
        expect(apiClient.getUser).not.toHaveBeenCalled();
        expect(apiClient.updateUserConfiguration).not.toHaveBeenCalled();
    });

    it('saves subtitle appearance without posting language or mode preferences', async () => {
        const settings = createSettings();
        const context = createContext('subtitlesettings');
        SubtitleSettings.prototype.onSubmit.call({ options: { element: context, userSettings: settings } });
        await vi.waitFor(() => expect(settings.setSubtitleAppearanceSettings).toHaveBeenCalled());
        expect(context.querySelector('#selectSubtitleLanguage, #selectSubtitlePlaybackMode')).toBeNull();
        expect(apiClient.getUser).not.toHaveBeenCalled();
        expect(apiClient.updateUserConfiguration).not.toHaveBeenCalled();
    });
});
