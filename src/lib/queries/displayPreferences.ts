import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import { DisplayPreferenceApiGetDisplayPreferencesRequest } from '@jellyfin/sdk/lib/generated-client/api/display-preference-api';
import { getDisplayPreferenceApi } from '@jellyfin/sdk/lib/utils/api/display-preference-api';
import { queryOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

const fetchDisplayPreferences = async (
    api: Api,
    params: DisplayPreferenceApiGetDisplayPreferencesRequest,
    options?: AxiosRequestConfig
) => {
    const response = await getDisplayPreferenceApi(api)
        .getDisplayPreferences(params, options);
    return response.data;
};

export const getDisplayPreferencesQuery = (
    api?: Api,
    params?: DisplayPreferenceApiGetDisplayPreferencesRequest
) => queryOptions({
    queryKey: userQueryKey(api, params?.userId, 'DisplayPreferences', params?.displayPreferencesId, params?.client),
    queryFn: ({ signal }) => fetchDisplayPreferences(api!, params!, { signal }),
    enabled: !!api && !!params
});
