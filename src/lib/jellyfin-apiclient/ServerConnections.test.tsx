import type { Api } from '@jellyfin/sdk';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider, useApi } from 'hooks/useApi';
import { get, setUserInfo } from 'scripts/settings/userSettings';
import { queryClient } from 'utils/query/queryClient';

import connections, { configureServerConnections } from './ServerConnections';
import { ConnectionMode } from './connectionMode';
import type { ConnectionClient, ServerInfo } from './connectionTypes';

vi.mock('utils/jellyfin-apiclient/compat', () => ({ toApi: () => ({ subscribe: vi.fn() }), updateApiClientSdk: vi.fn() }));
vi.mock('@jellyfin/sdk/lib/utils/api/session-api', () => ({ getSessionApi: () => ({ reportSessionEnded: vi.fn() }) }));
vi.mock('lib/queries/displayPreferences', () => ({ getDisplayPreferencesQuery: () => ({ queryKey: ['display-preferences'] }) }));
vi.mock('lib/queries/user', () => ({ getUserQuery: vi.fn() }));
vi.mock('hooks/useUsers', () => ({ ['QUERY_KEY']: 'Users' }));
vi.mock('utils/query/queryClient', () => ({ queryClient: { fetchQuery: vi.fn(), invalidateQueries: vi.fn(), setQueryData: vi.fn() } }));
vi.mock('scripts/browser', () => ({ default: {} }));

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
const preferences = (user: string) => ({ CustomPrefs: { language: user } });
const detectBitrate = vi.fn().mockResolvedValue(1);
const nativeSignIn = vi.fn().mockResolvedValue(undefined);
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;

const CurrentUser = () => <span>{useApi().user?.Id || 'signed out'}</span>;

function addClient(id = 'server') {
    let server: ServerInfo = { Id: id, ManualAddress: `https://${id}.example`, LastConnectionMode: ConnectionMode.Manual };
    // The integration uses the same runtime extensions as the legacy client.
    const client = {
        _sdk: { subscribe: vi.fn() },
        serverAddress: () => `https://${id}.example`,
        serverId: () => server.Id,
        serverInfo: (value?: ServerInfo) => {
            if (value) server = value;
            return server;
        },
        accessToken: () => server.AccessToken,
        setAuthenticationInfo: vi.fn(),
        reportCapabilities: vi.fn(),
        logout: vi.fn().mockResolvedValue(undefined),
        getCurrentUser: vi.fn().mockResolvedValue({ Id: 'initial', ServerId: id }),
        updateDisplayPreferences: vi.fn().mockResolvedValue(undefined)
    } as unknown as ConnectionClient;
    connections.addApiClient(client);
    return client;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    detectBitrate.mockResolvedValue(1);
    nativeSignIn.mockResolvedValue(undefined);
    localStorage.clear();
    configureServerConnections({
        appName: () => 'app', appVersion: () => '1', deviceName: () => 'TV', deviceId: () => 'device',
        capabilities: {}, enableAutoLogin: () => true, setUserInfo, detectBitrate
    });
    connections.clearData();
    connections._apiClients.length = 0;
    connections.localApiClient = null;
    window.NativeShell = { onLocalUserSignedIn: nativeSignIn };
    container = document.createElement('div');
    root = createRoot(container);
    act(() => root.render(<ApiProvider><CurrentUser /></ApiProvider>));
});

afterEach(() => {
    act(() => root.unmount());
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

const signIn = (client: ConnectionClient, Id: string) =>
    client.onAuthenticated!(client, { ServerId: 'server', User: { Id, ServerId: 'server' }, AccessToken: Id + '-token' });

describe('connection/settings/provider continuation', () => {
    it('keeps B after delayed A hydration and suppresses stale native and bitrate callbacks', async () => {
        const first = deferred<ReturnType<typeof preferences>>();
        const second = deferred<ReturnType<typeof preferences>>();
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const client = addClient();
        const pendingA = signIn(client, 'A');
        const pendingB = signIn(client, 'B');
        await act(async () => {
            second.resolve(preferences('B'));
            await pendingB;
            first.resolve(preferences('A'));
            await pendingA;
        });
        expect(get('language')).toBe('B');
        expect(container.textContent).toBe('B');
        expect(nativeSignIn).toHaveBeenCalledOnce();
        expect(nativeSignIn).toHaveBeenCalledWith({ Id: 'B', ServerId: 'server' }, 'B-token');
        await vi.runAllTimersAsync();
        expect(detectBitrate).toHaveBeenCalledOnce();
        expect(detectBitrate).toHaveBeenCalledWith(client._sdk as Api, true);
    });

    it('stays signed out when A hydration completes after logout', async () => {
        const first = deferred<ReturnType<typeof preferences>>();
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(first.promise);
        const client = addClient();
        const pending = signIn(client, 'A');
        await act(async () => {
            await connections.logout();
            first.resolve(preferences('A'));
            await pending;
        });
        expect(container.textContent).toBe('signed out');
        expect(nativeSignIn).not.toHaveBeenCalled();
        await vi.runAllTimersAsync();
        expect(detectBitrate).not.toHaveBeenCalled();
    });

    it('does not emit sign-in after a native continuation outlives logout', async () => {
        vi.mocked(queryClient.fetchQuery).mockResolvedValueOnce(preferences('A'));
        const nativeCompletion = deferred<void>();
        nativeSignIn.mockReturnValueOnce(nativeCompletion.promise);
        const client = addClient();
        const pending = signIn(client, 'A');
        for (let tick = 0; tick < 4; tick++) await Promise.resolve();
        expect(nativeSignIn).toHaveBeenCalledOnce();
        await act(async () => {
            await connections.logout();
            nativeCompletion.resolve();
            await pending;
        });
        expect(container.textContent).toBe('signed out');
    });

    it('invalidates pending hydration when the selected server changes', async () => {
        const first = deferred<ReturnType<typeof preferences>>();
        vi.mocked(queryClient.fetchQuery).mockReturnValueOnce(first.promise);
        const client = addClient();
        const pending = signIn(client, 'A');
        const replacement = addClient('other');
        connections.setLocalApiClient(replacement);
        await act(async () => {
            first.resolve(preferences('A'));
            await pending;
        });
        expect(container.textContent).toBe('signed out');
        expect(nativeSignIn).not.toHaveBeenCalled();
        expect(connections.currentApiClient()).toBe(replacement);
    });
});
