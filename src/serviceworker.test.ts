import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ClickEvent = {
    action: string;
    notification: { close: ReturnType<typeof vi.fn>; data?: object };
    waitUntil: ReturnType<typeof vi.fn>;
};

const listeners = new Map<string, (event: ClickEvent) => void>();
const fetchMock = vi.fn();
const focus = vi.fn();
const matchAll = vi.fn();
const openWindow = vi.fn();
const claim = vi.fn();

beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    listeners.clear();
    fetchMock.mockResolvedValue({ ok: true });
    matchAll.mockResolvedValue([]);
    focus.mockResolvedValue(undefined);
    openWindow.mockResolvedValue(undefined);
    claim.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('clients', { matchAll, openWindow, claim });
    vi.stubGlobal('self', {
        clients: { claim },
        addEventListener: (type: string, listener: (event: ClickEvent) => void) => listeners.set(type, listener)
    });
    await import('./serviceworker');
});

afterEach(() => vi.unstubAllGlobals());

function click(action: string, data?: object) {
    const event = { action, notification: { close: vi.fn(), data }, waitUntil: vi.fn() };
    listeners.get('notificationclick')!(event);
    expect(event.notification.close).toHaveBeenCalledOnce();
    expect(event.waitUntil).toHaveBeenCalledOnce();
    return event.waitUntil.mock.calls[0][0] as Promise<unknown>;
}

describe('Service worker notifications', () => {
    const headers = { Authorization: 'MediaBrowser Token="test-token"' };
    const data = { serverAddress: 'https://server.example/jellyfin/', headers, id: 'install/id' };

    it('cancels the installation with an authenticated DELETE', async () => {
        await click('cancel-install', data);
        expect(fetchMock).toHaveBeenCalledWith('https://server.example/jellyfin/Packages/Installing/install%2Fid', {
            method: 'DELETE', headers
        });
        expect(openWindow).not.toHaveBeenCalled();
    });

    it('restarts the server with an authenticated POST', async () => {
        await click('restart', { ...data, serverAddress: 'https://server.example/jellyfin' });
        expect(fetchMock).toHaveBeenCalledWith('https://server.example/jellyfin/System/Restart', {
            method: 'POST', headers
        });
    });

    it.each(['', 'unknown'])('focuses an existing window for action "%s" without credentials', async action => {
        matchAll.mockResolvedValue([{ focus }]);
        await click(action);
        expect(matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
        expect(focus).toHaveBeenCalledOnce();
        expect(openWindow).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('keeps opening a new window inside waitUntil', async () => {
        let finish: () => void = () => undefined;
        openWindow.mockReturnValue(new Promise<void>(resolve => {
            finish = resolve;
        }));
        const pending = click('');
        await vi.waitFor(() => expect(openWindow).toHaveBeenCalledWith('/'));
        const settled = vi.fn();
        void pending.then(settled);
        await Promise.resolve();
        expect(settled).not.toHaveBeenCalled();
        finish();
        await pending;
        expect(settled).toHaveBeenCalledOnce();
    });

    it('rejects an action without connection data', async () => {
        await expect(click('restart')).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('rejects cancellation without an installation id', async () => {
        await expect(click('cancel-install', { serverAddress: data.serverAddress, headers })).rejects.toThrow();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('propagates HTTP failures through waitUntil', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 403 });
        await expect(click('restart', data)).rejects.toThrow('403');
    });

    it('propagates network failures through waitUntil', async () => {
        fetchMock.mockRejectedValue(new Error('offline'));
        await expect(click('restart', data)).rejects.toThrow('offline');
    });

    it('keeps client claiming alive during activation', async () => {
        const event = { action: '', notification: { close: vi.fn() }, waitUntil: vi.fn() };
        listeners.get('activate')!(event);
        expect(event.waitUntil).toHaveBeenCalledWith(claim.mock.results[0].value);
        await event.waitUntil.mock.calls[0][0];
    });
});
