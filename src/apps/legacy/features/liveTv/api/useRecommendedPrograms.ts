import type { LiveTvApiGetRecommendedProgramsRequest } from '@jellyfin/sdk/lib/generated-client/api/live-tv-api';
import { useQuery } from '@tanstack/react-query';

import { useApi } from 'hooks/useApi';
import { getRecommendedProgramsQuery } from 'lib/queries/recommendedPrograms';

export const useRecommendedPrograms = (
    params?: LiveTvApiGetRecommendedProgramsRequest
) => {
    const { api, user } = useApi();
    return useQuery(getRecommendedProgramsQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
