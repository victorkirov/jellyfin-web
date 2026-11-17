import { OutboundWebSocketMessageType } from '@jellyfin/sdk/lib/websocket';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, type FC } from 'react';

import { EventType } from 'constants/eventType';
import { useApi } from 'hooks/useApi';
import Events from 'utils/events';
import { userLibraryQueryKeys } from 'utils/query/queryKeys';

/** Component that handles mapping events to query client actions. */
const QueryClientEventHandler: FC = () => {
    const queryClient = useQueryClient();
    const { api, user } = useApi();

    const clearQueries = useCallback(() => (
        queryClient.clear()
    ), [queryClient]);

    const invalidateItemQueries = useCallback(() => (
        Promise.all(userLibraryQueryKeys(api, user?.Id).map(queryKey => (
            queryClient.invalidateQueries({ queryKey })
        )))
    ), [api, queryClient, user?.Id]);

    useEffect(() => {
        Events.on(document, EventType.LANGUAGE_CHANGE, clearQueries);

        return () => {
            Events.off(document, EventType.LANGUAGE_CHANGE, clearQueries);
        };
    }, [clearQueries]);

    useEffect(() => {
        Events.on(document, EventType.REFRESH_NEEDED, invalidateItemQueries);

        return () => {
            Events.off(document, EventType.REFRESH_NEEDED, invalidateItemQueries);
        };
    }, [invalidateItemQueries]);

    useEffect(() => (
        api?.subscribe([OutboundWebSocketMessageType.UserDataChanged], invalidateItemQueries)
    ), [api, invalidateItemQueries]);

    return null;
};

export default QueryClientEventHandler;
