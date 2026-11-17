import type { ApiClient } from 'jellyfin-apiclient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryClient } from 'utils/query/queryClient';
import { UserSettings } from './userSettings';

vi.mock('lib/queries/displayPreferences', () => ({ getDisplayPreferencesQuery: () => ({ queryKey: ['display-preferences'] }) }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: vi.fn() } }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: vi.fn(), setQueryData: vi.fn() } }));
vi.mock('../browser', () => ({ default: {} }));

function deferred<T = void>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(complete => {
        resolve = complete;
    });
    return { promise, resolve };
}
const preferences = () => ({ CustomPrefs: { movies: 'old', unrelated: 'server value' } });
const makeClient = (updateDisplayPreferences = vi.fn().mockResolvedValue(undefined), serverId = 'server') =>
    ({ serverId: () => serverId, updateDisplayPreferences }) as unknown as ApiClient;

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(queryClient.fetchQuery).mockImplementation(async () => preferences());
});
afterEach(() => vi.useRealTimers());

describe('serialized display-preference saves', () => {
    it('waits for the first save and coalesces later edits into the next document', async () => {
        const first = deferred();
        const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const settings = new UserSettings();
        await settings.setUserInfo('A', makeClient(save));
        settings.setDisplayPreference('movies', 'first');
        await vi.advanceTimersByTimeAsync(50);
        settings.setDisplayPreference('movies', 'latest');
        settings.saveViewSetting('movies', 'Poster');
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(1);
        first.resolve();
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith('usersettings', { CustomPrefs: {
            movies: 'latest', unrelated: 'server value', 'movies-_view': 'Poster'
        } }, 'A', 'emby');
    });

    it('reconciles a failed durable edit with fresh hydration and retries it after recreation', async () => {
        const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
        const client = makeClient(save);
        const settings = new UserSettings();
        await settings.setUserInfo('A', client);
        settings.saveViewSetting('movies', 'Poster');
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenCalledTimes(1);
        const restored = new UserSettings();
        vi.mocked(queryClient.fetchQuery).mockResolvedValueOnce({ CustomPrefs: { movies: 'new server sort', unrelated: 'fresh' } });
        await restored.setUserInfo('A', client);
        expect(restored.getSavedView('movies')).toBe('Poster');
        expect(restored.get('movies')).toBe('new server sort');
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenLastCalledWith('usersettings', { CustomPrefs: {
            movies: 'new server sort', unrelated: 'fresh', 'movies-_view': 'Poster'
        } }, 'A', 'emby');
    });

    it('keeps canceled queued edits for the original user without writing them as another user', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const client = makeClient(save);
        const settings = new UserSettings();
        await settings.setUserInfo('A', client);
        settings.saveViewSetting('movies', 'Poster');
        await settings.setUserInfo('B', client);
        await vi.runAllTimersAsync();
        expect(save).not.toHaveBeenCalled();
        expect(settings.getSavedView('movies')).toBeUndefined();
        await settings.setUserInfo('A', client);
        expect(settings.getSavedView('movies')).toBe('Poster');
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][2]).toBe('A');
    });

    it('does not replay dirty edits for the same user on a different server', async () => {
        const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
        const settings = new UserSettings();
        await settings.setUserInfo('A', makeClient(save, 'first'));
        settings.saveViewSetting('movies', 'Poster');
        await vi.runAllTimersAsync();
        const restored = new UserSettings();
        await restored.setUserInfo('A', makeClient(save, 'second'));
        await vi.runAllTimersAsync();
        expect(restored.getSavedView('movies')).toBeUndefined();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('reconciles edits made while hydration is pending', async () => {
        const hydration = deferred<ReturnType<typeof preferences>>();
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(hydration.promise);
        const save = vi.fn().mockResolvedValue(undefined);
        const settings = new UserSettings();
        const ready = settings.setUserInfo('A', makeClient(save));
        settings.saveViewSetting('movies', 'Poster');
        hydration.resolve(preferences());
        await ready;
        expect(settings.getSavedView('movies')).toBe('Poster');
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('keeps a same-user rebind serialized behind its pending request', async () => {
        const first = deferred();
        const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const client = makeClient(save);
        const settings = new UserSettings();
        await settings.setUserInfo('A', client);
        settings.setDisplayPreference('movies', 'first');
        await vi.advanceTimersByTimeAsync(50);
        await settings.setUserInfo('A', client);
        settings.setDisplayPreference('movies', 'latest');
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(1);
        first.resolve();
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1][1].CustomPrefs.movies).toBe('latest');
    });

    it('serializes separate settings pages for the same server and user', async () => {
        const first = deferred();
        const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const client = makeClient(save);
        const firstPage = new UserSettings();
        await firstPage.setUserInfo('other-user', client);
        firstPage.saveViewSetting('movies', 'Poster');
        await vi.advanceTimersByTimeAsync(50);
        const secondPage = new UserSettings();
        await secondPage.setUserInfo('other-user', client);
        secondPage.setDisplayPreference('movies', 'new sort');
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(1);
        first.resolve();
        await vi.advanceTimersByTimeAsync(50);
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith('usersettings', { CustomPrefs: {
            movies: 'new sort', unrelated: 'server value', 'movies-_view': 'Poster'
        } }, 'other-user', 'emby');
    });

    it('accepts fresh server values when rebinding after an acknowledged save', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const client = makeClient(save);
        const settings = new UserSettings();
        await settings.setUserInfo('A', client);
        settings.setDisplayPreference('movies', 'client');
        await vi.runAllTimersAsync();
        vi.mocked(queryClient.fetchQuery).mockResolvedValueOnce({ CustomPrefs: { movies: 'server-new' } });
        await settings.setUserInfo('A', client);
        expect(settings.getDisplayPreference('movies')).toBe('server-new');
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenCalledTimes(1);
    });

    it('keeps newer edits if a prior save settles while rebinding hydration is pending', async () => {
        const first = deferred();
        const hydration = deferred<ReturnType<typeof preferences>>();
        const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
        const client = makeClient(save);
        const settings = new UserSettings();
        await settings.setUserInfo('A', client);
        settings.setDisplayPreference('movies', 'client');
        await vi.advanceTimersByTimeAsync(50);
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(hydration.promise);
        const ready = settings.setUserInfo('A', client);
        first.resolve();
        await vi.advanceTimersByTimeAsync(0);
        settings.saveViewSetting('movies', 'Poster');
        hydration.resolve(preferences());
        await ready;
        expect(settings.getDisplayPreference('movies')).toBe('client');
        expect(settings.getSavedView('movies')).toBe('Poster');
        await vi.runAllTimersAsync();
        expect(save).toHaveBeenCalledTimes(2);
        expect(save).toHaveBeenLastCalledWith('usersettings', { CustomPrefs: {
            movies: 'client', unrelated: 'server value', 'movies-_view': 'Poster'
        } }, 'A', 'emby');
    });
});
