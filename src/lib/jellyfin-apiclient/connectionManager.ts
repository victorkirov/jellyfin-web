import type { BaseItemDto, UserDto, PublicSystemInfo, SystemInfo, AuthenticationResult, ClientCapabilitiesDto } from '@jellyfin/sdk/lib/generated-client';
import type { Api } from '@jellyfin/sdk';
import type { ConnectionClient, ServerInfo, CredentialStore, ConnectOptions, ConnectResult, SocketMessage } from './connectionTypes';
import { normalizeAddress, sortByAccess, updateServerInfo, findServers } from './serverDiscovery';
import { tryReconnect } from './serverReconnect';
import { AUTHORIZATION_HEADER } from '@jellyfin/sdk/lib/constants';
import { getAuthorizationHeader } from '@jellyfin/sdk/lib/utils';
import { MINIMUM_VERSION } from '@jellyfin/sdk/lib/versions';
import { getSessionApi } from '@jellyfin/sdk/lib/utils/api/session-api';
import { compareVersions } from '@jellyfin/sdk/lib/utils/versioning';

import events from 'utils/events';
import { ajax } from 'utils/fetch';
import { toApi, updateApiClientSdk } from 'utils/jellyfin-apiclient/compat';
import { createApiClient } from 'utils/jellyfin-apiclient/createApiClient';
import { equalsIgnoreCase } from 'utils/string';

import { ConnectionMode } from './connectionMode';
import { ConnectionState } from './connectionState';
import getServerAddress from './utils/getServerAddress';

export default class ConnectionManager {
    _apiClients: ConnectionClient[];
    _minServerVersion: string;
    appVersion: () => string;
    appName: () => string;
    capabilities: () => ClientCapabilitiesDto;
    deviceName: () => string;
    deviceId: () => string;
    credentialProvider: () => CredentialStore;
    getServerInfo: (id: string) => ServerInfo | undefined;
    getLastUsedServer: () => ServerInfo | null;
    addApiClient: (apiClient: ConnectionClient) => void;
    clearData: () => void;
    _getOrAddApiClient: (server: ServerInfo, serverUrl: string | undefined) => ConnectionClient;
    getOrCreateApiClient: (serverId: string) => ConnectionClient;
    user: (apiClient: ConnectionClient) => Promise<{ localUser: UserDto | undefined; name: string | null | undefined; imageUrl: string | null; supportsImageParams: boolean }>;
    logout: () => Promise<void>;
    getSavedServers: () => ServerInfo[];
    getAvailableServers: () => Promise<ServerInfo[]>;
    connectToServers: (servers: ServerInfo[], options?: ConnectOptions) => Promise<ConnectResult>;
    connectToServer: (server: ServerInfo, options?: ConnectOptions) => Promise<ConnectResult>;
    updateSavedServerId: (server: ServerInfo) => Promise<void>;
    connectToAddress: (address: string, options?: ConnectOptions) => Promise<ConnectResult>;
    deleteServer: (serverId: string) => Promise<void>;
    onLocalUserSignedIn?: (user: UserDto) => Promise<unknown>;
    constructor(credentialProvider: CredentialStore, appName: string | (() => string), appVersion: string | (() => string), deviceName: string | (() => string), deviceId: string | (() => string), capabilities: ClientCapabilitiesDto) {
        console.log('Begin ConnectionManager constructor');

        this._apiClients = [];

        // Set the minimum version to match the SDK
        this._minServerVersion = MINIMUM_VERSION;

        this.appVersion = () => typeof appVersion === 'function' ? appVersion() : appVersion;

        this.appName = () => typeof appName === 'function' ? appName() : appName;

        this.capabilities = () => capabilities;

        this.deviceName = () => typeof deviceName === 'function' ? deviceName() : deviceName;

        this.deviceId = () => typeof deviceId === 'function' ? deviceId() : deviceId;

        this.credentialProvider = () => credentialProvider;

        this.getServerInfo = (id: string) => {
            const servers = credentialProvider.credentials().Servers;

            return servers.filter((s) => s.Id === id)[0];
        };

        this.getLastUsedServer = () => {
            const servers = credentialProvider.credentials().Servers;

            servers.sort(sortByAccess);

            if (!servers.length) {
                return null;
            }

            return servers[0];
        };

        this.addApiClient = (apiClient: ConnectionClient) => {
            this._apiClients.push(apiClient);
            apiClient._sdk ??= toApi(apiClient);

            const existingServers = credentialProvider
                .credentials()
                .Servers.filter(
                    (s) =>
                        equalsIgnoreCase(s.ManualAddress, apiClient.serverAddress())
                        || equalsIgnoreCase(s.LocalAddress, apiClient.serverAddress())
                        || equalsIgnoreCase(s.RemoteAddress, apiClient.serverAddress())
                );

            const existingServer = existingServers.length ? existingServers[0] : apiClient.serverInfo();
            existingServer.DateLastAccessed = new Date().getTime();
            existingServer.LastConnectionMode = ConnectionMode.Manual;
            existingServer.ManualAddress = apiClient.serverAddress();

            if (apiClient.manualAddressOnly) {
                existingServer.manualAddressOnly = true;
            }

            apiClient.serverInfo(existingServer);

            apiClient.onAuthenticated = (instance, result) => onAuthenticated(instance, result, {}, true);

            if (!existingServers.length) {
                const credentials = credentialProvider.credentials();
                credentials.Servers = [existingServer];
                credentialProvider.credentials(credentials);
            }

            events.trigger(this, 'apiclientcreated', [apiClient]);
        };

        this.clearData = () => {
            console.log('connection manager clearing data');

            const credentials = credentialProvider.credentials();
            credentials.Servers = [];
            credentialProvider.credentials(credentials);
        };

        this._getOrAddApiClient = (server: ServerInfo, serverUrl: string | undefined) => {
            let apiClient = this.getApiClient(server.Id);

            if (!apiClient) {
                apiClient = createApiClient(serverUrl as string, this.appName(), this.appVersion(), this.deviceName(), this.deviceId()) as ConnectionClient;
                this._apiClients.push(apiClient);
                apiClient.serverInfo(server);
                apiClient.onAuthenticated = (instance, result) => {
                    return onAuthenticated(instance, result, {}, true);
                };
                events.trigger(this, 'apiclientcreated', [apiClient]);
            }
            apiClient._sdk ??= toApi(apiClient);

            console.log('returning instance from getOrAddApiClient');
            return apiClient;
        };

        this.getOrCreateApiClient = (serverId: string) => {
            const credentials = credentialProvider.credentials();
            const servers = credentials.Servers.filter((s) => equalsIgnoreCase(s.Id as string | undefined, serverId));

            if (!servers.length) {
                throw new Error(`Server not found: ${serverId}`);
            }

            const server = servers[0];

            return this._getOrAddApiClient(server, getServerAddress(server));
        };

        const onAuthenticated = (apiClient: ConnectionClient, result: AuthenticationResult, options: ConnectOptions, saveCredentials: boolean) => {
            const credentials = credentialProvider.credentials();
            const servers = credentials.Servers.filter((s) => s.Id === result.ServerId);

            const server = servers.length ? servers[0] : apiClient.serverInfo();

            if (options.updateDateLastAccessed !== false) {
                server.DateLastAccessed = new Date().getTime();
            }
            server.Id = result.ServerId;

            if (saveCredentials) {
                server.UserId = result.User!.Id;
                server.AccessToken = result.AccessToken;
            } else {
                server.UserId = null;
                server.AccessToken = null;
            }

            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            credentialProvider.credentials(credentials);

            // Disable the legacy apiclient's bitrate detection as this feature is now upstreamed.
            apiClient.enableAutomaticBitrateDetection = false;

            apiClient.serverInfo(server);
            apiClient.setAuthenticationInfo(result.AccessToken, result.User!.Id);

            // Update SDK Api instance
            updateApiClientSdk(apiClient);

            afterConnected(apiClient, options);

            return onLocalUserSignIn(server, apiClient.serverAddress(), result.User!);
        };

        const afterConnected = (apiClient: ConnectionClient, options: ConnectOptions = {}) => {
            if (options.reportCapabilities !== false) {
                void apiClient.reportCapabilities(capabilities);
            }
            apiClient.enableAutomaticBitrateDetection = false;
        };

        const onLocalUserSignIn = (server: ServerInfo, serverUrl: string, user: UserDto) => {
            // Ensure this is created so that listeners of the event can get the apiClient instance
            this._getOrAddApiClient(server, serverUrl);

            // This allows the app to have a single hook that fires before any other
            const promise = this.onLocalUserSignedIn ? this.onLocalUserSignedIn.call(this, user) : Promise.resolve();

            return promise.then(() => {
                events.trigger(this, 'localusersignedin', [user]);
            });
        };

        const validateAuthentication = (server: ServerInfo, serverUrl: string) => {
            return ajax({
                type: 'GET',
                url: `${serverUrl}/System/Info`,
                dataType: 'json',
                headers: {
                    [AUTHORIZATION_HEADER]: getAuthorizationHeader(
                        {
                            name: this.appName(),
                            version: this.appVersion()
                        },
                        {
                            id: this.deviceId(),
                            name: this.deviceName()
                        },
                        server.AccessToken as string | undefined
                    )
                }
            }).then(
                (systemInfo: SystemInfo) => {
                    updateServerInfo(server, systemInfo);
                    return Promise.resolve();
                },
                () => {
                    server.UserId = null;
                    server.AccessToken = null;
                    return Promise.resolve();
                }
            );
        };

        const getImageUrl = (localUser: UserDto | undefined) => {
            if (localUser && localUser.PrimaryImageTag) {
                const apiClient = this.getApiClient(localUser);

                const url = apiClient.getUserImageUrl(localUser.Id!, {
                    tag: localUser.PrimaryImageTag,
                    type: 'Primary'
                });

                return {
                    url,
                    supportsParams: true
                };
            }

            return {
                url: null,
                supportsParams: false
            };
        };

        this.user = (apiClient: ConnectionClient) =>
            new Promise<{ localUser: UserDto | undefined; name: string | null | undefined; imageUrl: string | null; supportsImageParams: boolean }>((resolve) => {
                let localUser: UserDto | undefined;

                const onLocalUserDone = () => {
                    if (apiClient && apiClient.getCurrentUserId()) {
                        void apiClient.getCurrentUser().then((u) => {
                            localUser = u;
                            const image = getImageUrl(localUser);

                            resolve({
                                localUser,
                                name: localUser ? localUser.Name : null,
                                imageUrl: image.url,
                                supportsImageParams: image.supportsParams
                            });
                        });
                    }
                };

                if (apiClient && apiClient.getCurrentUserId()) {
                    onLocalUserDone();
                }
            });

        this.logout = () => {
            const promises = [];

            for (let i = 0, length = this._apiClients.length; i < length; i++) {
                const apiClient = this._apiClients[i];

                if (apiClient.accessToken()) {
                    promises.push(logoutOfServer(apiClient));
                }
            }

            return Promise.all(promises).then(() => {
                const credentials = credentialProvider.credentials();

                const servers = credentials.Servers.filter((u) => u.UserLinkType !== 'Guest');

                for (let j = 0, numServers = servers.length; j < numServers; j++) {
                    const server = servers[j];

                    server.UserId = null;
                    server.AccessToken = null;
                    server.ExchangeToken = null;
                }
            });
        };

        const logoutOfServer = (apiClient: ConnectionClient) => {
            const serverInfo = apiClient.serverInfo() || {};

            const logoutInfo = {
                serverId: serverInfo.Id
            };

            const onLogout = () => {
                events.trigger(this, 'localusersignedout', [logoutInfo]);
            };

            apiClient._sdk ??= toApi(apiClient);
            const api = apiClient._sdk;

            const sessionApi = api ? getSessionApi(api) : undefined;

            const logoutPromises = [
                apiClient.logout(),
                sessionApi?.reportSessionEnded()
            ].filter(Boolean);

            return Promise
                .allSettled(logoutPromises)
                .then(
                    onLogout,
                    onLogout
                );
        };

        this.getSavedServers = () => {
            const credentials = credentialProvider.credentials();

            const servers = credentials.Servers.slice(0);

            servers.sort(sortByAccess);

            return servers;
        };

        this.getAvailableServers = () => {
            console.debug('[ConnectionManager] Begin getAvailableServers');

            // Clone the array
            const credentials = credentialProvider.credentials();

            return findServers().then(foundServers => {
                const servers = credentials.Servers.slice(0);
                foundServers.forEach(server => {
                    credentialProvider.addOrUpdateServer(servers, server);
                });

                servers.sort(sortByAccess);
                credentials.Servers = servers;
                credentialProvider.credentials(credentials);

                return servers;
            });
        };

        this.connectToServers = (servers: ServerInfo[], options?: ConnectOptions) => {
            console.log(`Begin connectToServers, with ${servers.length} servers`);

            const firstServer = servers.length ? servers[0] : null;
            // See if we have any saved credentials and can auto sign in
            if (firstServer) {
                return this.connectToServer(firstServer, options).then((result) => {
                    console.log('resolving connectToServers with result.State: ' + result.State);
                    return result;
                });
            }

            return Promise.resolve<ConnectResult>({
                Servers: servers,
                State: ConnectionState.ServerSelection
            });
        };

        this.connectToServer = (server: ServerInfo, options?: ConnectOptions) => {
            console.debug('[ConnectionManager] begin connectToServer');

            return new Promise<ConnectResult>((resolve) => {
                options = options || {};

                tryReconnect(server).then(
                    (result) => {
                        const serverUrl = result.url;
                        const connectionMode = result.connectionMode;
                        const systemInfo = result.data;

                        if (compareVersions(this.minServerVersion(), systemInfo.Version!) === 1) {
                            console.warn('[ConnectionManager] minServerVersion requirement not met. Server version:', systemInfo.Version);
                            resolve({
                                State: ConnectionState.ServerUpdateNeeded,
                                Servers: [server]
                            });
                        } else if (server.Id && systemInfo.Id !== server.Id) {
                            console.warn(
                                '[ConnectionManager] http request succeeded, but found a different server Id than what was expected'
                            );
                            resolve({
                                State: ConnectionState.ServerMismatch
                            });
                        } else {
                            onSuccessfulConnection(server, systemInfo, connectionMode, serverUrl, true, resolve, options);
                        }
                    },
                    () => {
                        resolve({
                            State: ConnectionState.Unavailable
                        });
                    }
                );
            });
        };

        const onSuccessfulConnection = (server: ServerInfo, systemInfo: PublicSystemInfo, connectionMode: ConnectionMode, serverUrl: string, verifyLocalAuthentication: boolean, resolve: (result: ConnectResult) => void, options: ConnectOptions = {}): void => {
            const credentials = credentialProvider.credentials();

            if (options.enableAutoLogin === false) {
                server.UserId = null;
                server.AccessToken = null;
            } else if (server.AccessToken && verifyLocalAuthentication) {
                void validateAuthentication(server, serverUrl).then(function () {
                    onSuccessfulConnection(server, systemInfo, connectionMode, serverUrl, false, resolve, options);
                });
                return;
            }

            updateServerInfo(server, systemInfo);

            server.LastConnectionMode = connectionMode;

            if (options.updateDateLastAccessed !== false) {
                server.DateLastAccessed = new Date().getTime();
            }
            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            credentialProvider.credentials(credentials);

            const apiClient = this._getOrAddApiClient(server, serverUrl);
            const result: ConnectResult & { ApiClient: ConnectionClient; Servers: ServerInfo[] } = { Servers: [], ApiClient: apiClient, SystemInfo: systemInfo, State: ConnectionState.ServerSignIn };

            result.ApiClient.setSystemInfo(systemInfo);
            result.SystemInfo = systemInfo;

            result.State = server.AccessToken && options.enableAutoLogin !== false ? ConnectionState.SignedIn : ConnectionState.ServerSignIn;

            result.Servers.push(server);

            // Disable the legacy apiclient's bitrate detection as this feature is now upstreamed.
            result.ApiClient.enableAutomaticBitrateDetection = false;

            result.ApiClient.updateServerInfo(server, serverUrl);
            result.ApiClient.setAuthenticationInfo(server.AccessToken, server.UserId);

            // Update SDK Api instance
            updateApiClientSdk(result.ApiClient);

            const resolveActions = () => {
                resolve(result);

                events.trigger(this, 'connected', [result]);
            };

            if (result.State === ConnectionState.SignedIn) {
                afterConnected(result.ApiClient, options);

                result.ApiClient.getCurrentUser().then((user) => {
                    onLocalUserSignIn(server, serverUrl, user).then(resolveActions, resolveActions);
                }, resolveActions);
            } else {
                resolveActions();
            }
        };

        this.updateSavedServerId = async (server: ServerInfo) => {
            const { data: serverResponse } = await tryReconnect(server);
            // Update the server ID to match the new value
            server.Id = serverResponse.Id;
            // Force the user to login again
            server.AccessToken = null;
            server.UserId = null;

            // Save the updated server in the credential provider
            const credentials = credentialProvider.credentials();
            credentialProvider.addOrUpdateServer(credentials.Servers, server);
            credentialProvider.credentials(credentials);
        };

        const tryConnectToAddress = (address: string, options?: ConnectOptions) => {
            const server = {
                ManualAddress: address,
                LastConnectionMode: ConnectionMode.Manual
            };

            return this.connectToServer(server, options).then((result) => {
                // connectToServer never rejects, but resolves with State=ConnectionState.Unavailable
                if (result.State === ConnectionState.Unavailable) {
                    return Promise.reject();
                }
                return result;
            });
        };

        this.connectToAddress = function (address: string, options?: ConnectOptions) {
            if (!address) {
                return Promise.reject();
            }

            address = normalizeAddress(address);

            const urls: string[] = [];

            if (/^[^:]+:\/\//.test(address)) {
                // Protocol specified - connect as is
                urls.push(address);
            } else {
                urls.push(`https://${address}`);
                urls.push(`http://${address}`);
            }

            let i = 0;

            const onFail = (): Promise<ConnectResult> => {
                console.log(`connectToAddress ${urls[i]} failed`);

                if (++i < urls.length) {
                    return tryConnectToAddress(urls[i], options).catch(onFail);
                }

                return Promise.resolve<ConnectResult>({
                    State: ConnectionState.Unavailable
                });
            };

            return tryConnectToAddress(urls[i], options).catch(onFail);
        };

        this.deleteServer = (serverId: string) => {
            if (!serverId) {
                throw new Error('null serverId');
            }

            const servers = credentialProvider.credentials().Servers.filter((saved) => saved.Id === serverId);
            const server = servers.length ? servers[0] : null;

            return new Promise<void>((resolve) => {
                const onDone = () => {
                    const credentials = credentialProvider.credentials();

                    credentials.Servers = credentials.Servers.filter((s) => s.Id !== serverId);

                    credentialProvider.credentials(credentials);
                    resolve();
                };

                if (!server!.ConnectServerId) {
                    onDone();
                }
            });
        };
    }

    connect(options?: ConnectOptions) {
        console.log('Begin connect');

        return this.getAvailableServers().then((servers) => {
            return this.connectToServers(servers, options);
        });
    }

    handleMessageReceived(msg: SocketMessage) {
        const serverId = msg.ServerId;
        if (serverId) {
            const apiClient = this.getApiClient(serverId);
            if (apiClient) {
                if (typeof msg.Data === 'string') {
                    try {
                        msg.Data = JSON.parse(msg.Data);
                    } catch (err) {
                        console.log('unable to parse json content: ' + err);
                    }
                }

                apiClient.handleMessageReceived(msg);
            }
        }
    }

    getApiClients() {
        const servers = this.getSavedServers();

        for (let i = 0, length = servers.length; i < length; i++) {
            const server = servers[i];
            if (server.Id) {
                this._getOrAddApiClient(server, getServerAddress(server));
            }
        }

        return this._apiClients;
    }

    /**
     * Gets the ApiClient for a given BaseItem or ServerId.
     * @param {import('@jellyfin/sdk/lib/generated-client').BaseItemDto | string | null | undefined} item
     * @returns {import('jellyfin-apiclient').ApiClient | undefined}
     */
    getApiClient(item: BaseItemDto | string | null | undefined): ConnectionClient {
        if (!item) {
            throw new Error('item or serverId cannot be null');
        }

        // Accept string + object
        if (typeof item !== 'string' && item.ServerId) {
            item = item.ServerId;
        }

        return this._apiClients.filter((a) => {
            const serverInfo = a.serverInfo();

            // We have to keep this hack in here because of the addApiClient method
            return !serverInfo || (typeof item === 'string' && serverInfo.Id === item);
        })[0];
    }

    /**
     * Returns or creates an Api instance for a given server. If no serverId is provided,
     * the last used server will be used instead.
     * @param {string} [serverId] The ID of the server
     * @returns {import('@jellyfin/sdk').Api|undefined}
     */
    getApi(serverId?: string | null): Api | undefined {
        // If no serverId is provided, try to use the last used server
        if (!serverId) {
            const server = this.getLastUsedServer();
            serverId = server?.Id;
        }

        // If no serverId is available still, return undefined
        if (!serverId) {
            return undefined;
        }

        const apiClient = this.getApiClient(serverId);
        apiClient._sdk ??= toApi(apiClient);
        return apiClient._sdk;
    }

    minServerVersion(val?: string) {
        if (val) {
            this._minServerVersion = val;
        }

        return this._minServerVersion;
    }
}
