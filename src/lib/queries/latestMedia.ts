import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import type { LibraryApiGetLatestMediaRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { queryOptions } from '@tanstack/react-query';

export const getLatestMediaQuery = (
    api?: Api,
    params?: LibraryApiGetLatestMediaRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'LatestMedia', params),
    queryFn: async ({ signal }) => {
        const response = await getLibraryApi(api!)
            .getLatestMedia(params, { signal });
        return response.data;
    },
    enabled: !!api
});
