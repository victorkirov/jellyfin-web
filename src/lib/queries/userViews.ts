import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import type { UserViewApiGetUserViewsRequest } from '@jellyfin/sdk/lib/generated-client/api/user-view-api';
import { getUserViewApi } from '@jellyfin/sdk/lib/utils/api/user-view-api';
import { queryOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

const fetchUserViews = async (
    api: Api,
    params?: UserViewApiGetUserViewsRequest,
    options?: AxiosRequestConfig
) => {
    const response = await getUserViewApi(api)
        .getUserViews(params, options);
    return response.data;
};

export const getUserViewsQuery = (
    api?: Api,
    params?: UserViewApiGetUserViewsRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'Views', params),
    queryFn: ({ signal }) => fetchUserViews(api!, params, { signal }),
    enabled: !!api
});
