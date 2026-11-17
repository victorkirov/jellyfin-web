import type { ApiClient } from 'jellyfin-apiclient';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UserSettings } from './userSettings';
import { queryClient } from 'utils/query/queryClient';

vi.mock('lib/queries/displayPreferences', () => ({ getDisplayPreferencesQuery: () => ({ queryKey: ['display-preferences'] }) }));
vi.mock('lib/queries/user', () => ({ getUserQuery: vi.fn() }));
vi.mock('hooks/useUsers', () => ({ ['QUERY_KEY']: 'Users' }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApi: vi.fn() } }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: vi.fn(), invalidateQueries: vi.fn(), setQueryData: vi.fn() } }));
vi.mock('../browser', () => ({ default: {} }));

const apiClient = { serverId: () => 'server' } as unknown as ApiClient;
const preferences = (value: string) => ({ CustomPrefs: { movies: value } });
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(complete => {
        resolve = complete;
    });
    return { promise, resolve };
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
});

describe('user-settings binding', () => {
    it('cancels queued saves on a binding change and keeps the cached snapshot unchanged', async () => {
        vi.useFakeTimers();
        const settings = new UserSettings();
        const updateDisplayPreferences = vi.fn().mockResolvedValue(undefined);
        const client = { ...apiClient, updateDisplayPreferences } as unknown as ApiClient;
        const cached = preferences('original');
        vi.mocked(queryClient.fetchQuery).mockResolvedValueOnce(cached).mockResolvedValueOnce(preferences('B'));
        await settings.setUserInfo('A', client);
        settings.set('movies', 'new sort');
        expect(cached.CustomPrefs.movies).toBe('original');
        await settings.setUserInfo('B', client);
        await vi.runAllTimersAsync();
        expect(updateDisplayPreferences).not.toHaveBeenCalled();
        expect(settings.get('movies')).toBe('B');
    });

    it('clears the previous snapshot while B loads and ignores delayed A hydration', async () => {
        const settings = new UserSettings();
        settings.displayPrefs = preferences('previous');
        const first = deferred<ReturnType<typeof preferences>>();
        const second = deferred<ReturnType<typeof preferences>>();
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const pendingA = settings.setUserInfo('A', apiClient);
        expect(settings.displayPrefs).toBeNull();
        const pendingB = settings.setUserInfo('B', apiClient);
        second.resolve(preferences('B'));
        await pendingB;
        first.resolve(preferences('A'));
        await pendingA;
        expect(settings.get('movies')).toBe('B');
    });

    it('does not hydrate after sign-out, including a subsequent binding to the same user', async () => {
        const settings = new UserSettings();
        const first = deferred<ReturnType<typeof preferences>>();
        const second = deferred<ReturnType<typeof preferences>>();
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const pendingA = settings.setUserInfo('A', apiClient);
        await settings.setUserInfo(undefined, apiClient);
        const currentA = settings.setUserInfo('A', apiClient);
        first.resolve(preferences('obsolete A'));
        await pendingA;
        expect(settings.displayPrefs).toBeNull();
        await settings.setUserInfo(undefined, apiClient);
        second.resolve(preferences('A after logout'));
        await currentA;
        expect(settings.displayPrefs).toBeNull();
        expect(settings.get('movies')).toBeNull();
    });
});
