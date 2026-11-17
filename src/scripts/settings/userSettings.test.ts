import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from 'jellyfin-apiclient';

import appSettings from './appSettings';
import { UserSettings } from './userSettings';
import Events from 'utils/events';

vi.mock('lib/queries/displayPreferences', () => ({ getDisplayPreferencesQuery: vi.fn() }));
vi.mock('lib/queries/user', () => ({ getUserQuery: vi.fn() }));
vi.mock('hooks/useUsers', () => ({ ['QUERY_KEY']: 'Users' }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: vi.fn() } }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: vi.fn(), invalidateQueries: vi.fn() } }));
vi.mock('../browser', () => ({ default: {} }));

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('settings JSON decoding', () => {
    it('does not parse missing settings while the user preference snapshot is empty', () => {
        const settings = new UserSettings();
        settings.displayPrefs = { CustomPrefs: {} };
        const parse = vi.spyOn(JSON, 'parse');
        try {
            expect(settings.loadQuerySettings('missing', { Limit: 100 })).toEqual({ Limit: 100 });
            expect(parse).not.toHaveBeenCalled();
        } finally {
            parse.mockRestore();
        }
    });

    it.each(['{broken', 'null', '[]', '42', '"text"'])('uses defaults for %s', value => {
        const settings = new UserSettings();
        appSettings.set('movies', value);
        appSettings.set('movies-filter', value);
        appSettings.set('localplayersubtitleappearance3', value);
        expect(settings.loadQuerySettings('movies', { Limit: 100 })).toEqual({ Limit: 100 });
        expect(settings.getSubtitleAppearanceSettings()).toEqual({ verticalPosition: -3, aspectMode: 'contain' });
    });

    it('keeps partial settings and valid legacy JSON unchanged', () => {
        const settings = new UserSettings();
        const query = { SortBy: 'SortName', SortOrder: 'Descending', IsFavorite: false, Genres: ['Drama'], Limit: 100 };
        settings.saveQuerySettings('movies', query);
        expect(settings.loadQuerySettings('movies', { Limit: 100 })).toEqual(query);
        expect(appSettings.get('movies')).toBe('{"SortBy":"SortName","SortOrder":"Descending"}');
        expect(appSettings.get('movies-filter')).toBe('{"IsFavorite":false,"Genres":["Drama"]}');
        settings.setSubtitleAppearanceSettings({ verticalPosition: 0 });
        expect(settings.getSubtitleAppearanceSettings()).toEqual({ verticalPosition: 0, aspectMode: 'contain' });
    });

    it('does not let one user or caller mutate subtitle defaults', () => {
        const first = new UserSettings();
        const second = new UserSettings();
        first.currentUserId = 'A';
        second.currentUserId = 'B';
        first.setSubtitleAppearanceSettings({ verticalPosition: 5, fontSize: 'large' });
        expect((first.getSubtitleAppearanceSettings() as { verticalPosition: number }).verticalPosition).toBe(5);
        const appearance = second.getSubtitleAppearanceSettings() as { aspectMode: string };
        expect(appearance).toEqual({ verticalPosition: -3, aspectMode: 'contain' });
        appearance.aspectMode = 'cover';
        expect((second.getSubtitleAppearanceSettings() as { aspectMode: string }).aspectMode).toBe('contain');
    });
});

describe('storage failure policy', () => {
    it('returns defaults on denied reads and keeps failed saves for the session', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota');
        });
        expect(appSettings.get('unavailable')).toBeNull();
        expect(appSettings.set('session-only', 'legacy value', 'A')).toBe(false);
        expect(appSettings.get('session-only', 'A')).toBe('legacy value');
        expect(appSettings.get('session-only', 'B')).toBeNull();
    });
});

describe('local and server display preferences', () => {
    beforeEach(() => vi.useFakeTimers());

    it('keeps device settings local even when server preferences are loaded', async () => {
        const settings = new UserSettings();
        const updateDisplayPreferences = vi.fn().mockResolvedValue(undefined);
        settings.currentUserId = 'A';
        settings.currentApiClient = { updateDisplayPreferences } as unknown as ApiClient;
        settings.displayPrefs = { CustomPrefs: {} };
        settings.enableBackdrops(true);
        settings.allowedAudioChannels('2');
        settings.enableNextVideoInfoOverlay(true);
        settings.enableVideoRemainingTime(true);
        settings.setSubtitleAppearanceSettings({ verticalPosition: 0 });
        await vi.runAllTimersAsync();
        expect(updateDisplayPreferences).not.toHaveBeenCalled();
        expect(settings.displayPrefs.CustomPrefs).toEqual({});
        expect(settings.enableNextVideoInfoOverlay()).toBe(true);
    });

    it('coalesces retained display preferences and preserves their local copy', async () => {
        const settings = new UserSettings();
        const updateDisplayPreferences = vi.fn().mockResolvedValue(undefined);
        settings.currentUserId = 'A';
        settings.currentApiClient = { updateDisplayPreferences } as unknown as ApiClient;
        settings.displayPrefs = { CustomPrefs: { retained: 'value' } };
        settings.setDisplayPreference('movies', '{"SortBy":"SortName"}');
        settings.saveViewSetting('movies', 'Poster');
        expect(settings.getDisplayPreference('movies')).toBe('{"SortBy":"SortName"}');
        expect(appSettings.get('movies', 'A')).toBe('{"SortBy":"SortName"}');
        await vi.runAllTimersAsync();
        expect(updateDisplayPreferences).toHaveBeenCalledExactlyOnceWith('usersettings', {
            CustomPrefs: { retained: 'value', movies: '{"SortBy":"SortName"}', 'movies-_view': 'Poster' }
        }, 'A', 'emby');
    });

    it('reports rejected saves without losing the local setting or leaking rejection', async () => {
        const settings = new UserSettings();
        const error = new Error('offline');
        settings.currentUserId = 'A';
        settings.currentApiClient = { updateDisplayPreferences: vi.fn().mockRejectedValue(error) } as unknown as ApiClient;
        settings.displayPrefs = { CustomPrefs: {} };
        const onError = vi.fn();
        Events.on(settings, 'saveerror', onError);
        settings.setDisplayPreference('layout', 'Poster');
        await vi.runAllTimersAsync();
        expect(onError).toHaveBeenCalledWith({ type: 'saveerror' }, error);
        expect(appSettings.get('layout', 'A')).toBe('Poster');
        expect(settings.getDisplayPreference('layout')).toBe('Poster');
    });
});

describe('TV blurhash preference', () => {
    it('defaults blurred placeholders to off', () => {
        expect(new UserSettings().enableBlurhash()).toBe(false);
    });
    it.each([true, false])('preserves an explicit %s choice', enabled => {
        const settings = new UserSettings();
        settings.enableBlurhash(enabled);
        expect(new UserSettings().enableBlurhash()).toBe(enabled);
    });
});
