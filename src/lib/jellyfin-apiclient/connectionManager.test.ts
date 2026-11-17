import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import events from 'utils/events';
import { ajax } from 'utils/fetch';

import ConnectionManager from './connectionManager';
import { ConnectionMode } from './connectionMode';
import { ConnectionState } from './connectionState';
import type { ConnectionClient, CredentialStore, ServerInfo } from './connectionTypes';

vi.mock('utils/jellyfin-apiclient/compat', () => ({ toApi: () => ({}), updateApiClientSdk: vi.fn() }));
vi.mock('utils/fetch', () => ({ ajax: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/session-api', () => ({ getSessionApi: () => ({ reportSessionEnded: vi.fn() }) }));

const makeServer = (Id = 'server'): ServerInfo => ({ Id, ManualAddress: 'https://server', LastConnectionMode: ConnectionMode.Manual });
function makeManager(servers = [makeServer()]) {
    let credentials = { Servers: servers };
    const provider: CredentialStore = {
        credentials: (value) => {
            if (value) credentials = value;
            return credentials;
        },
        addOrUpdateServer: (list, server) => {
            if (!list.includes(server)) list.push(server);
        }
    };
    const manager = new ConnectionManager(provider, 'app', '1', 'TV', 'device', {});
    let info = servers[0] || makeServer();
    // Only the connection methods exercised here are needed from the legacy client.
    const client = {
        _sdk: {},
        serverAddress: () => 'https://server',
        serverInfo: (server?: ServerInfo) => {
            if (server) info = server;
            return info;
        },
        serverId: () => info.Id,
        getCurrentUserId: () => info.UserId,
        getCurrentUser: vi.fn<() => Promise<UserDto>>(),
        setAuthenticationInfo: vi.fn(),
        reportCapabilities: vi.fn(),
        accessToken: () => info.AccessToken,
        logout: vi.fn().mockResolvedValue(undefined)
    } as unknown as ConnectionClient;
    manager.addApiClient(client);
    return { manager, client, provider };
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => { resolve = done;
    });
    return { promise, resolve };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('connection lifecycle', () => {
    it('completes the sign-in hook before notifying subscribers', async () => {
        const { manager, client, provider } = makeManager();
        const hydration = deferred();
        manager.onLocalUserSignedIn = () => hydration.promise;
        const signedIn = vi.fn();
        events.on(manager, 'localusersignedin', signedIn);
        const user = { Id: 'user', ServerId: 'server' };
        const completion = client.onAuthenticated!(client, { User: user, ServerId: 'server', AccessToken: 'token' });
        expect(signedIn).not.toHaveBeenCalled();
        expect(provider.credentials().Servers[0].UserId).toBe('user');
        hydration.resolve();
        await completion;
        expect(signedIn).toHaveBeenCalledWith({ type: 'localusersignedin' }, user);
    });

    it('keeps public closure methods callable without their owner', async () => {
        const { manager } = makeManager();
        const getSavedServers = manager.getSavedServers;
        const connectToAddress = manager.connectToAddress;
        expect(getSavedServers()[0].Id).toBe('server');
        await expect(connectToAddress('')).rejects.toBeUndefined();
    });

    it('deletes a saved local server without changing other records', async () => {
        const { manager, provider } = makeManager([makeServer(), makeServer('other')]);
        await manager.deleteServer('server');
        expect(provider.credentials().Servers.map(server => server.Id)).toEqual(['other']);
    });

    it('settles a failed reconnect as unavailable for connection callers', async () => {
        vi.useFakeTimers();
        vi.mocked(ajax).mockRejectedValue(new Error('offline'));
        const { manager } = makeManager();
        const connection = manager.connectToServer(makeServer());
        await vi.runAllTimersAsync();
        await expect(connection).resolves.toEqual({ State: ConnectionState.Unavailable });
    });
});
