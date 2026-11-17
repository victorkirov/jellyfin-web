import { beforeEach, describe, expect, it, vi } from 'vitest';
import Collections from './movies/moviecollections';
import Albums from './music/musicalbums';
import Artists from './music/musicartists';
import Songs from './music/songs';
import Episodes from './shows/episodes';
import Channels from './livetv/livetvchannels';
import loading from 'components/loading/loading';
import createTabControllerCache from './tabControllerCache';
import autoFocuser from 'components/autoFocuser';

const { getItems, settings, request } = vi.hoisted(() => ({
    getItems: vi.fn(), settings: vi.fn(() => 2), request: vi.fn()
}));
vi.mock('scripts/libraryBrowser', () => ({ default: {
    getQueryPagingHtml: ({ startIndex, limit }: { startIndex: number; limit: number }) => '<span class="label">' + startIndex + '-' + limit + '</span><button class="btnPreviousPage"></button><button class="btnNextPage"></button>',
    showLayoutMenu: vi.fn(), showSortMenu: vi.fn()
} }));
vi.mock('scripts/settings/userSettings', () => ({
    getSavedView: () => 'Poster', libraryPageSize: settings,
    loadQuerySettings: vi.fn(), saveQuerySettings: vi.fn(), saveViewSetting: vi.fn()
}));
vi.mock('components/alphaPicker/alphaPicker', () => {
    class Picker {
        updateControls() {
            return undefined;
        }
    }
    return { default: Picker, AlphaPicker: Picker };
});
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml: ({ items }: { items: { Name: string }[] }) => items[0]?.Name || '' } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: ({ items }: { items: { Name: string }[] }) => items[0]?.Name || '' } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('components/dashboard', () => ({ default: { getCurrentUserId: () => 'user' } }));
vi.mock('lib/scrollManager', () => ({ default: { isEnabled: () => false } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('utils/events', () => ({ default: {} }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/filterdialog/filterIndicator', () => ({ setFilterStatus: vi.fn(), getFilterStatus: () => false }));
vi.mock('components/guide/liveTvStatus', () => ({ clearLiveTvStatus: vi.fn(), showLiveTvStatus: vi.fn(() => document.createElement('div')) }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));

const result = (name: string) => ({ Items: [{ Name: name }], TotalRecordCount: 6 });
const flush = async () => {
    for (let index = 0; index < 15; index++) await Promise.resolve();
    await vi.dynamicImportSettled();
};
function deferred() {
    let resolve!: (value: ReturnType<typeof result>) => void;
    const promise = new Promise<ReturnType<typeof result>>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
beforeEach(() => {
    vi.clearAllMocks();
    settings.mockReturnValue(2);
    getItems.mockImplementation((_user, query) => request({ ...query }));
    request.mockResolvedValue(result('first'));
    vi.stubGlobal('ApiClient', { getItems, getArtists: getItems, getAlbumArtists: getItems, getLiveTvChannels: (query: unknown) => getItems('user', query), getCurrentUserId: () => 'user' });
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = '';
});

describe.each([
    ['collections', Collections], ['albums', Albums], ['artists', Artists],
    ['songs', Songs], ['episodes', Episodes], ['channels', Channels]
] as const)('%s shared paging', (_name, Controller) => {
    function setup() {
        const view = document.createElement('div');
        view.innerHTML = '<div class="paging"></div><div id="items" class="itemsContainer"></div><div class="alphaPicker"></div><button class="btnSort"></button><button class="btnSelectView"></button><button class="btnFilter"></button><button class="btnPlayAll"></button><button class="btnShuffle"></button>';
        document.body.appendChild(view);
        const controller = new Controller(view, { topParentId: 'library' }, view, { mode: 'artists' });
        return { controller, view };
    }
    it('renders its local content and persists the library parent query', async () => {
        const { controller, view } = setup();
        await controller.renderTab();
        await flush();
        expect(view.querySelector('.itemsContainer')?.textContent).toBe('first');
        expect(request.mock.calls[0][0]).toMatchObject({ StartIndex: 0, Limit: 2 });
    });
    it('returns completion to its tab owner', async () => {
        const { controller } = setup();
        const completion = controller.renderTab();
        await flush();
        expect(completion).toBeInstanceOf(Promise);
    });
    it('releases loading and permits retry after a rejection', async () => {
        const { controller, view } = setup();
        request.mockRejectedValueOnce(new Error('offline'));
        await expect(controller.renderTab()).rejects.toThrow('offline');
        expect(loading.hide).toHaveBeenCalled();
        await controller.renderTab();
        expect(view.querySelector('.itemsContainer')?.textContent).toBe('first');
    });
    it('finalizes loading when a request throws before returning a promise', async () => {
        const { controller } = setup();
        request.mockImplementationOnce(() => {
            throw new Error('invalid client');
        });
        await expect(controller.renderTab()).rejects.toThrow('invalid client');
        expect(loading.hide).toHaveBeenCalled();
        await expect(controller.renderTab()).resolves.toBeUndefined();
    });
    it('renders B when A completes after B and snapshots query inputs', async () => {
        const { controller, view } = setup();
        const first = deferred();
        const second = deferred();
        request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        const firstCompletion = controller.renderTab();
        const secondCompletion = controller.renderTab();
        second.resolve(result('B'));
        await secondCompletion;
        first.resolve(result('A'));
        await firstCompletion;
        expect(view.querySelector('.itemsContainer')?.textContent).toBe('B');
        expect(request.mock.calls[0][0]).not.toBe(request.mock.calls[1][0]);
    });
    it.each(['viewbeforehide', 'viewdestroy'])('ignores completion after %s', async event => {
        const { controller, view } = setup();
        const pending = deferred();
        request.mockReturnValueOnce(pending.promise);
        const completion = controller.renderTab();
        view.dispatchEvent(new Event(event));
        pending.resolve(result('late'));
        await completion;
        expect(view.querySelector('.itemsContainer')?.textContent).toBe('');
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
        if (event === 'viewbeforehide') {
            view.dispatchEvent(new Event('viewshow'));
            await controller.renderTab();
            await flush();
            expect(view.querySelector('.itemsContainer')?.textContent).toBe('first');
        }
    });
    it('bounds rapid paging and retries the failed offset without losing focus', async () => {
        const { controller, view } = setup();
        await controller.renderTab();
        view.querySelector<HTMLButtonElement>('.btnPreviousPage')!.click();
        expect(request).toHaveBeenCalledTimes(1);
        request.mockRejectedValueOnce(new Error('offline'));
        const next = view.querySelector<HTMLButtonElement>('.btnNextPage')!;
        next.focus();
        next.click();
        next.click();
        await flush();
        expect(document.activeElement).toBe(next);
        expect(request).toHaveBeenCalledTimes(2);
        next.click();
        await flush();
        expect(request.mock.calls.slice(-2).map(call => call[0].StartIndex)).toEqual([2, 2]);
        view.querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        await flush();
        view.querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        expect(request).toHaveBeenCalledTimes(4);
    });
    it('renders empty results without leaving loading active', async () => {
        const { controller } = setup();
        request.mockResolvedValueOnce({ Items: [], TotalRecordCount: 0 });
        await expect(controller.renderTab()).resolves.toBeUndefined();
        expect(loading.hide).toHaveBeenCalled();
    });
    it('keeps the displayed offset when Back restores the cached view', async () => {
        const { controller, view } = setup();
        await controller.renderTab();
        view.querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        await flush();
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        await controller.renderTab();
        await flush();
        expect(request.mock.calls.map(call => call[0].StartIndex)).toEqual([0, 2, 2]);
    });
    it('uses the configured page size with first and last page bounds', async () => {
        settings.mockReturnValue(4);
        const { controller, view } = setup();
        await controller.renderTab();
        view.querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        await flush();
        view.querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        expect(request.mock.calls.map(call => call[0])).toMatchObject([
            { StartIndex: 0, Limit: 4 }, { StartIndex: 4, Limit: 4 }
        ]);
    });
    it('invalidates pending completion when its tab cache destroys the controller', async () => {
        const { controller, view } = setup();
        const pending = deferred();
        request.mockReturnValueOnce(pending.promise);
        const completion = controller.renderTab();
        controller.destroy();
        pending.resolve(result('late'));
        await completion;
        expect(view.querySelector('.itemsContainer')?.textContent).toBe('');
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
    });
    if (['collections', 'albums', 'artists'].indexOf(_name) !== -1) {
        it('resets offsets and keeps alpha filters when paging', async () => {
            const { controller, view } = setup();
            await controller.renderTab();
            view.querySelector('.alphaPicker')!.dispatchEvent(new CustomEvent('alphavaluechanged', { detail: { value: 'B' } }));
            await flush();
            view.querySelector<HTMLButtonElement>('.btnNextPage')!.click();
            await flush();
            expect(request.mock.calls.slice(-2).map(call => call[0])).toMatchObject([
                { StartIndex: 0, NameStartsWith: 'B' }, { StartIndex: 2, NameStartsWith: 'B' }
            ]);
        });
    }
});

describe('selected library cache lifecycle', () => {
    function setupTabs(loadGate?: Promise<unknown>) {
        const view = document.createElement('div');
        const markup = '<div class="paging"></div><div class="itemsContainer"></div><div class="alphaPicker"></div><button class="btnSort"></button><button class="btnSelectView"></button><button class="btnFilter"></button><button class="btnPlayAll"></button><button class="btnShuffle"></button>';
        view.innerHTML = '<section>' + markup + '</section><section>' + markup + '</section>';
        document.body.appendChild(view);
        const tabs = createTabControllerCache((index: number) => {
            const tab = view.children[index] as HTMLElement;
            const construct = () => index === 0 ? new Collections(view, { topParentId: 'library' }, tab) : new Albums(view, { topParentId: 'library' }, tab);
            return loadGate ? loadGate.then(construct) : Promise.resolve(construct());
        });
        // The recommendation parents pause requests while retaining completed renders.
        view.addEventListener('viewbeforehide', () => {
            tabs.pause();
        });
        return { view, tabs };
    }
    it('retains completed selected and inactive cached controllers on Back', async () => {
        const { view, tabs } = setupTabs();
        await tabs.render(0);
        await tabs.render(1);
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        await tabs.render(1);
        await flush();
        expect(request.mock.calls.map(call => call[0].IncludeItemTypes)).toEqual(['BoxSet', 'MusicAlbum']);
    });
    it('keeps a replacement render pending when the hidden render fulfills first', async () => {
        const { view, tabs } = setupTabs();
        const old = deferred();
        const current = deferred();
        request.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
        const oldRender = tabs.render(0);
        await flush();
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        const newRender = tabs.render(0);
        await flush();
        expect(request).toHaveBeenCalledTimes(2);
        old.resolve(result('hidden'));
        await oldRender;
        expect(view.children[0].querySelector('.itemsContainer')?.textContent).toBe('');
        const pendingRender = tabs.render(0);
        expect(pendingRender).toBe(newRender);
        expect(request).toHaveBeenCalledTimes(2);
        current.resolve(result('current'));
        await newRender;
        expect(view.children[0].querySelector('.itemsContainer')?.textContent).toBe('current');
        await tabs.render(0);
        expect(request).toHaveBeenCalledTimes(2);
    });
    it('starts one render when a controller import settles after hide and same-index Back', async () => {
        const pendingImport = deferred();
        const { view, tabs } = setupTabs(pendingImport.promise);
        const oldRender = tabs.render(0);
        await flush();
        expect(request).not.toHaveBeenCalled();
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        const newRender = tabs.render(0);
        pendingImport.resolve(result('imported'));
        await Promise.all([oldRender, newRender]);
        expect(request).toHaveBeenCalledTimes(1);
        expect(view.children[0].querySelector('.itemsContainer')?.textContent).toBe('first');
        await tabs.render(0);
        expect(request).toHaveBeenCalledTimes(1);
    });
    it('retries an interrupted filter refresh after its initial render was cached', async () => {
        const { view, tabs } = setupTabs();
        await tabs.render(0);
        const filterRequest = deferred();
        request.mockReturnValueOnce(filterRequest.promise).mockResolvedValue(result('filtered'));
        view.children[0].querySelector('.alphaPicker')!.dispatchEvent(new CustomEvent('alphavaluechanged', { detail: { value: 'B' } }));
        await flush();
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        await tabs.render(0);
        filterRequest.resolve(result('obsolete filter'));
        await flush();
        expect(request.mock.calls.map(call => call[0].NameStartsWith)).toEqual([undefined, 'B', 'B']);
        expect(view.children[0].querySelector('.itemsContainer')?.textContent).toBe('filtered');
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        await tabs.render(0);
        expect(request).toHaveBeenCalledTimes(3);
    });
    it('retains page three card thirty, focus and scroll without refetching or replacing DOM', async () => {
        settings.mockReturnValue(40);
        const markup = Array.from({ length: 40 }, (_, index) => '<button class="card">Card ' + (index + 1) + '</button>').join('');
        request.mockResolvedValue({ Items: [{ Name: markup }], TotalRecordCount: 120 });
        const { view, tabs } = setupTabs();
        await tabs.render(0);
        view.children[0].querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        await flush();
        view.children[0].querySelector<HTMLButtonElement>('.btnNextPage')!.click();
        await flush();
        const container = view.children[0].querySelector<HTMLElement>('.itemsContainer')!;
        const selectedCard = container.querySelectorAll<HTMLButtonElement>('.card')[29];
        selectedCard.focus();
        container.scrollTop = 500;
        const firstCard = container.firstChild;
        vi.mocked(window.scrollTo).mockClear();
        view.dispatchEvent(new Event('viewbeforehide'));
        view.dispatchEvent(new Event('viewshow'));
        await tabs.render(0);
        expect(request.mock.calls.map(call => call[0].StartIndex)).toEqual([0, 40, 80]);
        expect(container.firstChild).toBe(firstCard);
        expect(document.activeElement).toBe(selectedCard);
        expect(container.scrollTop).toBe(500);
        expect(window.scrollTo).not.toHaveBeenCalled();
    });
});
