import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Events from '../../utils/events';
import { ServerConnections } from 'lib/jellyfin-apiclient';

vi.mock('../playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('../../utils/events.ts', () => ({ default: { on: vi.fn(), off: vi.fn() } }));
vi.mock('../../lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => null } }));
vi.mock('../../utils/jellyfin-apiclient/getItems.ts', () => ({ getItems: vi.fn() }));

const showNotification = vi.fn();
const handlers = new Map<string, (message?: object) => void>();
const headers = { Authorization: 'MediaBrowser Token="test-token"' };
const apiClient = {
    serverInfo: () => ({ Id: 'server-id', Name: 'Server' }),
    serverAddress: vi.fn(() => 'https://server.example/jellyfin'),
    setRequestHeaders: vi.fn((target: object) => Object.assign(target, headers)),
    getCurrentUser: () => Promise.resolve({ Policy: { IsAdministrator: true } }),
    subscribe: (types: string[], handler: (message?: object) => void) => {
        handlers.set(types[0], handler);
        return () => undefined;
    }
};

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    handlers.clear();
    vi.spyOn(document, 'addEventListener');
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } });
    await import('./notifications');
    const created = vi.mocked(Events.on).mock.calls.find(([, type]) => type === 'apiclientcreated')!;
    expect(created[0]).toBe(ServerConnections);
    created[2]({ type: 'apiclientcreated' }, apiClient);
});

afterEach(() => {
    vi.unstubAllGlobals();
    for (const [type, listener] of vi.mocked(document.addEventListener).mock.calls) {
        document.removeEventListener(type, listener);
    }
    window.onbeforeunload = null;
});

describe('Persistent notification data', () => {
    it('includes the installation Id and connection data for cancellation', async () => {
        handlers.get('PackageInstalling')!({ Data: { Id: 'install-id', Name: 'Plugin', Version: '1', PercentComplete: 20 } });
        await vi.waitFor(() => expect(showNotification).toHaveBeenCalledOnce());
        const options = showNotification.mock.calls[0][1];
        expect(options.data).toEqual({ id: 'install-id', serverId: 'server-id', serverAddress: 'https://server.example/jellyfin', headers });
        expect(options.actions[0].action).toBe('cancel-install');
        expect(options.body).toBe('20% complete.');
    });

    it('includes connection data for a restart action', () => {
        handlers.get('RestartRequired')!();
        const options = showNotification.mock.calls[0][1];
        expect(options.data).toEqual({ serverId: 'server-id', serverAddress: 'https://server.example/jellyfin', headers });
        expect(options.actions[0].action).toBe('restart');
    });

    it('omits credentials for notifications without server actions', () => {
        handlers.get('ServerShuttingDown')!();
        expect(showNotification.mock.calls[0][1].data).toEqual({ serverId: 'server-id' });
        expect(apiClient.setRequestHeaders).not.toHaveBeenCalled();
        expect(apiClient.serverAddress).not.toHaveBeenCalled();
    });
});
