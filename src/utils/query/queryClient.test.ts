import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { persistQueryClientRestore, type PersistedClient } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { createIDBPersister } from './queryClient';
import { QueryClient } from '@tanstack/react-query';
import { QUERY_CACHE_VERSION } from './queryKeys';

vi.mock('idb-keyval', () => ({ get: vi.fn(), set: vi.fn(), del: vi.fn() }));

const client = (timestamp: number): PersistedClient => ({
    timestamp,
    buster: '',
    clientState: { mutations: [], queries: [] }
});

describe('IndexedDB query persistence', () => {
    it('discards persisted keys from before server and user scoping', async () => {
        const oldClient = client(Date.now());
        oldClient.buster = 'build';
        vi.mocked(get).mockResolvedValue(oldClient);
        await persistQueryClientRestore({
            queryClient: new QueryClient(),
            persister: createIDBPersister(),
            buster: `build-${QUERY_CACHE_VERSION}`
        });
        expect(del).toHaveBeenCalledWith('query-cache');
    });

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => vi.useRealTimers());

    it('writes only the latest client in a burst and saves the final update', async () => {
        const persister = createIDBPersister();
        const saves = [persister.persistClient(client(1))];
        await vi.advanceTimersByTimeAsync(500);
        saves.push(persister.persistClient(client(2)));
        await vi.advanceTimersByTimeAsync(499);
        expect(set).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await Promise.all(saves);
        expect(set).toHaveBeenCalledExactlyOnceWith('query-cache', client(2));

        const finalSave = persister.persistClient(client(3));
        await vi.advanceTimersByTimeAsync(1000);
        await finalSave;
        expect(set).toHaveBeenCalledTimes(2);
        expect(set).toHaveBeenLastCalledWith('query-cache', client(3));
    });

    it('does not restore a pending client after removal', async () => {
        const persister = createIDBPersister();
        const save = persister.persistClient(client(1));
        await persister.removeClient();
        await vi.advanceTimersByTimeAsync(1000);
        await save;
        expect(del).toHaveBeenCalledExactlyOnceWith('query-cache');
        expect(set).not.toHaveBeenCalled();
    });
});
