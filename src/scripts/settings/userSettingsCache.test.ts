import { Api } from '@jellyfin/sdk';
import type { ApiClient } from 'jellyfin-apiclient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getDisplayPreferencesQuery } from 'lib/queries/displayPreferences';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import { queryClient } from 'utils/query/queryClient';
import { UserSettings } from './userSettings';

const mocks = vi.hoisted(() => ({ getDisplayPreferences: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/display-preference-api', () => ({ getDisplayPreferenceApi: () => mocks }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: vi.fn() } }));
vi.mock('../browser', () => ({ default: {} }));

beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    queryClient.clear();
});
afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
});

describe('display-preference cache interaction', () => {
    it('retains an edited library sort across rebinding within staleTime and the next save', async () => {
        const api = new Api('https://server', { name: 'test', version: '1' }, { name: 'test', id: 'test' });
        vi.mocked(ServerConnections.getApi).mockReturnValue(api);
        mocks.getDisplayPreferences.mockResolvedValue({ data: { CustomPrefs: { movies: '{"SortBy":"SortName"}' } } });
        const updateDisplayPreferences = vi.fn().mockResolvedValue(undefined);
        const client = { serverId: () => 'server', updateDisplayPreferences } as unknown as ApiClient;
        const settings = new UserSettings();
        await settings.setUserInfo('user', client);
        const queryKey = getDisplayPreferencesQuery(api, {
            userId: 'user', displayPreferencesId: 'usersettings', client: 'emby'
        }).queryKey;
        const original = queryClient.getQueryData(queryKey);
        await vi.advanceTimersByTimeAsync(20000);
        const sort = { SortBy: 'DateCreated', SortOrder: 'Descending' };
        settings.saveQuerySettings('movies', sort);
        await vi.advanceTimersByTimeAsync(50);
        await settings.setUserInfo('user', client);
        expect(settings.loadQuerySettings('movies', {})).toEqual(sort);
        expect(mocks.getDisplayPreferences).toHaveBeenCalledTimes(1);
        expect(original).toEqual({ CustomPrefs: { movies: '{"SortBy":"SortName"}' } });
        settings.saveViewSetting('movies', 'Poster');
        await vi.advanceTimersByTimeAsync(50);
        expect(updateDisplayPreferences).toHaveBeenLastCalledWith('usersettings', {
            CustomPrefs: { movies: JSON.stringify(sort), 'movies-_view': 'Poster' }
        }, 'user', 'emby');
    });
});
