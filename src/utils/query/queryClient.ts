import { QueryCache, QueryClient, type Query, type QueryKey, type DefaultError, type QueryOptions, type QueryState, type WithRequired } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { get, set, del } from 'idb-keyval';

import { getHttpStatus } from 'utils/httpStatus';

// TODO: Move this file to lib/query

/** HTTP status code for unauthorized requests. */
const HTTP_UNAUTHORIZED = 401;
const STARTUP_GC_TIME = 10 * 60 * 1000;
const EPHEMERAL_GC_TIME = 2 * 60 * 1000;
const MAX_PERSISTED_QUERIES = 32;
const MAX_PERSISTED_CHARACTERS = 512 * 1024;
const STARTUP_FAMILIES = ['Items', 'NextUp', 'ResumeItems', 'LatestMedia', 'Recordings', 'RecommendedPrograms', 'Views', 'DisplayPreferences'];

const isStartupQuery = (key: QueryKey) => {
    const family = key[2] === 'User' ? key[4] : key[2];
    return key[0] === 'Server'
        && (STARTUP_FAMILIES.includes(family as string) || family === 'BrandingOptions');
};

export const shouldPersistQuery = (query: Pick<Query, 'queryKey' | 'state'>) =>
    query.state.status === 'success' && isStartupQuery(query.queryKey);

function boundPersistedClient(client: PersistedClient): PersistedClient {
    const queries = client.clientState.queries.filter(shouldPersistQuery)
        .sort((first, second) => second.state.dataUpdatedAt - first.state.dataUpdatedAt);
    const bounded: PersistedClient = {
        ...client,
        clientState: { mutations: [], queries: [] }
    };
    let characters = JSON.stringify(bounded).length;
    for (const query of queries) {
        if (bounded.clientState.queries.length === MAX_PERSISTED_QUERIES) break;
        const size = JSON.stringify(query).length + 1;
        if (characters + size > MAX_PERSISTED_CHARACTERS) continue;
        bounded.clientState.queries.push(query);
        characters += size;
    }
    return bounded;
}
/** Maximum stale time. Set to 1 minute for query reuse. */
const MAX_STALENESS = 60 * 1000;
/** Maximum number of retries for failed queries. */
const MAX_RETRIES = 2;

// NOTE: queryClient needs to be defined before the QueryCache so that it can be used in the onError callback.
// eslint-disable-next-line prefer-const
export let queryClient: QueryClient;

// Select retention before Query starts its GC timer, including hydration and legacy setQueryData.
class TVQueryCache extends QueryCache {
    build<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(
        client: QueryClient,
        options: WithRequired<QueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'queryKey'>,
        state?: QueryState<TData, TError>
    ) {
        return super.build(client, {
            ...options,
            gcTime: isStartupQuery(options.queryKey) ? STARTUP_GC_TIME : EPHEMERAL_GC_TIME
        }, state);
    }
}

/** Query cache for handling query errors and side effects. */
const queryCache = new TVQueryCache({
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
            gcTime: EPHEMERAL_GC_TIME,
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
                        if (latestClient) await set(idbValidKey, boundPersistedClient(latestClient));
                    });
            }
            return scheduledSave;
        },
        restoreClient: async () => {
            const client = await get<PersistedClient>(idbValidKey);
            return client ? boundPersistedClient(client) : undefined;
        },
        removeClient: async () => {
            // A queued save must not recreate a removed cache.
            pendingClient = undefined;
            await del(idbValidKey);
        }
    } satisfies Persister;
};

export const persister = createIDBPersister('jellyfin-query-cache');
