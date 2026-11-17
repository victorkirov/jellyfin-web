import type { UserDto } from '@jellyfin/sdk/lib/generated-client';
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest';

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
        setSystemInfo: vi.fn(),
        updateServerInfo: vi.fn(),
        reportCapabilities: vi.fn(),
        accessToken: () => info.AccessToken,
        logout: vi.fn().mockResolvedValue(undefined)
    } as unknown as ConnectionClient;
    manager.addApiClient(client);
    return { manager, client, provider };
}

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

afterEach(() => {
    vi.useRealTimers();
});

describe('connection lifecycle', () => {
    it('returns undefined for an unknown server and preserves registered client identity', () => {
        const { manager, client } = makeManager();
        expectTypeOf(manager.getApiClient('missing')).toEqualTypeOf<ConnectionClient | undefined>();
        expect(manager.getApiClient('missing')).toBeUndefined();
        expect(manager.getApiClient({ ServerId: 'missing' })).toBeUndefined();
        expect(manager.getApiClient('server')).toBe(client);
        expect(manager.getApiClient({ ServerId: 'server' })).toBe(client);
        expect(() => manager.getApi('missing')).toThrow();
    });

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

describe('authentication ownership', () => {
    it('does not publish A after B completes a newer sign-in', async () => {
        const { manager, client } = makeManager();
        const first = deferred();
        const second = deferred();
        manager.onLocalUserSignedIn = user => user.Id === 'A' ? first.promise : second.promise;
        const signedIn = vi.fn();
        events.on(manager, 'localusersignedin', signedIn);
        const pendingA = client.onAuthenticated!(client, { User: { Id: 'A', ServerId: 'server' }, ServerId: 'server' });
        const pendingB = client.onAuthenticated!(client, { User: { Id: 'B', ServerId: 'server' }, ServerId: 'server' });
        second.resolve();
        await pendingB;
        first.resolve();
        await pendingA;
        expect(signedIn.mock.calls.map(call => call[1].Id)).toEqual(['B']);
    });

    it('invalidates hydration before asynchronous logout finishes', async () => {
        const { manager, client } = makeManager();
        const hydration = deferred();
        manager.onLocalUserSignedIn = () => hydration.promise;
        const signedIn = vi.fn();
        events.on(manager, 'localusersignedin', signedIn);
        const pending = client.onAuthenticated!(client, { User: { Id: 'A', ServerId: 'server' }, ServerId: 'server', AccessToken: 'token' });
        const logout = manager.logout();
        hydration.resolve();
        await pending;
        await logout;
        expect(signedIn).not.toHaveBeenCalled();
    });

    it('ignores an obsolete auto-login current-user response', async () => {
        vi.useFakeTimers();
        vi.mocked(ajax).mockResolvedValue({ Id: 'server', Version: '10.12.0' });
        const { manager, client, provider } = makeManager();
        provider.credentials().Servers[0].AccessToken = 'A-token';
        let resolveUser!: (user: UserDto) => void;
        const userRequest = new Promise<UserDto>(resolve => {
            resolveUser = resolve;
        });
        vi.mocked(client.getCurrentUser).mockReturnValue(userRequest);
        const signedIn = vi.fn();
        events.on(manager, 'localusersignedin', signedIn);
        const connection = manager.connectToServer(provider.credentials().Servers[0]);
        await vi.advanceTimersByTimeAsync(100);
        expect(client.getCurrentUser).toHaveBeenCalledOnce();
        await client.onAuthenticated!(client, { User: { Id: 'B', ServerId: 'server' }, ServerId: 'server' });
        resolveUser({ Id: 'A', ServerId: 'server' });
        await expect(connection).resolves.toEqual({ State: ConnectionState.Superseded });
        expect(signedIn.mock.calls.map(call => call[1].Id)).toEqual(['B']);
    });

    it('invalidates hydration when a replacement connection begins', async () => {
        vi.useFakeTimers();
        vi.mocked(ajax).mockRejectedValue(new Error('offline'));
        const { manager, client } = makeManager();
        const hydration = deferred();
        manager.onLocalUserSignedIn = () => hydration.promise;
        const signedIn = vi.fn();
        events.on(manager, 'localusersignedin', signedIn);
        const pending = client.onAuthenticated!(client, { User: { Id: 'A', ServerId: 'server' }, ServerId: 'server' });
        const replacement = manager.connectToServer(makeServer('other'));
        hydration.resolve();
        await pending;
        await vi.runAllTimersAsync();
        await replacement;
        expect(signedIn).not.toHaveBeenCalled();
    });
});

describe('connection settlement', () => {
    it.each([
        { LastConnectionMode: ConnectionMode.Manual },
        { LastConnectionMode: ConnectionMode.Manual, manualAddressOnly: true, LocalAddress: 'https://local' }
    ])('releases a connectToServers caller with no eligible address', async server => {
        const { manager } = makeManager();
        let loading = true;
        const completed = vi.fn();
        void manager.connectToServers([server]).then(result => {
            loading = false;
            completed(result);
        });
        for (let tick = 0; tick < 8; tick++) await Promise.resolve();
        expect(loading).toBe(false);
        expect(completed).toHaveBeenCalledWith({ State: ConnectionState.Unavailable });
    });

    it('settles deletion of an unknown saved server', async () => {
        const { manager } = makeManager();
        await expect(manager.deleteServer('missing')).resolves.toBeUndefined();
    });

    it('deletes legacy Connect records and settles unknown IDs', async () => {
        const { manager, provider } = makeManager([{ ...makeServer(), ConnectServerId: 'legacy' }, makeServer('other')]);
        const completed = vi.fn();
        void manager.deleteServer('server').then(completed);
        await Promise.resolve();
        expect(completed).toHaveBeenCalledOnce();
        expect(provider.credentials().Servers.map(server => server.Id)).toEqual(['other']);
        await expect(manager.deleteServer('missing')).resolves.toBeUndefined();
    });
});

describe('superseded connection results', () => {
    it.each(['connect', 'connectToServers', 'connectToServer', 'connectToAddress'] as const)(
        'settles a superseded %s without reporting an unreachable server', async method => {
            vi.useFakeTimers();
            const { manager } = makeManager();
            const first = makeServer();
            let resolveFirst!: (value: { Id: string; Version: string }) => void;
            const pending = new Promise<{ Id: string; Version: string }>(resolve => {
                resolveFirst = resolve;
            });
            vi.mocked(ajax).mockReturnValueOnce(pending).mockResolvedValue({ Id: 'server', Version: '10.12.0' });
            vi.spyOn(manager, 'getAvailableServers').mockResolvedValue([first]);
            const connect = () => {
                switch (method) {
                    case 'connect': return manager.connect();
                    case 'connectToServers': return manager.connectToServers([first]);
                    case 'connectToServer': return manager.connectToServer(first);
                    case 'connectToAddress': return manager.connectToAddress('https://server');
                }
            };
            const older = connect();
            await vi.advanceTimersByTimeAsync(100);
            const connected = vi.fn();
            events.on(manager, 'connected', connected);
            const newer = connect();
            await vi.advanceTimersByTimeAsync(100);
            const latest = await newer;
            expect(latest.State).toBe(ConnectionState.ServerSignIn);
            resolveFirst({ Id: 'server', Version: '10.12.0' });
            await expect(older).resolves.toEqual({ State: 'Superseded' });
            expect(connected).toHaveBeenCalledTimes(1);
            expect(connected.mock.calls[0][1]).toBe(latest);
        }
    );

    it('ignores superseded discovery before attempting a connection', async () => {
        const { manager } = makeManager();
        let completeDiscovery!: (value: ServerInfo[]) => void;
        const discovery = new Promise<ServerInfo[]>(resolve => {
            completeDiscovery = resolve;
        });
        vi.spyOn(manager, 'getAvailableServers').mockReturnValueOnce(discovery).mockResolvedValue([]);
        const older = manager.connect();
        await expect(manager.connect()).resolves.toMatchObject({ State: ConnectionState.ServerSelection });
        completeDiscovery([makeServer()]);
        await expect(older).resolves.toEqual({ State: 'Superseded' });
    });
});

it('ignores an older address failure without retrying or showing a network failure', async () => {
    vi.useFakeTimers();
    const { manager } = makeManager();
    let rejectOlder!: (error: Error) => void;
    const olderResponse = new Promise((_, reject) => {
        rejectOlder = reject;
    });
    vi.mocked(ajax).mockReturnValueOnce(olderResponse).mockResolvedValue({ Id: 'server', Version: '10.12.0' });
    const older = manager.connectToAddress('server');
    await vi.advanceTimersByTimeAsync(100);
    const newer = manager.connectToServer(makeServer());
    await vi.advanceTimersByTimeAsync(100);
    await expect(newer).resolves.toMatchObject({ State: ConnectionState.ServerSignIn });
    rejectOlder(new Error('old address offline'));
    await expect(older).resolves.toEqual({ State: ConnectionState.Superseded });
    expect(ajax).toHaveBeenCalledTimes(2);
});

it.each(['validation', 'hydration'])('ignores a superseded auto-login result during %s', async phase => {
    vi.useFakeTimers();
    const { manager, client, provider } = makeManager();
    const server = provider.credentials().Servers[0];
    server.AccessToken = 'saved-token';
    const info = { Id: 'server', Version: '10.12.0' };
    let finishValidation!: (value: typeof info) => void;
    const validation = new Promise<typeof info>(resolve => {
        finishValidation = resolve;
    });
    const hydration = deferred();
    vi.mocked(ajax).mockResolvedValue(info);
    if (phase === 'validation') vi.mocked(ajax).mockResolvedValueOnce(info).mockReturnValueOnce(validation);
    vi.mocked(client.getCurrentUser).mockResolvedValue({ Id: 'viewer', ServerId: 'server' });
    const signedIn = vi.fn();
    events.on(manager, 'localusersignedin', signedIn);
    manager.onLocalUserSignedIn = vi.fn().mockReturnValueOnce(phase === 'hydration' ? hydration.promise : Promise.resolve())
        .mockResolvedValue(undefined);
    const older = manager.connectToServer(server);
    await vi.advanceTimersByTimeAsync(100);
    const newer = manager.connectToServer(server);
    await vi.advanceTimersByTimeAsync(100);
    await expect(newer).resolves.toMatchObject({ State: ConnectionState.SignedIn });
    if (phase === 'validation') finishValidation(info);
    else hydration.resolve();
    await expect(older).resolves.toEqual({ State: ConnectionState.Superseded });
    expect(signedIn).toHaveBeenCalledOnce();
});

it.each([false, true])('preserves a discovery error only when its attempt is current (superseded=%s)', async superseded => {
    const { manager } = makeManager();
    let failDiscovery!: (error: Error) => void;
    const discovery = new Promise<ServerInfo[]>((_, reject) => {
        failDiscovery = reject;
    });
    vi.spyOn(manager, 'getAvailableServers').mockReturnValueOnce(discovery).mockResolvedValue([]);
    const older = manager.connect();
    if (superseded) await manager.connect();
    const error = new Error('discovery unavailable');
    failDiscovery(error);
    if (superseded) await expect(older).resolves.toEqual({ State: ConnectionState.Superseded });
    else await expect(older).rejects.toBe(error);
});
