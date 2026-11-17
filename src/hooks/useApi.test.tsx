import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiProvider, useApi } from './useApi';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import events from 'utils/events';

const { initialUser, clientA, clientB } = vi.hoisted(() => ({
    initialUser: vi.fn(),
    clientA: { serverId: () => 'server-A' },
    clientB: { serverId: () => 'server-B' }
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: {
    currentApiClient: vi.fn(),
    getApiClient: (serverId: string) => serverId === 'server-A' ? clientA : clientB,
    getApi: (serverId: string) => ({ basePath: serverId })
} }));

let root: Root;
let container: HTMLDivElement;
function Probe() {
    const { api, user, __legacyApiClient__ } = useApi();
    return <div>{user?.Id || 'signed-out'}:{api?.basePath || 'no-api'}:{__legacyApiClient__?.serverId() || 'no-client'}</div>;
}
beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.mocked(ServerConnections.currentApiClient).mockReturnValue({ ...clientA, getCurrentUser: initialUser } as unknown as ReturnType<typeof ServerConnections.currentApiClient>);
});
async function mount() {
    container = document.createElement('div');
    root = createRoot(container);
    await act(async () => root.render(<ApiProvider><Probe /></ApiProvider>));
}
afterEach(async () => {
    await act(async () => root?.unmount());
    vi.clearAllMocks();
    vi.unstubAllGlobals();
});

describe('initial API user hydration', () => {
    it('hydrates the current user and derives the matching API together', async () => {
        initialUser.mockResolvedValue({ Id: 'A', ServerId: 'server-A' });
        await mount();
        expect(container.textContent).toBe('A:server-A:server-A');
    });

    it('ignores completion after the wrapper selects another client', async () => {
        let resolve!: (user: { Id: string; ServerId: string }) => void;
        initialUser.mockReturnValue(new Promise(complete => {
            resolve = complete;
        }));
        await mount();
        vi.mocked(ServerConnections.currentApiClient).mockReturnValue(clientB as ReturnType<typeof ServerConnections.currentApiClient>);
        await act(async () => resolve({ Id: 'A', ServerId: 'server-A' }));
        expect(container.textContent).toBe('signed-out:no-api:no-client');
    });

    it('ignores delayed A after B signs in and sign-out clears every context field', async () => {
        let resolve!: (user: { Id: string; ServerId: string }) => void;
        initialUser.mockReturnValue(new Promise(complete => {
            resolve = complete;
        }));
        await mount();
        await act(async () => events.trigger(ServerConnections, 'localusersignedin', [{ Id: 'B', ServerId: 'server-B' }]));
        expect(container.textContent).toBe('B:server-B:server-B');
        await act(async () => resolve({ Id: 'A', ServerId: 'server-A' }));
        expect(container.textContent).toBe('B:server-B:server-B');
        await act(async () => events.trigger(ServerConnections, 'localusersignedout'));
        expect(container.textContent).toBe('signed-out:no-api:no-client');
    });

    it('cannot restore A after sign-out', async () => {
        let resolve!: (user: { Id: string; ServerId: string }) => void;
        initialUser.mockReturnValue(new Promise(complete => {
            resolve = complete;
        }));
        await mount();
        await act(async () => events.trigger(ServerConnections, 'localusersignedout'));
        await act(async () => resolve({ Id: 'A', ServerId: 'server-A' }));
        expect(container.textContent).toBe('signed-out:no-api:no-client');
    });
});
