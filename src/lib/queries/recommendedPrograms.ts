import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import type { LiveTvApiGetRecommendedProgramsRequest } from '@jellyfin/sdk/lib/generated-client/api/live-tv-api';
import { getLiveTvApi } from '@jellyfin/sdk/lib/utils/api/live-tv-api';
import { queryOptions } from '@tanstack/react-query';

export const getRecommendedProgramsQuery = (
    api?: Api,
    params?: LiveTvApiGetRecommendedProgramsRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'RecommendedPrograms', params),
    queryFn: async ({ signal }) => {
        const response = await getLiveTvApi(api!)
            .getRecommendedPrograms(params, { signal });
        return response.data;
    },
    enabled: !!api
});
