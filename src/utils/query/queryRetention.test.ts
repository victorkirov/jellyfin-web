import { Api } from '@jellyfin/sdk';
import { dehydrate } from '@tanstack/react-query';
import { persistQueryClientRestore, type PersistedClient } from '@tanstack/react-query-persist-client';
import { get, set } from 'idb-keyval';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIDBPersister, queryClient } from './queryClient';
import { userQueryKey } from './queryKeys';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));
const api = new Api('https://example.invalid', { name: 'test', version: '1' }, { name: 'test', id: 'test' });
const key = (family: string, detail: string | number) => userQueryKey(api, 'a', family, detail);
const snapshot = (): PersistedClient => ({ timestamp: Date.now(), buster: 'test', clientState: dehydrate(queryClient) });

afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
    vi.clearAllMocks();
});

describe('TV query retention and startup persistence', () => {
    it('evicts inactive search results while keeping startup library rows reusable', async () => {
        vi.useFakeTimers();
        await queryClient.fetchQuery({ queryKey: key('Search', 'term'), queryFn: () => 'search' });
        await queryClient.fetchQuery({ queryKey: key('LatestMedia', 'movies'), queryFn: () => 'library' });
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1);
        expect(queryClient.getQueryData(key('Search', 'term'))).toBeUndefined();
        expect(queryClient.getQueryData(key('LatestMedia', 'movies'))).toBe('library');
    });

    it('applies the library lifetime before starting GC for restored or seeded rows', async () => {
        vi.useFakeTimers();
        queryClient.setQueryData(key('LatestMedia', 'seeded'), 'library');
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000 + 1);
        expect(queryClient.getQueryData(key('LatestMedia', 'seeded'))).toBe('library');
        await vi.advanceTimersByTimeAsync(8 * 60 * 1000);
        expect(queryClient.getQueryData(key('LatestMedia', 'seeded'))).toBeUndefined();
    });

    it('bounds count and snapshot size and excludes ephemeral and oversized results on save and restore', async () => {
        vi.useFakeTimers();
        for (let index = 0; index < 100; index++) {
            queryClient.setQueryData(key('Search', index), 'search');
            queryClient.setQueryData(key('LatestMedia', index), 'library');
        }
        queryClient.setQueryData(key('Items', 'oversized'), 'x'.repeat(1024 * 1024));
        const saved = snapshot();
        const persister = createIDBPersister();
        const write = persister.persistClient(saved);
        await vi.advanceTimersByTimeAsync(1000);
        await write;
        const persisted = vi.mocked(set).mock.calls[0][1] as PersistedClient;
        expect(persisted.clientState.queries.length).toBeLessThanOrEqual(32);
        expect(JSON.stringify(persisted).length).toBeLessThanOrEqual(512 * 1024);
        expect(persisted.clientState.queries.every(query => query.queryKey[4] === 'LatestMedia')).toBe(true);

        // Restore must also prune old unbounded snapshots from earlier versions.
        vi.mocked(get).mockResolvedValue(saved);
        queryClient.clear();
        await persistQueryClientRestore({ queryClient, persister, buster: 'test' });
        const restored = queryClient.getQueryCache().getAll();
        expect(restored.length).toBeGreaterThan(0);
        expect(restored.length).toBeLessThanOrEqual(32);
        expect(restored.every(query => query.queryKey[4] === 'LatestMedia')).toBe(true);
    });
});
