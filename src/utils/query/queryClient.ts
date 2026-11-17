import { QueryCache, QueryClient } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

import { getHttpStatus } from 'utils/httpStatus';

// TODO: Move this file to lib/query

/** HTTP status code for unauthorized requests. */
const HTTP_UNAUTHORIZED = 401;
/** Maximum garbage collection time. Set to 24 hours for persistence. */
const MAX_GC_TIME = 24 * 60 * 60 * 1000;
/** Maximum stale time. Set to 1 minute for query reuse. */
const MAX_STALENESS = 60 * 1000;
/** Maximum number of retries for failed queries. */
const MAX_RETRIES = 2;

// NOTE: queryClient needs to be defined before the QueryCache so that it can be used in the onError callback.
// eslint-disable-next-line prefer-const
export let queryClient: QueryClient;

/** Query cache for handling query errors and side effects. */
const queryCache = new QueryCache({
    onError: (error, { queryKey }) => {
        if (!queryClient) return;

        const status = getHttpStatus(error);
        if (status === HTTP_UNAUTHORIZED) {
            try {
                // If a query fails due to authorization, cancel it and remove it from the cache to prevent showing
                // unauthorized data.
                void queryClient.cancelQueries({ queryKey });
                queryClient.setQueryData(queryKey, null);
            } catch (e) {
                console.warn('[QueryCache] failed to remove unauthorized data', e);
            }
        }
    }
});

queryClient = new QueryClient({
    queryCache,
    defaultOptions: {
        mutations: {
            networkMode: 'always' // network connection is not required if running on localhost
        },
        queries: {
            gcTime: MAX_GC_TIME,
            networkMode: 'always', // network connection is not required if running on localhost
            staleTime: MAX_STALENESS,
            retry: (failureCount, error) => {
                const status = getHttpStatus(error);
                // Don't retry if unauthorized
                if (status === HTTP_UNAUTHORIZED) return false;
                return failureCount < MAX_RETRIES;
            }
        }
    }
});

/** Create an IndexedDB persister for react-query-persist-client. Uses idb-keyval for simplicity. */
export const createIDBPersister = (idbValidKey: IDBValidKey = 'query-cache') => {
    let pendingClient: PersistedClient | undefined;
    let scheduledSave: Promise<void> | undefined;

    return {
        persistClient: (client: PersistedClient) => {
            pendingClient = client;
            if (!scheduledSave) {
                scheduledSave = new Promise<void>(resolve => setTimeout(resolve, 1000))
                    .then(async () => {
                        const latestClient = pendingClient;
                        pendingClient = undefined;
                        scheduledSave = undefined;
                        if (latestClient) await set(idbValidKey, latestClient);
                    });
            }
            return scheduledSave;
        },
        restoreClient: () => get<PersistedClient>(idbValidKey),
        removeClient: async () => {
            // A queued save must not recreate a removed cache.
            pendingClient = undefined;
            await del(idbValidKey);
        }
    } satisfies Persister;
};

export const persister = createIDBPersister('jellyfin-query-cache');
