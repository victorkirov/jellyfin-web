import { useQuery } from '@tanstack/react-query';
import { useApi } from 'hooks/useApi';
import { getUserViewsQuery } from 'lib/queries/userViews';
import type { UserViewApiGetUserViewsRequest } from '@jellyfin/sdk/lib/generated-client/api/user-view-api';

export { getUserViewsQuery } from 'lib/queries/userViews';

export const useUserViews = (
    params?: UserViewApiGetUserViewsRequest
) => {
    const { api, user } = useApi();
    return useQuery(getUserViewsQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
