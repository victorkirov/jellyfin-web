import { serverQueryKey } from 'utils/query/queryKeys';
import { Api } from '@jellyfin/sdk';
import { getBrandingApi } from '@jellyfin/sdk/lib/utils/api/branding-api';
import { queryOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

export const QUERY_KEY = 'BrandingOptions';

const fetchBrandingOptions = async (
    api: Api,
    options?: AxiosRequestConfig
) => {
    return getBrandingApi(api)
        .getBrandingOptions(options)
        .then(({ data }) => data);
};

export const getBrandingOptionsQuery = (
    api?: Api
) => queryOptions({
    queryKey: serverQueryKey(api, QUERY_KEY),
    queryFn: ({ signal }) => fetchBrandingOptions(api!, { signal }),
    enabled: !!api
});
