import type { ApiClient } from 'jellyfin-apiclient';
import { beforeEach, expect, it, vi } from 'vitest';
import FavoritesTab from 'apps/legacy/controllers/favorites';
import { loadSections } from './favoriteitems';

const mocks = vi.hoisted(() => ({
    getItems: vi.fn(), getArtists: vi.fn(), getPeople: vi.fn(), getCardsHtml: vi.fn<(...args: unknown[]) => string>(() => '<button>Card</button>'),
    hide: vi.fn(), route: vi.fn((_route: string, params: { itemTypes: string }) => '#/list?itemTypes=' + params.itemTypes)
}));
vi.mock('lib/jellyfin-apiclient', () => ({ ServerConnections: { currentApiClient: () => window.ApiClient } }));
vi.mock('components/cardbuilder/cardBuilder', () => ({ default: { getCardsHtml: mocks.getCardsHtml } }));
vi.mock('components/router/appRouter', () => ({ appRouter: { getRouteUrl: mocks.route } }));
vi.mock('components/itemscontainer/emby-itemscontainer', () => ({}));
vi.mock('elements/emby-scroller/emby-scroller', () => ({}));
vi.mock('lib/layoutManager', () => ({ default: { tv: true } }));
vi.mock('lib/globalize', () => ({ default: { translate: (key: string) => key } }));
vi.mock('lib/focusManager', () => ({ default: { autoFocus: vi.fn() } }));
vi.mock('utils/dom', () => ({ default: { getWindowSize: () => ({ innerWidth: 1920 }), parentWithClass: (element: Element) => element.parentElement?.parentElement } }));
vi.mock('./images/imageLoader', () => ({ default: { lazyChildren: vi.fn() } }));
vi.mock('./loading/loading', () => ({ default: { show: vi.fn(), hide: mocks.hide } }));
vi.mock('utils/url', () => ({ getParameterByName: () => null }));

type Row = HTMLElement & {
    fetchData: () => Promise<unknown>;
    getItemsHtml: (items: { Id: string }[]) => string;
};

beforeEach(() => {
    vi.clearAllMocks();
    mocks.getItems.mockResolvedValue({ Items: [{ Id: 'item' }] });
    mocks.getArtists.mockResolvedValue({ Items: [{ Id: 'artist' }] });
    window.ApiClient = {
        serverId: () => 'server', getCurrentUserId: () => 'user', getItems: mocks.getItems,
        getArtists: mocks.getArtists, getPeople: mocks.getPeople
    } as unknown as ApiClient;
    Object.assign(window, { CustomElements: { upgradeSubtree: vi.fn() } });
});

it('keeps preview parent scoping, artist fetching, limits and section identities', async () => {
    const page = document.createElement('main');
    page.innerHTML = '<div class="favoriteSections"></div>';
    loadSections(page, 'user', 'music-library', ['favoriteArtists', 'favoriteAlbums', 'favoriteSongs']);
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(page.querySelectorAll('.verticalSection')).toHaveLength(3);
    expect(mocks.getArtists).toHaveBeenCalledWith('user', expect.objectContaining({ ParentId: 'music-library', Limit: 20, SortBy: 'SortName' }));
    expect(mocks.getItems.mock.calls.map(call => call[1].IncludeItemTypes)).toEqual(['MusicAlbum', 'Audio']);
    expect(mocks.getCardsHtml.mock.calls.map(call => call[1])).toMatchSnapshot();
});

it('preserves the full page All routes and card options for the overlapping sections', () => {
    const view = document.createElement('main');
    view.innerHTML = '<div class="sections"></div>';
    const tab = new FavoritesTab(view, {});
    const rows = view.querySelectorAll<Row>('.itemsContainer');
    for (const index of [0, 1, 3, 10, 11, 12]) rows[index].getItemsHtml([{ Id: 'item' }]);
    expect(mocks.route.mock.calls.map(call => call[1].itemTypes)).toEqual(['Movie', 'Series', 'Episode', 'MusicArtist', 'MusicAlbum', 'Audio']);
    expect(mocks.getCardsHtml.mock.calls).toMatchSnapshot();
    tab.destroy();
});

it('keeps empty preview sections empty and single-section previews unlimited', async () => {
    mocks.getItems.mockResolvedValue({ Items: [] });
    const page = document.createElement('main');
    page.innerHTML = '<div class="favoriteSections"></div>';
    loadSections(page, 'user', undefined, ['favoriteMovies']);
    await vi.waitFor(() => expect(mocks.hide).toHaveBeenCalled());
    expect(mocks.getItems.mock.calls[0][1]).not.toHaveProperty('Limit');
    expect(mocks.getItems.mock.calls[0][1]).not.toHaveProperty('ParentId');
    expect(page.querySelector('.sectionfavoriteMovies')?.innerHTML).toBe('');
    expect(mocks.getCardsHtml).not.toHaveBeenCalled();
});
