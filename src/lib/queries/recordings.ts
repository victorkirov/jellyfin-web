import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk';
import type { LiveTvApiGetRecordingsRequest } from '@jellyfin/sdk/lib/generated-client/api/live-tv-api';
import { getLiveTvApi } from '@jellyfin/sdk/lib/utils/api/live-tv-api';
import { queryOptions } from '@tanstack/react-query';

export const getRecordingsQuery = (
    api?: Api,
    params?: LiveTvApiGetRecordingsRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'Recordings', params),
    queryFn: async ({ signal }) => {
        const response = await getLiveTvApi(api!).getRecordings(params, { signal });
        return response.data;
    },
    enabled: !!api
});
