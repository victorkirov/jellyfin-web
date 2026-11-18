import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { UserSettings } from 'scripts/settings/userSettings';
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
vi.mock('lib/layoutManager', () => ({ default: { tv: true, setLayout: vi.fn() } }));
vi.mock('lib/focusManager', () => ({ default: {} }));
vi.mock('components/pluginManager', () => ({ pluginManager: {} }));
vi.mock('components/qualityOptions', () => ({ default: {} }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/toast/toast', () => ({ default: vi.fn() }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/subtitlesettings/subtitleappearancehelper', () => ({ default: {} }));
vi.mock('components/displaySettings/displaySettings.template.html', () => ({ default: '' }));
vi.mock('components/playbackSettings/playbackSettings.template.html', () => ({ default: '' }));
vi.mock('components/subtitlesettings/subtitlesettings.template.html', () => ({ default: '' }));
vi.mock('components/select/emby-select', () => ({}));
vi.mock('elements/emby-checkbox/emby-checkbox', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('elements/emby-textarea/emby-textarea', () => ({}));
vi.mock('elements/emby-input/emby-input', () => ({}));
vi.mock('elements/emby-slider/emby-slider', () => ({}));

const setters = [
    'language', 'dateTimeLocale', 'enableThemeSongs', 'enableThemeVideos', 'screensaver',
    'backdropScreensaverInterval', 'slideshowInterval', 'screensaverTime', 'libraryPageSize',
    'maxDaysForNextUp', 'enableRewatchingInNextUp', 'enableBlurhash',
    'enableBackdrops', 'detailsBanner', 'disableCustomCss', 'allowedAudioChannels',
    'stillWatchingPrompt', 'preferFmp4HlsContainer', 'limitSegmentLength', 'enableCinemaMode',
    'selectAudioNormalization', 'set'
];

function createSettings() {
    return {
        ...Object.fromEntries(setters.map(name => [name, vi.fn()])),
        customCss: vi.fn(),
        enableBackdrops: vi.fn(),
        detailsBanner: vi.fn(),
        disableCustomCss: vi.fn(),
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

        DisplaySettings.prototype.submit.call({ options: { element: context, userSettings: settings } });
        await vi.waitFor(() => expect(settings.enableBackdrops).toHaveBeenCalled());
        expect(settings.customCss).not.toHaveBeenCalled();
        expect(settings.detailsBanner).not.toHaveBeenCalled();
        expect(settings.disableCustomCss).not.toHaveBeenCalled();
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

it.each([true, false])('preserves stored CSS and banner values on Display submit (%s)', async enabled => {
    localStorage.clear();
    const settings = new UserSettings();
    vi.spyOn(settings, 'setUserInfo').mockResolvedValue(undefined);
    settings.customCss('.page { color: red; }');
    settings.disableCustomCss(enabled);
    settings.detailsBanner(enabled);
    const before = [settings.customCss(), settings.disableCustomCss(), settings.detailsBanner()];
    const context = createContext('displaySettings');
    const saved = vi.spyOn(settings, 'enableBackdrops');
    DisplaySettings.prototype.submit.call({ options: { element: context, userSettings: settings } });
    await vi.waitFor(() => expect(saved).toHaveBeenCalled());
    expect([settings.customCss(), settings.disableCustomCss(), settings.detailsBanner()]).toEqual(before);
    expect(context.querySelector('#txtLocalCustomCss, #chkDisableCustomCss, #chkDetailsBanner')).toBeNull();
});
