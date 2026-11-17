import type { LiveTvApiGetRecordingsRequest } from '@jellyfin/sdk/lib/generated-client/api/live-tv-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { getRecordingsQuery } from 'lib/queries/recordings';

export const useRecordings = (
    params?: LiveTvApiGetRecordingsRequest
) => {
    const { api, user } = useApi();
    return useQuery(getRecordingsQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
