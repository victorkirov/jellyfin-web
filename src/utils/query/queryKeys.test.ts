import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Api } from '@jellyfin/sdk';
import { QueryClient, dehydrate, hydrate, useQuery } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('hooks/useApi', () => ({ useApi: vi.fn() }));
vi.mock('@tanstack/react-query', async importOriginal => ({
    ...await importOriginal<typeof import('@tanstack/react-query')>(),
    useQuery: vi.fn()
}));

import { useApi } from 'hooks/useApi';
import { useArtistsSearch } from 'apps/legacy/features/search/api/useArtistsSearch';
import { usePeopleSearch } from 'apps/legacy/features/search/api/usePeopleSearch';
import { useStudiosSearch } from 'apps/legacy/features/search/api/useStudiosSearch';
import { useSearchItems } from 'apps/legacy/features/search/api/useSearchItems';
import { useProgramsSearch } from 'apps/legacy/features/search/api/useProgramsSearch';
import { useVideoSearch } from 'apps/legacy/features/search/api/useVideoSearch';
import { useLiveTvSearch } from 'apps/legacy/features/search/api/useLiveTvSearch';
import { useSearchSuggestions } from 'apps/legacy/features/search/api/useSearchSuggestions';

import { useUsers } from 'hooks/useUsers';
import { getUserQuery } from 'hooks/api/useUser';
import { getDisplayPreferencesQuery } from 'hooks/api/useDisplayPreferences';
import { getItemQuery } from 'hooks/useItem';
import { getBrandingOptionsQuery } from 'hooks/useBrandingOptions';
import { getNextUpQuery } from 'apps/legacy/features/libraries/api/useNextUp';
import { getResumeItemsQuery } from 'apps/legacy/features/libraries/api/useResumeItems';
import { getLatestMediaQuery } from 'apps/legacy/features/libraries/api/useLatestMedia';

const makeApi = (basePath: string) => new Api(basePath,
    { name: 'test', version: '1' }, { name: 'test', id: 'test' });

describe('query identity', () => {
    it('scopes permission-dependent user lists by caller, server and filters', () => {
        const keys = [
            { api: makeApi('https://first'), user: { Id: 'a' }, params: { isDisabled: false } },
            { api: makeApi('https://first'), user: { Id: 'b' }, params: { isDisabled: false } },
            { api: makeApi('https://second'), user: { Id: 'a' }, params: { isDisabled: false } },
            { api: makeApi('https://first'), user: { Id: 'a' }, params: { isDisabled: true } }
        ].map(({ api, user, params }) => {
            vi.mocked(useApi).mockReturnValue({ api, user });
            useUsers(params);
            return JSON.stringify(vi.mocked(useQuery).mock.lastCall?.[0]?.queryKey);
        });
        expect(new Set(keys).size).toBe(4);
    });

    it('scopes every search hook to its current user and server', () => {
        vi.mocked(useQuery).mockReturnValue({} as ReturnType<typeof useQuery>);
        const hooks = [useArtistsSearch, usePeopleSearch, useStudiosSearch, useSearchItems,
            useProgramsSearch, useVideoSearch, useLiveTvSearch, useSearchSuggestions];
        hooks.forEach(hook => {
            const keys = [
                { api: makeApi('https://first'), user: { Id: 'a' } },
                { api: makeApi('https://first'), user: { Id: 'b' } },
                { api: makeApi('https://second'), user: { Id: 'a' } }
            ].map(context => {
                vi.mocked(useApi).mockReturnValue(context);
                const container = document.createElement('div');
                const root = createRoot(container);
                const Probe = () => {
                    hook('parent');
                    return null;
                };
                vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
                try {
                    act(() => root.render(React.createElement(Probe)));
                    const options = vi.mocked(useQuery).mock.lastCall?.[0];
                    return JSON.stringify(options?.queryKey);
                } finally {
                    act(() => root.unmount());
                    vi.unstubAllGlobals();
                }
            });
            expect(new Set(keys).size).toBe(3);
        });
    });

    it('separates identical parameters for two servers and two users', () => {
        const first = makeApi('https://first');
        const second = makeApi('https://second');
        const queries = [
            (api: Api, userId: string) => getUserQuery(api, { userId }),
            (api: Api, userId: string) => getDisplayPreferencesQuery(api, { userId, displayPreferencesId: 'prefs', client: 'test' }),
            (api: Api, userId: string) => getItemQuery(api, 'item', userId),
            (api: Api, userId: string) => getNextUpQuery(api, { userId }),
            (api: Api, userId: string) => getResumeItemsQuery(api, { userId }),
            (api: Api, userId: string) => getLatestMediaQuery(api, { userId })
        ];
        queries.forEach(query => {
            const keys = [query(first, 'a'), query(first, 'b'), query(second, 'a')]
                .map(options => JSON.stringify(options.queryKey));
            expect(new Set(keys).size).toBe(3);
        });
        expect(getBrandingOptionsQuery(first).queryKey).not.toEqual(getBrandingOptionsQuery(second).queryKey);
    });

    it('keeps restored data scoped across server changes and logout', () => {
        const client = new QueryClient();
        const first = makeApi('https://first');
        const second = makeApi('https://second');
        client.setQueryData(getUserQuery(first, { userId: 'a' }).queryKey, { Id: 'a' });
        const restored = new QueryClient();
        hydrate(restored, dehydrate(client));
        expect(restored.getQueryData(getUserQuery(first, { userId: 'a' }).queryKey)).toEqual({ Id: 'a' });
        expect(restored.getQueryData(getUserQuery(second, { userId: 'a' }).queryKey)).toBeUndefined();
        expect(restored.getQueryData(getUserQuery(first, { userId: 'b' }).queryKey)).toBeUndefined();
        restored.clear();
        expect(restored.getQueryData(getUserQuery(first, { userId: 'a' }).queryKey)).toBeUndefined();
    });
});
