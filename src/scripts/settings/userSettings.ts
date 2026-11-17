import { StillWatchingOptions } from 'plugins/stillWatching/constants';
import { toBoolean } from 'utils/string';

import browser from '../browser';
import { DisplayPreferenceSettings } from './displayPreferenceSettings';
import { allowedSortSettings, allowedFilterSettings, filterSettingsPostfix, filterQuerySettings, readJsonSetting } from 'lib/settings/querySettings';

const defaultSubtitleAppearanceSettings = {
    verticalPosition: -3,
    aspectMode: 'contain'
};

export class UserSettings extends DisplayPreferenceSettings {
    allowedAudioChannels(): string;
    allowedAudioChannels(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    allowedAudioChannels(val?: string) {
        if (val !== undefined) {
            return this.set('allowedAudioChannels', val, false);
        }

        return this.get('allowedAudioChannels', false) || '-1';
    }

    preferFmp4HlsContainer(val?: boolean) {
        if (val !== undefined) {
            return this.set('preferFmp4HlsContainer', val.toString(), false);
        }

        // Enable it by default only for the platforms that play fMP4 for sure.
        return toBoolean(this.get('preferFmp4HlsContainer', false), browser.safari || browser.firefox || (browser as typeof browser & { chrome?: boolean }).chrome || browser.edgeChromium);
    }

    limitSegmentLength(val?: boolean) {
        if (val !== undefined) {
            return this.set('limitSegmentLength', val.toString(), false);
        }

        return toBoolean(this.get('limitSegmentLength', false), false);
    }

    enableCinemaMode(val?: boolean) {
        if (val !== undefined) {
            return this.set('enableCinemaMode', val.toString(), false);
        }

        return toBoolean(this.get('enableCinemaMode', false), true);
    }

    selectAudioNormalization(): string;
    selectAudioNormalization(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    selectAudioNormalization(val?: string) {
        if (val !== undefined) {
            return this.set('selectAudioNormalization', val, false);
        }

        return this.get('selectAudioNormalization', false) || 'TrackGain';
    }

    enableNextVideoInfoOverlay(val?: boolean) {
        if (val !== undefined) {
            return this.setLocalSetting('enableNextVideoInfoOverlay', val.toString());
        }

        return toBoolean(this.get('enableNextVideoInfoOverlay', false), true);
    }

    enableVideoRemainingTime(val?: boolean) {
        if (val !== undefined) {
            return this.setLocalSetting('enableVideoRemainingTime', val.toString());
        }

        return toBoolean(this.get('enableVideoRemainingTime', false), true);
    }

    enableThemeSongs(val?: boolean) {
        if (val !== undefined) {
            return this.set('enableThemeSongs', val.toString(), false);
        }

        return toBoolean(this.get('enableThemeSongs', false), false);
    }

    enableThemeVideos(val?: boolean) {
        if (val !== undefined) {
            return this.set('enableThemeVideos', val.toString(), false);
        }

        return toBoolean(this.get('enableThemeVideos', false), false);
    }

    enableFastFadein(val?: boolean) {
        if (val !== undefined) {
            return this.set('fastFadein', val.toString(), false);
        }

        return toBoolean(this.get('fastFadein', false), true);
    }

    enableBlurhash(val?: boolean) {
        if (val !== undefined) {
            return this.set('blurhash', val.toString(), false);
        }

        return toBoolean(this.get('blurhash', false), true);
    }

    enableBackdrops(val?: boolean) {
        if (val !== undefined) {
            return this.set('enableBackdrops', val.toString(), false);
        }

        return toBoolean(this.get('enableBackdrops', false), false);
    }

    disableCustomCss(val?: boolean) {
        if (val !== undefined) {
            return this.set('disableCustomCss', val.toString(), false);
        }

        return toBoolean(this.get('disableCustomCss', false), false);
    }

    customCss(): string | null | undefined;
    customCss(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    customCss(val?: string) {
        if (val !== undefined) {
            return this.set('customCss', val.toString(), false);
        }

        return this.get('customCss', false);
    }

    detailsBanner(val?: boolean) {
        if (val !== undefined) {
            return this.set('detailsBanner', val.toString(), false);
        }

        return toBoolean(this.get('detailsBanner', false), true);
    }

    useEpisodeImagesInNextUpAndResume(val?: string | boolean) {
        if (val !== undefined) {
            return this.set('useEpisodeImagesInNextUpAndResume', val.toString(), true);
        }

        return toBoolean(this.get('useEpisodeImagesInNextUpAndResume', true), false);
    }

    language(): string | null | undefined;
    language(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    language(val?: string) {
        if (val !== undefined) {
            return this.set('language', val.toString(), false);
        }

        return this.get('language', false);
    }

    dateTimeLocale(): string | null | undefined;
    dateTimeLocale(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    dateTimeLocale(val?: string) {
        if (val !== undefined) {
            return this.set('datetimelocale', val.toString(), false);
        }

        return this.get('datetimelocale', false);
    }

    skipBackLength(): number;
    skipBackLength(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    skipBackLength(val?: number) {
        if (val !== undefined) {
            return this.set('skipBackLength', val.toString());
        }

        return parseInt(this.get('skipBackLength') || '10000', 10);
    }

    skipForwardLength(): number;
    skipForwardLength(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    skipForwardLength(val?: number) {
        if (val !== undefined) {
            return this.set('skipForwardLength', val.toString());
        }

        return parseInt(this.get('skipForwardLength') || '30000', 10);
    }

    dashboardTheme(): string | null | undefined;
    dashboardTheme(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    dashboardTheme(val?: string) {
        if (val !== undefined) {
            return this.set('dashboardTheme', val);
        }

        return this.get('dashboardTheme');
    }

    skin(): string | null | undefined;
    skin(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    skin(val?: string) {
        if (val !== undefined) {
            return this.set('skin', val, false);
        }

        return this.get('skin', false);
    }

    theme(): string | null | undefined;
    theme(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    theme(val?: string) {
        if (val !== undefined) {
            return this.set('appTheme', val, false);
        }

        return this.get('appTheme', false);
    }

    screensaver(): string | null | undefined;
    screensaver(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    screensaver(val?: string) {
        if (val !== undefined) {
            return this.set('screensaver', val, false);
        }

        return this.get('screensaver', false);
    }

    backdropScreensaverInterval(): number;
    backdropScreensaverInterval(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    backdropScreensaverInterval(val?: number) {
        if (val !== undefined) {
            return this.set('backdropScreensaverInterval', val.toString(), false);
        }

        return parseInt(this.get('backdropScreensaverInterval', false) || '', 10) || 5;
    }

    slideshowInterval(): number;
    slideshowInterval(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    slideshowInterval(val?: number) {
        if (val !== undefined) {
            return this.set('slideshowInterval', val.toString(), false);
        }

        return parseInt(this.get('slideshowInterval', false) || '', 10) || 5;
    }

    screensaverTime(): number;
    screensaverTime(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    screensaverTime(val?: number) {
        if (val !== undefined) {
            return this.set('screensaverTime', val.toString(), false);
        }

        return parseInt(this.get('screensaverTime', false) || '', 10) || 180;
    }

    libraryPageSize(): number;
    libraryPageSize(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    libraryPageSize(val?: number) {
        if (val !== undefined) {
            return this.set('libraryPageSize', val.toString(), false);
        }

        const libraryPageSize = parseInt(this.get('libraryPageSize', false) || '', 10);
        if (libraryPageSize === 0) {
            // Explicitly return 0 to avoid returning 100 because 0 is falsy.
            return 0;
        } else {
            return libraryPageSize || 100;
        }
    }

    maxDaysForNextUp(): number;
    maxDaysForNextUp(val: number): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    maxDaysForNextUp(val?: number) {
        if (val !== undefined) {
            return this.set('maxDaysForNextUp', val.toString(), false);
        }

        const maxDaysForNextUp = parseInt(this.get('maxDaysForNextUp', false) || '', 10);
        if (maxDaysForNextUp === 0) {
            // Explicitly return 0 to avoid returning 100 because 0 is falsy.
            return 0;
        } else {
            return maxDaysForNextUp || 365;
        }
    }

    enableRewatchingInNextUp(val?: boolean) {
        if (val !== undefined) {
            return this.set('enableRewatchingInNextUp', val.toString(), false);
        }

        return toBoolean(this.get('enableRewatchingInNextUp', false), false);
    }

    soundEffects(): string | null | undefined;
    soundEffects(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    soundEffects(val?: string) {
        if (val !== undefined) {
            return this.set('soundeffects', val, false);
        }

        return this.get('soundeffects', false);
    }

    stillWatchingPrompt(): string;
    stillWatchingPrompt(val: string): boolean;
    /** @returns Stored value when reading, persistence result when writing. */
    stillWatchingPrompt(val?: string) {
        if (val !== undefined) {
            return this.set('stillWatchingPrompt', val, false);
        }

        return this.get('stillWatchingPrompt', false) || StillWatchingOptions.Disabled;
    }

    loadQuerySettings<T extends object>(key: string, query: T) {
        const sortSettings = filterQuerySettings(readJsonSetting(this.get(key)), allowedSortSettings);
        const filterSettings = filterQuerySettings(readJsonSetting(this.get(key + filterSettingsPostfix, false)), allowedFilterSettings);

        return Object.assign(query, sortSettings, filterSettings);
    }

    saveQuerySettings(key: string, query: object) {
        const sortSettings = filterQuerySettings(query, allowedSortSettings);
        const filterSettings = filterQuerySettings(query, allowedFilterSettings);

        this.set(key, JSON.stringify(sortSettings));
        this.set(key + filterSettingsPostfix, JSON.stringify(filterSettings), false);
    }

    getSavedView(key: string) {
        return this.get(key + '-_view');
    }

    saveViewSetting(key: string, value: string) {
        return this.set(key + '-_view', value);
    }

    getSubtitleAppearanceSettings(key?: string) {
        key = key || 'localplayersubtitleappearance3';
        return readJsonSetting(this.get(key, false), defaultSubtitleAppearanceSettings) as typeof defaultSubtitleAppearanceSettings & { subtitleStyling?: string; [name: string]: unknown };
    }

    setSubtitleAppearanceSettings(value: object, key?: string) {
        key = key || 'localplayersubtitleappearance3';
        return this.set(key, JSON.stringify(value), false);
    }

    setFilter(key: string, value: string) {
        return this.set(key, value, true);
    }

    getFilter(key: string) {
        return this.get(key, true);
    }

    getSortValuesLegacy(key: string, defaultSortBy: string) {
        return {
            sortBy: this.getFilter(key + '-sortby') || defaultSortBy,
            sortOrder: this.getFilter(key + '-sortorder') === 'Descending' ? 'Descending' : 'Ascending'
        };
    }
}

export const currentSettings = new UserSettings;

// Wrappers for non-ES6 modules and backward compatibility
export const setUserInfo = currentSettings.setUserInfo.bind(currentSettings);
export const set = currentSettings.set.bind(currentSettings);
export const get = currentSettings.get.bind(currentSettings);
export const allowedAudioChannels = currentSettings.allowedAudioChannels.bind(currentSettings);
export const preferFmp4HlsContainer = currentSettings.preferFmp4HlsContainer.bind(currentSettings);
export const limitSegmentLength = currentSettings.limitSegmentLength.bind(currentSettings);
export const enableCinemaMode = currentSettings.enableCinemaMode.bind(currentSettings);
export const selectAudioNormalization = currentSettings.selectAudioNormalization.bind(currentSettings);
export const enableNextVideoInfoOverlay = currentSettings.enableNextVideoInfoOverlay.bind(currentSettings);
export const enableVideoRemainingTime = currentSettings.enableVideoRemainingTime.bind(currentSettings);
export const enableThemeSongs = currentSettings.enableThemeSongs.bind(currentSettings);
export const enableThemeVideos = currentSettings.enableThemeVideos.bind(currentSettings);
export const enableFastFadein = currentSettings.enableFastFadein.bind(currentSettings);
export const enableBlurhash = currentSettings.enableBlurhash.bind(currentSettings);
export const enableBackdrops = currentSettings.enableBackdrops.bind(currentSettings);
export const detailsBanner = currentSettings.detailsBanner.bind(currentSettings);
export const useEpisodeImagesInNextUpAndResume = currentSettings.useEpisodeImagesInNextUpAndResume.bind(currentSettings);
export const language = currentSettings.language.bind(currentSettings);
export const dateTimeLocale = currentSettings.dateTimeLocale.bind(currentSettings);
export const skipBackLength = currentSettings.skipBackLength.bind(currentSettings);
export const skipForwardLength = currentSettings.skipForwardLength.bind(currentSettings);
export const dashboardTheme = currentSettings.dashboardTheme.bind(currentSettings);
export const skin = currentSettings.skin.bind(currentSettings);
export const theme = currentSettings.theme.bind(currentSettings);
export const screensaver = currentSettings.screensaver.bind(currentSettings);
export const backdropScreensaverInterval = currentSettings.backdropScreensaverInterval.bind(currentSettings);
export const slideshowInterval = currentSettings.slideshowInterval.bind(currentSettings);
export const screensaverTime = currentSettings.screensaverTime.bind(currentSettings);
export const libraryPageSize = currentSettings.libraryPageSize.bind(currentSettings);
export const maxDaysForNextUp = currentSettings.maxDaysForNextUp.bind(currentSettings);
export const enableRewatchingInNextUp = currentSettings.enableRewatchingInNextUp.bind(currentSettings);
export const soundEffects = currentSettings.soundEffects.bind(currentSettings);
export const stillWatchingPrompt = currentSettings.stillWatchingPrompt.bind(currentSettings);
export const loadQuerySettings = currentSettings.loadQuerySettings.bind(currentSettings);
export const saveQuerySettings = currentSettings.saveQuerySettings.bind(currentSettings);
export const getSubtitleAppearanceSettings = currentSettings.getSubtitleAppearanceSettings.bind(currentSettings);
export const setSubtitleAppearanceSettings = currentSettings.setSubtitleAppearanceSettings.bind(currentSettings);
export const setFilter = currentSettings.setFilter.bind(currentSettings);
export const getFilter = currentSettings.getFilter.bind(currentSettings);
export const customCss = currentSettings.customCss.bind(currentSettings);
export const disableCustomCss = currentSettings.disableCustomCss.bind(currentSettings);
export const getSavedView = currentSettings.getSavedView.bind(currentSettings);
export const saveViewSetting = currentSettings.saveViewSetting.bind(currentSettings);
export const getSortValuesLegacy = currentSettings.getSortValuesLegacy.bind(currentSettings);
