import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client';

import { ConnectionMode } from './connectionMode';
import type { DiscoveredServer, ServerInfo } from './connectionTypes';

export function updateServerInfo(server: ServerInfo, systemInfo: PublicSystemInfo) {
    server.Name = systemInfo.ServerName;
    if (systemInfo.Id) server.Id = systemInfo.Id;
    if (systemInfo.LocalAddress) server.LocalAddress = systemInfo.LocalAddress;
}

export function normalizeAddress(address: string) {
    return address.trim().replace('Http:', 'http:').replace('Https:', 'https:');
}

export function sortByAccess(first: ServerInfo, second: ServerInfo) {
    return (second.DateLastAccessed || 0) - (first.DateLastAccessed || 0);
}

function convertEndpointAddressToManualAddress(info: DiscoveredServer) {
    if (info.Address && info.EndpointAddress) {
        let address = info.EndpointAddress.split(':')[0];
        const parts = info.Address.split(':');
        if (parts.length > 1) {
            const portString = parts[parts.length - 1];
            if (!isNaN(parseInt(portString, 10))) address += `:${portString}`;
        }
        return normalizeAddress(address);
    }
    return null;
}

export function findServers() {
    return new Promise<ServerInfo[]>((resolve) => {
        const onFinish = (foundServers: DiscoveredServer[]) => {
            resolve(foundServers.map((foundServer) => {
                const info: ServerInfo = {
                    Id: foundServer.Id,
                    LocalAddress: convertEndpointAddressToManualAddress(foundServer) || foundServer.Address,
                    Name: foundServer.Name,
                    LastConnectionMode: ConnectionMode.Local
                };
                info.LastConnectionMode = info.ManualAddress ? ConnectionMode.Manual : ConnectionMode.Local;
                return info;
            }));
        };
        if (window && window.NativeShell && typeof window.NativeShell.findServers === 'function') {
            window.NativeShell.findServers(1e3).then(onFinish, () => onFinish([]));
        } else {
            resolve([]);
        }
    });
}
