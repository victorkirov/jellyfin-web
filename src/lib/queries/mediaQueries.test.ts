import { Api } from '@jellyfin/sdk';
import { useQuery } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import { useApi } from 'hooks/useApi';
import { useLatestMedia } from 'apps/legacy/features/libraries/api/useLatestMedia';
import { useNextUp } from 'apps/legacy/features/libraries/api/useNextUp';
import { useResumeItems } from 'apps/legacy/features/libraries/api/useResumeItems';
import { useRecommendedPrograms } from 'apps/legacy/features/liveTv/api/useRecommendedPrograms';
import { useRecordings } from 'apps/legacy/features/liveTv/api/useRecordings';
import { getLatestMediaQuery } from './latestMedia';
import { getNextUpQuery } from './nextUp';
import { getResumeItemsQuery } from './resumeItems';
import { getRecommendedProgramsQuery } from './recommendedPrograms';
import { getRecordingsQuery } from './recordings';

const request = vi.hoisted(() => vi.fn());
vi.mock('@jellyfin/sdk/lib/utils/api/library-api', () => ({ getLibraryApi: () => ({ getLatestMedia: request, getResumeItems: request }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/show-api', () => ({ getShowApi: () => ({ getNextUp: request }) }));
vi.mock('@jellyfin/sdk/lib/utils/api/live-tv-api', () => ({ getLiveTvApi: () => ({ getRecommendedPrograms: request, getRecordings: request }) }));
vi.mock('hooks/useApi', () => ({ useApi: vi.fn() }));
vi.mock('@tanstack/react-query', async importOriginal => ({
    ...await importOriginal<typeof import('@tanstack/react-query')>(),
    useQuery: vi.fn()
}));

const api = new Api('https://test.invalid', { name: 'test', version: '1' }, { name: 'test', id: 'tv' });
const queries = [
    [getLatestMediaQuery, useLatestMedia],
    [getNextUpQuery, useNextUp],
    [getResumeItemsQuery, useResumeItems],
    [getRecommendedProgramsQuery, useRecommendedPrograms],
    [getRecordingsQuery, useRecordings]
] as const;

describe('shared media query factories', () => {
    it.each(queries)('preserves SDK parameters, cancellation and response data for %s', async factory => {
        const params = { userId: 'viewer', limit: 12 };
        const signal = { aborted: false } as AbortSignal;
        const data = { Items: [{ Id: 'item' }] };
        request.mockResolvedValue({ data });
        const options = factory(api, params);
        const queryFn = options.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;
        expect(await queryFn({ signal: signal })).toBe(data);
        expect(request).toHaveBeenLastCalledWith(params, { signal: signal });
        expect(factory().enabled).toBe(false);
    });

    it.each(queries)('keeps the hook and non-React callers on the same query identity for %s', (factory, hook) => {
        vi.mocked(useApi).mockReturnValue({ api, user: { Id: 'viewer' } });
        hook({ limit: 12 });
        expect(vi.mocked(useQuery).mock.lastCall?.[0]?.queryKey)
            .toEqual(factory(api, { userId: 'viewer', limit: 12 }).queryKey);
        hook({ userId: 'explicit', limit: 12 });
        expect(vi.mocked(useQuery).mock.lastCall?.[0]?.queryKey)
            .toEqual(factory(api, { userId: 'explicit', limit: 12 }).queryKey);
    });
});
