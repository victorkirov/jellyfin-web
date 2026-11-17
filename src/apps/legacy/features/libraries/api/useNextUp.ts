import type { ShowApiGetNextUpRequest } from '@jellyfin/sdk/lib/generated-client/api/show-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { getNextUpQuery } from 'lib/queries/nextUp';

export const useNextUp = (
    params?: ShowApiGetNextUpRequest
) => {
    const { api, user } = useApi();
    return useQuery(getNextUpQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
