import { useQuery } from '@tanstack/react-query';
import { useApi } from 'hooks/useApi';
import { getDisplayPreferencesQuery } from 'lib/queries/displayPreferences';
import { DisplayPreferenceApiGetDisplayPreferencesRequest } from '@jellyfin/sdk/lib/generated-client/api/display-preference-api';

export { getDisplayPreferencesQuery } from 'lib/queries/displayPreferences';

export const useDisplayPreferences = (
    params: DisplayPreferenceApiGetDisplayPreferencesRequest
) => {
    const { api, user } = useApi();
    return useQuery(getDisplayPreferencesQuery(api, {
        ...params,
        userId: params?.userId || user?.Id
    }));
};
