import type { LibraryApiGetResumeItemsRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { getResumeItemsQuery } from 'lib/queries/resumeItems';

export const useResumeItems = (
    params?: LibraryApiGetResumeItemsRequest
) => {
    const { api, user } = useApi();
    return useQuery(getResumeItemsQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
