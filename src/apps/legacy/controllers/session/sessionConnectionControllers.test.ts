import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    loading: { show: vi.fn(), hide: vi.fn() },
    dashboard: { navigate: vi.fn(), onServerChanged: vi.fn(), alert: vi.fn() },
    connectToServer: vi.fn(), connectToAddress: vi.fn(), getAvailableServers: vi.fn(),
    actionSheet: vi.fn(), alert: vi.fn(), autoFocus: vi.fn()
}));
vi.mock('components/loading/loading', () => ({ default: mocks.loading }));
vi.mock('components/dashboard', () => ({ default: mocks.dashboard }));
vi.mock('components/router/appRouter', () => ({ appRouter: { show: vi.fn(), back: vi.fn() } }));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('scripts/libraryMenu', () => ({ default: { setTitle: vi.fn(), setTransparentMenu: vi.fn() } }));
vi.mock('scripts/settings/appSettings', () => ({ default: { enableAutoLogin: () => true } }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: mocks.autoFocus } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('components/actionSheet/actionSheet', () => ({ default: { show: mocks.actionSheet } }));
vi.mock('components/confirm/confirm', () => ({ default: vi.fn() }));
vi.mock('utils/dom', () => ({ default: { parentWithClass: (element: Element, name: string) => {
    let parent: Element | null = element;
    while (parent && !parent.classList.contains(name)) parent = parent.parentElement;
    return parent;
} } }));
vi.mock('scripts/browser', () => ({ default: {} }));
vi.mock('components/alert', () => ({ default: mocks.alert }));
vi.mock('components/cardbuilder/utils/builder', () => ({ getDefaultBackgroundClass: () => 'background-test' }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('material-design-icons-iconfont', () => ({}));
vi.mock('styles/flexstyles.scss', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('components/cardbuilder/card.scss', () => ({}));
vi.mock('components/buttons/emby-button', () => ({}));
vi.mock('lib/jellyfin-apiclient', () => ({
    ConnectionState: { SignedIn: 'SignedIn', ServerSignIn: 'ServerSignIn', ServerSelection: 'ServerSelection', ServerUpdateNeeded: 'ServerUpdateNeeded', Unavailable: 'Unavailable', Superseded: 'Superseded' },
    ServerConnections: { connectToServer: mocks.connectToServer, connectToAddress: mocks.connectToAddress, getAvailableServers: mocks.getAvailableServers, deleteServer: vi.fn() }
}));

import selectServer from './selectServer/index';
import addServer from './addServer/index';

const server = { Id: 'server', Name: '<TV>', LastConnectionMode: 0 };
const client = { getCurrentUserId: () => 'user', accessToken: () => 'token' };
const success = { State: 'SignedIn', ApiClient: client, Servers: [server] };

async function flush() {
    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
}

async function selectPage() {
    const view = document.createElement('div');
    view.innerHTML = '<div class="servers"></div>';
    selectServer(view, {});
    view.dispatchEvent(new CustomEvent('viewshow', { detail: { isRestored: false } }));
    await flush();
    return view;
}

function addPage() {
    const view = document.createElement('div');
    view.innerHTML = '<form class="addServerForm"><input id="txtServerHost" value="https://server///"></form><button class="btnCancel"></button>';
    addServer(view);
    return view;
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAvailableServers.mockResolvedValue([server]);
    mocks.connectToServer.mockResolvedValue(success);
    mocks.connectToAddress.mockResolvedValue(success);
    mocks.actionSheet.mockResolvedValue('connect');
});

describe('session connection controllers', () => {
    it('preserves server card markup, escaped labels, focus and connection navigation', async () => {
        const view = await selectPage();
        const card = view.querySelector<HTMLButtonElement>('.card')!;
        expect(card.dataset.id).toBe('server');
        expect(card.dataset.url).toBe('');
        expect(card.dataset.cardtype).toBe('');
        expect(card.classList.contains('show-focus')).toBe(true);
        expect(card.classList.contains('show-animation')).toBe(true);
        expect(card.querySelector('.cardText')?.textContent).toBe('<TV>');
        expect(card.querySelector('tv')).toBeNull();
        expect(mocks.autoFocus).toHaveBeenCalledWith(view);
        vi.clearAllMocks();
        card.click();
        await flush();
        expect(mocks.connectToServer).toHaveBeenCalledWith(server, { enableAutoLogin: true });
        expect(mocks.dashboard.onServerChanged).toHaveBeenCalledWith('user', 'token', client);
        expect(mocks.dashboard.navigate).toHaveBeenCalledWith('home');
        expect(mocks.loading.hide).toHaveBeenCalledOnce();
    });

    it('trims the submitted server host and prevents the native form submit', async () => {
        const view = addPage();
        const event = new Event('submit', { bubbles: true, cancelable: true });
        view.querySelector('form')!.dispatchEvent(event);
        await flush();
        expect(event.defaultPrevented).toBe(true);
        expect(mocks.connectToAddress).toHaveBeenCalledWith('https://server', { enableAutoLogin: true });
        expect(mocks.dashboard.navigate).toHaveBeenCalledWith('home');
        expect(mocks.loading.hide).toHaveBeenCalledOnce();
    });

    it.each(['selection', 'form'])('preserves a genuine unavailable error for %s', async origin => {
        mocks.connectToServer.mockResolvedValue({ State: 'Unavailable' });
        mocks.connectToAddress.mockResolvedValue({ State: 'Unavailable' });
        const view = origin === 'selection' ? await selectPage() : addPage();
        vi.clearAllMocks();
        if (origin === 'selection') view.querySelector<HTMLButtonElement>('.card')!.click();
        else view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await flush();
        expect(origin === 'selection' ? mocks.alert : mocks.dashboard.alert).toHaveBeenCalledOnce();
        expect(mocks.loading.hide).toHaveBeenCalledOnce();
        expect(mocks.dashboard.navigate).not.toHaveBeenCalled();
    });
});

function deferredConnection() {
    let resolve!: (result: typeof success | { State: string }) => void;
    const promise = new Promise<typeof success | { State: string }>(done => {
        resolve = done;
    });
    return { promise, resolve };
}

it.each([
    ['selection', 'old-first'], ['selection', 'latest-first'],
    ['form', 'old-first'], ['form', 'latest-first']
])('ignores a superseded %s request when settling %s', async (origin, order) => {
    const first = deferredConnection();
    const latest = deferredConnection();
    const view = origin === 'selection' ? await selectPage() : addPage();
    vi.clearAllMocks();
    const connect = origin === 'selection' ? mocks.connectToServer : mocks.connectToAddress;
    connect.mockReturnValueOnce(first.promise).mockReturnValueOnce(latest.promise);
    const submit = () => {
        if (origin === 'selection') view.querySelector<HTMLButtonElement>('.card')!.click();
        else view.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    };
    submit();
    submit();
    await flush();
    expect(connect).toHaveBeenCalledTimes(2);
    expect(mocks.loading.show).toHaveBeenCalledTimes(2);
    if (order === 'latest-first') {
        latest.resolve(success);
        await flush();
    }
    const hidesBeforeStale = mocks.loading.hide.mock.calls.length;
    const navigationsBeforeStale = mocks.dashboard.navigate.mock.calls.length;
    first.resolve({ State: 'Superseded' });
    await flush();
    expect(mocks.loading.hide).toHaveBeenCalledTimes(hidesBeforeStale);
    expect(mocks.dashboard.navigate).toHaveBeenCalledTimes(navigationsBeforeStale);
    expect(mocks.alert).not.toHaveBeenCalled();
    expect(mocks.dashboard.alert).not.toHaveBeenCalled();
    if (order === 'old-first') {
        latest.resolve(success);
        await flush();
    }
    expect(mocks.loading.hide).toHaveBeenCalledOnce();
    expect(mocks.dashboard.navigate).toHaveBeenCalledExactlyOnceWith('home');
    expect(mocks.dashboard.onServerChanged).toHaveBeenCalledExactlyOnceWith('user', 'token', client);
});
