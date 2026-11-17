import React, { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Link, MemoryRouter, Outlet, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

const connection = vi.hoisted(() => ({
    firstConnection: false,
    connect: vi.fn(),
    currentApiClient: vi.fn(),
    setLocalApiClient: vi.fn()
}));
vi.mock('lib/jellyfin-apiclient', () => ({
    ServerConnections: connection,
    ConnectionState: {
        SignedIn: 'SignedIn', ServerSignIn: 'ServerSignIn', ServerSelection: 'ServerSelection',
        ServerMismatch: 'ServerMismatch', ServerUpdateNeeded: 'ServerUpdateNeeded', Unavailable: 'Unavailable', Superseded: 'Superseded'
    }
}));
vi.mock('./ConnectionErrorPage', () => ({ default: ({ state }: { state: string }) => <div><span data-state>{state}</span><Link to='/selectserver'>Change server</Link></div> }));
vi.mock('./loading/LoadingComponent', () => ({ default: () => <div>Loading</div> }));

import ConnectionRequired from './ConnectionRequired';

const client = { serverAddress: () => 'https://server', serverId: () => 'server', isLoggedIn: () => false };

afterEach(() => vi.unstubAllGlobals());

describe('Server setup recovery', () => {
    it.each([
        [false, 'SetupRequired'],
        [true, 'Login'],
        ['failed', 'Unavailable']
    ])('handles setup status %s', async (completed, expected) => {
        connection.firstConnection = false;
        connection.currentApiClient.mockReturnValue(client);
        connection.connect.mockResolvedValue({ State: 'ServerSignIn', ApiClient: client });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: completed !== 'failed',
            json: () => Promise.resolve({ StartupWizardCompleted: completed })
        }));
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            await act(async () => {
                root.render(
                    <MemoryRouter initialEntries={['/home']}>
                        <Routes>
                            <Route element={<ConnectionRequired level='public' />}>
                                <Route path='/home' element={<div>Home</div>} />
                                <Route path='/selectserver' element={<div>Select server</div>} />
                            </Route>
                            <Route path='/login' element={<div>Login</div>} />
                        </Routes>
                    </MemoryRouter>
                );
            });
            expect(container.querySelector('[data-state]')?.textContent || container.textContent).toBe(expected);
            if (completed === false) {
                await act(async () => container.querySelector('a')?.click());
                expect(container.textContent).toBe('Select server');
            }
        } finally {
            act(() => root.unmount());
        }
    });
});

describe('Authenticated navigation', () => {
    it('keeps the shared child mounted and mounts each destination once', async () => {
        connection.firstConnection = true;
        connection.connect.mockClear();
        connection.currentApiClient.mockReturnValue({ ...client, isLoggedIn: () => true });
        vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
        const mounts = vi.fn();
        const unmounts = vi.fn();

        function NavigationLayout() {
            useEffect(() => {
                mounts('layout');
                return () => unmounts('layout');
            }, []);
            return <Outlet />;
        }

        function NavigationPage({ name }: Readonly<{ name: string }>) {
            useEffect(() => {
                mounts(name);
                return () => unmounts(name);
            }, [name]);
            return <Link to='/second'>{name}</Link>;
        }

        const container = document.createElement('div');
        const root = createRoot(container);
        try {
            await act(async () => root.render(
                <MemoryRouter initialEntries={['/first']}>
                    <Routes>
                        <Route element={<ConnectionRequired />}>
                            <Route element={<NavigationLayout />}>
                                <Route path='/first' element={<NavigationPage key='first' name='first' />} />
                                <Route path='/second' element={<NavigationPage key='second' name='second' />} />
                            </Route>
                        </Route>
                    </Routes>
                </MemoryRouter>
            ));
            expect(mounts.mock.calls).toHaveLength(2);
            expect(mounts.mock.calls).toEqual(expect.arrayContaining([['first'], ['layout']]));
            await act(async () => container.querySelector('a')?.click());
            expect(container.textContent).toBe('second');
            expect(mounts.mock.calls.filter(([name]) => name === 'layout')).toHaveLength(1);
            expect(mounts.mock.calls.filter(([name]) => name === 'second')).toHaveLength(1);
            expect(unmounts.mock.calls).toEqual([['first']]);
            expect(connection.connect).not.toHaveBeenCalled();
        } finally {
            act(() => root.unmount());
        }
    });
});

it.each(['Superseded', 'Unavailable'])('ignores an obsolete startup %s result after a path change', async staleState => {
    connection.firstConnection = false;
    connection.connect.mockReset();
    connection.currentApiClient.mockReturnValue({ ...client, isLoggedIn: () => true });
    let completeFirst!: (value: { State: string }) => void;
    let completeSecond!: (value: { State: string }) => void;
    connection.connect.mockReturnValueOnce(new Promise(resolve => {
        completeFirst = resolve;
    }))
        .mockReturnValueOnce(new Promise(resolve => {
            completeSecond = resolve;
        }));
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    let changePath!: ReturnType<typeof useNavigate>;
    function RouterControl() {
        changePath = useNavigate();
        return <ConnectionRequired />;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
        await act(async () => root.render(
            <MemoryRouter initialEntries={['/first']}>
                <Routes>
                    <Route element={<RouterControl />}>
                        <Route path='/first' element={<div>First</div>} />
                        <Route path='/second' element={<div>Second</div>} />
                    </Route>
                </Routes>
            </MemoryRouter>
        ));
        await act(async () => changePath('/second'));
        expect(connection.connect).toHaveBeenCalledTimes(2);
        await act(async () => completeFirst({ State: staleState }));
        expect(container.textContent).toBe('Loading');
        expect(container.querySelector('[data-state]')).toBeNull();
        expect(connection.firstConnection).toBe(false);
        await act(async () => completeSecond({ State: 'SignedIn' }));
        expect(container.textContent).toBe('Second');
        expect(container.querySelector('[data-state]')).toBeNull();
    } finally {
        act(() => root.unmount());
    }
});
