import type { Api } from '@jellyfin/sdk/lib/api';

export const QUERY_CACHE_VERSION = 'server-user-v1';

export const serverQueryKey = (api: Api | undefined, ...parts: unknown[]) =>
    ['Server', api?.basePath, ...parts];

export const userQueryKey = (api: Api | undefined, userId: string | undefined, ...parts: unknown[]) =>
    serverQueryKey(api, 'User', userId, ...parts);

export const userLibraryQueryKeys = (api: Api | undefined, userId: string | undefined) =>
    ['Items', 'NextUp', 'ResumeItems', 'LatestMedia']
        .map(family => userQueryKey(api, userId, family));
