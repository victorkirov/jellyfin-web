import type { Api } from '@jellyfin/sdk';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import type { ApiClient, Event } from 'jellyfin-apiclient';
import React, { type FC, type PropsWithChildren, createContext, useContext, useEffect, useMemo, useState } from 'react';

import { ServerConnections } from 'lib/jellyfin-apiclient';
import events from 'utils/events';

export interface JellyfinApiContext {
    __legacyApiClient__?: ApiClient
    api?: Api
    user?: UserDto
}

export const ApiContext = createContext<JellyfinApiContext>({});
export const useApi = () => useContext(ApiContext);

export const ApiProvider: FC<PropsWithChildren<unknown>> = ({ children }) => {
    const [ legacyApiClient, setLegacyApiClient ] = useState<ApiClient>();
    const [ user, setUser ] = useState<UserDto>();

    const context = useMemo(() => ({
        __legacyApiClient__: legacyApiClient,
        api: legacyApiClient ? ServerConnections.getApi(legacyApiClient.serverId()) : undefined,
        user
    }), [ legacyApiClient, user ]);

    useEffect(() => {
        let initialRequestCurrent = true;
        const initialClient = ServerConnections.currentApiClient();

        const updateApiUser = (_e: Event | undefined, newUser: UserDto) => {
            initialRequestCurrent = false;
            setUser(newUser);
            setLegacyApiClient(newUser.ServerId ? ServerConnections.getApiClient(newUser.ServerId) : undefined);
        };

        const resetApiUser = () => {
            initialRequestCurrent = false;
            setLegacyApiClient(undefined);
            setUser(undefined);
        };

        events.on(ServerConnections, 'localusersignedin', updateApiUser);
        events.on(ServerConnections, 'localusersignedout', resetApiUser);

        initialClient?.getCurrentUser()
            .then(newUser => {
                if (initialRequestCurrent && ServerConnections.currentApiClient() === initialClient) {
                    updateApiUser(undefined, newUser);
                }
            })
            .catch(err => {
                console.info('[ApiProvider] Could not get current user', err);
            });

        return () => {
            initialRequestCurrent = false;
            events.off(ServerConnections, 'localusersignedin', updateApiUser);
            events.off(ServerConnections, 'localusersignedout', resetApiUser);
        };
    }, [ setLegacyApiClient, setUser ]);

    return (
        <ApiContext.Provider value={context}>
            {children}
        </ApiContext.Provider>
    );
};
