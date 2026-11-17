import { userQueryKey } from 'utils/query/queryKeys';
import { Api } from '@jellyfin/sdk';
import type { UserApiGetUserByIdRequest } from '@jellyfin/sdk/lib/generated-client/api/user-api';
import { getUserApi } from '@jellyfin/sdk/lib/utils/api/user-api';
import { queryOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

/** UserApiGetUserByIdRequest without required userId */
export type GetUserByIdParams = {
    userId?: string;
};

export const QUERY_KEY = 'User';

const fetchUser = async (
    api: Api,
    params: UserApiGetUserByIdRequest,
    options?: AxiosRequestConfig
) => {
    const response = await getUserApi(api).getUserById(params, options);

    return response.data;
};

export const getUserQuery = (
    api?: Api,
    { userId }: GetUserByIdParams = {}
) => queryOptions({
    queryKey: userQueryKey(api, userId),
    queryFn: ({ signal }) => fetchUser(api!, { userId: userId! }, { signal }),
    enabled: !!api && !!userId
});
