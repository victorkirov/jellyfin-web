import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import type { ConnectOptions, ConnectionClient, ImageOptions, CredentialStore } from './connectionTypes';
import { Credentials } from 'jellyfin-apiclient';

import { getMaxBandwidth } from 'utils/getMaxBandwidth';
import Events from 'utils/events';
import { createApiClient } from 'utils/jellyfin-apiclient/createApiClient';

import ConnectionManager from './connectionManager';
import { connectionServices as services, clientCapabilities as capabilities } from './connectionServices';
export { configureServerConnections } from './connectionServices';

const normalizeImageOptions = (options: ImageOptions) => {
    if (!options.quality && (options.maxWidth || options.width || options.maxHeight || options.height || options.fillWidth || options.fillHeight)) {
        options.quality = 90;
    }
};

class ServerConnections extends ConnectionManager {
    firstConnection: boolean | null = false;
    localApiClient: ConnectionClient | null;

    constructor(...args: ConstructorParameters<typeof ConnectionManager>) {
        super(...args);
        this.localApiClient = null;
        this.firstConnection = null;

        Events.on(this, 'localusersignedout', (_e, logoutInfo) => {
            void services.setUserInfo(null, null);
            // Ensure the updated credentials are persisted to storage
            credentialProvider.credentials(credentialProvider.credentials());

            if (window.NativeShell && typeof window.NativeShell.onLocalUserSignedOut === 'function') {
                window.NativeShell.onLocalUserSignedOut(logoutInfo);
            }
        });

        Events.on(this, 'apiclientcreated', (_e, apiClient) => {
            apiClient.getMaxBandwidth = getMaxBandwidth;
            apiClient.normalizeImageOptions = normalizeImageOptions;

            // Calling getApi will ensure apiClient._sdk is initialized.
            this.getApi(apiClient.serverId());
            apiClient.subscribe = apiClient._sdk!.subscribe.bind(apiClient._sdk);
        });
    }

    initApiClient(server: string) {
        console.debug('creating ApiClient singleton');

        const apiClient = createApiClient(
            server,
            services.appName(),
            services.appVersion(),
            services.deviceName(),
            services.deviceId()
        ) as ConnectionClient;

        apiClient.enableAutomaticNetworking = false;
        apiClient.manualAddressOnly = true;

        this.addApiClient(apiClient);

        this.setLocalApiClient(apiClient);

        console.debug('loaded ApiClient singleton');
    }

    connect(options?: ConnectOptions) {
        return super.connect({
            enableAutoLogin: services.enableAutoLogin(),
            ...options
        });
    }

    setLocalApiClient(apiClient: ConnectionClient | null | undefined, preserveAuthentication = false) {
        if (apiClient) {
            if (this.localApiClient !== apiClient && !preserveAuthentication) {
                this.invalidateAuthentication();
                void services.setUserInfo(null, null);
            }
            this.localApiClient = apiClient;
            window.ApiClient = apiClient;
            // Calling getApi will ensure apiClient._sdk is initialized.
            this.getApi(apiClient.serverId());
        }
    }

    getLocalApiClient() {
        return this.localApiClient;
    }

    /** Gets the currently connected legacy client. */
    currentApiClient() {
        let apiClient: ConnectionClient | null | undefined = this.getLocalApiClient();

        if (!apiClient) {
            const server = this.getLastUsedServer();

            if (server) {
                apiClient = this.getApiClient(server.Id);
            }
        }

        return apiClient;
    }

    /** Gets the connected client or throws when no connection exists. */
    async getCurrentApiClientAsync() {
        const apiClient = this.currentApiClient();
        if (!apiClient) throw new Error('[ServerConnection] No current ApiClient instance');

        return apiClient;
    }

    onLocalUserSignedIn = (user: UserDto, isCurrent: () => boolean) => {
        if (!isCurrent()) return Promise.resolve();
        // ConnectionManager registers this client before invoking the sign-in hook.
        const apiClient = this.getApiClient(user.ServerId)!;
        this.setLocalApiClient(apiClient, true);
        setTimeout(() => {
            const api = isCurrent() ? this.getApi(user.ServerId) : undefined;
            if (api) void services.detectBitrate(api, true).catch(error => console.warn('Bitrate detection failed', error));
        }, 6000);
        return services.setUserInfo(user.Id, apiClient).then(() => {
            if (!isCurrent()) return;
            if (window.NativeShell && typeof window.NativeShell.onLocalUserSignedIn === 'function') {
                return window.NativeShell.onLocalUserSignedIn(user, apiClient.accessToken());
            }
            return Promise.resolve();
        });
    };
}

const credentialProvider = new Credentials();

export default new ServerConnections(
    credentialProvider as CredentialStore,
    () => services.appName(),
    () => services.appVersion(),
    () => services.deviceName(),
    () => services.deviceId(),
    capabilities);
