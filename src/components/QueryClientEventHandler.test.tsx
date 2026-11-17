import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Api } from '@jellyfin/sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EventType } from 'constants/eventType';
import { useApi } from 'hooks/useApi';
import Events from 'utils/events';
import { userQueryKey, serverQueryKey } from 'utils/query/queryKeys';
import QueryClientEventHandler from './QueryClientEventHandler';

vi.mock('hooks/useApi', () => ({ useApi: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

describe('library query refresh events', () => {
    it.each(['refresh', 'UserDataChanged', 'LibraryChanged', 'TimerCreated', 'TimerCancelled', 'SeriesTimerCreated', 'SeriesTimerCancelled'])('invalidates only the active user library families for %s', async event => {
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const api = new Api('https://first', { name: 'test', version: '1' }, { name: 'test', id: 'test' });
        const otherApi = new Api('https://second', { name: 'test', version: '1' }, { name: 'test', id: 'test' });
        const subscribe = vi.spyOn(api, 'subscribe').mockReturnValue(vi.fn());
        vi.mocked(useApi).mockReturnValue({ api, user: { Id: 'a' } });
        const client = new QueryClient();
        const allFamilies = ['Items', 'NextUp', 'ResumeItems', 'LatestMedia', 'Recordings', 'RecommendedPrograms'];
        const families = event.includes('Timer') ? ['Recordings', 'RecommendedPrograms'] : allFamilies;
        const intended = families.map(family => userQueryKey(api, 'a', family, 'params'));
        const unrelated = [
            ...allFamilies.filter(family => !families.includes(family)).map(family => userQueryKey(api, 'a', family, 'params')),
            userQueryKey(api, 'b', 'NextUp'), userQueryKey(otherApi, 'a', 'Items'),
            userQueryKey(api, 'a', 'DisplayPreferences'), serverQueryKey(api, 'BrandingOptions')
        ];
        [...intended, ...unrelated].forEach(key => {
            client.setQueryData(key, 'data');
        });
        const root = createRoot(document.createElement('div'));
        try {
            await act(async () => root.render(<QueryClientProvider client={client}><QueryClientEventHandler /></QueryClientProvider>));
            await act(async () => {
                if (event === 'refresh') {
                    Events.trigger(document, EventType.REFRESH_NEEDED);
                } else {
                    const onMessage = subscribe.mock.calls[0][1];
                    expect(subscribe.mock.calls[0][0]).toContain(event);
                    onMessage({ MessageType: event, Data: {} } as never);
                }
            });
            intended.forEach(key => {
                expect(client.getQueryState(key)?.isInvalidated).toBe(true);
            });
            unrelated.forEach(key => {
                expect(client.getQueryState(key)?.isInvalidated).toBe(false);
            });
        } finally {
            act(() => root.unmount());
            client.clear();
        }
    });
});
