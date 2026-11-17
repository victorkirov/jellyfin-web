import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client';

import { ajax } from 'utils/fetch';

import { ConnectionMode } from './connectionMode';
import type { ServerInfo } from './connectionTypes';

const DEFAULT_CONNECTION_TIMEOUT = 20000;
type ReconnectState = { numAddresses: number; rejects: number; resolved?: boolean };
export type ReconnectResult = { url: string; connectionMode: ConnectionMode; data: PublicSystemInfo };

function getTryConnectPromise(url: string, connectionMode: ConnectionMode, state: ReconnectState, resolve: (result: ReconnectResult) => void, reject: () => void) {
    console.log('getTryConnectPromise ' + url);

    ajax({
        url: `${url}/System/Info/Public`,
        timeout: DEFAULT_CONNECTION_TIMEOUT,
        type: 'GET',
        dataType: 'json'
    }).then(
        (result: PublicSystemInfo) => {
            if (!state.resolved) {
                state.resolved = true;

                console.log('Reconnect succeeded to ' + url);
                resolve({
                    url: url,
                    connectionMode: connectionMode,
                    data: result
                });
            }
        },
        () => {
            console.log('Reconnect failed to ' + url);

            if (!state.resolved) {
                state.rejects++;
                if (state.rejects >= state.numAddresses) {
                    reject();
                }
            }
        }
    );
}

export function tryReconnect(serverInfo: ServerInfo) {
    const addresses: { url: string; mode: ConnectionMode; timeout: number }[] = [];
    const addressesStrings: string[] = [];

    // the timeouts are a small hack to try and ensure the remote address doesn't resolve first

    // manualAddressOnly is used for the local web app that always connects to a fixed address
    if (
        !serverInfo.manualAddressOnly
        && serverInfo.LocalAddress
        && addressesStrings.indexOf(serverInfo.LocalAddress) === -1
    ) {
        addresses.push({
            url: serverInfo.LocalAddress,
            mode: ConnectionMode.Local,
            timeout: 0
        });
        addressesStrings.push(addresses[addresses.length - 1].url);
    }
    if (serverInfo.ManualAddress && addressesStrings.indexOf(serverInfo.ManualAddress) === -1) {
        addresses.push({
            url: serverInfo.ManualAddress,
            mode: ConnectionMode.Manual,
            timeout: 100
        });
        addressesStrings.push(addresses[addresses.length - 1].url);
    }
    if (
        !serverInfo.manualAddressOnly
        && serverInfo.RemoteAddress
        && addressesStrings.indexOf(serverInfo.RemoteAddress) === -1
    ) {
        addresses.push({
            url: serverInfo.RemoteAddress,
            mode: ConnectionMode.Remote,
            timeout: 200
        });
        addressesStrings.push(addresses[addresses.length - 1].url);
    }

    console.info('[ConnectionManager] tryReconnect addresses', addressesStrings);

    if (!addresses.length) return Promise.reject(new Error('No eligible server address'));

    return new Promise<ReconnectResult>((resolve, reject) => {
        const state: ReconnectState = { numAddresses: addresses.length, rejects: 0 };

        addresses.forEach((url) => {
            setTimeout(() => {
                if (!state.resolved) {
                    getTryConnectPromise(url.url, url.mode, state, resolve, reject);
                }
            }, url.timeout);
        });
    });
};
