import React, { FunctionComponent, useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { ApiClient } from 'jellyfin-apiclient';

import { ConnectionState, ServerConnections } from 'lib/jellyfin-apiclient';
import type { ConnectResult } from 'lib/jellyfin-apiclient/connectionTypes';

import ConnectionErrorPage from './ConnectionErrorPage';
import Loading from './loading/LoadingComponent';

enum AccessLevel {
    /** No access restrictions */
    Public = 'public',
    /** Requires a valid user session */
    User = 'user'
};

type AccessLevelValue = `${AccessLevel}`;

enum BounceRoutes {
    Home = '/home',
    Login = '/login',
    SelectServer = '/selectserver'
}

type ConnectionRequiredProps = {
    level?: AccessLevelValue
};

const ERROR_STATES = [
    ConnectionState.ServerMismatch,
    ConnectionState.ServerUpdateNeeded,
    ConnectionState.Unavailable
];

const fetchPublicSystemInfo = async (apiClient: ApiClient) => {
    const infoResponse = await fetch(
        `${apiClient.serverAddress()}/System/Info/Public`,
        { cache: 'no-cache' }
    );

    if (!infoResponse.ok) {
        throw new Error('Public system info request failed');
    }

    return infoResponse.json();
};

/**
 * A component that ensures a server connection has been established.
 * Additional parameters exist to verify a user has authenticated.
 * If a condition fails, this component will navigate to the appropriate page.
 */
const ConnectionRequired: FunctionComponent<ConnectionRequiredProps> = ({
    level = 'user'
}) => {
    const navigate = useNavigate();
    const location = useLocation();

    const [ errorState, setErrorState ] = useState<ConnectionState | 'SetupRequired'>();
    const [ isLoading, setIsLoading ] = useState(true);

    const navigateIfNotThere = useCallback((route: BounceRoutes) => {
        // If we try to navigate to the current route, just set isLoading = false
        if (location.pathname === route) setIsLoading(false);
        // Otherwise navigate to the route
        else navigate(route);
    }, [ location.pathname, navigate ]);

    const bounce = useCallback(async (connectionResponse: ConnectResult) => {
        switch (connectionResponse.State) {
            case ConnectionState.Superseded:
                return;
            case ConnectionState.SignedIn:
                // Already logged in, bounce to the home page
                console.debug('[ConnectionRequired] already logged in, redirecting to home');
                navigate(BounceRoutes.Home);
                return;
            case ConnectionState.ServerSignIn:
                // Bounce to the login page
                if (location.pathname === BounceRoutes.Login) {
                    setIsLoading(false);
                } else {
                    console.debug('[ConnectionRequired] not logged in, redirecting to login page', location);
                    const url = encodeURIComponent(location.pathname + location.search);
                    navigate(`${BounceRoutes.Login}?serverid=${connectionResponse.ApiClient.serverId()}&url=${url}`);
                }
                return;
            case ConnectionState.ServerSelection:
                // Bounce to select server page
                console.debug('[ConnectionRequired] redirecting to select server page');
                navigateIfNotThere(BounceRoutes.SelectServer);
                return;
        }

        console.warn('[ConnectionRequired] unhandled connection state', connectionResponse.State);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ navigateIfNotThere, location.pathname, navigate ]);

    const handleServerSignIn = useCallback(async (firstConnection: ConnectResult) => {
        if (firstConnection.State === ConnectionState.ServerSignIn) {
            // Verify server setup is complete
            try {
                const systemInfo = await fetchPublicSystemInfo(firstConnection.ApiClient);
                if (!systemInfo?.StartupWizardCompleted) {
                    // Update the current ApiClient
                    // TODO: Is there a better place to handle this?
                    ServerConnections.setLocalApiClient(firstConnection.ApiClient);
                    setErrorState('SetupRequired');
                    return;
                }
            } catch (ex) {
                console.error('[ConnectionRequired] checking server setup failed', ex);
                setErrorState(ConnectionState.Unavailable);
                return;
            }
        }

        // Bounce to the correct page in the login flow
        bounce(firstConnection)
            .catch(err => {
                console.error('[ConnectionRequired] failed to bounce', err);
            });
    }, [bounce]);

    const validateUserAccess = useCallback(async () => {
        const client = ServerConnections.currentApiClient();

        // If this is a user route, ensure a user is logged in
        if (level === AccessLevel.User && !client?.isLoggedIn()) {
            try {
                console.warn('[ConnectionRequired] unauthenticated user attempted to access user route');
                bounce(await ServerConnections.connect())
                    .catch(err => {
                        console.error('[ConnectionRequired] failed to bounce', err);
                    });
            } catch (ex) {
                console.warn('[ConnectionRequired] error bouncing from user route', ex);
            }
            return;
        }

        setIsLoading(false);
    }, [bounce, level]);

    useEffect(() => {
        let active = true;
        setErrorState(undefined);

        // Check connection status on initial page load
        const apiClient = ServerConnections.currentApiClient();
        const shouldConnect = !ServerConnections.firstConnection
            || (location.pathname === BounceRoutes.Login && !apiClient?.isLoggedIn());
        if (shouldConnect) setIsLoading(true);
        const connection = Promise.resolve(shouldConnect ? ServerConnections.connect() : null);
        connection.then(firstConnection => {
            if (!active || firstConnection?.State === ConnectionState.Superseded) return;
            console.debug('[ConnectionRequired] connection state', firstConnection?.State);
            ServerConnections.firstConnection = true;

            if (firstConnection && ERROR_STATES.includes(firstConnection.State)) {
                setErrorState(firstConnection.State);
            } else if (
                firstConnection && firstConnection.State !== ConnectionState.SignedIn && !apiClient?.isLoggedIn()
            ) {
                handleServerSignIn(firstConnection)
                    .catch(err => {
                        console.error('[ConnectionRequired] could not check server setup', err);
                    });
            } else {
                validateUserAccess()
                    .catch(err => {
                        console.error('[ConnectionRequired] could not validate user access', err);
                    });
            }
        }).catch(err => {
            if (!active) return;
            console.error('[ConnectionRequired] failed to connect', err);
            setErrorState(ConnectionState.Unavailable);
        });
        return () => {
            active = false;
        };
    }, [handleServerSignIn, level, location.pathname, validateUserAccess]);

    if (errorState) {
        return <ConnectionErrorPage state={errorState} />;
    }

    if (isLoading) {
        return <Loading />;
    }

    return <Outlet />;
};

export default ConnectionRequired;
