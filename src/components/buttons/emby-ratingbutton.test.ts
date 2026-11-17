import { Api } from '@jellyfin/sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from 'utils/query/queryClient';
import { userQueryKey } from 'utils/query/queryKeys';

const mocks = vi.hoisted(() => ({
    getApi: vi.fn(), getApiClient: vi.fn(), register: vi.fn()
}));
vi.mock('../../lib/globalize/index', () => ({ default: { translate: (key: string) => key } }));
vi.mock('./emby-button', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient/index', () => ({ ServerConnections: mocks }));
vi.mock('scripts/serverNotifications', () => ({ default: {} }));

beforeEach(() => queryClient.clear());

describe('favorite query refresh', () => {
    it('invalidates the same scoped library families after a favorite change', async () => {
        Object.assign(document, { registerElement: mocks.register });
        await import('./emby-ratingbutton');
        const prototype = mocks.register.mock.calls[0][1].prototype;
        const api = new Api('https://first', { name: 'test', version: '1' }, { name: 'test', id: 'test' });
        mocks.getApi.mockReturnValue(api);
        mocks.getApiClient.mockReturnValue({
            getCurrentUserId: () => 'user',
            subscribe: vi.fn(),
            updateFavoriteStatus: vi.fn().mockResolvedValue({ IsFavorite: true })
        });
        const keys = ['Items', 'NextUp', 'ResumeItems', 'LatestMedia'].map(family => userQueryKey(api, 'user', family));
        keys.forEach(key => {
            queryClient.setQueryData(key, 'data');
        });
        const other = userQueryKey(api, 'other', 'Items');
        queryClient.setQueryData(other, 'data');
        const button = document.createElement('button');
        button.dataset.id = 'item';
        button.dataset.serverid = 'server';
        prototype.attachedCallback.call(button);
        button.click();
        await Promise.resolve();
        keys.forEach(key => {
            expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
        });
        expect(queryClient.getQueryState(other)?.isInvalidated).toBe(false);
        prototype.detachedCallback.call(button);
    });
});
