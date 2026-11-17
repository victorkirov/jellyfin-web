import { userQueryKey } from 'utils/query/queryKeys';
import type { Api } from '@jellyfin/sdk/lib/api';
import { getLibraryApi } from '@jellyfin/sdk/lib/utils/api/library-api';
import { queryOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';

import type { ItemDto } from 'types/base/models/item-dto';

const fetchItem = async (
    api: Api,
    itemId: string,
    userId: string,
    options?: AxiosRequestConfig
) => {
    const response = await getLibraryApi(api)
        .getItem({ userId, itemId }, options);
    return response.data as ItemDto;
};

export const getItemQuery = (
    api: Api | undefined,
    itemId?: string,
    userId?: string
) => queryOptions({
    queryKey: userQueryKey(api, userId, 'Items', itemId),
    queryFn: ({ signal }) => fetchItem(api!, itemId!, userId!, { signal }),
    enabled: !!api && !!userId && !!itemId
});
