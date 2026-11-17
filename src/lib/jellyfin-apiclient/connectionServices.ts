import type { Api } from '@jellyfin/sdk';
import type { ClientCapabilitiesDto } from '@jellyfin/sdk/lib/generated-client';
import type { ApiClient } from 'jellyfin-apiclient';

export type ConnectionServices = {
    appName: () => string;
    appVersion: () => string;
    deviceName: () => string;
    deviceId: () => string;
    capabilities: ClientCapabilitiesDto;
    enableAutoLogin: () => boolean;
    setUserInfo: (userId: string | null | undefined, apiClient: ApiClient | null) => Promise<unknown>;
    detectBitrate: (api: Api, force: boolean) => Promise<unknown>;
};

export let connectionServices: ConnectionServices;
export const clientCapabilities: ClientCapabilitiesDto = {};

/** App composition supplies side effects without making the connection service import UI. */
export function configureServerConnections(value: ConnectionServices) {
    connectionServices = value;
    Object.assign(clientCapabilities, value.capabilities);
}
