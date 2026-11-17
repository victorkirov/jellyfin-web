import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import type { LibraryApiGetResumeItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { queryOptions } from '@tanstack/react-query';

export const getResumeItemsQuery = (
    api?: Api,
    params?: LibraryApiGetResumeItemsRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'ResumeItems', params),
    queryFn: async ({ signal }) => {
        const response = await getLibraryApi(api!)
            .getResumeItems(params, { signal });
        return response.data;
    },
    enabled: !!api
});
