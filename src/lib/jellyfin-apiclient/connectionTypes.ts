import type { Api } from '@jellyfin/sdk';
import type { AuthenticationResult, PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client';
import type { ApiClient } from 'jellyfin-apiclient';

import type { ConnectionMode } from './connectionMode';
import type { ConnectionState } from './connectionState';

export type ServerInfo = {
    Id?: string | null;
    Name?: string | null;
    LocalAddress?: string;
    RemoteAddress?: string;
    ManualAddress?: string;
    LastConnectionMode: ConnectionMode;
    DateLastAccessed?: number;
    manualAddressOnly?: boolean;
    UserId?: string | null;
    AccessToken?: string | null;
    ExchangeToken?: string | null;
    UserLinkType?: string;
    ConnectServerId?: string;
};

export type DiscoveredServer = PublicSystemInfo & { Address?: string; EndpointAddress?: string; Name?: string };
export type SavedCredentials = { Servers: ServerInfo[] };
export type CredentialStore = {
    credentials(data?: SavedCredentials): SavedCredentials;
    addOrUpdateServer(servers: ServerInfo[], server: ServerInfo): unknown;
};

// These runtime extensions are absent from the legacy package's declarations.
export type ConnectionClient = ApiClient & {
    serverInfo(server?: ServerInfo): ServerInfo;
    enableAutomaticNetworking?: boolean;
    enableAutomaticBitrateDetection?: boolean;
    manualAddressOnly?: boolean;
    onAuthenticated?: (client: ConnectionClient, result: AuthenticationResult) => Promise<unknown>;
    getMaxBandwidth?: () => number | null;
    normalizeImageOptions?: (options: ImageOptions) => void;
    subscribe?: Api['subscribe'];
    setAuthenticationInfo(accessKey?: string | null, userId?: string | null): void;
};
export type ImageOptions = { quality?: number; width?: number; height?: number; maxWidth?: number; maxHeight?: number; fillWidth?: number; fillHeight?: number };
export type ConnectOptions = { enableAutoLogin?: boolean; reportCapabilities?: boolean; updateDateLastAccessed?: boolean };
export type ConnectResult = {
    State: ConnectionState.SignedIn | ConnectionState.ServerSignIn;
    Servers: ServerInfo[];
    ApiClient: ConnectionClient;
    SystemInfo: PublicSystemInfo;
} | {
    State: ConnectionState.ServerMismatch | ConnectionState.ServerSelection | ConnectionState.ServerUpdateNeeded | ConnectionState.Unavailable;
    Servers?: ServerInfo[];
};
export type SocketMessage = { ServerId?: string; Data?: unknown };
