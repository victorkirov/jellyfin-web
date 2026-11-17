import { afterEach, describe, expect, it } from 'vitest';
import { queryClient } from './queryClient';

afterEach(() => queryClient.clear());

describe('shared query HTTP classification', () => {
    it.each([401, 404, 500])('applies retry policy to SDK HTTP %s', status => {
        const retry = queryClient.getDefaultOptions().queries?.retry;
        expect(typeof retry).toBe('function');
        if (typeof retry === 'function') {
            expect(retry(0, { response: { status } } as unknown as Error)).toBe(status !== 401);
            expect(retry(2, { response: { status } } as unknown as Error)).toBe(false);
        }
    });
    it('clears unauthorized cached data after an SDK failure', async () => {
        const queryKey = ['http-status-test'];
        queryClient.setQueryData(queryKey, 'private data');
        const error = Object.assign(new Error('unauthorized'), { response: { status: 401 } });
        await expect(queryClient.fetchQuery({
            queryKey, staleTime: 0, retry: false,
            queryFn: () => Promise.reject(error)
        })).rejects.toBe(error);
        expect(queryClient.getQueryData(queryKey)).toBeNull();
    });
});
