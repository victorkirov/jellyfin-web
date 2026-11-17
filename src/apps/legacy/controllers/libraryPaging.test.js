import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindLibraryPaging, getLibraryLayout, libraryLayouts } from './libraryPaging';
import Movies from './movies/movies';
import Shows from './shows/tvshows';
import ItemsView from './list';
import { ServerConnections } from 'lib/jellyfin-apiclient';
import loading from 'components/loading/loading';
import cardBuilder from 'components/cardbuilder/cardBuilder';
import listView from 'components/listview/listview';
import autoFocuser from 'components/autoFocuser';
import * as userSettings from 'scripts/settings/userSettings';

vi.mock('scripts/libraryBrowser', () => ({ default: {
    getQueryPagingHtml: ({ startIndex, limit }) => '<span class="pagingLabel">' + (startIndex + 1) + '-' + (startIndex + limit) + '</span><button class="btnPreviousPage">Previous</button><button class="btnNextPage">Next</button>',
    showLayoutMenu: vi.fn()
} }));
vi.mock('scripts/settings/userSettings', () => ({
    get: vi.fn(), getSavedView: key => userSettings.get(key + '-_view'), set: vi.fn(), libraryPageSize: () => 2,
    loadQuerySettings: (key, query) => query, saveQuerySettings: vi.fn(), saveViewSetting: vi.fn()
}));
vi.mock('lib/focusManager', () => ({ default: {} }));
vi.mock('scripts/alphanumericshortcuts', () => ({ default: class {} }));
vi.mock('scripts/libraryMenu', () => ({ default: {} }));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { getApiClient: vi.fn() } }));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml: vi.fn(() => 'list') } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: vi.fn(({ items }) => items[0]?.Name || '') } }));
vi.mock('components/alphaPicker/alphaPicker', () => {
    class Picker {
        updateControls() {
            return undefined;
        }
    }
    return { default: Picker, AlphaPicker: Picker };
});
vi.mock('lib/globalize', () => ({ default: { translate: key => key } }));
vi.mock('utils/events', () => ({ default: {} }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/filterdialog/filterIndicator', () => ({ setFilterStatus: vi.fn(), getFilterStatus: vi.fn() }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.clearAllMocks();
    userSettings.get.mockReturnValue(undefined);
    vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    document.body.innerHTML = '';
});

function setup(Controller) {
    const view = document.createElement('div');
    view.innerHTML = '<div class="paging"></div><div class="itemsContainer"></div><div class="alphaPicker"></div>'
        + '<button class="btnFilter"></button><button class="btnSort"></button><button class="btnSelectView"></button>'
        + '<button class="btnPlayAll"></button><button class="btnShuffle"></button>';
    document.body.appendChild(view);
    const container = view.querySelector('.itemsContainer');
    container.refreshItems = vi.fn(async () => {
        const result = await container.fetchData();
        container.innerHTML = container.getItemsHtml(result.Items);
        container.afterRefresh(result);
    });
    container.pause = vi.fn();
    container.resume = vi.fn(() => Promise.resolve());
    const getItems = vi.fn();
    vi.stubGlobal('ApiClient', { getItems, getCurrentUserId: () => 'user' });
    const controller = new Controller(view, { topParentId: 'library' }, view, { mode: 'movies' });
    controller.initTab?.();
    return { view, container, controller, getItems };
}

const result = name => ({ Items: [{ Name: name }], TotalRecordCount: 6 });
const flush = async () => {
    for (let index = 0; index < 10; index++) {
        await Promise.resolve();
    }
    await vi.dynamicImportSettled();
};

describe('shared library paging', () => {
    it.each(['movies', 'shows', 'list'])('bounds %s paging and permits retry after rejection', async () => {
        const view = document.createElement('div');
        view.innerHTML = '<div class="paging"></div>';
        const query = { StartIndex: 0, Limit: 2, NameStartsWith: 'B' };
        const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
        const focus = vi.fn();
        const bind = () => bindLibraryPaging({ view, query, totalRecordCount: 5, isLoading: () => false, getRequestId: () => 0, refresh, focus });
        bind();
        view.querySelector('.btnPreviousPage').click();
        expect(refresh).not.toHaveBeenCalled();
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(focus).not.toHaveBeenCalled();
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(query.StartIndex).toBe(2);
        bind();
        view.querySelector('.btnPreviousPage').click();
        await flush();
        expect(query).toEqual({ StartIndex: 0, Limit: 2, NameStartsWith: 'B' });
        expect(focus).toHaveBeenCalledTimes(2);
        query.StartIndex = 4;
        bind();
        view.querySelector('.btnNextPage').click();
        expect(refresh).toHaveBeenCalledTimes(3);
    });
    it.each([
        ['Next', 0, 2, '.btnNextPage'],
        ['Previous', 4, 2, '.btnPreviousPage']
    ])('retries failed %s from the displayed page without moving focus', async (_direction, initial, expected, selector) => {
        const view = document.createElement('div');
        view.innerHTML = '<div class="paging"></div>';
        document.body.appendChild(view);
        const query = { StartIndex: initial, Limit: 2 };
        const requestedOffsets = [];
        const refresh = vi.fn(() => {
            requestedOffsets.push(query.StartIndex);
            return requestedOffsets.length === 1 ? Promise.reject(new Error('offline')) : Promise.resolve();
        });
        const focus = vi.fn();
        bindLibraryPaging({ view, query, totalRecordCount: 6, isLoading: () => false, getRequestId: () => 0, refresh, focus });
        const button = view.querySelector(selector);
        button.focus();
        button.click();
        await flush();
        expect(query.StartIndex).toBe(initial);
        expect(document.activeElement).toBe(button);
        expect(focus).not.toHaveBeenCalled();
        button.click();
        await flush();
        expect(requestedOffsets).toEqual([expected, expected]);
    });

    it('does not roll back a failed request after newer paging controls replace it', async () => {
        const view = document.createElement('div');
        view.innerHTML = '<div class="paging"></div>';
        const query = { StartIndex: 0, Limit: 2 };
        const request = deferred();
        const options = { view, query, totalRecordCount: 6, isLoading: () => false, getRequestId: () => 0, refresh: () => request.promise };
        bindLibraryPaging(options);
        view.querySelector('.btnNextPage').click();
        bindLibraryPaging(options);
        request.reject(new Error('old request failed'));
        await flush();
        expect(query.StartIndex).toBe(2);
    });

    it('keeps the offset when a newer request starts before the paging request fails', async () => {
        const view = document.createElement('div');
        view.innerHTML = '<div class="paging"></div>';
        const query = { StartIndex: 0, Limit: 2 };
        const first = deferred();
        const second = deferred();
        let requestId = 0;
        let requestLoading = false;
        const refresh = () => {
            const request = ++requestId;
            requestLoading = true;
            return (request === 1 ? first.promise : second.promise).finally(() => {
                if (request === requestId) requestLoading = false;
            });
        };
        const options = { view, query, totalRecordCount: 6, isLoading: () => requestLoading, getRequestId: () => requestId, refresh };
        bindLibraryPaging(options);
        view.querySelector('.btnNextPage').click();
        const background = refresh();
        first.reject(new Error('old request failed'));
        await flush();
        expect(query.StartIndex).toBe(2);
        second.resolve();
        await background;
        bindLibraryPaging(options);
        expect(view.querySelector('.pagingLabel').textContent).toBe('3-4');
    });

    it.each(libraryLayouts)('restores %s from both saved key formats', layout => {
        for (const suffix of ['-view', '-_view']) {
            userSettings.get.mockImplementation(key => key === 'library' + suffix ? layout : undefined);
            expect(getLibraryLayout('library')).toBe(layout);
            expect(getLibraryLayout('library', true)).toBe(layout);
        }
    });
});

describe.each([['movies', Movies], ['shows', Shows]])('%s controller', (name, Controller) => {
    it('releases loading after rejection and allows the next refresh', async () => {
        const { controller, getItems, view, container } = setup(Controller);
        getItems.mockRejectedValueOnce(new Error('offline')).mockResolvedValue(result('retry'));
        await expect(controller.renderTab()).rejects.toThrow('offline');
        expect(loading.hide).toHaveBeenCalled();
        controller.renderTab();
        await flush();
        expect(getItems).toHaveBeenCalledTimes(2);
        expect(container.innerHTML).toBe('retry');
        expect(view.querySelector('.btnNextPage')).not.toBeNull();
    });
    it('renders the newer page with its correct paging label after an older paging failure', async () => {
        const { controller, getItems, view, container } = setup(Controller);
        getItems.mockResolvedValueOnce(result('page 1'));
        await controller.renderTab();
        const first = deferred();
        const second = deferred();
        getItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(result('page 3'));
        view.querySelector('.btnNextPage').click();
        const background = controller.renderTab();
        first.reject(new Error('old request failed'));
        await flush();
        second.resolve(result('page 2'));
        await background;
        expect(container.textContent).toBe('page 2');
        expect(view.querySelector('.pagingLabel').textContent).toBe('3-4');
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(getItems.mock.calls.map(call => call[1].StartIndex)).toEqual([0, 2, 2, 4]);
    });

    it('keeps alpha filters and resets the paging position', async () => {
        const { controller, getItems, view } = setup(Controller);
        getItems.mockResolvedValue(result('items'));
        controller.renderTab();
        await flush();
        view.querySelector('.alphaPicker').dispatchEvent(new CustomEvent('alphavaluechanged', { detail: { value: '#' } }));
        await flush();
        expect(getItems.mock.calls[1][1]).toMatchObject({ StartIndex: 0, NameLessThan: 'A' });
        view.querySelector('.alphaPicker').dispatchEvent(new CustomEvent('alphavaluechanged', { detail: { value: 'B' } }));
        await flush();
        expect(getItems.mock.calls[2][1]).toMatchObject({ StartIndex: 0, NameStartsWith: 'B' });
        expect(getItems.mock.calls[2][1].NameLessThan).toBeUndefined();
    });
    it.each(['-view', '-_view'])('reads the compatible %s layout key', async suffix => {
        userSettings.get.mockImplementation(key => key.endsWith(suffix) ? 'ThumbCard' : undefined);
        const { controller, getItems } = setup(Controller);
        getItems.mockResolvedValue(result('items'));
        await controller.renderTab();
        expect(controller.getCurrentViewStyle()).toBe('ThumbCard');
    });
    it.each(libraryLayouts)('selects the saved %s renderer', async layout => {
        userSettings.get.mockReturnValue(layout);
        const { controller, getItems } = setup(Controller);
        getItems.mockResolvedValue(result('items'));
        controller.renderTab();
        await flush();
        expect(controller.getCurrentViewStyle()).toBe(layout);
        if (layout === 'List') {
            expect(listView.getListViewHtml).toHaveBeenCalledWith({
                items: [{ Name: 'items' }], context: name === 'movies' ? 'movies' : 'tvshows',
                sortBy: name === 'movies' ? 'SortName,ProductionYear' : 'SortName'
            });
        } else {
            let shape = layout.startsWith('Thumb') ? 'backdrop' : 'portrait';
            if (layout === 'Banner') shape = 'banner';
            const expected = {
                items: [{ Name: 'items' }], context: name === 'movies' ? 'movies' : 'tvshows',
                shape
            };
            if (layout.startsWith('Thumb')) expected.preferThumb = true;
            if (layout === 'Banner') {
                expected.preferBanner = true;
            } else {
                expected.showTitle = true;
                expected.centerText = true;
                if (name === 'movies' || layout !== 'Thumb') expected.showYear = true;
            }
            if (layout.endsWith('Card')) expected.cardLayout = true;
            if (name === 'movies' && layout !== 'Poster' || name === 'shows' && layout === 'Poster') expected.lazy = true;
            if (layout === 'Poster' || layout === 'Thumb') {
                expected[name === 'movies' ? 'overlayPlayButton' : 'overlayMoreButton'] = true;
            }
            expect(cardBuilder.getCardsHtml).toHaveBeenCalledWith(expected);
        }
    });
});

describe('shows completion ownership', () => {
    it('renders only the latest request when A finishes after B', async () => {
        const { controller, getItems, container } = setup(Shows);
        const first = deferred();
        const second = deferred();
        getItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
        controller.renderTab();
        controller.renderTab();
        second.resolve(result('B'));
        await flush();
        first.resolve(result('A'));
        await flush();
        expect(container.innerHTML).toBe('B');
        expect(autoFocuser.autoFocus).toHaveBeenCalledOnce();
    });
    it('invalidates hidden requests and refreshes on resume', async () => {
        const { controller, getItems, container, view } = setup(Shows);
        const first = deferred();
        getItems.mockReturnValueOnce(first.promise).mockResolvedValue(result('resumed'));
        controller.renderTab();
        view.dispatchEvent(new Event('viewbeforehide'));
        first.resolve(result('hidden'));
        await flush();
        expect(container.innerHTML).toBe('');
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
        view.dispatchEvent(new Event('viewshow'));
        await flush();
        expect(container.innerHTML).toBe('resumed');
        expect(loading.hide).toHaveBeenCalled();
    });
});

describe('list paging interactions', () => {
    function setupList() {
        const view = document.createElement('div');
        view.innerHTML = '<div class="paging"></div><div class="itemsContainer"></div>';
        document.body.appendChild(view);
        const container = view.querySelector('.itemsContainer');
        const getItems = vi.fn().mockResolvedValue(result('items'));
        ServerConnections.getApiClient.mockReturnValue({ getItems, getCurrentUserId: () => 'user' });
        const controller = new ItemsView(view, { type: 'Movie', serverId: 'server' });
        controller.getSortValues = () => ({ sortBy: 'SortName', sortOrder: 'Ascending' });
        controller.getFilters = () => ({});
        container.refreshItems = vi.fn(async () => {
            const response = await container.fetchData();
            container.afterRefresh(response);
        });
        return { view, container, getItems, controller };
    }

    it('uses shared paging, alpha filtering and boundary checks', async () => {
        const { container, view, getItems, controller } = setupList();
        controller.alphaPicker = { value: () => 'B' };
        await container.refreshItems();
        view.querySelector('.btnPreviousPage').click();
        expect(getItems).toHaveBeenCalledOnce();
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(getItems.mock.calls[1][1]).toMatchObject({ StartIndex: 2, NameStartsWith: 'B' });
        expect(autoFocuser.autoFocus).toHaveBeenCalledWith(view);
    });

    it('recovers paging after a rejected request', async () => {
        const { container, view, getItems } = setupList();
        await container.refreshItems();
        getItems.mockRejectedValueOnce(new Error('offline'));
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(getItems).toHaveBeenCalledTimes(3);
        expect(getItems.mock.calls[1][1].StartIndex).toBe(2);
        expect(getItems.mock.calls[2][1].StartIndex).toBe(2);
        expect(autoFocuser.autoFocus).toHaveBeenCalledWith(view);
    });

    it('retries failed Previous with the same API offset and preserves the paging control', async () => {
        const { container, view, getItems } = setupList();
        await container.refreshItems();
        view.querySelector('.btnNextPage').click();
        await flush();
        view.querySelector('.btnNextPage').click();
        await flush();
        autoFocuser.autoFocus.mockClear();
        getItems.mockRejectedValueOnce(new Error('offline'));
        const previous = view.querySelector('.btnPreviousPage');
        previous.focus();
        previous.click();
        await flush();
        expect(document.activeElement).toBe(previous);
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
        previous.click();
        await flush();
        expect(getItems.mock.calls.slice(-2).map(call => call[1].StartIndex)).toEqual([2, 2]);
    });

    it('keeps the newer list refresh offset and label after an older paging rejection', async () => {
        const { container, view, getItems } = setupList();
        container.refreshItems = vi.fn(async () => {
            const response = await container.fetchData();
            container.textContent = response.Items[0].Name;
            container.afterRefresh(response);
        });
        await container.refreshItems();
        const first = deferred();
        const second = deferred();
        getItems.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(result('page 3'));
        view.querySelector('.btnNextPage').click();
        const background = container.refreshItems();
        first.reject(new Error('old request failed'));
        await flush();
        second.resolve(result('page 2'));
        await background;
        expect(container.textContent).toBe('page 2');
        expect(view.querySelector('.pagingLabel').textContent).toBe('3-4');
        view.querySelector('.btnNextPage').click();
        await flush();
        expect(getItems.mock.calls.map(call => call[1].StartIndex)).toEqual([0, 2, 2, 4]);
    });

    it('does not focus a hidden page when paging completes', async () => {
        const { container, view, getItems } = setupList();
        await container.refreshItems();
        const request = deferred();
        getItems.mockReturnValueOnce(request.promise);
        view.querySelector('.btnNextPage').click();
        container.paused = true;
        request.resolve(result('late'));
        await flush();
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
    });

    it('does not focus an obsolete paging request after a newer refresh', async () => {
        const { container, view, getItems } = setupList();
        await container.refreshItems();
        const request = deferred();
        getItems.mockReturnValueOnce(request.promise);
        view.querySelector('.btnNextPage').click();
        await container.refreshItems();
        request.resolve(result('late'));
        await flush();
        expect(autoFocuser.autoFocus).not.toHaveBeenCalled();
    });
});
