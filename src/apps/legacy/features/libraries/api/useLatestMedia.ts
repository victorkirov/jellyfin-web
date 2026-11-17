import type { LibraryApiGetLatestMediaRequest } from '@jellyfin/sdk/lib/generated-client/api/library-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { getLatestMediaQuery } from 'lib/queries/latestMedia';

export const useLatestMedia = (
    params?: LibraryApiGetLatestMediaRequest
) => {
    const { api, user } = useApi();
    return useQuery(getLatestMediaQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
