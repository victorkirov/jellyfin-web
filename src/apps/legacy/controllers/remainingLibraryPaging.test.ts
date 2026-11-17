import { beforeEach, describe, expect, it, vi } from 'vitest';
import Collections from './movies/moviecollections';
import Albums from './music/musicalbums';
import Artists from './music/musicartists';
import Songs from './music/songs';
import Episodes from './shows/episodes';
import Channels from './livetv/livetvchannels';
import loading from 'components/loading/loading';
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
    class Picker { updateControls() { return undefined; } }
    return { default: Picker, AlphaPicker: Picker };
});
vi.mock('components/images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('components/listview/listview', () => ({ default: { getListViewHtml: ({ items }: { items: { Name: string }[] }) => items[0]?.Name || '' } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: ({ items }: { items: { Name: string }[] }) => items[0]?.Name || '' } }));
vi.mock('components/loading/loading', () => ({ default: { show: vi.fn(), hide: vi.fn() } }));
vi.mock('components/autoFocuser', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('components/dashboard', () => ({ default: { getCurrentUserId: () => 'user' } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('utils/events', () => ({ default: {} }));
vi.mock('components/playback/playbackmanager', () => ({ playbackManager: {} }));
vi.mock('components/filterdialog/filterIndicator', () => ({ setFilterStatus: vi.fn(), getFilterStatus: () => false }));
vi.mock('components/guide/liveTvStatus', () => ({ clearLiveTvStatus: vi.fn(), showLiveTvStatus: vi.fn() }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));

const result = (name: string) => ({ Items: [{ Name: name }], TotalRecordCount: 6 });
const flush = async () => {
    for (let index = 0; index < 15; index++) await Promise.resolve();
    await vi.dynamicImportSettled();
};
function deferred() {
    let resolve!: (value: ReturnType<typeof result>) => void;
    const promise = new Promise<ReturnType<typeof result>>(done => { resolve = done; });
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
        controller.renderTab();
        await flush();
        expect(view.querySelector('.itemsContainer')?.textContent).toBe('first');
        expect(request.mock.calls[0][0]).toMatchObject({ StartIndex: 0, Limit: 2 });
    });
});
