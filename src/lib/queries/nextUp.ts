import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import type { ShowApiGetNextUpRequest } from '@jellyfin/sdk/lib/generated-client/api/show-api';
import { getShowApi } from '@jellyfin/sdk/lib/utils/api/show-api';
import { queryOptions } from '@tanstack/react-query';

export const getNextUpQuery = (
    api?: Api,
    params?: ShowApiGetNextUpRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'NextUp', params),
    queryFn: async ({ signal }) => {
        const response = await getShowApi(api!)
            .getNextUp(params, { signal });
        return response.data;
    },
    enabled: !!api
});
